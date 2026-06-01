# Vapourkit

![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FKim2091%2Fvapourkit%2Fmain%2Fpackage.json&query=%24.version&label=version&color=blue)
![License](https://img.shields.io/badge/license-GPL--3.0--or--later-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)
![Discord](https://img.shields.io/discord/1470824551456706580)


**Vapourkit** is a free, open source program for video upscaling and enhancement using VapourSynth and AI models. It provides a user-friendly interface for video processing with support for TensorRT, ONNX Runtime CUDA/CPU, and DirectML backends where available.

<img width="2033" height="1248" alt="image" src="https://github.com/user-attachments/assets/8a821fae-1060-4178-9134-e398048534bc" />

## 🚀 Getting Started

### Installation

#### Windows
[**Free download here**](https://ko-fi.com/s/2e5ebd456d)
1. Download and extract/install to your desired location
2. On first launch, click "Start Setup" when prompted to install dependencies

#### Linux
Linux support uses system VapourSynth, Python, FFmpeg, and VapourSynth plugins instead of the Windows portable runtime. Flatpak is the primary Linux packaging target; AppImage, deb, and rpm builds are also configured and declare system package dependencies.

Required runtime tools:
- `ffmpeg` and `ffprobe`
- `python3` and `python3-venv`
- `vspipe` from VapourSynth R76 or newer
- BestSource VapourSynth plugin (`core.bs`)
- vs-mlrt ONNX Runtime plugin (`core.ort`) for ONNX Runtime CPU/CUDA backends
- Optional: vs-mlrt TensorRT plugin (`core.trt`) and `trtexec` for TensorRT

Important Linux note: upstream vs-mlrt does not publish pre-built Linux binaries. On first setup, VapourKit attempts to **automatically compile the vs-mlrt ONNX Runtime plugin from source** when `cmake`, `ninja`, `git`, `gcc`, `g++`, `patchelf`, and `ldd` are available. The default build uses Microsoft's prebuilt CPU ONNX Runtime archive and validates native libraries with `ldd`. VapourKit detects backend support at runtime and only exposes backends whose required pieces are reported by the loaded plugin. AMD/ROCm is detected for diagnostics, but current vs-mlrt `core.ort` does not expose a ROCm provider.

### Quick Start
1. Select or drag-and-drop a video file
2. Choose an upscaling model
3. Configure output location and format
4. Click "Upscale Video" to process
5. Use "Preview Output" or "Compare Videos" to review results

For custom filters, workflows, model files, and configuration details, see [Basic Usage](docs/Basic%20Usage.md).

## 🌟 Features

### Core Capabilities
- **AI Video Upscaling**: Process videos with high quality AI upscaling models
- **Runtime Backend Detection**: TensorRT, ONNX Runtime CUDA/CPU, and DirectML are exposed only when supported by the current platform, with diagnostics available in Settings
- **Real-time Preview**: See results while processing
- **Video Comparison**: Built-in side-by-side viewer
- **Batch Processing**: Upscale multiple videos sequentially

### 🔬 Complete Control
- **Pre-made Filters**: Dozens of ready-to-use filters (thanks [pifroggi](https://github.com/pifroggi/)!)
- **Custom VapourSynth Filters**: Write and chain custom video processing filters
- **Templates & Workflows**: Save/share filter configs (`.vkfilter`) and complete workflows (`.vkworkflow`)
- **Custom Models**: Import your own ONNX models
- **Enhanced Batch Processing**: Process multiple videos sequentially with custom workflows

### Model Support

See [Model Support](docs/Models.md) for included models, custom model requirements, and model licensing details.

## 📋 System Requirements

### Minimum Requirements
- **OS**: Windows 10/11 (x64) or Linux (x64)
- **RAM**: 8GB+ recommended
- **Storage**: 5 GB Minimum, 10 GB recommended free space for application and dependencies
- **GPU**: 
  - Minimum 6 GB VRAM
  - NVIDIA 16xx series or newer for TensorRT or ONNX Runtime CUDA, with a current NVIDIA driver
  - AMD/ROCm detection is diagnostic only until an AMD-capable vs-mlrt backend is wired separately
  - AMD/Intel/NVIDIA GPU with DirectX 12 support for DirectML on Windows
  - CPU-only ONNX Runtime works on Linux when `core.ort` is available, but it is significantly slower

### Backend Availability
- **Windows**: DirectML is available when the ONNX Runtime plugin is installed. TensorRT is available when the TensorRT plugin and `trtexec` are installed. ONNX Runtime CUDA/CPU are available when the ONNX Runtime plugin is installed.
- **Linux**: DirectML is not available. ONNX Runtime CPU requires a loadable `core.ort` VapourSynth plugin. ONNX Runtime CUDA additionally requires `core.ort.Version()` to report the `CUDA` provider and an NVIDIA CUDA-capable GPU. TensorRT requires both a loadable `core.trt` plugin and `trtexec`. Settings includes backend diagnostics for detected providers, plugin paths, GPU details, and probe errors.

### Known Issues (Linux)

- **Flatpak vsview**: If the `vsview` entrypoint is missing, the app falls back to launching it via the Python module in the bundled venv and logs which launch path was used.
- **Optional native builds**: Non-Flatpak Linux setup can build `video-compare` and `vstrt.so` only when their development dependencies are installed. Missing optional build inputs do not block CPU/ONNX setup.

## 🔧 Development

See [Development](docs/Development.md) for more information.

## 📝 License

GPL-3.0-or-later - See LICENSE file for details

## Discord
Chat here about Vapourkit!

https://discord.gg/uYKMn2hGwB

## 🙏 Credits

- [VapourSynth](https://github.com/vapoursynth/vapoursynth/releases) & [vs-mlrt](https://github.com/AmusementClub/vs-mlrt/releases)
- [tepete](https://github.com/pifroggi)'s work on the filters & his plugins
- [video-compare](https://github.com/pixop/video-compare)
- [Sirosky](https://github.com/Sirosky/Upscale-Hub)'s models
- [the database](https://github.com/the-database/)'s models
- [vs-jetpack](https://github.com/Jaded-Encoding-Thaumaturgy/vs-jetpack/) for additional VapourSynth filters

### Other acknowledgments
- [tepete/pifroggi](https://github.com/pifroggi/), Bendel, leobby, Princess, and Hermes for beta testing!

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Kim2091/vapourkit&type=date&legend=top-left)](https://www.star-history.com/#Kim2091/vapourkit&type=date&legend=top-left)
