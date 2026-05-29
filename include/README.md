# Include
This folder contains bundled assets and dependency payloads used by Vapourkit.

- `filter_templates` - contains pre-made filter templates for the app, for use in advanced mode
- `models` - contains bundled ONNX upscaling models copied to runtime model storage as needed
- `plugins` - contains bundled plugin archives and filter template payloads used by setup
- `scripts` - contains VapourSynth script archives that go with the plugins
- `stock-app-config.json` - contains defaults shipped with the app, including model metadata
- `vapoursynth_template.vpy` - the base VapourSynth template used for every run

Windows setup extracts bundled plugin/script payloads into the portable runtime under `data/`. Linux setup uses system/Flatpak VapourSynth paths and probes loadable plugins at runtime, so Linux packagers should provide native `.so` plugins through system paths, Flatpak `/app/lib/vapoursynth`, or user-local VapourSynth plugin directories.

The VapourSynth template is copied to the writable config directory on setup and on app version upgrades. Do not rely on editing the user's copied template for persistent source changes; edit this bundled template instead.
