import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { logger } from './logger';
import { PATHS } from './constants';
import { isWindows, isLinux, platformSpawnOptions, resolveCommandPath } from './platform';
import { buildLinuxVsEnvironment } from './vsEnvironment';
import { detectGpuCapabilities } from './gpuDetection';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface GpuStats {
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  gpuUtilization: number;
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
    logger.debug(`Running command: ${command} ${args.join(' ')}`);
    logger.debug(`Working directory: ${cwd || process.cwd()}`);

    resolveCommandPath(command, env || process.env).then((resolved) => {
      if (!resolved) {
        reject(new Error(`Command not found: ${command}`));
        return;
      }

      const proc = spawn(resolved, args, {
        cwd: cwd || process.cwd(),
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
    }).catch(reject);
  });
}

export async function runCommandCapture(command: string, args: string[], timeoutMs = 5000): Promise<string | undefined> {
  return new Promise((resolve) => {
    resolveCommandPath(command).then((resolved) => {
      if (!resolved) {
        resolve(undefined);
        return;
      }

      const proc = spawn(resolved, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...platformSpawnOptions(),
      });

      let stdout = '';
      let settled = false;
      const finish = (value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        finish(undefined);
      }, timeoutMs);

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.on('close', (code) => finish(code === 0 && stdout.trim() ? stdout : undefined));
      proc.on('error', () => finish(undefined));
    }).catch(() => resolve(undefined));
  });
}

export async function pollGpuStats(): Promise<GpuStats | null> {
  try {
    const output = await runCommandCapture('nvidia-smi', [
      '--query-gpu=memory.used,memory.total,utilization.gpu',
      '--format=csv,noheader,nounits'
    ], 3000);

    if (output?.trim()) {
      const parts = output.trim().split(',').map(s => s.trim());
      if (parts.length >= 3) {
        return {
          gpuMemoryUsed: parseInt(parts[0], 10),
          gpuMemoryTotal: parseInt(parts[1], 10),
          gpuUtilization: parseInt(parts[2], 10)
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function detectCudaSupport(): Promise<boolean> {
  try {
    const gpus = await detectGpuCapabilities();
    if (gpus.nvidia.available) {
      logger.info(`CUDA GPU detected: ${gpus.nvidia.name || 'NVIDIA GPU'}${gpus.nvidia.cudaVersion ? ` (CUDA ${gpus.nvidia.cudaVersion})` : ''}`);
      return true;
    }
    logger.info('No CUDA support detected');
    return false;
  } catch (error) {
    logger.info('Error detecting CUDA support:', error);
    return false;
  }
}

export function setupVSEnvironment(pythonPath?: string): NodeJS.ProcessEnv {
  if (isLinux) {
    return buildLinuxVsEnvironment(pythonPath || PATHS.PYTHON);
  }

  const env = { ...process.env };

  if (pythonPath) {
    const pythonDir = path.dirname(pythonPath);
    env['PATH'] = `${pythonDir}${path.delimiter}${env['PATH'] || ''}`;

    if (isWindows) {
      env['PYTHONHOME'] = pythonDir;
      env['PYTHONPATH'] = path.join(pythonDir, 'Lib', 'site-packages');
    }
  }

  if (!isLinux) {
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
