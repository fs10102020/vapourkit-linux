#!/bin/bash
export VS_PLUGINS_PATH="/app/lib/vapoursynth:${VS_PLUGINS_PATH}"
export VAPOURSYNTH_PLUGINS_PATH="${VS_PLUGINS_PATH}"
export PATH="/app/python-venv/bin:/app/bin:${PATH}"
export VAPOURKIT_BUNDLED_BASE="/app/vapourkit"

exec zypak-wrapper electron /app/vapourkit/dist/electron/main.js
