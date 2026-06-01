# AGENTS.md

## Architecture
- Two-process Electron app, not a monorepo.
- Main process: `electron/` -> `dist/electron/`, CommonJS via `tsconfig.electron.json`.
- Renderer: `src/` -> `dist/renderer/`, React/Vite ESM.
- IPC crosses only through `electron/preload.ts` (`contextBridge`); renderer calls `window.electronAPI.*`.

## Commands
```bash
npm run dev              # build:electron, then Vite + Electron concurrently
npm run build            # renderer tsc + Vite build + electron tsc
npm test                 # Vitest for src/**/*.test.ts
npm run test:electron    # Vitest for electron/**/*.test.ts
npm run build:linux      # electron-builder --linux --x64
npm run build:linux:dir  # unpacked Linux dir build
npm run update-docs      # regenerate docs/Models.md from src/data/modelLicenses.ts
```
- Focused tests: `npm test -- src/path/file.test.ts` and `npm run test:electron -- electron/path/file.test.ts`.
- No lint or separate typecheck script; TypeScript compilation in `npm run build` is the typecheck.
- Before handing off commit-ready work: `npm run build && npm test && npm run test:electron && git diff --check`.

## IPC
- Prefer `handleValidated(channel, zodSchema, handler)` from `electron/ipcValidation.ts` for new IPC args.
- Otherwise use `createIpcHandler()` from `electron/ipcUtilities.ts`; raw `ipcMain.handle` is legacy.
- Keep `src/electron.d.ts` in sync with `electron/preload.ts` and IPC handler return shapes.

## Paths And Runtime Data
- Use `PATHS` from `electron/constants.ts` for app paths and executables; Linux executable getters can resolve to system PATH names.
- `electron/platform.ts` and `electron/linuxRuntime.ts` must not import `electron/constants.ts`; platform booleans come from dependency-light `electron/platformState.ts`.
- `APP_DATA_PATH`: Windows production uses `<exe-dir>/data`; Linux packaged/Flatpak/AppImage uses Electron `userData`; development uses `<project-root>/data`.
- Bundled assets under `include/` must be listed in both `package.json` `build.files` and `build.asarUnpack` when they need filesystem access.

## Process Spawning
- `electron/utils.ts:runCommand()` intentionally uses `spawn()` without `shell: true`; pass arguments literally (`$ORIGIN` does not need escaping).
- Resolve commands with `resolveCommandPath()` using the same env that will be passed to `spawn()` when venv/sandbox PATH matters.
- The only intentional shell usage is Windows `taskkill` via `exec()` with numeric PIDs.

## 7-Zip / ASAR
- Import 7-zip only through `electron/sevenZip.ts`, never directly from `7zip-min`.
- `electron/main.ts` imports `./asarFix` first so `7zip-bin.path7za` is patched before any `7zip-min` load.

## Config And File Formats
- `configManager` deep-merges user `data/config/app-config.json` with `include/stock-app-config.json`; migration backups are created and write failures are non-fatal.
- `processingFormat` supports persisted `match_input`; UI labels it experimental because odd inputs can still break VapourSynth.
- Filter templates are `.vkfilter` TOML (`name`, `code`, optional `category`, `description`, `metadata`).
- Workflows are `.vkworkflow` TOML (`workflow`, `filters`, optional `encoding_settings`).

## Dependency Setup
- `dependencyManager.setupDependencies()` is platform-split.
- Windows downloads portable VapourSynth R72, Python 3.13, vs-mlrt, FFmpeg, video-compare, then pip-installs/extracts plugins.
- Linux probes system tools, creates a copy-based venv, pip-installs packages, optionally builds `video-compare`, builds `vsort.so` if `core.ort` is missing, and can build `vstrt.so` when CUDA plus TensorRT SDK dev files are present.
- Linux setup fails on missing Python/venv/pip/FFmpeg/VapourSynth R76+/BestSource/ONNX Runtime.
- `SetupScreen` matches setup steps by `componentPrefixes.some(prefix => component.startsWith(prefix))` because Windows/Linux emit different component names.

## Backend Capabilities
- `electron/backendUtils.ts` probes `core.ort`, `core.trt`, and `core.bs` by running temp VapourSynth scripts through `vspipe`.
- ONNX Runtime CUDA is exposed only when `core.ort.Version()` reports `CUDA` and an NVIDIA CUDA-capable GPU is detected.
- AMD/ROCm detection is diagnostic only; current vs-mlrt `core.ort` does not expose a ROCm provider. Do not add an `onnxruntime-rocm` backend without a real plugin/provider path.
- Provider registration is not a real inference smoke test; avoid wording that guarantees model execution.
- Renderer `BackendCapabilities` from `get-backend-capabilities` is the source of truth; unsupported saved/workflow/queue backends are remapped via `src/types/backend.ts:validateBackend()`.

## Linux VapourSynth Environment
- Use `buildLinuxVsEnvironment()` from `electron/vsEnvironment.ts` for vspipe/Python/vsview probes; it sets `PATH`, `PYTHONPATH`, `LD_LIBRARY_PATH`, plugin paths, and `LC_ALL/LANG=C`.
- After `vsjetpack==1.1.0` install, the venv `vapoursynth` package is removed to avoid ABI mismatch with system `libvapoursynth.so`.
- `vsview` launch falls back configured path -> `resolveCommandPath('vsview', env)` -> `python -m vsview` using the app venv/env.

## Upscale Pipeline
- `electron/videoHandlers.ts` owns three module-level `UpscaleExecutor`s: main upscale, segment preview, and output-resolution validation.
- Cancel/kill can null module references while async code is awaiting; always null-check executor refs after awaits.
- Pipeline is `vspipe stdout -> ffmpeg stdin`; cancel unpipes, SIGTERMs vspipe, closes ffmpeg stdin, then escalates to SIGKILL/taskkill timeouts.

## Linux vs-mlrt Build
- `electron/vsMlrtLinuxBuilder.ts` requires `cmake`, `ninja`, `git`, `gcc`, `g++`, `patchelf`, and `ldd`; Ninja is required.
- Keep `-DCMAKE_POLICY_VERSION_MINIMUM=3.5` for CMake 4.x compatibility.
- `$ORIGIN` rpath is passed without shell escaping because commands do not run through a shell.
- Pinned source/build inputs: protobuf 3.21.12, ONNX commit `b86cc54`, ONNX Runtime 1.17.1.
- Default ONNX Runtime source is Microsoft prebuilt CPU archive; system ONNX Runtime uses `VAPOURKIT_ONNXRUNTIME_SOURCE=system` plus include/lib dirs or config.
- TensorRT `vstrt.so` auto-build is optional and requires CUDA Toolkit plus TensorRT SDK headers/libs; missing TensorRT must not block CPU/ONNX setup.

## Flatpak
- Manifest: `flatpak/com.aivideoupscaler.gui.yml`; Node20 SDK extension is required.
- Regenerate `generated-sources.json` after `package-lock.json` changes with `flatpak-node-generator npm package-lock.json -o generated-sources.json`.
- `electron` and `onnxruntime-node` tarballs are manually added to `generated-sources.json`; generator output alone is incomplete.
- Manifest sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and `ONNXRUNTIME_NODE_INSTALL=skip` to avoid networked postinstall downloads.
- Flatpak vs-mlrt build uses `-march=x86-64`; keep the broad x86_64 baseline.
- Broad `--device=all` is intentional for experimental AMD/ROCm diagnostics, but CPU/ONNX is the default Linux path.

## Dev Environment Notes
- Node 18+ works locally; Node 20 is needed for Flatpak packaging.
- On Arch, Electron download can fail; workaround is system `electron34`, symlink `node_modules/electron/dist/electron` to `/usr/lib/electron34/electron`, and write `electron` to `node_modules/electron/path.txt`.
- Vite dev server ignores `data/`, `data2/`, and `release/`.
