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
- `vspipe` from VapourSynth R76 or newer
- BestSource plugin loadable as `core.bs`
- vs-mlrt ONNX Runtime plugin loadable as `core.ort`
- Optional TensorRT support: `core.trt` plus `trtexec`
- Optional AMD/ROCm diagnostics: AMD GPU and ROCm runtime detection are reported, but current vs-mlrt `core.ort` does not expose a ROCm provider.

The Linux setup flow verifies these with read-only probes. When the vs-mlrt ONNX Runtime plugin is missing and a build environment (`cmake`, `ninja`, `git`, `gcc`, `g++`, `patchelf`, `ldd`) is detected, the app attempts to compile the plugin from source automatically. This caches protobuf and ONNX locally so repeated setups are fast. TensorRT remains optional and is never auto-built.

By default, the Linux builder links `vsort.so` against Microsoft's prebuilt CPU ONNX Runtime archive and validates native dependencies with `ldd`. Advanced users can opt into a system ONNX Runtime build by setting `VAPOURKIT_ONNXRUNTIME_SOURCE=system`, `VAPOURKIT_ONNXRUNTIME_INCLUDE_DIR`, and `VAPOURKIT_ONNXRUNTIME_LIB_DIR`, or by configuring `onnxRuntimeSource` and `systemOnnxRuntime` in `app-config.json`. The loaded `core.ort` plugin is still the source of truth for providers; current vs-mlrt `vsort` supports CPU/CUDA/CoreML/DML, not ROCm.

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

# Build all configured Windows targets
npm run build:all
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

Linux deb/rpm packages declare dependencies on `ffmpeg`, `vapoursynth (>= 76)`, `python3`, and `python3-venv`. vs-mlrt plugins are expected to be provided by the system/user, or the app can auto-build the ONNX Runtime plugin when build tools are present.

## Flatpak Packaging
Flatpak files live in `flatpak/`:
- `flatpak/com.aivideoupscaler.gui.yml` is the manifest.
- `flatpak/vapourkit.sh` sets the Flatpak runtime environment and launches Electron.
- `generated-sources.json` contains npm source metadata generated from `package-lock.json` for offline Flatpak builds.

The Flatpak manifest builds FFmpeg, VapourSynth, BestSource, video-compare, and a Python venv. It also builds the vs-mlrt ONNX Runtime plugin (`vsort`) from source inside the Flatpak so the app is functional out-of-the-box. TensorRT (`vstrt`) is not bundled; users who need it can install it manually or extend the Flatpak.

**Flatpak build quirks:**
- **Node20 SDK required**: The manifest uses `org.freedesktop.Sdk.Extension.node20` with `append-path: /usr/lib/sdk/node20/bin`.
- **x265 needs `subdir: source`**: The x265 module must declare `subdir: source` or CMake runs in the wrong directory.
- **Metainfo accuracy**: The metainfo now qualifies TensorRT as optional/manual to match the manifest.
- **vsview Flatpak path**: The launcher script sets `PATH` to include `/app/python-venv/bin`, and the Python venv is built at Flatpak build time under `/app/python-venv`. The app should use `PATHS.VENV_VSVIEW` (which resolves to `/app/python-venv/bin/vsview` in Flatpak) rather than `PATHS.PYTHON_VENV`.
- **Flatpak postinstall scripts**: The manifest sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and `ONNXRUNTIME_NODE_INSTALL=skip` so electron and onnxruntime-node postinstall scripts exit early without network access. Their npm tarballs are included in `generated-sources.json` for offline resolution.
- **ROCm probing**: The manifest grants broad device access so AMD/ROCm runtime probing can see host devices for diagnostics. The default Flatpak build remains CPU-oriented.

Regenerate npm Flatpak sources after changing `package-lock.json`:

```bash
flatpak-node-generator npm package-lock.json -o generated-sources.json
```

**The file must exist or Flatpak builds fail.** `electron` and `onnxruntime-node` are not captured by the generator (they download native binaries via postinstall). These are added manually to `generated-sources.json` and the manifest sets env vars to skip their postinstall scripts.

Validate a Flatpak build:
```bash
flatpak-builder --force-clean --user --install-deps-from=flathub /tmp/vapourkit-flatpak-build flatpak/com.aivideoupscaler.gui.yml
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
- `core.ort.Version()` provider output gates ONNX Runtime CUDA exposure; Settings shows a compact diagnostics payload with ONNX providers/version/path, NVIDIA GPU details, and probe errors.
- Capability probing refreshes after setup completes so the renderer sees post-install/plugin-build backend state.

Linux VapourSynth plugin paths include app data, Flatpak `/app/lib/vapoursynth`, common system locations (`/usr/lib/vapoursynth`, `/usr/lib64/vapoursynth`, `/usr/lib/<multiarch>/vapoursynth`, `/usr/local/lib*/vapoursynth`), user-local locations, and existing `VS_PLUGINS_PATH`/`VAPOURSYNTH_PLUGINS_PATH` values. The app-data plugin directory is searched first so locally built plugins win over stale system copies.

**Linux plugin portability:** The bundled `include/plugins/plugins.7z` contains Windows `.dll` plugins. `electron/pluginInstaller.ts` skips extraction on Linux and copies only script/filter template assets.

**Linux venv PYTHONPATH:** `setupVSEnvironment()` prepends the venv site-packages to `PYTHONPATH` for system `vspipe`. The venv's `vapoursynth` package is removed after `vsjetpack==1.1.0` installs, so Python falls back to the system `vapoursynth` bindings (matching the C library). If the system lacks `vapoursynth` Python bindings, `vspipe` may fail to import it — install the distro's `vapoursynth` Python package.

## 7-zip ASAR patching

`electron/sevenZip.ts` wraps `7zip-min` and applies the ASAR path fix at module evaluation time. All modules import 7-zip functionality from there. `asarFix.ts` is still imported first in `main.ts` as a defense-in-depth measure.

## Validation Before Commit
Run these before committing code changes:

```bash
npm run build
npm test
npm run test:electron
git diff --check
```

## Porting Notes

- **Flatpak ROCm**: Device access is enabled for AMD/ROCm diagnostics only. A usable AMD acceleration backend would need separate vs-mlrt MIGraphX wiring or upstream ROCm provider support in `core.ort`.
- **Flatpak vsview**: Launch falls back from configured `vsview` to PATH resolution and then `python -m vsview` in the app venv; failures usually mean missing Python/Qt runtime pieces inside the sandbox.
