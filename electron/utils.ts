import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { logger } from './logger';
import { PATHS } from './constants';
import { isWindows, isLinux, platformSpawnOptions } from './platform';
import { getLinuxVsPluginSearchPaths } from './linuxRuntime';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

export function fixAsarPath(filePath: string): string {
  if (filePath && filePath.includes('app.asar') && !filePath.includes('app.asar.unpacked')) {
    return filePath.replace('app.asar', 'app.asar.unpacked');
  }
  return filePath;
}

export function getBundledBasePath(): string {
  const envBase = process.env.VAPOURKIT_BUNDLED_BASE;
  if (envBase) {
    return fixAsarPath(envBase);
  }
  const { app } = require('electron');
  return fixAsarPath(app.getAppPath());
}

export async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Quote paths containing spaces for shell safety (Windows and Linux)
    const quotedCommand = command.includes(' ') ? `"${command}"` : command;
    const quotedArgs = args.map(arg => arg.includes(' ') ? `"${arg}"` : arg);

    logger.debug(`Running command: ${quotedCommand} ${quotedArgs.join(' ')}`);
    logger.debug(`Working directory: ${cwd || process.cwd()}`);

    const proc = spawn(quotedCommand, quotedArgs, {
      cwd: cwd || process.cwd(),
      shell: true,
      env: env || process.env,
      ...platformSpawnOptions(),
    });

    let stdout = '';
    let stderr = '';

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        logger.debug(`[stdout] ${output.trim()}`);
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        logger.debug(`[stderr] ${output.trim()}`);
      });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        logger.debug(`Command completed successfully with code ${code}`);
        resolve();
      } else {
        const errorMsg = `Command failed with code ${code}: ${stderr || stdout}`;
        logger.error(errorMsg);
        reject(new Error(errorMsg));
      }
    });

    proc.on('error', (error) => {
      logger.error('Command execution error:', error);
      reject(error);
    });
  });
}

export function setupVSEnvironment(pythonPath?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  if (isLinux) {
    const pythonDir = path.dirname(pythonPath || PATHS.PYTHON);
    env['PATH'] = `${pythonDir}${path.delimiter}${env['PATH'] || ''}`;

    const vsLibDir = path.join(path.dirname(pythonDir), 'lib');
    const ldPath = env['LD_LIBRARY_PATH']
      ? `${vsLibDir}${path.delimiter}${env['LD_LIBRARY_PATH']}`
      : vsLibDir;
    env['LD_LIBRARY_PATH'] = ldPath;

    if (env['PYTHONHOME']) {
      delete env['PYTHONHOME'];
    }

    // Expose venv site-packages so system vspipe can import packages installed into our venv
    const venvRoot = path.dirname(pythonDir);
    const sitePackagesCandidates = [
      path.join(venvRoot, 'lib', 'python3.13', 'site-packages'),
      path.join(venvRoot, 'lib', 'python3.12', 'site-packages'),
      path.join(venvRoot, 'lib', 'python3.11', 'site-packages'),
      path.join(venvRoot, 'lib', 'python3.10', 'site-packages'),
      path.join(venvRoot, 'lib', 'python3.9', 'site-packages'),
      path.join(venvRoot, 'lib', 'python3', 'site-packages'),
    ];
    const sitePackages = sitePackagesCandidates.find(sp => fs.existsSync(sp));
    if (sitePackages) {
      env['PYTHONPATH'] = env['PYTHONPATH']
        ? `${sitePackages}${path.delimiter}${env['PYTHONPATH']}`
        : sitePackages;
    }
  }

  if (pythonPath && !isLinux) {
    const pythonDir = path.dirname(pythonPath);
    env['PATH'] = `${pythonDir}${path.delimiter}${env['PATH'] || ''}`;

    if (isWindows) {
      env['PYTHONHOME'] = pythonDir;
      env['PYTHONPATH'] = path.join(pythonDir, 'Lib', 'site-packages');
    }
  }

  // Blend app-data, system, Flatpak, and pre-existing VapourSynth plugin paths on Linux
  if (isLinux) {
    const pluginDirs = getLinuxVsPluginSearchPaths();
    const combined = pluginDirs.join(path.delimiter);
    env['VS_PLUGINS_PATH'] = combined;
    env['VAPOURSYNTH_PLUGINS_PATH'] = combined;
  } else {
    env['VS_PLUGINS_PATH'] = PATHS.PLUGINS;
    env['VAPOURSYNTH_PLUGINS_PATH'] = PATHS.PLUGINS;
  }

  return env;
}

export async function withLogSeparator<T>(
  operation: () => Promise<T>,
  startMessage?: string
): Promise<T> {
  logger.separator();
  if (startMessage) {
    logger.info(startMessage);
  }
  try {
    const result = await operation();
    logger.separator();
    return result;
  } catch (error) {
    logger.separator();
    throw error;
  }
}

export interface GpuStats {
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  gpuUtilization: number;
}

export async function pollGpuStats(): Promise<GpuStats | null> {
  try {
    const proc = spawn('nvidia-smi', [
      '--query-gpu=memory.used,memory.total,utilization.gpu',
      '--format=csv,noheader,nounits'
    ], {
      shell: true,
      ...platformSpawnOptions(),
    });

    return new Promise((resolve) => {
      let output = '';

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          output += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const parts = output.trim().split(',').map(s => s.trim());
          if (parts.length >= 3) {
            resolve({
              gpuMemoryUsed: parseInt(parts[0], 10),
              gpuMemoryTotal: parseInt(parts[1], 10),
              gpuUtilization: parseInt(parts[2], 10)
            });
            return;
          }
        }
        resolve(null);
      });

      proc.on('error', () => resolve(null));

      setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 3000);
    });
  } catch {
    return null;
  }
}

export async function detectCudaSupport(): Promise<boolean> {
  try {
    const proc = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      shell: true,
      ...platformSpawnOptions(),
    });

    return new Promise((resolve) => {
      let hasOutput = false;

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output.length > 0) {
            hasOutput = true;
            logger.info(`CUDA GPU detected: ${output}`);
          }
        });
      }

      proc.on('close', (code) => {
        if (code === 0 && hasOutput) {
          logger.info('CUDA support detected');
          resolve(true);
        } else {
          logger.info('No CUDA support detected');
          resolve(false);
        }
      });

      proc.on('error', () => {
        logger.info('nvidia-smi not found - no CUDA support');
        resolve(false);
      });

      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 3000);
    });
  } catch (error) {
    logger.info('Error detecting CUDA support:', error);
    return false;
  }
}
