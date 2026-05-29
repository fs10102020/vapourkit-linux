import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';
import { PATHS } from './constants';
import { isLinux, isWindows, platformSpawnOptions } from './platform';
import { getLinuxVsPluginSearchPaths } from './linuxRuntime';

export interface BackendProbeResult {
  /** Whether the core plugin is loadable by vspipe */
  pluginLoadable: boolean;
  /** Optional error message from the probe */
  error?: string;
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
    let timeout: NodeJS.Timeout;
    const finish = (result: BackendProbeResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try { fs.unlinkSync(tmpFile); } catch {}
      resolve(result);
    };

    const env = { ...process.env };
    if (isLinux) {
      // Ensure vspipe can find Python packages installed in our venv
      const pythonDir = path.dirname(py);
      env['PATH'] = `${pythonDir}${path.delimiter}${env['PATH'] || ''}`;

      // Merge plugin paths so system vspipe sees app-data plugins
      const pluginDirs = getLinuxVsPluginSearchPaths().join(path.delimiter);
      env['VS_PLUGINS_PATH'] = pluginDirs;
      env['VAPOURSYNTH_PLUGINS_PATH'] = pluginDirs;

      // Expose venv site-packages for Python imports
      const venvRoot = path.dirname(pythonDir);
      const sitePackagesCandidates = [
        path.join(venvRoot, 'lib', 'python3.13', 'site-packages'),
        path.join(venvRoot, 'lib', 'python3.12', 'site-packages'),
        path.join(venvRoot, 'lib', 'python3.11', 'site-packages'),
        path.join(venvRoot, 'lib', 'python3.10', 'site-packages'),
        path.join(venvRoot, 'lib', 'python3.9', 'site-packages'),
        path.join(venvRoot, 'lib', 'python3', 'site-packages'),
      ];
      const sitePackages = sitePackagesCandidates.find(sp => {
        try {
          return fs.existsSync(sp);
        } catch {
          return false;
        }
      });
      if (sitePackages) {
        env['PYTHONPATH'] = env['PYTHONPATH']
          ? `${sitePackages}${path.delimiter}${env['PYTHONPATH']}`
          : sitePackages;
      }
      if (env['PYTHONHOME']) {
        delete env['PYTHONHOME'];
      }
    }

    const proc = spawn(vspipe, [tmpFile, '-'], {
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

  const onnxProbe = await probeOnnxRuntime();
  const trtProbe = await probeTensorRT();
  const bsProbe = await probeBestSource();

  const builderAvailable = isTrtexecAvailable();

  const tensorrtRuntimeAvailable = trtProbe.pluginLoadable;
  const onnxRuntimeAvailable = onnxProbe.pluginLoadable;
  const directmlAvailable = isWindows && onnxRuntimeAvailable;
  const bestSourceAvailable = bsProbe.pluginLoadable;

  const supportedBackends: RuntimeCapabilityStatus['supportedBackends'] = [];
  if (directmlAvailable) supportedBackends.push('directml');
  if (tensorrtRuntimeAvailable && builderAvailable) supportedBackends.push('tensorrt');
  if (onnxRuntimeAvailable && hasCuda) supportedBackends.push('onnxruntime-cuda');
  if (onnxRuntimeAvailable) supportedBackends.push('onnxruntime-cpu');

  let recommendedBackend: RuntimeCapabilityStatus['recommendedBackend'];
  if (isLinux) {
    recommendedBackend = tensorrtRuntimeAvailable && builderAvailable
      ? 'tensorrt'
      : (onnxRuntimeAvailable && hasCuda ? 'onnxruntime-cuda' : 'onnxruntime-cpu');
  } else {
    recommendedBackend = tensorrtRuntimeAvailable && builderAvailable
      ? 'tensorrt'
      : (directmlAvailable ? 'directml' : 'onnxruntime-cpu');
  }

  logger.info(`Runtime capabilities: CUDA=${hasCuda}, TRT=${tensorrtRuntimeAvailable}, ONNX=${onnxRuntimeAvailable}, BS=${bestSourceAvailable}, trtexec=${builderAvailable}`);

  return {
    cudaAvailable: hasCuda,
    nvidiaGpuAvailable: hasCuda,
    directmlAvailable,
    tensorrtRuntimeAvailable,
    tensorrtBuilderAvailable: builderAvailable,
    onnxRuntimeAvailable,
    onnxRuntimeCudaAvailable: onnxRuntimeAvailable && hasCuda,
    onnxRuntimeCpuAvailable: onnxRuntimeAvailable,
    bestSourceAvailable,
    supportedBackends,
    recommendedBackend,
  };
}
