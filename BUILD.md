# Building Aether Repair Tool outside Emergent

> AUTHORIZED PERSONAL USE ONLY — see LICENSE.md.

The codebase is fully portable. Nothing in the source depends on the Emergent
publish button. You can build and run it with any toolchain.

## Get the source

- In-app: click **SOURCE** in the top bar (or the "Download full source" link).
- Direct: `GET {BACKEND_URL}/api/download/source` → `aether-repair-tool-src-vX.Y.Z.zip`
  (secrets/.env and node_modules are excluded automatically).

## Prerequisites

- Node.js 20+ and Yarn 1.x
- Python 3.11+
- MongoDB (local or Atlas)
- (desktop build) Rust stable + Tauri 2 prerequisites (WebView2 on Windows,
  webkit2gtk on Linux, Xcode CLT on macOS)

## Frontend (React)

```bash
cd frontend
yarn install
# set the backend URL the app should call:
echo 'REACT_APP_BACKEND_URL=http://localhost:8001' > .env
yarn build          # production bundle in frontend/build
# or: yarn start     # dev server on :3000
```

## Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# create backend/.env (see "Environment" below), then:
uvicorn server:app --host 0.0.0.0 --port 8001
```

### Environment (backend/.env)

```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="aether"
JWT_SECRET="<random 64-char hex>"
CORS_ORIGINS="http://localhost:3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="<your admin pw>"
BRAIDEN_EMAIL="you@example.com"
BRAIDEN_PASSWORD="<your founder pw>"
STRIPE_API_KEY="<your stripe secret key>"      # only needed for payments
```

## The one Emergent-specific dependency

`requirements.txt` pins **`emergentintegrations`**, an Emergent-hosted package
used for two things:

1. **Stripe checkout** (`emergentintegrations.payments.stripe.checkout`)
2. **LLM calls** via the Emergent universal key (`EMERGENT_LLM_KEY`)

Off-platform this package is installed from Emergent's index:

```
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```

If you want a fully vendor-neutral build with **zero Emergent dependency**,
replace it with the official SDKs:

- **Stripe** → use the official `stripe` PyPI package. The checkout call in
  `backend/server.py` (`StripeCheckout` / `CheckoutSessionRequest`) maps 1:1 to
  `stripe.checkout.Session.create(...)`; pricing is already server-side in
  `PRICING_TIERS`, so only the SDK call needs swapping.
- **LLM** (only used for the OG preview image generation) → drop it or point at
  your own OpenAI/Anthropic/Gemini key.
- **Google login** uses `demobackend.emergentagent.com` (Emergent OAuth). Custom
  JWT email/password login works with no external service and needs no change.

## Native desktop app (Tauri)

```bash
cd aether-desktop
yarn install
yarn tauri build     # produces .msi (Windows) / .dmg (macOS) / .AppImage (Linux)
```

The bundled Rust CLI lives in `aether-cli` (`cargo build --release`). It is the
component that talks to real USB hardware (rusb/libusb) on the technician's
machine.

## Deploy anywhere

- Frontend `build/` → any static host (Vercel, Netlify, Cloudflare Pages, nginx).
- Backend → any container/VM running `uvicorn`. Set the env vars above.
- Point the frontend `REACT_APP_BACKEND_URL` at your backend's public URL and
  add that origin to the backend `CORS_ORIGINS`.
