import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';

const isLinuxRuntime = process.platform === 'linux';

/**
 * Linux / Flatpak runtime helpers for VapourKit.
 *
 * Centralizes path resolution, environment detection, and backend normalization
 * so that Flatpak, AppImage, native package, and dev-mode Linux runs behave
 * consistently.
 */

/** True when running inside a Flatpak sandbox. */
export function isFlatpak(): boolean {
  return isLinuxRuntime && !!process.env['FLATPAK_ID'];
}

/** True when the app is running from an AppImage. */
export function isAppImage(): boolean {
  return isLinuxRuntime && !!process.env['APPIMAGE'];
}

/**
 * Returns the base directory that should be used for app-data on Linux.
 * - Flatpak: XDG userData (writable, persisted across updates)
 * - AppImage: the AppImage mount dir is read-only, so use XDG userData
 * - Native / dev: project-root/data in dev, ~/.config/<app>/ in packaged
 */
export function getLinuxAppDataPath(): string {
  if (!isLinuxRuntime) {
    if (!app.isPackaged) {
      return path.join(app.getAppPath(), 'data');
    }
    if (process.platform === 'win32') {
      return path.join(path.dirname(app.getPath('exe')), 'data');
    }
    return app.getPath('userData');
  }
  if (!isFlatpak() && !isAppImage() && !app.isPackaged) {
    return path.join(app.getAppPath(), 'data');
  }
  return app.getPath('userData');
}

/**
 * Returns the Python executable path to use on Linux.
 * - Flatpak: prefer the bundled /app/python-venv/bin/python
 * - Otherwise: the user-data venv Python
 */
export function getLinuxPythonPath(): string {
  if (isFlatpak()) {
    return '/app/python-venv/bin/python';
  }
  return path.join(getLinuxAppDataPath(), 'python-venv', 'bin', 'python');
}

/**
 * Returns the venv site-packages directory for PYTHONPATH injection.
 */
export function getLinuxVenvSitePackages(): string | undefined {
  const pythonDir = path.dirname(getLinuxPythonPath());
  const venvRoot = path.dirname(pythonDir);
  const candidates = [
    path.join(venvRoot, 'lib', 'python3.13', 'site-packages'),
    path.join(venvRoot, 'lib', 'python3.12', 'site-packages'),
    path.join(venvRoot, 'lib', 'python3.11', 'site-packages'),
    path.join(venvRoot, 'lib', 'python3.10', 'site-packages'),
    path.join(venvRoot, 'lib', 'python3.9', 'site-packages'),
    path.join(venvRoot, 'lib', 'python3', 'site-packages'),
  ];
  return candidates.find(sp => {
    try {
      const fs = require('fs');
      return fs.existsSync(sp);
    } catch {
      return false;
    }
  });
}

/**
 * Returns directories to search for VapourSynth plugins on Linux.
 * Includes app-data plugins, system paths, Flatpak /app paths, and
 * whatever is already in VS_PLUGINS_PATH / VAPOURSYNTH_PLUGINS_PATH.
 */
export function getLinuxVsPluginSearchPaths(): string[] {
  if (!isLinuxRuntime) return [];

  const paths: string[] = [];

  // App-data plugins (portable-style)
  paths.push(path.join(getLinuxAppDataPath(), 'vapoursynth-portable', 'vs-plugins'));

  // Flatpak bundled plugins
  if (isFlatpak()) {
    paths.push('/app/lib/vapoursynth');
  }

  // System + user local
  paths.push('/usr/lib/vapoursynth');
  paths.push('/usr/local/lib/vapoursynth');
  paths.push(path.join(os.homedir(), '.local', 'lib', 'vapoursynth'));

  // Preserve env overrides
  const envPaths = (process.env['VS_PLUGINS_PATH'] || process.env['VAPOURSYNTH_PLUGINS_PATH'] || '')
    .split(path.delimiter)
    .filter(Boolean);
  paths.push(...envPaths);

  return [...new Set(paths)];
}

/**
 * Checks whether a VapourSynth plugin file exists in the search paths.
 */
export function findLinuxPlugin(name: string): boolean {
  const fs = require('fs');
  for (const dir of getLinuxVsPluginSearchPaths()) {
    if (fs.existsSync(path.join(dir, `${name}.so`))) return true;
    if (fs.existsSync(path.join(dir, `lib${name}.so`))) return true;
  }
  return false;
}

/**
 * Working directory for spawning vspipe on Linux.
 * Avoids using the non-existent portable directory when vspipe comes from PATH.
 */
export function getVapourSynthCwd(): string {
  if (!isLinuxRuntime) {
    return path.join(getLinuxAppDataPath(), 'vapoursynth-portable');
  }
  // Use a guaranteed-writable temp directory; the portable dir may not exist
  return os.tmpdir();
}

/**
 * Normalizes a backend string to a supported InferenceBackend.
 * Falls back to 'onnxruntime-cpu' when the requested backend is unavailable
 * or unsupported on the current platform.
 */
export function normalizeBackend(
  raw: string | undefined,
  supported: string[]
): 'directml' | 'tensorrt' | 'onnxruntime-cuda' | 'onnxruntime-cpu' {
  const valid = raw as any;
  if (valid && supported.includes(valid)) {
    return valid;
  }
  if (supported.includes('tensorrt')) return 'tensorrt';
  if (supported.includes('onnxruntime-cuda')) return 'onnxruntime-cuda';
  if (supported.includes('directml')) return 'directml';
  return 'onnxruntime-cpu';
}

/**
 * Resolves the log directory for the current Linux runtime.
 * Ensures we never try to write logs under a read-only mount (e.g. /app in Flatpak).
 */
export function getLinuxLogDir(): string {
  return path.join(getLinuxAppDataPath(), 'logs');
}
