export type InferenceBackend =
  | 'directml'
  | 'tensorrt'
  | 'onnxruntime-cuda'
  | 'onnxruntime-cpu';

export interface BackendCapabilities {
  platform: NodeJS.Platform;
  cudaAvailable: boolean;
  nvidiaGpuAvailable: boolean;
  directmlAvailable: boolean;
  tensorrtAvailable: boolean;
  onnxRuntimeCudaAvailable: boolean;
  onnxRuntimeCpuAvailable: boolean;
  supportedBackends: InferenceBackend[];
  recommendedBackend: InferenceBackend;
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
