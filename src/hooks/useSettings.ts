import { useState, useEffect, useCallback } from 'react';
import type { InferenceBackend, BackendCapabilities } from '../electron.d';

export function getDefaultBackend(caps: BackendCapabilities | null | undefined): InferenceBackend {
  if (caps?.recommendedBackend) {
    return caps.recommendedBackend;
  }
  // Fallback when capabilities are not yet loaded
  const isWindows = typeof navigator !== 'undefined' && /Win/.test(navigator.platform);
  return isWindows ? 'directml' : 'onnxruntime-cpu';
}

function isInferenceBackend(value: unknown): value is InferenceBackend {
  return value === 'directml' ||
    value === 'tensorrt' ||
    value === 'onnxruntime-cuda' ||
    value === 'onnxruntime-cpu';
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

export const useSettings = (backendCapabilities?: BackendCapabilities | null) => {
  const [backendState, setBackendState] = useState<InferenceBackend>(() => {
    const saved = localStorage.getItem('inferenceBackend');
    if (saved) {
      try {
        return validateBackend(JSON.parse(saved), null); // validate against caps once they load
      } catch {
        // corrupt JSON, fall through
      }
    }
    const oldDml = localStorage.getItem('useDirectML');
    if (oldDml !== null) {
      try {
        const useDirectML = JSON.parse(oldDml);
        if (useDirectML) {
          return validateBackend('directml', null);
        }
        return validateBackend('tensorrt', null);
      } catch {
        // ignore
      }
    }
    return getDefaultBackend(null);
  });

  const [numStreams, setNumStreams] = useState(() => {
    const saved = localStorage.getItem('numStreams');
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      return isNaN(parsed) ? 2 : parsed;
    }
    return 2;
  });

  // Re-validate backend whenever capabilities are known / change
  useEffect(() => {
    if (backendCapabilities) {
      const saved = localStorage.getItem('inferenceBackend');
      if (saved !== null) {
        try {
          const parsed = JSON.parse(saved) as InferenceBackend;
          const valid = validateBackend(parsed, backendCapabilities);
          if (valid !== parsed) {
            setBackendState(valid);
            localStorage.setItem('inferenceBackend', JSON.stringify(valid));
          } else {
            setBackendState(valid);
          }
          return;
        } catch {
          // corrupt saved value
        }
      }
      // No saved value or corrupt: default to recommended
      const defaultBackend = getDefaultBackend(backendCapabilities);
      setBackendState(defaultBackend);
      localStorage.setItem('inferenceBackend', JSON.stringify(defaultBackend));
    }
  }, [backendCapabilities]);

  useEffect(() => {
    localStorage.setItem('inferenceBackend', JSON.stringify(backendState));
    localStorage.removeItem('useDirectML');
  }, [backendState]);

  useEffect(() => {
    localStorage.setItem('numStreams', numStreams.toString());
  }, [numStreams]);

  const setBackendAndPersist = useCallback((value: InferenceBackend): void => {
    setBackendState(value);
  }, []);

  const updateNumStreams = useCallback((value: number): void => {
    setNumStreams(value);
  }, []);

  return {
    backend: backendState,
    setBackend: setBackendAndPersist,
    numStreams,
    updateNumStreams,
  };
};
