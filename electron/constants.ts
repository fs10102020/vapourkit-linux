import * as path from 'path';
import { exeName, libName, resolveAppDataPath } from './platform';

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

  // Executables (platform-aware)
  get VSPIPE() { return path.join(this.VS, exeName('vspipe')); },
  get PYTHON() { return path.join(this.VS, exeName('python')); },
  get TRTEXEC() { return path.join(this.MLRT_PLUGIN, exeName('trtexec')); },
  get VIDEO_COMPARE_EXE() { return path.join(this.VIDEO_COMPARE, exeName('video-compare')); },

  // FFmpeg
  FFMPEG_DIR: path.join(APP_DATA_PATH, 'ffmpeg'),
  get FFMPEG() { return path.join(this.FFMPEG_DIR, 'bin', exeName('ffmpeg')); },
  get FFPROBE() { return path.join(this.FFMPEG_DIR, 'bin', exeName('ffprobe')); },

  // Linux venv paths
  get VENV_PYTHON() { return path.join(this.PYTHON_VENV, 'bin', exeName('python')); },
  get VENV_VSVIEW() { return path.join(this.PYTHON_VENV, 'bin', 'vsview'); },
} as const;
