import * as path from 'path';
import { exeName, libName, resolveAppDataPath, executablePath, isLinux } from './platform';
import { getLinuxPythonPath, isFlatpak } from './linuxRuntime';

export const VS_MLRT_VERSION = '15.13';

export const APP_DATA_PATH = resolveAppDataPath();

export const PATHS = {
  APP_DATA: APP_DATA_PATH,
  VS: path.join(APP_DATA_PATH, 'vapoursynth-portable'),
  PLUGINS: path.join(APP_DATA_PATH, 'vapoursynth-portable', 'vs-plugins'),
  SCRIPTS: path.join(APP_DATA_PATH, 'vapoursynth-portable', 'vs-scripts'),
  MLRT_PLUGIN: path.join(APP_DATA_PATH, 'vapoursynth-portable', 'vs-plugins', 'vsmlrt-cuda'),
  MODELS: path.join(APP_DATA_PATH, 'models'),
  CONFIG: path.join(APP_DATA_PATH, 'config'),
  VIDEO_COMPARE: path.join(APP_DATA_PATH, 'video-compare'),
  FILTER_TEMPLATES: path.join(APP_DATA_PATH, 'config', 'filter-templates'),
  PIP_CACHE: path.join(APP_DATA_PATH, 'pip-cache'),
  PYTHON_VENV: path.join(APP_DATA_PATH, 'python-venv'),

  // Executables (platform-aware - Linux uses system PATH fallback)
  get VSPIPE() { return executablePath(path.join(this.VS, exeName('vspipe')), 'vspipe'); },
  get PYTHON() { return isLinux ? getLinuxPythonPath() : path.join(this.VS, exeName('python')); },
  get TRTEXEC() { return executablePath(path.join(this.MLRT_PLUGIN, exeName('trtexec')), 'trtexec'); },
  get VIDEO_COMPARE_EXE() { return executablePath(path.join(this.VIDEO_COMPARE, exeName('video-compare')), 'video-compare'); },

  // FFmpeg
  FFMPEG_DIR: path.join(APP_DATA_PATH, 'ffmpeg'),
  get FFMPEG() { return executablePath(path.join(this.FFMPEG_DIR, 'bin', exeName('ffmpeg')), 'ffmpeg'); },
  get FFPROBE() { return executablePath(path.join(this.FFMPEG_DIR, 'bin', exeName('ffprobe')), 'ffprobe'); },

  // Linux venv paths
  get VENV_PYTHON() { return isFlatpak() ? '/app/python-venv/bin/python' : path.join(this.PYTHON_VENV, 'bin', exeName('python')); },
  get VENV_VSVIEW() { return isFlatpak() ? '/app/python-venv/bin/vsview' : path.join(this.PYTHON_VENV, 'bin', 'vsview'); },
} as const;
