import { describe, expect, it } from 'vitest';
import { parseLddMissingLibraries } from './nativeValidation';

describe('parseLddMissingLibraries', () => {
  it('extracts missing libraries from ldd output', () => {
    const output = [
      '\tlinux-vdso.so.1 (0x00007fff)',
      '\tlibonnxruntime.so.1.17.1 => not found',
      '\tlibstdc++.so.6 => /usr/lib/libstdc++.so.6 (0x00007f)',
      '\tlibamdhip64.so.6 => not found',
    ].join('\n');

    expect(parseLddMissingLibraries(output)).toEqual(['libonnxruntime.so.1.17.1', 'libamdhip64.so.6']);
  });
});
