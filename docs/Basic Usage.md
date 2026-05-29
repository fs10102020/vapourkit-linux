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

The backend selector only shows backends that are supported by the current runtime:
- **TensorRT**: Uses `.engine` files and requires NVIDIA TensorRT support. On Linux, both `core.trt` and `trtexec` must be available.
- **ONNX Runtime CUDA**: Uses `.onnx` files with CUDA acceleration through `core.ort`.
- **ONNX Runtime CPU**: Uses `.onnx` files on CPU. This is the broadest Linux fallback but is slower.
- **DirectML**: Windows-only ONNX Runtime backend for DirectX 12 GPUs.

If a workflow or queue item was saved with an unsupported backend, Vapourkit remaps it to a supported backend before processing. Linux remaps DirectML workflows to ONNX Runtime CPU unless another supported backend is selected.
