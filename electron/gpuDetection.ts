import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { platformSpawnOptions, resolveCommandPath } from './platform';

export interface GpuDetectionResult {
  nvidia: {
    available: boolean;
    cudaVersion?: string;
    name?: string;
  };
  amd: {
    available: boolean;
    rocmRuntimeAvailable: boolean;
    rocmVersion?: string;
    name?: string;
  };
  intel: {
    available: boolean;
    name?: string;
  };
}

let cachedResult: GpuDetectionResult | null = null;

export async function detectGpuCapabilities(): Promise<GpuDetectionResult> {
  if (cachedResult) return cachedResult;

  const [nvidia, amd, intel] = await Promise.all([
    detectNvidiaGpu(),
    detectAmdGpu(),
    detectIntelGpu(),
  ]);
  cachedResult = { nvidia, amd, intel };
  return cachedResult;
}

export function resetGpuCapabilityCache(): void {
  cachedResult = null;
}

async function detectNvidiaGpu(): Promise<GpuDetectionResult['nvidia']> {
  const queried = await runCommandCapture('nvidia-smi', ['--query-gpu=name,cuda_version', '--format=csv,noheader']);
  const firstLine = queried?.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  if (firstLine) {
    const [name, cudaVersion] = firstLine.split(',').map(part => part.trim());
    return { available: true, name, cudaVersion: parseVersionString(cudaVersion) };
  }

  const fallback = await runCommandCapture('nvidia-smi', []);
  if (!fallback) return { available: false };
  const cudaVersion = fallback.match(/CUDA Version:\s*(\d+\.\d+)/i)?.[1];
  return { available: true, cudaVersion };
}

async function detectAmdGpu(): Promise<GpuDetectionResult['amd']> {
  const sysfs = detectGpuVendorFromSysfs('0x1002');
  const rocmSmi = await runCommandCapture('rocm-smi', ['--showproductname']);
  const rocminfo = await runCommandCapture('rocminfo', []);
  const hasKfd = fs.existsSync('/dev/kfd');
  const hasHip = commonLibraryExists(['libamdhip64.so'], ['/opt/rocm/lib', '/usr/lib', '/usr/lib64', '/usr/local/lib']);
  const rocmVersion = await detectRocmVersion();

  return {
    available: sysfs.available || !!rocmSmi || !!rocminfo,
    rocmRuntimeAvailable: hasKfd && (!!rocminfo || !!rocmSmi || hasHip),
    rocmVersion,
    name: sysfs.name || parseRocmSmiName(rocmSmi),
  };
}

async function detectIntelGpu(): Promise<GpuDetectionResult['intel']> {
  const sysfs = detectGpuVendorFromSysfs('0x8086');
  const intelGpuTop = await resolveCommandPath('intel_gpu_top');
  return { available: sysfs.available || !!intelGpuTop, name: sysfs.name };
}

function detectGpuVendorFromSysfs(vendorId: string): { available: boolean; name?: string } {
  try {
    const drmRoot = '/sys/class/drm';
    for (const entry of fs.readdirSync(drmRoot)) {
      if (!entry.startsWith('card') || entry.includes('-')) continue;
      const deviceDir = path.join(drmRoot, entry, 'device');
      const vendorPath = path.join(deviceDir, 'vendor');
      if (!fs.existsSync(vendorPath)) continue;
      const vendor = fs.readFileSync(vendorPath, 'utf8').trim().toLowerCase();
      if (vendor !== vendorId) continue;
      const namePath = path.join(deviceDir, 'product');
      const name = fs.existsSync(namePath) ? fs.readFileSync(namePath, 'utf8').trim() : undefined;
      return { available: true, name };
    }
  } catch {
    // sysfs may be unavailable inside restricted sandboxes.
  }
  return { available: false };
}

function commonLibraryExists(names: string[], dirs: string[]): boolean {
  return dirs.some(dir => names.some(name => fs.existsSync(path.join(dir, name))));
}

async function detectRocmVersion(): Promise<string | undefined> {
  const rocmInfo = await runCommandCapture('rocminfo', []);
  const infoMatch = rocmInfo?.match(/ROCm\s+Version:\s*([\w.-]+)/i);
  if (infoMatch) return infoMatch[1];

  try {
    const versionFile = '/opt/rocm/.info/version';
    if (fs.existsSync(versionFile)) return fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    // ignore
  }
  return undefined;
}

function parseRocmSmiName(output: string | undefined): string | undefined {
  if (!output) return undefined;
  return output.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('='));
}

function parseVersionString(value: string | undefined): string | undefined {
  return value?.match(/(\d+\.\d+)/)?.[1];
}

function runCommandCapture(command: string, args: string[], timeoutMs = 5000): Promise<string | undefined> {
  return new Promise((resolve) => {
    resolveCommandPath(command).then((resolved) => {
      if (!resolved) {
        resolve(undefined);
        return;
      }

      const proc = spawn(resolved, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...platformSpawnOptions(),
      });

      let stdout = '';
      let settled = false;
      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        finish(undefined);
      }, timeoutMs);
      const finish = (value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.on('close', (code) => finish(code === 0 && stdout.trim() ? stdout : undefined));
      proc.on('error', () => finish(undefined));
    }).catch(() => resolve(undefined));
  });
}
