# AGENTS.md

## Architecture

Two-process Electron app (Windows-only). No monorepo.

| Process | Source | Output | Module |
|---|---|---|---|
| Main (Node) | `electron/` | `dist/electron/` | CommonJS |
| Renderer (React) | `src/` | `dist/renderer/` | ESM (Vite) |

IPC via `contextBridge` (`electron/preload.ts`). Renderer calls `window.electronAPI.*`.

## Commands

```bash
npm run dev          # Compile electron TS, then Vite server + electron concurrently
npm run build        # tsc + vite build + compile electron TS
npm test             # Frontend tests (vitest): src/**/*.test.ts
npm run test:electron # Electron tests (vitest): electron/**/*.test.ts
npm run update-docs  # Regenerate docs/Models.md from src/data/modelLicenses.ts
```

No `lint` or `typecheck` scripts exist. TypeScript compilation is the validation step.

## Build order matters

Electron TS must compile BEFORE the app can launch. `npm run dev` runs `build:electron` first, then concurrently starts Vite dev server (`http://localhost:5173`) + launches electron. The electron main process is compiled from `tsconfig.electron.json` (CommonJS, target ES2020, outDir `dist/electron`).

## Critical startup requirement

`electron/asarFix.ts` **MUST** be the first import in `electron/main.ts`. It patches `7zip-bin`'s native path before any module loads `7zip-min`. Without this, 7z extraction fails in production (ASAR builds).

## IPC handler patterns

Three patterns co-exist in the codebase:

1. **`handleValidated(channel, zodSchema, handler)`** — Zod validation on args. Preferred for new handlers (`electron/ipcValidation.ts`).
2. **`createIpcHandler(handlerName, handler, options)`** — Wraps with logging and error formatting (`electron/ipcUtilities.ts`).
3. **Raw `ipcMain.handle(channel, handler)`** — Legacy, no validation.

New handlers should use `handleValidated`.

## Config system

Singleton `configManager` at `electron/configManager.ts`. On load:
- Deep-merges user's `data/config/app-config.json` with bundled `include/stock-app-config.json`
- Models metadata uses special merge logic: stock model metadata merged with user overrides, user-added models preserved
- Creates backup before migration; write failures are non-fatal

**Gotcha**: `configManager.getProcessingFormat()` NEVER returns `"match_input"` — it falls back to `"vs.YUV420P8"`. This guard exists because match_input is experimental and can cause crashes.

## VapourSynth script template

`include/vapoursynth_template.vpy` uses `{{PLACEHOLDER}}` syntax. Key variables in generated scripts:
- `clip` — current video stream (mutated by filters)
- `original_clip` — unmodified reference, set as `original_clip = clip` before the `{{FILTERS}}` block

The template is overwritten from bundled source on every app version upgrade. Do NOT modify the user's copy expecting changes to persist.

## Model naming conventions

- Engine files have doubled precision suffix: `model_fp16.onnx` → `model_fp16_fp16.engine`
- Model IDs use the filename basename without extension
- `getPortableModelName()` strips precision suffix + extension for portable references (used in workflow export)
- `resolvePortableModelName()` looks up actual filesystem path from available models, preferring `.engine` over `.onnx`

## Path conventions

All filesystem paths through the `PATHS` object in `electron/constants.ts`. Executables use getters (e.g., `PATHS.VSPIPE`, `PATHS.TRTEXEC`). The base `APP_DATA_PATH` is:
- **Production**: `<exe-dir>/data`
- **Development**: `<project-root>/data`

To access bundled files (`include/`), always use `getBundledBasePath()` from `electron/utils.ts` — it applies ASAR unpack path fixing.

## Setup / dependency flow

1. `dependencyManager.setupDependencies()` downloads core deps (VapourSynth R72, Python 3.13, vs-mlrt, FFmpeg, video-compare, BestSource)
2. `pluginInstaller.installDependenciesForSetup()` pip-installs packages + extracts plugins/scripts/filters — auto-retries once on failure
3. Setup completion signaled via IPC event `'setup-progress'` with `component: 'All Dependencies'`

File locking during 7z extraction is retried 5 times with 2s delay.

## Three executor slots

`electron/videoHandlers.ts` maintains three module-level executor instances:
- `upscaleExecutor` — main processing
- `previewExecutor` — segment previews  
- `infoExecutor` — output resolution validation

Each is cancelled/killed before launching a new one. Executors must be null-checked after async awaits because cancellation nulls the module reference mid-flight.

## Upscale execution flow

`vspipe stdout → pipe → ffmpeg stdin`. Monitoring:
- **vspipe stderr** → error extraction (`ErrorMessageHandler.extractErrorMessage()`)
- **ffmpeg stderr** → frame/fps parsing + progress + ETA
- **ffmpeg stdout** → JPEG frames (for live preview), decoded and throttled to ~750ms intervals via `setImmediate` in the renderer

Graceful cancel: unpipes vspipe→ffmpeg, SIGTERM vspipe (force kill after 3s), closes ffmpeg stdin to finish encoding (force kill after 10s). Force stop: immediate `taskkill /F /T`.

## Configuration files (TOML)

- **Filter templates**: `.vkfilter` files with `name`, `code`, optional `category`, `description`, `metadata`
- **Workflows**: `.vkworkflow` files with `workflow` + `filters` + optional `encoding_settings` tables
- Template management: `electron/templateManager.ts` (CRUD), `electron/templateHandlers.ts` (IPC)
- Workflow management: `electron/workflowHandlers.ts` (export/import)

Many `.vkfilter` files in `include/plugins/plugin_filters/` import from `vstools` (the Python package from vs-jetpack) — e.g., `from vstools import vs, core`.

## Queue

Queue stored as JSON at `data/config/queue.json`, auto-saved with 2-second debounce. On load, items in "processing" status are reset to "pending" (app closed mid-processing). Queue items snapshot the full workflow (filters, model, encoding settings, segment) at add time.

## vs-mlrt version tracking

Version pinned in `electron/constants.ts:5` (`VS_MLRT_VERSION = '15.13'`). Stored in config. On version mismatch with existing `.engine` files, user is notified via modal to rebuild. Version is NOT auto-updated during setup — only after user acknowledges or clears engines.

## GPU monitoring

Frontend polls `nvidia-smi` every 3s via IPC. Backend polls every 2s during active upscale and attaches stats to progress events. Returns null on non-NVIDIA systems.

## Filter chains

Filter order is top-to-bottom. Undo/redo via `useFilterHistory` hook with Ctrl+Z/Ctrl+Y. Filter state persisted to localStorage. Privacy mode can be toggled globally and obfuscates filenames, previews, and notifications.

## Sibling repos

Five repos live alongside this one and are downstream runtime dependencies (downloaded/extracted/invoked at runtime, not linked at build time):

- **vapoursynth** — `vspipe.exe` + `python.exe`, downloaded during setup
- **vs-mlrt** — TensorRT (`trtexec.exe`) + ONNX Runtime (`vsort.dll`), downloaded during setup
- **vs-jetpack** — pip-installed (`vsjetpack==1.1.0`), imported by filter `.vkfilter` scripts
- **video-compare** — `video-compare.exe`, downloaded during setup, launched as detached process
- **Upscale-Hub** — source of pre-bundled ONNX models (files live in `include/models/`, metadata in `stock-app-config.json`)
