# Aether Repair Tool

Desktop-style mobile-repair suite (MTK · Qualcomm · Samsung · iPhone) with a
React dashboard, FastAPI backend, and a native Rust CLI / Tauri desktop bridge
that talks to USB devices (BROM / EDL / DFU / Download mode) directly.

> ## ⚠️ AUTHORIZED PERSONAL USE ONLY
> Copyright (c) 2026 Braiden Barker. All rights reserved.
> This software is proprietary and licensed for the original owner's **personal,
> non-commercial, private use only**. Redistribution, resale, or public
> availability is prohibited. Use only on devices you own or are explicitly
> authorized to service. See [LICENSE.md](./LICENSE.md).

## Structure

```
backend/          FastAPI + MongoDB (auth, Stripe credits, health, source download)
frontend/         React + Shadcn UI dashboard
aether-cli/       Rust CLI — real USB bridge (rusb/libusb), JSON-RPC WebSocket
aether-desktop/   Tauri 2 desktop wrapper (Rust)
.github/workflows Native build pipelines (desktop .msi / .dmg / .AppImage, CLI)
```

## How device I/O actually works

- The **hosted web app** runs on a remote server with no physical USB — it
  cannot flash a phone. It offers WebUSB *detection* only.
- **Real repair** runs through `aether-cli` (native Rust binary) on your own
  machine; the dashboard connects to it via a local WebSocket bridge.
- Native installers are produced by the GitHub Actions workflows (push a
  `desktop-vX.Y.Z` / `vX.Y.Z` tag after connecting the repo).

## Downloads

- **Full source (.zip)** — `GET /api/download/source` (fresh, secrets excluded).
- **Native builds** — published to GitHub Releases by the CI workflows.
