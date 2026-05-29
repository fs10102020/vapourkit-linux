# Scripts

This directory contains utility scripts for maintaining the Vapourkit project.

## updateModelsDocs.ts

Automatically generates [docs/Models.md](../docs/Models.md) based on the model license data in [src/data/modelLicenses.ts](../src/data/modelLicenses.ts).

**Usage:**
```bash
npm run update-docs
```

**When to run:**
- After adding or removing models in `src/data/modelLicenses.ts`
- After updating model descriptions or licenses
- Before committing changes that affect included models

This ensures the documentation stays in sync with the actual model data used by the application.

## Flatpak npm sources

`generated-sources.json` is generated from `package-lock.json` for offline Flatpak builds.

**Usage:**
```bash
flatpak-node-generator npm package-lock.json -o generated-sources.json
```

**When to run:**
- After changing `package-lock.json`
- Before submitting or testing Flatpak builds

The Flatpak manifest consumes this file alongside the project source so npm packages can be fetched reproducibly by Flatpak Builder.
