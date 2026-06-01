import * as path from 'path';
import { PATHS } from './constants';
import { findSitePackagesInVenv, getLinuxVsPluginSearchPaths } from './linuxRuntime';

export function buildLinuxVsEnvironment(pythonPath: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const pythonDir = path.dirname(pythonPath);

  env['LC_ALL'] = env['LC_ALL'] || 'C';
  env['LANG'] = env['LANG'] || 'C';

  env['PATH'] = `${pythonDir}${path.delimiter}${env['PATH'] || ''}`;

  const vsLibDir = path.join(path.dirname(pythonDir), 'lib');
  env['LD_LIBRARY_PATH'] = [vsLibDir, PATHS.PLUGINS, env['LD_LIBRARY_PATH']]
    .filter(Boolean)
    .join(path.delimiter);

  if (env['PYTHONHOME']) {
    delete env['PYTHONHOME'];
  }

  const venvRoot = path.dirname(pythonDir);
  const sitePackages = findSitePackagesInVenv(venvRoot);
  if (sitePackages) {
    env['PYTHONPATH'] = env['PYTHONPATH']
      ? `${sitePackages}${path.delimiter}${env['PYTHONPATH']}`
      : sitePackages;
  }

  const pluginDirs = getLinuxVsPluginSearchPaths();
  const combined = pluginDirs.join(path.delimiter);
  env['VS_PLUGINS_PATH'] = combined;
  env['VAPOURSYNTH_PLUGINS_PATH'] = combined;

  return env;
}
