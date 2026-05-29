# Development

## Prerequisites
- Node.js 20 is recommended for Linux/Flatpak packaging; Node.js 18+ is sufficient for local development.
- npm
- Electron-supported desktop environment

## Runtime Dependencies
Windows development uses the same download-based setup flow as production. The app downloads the portable VapourSynth runtime, FFmpeg, BestSource, vs-mlrt, video-compare, and Python packages into `data/`.

Linux development uses native system tools and a Python virtual environment in `data/python-venv`:
- `python3` and `python3-venv`
- `ffmpeg` and `ffprobe`
- `vspipe` from VapourSynth R77 or newer
- BestSource plugin loadable as `core.bs`
- vs-mlrt ONNX Runtime plugin loadable as `core.ort`
- Optional TensorRT support: `core.trt` plus `trtexec`

The Linux setup flow verifies these with read-only probes. It does not download vs-mlrt because upstream does not provide Linux binary releases.

## Setup
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build application
npm run build

# Run renderer tests
npm test

# Run Electron/main-process tests
npm run test:electron

# Rebuild generated model documentation
npm run update-docs
```

## Windows Packaging
```bash
# Build installer (Windows)
npm run build:setup

# Build portable 7z
npm run build:7z

# Build portable zip
npm run build:zip
```

## Linux Packaging
```bash
# Build all configured Linux electron-builder targets
npm run build:linux

# Build unpacked Linux directory
npm run build:linux:dir

# Build AppImage
npm run build:appimage

# Build deb
npm run build:deb

# Build rpm
npm run build:rpm
```

Linux deb/rpm packages declare dependencies on `ffmpeg`, `vapoursynth (>= 77)`, `python3`, and `python3-venv`. vs-mlrt plugins are still expected to be provided by the system/user because no upstream Linux binaries are published.

## Flatpak Packaging
Flatpak files live in `flatpak/`:
- `flatpak/com.aivideoupscaler.gui.yml` is the manifest.
- `flatpak/vapourkit.sh` sets the Flatpak runtime environment and launches Electron.
- `generated-sources.json` contains npm source metadata generated from `package-lock.json` for offline Flatpak builds.

The Flatpak manifest builds FFmpeg, VapourSynth, BestSource, video-compare, and a Python venv. It does not bundle vs-mlrt Linux plugins; users or packagers must provide loadable `core.ort`/`core.trt` plugins separately until upstream publishes Linux builds or a source-build module is added.

Regenerate npm Flatpak sources after changing `package-lock.json`:

```bash
flatpak-node-generator npm package-lock.json -o generated-sources.json
```

## Architecture
The project is a two-process Electron app:
- Main process TypeScript lives in `electron/` and compiles to CommonJS in `dist/electron/`.
- Renderer React/Vite code lives in `src/` and builds to ESM assets in `dist/renderer/`.
- IPC is exposed through `electron/preload.ts` as `window.electronAPI`.

Build order matters: Electron TypeScript must compile before launching the app. `npm run dev` runs `build:electron` first, then starts Vite and Electron concurrently.

## Dependency And Backend Detection
Backend capability detection is runtime-based:
- `electron/backendUtils.ts` probes VapourSynth namespaces with `vspipe`.
- `electron/linuxRuntime.ts` centralizes Linux and Flatpak paths, plugin search paths, and backend normalization helpers.
- The renderer receives capabilities through `get-backend-capabilities` and validates persisted workflow/queue backend choices against supported backends.

Linux VapourSynth plugin paths include app data, Flatpak `/app/lib/vapoursynth`, system locations, user-local locations, and existing `VS_PLUGINS_PATH`/`VAPOURSYNTH_PLUGINS_PATH` values.

## Important Startup Requirement
`electron/asarFix.ts` must remain the first import in `electron/main.ts`. It patches `7zip-bin` paths before any module can load `7zip-min`; otherwise production ASAR builds can fail when extracting dependencies.

## Validation Before Commit
Run these before committing code changes:

```bash
npm run build
npm test
npm run test:electron
git diff --check
```
