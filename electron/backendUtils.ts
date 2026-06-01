import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';
import { PATHS } from './constants';
import { isLinux, isWindows, platformSpawnOptions, resolveCommandPath } from './platform';
import { buildLinuxVsEnvironment } from './vsEnvironment';
import { detectGpuCapabilities } from './gpuDetection';

export interface BackendProbeResult {
  /** Whether the core plugin is loadable by vspipe */
  pluginLoadable: boolean;
  /** Optional error message from the probe */
  error?: string;
}

export interface OnnxRuntimeProbeResult extends BackendProbeResult {
  providers: string[];
  onnxRuntimeVersion?: string;
  buildInfo?: string;
  pluginPath?: string;
}

export function parseOnnxRuntimeVersionOutput(output: string): Omit<OnnxRuntimeProbeResult, 'pluginLoadable'> {
  const parsed = JSON.parse(output.trim());
  return {
    providers: Array.isArray(parsed.providers) ? parsed.providers.filter((p: unknown) => typeof p === 'string') : [],
    onnxRuntimeVersion: typeof parsed.onnxRuntimeVersion === 'string' ? parsed.onnxRuntimeVersion : undefined,
    buildInfo: typeof parsed.buildInfo === 'string' ? parsed.buildInfo : undefined,
    pluginPath: typeof parsed.pluginPath === 'string' ? parsed.pluginPath : undefined,
  };
}

/**
 * Runs a minimal VapourSynth script via vspipe to check whether a given
 * core plugin (e.g. core.ort, core.trt, core.bs) can be loaded.
 */
export async function probeVapourSynthPlugin(
  pluginName: string,
  pythonPath?: string
): Promise<BackendProbeResult> {
  const vspipe = PATHS.VSPIPE;
  const py = pythonPath || PATHS.PYTHON;
  const namespace = pluginName.replace(/^core\./, '');

  const script = [
    'import vapoursynth as vs',
    'core = vs.core',
    `getattr(core, ${JSON.stringify(namespace)})`,
    'clip = core.std.BlankClip(width=16, height=16, length=1, format=vs.RGB24)',
    'clip.set_output()',
    '',
  ].join('\n');

  // Write script to temp file so we don't depend on stdin support
  const fs = require('fs');
  const tmpDir = path.join(os.tmpdir(), 'vapourkit-probes');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `probe-${namespace}-${Date.now()}.vpy`);
  fs.writeFileSync(tmpFile, script);

  return new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (result: BackendProbeResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try { fs.unlinkSync(tmpFile); } catch {}
      resolve(result);
    };

    const env = isLinux ? buildLinuxVsEnvironment(py) : { ...process.env };

    resolveCommandPath(vspipe, env).then((resolvedVspipe) => {
      if (!resolvedVspipe) {
        finish({ pluginLoadable: false, error: `vspipe not found: ${vspipe}` });
        return;
      }

      const proc = spawn(resolvedVspipe, [tmpFile, '-'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        ...platformSpawnOptions(),
      });

      let stderr = '';

      proc.stdout?.resume();
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code === 0) {
          finish({ pluginLoadable: true });
        } else {
          const err = stderr.trim() || `vspipe exited with code ${code}`;
          finish({ pluginLoadable: false, error: err });
        }
      });

      proc.on('error', (err) => {
        finish({ pluginLoadable: false, error: err.message });
      });

      timeout = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        finish({ pluginLoadable: false, error: 'Probe timed out' });
      }, 10000);
    }).catch((error) => finish({ pluginLoadable: false, error: error instanceof Error ? error.message : String(error) }));
  });
}

/**
 * Probes whether the ONNX Runtime VapourSynth plugin (core.ort) is functional.
 * On Linux this checks the actual vsort shared object via vspipe; on Windows it
 * checks the bundled DLL.
 */
export async function probeOnnxRuntime(pythonPath?: string): Promise<BackendProbeResult> {
  if (isLinux) {
    return probeVapourSynthPlugin('core.ort', pythonPath);
  }
  // Windows: rely on bundled DLL existence (probed during setup)
  const fs = require('fs');
  const dllPath = path.join(PATHS.PLUGINS, 'vsort.dll');
  return { pluginLoadable: fs.existsSync(dllPath) };
}

export async function probeOnnxRuntimeCapabilities(pythonPath?: string): Promise<OnnxRuntimeProbeResult> {
  if (!isLinux) {
    const probe = await probeOnnxRuntime(pythonPath);
    return { ...probe, providers: [] };
  }

  const py = pythonPath || PATHS.PYTHON;
  const script = [
    'import json',
    'import vapoursynth as vs',
    'core = vs.core',
    'version = core.ort.Version()',
    'def normalize(value):',
    '    if value is None:',
    '        return None',
    '    if isinstance(value, bytes):',
    '        return value.decode("utf-8", "replace")',
    '    if isinstance(value, (list, tuple)):',
    '        return [normalize(v) for v in value]',
    '    return str(value)',
    'providers = normalize(version.get("providers", []))',
    'if providers is None:',
    '    providers = []',
    'elif isinstance(providers, str):',
    '    providers = [providers]',
    'print(json.dumps({',
    '    "providers": providers,',
    '    "onnxRuntimeVersion": normalize(version.get("onnxruntime_version")),',
    '    "buildInfo": normalize(version.get("onnxruntime_build_info")),',
    '    "pluginPath": normalize(version.get("path")),',
    '}))',
    '',
  ].join('\n');

  return new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (result: OnnxRuntimeProbeResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };

    const probeEnv = path.isAbsolute(py) ? buildLinuxVsEnvironment(py) : process.env;

    resolveCommandPath(py, probeEnv).then((resolvedPython) => {
      if (!resolvedPython) {
        finish({ pluginLoadable: false, providers: [], error: `Python not found: ${py}` });
        return;
      }

      const proc = spawn(resolvedPython, ['-c', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildLinuxVsEnvironment(resolvedPython),
        ...platformSpawnOptions(),
      });

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          finish({ pluginLoadable: false, providers: [], error: stderr.trim() || `python exited with code ${code}` });
          return;
        }
        try {
          finish({ pluginLoadable: true, ...parseOnnxRuntimeVersionOutput(stdout) });
        } catch (error) {
          finish({ pluginLoadable: false, providers: [], error: `Could not parse core.ort.Version() output: ${error}` });
        }
      });

      proc.on('error', (err) => finish({ pluginLoadable: false, providers: [], error: err.message }));
      timeout = setTimeout(() => {
        try { proc.kill(); } catch {}
        finish({ pluginLoadable: false, providers: [], error: 'ONNX Runtime version probe timed out' });
      }, 10000);
    }).catch((error) => finish({ pluginLoadable: false, providers: [], error: error instanceof Error ? error.message : String(error) }));
  });
}

/**
 * Probes whether the TensorRT VapourSynth plugin (core.trt) is functional.
 */
export async function probeTensorRT(pythonPath?: string): Promise<BackendProbeResult> {
  if (isLinux) {
    return probeVapourSynthPlugin('core.trt', pythonPath);
  }
  const fs = require('fs');
  const dllPath = path.join(PATHS.MLRT_PLUGIN, 'vstrt.dll');
  return { pluginLoadable: fs.existsSync(dllPath) };
}

/**
 * Probes whether the BestSource plugin (core.bs) is functional.
 */
export async function probeBestSource(pythonPath?: string): Promise<BackendProbeResult> {
  if (isLinux) {
    return probeVapourSynthPlugin('core.bs', pythonPath);
  }
  const fs = require('fs');
  const dllPath = path.join(PATHS.PLUGINS, 'bestsource.dll');
  return { pluginLoadable: fs.existsSync(dllPath) };
}

export interface RuntimeCapabilityStatus {
  cudaAvailable: boolean;
  nvidiaGpuAvailable: boolean;
  amdGpuAvailable: boolean;
  intelGpuAvailable: boolean;
  rocmRuntimeAvailable: boolean;
  directmlAvailable: boolean;
  /** core.trt loadable (not just trtexec on PATH) */
  tensorrtRuntimeAvailable: boolean;
  /** trtexec available for engine building */
  tensorrtBuilderAvailable: boolean;
  /** core.ort loadable */
  onnxRuntimeAvailable: boolean;
  onnxRuntimeCudaAvailable: boolean;
  onnxRuntimeCpuAvailable: boolean;
  /** core.bs loadable */
  bestSourceAvailable: boolean;
  supportedBackends: ('directml' | 'tensorrt' | 'onnxruntime-cuda' | 'onnxruntime-cpu')[];
  recommendedBackend: 'directml' | 'tensorrt' | 'onnxruntime-cuda' | 'onnxruntime-cpu';
  /** Diagnostic details surfaced to the renderer */
  onnxProviders: string[];
  onnxRuntimeVersion?: string;
  onnxPluginPath?: string;
  onnxBuildInfo?: string;
  nvidiaGpuName?: string;
  nvidiaCudaVersion?: string;
  probeErrors: {
    onnxRuntime?: string;
    tensorRt?: string;
    bestSource?: string;
  };
}

/**
 * Returns true when trtexec is available on PATH or in the bundled location.
 */
export function isTrtexecAvailable(): boolean {
  const { executableExists } = require('./platform');
  return executableExists(PATHS.TRTEXEC);
}

/**
 * Normalizes a backend string to a supported InferenceBackend.
 * Falls back to 'onnxruntime-cpu' when the requested backend is unavailable
 * or unsupported on the current platform.
 */
export function normalizeBackend(
  raw: string | undefined,
  supported: string[]
): 'directml' | 'tensorrt' | 'onnxruntime-cuda' | 'onnxruntime-cpu' {
  const valid = raw as any;
  if (valid && supported.includes(valid)) {
    return valid;
  }
  if (supported.includes('tensorrt')) return 'tensorrt';
  if (supported.includes('onnxruntime-cuda')) return 'onnxruntime-cuda';
  if (supported.includes('directml')) return 'directml';
  return 'onnxruntime-cpu';
}

/**
 * Returns the correct model path string for script generation given a backend.
 * ONNX backends refuse engine paths; TensorRT prefers engines.
 */
export function resolveModelPathForBackend(
  modelPath: string,
  backend: string
): string {
  const isEngine = modelPath.toLowerCase().endsWith('.engine');
  const isOnnx = modelPath.toLowerCase().endsWith('.onnx');

  if (backend === 'tensorrt') {
    return modelPath;
  }

  // ONNX backends
  if (isOnnx) {
    return modelPath;
  }
  if (isEngine) {
    // Derive the ONNX path from the engine path correctly:
    // e.g. model_fp16_fp16.engine -> model_fp16.onnx (strip one precision suffix)
    let onnxPath = modelPath.replace(/\.engine$/i, '.onnx');
    // Strip the extra _fp16 that engine builds add
    onnxPath = onnxPath.replace(/_fp(16|32)(?=_fp(16|32)\.onnx$)/i, '');
    return onnxPath;
  }

  return modelPath;
}

/**
 * Performs full runtime probing and returns a structured capability report.
 */
export async function getRuntimeCapabilities(): Promise<RuntimeCapabilityStatus> {
  const { detectCudaSupport } = require('./utils');
  const hasCuda = await detectCudaSupport();
  const gpuCaps = isLinux
    ? await detectGpuCapabilities()
    : { nvidia: { available: hasCuda, name: undefined, cudaVersion: undefined }, amd: { available: false, rocmRuntimeAvailable: false }, intel: { available: false } };

  const onnxProbe = await probeOnnxRuntimeCapabilities();
  const trtProbe = await probeTensorRT();
  const bsProbe = await probeBestSource();

  const builderAvailable = isTrtexecAvailable();

  const tensorrtRuntimeAvailable = trtProbe.pluginLoadable;
  const onnxRuntimeAvailable = onnxProbe.pluginLoadable;
  const directmlAvailable = isWindows && onnxRuntimeAvailable;
  const bestSourceAvailable = bsProbe.pluginLoadable;
  const onnxProviders = new Set(onnxProbe.providers.map(provider => provider.toUpperCase()));
  const onnxRuntimeCudaAvailable = onnxRuntimeAvailable && hasCuda && (!isLinux || onnxProviders.has('CUDA'));

  const supportedBackends: RuntimeCapabilityStatus['supportedBackends'] = [];
  if (directmlAvailable) supportedBackends.push('directml');
  if (tensorrtRuntimeAvailable && builderAvailable) supportedBackends.push('tensorrt');
  if (onnxRuntimeCudaAvailable) supportedBackends.push('onnxruntime-cuda');
  if (onnxRuntimeAvailable) supportedBackends.push('onnxruntime-cpu');

  let recommendedBackend: RuntimeCapabilityStatus['recommendedBackend'];
  if (isLinux) {
    recommendedBackend = tensorrtRuntimeAvailable && builderAvailable
      ? 'tensorrt'
      : (onnxRuntimeCudaAvailable ? 'onnxruntime-cuda' : 'onnxruntime-cpu');
  } else {
    recommendedBackend = tensorrtRuntimeAvailable && builderAvailable
      ? 'tensorrt'
      : (directmlAvailable ? 'directml' : 'onnxruntime-cpu');
  }

  logger.info(`Runtime capabilities: CUDA=${hasCuda}, AMD=${gpuCaps.amd.available}, ROCm=${gpuCaps.amd.rocmRuntimeAvailable}, TRT=${tensorrtRuntimeAvailable}, ONNX=${onnxRuntimeAvailable}, ONNX providers=${onnxProbe.providers.join(',') || 'none'}, BS=${bestSourceAvailable}, trtexec=${builderAvailable}`);
  if (onnxProbe.onnxRuntimeVersion) logger.info(`ONNX Runtime version: ${onnxProbe.onnxRuntimeVersion}`);
  if (onnxProbe.pluginPath) logger.info(`ONNX Runtime plugin path: ${onnxProbe.pluginPath}`);
  if (onnxProbe.error) logger.warn(`ONNX Runtime probe error: ${onnxProbe.error}`);
  if (trtProbe.error) logger.warn(`TensorRT probe error: ${trtProbe.error}`);
  if (bsProbe.error) logger.warn(`BestSource probe error: ${bsProbe.error}`);

  return {
    cudaAvailable: hasCuda,
    nvidiaGpuAvailable: gpuCaps.nvidia.available,
    amdGpuAvailable: gpuCaps.amd.available,
    intelGpuAvailable: gpuCaps.intel.available,
    rocmRuntimeAvailable: gpuCaps.amd.rocmRuntimeAvailable,
    directmlAvailable,
    tensorrtRuntimeAvailable,
    tensorrtBuilderAvailable: builderAvailable,
    onnxRuntimeAvailable,
    onnxRuntimeCudaAvailable,
    onnxRuntimeCpuAvailable: onnxRuntimeAvailable,
    bestSourceAvailable,
    supportedBackends,
    recommendedBackend,
    onnxProviders: onnxProbe.providers,
    onnxRuntimeVersion: onnxProbe.onnxRuntimeVersion,
    onnxPluginPath: onnxProbe.pluginPath,
    onnxBuildInfo: onnxProbe.buildInfo,
    nvidiaGpuName: gpuCaps.nvidia.name,
    nvidiaCudaVersion: gpuCaps.nvidia.cudaVersion,
    probeErrors: {
      onnxRuntime: onnxProbe.error,
      tensorRt: trtProbe.error,
      bestSource: bsProbe.error,
    },
  };
}
