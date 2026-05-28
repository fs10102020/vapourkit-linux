import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn } from 'child_process';
import { PATHS } from './constants';
import { logger } from './logger';
import { isWindows, isLinux, exeName, platformSpawnOptions } from './platform';

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

    const status = await DependencyResolver.runCommand('python3', ['-m', 'venv', venvPath]);
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
      { name: 'VapourSynth', pkgs: ['vapoursynth'] },
      { name: 'vsjetpack', pkgs: ['vsjetpack==1.1.0', 'vapoursynth'] },
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
      return { component: 'vapoursynth', name: 'VapourSynth', installed: true, path: await DependencyResolver.which('vspipe') || 'vspipe' };
    }

    return {
      component: 'vapoursynth',
      name: 'VapourSynth',
      installed: false,
      guide: 'VapourSynth is required for video processing.\n  Arch: sudo pacman -S vapoursynth\n  Debian/Ubuntu: Check distro package availability or build from source\n  Fedora: Check RPM Fusion or build from source\n  See: https://www.vapoursynth.com/doc/installation.html',
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
      guide: 'video-compare is used for side-by-side comparison.\n  Arch: yay -S video-compare (AUR)\n  Debian/Ubuntu: Build from source — https://github.com/pixop/video-compare\n  Fedora: Build from source',
    };
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

    return results;
  }

  private static async runCommand(command: string, args: string[]): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...platformSpawnOptions(),
      });

      let stderr = '';

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          error: code !== 0 ? stderr.trim() : undefined,
        });
      });

      proc.on('error', () => {
        resolve({ success: false, error: `Command not found: ${command}` });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: `Command timed out: ${command}` });
      }, 30000);
    });
  }

  private static async which(command: string): Promise<string | null> {
    try {
      const proc = spawn(isWindows ? 'where' : 'which', [command], {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...platformSpawnOptions(),
      });

      return new Promise((resolve) => {
        let output = '';
        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
        });
        proc.on('close', (code) => {
          const lines = output.trim().split('\n');
          const first = lines[0]?.trim();
          resolve(code === 0 && first ? first : null);
        });
        proc.on('error', () => resolve(null));
      });
    } catch {
      return null;
    }
  }
}
