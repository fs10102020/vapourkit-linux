#### Using Custom Filters

1. **Add Filter**: Click "+ Add Filter" in the filter panel
2. **Configure**: 
   - Choose a filter template or write custom VapourSynth code
   - Enable/disable filters individually
   - Reorder filters using drag handles
3. **Apply**: Filters are automatically applied during processing

#### Creating Filter Templates

1. Write custom VapourSynth code in a filter
2. Click "Save as Template" 
3. Name your template and optionally add a description
4. Reuse the template in future projects

#### Working with Workflows

**Export Workflow**:
1. Configure your complete processing pipeline (filters, model, settings)
2. Click the Upload icon in the header
3. Choose save location for `.vkworkflow` file

**Import Workflow**:
1. Click the Download icon in the header
2. Select a `.vkworkflow` file
3. All settings will be restored. Portable model names are resolved to the best model file for the current backend.

**Load Workflow**:
- Similar to import, but completely replaces current configuration

### Supported Formats

**Input**: MP4, AVI, MKV, MOV, WebM, FLV, WMV  
**Output**: MP4, MKV, AVI, MOV, WebM

### Configuration Files

- **App Config**: `data/config/app-config.json` - User preferences and model metadata
- **Filter Templates**: `data/config/filter-templates/` - Custom filter definitions
- **Workflows**: User-defined location with `.vkworkflow` extension

On Linux packaged builds, app data is stored in the platform user-data location instead of beside the executable. In development, Linux and Windows both use the project `data/` directory.

### Model Files

- **Location**: `include/models/` (built-in) or `data/models/` (runtime)
- **Formats**: 
  - `.onnx` - ONNX model files (universal)
  - `.engine` - TensorRT engine files (NVIDIA-specific, GPU-bound)

### Inference Backends

The backend selector only shows backends that are supported by the current runtime. Use the expandable **Backend diagnostics** section in Settings to see detected ONNX providers, ONNX Runtime version/plugin path, NVIDIA GPU details, and probe errors.
- **TensorRT**: Uses `.engine` files and requires NVIDIA TensorRT support. On Linux, both `core.trt` and `trtexec` must be available.
- **ONNX Runtime CUDA**: Uses `.onnx` files when the CUDA provider is reported by `core.ort.Version()` and an NVIDIA CUDA-capable GPU is detected. Provider detection does not guarantee every model will execute successfully.
- **ONNX Runtime CPU**: Uses `.onnx` files on CPU. This is the broadest Linux fallback but is slower.
- **DirectML**: Windows-only ONNX Runtime backend for DirectX 12 GPUs.

If a workflow or queue item was saved with an unsupported backend, Vapourkit remaps it to a supported backend before processing. Linux remaps DirectML workflows to ONNX Runtime CPU unless another supported backend is selected.

### Platform-Specific Notes

#### Linux
- **Plugin compatibility**: The Windows plugin bundle (DLLs extracted during setup) is not functional on Linux even if extracted. Filters that depend on Windows-native VapourSynth plugins will not work. Only system-installed or source-built `.so` plugins are usable.
- **Multiple plugin search paths**: Plugins are searched in app data, Flatpak paths, system directories, user-local, and environment-provided paths. Includes `/usr/lib64/vapoursynth` and `/usr/lib/x86_64-linux-gnu/vapoursynth` for multiarch systems.
- **VapourSynth version matching**: The venv's `vapoursynth` Python package is uninstalled after setup so system `vspipe`'s embedded Python uses the system-distributed bindings, avoiding ABI version mismatches with `libvapoursynth.so`.
- **TensorRT optional**: The TensorRT plugin (`core.trt`) is never auto-built or auto-downloaded on Linux. Install it through your distribution or build from source.
- **AMD/ROCm diagnostic-only**: AMD GPU and ROCm runtime presence may appear in diagnostics, but no `onnxruntime-rocm` backend is exposed because current vs-mlrt `core.ort` does not report a ROCm provider.
- **vsview fallback**: Preview launch tries the configured `vsview` executable, then `vsview` on PATH using the VapourSynth environment, then `python -m vsview` from the app venv.
- **Flatpak file access**: The Flatpak sandbox limits file access to common XDG folders (Videos, Downloads, Pictures, Documents, Music). To process files elsewhere, use Flatpak's file chooser portal or adjust `--filesystem` permissions.
