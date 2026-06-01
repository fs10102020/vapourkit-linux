import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn } from 'child_process';
import { PATHS } from './constants';
import { logger } from './logger';
import { isWindows, isLinux, exeName, platformSpawnOptions, resolveCommandPath } from './platform';

export interface DependencyStatus {
  component: string;
  name: string;
  installed: boolean;
  path?: string;
  guide?: string;
}

export interface LinuxDistroGuides {
  arch: string;
  debian: string;
  fedora: string;
}

export class DependencyResolver {
  static async resolvePython(): Promise<DependencyStatus> {
    if (isWindows) {
      const exists = await fs.pathExists(PATHS.PYTHON);
      return {
        component: 'python',
        name: 'Python',
        installed: exists,
        path: exists ? PATHS.PYTHON : undefined,
      };
    }

    const result = await DependencyResolver.runCommand('python3', ['--version']);
    if (result.success) {
      const pythonExe = await DependencyResolver.which('python3');
      return {
        component: 'python',
        name: 'Python 3',
        installed: true,
        path: pythonExe || 'python3',
      };
    }

    return {
      component: 'python',
      name: 'Python 3',
      installed: false,
      guide: 'Install Python 3.9+:\n  Arch: sudo pacman -S python\n  Debian/Ubuntu: sudo apt install python3 python3-venv\n  Fedora: sudo dnf install python3',
    };
  }

  static async setupVenv(): Promise<DependencyStatus> {
    if (isWindows) {
      return { component: 'python-venv', name: 'Python venv', installed: true };
    }

    const venvPath = PATHS.PYTHON_VENV;
    const venvPython = PATHS.VENV_PYTHON;

    if (await fs.pathExists(venvPython)) {
      logger.info(`Python venv already exists at ${venvPath}`);
      return { component: 'python-venv', name: 'Python venv', installed: true, path: venvPython };
    }

    logger.info(`Creating Python venv at ${venvPath}`);
    await fs.ensureDir(path.dirname(venvPath));

    let status = await DependencyResolver.runCommand('python3', ['-m', 'venv', '--copies', venvPath]);
    if (!status.success) {
      const errorText = status.error || '';
      if (errorText.includes('unrecognized argument') || errorText.includes('no such option') || errorText.includes('unknown option')) {
        logger.warn('python3 -m venv does not support --copies; retrying without it');
        status = await DependencyResolver.runCommand('python3', ['-m', 'venv', venvPath]);
      }
    }
    if (!status.success) {
      return {
        component: 'python-venv',
        name: 'Python venv',
        installed: false,
        guide: `Failed to create venv at ${venvPath}. Ensure python3-venv is installed.`,
      };
    }

    return {
      component: 'python-venv',
      name: 'Python venv',
      installed: true,
      path: venvPython,
    };
  }

  static async installPipPackages(): Promise<DependencyStatus[]> {
    const results: DependencyStatus[] = [];
    const python = isWindows ? PATHS.PYTHON : PATHS.VENV_PYTHON;

    if (!await fs.pathExists(python)) {
      results.push({ component: 'pip-packages', name: 'Python packages', installed: false, guide: 'Python not found' });
      return results;
    }

    const packages = [
      { name: 'pip/wheel/setuptools', pkgs: ['setuptools', 'wheel', 'pip', '--upgrade'] },
      { name: 'vsjetpack', pkgs: ['vsjetpack==1.1.0'] },
      { name: 'vsview', pkgs: ['vsview==0.5.0'] },
    ];

    for (const { name, pkgs } of packages) {
      const args = ['-m', 'pip', 'install', '--no-warn-script-location', '--cache-dir', PATHS.PIP_CACHE, ...pkgs];
      const status = await DependencyResolver.runCommand(python, args);

      results.push({
        component: `pip-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name,
        installed: status.success,
        guide: status.success ? undefined : `Failed to install ${name}: ${status.error || 'unknown error'}`,
      });
    }

    // Uninstall vapoursynth from the venv so the system vapoursynth is used instead.
    // vsjetpack pulls vapoursynth as a dependency, but system vspipe is linked against
    // the system libvapoursynth.so — the venv copy can cause an ABI mismatch.
    if (isWindows) {
      // Re-install vapoursynth explicitly with version pin on Windows
      const vsArgs = ['-m', 'pip', 'install', '--no-warn-script-location', '--cache-dir', PATHS.PIP_CACHE, 'vapoursynth==72'];
      const vsStatus = await DependencyResolver.runCommand(python, vsArgs);
      results.push({
        component: 'pip-vapoursynth',
        name: 'VapourSynth',
        installed: vsStatus.success,
        guide: vsStatus.success ? undefined : `Failed to install VapourSynth: ${vsStatus.error || 'unknown error'}`,
      });
    } else {
      const uninstallArgs = ['-m', 'pip', 'uninstall', '-y', 'vapoursynth'];
      const uninstallStatus = await DependencyResolver.runCommand(python, uninstallArgs);
      if (uninstallStatus.success) {
        results.push({
          component: 'pip-vapoursynth',
          name: 'VapourSynth',
          installed: true,
        });
      }
    }

    return results;
  }

  static async resolveFFmpeg(): Promise<DependencyStatus[]> {
    const results: DependencyStatus[] = [];

    for (const bin of ['ffmpeg', 'ffprobe']) {
      const binName = exeName(bin);

      if (isWindows) {
        const bundled = path.join(PATHS.FFMPEG_DIR, 'bin', binName);
        const exists = await fs.pathExists(bundled);
        results.push({
          component: bin,
          name: bin,
          installed: exists,
          path: exists ? bundled : undefined,
          guide: exists ? undefined : `FFmpeg must be installed via setup`,
        });
        continue;
      }

      const result = await DependencyResolver.runCommand(bin, ['-version']);
      const fullPath = result.success ? await DependencyResolver.which(bin) : undefined;

      if (result.success) {
        results.push({ component: bin, name: bin, installed: true, path: fullPath || bin });
      } else {
        const bundledPath = path.join(PATHS.FFMPEG_DIR, 'bin', binName);
        const bundledExists = await fs.pathExists(bundledPath);

        if (bundledExists) {
          results.push({ component: bin, name: bin, installed: true, path: bundledPath });
        } else {
          results.push({
            component: bin,
            name: bin,
            installed: false,
            guide: `${bin} is required but not found.\n  Arch: sudo pacman -S ffmpeg\n  Debian/Ubuntu: sudo apt install ffmpeg\n  Fedora: sudo dnf install ffmpeg`,
          });
        }
      }
    }

    return results;
  }

  static async resolveVapourSynth(): Promise<DependencyStatus> {
    if (isWindows) {
      const exists = await fs.pathExists(PATHS.VSPIPE);
      return { component: 'vapoursynth', name: 'VapourSynth', installed: exists, path: exists ? PATHS.VSPIPE : undefined };
    }

    const result = await DependencyResolver.runCommand('vspipe', ['--version']);
    if (result.success) {
      const version = parseVapourSynthVersion(result.stdout || '');
      if (version === null) {
        logger.warn(`Could not parse VapourSynth version from output: "${(result.stdout || '').trim().split('\n')[0]}"`);
      }
      if (version !== null && version < 76) {
        return {
          component: 'vapoursynth',
          name: 'VapourSynth',
          installed: false,
          path: await DependencyResolver.which('vspipe') || 'vspipe',
          guide: `VapourSynth R76 or newer is required; detected R${version}. Update your distro package or build VapourSynth from source.`,
        };
      }
      return { component: 'vapoursynth', name: 'VapourSynth', installed: true, path: await DependencyResolver.which('vspipe') || 'vspipe' };
    }

    return {
      component: 'vapoursynth',
      name: 'VapourSynth',
      installed: false,
      guide: 'VapourSynth R76+ is required for video processing.\n  Arch: sudo pacman -S vapoursynth\n  Debian/Ubuntu: Check distro package availability or build from source\n  Fedora: Check RPM Fusion or build from source\n  openSUSE: sudo zypper install vapoursynth\n  Other distros: install VapourSynth R76+ with vspipe available on PATH\n  See: https://www.vapoursynth.com/doc/installation.html',
    };
  }

  static async resolveVideoCompare(): Promise<DependencyStatus> {
    if (isWindows) {
      const exists = await fs.pathExists(PATHS.VIDEO_COMPARE_EXE);
      return { component: 'video-compare', name: 'video-compare', installed: exists, path: exists ? PATHS.VIDEO_COMPARE_EXE : undefined };
    }

    const result = await DependencyResolver.runCommand('video-compare', ['--help']);
    if (result.success) {
      return { component: 'video-compare', name: 'video-compare', installed: true, path: await DependencyResolver.which('video-compare') || 'video-compare' };
    }

    return {
      component: 'video-compare',
      name: 'video-compare',
      installed: false,
      guide: 'video-compare is used for side-by-side comparison. Setup can build it from source when FFmpeg/SDL2 development headers are installed.\n  Arch: yay -S video-compare (AUR) or sudo pacman -S base-devel git ffmpeg sdl2 sdl2_ttf pkgconf\n  Debian/Ubuntu: sudo apt install build-essential git pkg-config libavformat-dev libavcodec-dev libavfilter-dev libavutil-dev libswscale-dev libswresample-dev libsdl2-dev libsdl2-ttf-dev\n  Fedora: sudo dnf install make gcc-c++ git pkgconf-pkg-config ffmpeg-devel SDL2-devel SDL2_ttf-devel',
    };
  }

  /**
   * Detects build tools required to compile vs-mlrt from source on Linux.
   * Returns a status entry for each tool so the UI can show what is missing.
   */
  static async resolveBuildTools(): Promise<DependencyStatus[]> {
    if (isWindows) {
      return [];
    }

    const { VsMlrtLinuxBuilder } = await import('./vsMlrtLinuxBuilder');
    const tools = await VsMlrtLinuxBuilder.detectBuildTools();

    return tools.map(t => ({
      component: `build-tool-${t.name}`,
      name: t.name,
      installed: t.found,
      path: t.path,
      guide: t.found
        ? undefined
        : `Install ${t.name} to enable automatic vs-mlrt compilation.\n${VsMlrtLinuxBuilder.getBuildToolGuide([t.name])}`,
    }));
  }

  static async resolveAll(): Promise<DependencyStatus[]> {
    const results: DependencyStatus[] = [];

    results.push(await DependencyResolver.resolvePython());

    if (isLinux) {
      const venvStatus = await DependencyResolver.setupVenv();
      results.push(venvStatus);

      if (venvStatus.installed) {
        const pipResults = await DependencyResolver.installPipPackages();
        results.push(...pipResults);
      }
    }

    const ffmpegResults = await DependencyResolver.resolveFFmpeg();
    results.push(...ffmpegResults);

    results.push(await DependencyResolver.resolveVapourSynth());
    results.push(await DependencyResolver.resolveVideoCompare());

    if (isLinux) {
      const buildToolResults = await DependencyResolver.resolveBuildTools();
      results.push(...buildToolResults);
    }

    return results;
  }

  /** Read-only status check: detects tools but does NOT create venvs or install packages. */
  static async resolveAllReadOnly(): Promise<DependencyStatus[]> {
    const results: DependencyStatus[] = [];

    results.push(await DependencyResolver.resolvePython());

    if (isLinux) {
      const venvPython = PATHS.VENV_PYTHON;
      const venvExists = await fs.pathExists(venvPython);
      results.push({
        component: 'python-venv',
        name: 'Python venv',
        installed: venvExists,
        path: venvExists ? venvPython : undefined,
      });
    }

    const ffmpegResults = await DependencyResolver.resolveFFmpeg();
    results.push(...ffmpegResults);

    results.push(await DependencyResolver.resolveVapourSynth());
    results.push(await DependencyResolver.resolveVideoCompare());

    if (isLinux) {
      const buildToolResults = await DependencyResolver.resolveBuildTools();
      results.push(...buildToolResults);
    }

    return results;
  }

  private static async runCommand(command: string, args: string[]): Promise<{ success: boolean; error?: string; stdout?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (result: { success: boolean; error?: string; stdout?: string }) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      resolveCommandPath(command).then((resolved) => {
        if (!resolved) {
          finish({ success: false, error: `Command not found: ${command}` });
          return;
        }

        const proc = spawn(resolved, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          ...platformSpawnOptions(),
        });

        let stderr = '';
        let stdout = '';

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          finish({
            success: code === 0,
            stdout,
            error: code !== 0 ? stderr.trim() : undefined,
          });
        });

        proc.on('error', (error) => {
          finish({ success: false, error: error.message });
        });

        timer = setTimeout(() => {
          try { proc.kill(); } catch {}
          finish({ success: false, error: `Command timed out: ${command}` });
        }, 30000);
      }).catch((error) => {
        finish({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    });
  }

  private static async which(command: string): Promise<string | null> {
    try {
      return await resolveCommandPath(command);
    } catch {
      return null;
    }
  }
}

export function parseVapourSynthVersion(output: string): number | null {
  const match = output.match(/(?:VapourSynth[^\n\r]*\s)?R\s*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}
