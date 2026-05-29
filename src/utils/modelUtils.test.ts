import { describe, it, expect } from 'vitest';
import {
  filterModels,
  getModelDisplayName,
  modelNeedsBuild,
  shouldShowBuildNotification,
  getEnabledAIModelPaths,
  getPortableModelName,
  resolvePortableModelName,
  resolveModelPathForBackend,
} from './modelUtils';
import type { ModelFile } from '../electron.d';

function makeModel(overrides: Partial<ModelFile> & { path: string; name: string; backend: ModelFile['backend'] }): ModelFile {
  return {
    hasEngine: false,
    ...overrides,
  } as ModelFile;
}

describe('filterModels', () => {
  const models: ModelFile[] = [
    makeModel({ path: 'a.engine', name: 'ModelA', backend: 'tensorrt', hasEngine: true }),
    makeModel({ path: 'b.onnx', name: 'ModelB', backend: 'onnx' }),
    makeModel({ path: 'c.onnx', name: 'ModelC', backend: 'onnx' }),
  ];

  it('shows only ONNX models in DirectML mode', () => {
    const result = filterModels(models, 'directml');
    expect(result.every(m => m.backend === 'onnx')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('shows all models in TensorRT mode', () => {
    const result = filterModels(models, 'tensorrt');
    expect(result).toHaveLength(3);
  });

  it('sorts TensorRT engines to the top', () => {
    const result = filterModels(models, 'tensorrt');
    expect(result[0].backend).toBe('tensorrt');
  });

  it('returns empty array when no models match', () => {
    const engineOnly = [makeModel({ path: 'a.engine', name: 'A', backend: 'tensorrt', hasEngine: true })];
    expect(filterModels(engineOnly, 'directml')).toHaveLength(0);
  });
});

describe('getModelDisplayName', () => {
  it('returns the model name when no display tag', () => {
    const model = makeModel({ path: 'a.onnx', name: 'MyModel', backend: 'onnx' });
    expect(getModelDisplayName(model, 'directml')).toBe('MyModel');
  });

  it('appends display tag in brackets', () => {
    const model = makeModel({ path: 'a.onnx', name: 'MyModel', backend: 'onnx', displayTag: '2x' } as any);
    expect(getModelDisplayName(model, 'directml')).toBe('MyModel [2x]');
  });

  it('adds [Unbuilt] prefix for ONNX without engine in TensorRT mode', () => {
    const model = makeModel({ path: 'a.onnx', name: 'MyModel', backend: 'onnx', hasEngine: false });
    expect(getModelDisplayName(model, 'tensorrt')).toBe('[Unbuilt] MyModel');
  });

  it('does not add [Unbuilt] in DirectML mode', () => {
    const model = makeModel({ path: 'a.onnx', name: 'MyModel', backend: 'onnx', hasEngine: false });
    expect(getModelDisplayName(model, 'directml')).toBe('MyModel');
  });
});

describe('modelNeedsBuild', () => {
  it('returns false for null model', () => {
    expect(modelNeedsBuild(null, 'tensorrt')).toBe(false);
  });

  it('returns false in DirectML mode', () => {
    const model = makeModel({ path: 'a.onnx', name: 'M', backend: 'onnx' });
    expect(modelNeedsBuild(model, 'directml')).toBe(false);
  });

  it('returns true for ONNX without engine in TensorRT mode', () => {
    const model = makeModel({ path: 'a.onnx', name: 'M', backend: 'onnx', hasEngine: false });
    expect(modelNeedsBuild(model, 'tensorrt')).toBe(true);
  });

  it('returns false for ONNX with engine in TensorRT mode', () => {
    const model = makeModel({ path: 'a.onnx', name: 'M', backend: 'onnx', hasEngine: true });
    expect(modelNeedsBuild(model, 'tensorrt')).toBe(false);
  });
});

describe('shouldShowBuildNotification', () => {
  it('returns false for null model', () => {
    expect(shouldShowBuildNotification(null, 'tensorrt')).toBe(false);
  });

  it('returns false in DirectML mode', () => {
    const model = makeModel({ path: 'a.onnx', name: 'M', backend: 'onnx' });
    expect(shouldShowBuildNotification(model, 'directml')).toBe(false);
  });

  it('returns true for any ONNX in TensorRT mode (allows rebuilding)', () => {
    const model = makeModel({ path: 'a.onnx', name: 'M', backend: 'onnx', hasEngine: true });
    expect(shouldShowBuildNotification(model, 'tensorrt')).toBe(true);
  });
});

describe('getEnabledAIModelPaths', () => {
  it('returns paths of enabled AI model filters', () => {
    const filters = [
      { enabled: true, filterType: 'aiModel', modelPath: '/a.onnx' },
      { enabled: false, filterType: 'aiModel', modelPath: '/b.onnx' },
      { enabled: true, filterType: 'custom' },
      { enabled: true, filterType: 'aiModel', modelPath: '/c.onnx' },
    ];
    expect(getEnabledAIModelPaths(filters)).toEqual(['/a.onnx', '/c.onnx']);
  });

  it('returns empty array when no AI model filters', () => {
    expect(getEnabledAIModelPaths([])).toEqual([]);
  });
});

describe('getPortableModelName', () => {
  it('extracts filename and removes extension', () => {
    expect(getPortableModelName('C:\\models\\RealESRGAN_x4.onnx')).toBe('RealESRGAN_x4');
  });

  it('removes _fp16 suffix', () => {
    expect(getPortableModelName('2x-AniRemaster_fp16.onnx')).toBe('2x-AniRemaster');
  });

  it('removes _fp32 suffix', () => {
    expect(getPortableModelName('2x-AniRemaster_fp32.engine')).toBe('2x-AniRemaster');
  });

  it('handles double precision suffix from engine builds', () => {
    expect(getPortableModelName('2x-AniRemaster_TSPAN_fp16_fp16.engine')).toBe('2x-AniRemaster_TSPAN');
  });

  it('handles forward slash paths', () => {
    expect(getPortableModelName('/home/user/models/Model_fp16.onnx')).toBe('Model');
  });

  it('handles bare filename without path', () => {
    expect(getPortableModelName('Model.onnx')).toBe('Model');
  });

  it('preserves names without precision suffix', () => {
    expect(getPortableModelName('2x-AnimeSharpV4_Fast.onnx')).toBe('2x-AnimeSharpV4_Fast');
  });
});

describe('resolvePortableModelName', () => {
  const models: ModelFile[] = [
    makeModel({ path: '/models/MyModel_fp16.onnx', name: 'MyModel_fp16', backend: 'onnx' }),
    makeModel({ path: '/models/MyModel_fp16_fp16.engine', name: 'MyModel_fp16_fp16', backend: 'tensorrt' }),
    makeModel({ path: '/models/Other.onnx', name: 'Other', backend: 'onnx' }),
  ];

  it('returns null for empty name', () => {
    expect(resolvePortableModelName('', models)).toBeNull();
  });

  it('returns null when no match found', () => {
    expect(resolvePortableModelName('NonExistent', models)).toBeNull();
  });

  it('prefers ONNX when backend is onnxruntime-cpu', () => {
    const result = resolvePortableModelName('MyModel', models, 'onnxruntime-cpu');
    expect(result).toBe('/models/MyModel_fp16.onnx');
  });

  it('prefers ONNX when backend is onnxruntime-cuda', () => {
    const result = resolvePortableModelName('MyModel', models, 'onnxruntime-cuda');
    expect(result).toBe('/models/MyModel_fp16.onnx');
  });

  it('prefers engine when backend is tensorrt', () => {
    const result = resolvePortableModelName('MyModel', models, 'tensorrt');
    expect(result).toBe('/models/MyModel_fp16_fp16.engine');
  });

  it('falls back to ONNX in tensorrt mode when no engine exists', () => {
    const result = resolvePortableModelName('Other', models, 'tensorrt');
    expect(result).toBe('/models/Other.onnx');
  });

  it('returns null for ONNX-only model when using ONNX backend', () => {
    const onnxOnly = [makeModel({ path: '/models/Only.onnx', name: 'Only', backend: 'onnx' })];
    expect(resolvePortableModelName('Only', onnxOnly, 'onnxruntime-cpu')).toBe('/models/Only.onnx');
  });

  it('returns null for engine-only model when using ONNX backend', () => {
    const engineOnly = [makeModel({ path: '/models/Only.engine', name: 'Only', backend: 'tensorrt' })];
    expect(resolvePortableModelName('Only', engineOnly, 'onnxruntime-cpu')).toBeNull();
  });
});

describe('resolveModelPathForBackend', () => {
  it('returns engine path unchanged for tensorrt', () => {
    expect(resolveModelPathForBackend('/models/a.engine', 'tensorrt')).toBe('/models/a.engine');
  });

  it('returns onnx path unchanged for onnx backends', () => {
    expect(resolveModelPathForBackend('/models/a.onnx', 'onnxruntime-cuda')).toBe('/models/a.onnx');
  });

  it('derives onnx from engine correctly for onnx backends', () => {
    expect(resolveModelPathForBackend('/models/a_fp16_fp16.engine', 'onnxruntime-cpu')).toBe('/models/a_fp16.onnx');
  });

  it('derives onnx from engine without extra suffix', () => {
    expect(resolveModelPathForBackend('/models/a_fp32_fp32.engine', 'onnxruntime-cuda')).toBe('/models/a_fp32.onnx');
  });

  it('returns bare path unchanged if extension is unknown', () => {
    expect(resolveModelPathForBackend('/models/a.pb', 'onnxruntime-cpu')).toBe('/models/a.pb');
  });
});
