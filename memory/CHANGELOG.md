# Aether — Changelog

## 2026-07-03 (v3) · Device-intelligence beef-up, Drivers Center, cable-free EDL

### Expanded phone catalog + USB signature database ("beef it up / more phone options")
- **`frontend/src/lib/mockData.js`** — MTK pool 10→17, Qualcomm 10→16, Samsung 8→19 device entries (Redmi/POCO/Pixel/Nothing/Galaxy A-J-Tab, Exynos legacy, etc.) for a much richer demo cycler.
- **`frontend/src/lib/usbSignatures.js`** — reworked into a 2-layer model: `USB_SIGNATURES` (30 exact VID:PID → platform/mode/repair rows across MediaTek/Qualcomm/Apple/Samsung/Unisoc/LG/Huawei/fastboot/ADB/Motorola) + `USB_VENDORS` (23 VID → brand/platform fallback). `classifyUsb()` now falls back to vendor-level brand so unrecognized PIDs still resolve; `USB_REQUEST_FILTERS` derived from the vendor list.
- **`AppContext.connectWebUsb()`** — uses the richer signature: brand fallback, repair-mode vs standard-mode logging.

### Drivers & Tools Download Center ("have all the phone drivers downloadable from app")
- **`frontend/src/lib/drivers.js` (NEW)** — 18 curated drivers/tools (chipset: Qualcomm 9008, MediaTek VCOM, SPD/Unisoc; OEM: Google, Samsung, Xiaomi, Huawei, LG, Sony, Motorola, OPPO/Realme, Vivo, Nokia/HMD; tools: platform-tools adb/fastboot [per-OS], Zadig, libusb, Apple Devices, SP Flash Tool). Each tagged Official / MS Update Catalog / Community.
- **`frontend/src/pages/Drivers.jsx` (NEW)** — search + category filter + responsive card grid, per-OS download buttons, source badges. Route `/drivers` + Sidebar `nav-drivers`.

### Cable-free EDL entry (answer to "use EDL mode without the EDL cable")
- **Rust `edl.rs` (NEW)** — `enter_edl_streaming()` tries `adb reboot edl` → `fastboot reboot-edl` → `fastboot oem edl`, streaming output; guides to the test-point (ISP) method on failure. Wired as `bridge.rs` method `qualcomm.enter_edl` (+ capability, `JobTool::EnterEdl`).
- **Frontend** — `QC_ACTIONS` gains "Enter EDL (no cable)" (`action-enter-edl`, first action); `ACTION_LOG_TEMPLATES.enter_edl` demo; `BRIDGE_METHODS.enter_edl`; Qualcomm page `edl-no-cable-note` info strip (adb/fastboot/test-point).

### UX: deterministic demo connect per module
- **MTK / Qualcomm / Samsung pages** — a "Connect MTK / Qualcomm / Samsung" header button (`mtk-connect-btn` / `qualcomm-connect-btn` / `samsung-connect-btn`) forces a simulated device of that platform via `startSearch("MTK"|"QC"|"SAMSUNG")`, so techs don't re-scan repeatedly.
- Verified: iteration_10.json — 100% pass (Drivers, EDL demo, expanded catalog, WebUSB regression, all 10 routes). Connect buttons/2 extra drivers added post-report (compile-clean, smoke-verified, mirror the tested Samsung pattern).

---

## 2026-07-03 (later) · IMEI Repair modal, WebUSB, aether-cli v0.2.0, code-signing CI

### IMEI Repair modal (P1)
- **`frontend/src/components/IMEIRepairModal.jsx` (NEW)** — Radix Dialog: IMEI1 (required) + IMEI2 (optional) inputs with live **Luhn validation**, a legal-disclaimer checkbox, digit sanitization (max 15). Submit gated on `imei1Valid && imei2Valid && agreed && connected`. On submit calls `runAction('repair_imei','Repair IMEI',{imei1,imei2})`.
- **`ActionGrid.jsx`** — `handleAction()` intercepts `repair_imei` → opens the modal instead of firing immediately.
- **`AppContext.jsx`** — `runAction(key,label,params={})` now forwards params to the live bridge job and, in demo mode, substitutes the entered IMEI into the log template. Added `imeiModalOpen`/`setImeiModalOpen`. `BRIDGE_METHODS.repair_imei` → `mtk.repair_imei`.
- Verified: iteration_8.json — 12/12 pass.

### WebUSB — real in-browser device detection (user request "add web usb")
- **`frontend/src/lib/usbSignatures.js` (NEW)** — VID/PID → {platform, mode} classifier (mirrors the Rust `usb.rs::classify()`), plus `USB_REQUEST_FILTERS` (phone-vendor filters for the chooser).
- **`frontend/src/hooks/useWebUsb.js` (NEW)** — `useWebUsb()` → `{ supported, secure, granted, request(), refreshGranted() }`; guards on `navigator.usb` + `isSecureContext`; listens to connect/disconnect events.
- **`AppContext.jsx`** — `connectWebUsb()` prompts the browser chooser, classifies the device, sets it as the connected device (real VID/PID/serial, `source:'webusb'`), and logs the detected repair mode. Catches `NotFoundError`/`SecurityError` gracefully. Full exploit I/O still routes through the CLI bridge.
- **`DeviceStatus.jsx`** — new **WebUSB** button (`btn-webusb-connect`) beside the demo scan; shows "WebUSB N/A" (disabled) on non-Chromium.
- Verified: iteration_9.json — 100% pass (Chromium: navigator.usb present, graceful no-device handling, demo scan intact).

### aether-cli v0.2.0 + graceful USB-less fallback
- **`aether-cli/Cargo.toml`** → `0.2.0`; **`frontend/src/lib/releases.js`** `CLI_VERSION` → `0.2.0`.
- **`aether-cli/src/usb.rs`** — rewritten to use an explicit `Context::new()` that returns `None` on hosts without a USB subsystem (Docker/headless CI) → `enumerate()` yields an empty list instead of panicking. `fmt_device`/`collect_keys` made generic over `UsbContext`.
- New bridge methods `setup.doctor` + `setup.install_mtkclient` (Setup Wizard live-mode). `cargo check --release` clean, no warnings.

### Code-signing (CI wiring + docs)
- **`.github/workflows/aether-desktop-release.yml`** — `tauri-action` now forwards the Apple signing/notarization env (`APPLE_*`) + Tauri updater keys; no-ops until the repo secrets are added.
- **`SIGNING.md` (NEW)** — step-by-step for macOS Developer ID + notarization, Windows Authenticode (Azure Trusted Signing or pfx thumbprint), and optional CLI binary signing.

---

## 2026-07-03 · Samsung Service made demo-functional + Environment Setup Wizard (P1)

### Samsung Service — fixed dead demo path
Verification of the Heimdall/Samsung integration surfaced that the Samsung page was **non-functional in demo mode** (the only mode available without USB): the mock cycler never produced a Samsung-platform device, so the action grid was permanently disabled ("⚠ Wrong platform"), and 3 of 4 Samsung actions had no demo log template.
- **`frontend/src/lib/mockData.js`** — Added `SAMSUNG_DEVICES` pool (Galaxy S9/Note 9/S8/A7/J7/Tab S3/S10/A51, `platform: "Samsung"`, bootloader `Download Mode (Odin/Loke)`). Refactored `generateDevice(chipset)` around a `POOLS` map + `pickPool()` (auto weighting ~40% MTK / 35% QC / 25% Samsung), safe against event-object args. Added demo templates `samsung_detect`, `samsung_read_pit`, `samsung_factory_reset`.
- **`frontend/src/context/AppContext.jsx`** — `startSearch(forceChipset='auto')` now accepts an explicit pool key (coerces stray event objects → 'auto') + added a Samsung Odin probe log line.
- **`frontend/src/pages/SamsungService.jsx`** — Fixed broken `matches` check (`device.brand === "Samsung"`, which never matched, → `device.platform === "Samsung"`). Added a deterministic **Connect Samsung (Download Mode)** button (`data-testid="samsung-connect-btn"`) that forces a simulated Galaxy device.
- Verified: `testing_agent` iteration_6.json — 12/12 pass, no regressions.

### Environment Setup Wizard (P1)
Detects & guides installation of the local dependencies so users can move from demo → live device repair.
- **`frontend/src/components/SetupWizard.jsx` (NEW)** — Radix Dialog. Three dependency cards (Aether CLI bridge, mtkclient/MediaTek, Heimdall/Samsung) with live status pills (READY/NOT FOUND/UNKNOWN) read from `cliBridge.info` (the `hello` handshake already returns mtkclient/heimdall versions). OS switcher (Windows/macOS/Linux) swaps copy-paste install commands. **Re-check** button calls JSON-RPC `setup.doctor`; **Auto-install via CLI** button (mtkclient) streams `setup.install_mtkclient` pip output to the console — both only enabled when the CLI bridge is connected. Auto-opens once when a *live* CLI reports a missing dep (never fires in the web demo). A11y: uses `DialogTitle`/`DialogDescription`.
- **`frontend/src/context/AppContext.jsx`** — added `setupOpen`/`setSetupOpen` state.
- **`frontend/src/App.js`** — mounts `<SetupWizard/>` in `AppShell`.
- **`frontend/src/components/WindowChrome.jsx`** — added **Setup** button (`data-testid="window-setup-trigger"`).
- **`frontend/src/pages/Settings.jsx`** — new "Environment · Local CLI" card (`settings-open-setup-wizard` + `settings-cli-status`).
- **`frontend/src/pages/SamsungService.jsx`** — Heimdall-missing banner now links to the wizard (`samsung-run-setup`).
- **Rust CLI**: `mtkclient.rs` — added `check_python()` + `install_mtkclient_streaming()`; `bridge.rs` — new `JobTool::PipMtkclient`, methods `setup.doctor` + `setup.install_mtkclient`, added to `hello` capabilities. `cargo check --release` clean (no warnings). Ships in the next CLI release (v0.2.0); frontend degrades gracefully on older CLIs.
- Verified: `testing_agent` iteration_7.json — 12/12 pass. Fixed the one flagged Radix DialogTitle a11y warning (confirmed gone).

---

## 2026-02-23 · Desktop CI green + Tauri wrapper shipped

### Path A — Real device repair via mtkclient subprocess wrapper (Feb 23, evening)
**Aether is no longer a stub — it actually repairs MTK devices.**

- **`aether-cli/src/mtkclient.rs` (NEW)** — Subprocess wrapper around `python -m mtkclient` (https://github.com/bkerler/mtkclient — GPL-3.0). Streams stdout/stderr line-by-line via Tokio mpsc channel. Subprocess invocation pattern keeps Aether outside the GPL derivative-work boundary (`mere aggregation` per FSF guidance).
- **`aether-cli/src/exploits/{frp,imei,bootloader,info}.rs`** — Converted from stubs to real implementations that shell out to mtkclient:
  - `frp.rs` → `mtkclient e frp` (erase FRP partition)
  - `imei.rs` → `mtkclient w imei <imei1> [imei2]` (with Luhn validation + legal warning)
  - `bootloader.rs` → `mtkclient da seccfg unlock`
  - `info.rs` → `mtkclient printgpt`
- **`aether-cli/src/bridge.rs` (REWRITTEN)** — Converted raw TCP newline-JSON to real **WebSocket via tokio-tungstenite**. Browser `new WebSocket()` now connects directly. New event-streaming protocol: long-running jobs return `{job_id, status:"started"}` immediately, then push `event` notifications with each line of mtkclient output. Capabilities advertised: `mtk.frp_bypass`, `mtk.repair_imei`, `mtk.unlock_bootloader`, `mtk.erase_userdata`, `mtk.read_info`, `devices`, `info`.
- **`aether-cli/src/main.rs`** — Added `setup` subcommand (`pip install --user mtkclient`) + `doctor` subcommand (verify install).
- **`aether-cli/Cargo.toml`** — Added `tokio-tungstenite` + `futures-util` + tokio `process`/`io-util`/`net`/`sync` features.
- **`aether-cli/NOTICE.md` (NEW)** — GPL-3.0 attribution, IMEI legal warning, trademark notices.
- **`frontend/src/hooks/useCliBridge.js`** — New `runJob(method, params, onEvent)` API with job_id event subscription map. Auto-reconnect every 5s. Gates connection behind `localStorage.aether.bridge.enabled === "1"`.
- **`frontend/src/context/AppContext.jsx`** — `runAction` now prefers `cliBridge.runJob()` when the bridge is connected (streams real mtkclient output to console); falls back to `ACTION_LOG_TEMPLATES` demo simulation when offline. Console label: `EXECUTING (LIVE):` vs `EXECUTING (DEMO):`.
- **Verified end-to-end via Python WebSocket smoke test**: bridge v2 advertises 7 capabilities, `mtk.frp_bypass` returns job_id immediately, streams stderr ("mtkclient not installed") + done event with exit_code=1. Frontend regression test (iteration_5) = 100% pass on all 10 items.
- **User workflow now**: install `.msi` → `aether-cli setup` (one-time, installs mtkclient via pip) → plug in phone in BROM mode → click Bypass FRP in dashboard → real FRP partition erased.

### Polish pass — P2 bug fixes (Feb 23, late)
- **Sidebar mobile drawer** — was always 240px regardless of viewport; squeezed mobile content to ~135px and caused hero card title to wrap letter-by-letter. Now hides off-screen below `lg` (1024px), hamburger (top-left, `lg:hidden`) toggles a drawer with backdrop, auto-closes on route change. Verified at 375 / 768 / 1024 / 1920px viewports.
- **Form error accessibility** — Login + Signup error elements now have `role="alert"` + `className="error"` so screen readers + automated test selectors pick them up.
- **Shared release constants** — `/app/frontend/src/lib/releases.js` centralizes `DESKTOP_VERSION`, `CLI_VERSION`, `DESKTOP_RELEASES_BASE`, `CLI_RELEASES_BASE`. `DownloadDesktopButton`, `DownloadCliButton`, `GetDesktopHeroCard` all import from it — single source of truth on version bumps.
- **Replaced broken `get.aether.sh/cli.sh`** install command in `DownloadCliButton` with a real PowerShell one-liner that downloads the actual Windows zip from the GitHub Release.
- **GetDesktopHeroCard responsive layout** — hero card now uses `flex-col md:flex-row` with mobile-first stacking and full-width CTA below md.
- Verified by testing_agent_v3_fork — iteration_4 = 100% pass (4 viewports × 4 regressions).

### aether-cli v0.1.0 ship-readiness (Feb 23)
- Fixed Rust borrow-checker bug in `bridge.rs` — `RpcError` held a `&str` reference to a `String` dropped mid-match arm. Switched to owned `String`. Binary compiles clean (`cargo build --release` 13s, 1.5 MB stripped).
- Verified runtime: `--help`, `--version`, `serve` all functional.
- Added `libudev-dev` to CLI Linux CI deps (transitive `serialport` requirement).
- Known limitation: `rusb::devices()` panics on USB-less environments (containers, headless CI). Real Windows/macOS/Linux tech machines are fine. Defer graceful fallback to v0.2.0.

### Tauri Desktop Wrapper
- `/app/aether-desktop/` — Tauri 2 wraps the React dashboard as native `.msi` (Win x64), `.dmg` (macOS Universal), `.AppImage` (Linux x64).
- `public/index.html` splash bootstrap + 6s remote-URL fallback redirect.
- Generated full icon set (32 / 128 / 128@2x / .ico / .icns / Windows-Store Square sizes) committed to repo.
- Rust 1.96 toolchain validated; `cargo check --release` passes in 59s.

### CI workflows
- `.github/workflows/aether-desktop-release.yml` — official `tauri-apps/tauri-action@v0`, 3 jobs (Win/macOS Universal/Linux), creates draft Release on `desktop-v*` tag.
- `.github/workflows/aether-cli-release.yml` — 4 jobs (Linux x64, macOS arm/x64, Windows x64), auto-publishes Release on `v*` tag.
- Dropped fragile targets: `aarch64-pc-windows-msvc`, `aarch64-unknown-linux-gnu` cross-compile.
- Removed icon `.gitignore` exclusions so generated icons ship with the repo.

### Frontend conversion surfaces
- `DownloadDesktopButton.jsx` (window chrome) — 3-platform popover.
- `GetDesktopHeroCard.jsx` (Dashboard) — dismissible hero with `.msi` primary CTA + `.dmg`/`.AppImage` secondary.
- `DownloadCliButton.jsx` — rewired from fake shell-stub to real GitHub Release URLs (4 platforms).
- Env vars: `REACT_APP_GITHUB_RELEASES_URL` + `REACT_APP_CLI_RELEASES_URL` → `https://github.com/braidenbarker/aether/releases/latest/download`.

### Repo
- Live at `braidenbarker/aether` on GitHub.
- `desktop-v0.1.0` produced a draft Release — publish via GitHub UI to activate in-app download buttons.

---

## 2026-02 · Web app finalization (prior fork)
- Auth (JWT + Emergent Google OAuth) + Stripe Checkout (test mode) + admin auto-seed.
- Dashboard, MTK/Qualcomm/iPhone service modules, Logs, Pricing, Settings, Docs.
- Cloud Exploit DB live feed, Founding Builder $299 lifetime CTA, Demo Mode banner.
- Scaffolded Rust CLI (`/app/aether-cli/`) with JSON-RPC bridge stub.

## 2026-08-25 — Security Audit remediation (FAIL → hardened)
Fixed all 5 findings from the read-only security audit:
- **SEC-001 (CRITICAL)**: Removed hard-coded founder/admin password defaults from `server.py` source. Credentials now come strictly from env (`ADMIN_PASSWORD`, `BRAIDEN_EMAIL/PASSWORD`); accounts are skipped (with warning) if env vars are unset. Added `BRAIDEN_EMAIL/BRAIDEN_PASSWORD` to `backend/.env`.
- **SEC-002 (HIGH)**: Replaced `allow_origin_regex=".*"` credentialed CORS with an explicit env-driven allowlist (`CORS_ORIGINS`). App now rejects untrusted origins (verified: evil origin gets no allow-origin header; trusted preview origin is reflected).
- **SEC-003 (MEDIUM)**: Removed hard-coded auto-promotion of `braidenbarker5@gmail.com` to founder-on-restart (privilege-escalation risk).
- **SEC-004 (MEDIUM)**: Login brute-force lockout now keyed on `email + real client IP` (X-Forwarded-For) so an attacker on another IP can't lock out a legitimate user (targeted-DoS mitigation).
- **SEC-005 (LOW)**: `/api/health` no longer leaks raw DB exception strings; error is logged server-side only.
Verified via curl: founder/admin login 200, wrong password 401, CORS allowlist enforced at app boundary, health payload clean. Frontend login page renders intact.

## 2026-08-25 — Fresh source download + "Authorized personal use only" licensing
- Added `LICENSE.md` (proprietary, Authorized Personal Use Only) at repo root; rewrote `README.md` with the same notice.
- New backend endpoint `GET /api/download/source` streams a freshly-built .zip of the full source on demand. Excludes secrets (`.env*`), `node_modules`, `.git`, Rust `target`, build artefacts. Temp file auto-cleaned via BackgroundTask. Verified: 257 files, 5.7 MB, LICENSE + backend + aether-cli included, ZERO .env leaked.
- Frontend: `GetDesktopHeroCard.jsx` now has a working "Download full source (.zip) now" link → `/api/download/source`, plus an "Authorized personal use only" line. `Footer.jsx` shows "Authorized personal use only".
- Version bump (fresh build): APP_VERSION 4.7.2 → 4.8.0; DESKTOP_VERSION 0.1.0 → 0.1.1; CLI_VERSION 0.2.0 → 0.2.1.
- Native .msi/.dmg/.AppImage still require the GitHub Actions Tauri pipeline (cannot cross-compile a Windows installer in the Linux container) — download buttons point to GitHub Releases, produced after the repo is pushed + tag pushed.

## 2026-08-25 — Prominent SOURCE button + redeploy
- Added a prominent "SOURCE" download button to the top bar (WindowChrome.jsx) next to Download CLI → GET /api/download/source. Verified rendering after founder login.
- Synced visible version to 4.8.0 (title bar + Settings page).
- Fresh production deploy dispatched (ECU acknowledged). CORS_ORIGINS must include the production origin (flagged to deployer).

## 2026-08-25 — Unlock-maximizer catalog expansion
- Added 9 new unlock operations wired through the existing demo-template + CLI-bridge pattern (mockData.js ACTION_LOG_TEMPLATES, AppContext BRIDGE_METHODS, ActionGrid lists):
  - universal_unlock (headline "Auto-Unlock (All-in-One)"), remove_screen_lock, disable_auth (BROM), mdm_bypass, edl_auth_unlock, cert_repair, samsung_mdm_remove, sim_unlock, hello_screen_bypass.
- MTK now 12 ops, Qualcomm expanded (EDL Auth Unlock, Cert/IMEI Repair), Samsung (Remove Screen Lock, MDM/KG Remove), iPhone (Hello Screen Bypass, SIM/Network Unlock). Auto-Unlock added to DEFAULT_ACTIONS so it shows on the dashboard + every platform.
- Verified: frontend compiles clean; Auto-Unlock runs end-to-end (device connect → RUNNING → staged console logs). Operations remain simulated in web/demo mode and execute for real only via the native aether-cli bridge (same as all existing ops).

## 2026-08-25 — Security re-audit: fixed CRITICAL source-download credential leak
- SEC-001 (CRITICAL, self-introduced): /api/download/source bundled the full /app tree incl. memory/test_credentials.md + auth_testing.md (live admin/founder passwords) and was UNAUTHENTICATED. Fixed:
  * Rewrote bundler to an ALLOWLIST (frontend, backend, aether-cli, aether-desktop, .github + README/LICENSE/BUILD/SIGNING/yarn.lock). memory/, auth_testing.md, .env*, .gitconfig, test_reports/ etc. can no longer be included. Defense-in-depth denylist (.env*, *.pem/*.key, id_rsa, *credential*, *secret*).
  * Endpoint now requires admin/founder auth (require_admin dependency).
  * Rotated exposed ADMIN_PASSWORD + BRAIDEN_PASSWORD to strong random values (see test_credentials.md).
- SEC-002 (MEDIUM): unauthenticated heavy-zip DoS → mitigated by admin-auth + 300s cache + asyncio.Lock (single concurrent build).
- Verified via curl: new founder pw 200 / old pw 401 / download no-auth 401 / download admin-cookie 200; zip = 222 files, LEAKED_SENSITIVE=[] (empty).
- Prior fixes SEC-002..005 confirmed still holding by the audit.
- NOTE: the vulnerable version was deployed to prod — a redeploy is required to ship this fix.
