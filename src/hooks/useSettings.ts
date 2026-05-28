import { useState, useEffect, useCallback } from 'react';
import type { InferenceBackend } from '../electron.d';

export const useSettings = (hasCudaSupport: boolean | null, isWindows: boolean) => {
  const [backend, setBackend] = useState<InferenceBackend>(() => {
    // Try new key first
    const saved = localStorage.getItem('inferenceBackend');
    if (saved) {
      try { return JSON.parse(saved) as InferenceBackend; } catch {}
    }
    // Migrate old useDirectML key
    const oldDml = localStorage.getItem('useDirectML');
    if (oldDml !== null) {
      const useDirectML = JSON.parse(oldDml);
      if (useDirectML) {
        return isWindows ? 'directml' : 'onnxruntime-cpu';
      }
      return 'tensorrt';
    }
    // Default
    if (isWindows) {
      return hasCudaSupport ? 'tensorrt' : 'directml';
    }
    return hasCudaSupport ? 'tensorrt' : 'onnxruntime-cpu';
  });

  const [numStreams, setNumStreams] = useState(() => {
    const saved = localStorage.getItem('numStreams');
    if (saved !== null) {
      return parseInt(saved, 10);
    }
    return 2;
  });

  useEffect(() => {
    if (hasCudaSupport !== null) {
      const saved = localStorage.getItem('inferenceBackend');
      if (saved === null) {
        const defaultBackend: InferenceBackend = isWindows
          ? (hasCudaSupport ? 'tensorrt' : 'directml')
          : (hasCudaSupport ? 'tensorrt' : 'onnxruntime-cpu');
        setBackend(defaultBackend);
        localStorage.setItem('inferenceBackend', JSON.stringify(defaultBackend));
      }
    }
  }, [hasCudaSupport, isWindows]);

  useEffect(() => {
    localStorage.setItem('inferenceBackend', JSON.stringify(backend));
    localStorage.removeItem('useDirectML');
  }, [backend]);

  useEffect(() => {
    localStorage.setItem('numStreams', numStreams.toString());
  }, [numStreams]);

  const setBackendAndPersist = useCallback((value: InferenceBackend): void => {
    setBackend(value);
  }, []);

  const updateNumStreams = useCallback((value: number): void => {
    setNumStreams(value);
  }, []);

  return {
    backend,
    setBackend: setBackendAndPersist,
    numStreams,
    updateNumStreams,
  };
};
