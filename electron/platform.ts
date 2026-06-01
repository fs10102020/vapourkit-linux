import * as path from 'path';
import { app } from 'electron';
import { exec, ChildProcess } from 'child_process';
import { SpawnOptions } from 'child_process';
import * as fs from 'fs';

import { isWindows, isLinux } from './platformState';
export { isWindows, isLinux };

export function exeName(name: string): string {
  return isWindows ? `${name}.exe` : name;
}

export function libName(name: string): string {
  return isWindows ? `${name}.dll` : `${name}.so`;
}

export function scriptBinDir(): string {
  return isWindows ? 'Scripts' : 'bin';
}

export function getPathSeparator(): string {
  return isWindows ? ';' : ':';
}

export function sitePackagesDir(pythonPrefix: string): string {
  if (isWindows) {
    return path.join(pythonPrefix, 'Lib', 'site-packages');
  }
  const candidates = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3'];
  for (const pyDir of candidates) {
    const dir = path.join(pythonPrefix, 'lib', pyDir, 'site-packages');
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(pythonPrefix, 'lib', 'python3', 'site-packages');
}

export function platformSpawnOptions(extra?: SpawnOptions): SpawnOptions {
  const base: SpawnOptions = { ...(extra || {}) };
  if (isWindows) {
    (base as any).windowsHide = true;
  }
  return base;
}

export function forceKillProcess(proc: ChildProcess): void {
  if (!proc.pid) return;

  if (isWindows) {
    exec(`taskkill /F /T /PID ${proc.pid}`, (error) => {
      if (error && !error.message.includes('not found')) {
        // process may already be dead
      }
    });
  } else {
    try {
      // Try to kill the whole process group (works when spawned detached)
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        // process may already be dead
      }
    }
  }
}

export function forceKillProcessGroup(proc: ChildProcess): void {
  if (!proc.pid) return;

  if (isWindows) {
    exec(`taskkill /F /T /PID ${proc.pid}`, (error) => {
      if (error && !error.message.includes('not found')) {
        // process may already be dead
      }
    });
  } else {
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch (e) {
      // process group may already be dead
    }
  }
}

export function resolveAppDataPath(): string {
  if (isLinux) {
    if (process.env['FLATPAK_ID'] || process.env['APPIMAGE']) {
      return app.getPath('userData');
    }
    if (!app.isPackaged) {
      return path.join(app.getAppPath(), 'data');
    }
    return app.getPath('userData');
  }
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'data');
  }
  if (isWindows) {
    return path.join(path.dirname(app.getPath('exe')), 'data');
  }
  return app.getPath('userData');
}

export function resolvePythonPath(vsPath: string): string {
  return path.join(vsPath, exeName('python'));
}

export function resolveVspipePath(vsPath: string): string {
  return path.join(vsPath, exeName('vspipe'));
}

export function resolveVsviewPath(scriptsBase: string): string {
  if (isWindows) {
    return path.join(scriptsBase, 'Scripts', 'vsview.exe');
  }
  return path.join(scriptsBase, 'bin', 'vsview');
}

export function resolvePluginPath(pluginsDir: string, pluginName: string): string {
  return path.join(pluginsDir, libName(pluginName));
}

/**
 * Synchronous PATH-based binary name for spawn() on Linux.
 * On Windows, falls back to the given fullPath. On Linux, if the
 * fullPath doesn't exist on disk, returns the bare binary name so
 * spawn() locates it via $PATH. Existence checks should use
 * `executableExists` instead of raw fs.existsSync for bare names.
 */

export function executablePath(fullPath: string, binaryName: string): string {
  if (isLinux && !fs.existsSync(fullPath)) {
    return binaryName;
  }
  return fullPath;
}

/** Checks whether a resolved executable (from executablePath) is runnable. */
export function executableExists(resolvedPath: string): boolean {
  if (isLinux && !path.isAbsolute(resolvedPath)) {
    return resolveCommandPathSync(resolvedPath) !== null;
  }
  return fs.existsSync(resolvedPath);
}

export function resolveCommandPathSync(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (path.isAbsolute(command)) {
    return isExecutable(command) ? command : null;
  }

  const pathEnv = env.PATH || '';
  const extensions = isWindows
    ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, isWindows && !path.extname(command) ? `${command}${extension}` : command);
      if (isExecutable(candidate)) return candidate;
    }
  }

  return null;
}

export async function resolveCommandPath(command: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  return resolveCommandPathSync(command, env);
}

function isExecutable(filePath: string): boolean {
  try {
    if (isWindows) {
      return fs.existsSync(filePath);
    }
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
