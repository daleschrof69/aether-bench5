# Aether — Roadmap

## P0 — Active
*(empty — Samsung demo path fixed & verified, Setup Wizard shipped & verified, desktop CI green, web app 100%)*

## P1 — Next up (git actions — need the user via "Save to GitHub")
- **Ship aether-cli v0.2.0** — Cargo.toml bumped to 0.2.0; adds `setup.doctor`, `setup.install_mtkclient`, `qualcomm.enter_edl` + graceful USB-less fallback. Tag `v0.2.0` → CI publishes 4 artifacts. (Setup Wizard auto-install & live cable-free EDL need this build.)
- **Publish the desktop draft Release** (`braidenbarker/aether`) → flips all in-app download buttons live.
- **Re-tag `desktop-v0.1.0`** so the rewritten workflow runs cleanly (delete old tag → push new tag).
- **Add code-signing secrets** (see `/SIGNING.md`) — macOS APPLE_* + Windows Authenticode so installers don't trip SmartScreen/Gatekeeper.

### Shipped this session (was P1)
- IMEI Repair modal (iteration_8) · WebUSB detection (iteration_9) · Drivers Center + cable-free EDL + expanded catalog (iteration_10) · Setup Wizard · Samsung demo fix · graceful `rusb` fallback · per-module deterministic Connect buttons.

## P2 — Backlog
- Real Samsung FRP via Heimdall — add a `samsung.frp_bypass` CLI method (Samsung "Bypass FRP" currently reuses the mtk `bypass_frp` demo template).
- Persist credits + log history to MongoDB (currently client-side only).
- Port real Qualcomm exploits — wrap `edl.py` (https://github.com/bkerler/edl) so `qualcomm.enter_edl` can chain into a real Firehose flash.
- WebUSB deep read — claim the interface + read real chip IDs/partitions in-browser (currently detection/identify only).
- Wire download buttons to tag-specific URLs so desktop + CLI releases can coexist.
- "Sign in on Desktop" deep-link flow — first-launch auto-auth.
- Theme toggle (light mode), multi-language.

## P3 — Future
- Braiden AI Companion HUD (Claude Sonnet 4.5 via Emergent LLM Key) — context-aware floating chat reading active operation + console logs.
- Auto-update channel for the Tauri app (built-in support, needs signing keys wired).
- Apple DFU support — wrap `checkra1n` / `pongoOS` for legacy iPhone models.
- Port real exploit code to pure Rust (replace Python mtkclient / C++ heimdall subprocess wrappers) — long-term.
