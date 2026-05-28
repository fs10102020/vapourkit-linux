## Batch Processing

Process multiple videos in a queue, each with its own settings captured at the time you select it.

### How It Works

1. **Select Multiple Videos**: Click "Select Video" and choose multiple files
2. **Configure**: Review the list of videos, adjust output paths if needed
3. **Add to Queue**: Click "Add Videos to Queue"
4. **Process**: Click "Start Queue" - videos process one at a time

### Simple Mode

Process multiple videos with the same upscaling model.

**Steps**:
1. Select your upscaling model
2. Choose output format and backend
3. Select multiple videos
4. Review output paths in the modal
5. Click "Add Videos to Queue"
6. Click "Start Queue"

### Advanced Mode

Process videos with custom filter chains.

**Steps**:
1. Enable Advanced Mode (click `<>` icon)
2. Build your filter pipeline:
   - Add and configure filters
   - Optionally add AI models
3. Choose output format and backend
4. Select multiple videos
5. Review workflow summary and output paths
6. Click "Add Videos to Queue"
7. Click "Start Queue"

### Key Features

- **Workflow Snapshots**: Each video captures your settings at selection time - changing settings later won't affect queued videos
- **Auto Paths**: Output paths are auto-generated with `_upscaled` suffix (e.g., `video.mp4` → `video_upscaled.mkv`. Existing files are overwritten without warning)
- **Queue Management**: Reorder by dragging, cancel items, requeue failed videos, or clear completed items
- **Persistent**: Queue saves automatically

### Tips

- **Test first**: If processing multiple videos with the same workflow, always test one video before processing the rest
- **Check paths**: Review output paths before confirming - existing files are overwritten without warning