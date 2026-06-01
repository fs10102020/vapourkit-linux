import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn } from 'child_process';
import axios from 'axios';
import { PATHS, VS_MLRT_VERSION } from './constants';
import { logger } from './logger';
import { platformSpawnOptions, resolveCommandPath } from './platform';
import { runCommand } from './utils';
import { configManager } from './configManager';
import { validateSharedLibrary } from './nativeValidation';

export interface VsMlrtBuildProgress {
  progress: number;
  message: string;
}

export type VsMlrtBuildProgressCallback = (progress: VsMlrtBuildProgress) => void;

export interface BuildToolStatus {
  name: string;
  found: boolean;
  path?: string;
}

interface OnnxRuntimeLayout {
  source: 'prebuilt' | 'system';
  rootDir?: string;
  includeDir: string;
  libDir: string;
  copyLibraries: boolean;
}

/** Versions pinned to match the vs-mlrt GitHub Actions workflow. */
const PROTOBUF_VERSION = '3.21.12';
const ONNX_COMMIT = 'b86cc54efce19530fb953e4b21f57e6b3888534c';
const ONNX_RUNTIME_VERSION = '1.17.1';

/**
 * Builds vs-mlrt ONNX Runtime plugin (vsort) from source on Linux.
 *
 * The build caches protobuf and ONNX locally so repeated setups are fast.
 * Only the CPU backend is enabled; CUDA support would require the CUDA toolkit
 * and significantly complicates the build.
 */
export class VsMlrtLinuxBuilder {
  private readonly buildCache: string;
  private readonly pluginOutputDir: string;
  private progressCallback?: VsMlrtBuildProgressCallback;

  constructor() {
    this.buildCache = path.join(PATHS.APP_DATA, 'build-cache');
    this.pluginOutputDir = PATHS.PLUGINS;
  }

  private emitProgress(progress: number, message: string) {
    logger.dependency(`[vs-mlrt build] ${message}`);
    this.progressCallback?.({ progress, message });
  }

  /**
   * Checks whether the minimal build toolchain is available.
   */
  static async detectBuildTools(): Promise<BuildToolStatus[]> {
    const tools = ['cmake', 'ninja', 'git', 'gcc', 'g++', 'patchelf', 'ldd'];
    const results: BuildToolStatus[] = [];

    for (const tool of tools) {
      const found = await VsMlrtLinuxBuilder.which(tool);
      results.push({ name: tool, found: !!found, path: found || undefined });
    }

    return results;
  }

  /**
   * Returns true when all required build tools are present.
   */
  static isBuildEnvironmentReady(tools: BuildToolStatus[]): boolean {
    const required = ['cmake', 'ninja', 'git', 'gcc', 'g++', 'patchelf', 'ldd'];
    return required.every(r => tools.some(t => t.name === r && t.found));
  }

  /**
   * Returns a distro-specific install guide for missing build tools.
   */
  static getBuildToolGuide(missing: string[]): string {
    const names = missing.join(', ');
    return (
      `Missing build tools required to compile vs-mlrt: ${names}\n` +
      `Install them with your package manager:\n` +
      `  Arch: sudo pacman -S base-devel cmake ninja git patchelf glibc\n` +
      `  Debian/Ubuntu: sudo apt install build-essential cmake ninja-build git patchelf libc-bin\n` +
      `  Fedora: sudo dnf install gcc gcc-c++ cmake ninja-build git patchelf glibc-common\n` +
      `  openSUSE: sudo zypper install -t pattern devel_basis && sudo zypper install cmake ninja git patchelf glibc\n` +
      `  Other distros: install a C++20 compiler, CMake, Ninja, Git, patchelf, and ldd`
    );
  }

  /**
   * Attempts to build and install the vsort plugin into the app-data plugin directory.
   * Returns the path to the installed vsort.so on success.
   */
  async buildAndInstall(progressCallback?: VsMlrtBuildProgressCallback): Promise<string> {
    this.progressCallback = progressCallback;

    const tools = await VsMlrtLinuxBuilder.detectBuildTools();
    if (!VsMlrtLinuxBuilder.isBuildEnvironmentReady(tools)) {
      const missing = tools.filter(t => !t.found).map(t => t.name);
      throw new Error(VsMlrtLinuxBuilder.getBuildToolGuide(missing));
    }

    await fs.ensureDir(this.buildCache);
    await fs.ensureDir(this.pluginOutputDir);

    // 1. Build or reuse cached protobuf
    const protobufInstall = await this.buildProtobuf();

    // 2. Build or reuse cached ONNX
    const onnxInstall = await this.buildOnnx(protobufInstall);

    // 3. Resolve ONNX Runtime binaries. Prebuilt CPU is the default; advanced
    // users can point VapourKit at a system ROCm/CUDA-enabled ONNX Runtime.
    const ortLayout = await this.resolveOnnxRuntimeLayout();

    // 4. Find VapourSynth headers
    const vsIncludeDir = await this.findVapourSynthHeaders();

    // 5. Clone vs-mlrt source
    const vsMlrtSourceDir = await this.cloneVsMlrtSource();

    // 6. Build vsort
    const vsortBuildDir = path.join(vsMlrtSourceDir, 'vsort', 'build');
    const vsortInstallDir = path.join(vsMlrtSourceDir, 'vsort', 'install');

    this.emitProgress(60, 'Configuring vs-mlrt ONNX Runtime plugin...');
    await this.configureVsSort(
      vsMlrtSourceDir,
      vsortBuildDir,
      vsIncludeDir,
      ortLayout,
      protobufInstall,
      onnxInstall
    );

    this.emitProgress(75, 'Building vs-mlrt ONNX Runtime plugin...');
    await this.buildVsSort(vsortBuildDir);

    this.emitProgress(90, 'Installing vs-mlrt ONNX Runtime plugin...');
    await this.installVsSort(vsortBuildDir, vsortInstallDir);

    // Verify the output
    const outputSo = path.join(vsortInstallDir, 'lib', 'libvsort.so');
    const outputSoBare = path.join(vsortInstallDir, 'lib', 'vsort.so');
    const finalSo = path.join(this.pluginOutputDir, 'vsort.so');

    const builtSo = await fs.pathExists(outputSo) ? outputSo : outputSoBare;
    if (!(await fs.pathExists(builtSo))) {
      throw new Error(`vsort build completed but ${builtSo} was not found`);
    }

    await fs.copy(builtSo, finalSo, { overwrite: true });
    await this.copyOnnxRuntimeLibraries(ortLayout);
    await this.setPluginRpath(finalSo, ortLayout);
    const validation = await validateSharedLibrary(finalSo);
    if (!validation.ok) {
      throw new Error(`Installed vsort.so has unresolved native dependencies: ${validation.missing.join(', ')}`);
    }
    this.emitProgress(100, 'vs-mlrt ONNX Runtime plugin installed successfully');

    logger.dependency(`Installed vsort.so to ${finalSo}`);
    return finalSo;
  }

  /** Build protobuf from source if not already cached. */
  private async buildProtobuf(): Promise<string> {
    const protobufInstall = path.join(this.buildCache, `protobuf-${PROTOBUF_VERSION}`, 'install');
    if (await fs.pathExists(path.join(protobufInstall, 'lib', 'cmake', 'protobuf'))) {
      logger.dependency('Using cached protobuf build');
      return protobufInstall;
    }

    this.emitProgress(10, 'Building protobuf (this may take a few minutes)...');

    const protobufRoot = path.join(this.buildCache, `protobuf-${PROTOBUF_VERSION}`);
    const protobufSrc = path.join(protobufRoot, 'protobuf');
    const protobufBuild = path.join(protobufRoot, 'build');

    await fs.ensureDir(protobufRoot);

    if (!(await fs.pathExists(protobufSrc))) {
      await this.runGit([
        'clone', '--depth', '1', '--branch', `v${PROTOBUF_VERSION}`,
        'https://github.com/protocolbuffers/protobuf.git',
        protobufSrc,
      ]);
    }

    await fs.ensureDir(protobufBuild);
    await runCommand(
      'cmake',
      [
        '-S', path.join(protobufSrc, 'cmake'),
        '-B', protobufBuild,
        '-G', 'Ninja',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
        '-Dprotobuf_BUILD_SHARED_LIBS=OFF',
        '-Dprotobuf_BUILD_TESTS=OFF',
        `-DCMAKE_INSTALL_PREFIX=${protobufInstall}`,
      ],
      protobufRoot
    );

    await runCommand('cmake', ['--build', protobufBuild, '--parallel'], protobufRoot);
    await runCommand('cmake', ['--install', protobufBuild, '--prefix', protobufInstall], protobufRoot);

    return protobufInstall;
  }

  /** Build ONNX from source if not already cached. */
  private async buildOnnx(protobufInstall: string): Promise<string> {
    const onnxInstall = path.join(this.buildCache, `onnx-${ONNX_COMMIT.slice(0, 8)}`, 'install');
    if (await fs.pathExists(path.join(onnxInstall, 'lib', 'cmake', 'ONNX'))) {
      logger.dependency('Using cached ONNX build');
      return onnxInstall;
    }

    this.emitProgress(25, 'Building ONNX (this may take a few minutes)...');

    const onnxRoot = path.join(this.buildCache, `onnx-${ONNX_COMMIT.slice(0, 8)}`);
    const onnxSrc = path.join(onnxRoot, 'onnx');
    const onnxBuild = path.join(onnxRoot, 'build');

    await fs.ensureDir(onnxRoot);

    if (!(await fs.pathExists(onnxSrc))) {
      await this.runGit([
        'clone', '--depth', '1',
        `https://github.com/onnx/onnx.git`,
        onnxSrc,
      ]);
      // Fetch the specific commit
      await this.runGit(['fetch', '--depth', '1', 'origin', ONNX_COMMIT], onnxSrc);
      await this.runGit(['checkout', ONNX_COMMIT], onnxSrc);
    }

    const protoc = path.join(protobufInstall, 'bin', 'protoc');
    const protobufLib = path.join(protobufInstall, 'lib');

    await fs.ensureDir(onnxBuild);
    await runCommand(
      'cmake',
      [
        '-S', onnxSrc,
        '-B', onnxBuild,
        '-G', 'Ninja',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
        '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
        `-DProtobuf_PROTOC_EXECUTABLE=${protoc}`,
        `-DProtobuf_LITE_LIBRARY=${protobufLib}`,
        `-DProtobuf_LIBRARIES=${protobufLib}`,
        '-DONNX_USE_LITE_PROTO=ON',
        '-DONNX_USE_PROTOBUF_SHARED_LIBS=OFF',
        '-DONNX_GEN_PB_TYPE_STUBS=OFF',
        '-DONNX_ML=0',
        `-DCMAKE_INSTALL_PREFIX=${onnxInstall}`,
      ],
      onnxRoot
    );

    await runCommand('cmake', ['--build', onnxBuild, '--parallel'], onnxRoot);
    await runCommand('cmake', ['--install', onnxBuild, '--prefix', onnxInstall], onnxRoot);

    return onnxInstall;
  }

  private async resolveOnnxRuntimeLayout(): Promise<OnnxRuntimeLayout> {
    const configured = configManager.getOnnxRuntimeConfig();
    if (configured.source === 'system') {
      if (!configured.includeDir || !configured.libDir) {
        throw new Error('System ONNX Runtime selected but includeDir/libDir are not configured. Set VAPOURKIT_ONNXRUNTIME_INCLUDE_DIR and VAPOURKIT_ONNXRUNTIME_LIB_DIR, or configure systemOnnxRuntime in app-config.json.');
      }

      const layout: OnnxRuntimeLayout = {
        source: 'system',
        includeDir: configured.includeDir,
        libDir: configured.libDir,
        copyLibraries: !!configured.copyLibraries,
      };
      await this.validateOnnxRuntimeLayout(layout);
      logger.dependency(`Using system ONNX Runtime from ${layout.libDir}`);
      return layout;
    }

    const rootDir = await this.downloadOnnxRuntime();
    const layout: OnnxRuntimeLayout = {
      source: 'prebuilt',
      rootDir,
      includeDir: path.join(rootDir, 'include'),
      libDir: path.join(rootDir, 'lib'),
      copyLibraries: true,
    };
    await this.validateOnnxRuntimeLayout(layout);
    return layout;
  }

  private async validateOnnxRuntimeLayout(layout: OnnxRuntimeLayout): Promise<void> {
    const headerCandidates = [
      path.join(layout.includeDir, 'onnxruntime_c_api.h'),
      path.join(layout.includeDir, 'onnxruntime', 'core', 'session', 'onnxruntime_c_api.h'),
    ];
    if (!headerCandidates.some(candidate => fs.pathExistsSync(candidate))) {
      throw new Error(`ONNX Runtime C API header not found under ${layout.includeDir}`);
    }

    const libPath = path.join(layout.libDir, 'libonnxruntime.so');
    if (!await fs.pathExists(libPath)) {
      throw new Error(`ONNX Runtime shared library not found: ${libPath}`);
    }

    const validation = await validateSharedLibrary(libPath);
    if (!validation.ok) {
      throw new Error(`ONNX Runtime library has unresolved dependencies: ${validation.missing.join(', ')}`);
    }
  }

  /** Download ONNX Runtime Linux binaries from the official Microsoft release. */
  private async downloadOnnxRuntime(): Promise<string> {
    const ortDir = path.join(this.buildCache, `onnxruntime-${ONNX_RUNTIME_VERSION}`);
    const includeDir = path.join(ortDir, 'include');
    if (await fs.pathExists(includeDir)) {
      logger.dependency('Using cached ONNX Runtime binaries');
      return ortDir;
    }

    this.emitProgress(40, 'Downloading ONNX Runtime binaries...');

    const archiveName = `onnxruntime-linux-x64-${ONNX_RUNTIME_VERSION}.tgz`;
    const archivePath = path.join(this.buildCache, archiveName);
    const url = `https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_RUNTIME_VERSION}/${archiveName}`;

    if (!(await fs.pathExists(archivePath))) {
      const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        timeout: 300000,
      });

      const writer = fs.createWriteStream(archivePath);
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    }

    // Extract
    await fs.ensureDir(ortDir);
    await runCommand('tar', ['-xf', archivePath, '-C', ortDir, '--strip-components=1'], this.buildCache);
    await fs.remove(archivePath);

    return ortDir;
  }

  /** Clone vs-mlrt source at the pinned version. */
  private async cloneVsMlrtSource(): Promise<string> {
    const vsMlrtDir = path.join(this.buildCache, `vs-mlrt-${VS_MLRT_VERSION}`);
    const vsMlrtSrc = path.join(vsMlrtDir, 'vs-mlrt');

    if (await fs.pathExists(vsMlrtSrc)) {
      logger.dependency('Using cached vs-mlrt source');
      return vsMlrtSrc;
    }

    this.emitProgress(45, 'Cloning vs-mlrt source...');
    await fs.ensureDir(vsMlrtDir);

    await this.runGit([
      'clone', '--depth', '1', '--branch', `v${VS_MLRT_VERSION}`,
      'https://github.com/AmusementClub/vs-mlrt.git',
      vsMlrtSrc,
    ]);

    return vsMlrtSrc;
  }

  /** Find VapourSynth header directory on the system or download a fallback. */
  private async findVapourSynthHeaders(): Promise<string> {
    const candidates = [
      '/usr/include/vapoursynth',
      '/usr/local/include/vapoursynth',
      '/app/include/vapoursynth',
    ];

    for (const dir of candidates) {
      if (await fs.pathExists(path.join(dir, 'VapourSynth.h'))) {
        logger.dependency(`Found VapourSynth headers at ${dir}`);
        return dir;
      }
    }

    // Fallback: download headers from GitHub
    this.emitProgress(48, 'Downloading VapourSynth headers...');
    const headerCache = path.join(this.buildCache, 'vapoursynth-headers');
    const headerFile = path.join(headerCache, 'VapourSynth.h');

    if (await fs.pathExists(headerFile)) {
      return headerCache;
    }

    await fs.ensureDir(headerCache);
    // Download just the main header file directly from the VapourSynth repo
    const vsTag = 'R76';
    const headerUrl = `https://raw.githubusercontent.com/vapoursynth/vapoursynth/${vsTag}/include/VapourSynth.h`;
    const apiUrl = `https://raw.githubusercontent.com/vapoursynth/vapoursynth/${vsTag}/include/VSHelper.h`;

    await this.downloadTextFile(headerUrl, path.join(headerCache, 'VapourSynth.h'));
    await this.downloadTextFile(apiUrl, path.join(headerCache, 'VSHelper.h'));

    return headerCache;
  }

  private async configureVsSort(
    vsMlrtSrc: string,
    buildDir: string,
    vsIncludeDir: string,
    ortLayout: OnnxRuntimeLayout,
    protobufInstall: string,
    onnxInstall: string
  ): Promise<void> {
    const vsortDir = path.join(vsMlrtSrc, 'vsort');
    await fs.ensureDir(buildDir);

    const cmakeArgs = [
      '-S', vsortDir,
      '-B', buildDir,
      '-G', 'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_CXX_FLAGS=-Wall -ffast-math -march=x86-64',
      `-DVAPOURSYNTH_INCLUDE_DIRECTORY=${vsIncludeDir}`,
      `-DONNX_RUNTIME_API_DIRECTORY=${ortLayout.includeDir}`,
      `-DONNX_RUNTIME_LIB_DIRECTORY=${ortLayout.libDir}`,
      `-Dprotobuf_DIR=${path.join(protobufInstall, 'lib', 'cmake', 'protobuf')}`,
      `-DONNX_DIR=${path.join(onnxInstall, 'lib', 'cmake', 'ONNX')}`,
      '-DCMAKE_CXX_STANDARD=20',
      '-DCMAKE_INSTALL_LIBDIR=lib',
      '-DCMAKE_INSTALL_RPATH=$ORIGIN',
      '-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON',
      `-DCMAKE_INSTALL_PREFIX=${path.join(vsMlrtSrc, 'vsort', 'install')}`,
    ];

    await runCommand('cmake', cmakeArgs, vsMlrtSrc);
  }

  private async copyOnnxRuntimeLibraries(layout: OnnxRuntimeLayout): Promise<void> {
    if (!layout.copyLibraries) {
      logger.dependency('Using system ONNX Runtime in-place; not copying ONNX Runtime libraries');
      return;
    }

    const files = await fs.readdir(layout.libDir);
    const libs = files.filter(file => file.startsWith('libonnxruntime'));

    for (const lib of libs) {
      await fs.copy(path.join(layout.libDir, lib), path.join(this.pluginOutputDir, lib), { overwrite: true });
    }
  }

  private async setPluginRpath(pluginPath: string, layout: OnnxRuntimeLayout): Promise<void> {
    const rpath = layout.copyLibraries ? '$ORIGIN' : `$ORIGIN:${layout.libDir}`;
    await runCommand('patchelf', ['--set-rpath', rpath, pluginPath], this.pluginOutputDir);
  }

  private async buildVsSort(buildDir: string): Promise<void> {
    await runCommand('cmake', ['--build', buildDir, '--parallel'], buildDir);
  }

  private async installVsSort(buildDir: string, installDir: string): Promise<void> {
    await fs.ensureDir(installDir);
    await runCommand('cmake', ['--install', buildDir, '--prefix', installDir], buildDir);
  }

  private async runGit(args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: NodeJS.Timeout | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      resolveCommandPath('git').then((git) => {
        if (!git) {
          finish(new Error('git not found on PATH'));
          return;
        }

        const proc = spawn(git, args, {
          cwd: cwd || this.buildCache,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...platformSpawnOptions(),
        });

        let stderr = '';
        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            finish();
          } else {
            finish(new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`));
          }
        });

        proc.on('error', (err) => {
          finish(new Error(`git ${args.join(' ')} error: ${err.message}`));
        });

        timeout = setTimeout(() => {
          try { proc.kill(); } catch {}
          finish(new Error(`git ${args.join(' ')} timed out`));
        }, 120000);
      }).catch((error) => {
        finish(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async downloadTextFile(url: string, dest: string): Promise<void> {
    const response = await axios({ method: 'get', url, responseType: 'text', timeout: 30000 });
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, response.data);
  }

  private static async which(command: string): Promise<string | null> {
    return resolveCommandPath(command);
  }
}
