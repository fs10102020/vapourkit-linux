import { spawn } from 'child_process';
import { isLinux, platformSpawnOptions, resolveCommandPath } from './platform';

export interface SharedLibraryValidation {
  ok: boolean;
  missing: string[];
  output: string;
}

export function parseLddMissingLibraries(output: string): string[] {
  const missing = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+=>\s+not found\s*$/);
    if (match) missing.add(match[1]);
  }
  return [...missing];
}

export async function validateSharedLibrary(libraryPath: string): Promise<SharedLibraryValidation> {
  if (!isLinux) {
    return { ok: true, missing: [], output: '' };
  }

  const ldd = await resolveCommandPath('ldd');
  if (!ldd) {
    return { ok: false, missing: ['ldd'], output: 'ldd not found on PATH' };
  }

  return new Promise((resolve) => {
    const proc = spawn(ldd, [libraryPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...platformSpawnOptions(),
    });

    let output = '';
    proc.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    proc.stderr?.on('data', (data: Buffer) => { output += data.toString(); });

    proc.on('close', (code) => {
      const missing = parseLddMissingLibraries(output);
      resolve({ ok: code === 0 && missing.length === 0, missing, output });
    });

    proc.on('error', (error) => {
      resolve({ ok: false, missing: ['ldd'], output: error.message });
    });
  });
}
