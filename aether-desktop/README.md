# Aether Desktop

Native Windows / macOS / Linux desktop application for the Aether Repair Tool.
A thin **Tauri 2.0** WebView that hosts the dashboard in its own window —
no browser required.

```
┌────────────────────────────────────────────────────────────────────┐
│   ▣  Aether Repair Tool                            ─  ☐  ✕         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│        [ … the same React dashboard, but in a native window … ]    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

* Tiny binary (~6–10 MB Windows `.exe`, ~10 MB macOS app, ~15 MB Linux AppImage).
* Native title bar + system tray + auto-update support.
* WebView2 on Windows (Edge Chromium) → modern web platform, no Electron bloat.
* Future-proof: when `aether-cli` has real exploits, import the crate directly into `src-tauri/Cargo.toml` (commented out for now) and expose them as Tauri commands — the React app calls `invoke('bypass_frp', { port })` instead of fetching from a WebSocket bridge.

---

## Prerequisites

1. **Rust toolchain** — install from [rustup.rs](https://rustup.rs).
2. **Node.js 18+** — for the Tauri CLI.
3. **Platform-specific deps:**

   | OS | Deps |
   | --- | --- |
   | **Windows** | Visual Studio 2022 Build Tools with the "Desktop development with C++" workload + WebView2 runtime (auto-installed by Tauri). |
   | **macOS** | Xcode Command Line Tools (`xcode-select --install`). |
   | **Linux** | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu). |

---

## Build

```bash
cd aether-desktop
yarn install

# (Optional — only if you want a different icon set than the auto-downloaded
# Aether logo at src-tauri/icons/source.png — see icons/README.md.)
yarn tauri icon src-tauri/icons/source.png

# Build the platform installer:
yarn build:msi        # Windows .msi   (the recommended Windows installer)
yarn build:nsis       # Windows .exe   (NSIS installer)
yarn build:dmg        # macOS .dmg
yarn build:appimage   # Linux .AppImage
yarn build            # everything supported on the current host
```

> **Note:** `frontendDist` in `tauri.conf.json` points at `../public/` which
> contains a tiny `index.html` bootstrap. The real dashboard is loaded from
> `app.windows[0].url` (the deployed Emergent host); the bootstrap is only
> shown as a graceful "trying to reach Aether" fallback when the user is
> offline or the server is unreachable.

The installer drops out at:

* Windows: `src-tauri/target/release/bundle/msi/Aether_0.1.0_x64_en-US.msi`
* macOS:   `src-tauri/target/release/bundle/dmg/Aether_0.1.0_aarch64.dmg`
* Linux:   `src-tauri/target/release/bundle/appimage/aether-desktop_0.1.0_amd64.AppImage`

Double-click the installer → app appears in Start menu / Launchpad / Apps. Launching it opens the Aether Repair Tool in its own native window.

---

## How it loads the dashboard

By default the window URL points at the deployed production dashboard:

```
https://mtk-qualcomm-tool.emergent.host
```

(see `src-tauri/tauri.conf.json` → `app.windows[0].url`).

To change to a different URL — e.g. point at your future custom domain — edit that field and rebuild.

---

## Wiring the local CLI

Once you have a real `aether-cli` with working exploits, two options:

### Option A — Spawn the CLI on app launch
Add to `src-tauri/src/lib.rs`:

```rust
use tauri::Manager;
use std::process::{Command, Stdio};

pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            // Spawn the bundled CLI in the background so the web UI's
            // useCliBridge hook can connect to ws://127.0.0.1:8765.
            let exe = std::env::current_exe()?.parent().unwrap().join("aether-cli.exe");
            Command::new(exe).arg("serve").stdout(Stdio::null()).spawn()?;
            Ok(())
        })
        // ...rest unchanged
        .run(tauri::generate_context!())
        .expect("error while running");
}
```

Then add the compiled `aether-cli.exe` to `bundle.resources` in `tauri.conf.json`.

### Option B — Direct IPC (recommended)
Add the CLI as a crate dep:

```toml
# src-tauri/Cargo.toml
aether-cli = { path = "../../aether-cli" }
```

Then expose `#[tauri::command]` functions in `lib.rs` that call into the CLI's
exploit modules. The React app calls them via `invoke('bypass_frp', { port })` instead of hitting `ws://127.0.0.1:8765`.

This removes one whole moving part — no separate process, no port to bind. Recommended.

---

## CI / releases

A GitHub Actions workflow is included at `.github/workflows/aether-desktop-release.yml`. Tag a release (`git tag v0.1.0 && git push --tags`) and the matrix builds the `.msi` / `.dmg` / `.AppImage` for x64 and arm64 across Windows / macOS / Linux, then publishes them to GitHub Releases.

After your first release, point the **"Download Aether CLI"** popover in the web app (`/app/frontend/src/components/DownloadCliButton.jsx`) at:

```
https://github.com/<your-org>/aether/releases/latest/download/Aether_${target}.msi
```

…and the dashboard now offers a real Windows installer to your users.

---

## Why Tauri over Electron

|                            | Tauri | Electron |
| -------------------------- | ----- | -------- |
| Windows installer size     | ~6 MB | ~80 MB   |
| RAM on idle                | ~70 MB | ~250 MB |
| WebView                    | OS-native (WebView2 / WebKit) | Bundled Chromium |
| Backend language           | Rust (matches `aether-cli`) | Node.js |
| Auto-updater               | built-in | needs `electron-updater` |
| Security model             | capability-based ACL | broader by default |

For a Rust-heavy repair tool, Tauri is the obvious pick.
