<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:95965fb4055aa182cae874d1115a4a7ff55abff5578faa9ce082f9ebb88047f8 -->

# Building Aether Repair Tool

> AUTHORIZED PERSONAL USE ONLY — see LICENSE.md.

The app builds with standard Node.js, Python and Rust tools. Runtime code,
Google sign-in, Stripe checkout, artwork and the build no longer depend on
Emergent hosting or packages. Existing license terms remain applicable.

## Get the source

<!-- /coderabbit-ai-generated:v1 -->

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

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d2678985aa5d6a1d4c5aa7cc416ba333a7dcf952d27d72151cf06aebde66ac3d -->

## Direct provider integrations

Install backend dependencies from the standard Python package index using the
command above. `backend/payments.py` owns the checkout adapter and uses the
official `stripe` SDK. `backend/google_auth.py` owns the Google authorization
code exchange with PKCE. No universal LLM key is used by the running app;
the social preview image and logo are included in `frontend/public/`.

Email/password accounts work with only MongoDB and `JWT_SECRET` configured.
Optional Google sign-in needs your own Google OAuth **Web application** client:

```dotenv
APP_ORIGIN="http://localhost:3000"
GOOGLE_CLIENT_ID="<your Google OAuth client ID>"
GOOGLE_CLIENT_SECRET="<your Google OAuth client secret>"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
```

Register that exact redirect URI with Google. When the API is hosted separately,
use its public callback URL for `GOOGLE_REDIRECT_URI`, keep `APP_ORIGIN` set to
the frontend origin and include that origin in `CORS_ORIGINS`. Use HTTPS in
production. Google configuration is discovered through `GET /api/auth/providers`;
unconfigured sign-in shows an error and email login remains available.

Google sign-in starts at `GET /api/auth/google` and completes at the backend
callback, which issues Aether's JWT cookies. The old hosted
`POST /api/auth/session` contract now returns **410 Gone**; users should sign
in again. Existing stored sessions retain their original expiry.

For optional paid plans and credits, configure your own Stripe account:

```dotenv
STRIPE_API_KEY="<your Stripe secret key>"
STRIPE_WEBHOOK_SECRET="<signing secret for your webhook endpoint>"
```

Register `/api/webhook/stripe` with Stripe for `checkout.session.completed`
and `checkout.session.async_payment_succeeded`. Unsigned, altered and expired
notifications return 400; an unconfigured webhook returns 503. This replaces
the former unsigned webhook behavior. Prices and credit grants remain defined
on the server. Repeated webhook deliveries and status polls grant each purchase
once, using an atomic marker on the user document.

The donation page lists an e-Transfer recipient and opens no payment processor.
The app cannot confirm bank transfers. No payment emulator is required.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ad3303802001183549e126a1baa3e2b501d1b23f688f4350664ca1290db35598 -->

## Native desktop app (Windows)

Aether's primary delivery is a Windows desktop installer. See
[aether-desktop/README.md](aether-desktop/README.md) for prerequisites and commands.
Its build hook includes the interface, CLI and frozen API, with per-user SQLite
storage. Users do not need the development checkout, Node, or MongoDB to open
it. Vendor USB drivers and external device utilities retain their setup steps.

The hosted frontend/backend commands above remain available for development.
The desktop workspace is local; it does not automatically migrate hosted users.
Existing free operation pricing and device behavior are preserved.

## Deploy anywhere

<!-- /coderabbit-ai-generated:v1 -->

- Frontend `build/` → any static host (Vercel, Netlify, Cloudflare Pages, nginx).
- Backend → any container/VM running `uvicorn`. Set the env vars above.
- Point the frontend `REACT_APP_BACKEND_URL` at your backend's public URL and
  add that origin to the backend `CORS_ORIGINS`.
