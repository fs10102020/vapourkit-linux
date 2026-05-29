import { describe, it, expect } from 'vitest';
import { getDefaultBackend, validateBackend } from './useSettings';
import type { BackendCapabilities } from '../electron.d';

describe('getDefaultBackend', () => {
  it('returns recommendedBackend from capabilities when present', () => {
    const caps: BackendCapabilities = {
      platform: 'linux',
      cudaAvailable: true,
      nvidiaGpuAvailable: true,
      directmlAvailable: false,
      tensorrtAvailable: true,
      onnxRuntimeCudaAvailable: true,
      onnxRuntimeCpuAvailable: true,
      supportedBackends: ['tensorrt', 'onnxruntime-cuda', 'onnxruntime-cpu'],
      recommendedBackend: 'onnxruntime-cuda',
    };
    expect(getDefaultBackend(caps)).toBe('onnxruntime-cuda');
  });

  it('falls back to directml on Windows when no caps', () => {
    // On this Linux test runner, navigator.platform is Linux, so default is onnxruntime-cpu
    const expected = typeof navigator !== 'undefined' && /Win/.test(navigator.platform) ? 'directml' : 'onnxruntime-cpu';
    expect(getDefaultBackend(null)).toBe(expected);
  });
});

describe('validateBackend', () => {
  const caps: BackendCapabilities = {
    platform: 'linux',
    cudaAvailable: false,
    nvidiaGpuAvailable: false,
    directmlAvailable: false,
    tensorrtAvailable: false,
    onnxRuntimeCudaAvailable: false,
    onnxRuntimeCpuAvailable: true,
    supportedBackends: ['onnxruntime-cpu'],
    recommendedBackend: 'onnxruntime-cpu',
  };

  it('returns the backend when it is supported', () => {
    expect(validateBackend('onnxruntime-cpu', caps)).toBe('onnxruntime-cpu');
  });

  it('returns default when backend is unsupported', () => {
    expect(validateBackend('tensorrt', caps)).toBe('onnxruntime-cpu');
  });

  it('remaps directml to onnxruntime-cpu on Linux', () => {
    expect(validateBackend('directml', caps)).toBe('onnxruntime-cpu');
  });
});
