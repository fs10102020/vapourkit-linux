import { describe, it, expect, vi } from 'vitest';

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
      file: { resolvePathFn: vi.fn(), level: 'info', maxSize: 10 * 1024 * 1024, format: '' },
      console: { level: 'info', format: '' },
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
  };
});

import { VsMlrtLinuxBuilder } from './vsMlrtLinuxBuilder';

describe('VsMlrtLinuxBuilder.detectBuildTools', () => {
  it('returns status for all required tools', async () => {
    const tools = await VsMlrtLinuxBuilder.detectBuildTools();
    expect(tools.length).toBe(5);
    expect(tools.map(t => t.name)).toEqual(['cmake', 'ninja', 'git', 'gcc', 'g++']);
  });
});

describe('VsMlrtLinuxBuilder.isBuildEnvironmentReady', () => {
  it('returns true when all required tools are found', () => {
    const tools = [
      { name: 'cmake', found: true },
      { name: 'ninja', found: true },
      { name: 'git', found: true },
      { name: 'gcc', found: true },
      { name: 'g++', found: true },
    ] as any;
    expect(VsMlrtLinuxBuilder.isBuildEnvironmentReady(tools)).toBe(true);
  });

  it('returns false when ninja is missing', () => {
    const tools = [
      { name: 'cmake', found: true },
      { name: 'ninja', found: false },
      { name: 'git', found: true },
      { name: 'gcc', found: true },
      { name: 'g++', found: true },
    ] as any;
    expect(VsMlrtLinuxBuilder.isBuildEnvironmentReady(tools)).toBe(false);
  });

  it('returns false when cmake is missing', () => {
    const tools = [
      { name: 'cmake', found: false },
      { name: 'ninja', found: true },
      { name: 'git', found: true },
      { name: 'gcc', found: true },
      { name: 'g++', found: true },
    ] as any;
    expect(VsMlrtLinuxBuilder.isBuildEnvironmentReady(tools)).toBe(false);
  });

  it('returns false when gcc is missing', () => {
    const tools = [
      { name: 'cmake', found: true },
      { name: 'ninja', found: true },
      { name: 'git', found: true },
      { name: 'gcc', found: false },
      { name: 'g++', found: true },
    ] as any;
    expect(VsMlrtLinuxBuilder.isBuildEnvironmentReady(tools)).toBe(false);
  });
});

describe('VsMlrtLinuxBuilder.getBuildToolGuide', () => {
  it('mentions missing tools in the guide', () => {
    const guide = VsMlrtLinuxBuilder.getBuildToolGuide(['cmake', 'gcc']);
    expect(guide).toContain('cmake');
    expect(guide).toContain('gcc');
    expect(guide).toContain('pacman');
    expect(guide).toContain('apt');
    expect(guide).toContain('dnf');
  });
});

describe('VsMlrtLinuxBuilder.buildAndInstall', () => {
  it('throws when build environment is not ready', async () => {
    vi.spyOn(VsMlrtLinuxBuilder, 'detectBuildTools').mockResolvedValue([
      { name: 'cmake', found: false },
      { name: 'ninja', found: false },
      { name: 'git', found: false },
      { name: 'gcc', found: false },
      { name: 'g++', found: false },
    ] as any);

    const builder = new VsMlrtLinuxBuilder();
    await expect(builder.buildAndInstall()).rejects.toThrow('cmake');
  });
});
