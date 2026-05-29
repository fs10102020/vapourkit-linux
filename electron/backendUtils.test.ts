import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before importing any file that loads it transitively
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
      file: {
        resolvePathFn: vi.fn(),
        level: 'info',
        maxSize: 10 * 1024 * 1024,
        format: '',
      },
      console: {
        level: 'info',
        format: '',
      },
    },
  },
}));

vi.mock('./constants', () => ({
  VS_MLRT_VERSION: '15.13',
  PATHS: {
    APP_DATA: '/tmp/data',
    VS: '/tmp/data/vapoursynth-portable',
    PLUGINS: '/tmp/data/vapoursynth-portable/vs-plugins',
    MLRT_PLUGIN: '/tmp/data/vapoursynth-portable/vs-plugins/vsmlrt-cuda',
    MODELS: '/tmp/data/models',
    CONFIG: '/tmp/data/config',
    VSPIPE: 'vspipe',
    PYTHON: 'python',
    TRTEXEC: 'trtexec',
  },
}));

vi.mock('./platform', async () => {
  const actual = await vi.importActual<typeof import('./platform')>('./platform');
  return {
    ...actual,
    isLinux: true,
    isWindows: false,
    executableExists: vi.fn((p: string) => p === 'trtexec'),
  };
});

import { normalizeBackend, resolveModelPathForBackend } from './backendUtils';

describe('normalizeBackend', () => {
  it('returns the backend when supported', () => {
    expect(normalizeBackend('tensorrt', ['tensorrt', 'onnxruntime-cpu'])).toBe('tensorrt');
  });

  it('falls back to tensorrt when available', () => {
    expect(normalizeBackend('unknown', ['tensorrt', 'onnxruntime-cpu'])).toBe('tensorrt');
  });

  it('falls back to onnxruntime-cuda when tensorrt unavailable', () => {
    expect(normalizeBackend('unknown', ['onnxruntime-cuda', 'onnxruntime-cpu'])).toBe('onnxruntime-cuda');
  });

  it('falls back to directml when available', () => {
    expect(normalizeBackend('unknown', ['directml', 'onnxruntime-cpu'])).toBe('directml');
  });

  it('ultimate fallback is onnxruntime-cpu', () => {
    expect(normalizeBackend('unknown', ['onnxruntime-cpu'])).toBe('onnxruntime-cpu');
  });
});

describe('resolveModelPathForBackend', () => {
  it('returns engine path for tensorrt', () => {
    expect(resolveModelPathForBackend('/models/a.engine', 'tensorrt')).toBe('/models/a.engine');
  });

  it('returns onnx path for onnxruntime-cuda', () => {
    expect(resolveModelPathForBackend('/models/a.onnx', 'onnxruntime-cuda')).toBe('/models/a.onnx');
  });

  it('derives onnx from engine for onnx backends', () => {
    expect(resolveModelPathForBackend('/models/a_fp16_fp16.engine', 'onnxruntime-cpu')).toBe('/models/a_fp16.onnx');
  });
});
