import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/tmp',
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
  },
  BrowserWindow: class BrowserWindow {},
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: {
      file: { resolvePathFn: vi.fn(), level: 'info', maxSize: 10 * 1024 * 1024, format: '' },
      console: { level: 'info', format: '' },
    },
  },
}));

vi.mock('./sevenZip', () => ({ default: {}, unpack: () => {}, pack: () => {}, list: () => {}, cmd: () => {} }));
vi.mock('7zip-min', () => ({}));

vi.mock('./constants', () => ({
  PATHS: {
    APP_DATA: '/tmp/data',
    VS: '/tmp/data/vapoursynth-portable',
    PYTHON: 'python',
    PIP_CACHE: '/tmp/data/pip-cache',
    CONFIG: '/tmp/data/config',
    PLUGINS: '/tmp/data/vapoursynth-portable/vs-plugins',
    SCRIPTS: '/tmp/data/vapoursynth-portable/vs-scripts',
    FILTER_TEMPLATES: '/tmp/data/vapoursynth-portable/vs-plugins/plugin_filters',
  },
}));

import { selectPyTorchCudaWheel } from './pluginInstaller';

describe('selectPyTorchCudaWheel', () => {
  it('selects an exact CUDA wheel match', () => {
    expect(selectPyTorchCudaWheel('12.8')?.indexUrl).toContain('cu128');
  });

  it('selects the highest wheel not newer than the detected CUDA runtime', () => {
    expect(selectPyTorchCudaWheel('12.9')?.indexUrl).toContain('cu128');
    expect(selectPyTorchCudaWheel('12.5')?.indexUrl).toContain('cu124');
  });

  it('falls back to older compatible CUDA wheels when needed', () => {
    expect(selectPyTorchCudaWheel('12.0')?.indexUrl).toContain('cu118');
  });

  it('returns null when no compatible CUDA wheel exists', () => {
    expect(selectPyTorchCudaWheel('11.7')).toBeNull();
    expect(selectPyTorchCudaWheel(undefined)).toBeNull();
    expect(selectPyTorchCudaWheel('unknown')).toBeNull();
  });
});
