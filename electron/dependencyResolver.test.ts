import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/tmp',
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
  },
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

import { parseVapourSynthVersion } from './dependencyResolver';

describe('parseVapourSynthVersion', () => {
  it('parses common R-prefixed version output', () => {
    expect(parseVapourSynthVersion('VapourSynth Video Processing Library R76')).toBe(76);
    expect(parseVapourSynthVersion('VapourSynth R78')).toBe(78);
  });

  it('parses version with whitespace around R', () => {
    expect(parseVapourSynthVersion('VapourSynth  R  70')).toBe(70);
  });

  it('accepts Arch/CachyOS R75 as the Linux runtime floor', () => {
    const v75 = parseVapourSynthVersion('VapourSynth Video Processing Library\nCore R75');
    expect(v75).toBe(75);
    expect(v75! >= 75).toBe(true);
  });

  it('rejects versions below 75', () => {
    const v70 = parseVapourSynthVersion('VapourSynth R70');
    expect(v70).toBe(70);
    expect(v70! < 75).toBe(true);
  });

  it('returns null for unrecognized output', () => {
    expect(parseVapourSynthVersion('vspipe unknown')).toBeNull();
    expect(parseVapourSynthVersion('')).toBeNull();
  });
});
