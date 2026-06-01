export type InferenceBackend =
  | 'directml'
  | 'tensorrt'
  | 'onnxruntime-cuda'
  | 'onnxruntime-cpu';

export interface BackendCapabilityDiagnostics {
  onnxProviders?: string[];
  onnxRuntimeVersion?: string;
  onnxPluginPath?: string;
  onnxBuildInfo?: string;
  nvidiaGpuName?: string;
  nvidiaCudaVersion?: string;
  probeErrors?: {
    onnxRuntime?: string;
    tensorRt?: string;
    bestSource?: string;
  };
}

export interface BackendCapabilities {
  platform: NodeJS.Platform;
  cudaAvailable: boolean;
  nvidiaGpuAvailable: boolean;
  amdGpuAvailable?: boolean;
  intelGpuAvailable?: boolean;
  rocmRuntimeAvailable?: boolean;
  directmlAvailable: boolean;
  tensorrtAvailable: boolean;
  onnxRuntimeCudaAvailable: boolean;
  onnxRuntimeCpuAvailable: boolean;
  supportedBackends: InferenceBackend[];
  recommendedBackend: InferenceBackend;
  diagnostics?: BackendCapabilityDiagnostics;
}

export const BACKEND_LABELS: Record<InferenceBackend, string> = {
  'directml': 'DirectML (ONNX Runtime)',
  'tensorrt': 'TensorRT',
  'onnxruntime-cuda': 'ONNX Runtime CUDA',
  'onnxruntime-cpu': 'ONNX Runtime CPU',
};

export const BACKEND_SHORT_LABELS: Record<InferenceBackend, string> = {
  'directml': 'DML',
  'tensorrt': 'TRT',
  'onnxruntime-cuda': 'CUDA',
  'onnxruntime-cpu': 'CPU',
};

export function backendUsesBuiltArtifacts(backend: InferenceBackend): boolean {
  return backend === 'tensorrt';
}

export function backendPrefersEngines(backend: InferenceBackend): boolean {
  return backend === 'tensorrt';
}

export function backendUsesOnnx(backend: InferenceBackend): boolean {
  return backend !== 'tensorrt';
}

export function legacyDirectMLToBackend(useDirectML: boolean, onWindows: boolean): InferenceBackend {
  if (useDirectML) {
    return onWindows ? 'directml' : 'onnxruntime-cpu';
  }
  return 'tensorrt';
}

export function isInferenceBackend(value: unknown): value is InferenceBackend {
  return value === 'directml' ||
    value === 'tensorrt' ||
    value === 'onnxruntime-cuda' ||
    value === 'onnxruntime-cpu';
}

export function getDefaultBackend(caps: BackendCapabilities | null | undefined): InferenceBackend {
  return caps?.recommendedBackend || 'onnxruntime-cpu';
}

export function validateBackend(
  raw: unknown,
  caps: BackendCapabilities | null | undefined
): InferenceBackend {
  if (isInferenceBackend(raw) && caps?.supportedBackends?.includes(raw)) {
    return raw;
  }
  if (!caps && isInferenceBackend(raw)) {
    return raw;
  }
  return getDefaultBackend(caps);
}
