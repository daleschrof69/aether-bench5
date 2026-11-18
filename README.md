# Aether Repair Tool

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:bc504711e5664dae5a8d6d9436750bbc071a3b104d483219ef1f6f14dcd0ee81 -->

Windows desktop mobile-repair suite (MTK · Qualcomm · Samsung · iPhone), with
an installed Tauri application, bundled interface/API/CLI, and local SQLite
workspace. See [Desktop build and installation](aether-desktop/README.md).
Device-specific drivers and external repair tools retain their setup steps.

<!-- /coderabbit-ai-generated:v1 -->

> ## ⚠️ AUTHORIZED PERSONAL USE ONLY
> Copyright (c) 2026 Braiden Barker. All rights reserved.
> This software is proprietary and licensed for the original owner's **personal,
> non-commercial, private use only**. Redistribution, resale, or public
> availability is prohibited. Use only on devices you own or are explicitly
> authorized to service. See [LICENSE.md](./LICENSE.md).

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:3aafe90dd2a83248b690cc92664dde7f6a19e94769fbf832a216a711989a8868 -->

## Structure

```text
backend/          FastAPI API; SQLite for desktop, MongoDB for hosted development
frontend/         Interface compiled into the desktop installer
aether-cli/       Native Rust USB/JSON-RPC bridge
aether-desktop/   Tauri application, local runtime packaging, Windows MSI/EXE builds
.github/workflows Windows desktop artifact build and standalone CLI pipelines
```

## Install and run

Build the Windows installer with the commands in
[aether-desktop/README.md](aether-desktop/README.md), then launch Aether from the
Start menu. The installed window starts its bundled API and CLI, stores the
workspace locally, and uses the connected computer's USB devices. Drivers and
external vendor tools must be installed for the device operations that need them.

The Windows workflow uploads installer artifacts for review. It does not publish
releases automatically. Windows installation and physical device operations must
be verified before release. See [BUILD.md](BUILD.md) for the development server
commands; the installed application does not depend on those servers.


<!-- /coderabbit-ai-generated:v1 -->