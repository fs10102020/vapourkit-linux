import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { app } from 'electron';
import { isLinux } from './platformState';

const PYTHON_SITE_PACKAGES_PATTERN = /^python\d+(?:\.\d+)?$/;

/**
 * Linux / Flatpak runtime helpers for VapourKit.
 *
 * Centralizes path resolution, environment detection, and backend normalization
 * so that Flatpak, AppImage, native package, and dev-mode Linux runs behave
 * consistently.
 */

/** True when running inside a Flatpak sandbox. */
export function isFlatpak(): boolean {
  return isLinux && !!process.env['FLATPAK_ID'];
}

/** True when the app is running from an AppImage. */
export function isAppImage(): boolean {
  return isLinux && !!process.env['APPIMAGE'];
}

/**
 * Returns the base directory that should be used for app-data on Linux.
 * - Flatpak: XDG userData (writable, persisted across updates)
 * - AppImage: the AppImage mount dir is read-only, so use XDG userData
 * - Native / dev: project-root/data in dev, ~/.config/<app>/ in packaged
 */
export function getLinuxAppDataPath(): string {
  if (!isLinux) {
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
  return findSitePackagesInVenv(venvRoot);
}

export function findSitePackagesInVenv(venvRoot: string): string | undefined {
  const libRoots = ['lib', 'lib64'].map(lib => path.join(venvRoot, lib));

  for (const libRoot of libRoots) {
    try {
      if (!fs.existsSync(libRoot)) continue;
      const entries = fs.readdirSync(libRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !PYTHON_SITE_PACKAGES_PATTERN.test(entry.name)) continue;
        const sitePackages = path.join(libRoot, entry.name, 'site-packages');
        if (fs.existsSync(sitePackages)) return sitePackages;
      }
    } catch {
      // Ignore unreadable lib roots and continue with other candidates.
    }
  }

  return undefined;
}

/**
 * Returns directories to search for VapourSynth plugins on Linux.
 * Includes app-data plugins, system paths, Flatpak /app paths, and
 * whatever is already in VS_PLUGINS_PATH / VAPOURSYNTH_PLUGINS_PATH.
 */
export function getLinuxVsPluginSearchPaths(): string[] {
  if (!isLinux) return [];

  const paths: string[] = [];

  // App-data plugins (portable-style)
  paths.push(path.join(getLinuxAppDataPath(), 'vapoursynth-portable', 'vs-plugins'));

  // Flatpak bundled plugins
  if (isFlatpak()) {
    paths.push('/app/lib/vapoursynth');
  }

  // System + user local
  paths.push('/usr/lib/vapoursynth');
  paths.push('/usr/lib64/vapoursynth');
  paths.push('/usr/lib/x86_64-linux-gnu/vapoursynth');
  paths.push('/usr/local/lib/vapoursynth');
  paths.push('/usr/local/lib64/vapoursynth');
  paths.push('/lib/vapoursynth');

  const triplet = getLinuxMultiarchTriplet();
  if (triplet) {
    paths.push(`/usr/lib/${triplet}/vapoursynth`);
    paths.push(`/usr/local/lib/${triplet}/vapoursynth`);
    paths.push(`/lib/${triplet}/vapoursynth`);
  }

  paths.push(path.join(os.homedir(), '.local', 'lib', 'vapoursynth'));
  paths.push(path.join(os.homedir(), '.local', 'lib64', 'vapoursynth'));

  // Preserve env overrides
  const envPaths = (process.env['VS_PLUGINS_PATH'] || process.env['VAPOURSYNTH_PLUGINS_PATH'] || '')
    .split(path.delimiter)
    .filter(Boolean);
  paths.push(...envPaths);

  return [...new Set(paths)];
}

function getLinuxMultiarchTriplet(): string | null {
  switch (process.arch) {
    case 'x64': return 'x86_64-linux-gnu';
    case 'arm64': return 'aarch64-linux-gnu';
    case 'arm': return 'arm-linux-gnueabihf';
    case 'ia32': return 'i386-linux-gnu';
    default: return null;
  }
}

/**
 * Checks whether a VapourSynth plugin file exists in the search paths.
 */
export function findLinuxPlugin(name: string): boolean {
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
  if (!isLinux) {
    return path.join(getLinuxAppDataPath(), 'vapoursynth-portable');
  }
  // Use a guaranteed-writable temp directory; the portable dir may not exist
  return os.tmpdir();
}

/**
 * Resolves the log directory for the current Linux runtime.
 * Ensures we never try to write logs under a read-only mount (e.g. /app in Flatpak).
 */
export function getLinuxLogDir(): string {
  return path.join(getLinuxAppDataPath(), 'logs');
}
