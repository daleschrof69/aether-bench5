# Aether Repair Tool — PRD

## 2026-02-XX — FRP → Aegis Unlock rebrand
User-facing "FRP" / "Factory Reset Protection" strings replaced with the fancier, publishable brand **"Aegis Unlock"** across:
- ActionGrid buttons (MTK, Samsung, "Read Aegis Token")
- Pricing page (service card + Solo Builder feature bullet)
- Signup subtitle, Terms clause, Samsung Knox advisory
- Docs (`content/docs/index.js` — title, summary, procedure, related-guides)
- Mock console log templates (`bypass_frp`, `read_frp_token`)
Internal wire keys (`bypass_frp`, `read_frp_token`, `mtk.frp_bypass`) and the low-level `frp` partition reference in deep-tech console lines are intentionally preserved so the CLI/backend contract is untouched.


## Original Problem Statement
Desktop-style dashboard for a mobile-repair suite named "Aether Repair Tool". UI must look like a professional Windows utility (dark mode, cyber green/teal accents, high-tech) similar to Chimera Tools. Features: Sidebar, Dashboard (device status, cloud exploit DB), MTK / Qualcomm / iPhone service tabs with action buttons, scrolling console, device info. Requires Auth (JWT + Emergent Google), Stripe credits, Aether Academy documentation, native desktop executable packaging (Tauri).

## Architecture
- `/app/backend` — FastAPI, MongoDB, JWT + Emergent Google Auth, Stripe webhooks (all routes `/api`-prefixed).
- `/app/frontend` — React + Tailwind + Shadcn UI (uses `REACT_APP_BACKEND_URL`).
- `/app/aether-cli` — LOCAL-ONLY Rust WebSocket JSON-RPC bridge (port 8765) for real hardware exploits.
- `/app/aether-desktop` — LOCAL-ONLY Tauri wrapper packaging the web app as a native desktop executable.

## Implemented
- Dashboard, MTK / Qualcomm / iPhone / Samsung service pages with action grid + streaming console
- Auth (JWT email/password + Emergent Google OAuth)
- Stripe credits/licenses integration
- Aether Academy docs (in-app)
- Setup Wizard, IMEI Repair Modal, WebUSB integration
- Cable-free EDL mode wrapper in Rust CLI
- Drivers Center with expanded driver catalog
- Device signature catalog (18+ devices)
- Cloud Exploit DB view with live-feed simulation
- Tauri desktop packaging skeleton

## Deployment
- ✅ Deployment health check PASSED (Feb 2026)

## Code Quality — Sweep 1 (Feb 2026, iteration_11)
- `DeviceStatus.jsx`: HEADER_STATES lookup + 6 single-purpose sub-components
- `ActionGrid.jsx`: extracted `ActionButton`
- `BuyCreditsModal.jsx`: extracted `PlanCard` + `PackCard`
- `CloudExploitDB.jsx`: extracted `CVEEntry` + `useMemo` on visible/counts
- `ProtectedRoute.jsx`: `useMemo` for redirect state
- `useCliBridge.js`: removed `no-async-promise-executor` anti-pattern
- Error-logging in empty catch blocks (GetDesktopHeroCard, DemoModeBanner, SetupWizard)

## Code Quality — Sweep 2 (Feb 2026, iteration_12) — 100 % pass
- `Sidebar.jsx`: extracted `BrandHeader`, `CreditsWidget`, `BuyCreditsCta`, `NavItem`, `NavList`, `LicenseBadge`
- `DownloadCliButton.jsx`: extracted `CliTrigger`, `InstallCommand`, `PlatformGrid`, `CliPopover`
- `DownloadDesktopButton.jsx`: extracted `DesktopTrigger`, `BuildRow`, `DesktopPopover`
- `GetDesktopHeroCard.jsx`: extracted `ScanLineOverlay`, `HeroInfo`, `HeroActions`
- `server.py`: split `emergent_session_exchange()` into `_fetch_emergent_profile`, `_upsert_google_user`, `_persist_emergent_session`
- Added type hints across `backend/tests/test_auth_stripe.py`
- New regression suite `backend/tests/test_session_refactor.py` (7/7 pass)

## Deliberately Skipped Review Items (false positives)
- **Python `is None` → `==`** — PEP-8-recommended idiom; changing would be a regression
- **localStorage "sensitive data"** — dismissal flags only contain the boolean `"1"`, not credentials
- **Hook deps for stable React setters / imports / function params** — adding these creates infinite re-render loops (this is exactly what broke `AppContext.jsx` on the last attempt)

## Known Non-Blocking Observations
- Auto-connect delay after fresh login (~15s). Users click Start Scan manually. Fix: gate boot `useEffect` on `AuthContext.loading === false`. Deferred.
- `DownloadCliButton` / `DownloadDesktopButton` popovers don't close on Escape — minor UX polish.

## Backlog (P1)
- Gate boot useEffect on AuthContext resolution to enable post-login auto-connect
- Escape-to-close on download popovers
- Apple DFU (checkra1n / pongoOS) for legacy iPhones
- Braiden AI Companion (Claude Sonnet 4.5 floating chat overlay)

## Backlog (P2)
- Port real exploit code to pure Rust (replace Python mtkclient / C++ heimdall wrappers)

## Test Credentials
See `/app/memory/test_credentials.md`.
