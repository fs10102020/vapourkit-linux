## Batch Processing

Process multiple videos in a queue, each with its own workflow and encoding settings captured at the time you add it.

### How It Works

1. **Select Multiple Videos**: Click "Select Video" and choose multiple files
2. **Configure**: Review the list of videos, adjust output paths if needed
3. **Add to Queue**: Click "Add Videos to Queue"
4. **Process**: Click "Start Queue" - videos process one at a time

### Processing With Filter Chains

Batch items use the same filter chain and model selection UI as single-file processing.

**Steps**:
1. Build your filter pipeline:
   - Add and configure filters
   - Optionally add AI model filters
2. Choose output format and backend
3. Select multiple videos
4. Review workflow summary and output paths
5. Click "Add Videos to Queue"
6. Click "Start Queue"

### Key Features

- **Workflow Snapshots**: Each video captures filters, model paths, backend, number of streams, encoding settings, and segment settings at queue-add time. Changing settings later will not affect queued videos.
- **Auto Paths**: Output paths are auto-generated with `_upscaled` suffix (e.g., `video.mp4` → `video_upscaled.mkv`. Existing files are overwritten without warning)
- **Queue Management**: Reorder by dragging, cancel items, requeue failed videos, or clear completed items
- **Persistent**: Queue saves automatically to `data/config/queue.json` in development and to the app-data config directory in packaged Linux builds.
- **Backend Migration**: Older queue items without backend metadata are migrated on load. Unsupported DirectML queue entries on Linux are remapped to ONNX Runtime CPU.

### Tips

- **Test first**: If processing multiple videos with the same workflow, always test one video before processing the rest
- **Check paths**: Review output paths before confirming - existing files are overwritten without warning
