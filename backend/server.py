from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ruff: noqa: E402  (imports intentionally follow load_dotenv per auth playbook)
import os
import logging
import uuid
import asyncio
import tempfile
import zipfile
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

import bcrypt
import jwt as pyjwt
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
import httpx

try:
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout,
        CheckoutSessionRequest,
    )
except ImportError:  # health/version must boot without the Emergent payments SDK
    StripeCheckout = None
    CheckoutSessionRequest = None

# ────────────────────────────────────────────────────────────────────────────
# Configuration
# ────────────────────────────────────────────────────────────────────────────
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MIN = 60 * 24  # 1 day for desktop-app feel
REFRESH_TOKEN_TTL_DAYS = 7
EMERGENT_SESSION_TTL_DAYS = 7

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
EMERGENT_SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# CORS allowlist — explicit origins only. Credentialed CORS cannot use a wildcard.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

# Server-side fixed pricing — NEVER accept amount from client
PRICING_TIERS = {
    "solo_annual":      {"amount": 89.00,  "label": "Solo Builder Edition (1 year)",   "grant_plan": "solo",             "grant_credits": 50},
    "founding_lifetime": {"amount": 299.00, "label": "Founding Builder · Lifetime",     "grant_plan": "founding_builder", "grant_credits": 500},
    "credits_impulse":  {"amount": 9.00,   "label": "Impulse · +15 credits",            "grant_plan": None,               "grant_credits": 15},
    "credits_starter":  {"amount": 19.00,  "label": "Starter · +50 credits",            "grant_plan": None,               "grant_credits": 50},
    "credits_builder":  {"amount": 49.00,  "label": "Builder · +150 credits",           "grant_plan": None,               "grant_credits": 150},
    "credits_workshop": {"amount": 149.00, "label": "Workshop · +500 credits",          "grant_plan": None,               "grant_credits": 500},
    "credits_wholesale":{"amount": 499.00, "label": "Wholesale · +2000 credits",        "grant_plan": None,               "grant_credits": 2000},
}

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("aether")


# ────────────────────────────────────────────────────────────────────────────
# Models
# ────────────────────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str = "user"
    plan: str = "free"
    credits: int = 100
    member_since: str
    provider: str = "email"


class CheckoutCreateRequest(BaseModel):
    tier_id: str
    origin_url: str


# ────────────────────────────────────────────────────────────────────────────
# Password + JWT helpers
# ────────────────────────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_jwt_cookies(response: Response, user_id: str, email: str) -> None:
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=ACCESS_TOKEN_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=REFRESH_TOKEN_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    for c in ("access_token", "refresh_token", "session_token"):
        response.delete_cookie(c, path="/")


def public_user(doc: Dict[str, Any]) -> UserPublic:
    return UserPublic(
        user_id=doc["user_id"],
        email=doc["email"],
        name=doc.get("name"),
        picture=doc.get("picture"),
        role=doc.get("role", "user"),
        plan=doc.get("plan", "free"),
        credits=doc.get("credits", 100),
        provider=doc.get("provider", "email"),
        member_since=(doc.get("created_at") or datetime.now(timezone.utc)).isoformat() if isinstance(doc.get("created_at"), datetime) else (doc.get("created_at") or datetime.now(timezone.utc).isoformat()),
    )


async def _resolve_jwt(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    except pyjwt.PyJWTError:
        return None


async def _resolve_session_token(token: str) -> Optional[Dict[str, Any]]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except ValueError:
            return None
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})


async def get_current_user(request: Request) -> Dict[str, Any]:
    """Accepts JWT access_token cookie OR Emergent session_token cookie OR bearer header."""
    # 1. JWT access_token cookie
    tok = request.cookies.get("access_token")
    if tok:
        user = await _resolve_jwt(tok)
        if user:
            return user
    # 2. Emergent session_token cookie
    sess = request.cookies.get("session_token")
    if sess:
        user = await _resolve_session_token(sess)
        if user:
            return user
    # 3. Authorization Bearer header (testing)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        bearer = auth[7:]
        user = await _resolve_jwt(bearer) or await _resolve_session_token(bearer)
        if user:
            return user
    raise HTTPException(status_code=401, detail="Not authenticated")


# ────────────────────────────────────────────────────────────────────────────
# Brute-force lockout helpers
# ────────────────────────────────────────────────────────────────────────────
def _client_ip(request: Request) -> str:
    """Real client IP behind the k8s ingress/reverse proxy (X-Forwarded-For first hop)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _is_locked(identifier: str) -> bool:
    rec = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if not rec:
        return False
    if rec.get("count", 0) >= 5 and rec.get("locked_until"):
        lu = rec["locked_until"]
        if isinstance(lu, str):
            lu = datetime.fromisoformat(lu)
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        if lu > datetime.now(timezone.utc):
            return True
    return False


async def _register_failure(identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    count = (rec or {}).get("count", 0) + 1
    locked_until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat() if count >= 5 else None
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$set": {"identifier": identifier, "count": count, "locked_until": locked_until}},
        upsert=True,
    )


async def _clear_failures(identifier: str) -> None:
    await db.login_attempts.delete_one({"identifier": identifier})


# ────────────────────────────────────────────────────────────────────────────
# Auth endpoints
# ────────────────────────────────────────────────────────────────────────────
@api_router.post("/auth/signup")
async def signup(payload: SignupRequest, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user_id,
        "email": email,
        "name": payload.name or email.split("@")[0],
        "picture": None,
        "password_hash": hash_password(payload.password),
        "role": "user",
        "plan": "free",
        "credits": 100,
        "provider": "email",
        "created_at": now,
    }
    await db.users.insert_one(doc)
    set_jwt_cookies(response, user_id, email)
    return public_user(doc)


@api_router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email.lower().strip()
    # Key the lockout on email + real client IP so an attacker on another IP cannot
    # lock a legitimate user out of their own account (targeted-DoS mitigation).
    identifier = f"email:{email}|ip:{_client_ip(request)}"
    if await _is_locked(identifier):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        await _register_failure(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await _clear_failures(identifier)
    set_jwt_cookies(response, user["user_id"], email)
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    # If Emergent session, delete from DB
    st = request.cookies.get("session_token")
    if st:
        await db.user_sessions.delete_one({"session_token": st})
    clear_auth_cookies(response)
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


async def _fetch_emergent_profile(session_id: str) -> Dict[str, Any]:
    """Call Emergent oauth data endpoint; validate response contract."""
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(EMERGENT_SESSION_DATA_URL, headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email missing from oauth payload")
    data["email"] = email
    return data


async def _upsert_google_user(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Create a Google-sourced user if missing, otherwise refresh name/picture."""
    email = profile["email"]
    user = await db.users.find_one({"email": email})
    if user is None:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": profile.get("name") or email.split("@")[0],
            "picture": profile.get("picture"),
            "role": "user",
            "plan": "free",
            "credits": 100,
            "provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)
        return user_doc
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"name": profile.get("name") or user.get("name"), "picture": profile.get("picture")}},
    )
    return user


async def _persist_emergent_session(user: Dict[str, Any], session_token: str, response: Response) -> None:
    """Insert user_sessions row and set the httpOnly session_token cookie."""
    expires_at = (datetime.now(timezone.utc) + timedelta(days=EMERGENT_SESSION_TTL_DAYS)).isoformat()
    await db.user_sessions.insert_one(
        {
            "user_id": user["user_id"],
            "session_token": session_token,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=EMERGENT_SESSION_TTL_DAYS * 86400,
        path="/",
    )


@api_router.post("/auth/session")
async def emergent_session_exchange(request: Request, response: Response):
    """Exchange Emergent OAuth session_id for a session_token cookie."""
    body = await request.json()
    session_id = body.get("session_id") if isinstance(body, dict) else None
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    profile = await _fetch_emergent_profile(session_id)
    user = await _upsert_google_user(profile)
    await _persist_emergent_session(user, profile["session_token"], response)
    return public_user(user)


# ────────────────────────────────────────────────────────────────────────────
# Credits / profile helpers
# ────────────────────────────────────────────────────────────────────────────
async def _grant_purchase(user_id: str, tier_id: str) -> None:
    tier = PRICING_TIERS.get(tier_id)
    if not tier:
        return
    update: Dict[str, Any] = {}
    inc: Dict[str, Any] = {}
    if tier["grant_credits"]:
        inc["credits"] = tier["grant_credits"]
    if tier["grant_plan"]:
        update["plan"] = tier["grant_plan"]
        if tier["grant_plan"] == "solo":
            update["license_expires_at"] = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        elif tier["grant_plan"] == "founding_builder":
            update["license_expires_at"] = None
    op = {}
    if update:
        op["$set"] = update
    if inc:
        op["$inc"] = inc
    if op:
        await db.users.update_one({"user_id": user_id}, op)


def _stripe_client(webhook_url: str):
    """Build a Stripe client, or 503 when the payments SDK or key is absent."""
    if StripeCheckout is None or not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe checkout is not configured")
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)


# ────────────────────────────────────────────────────────────────────────────
# Stripe Checkout
# ────────────────────────────────────────────────────────────────────────────
@api_router.get("/stripe/pricing")
async def stripe_pricing():
    return {
        "tiers": [
            {"tier_id": k, **v} for k, v in PRICING_TIERS.items()
        ]
    }


@api_router.post("/stripe/checkout")
async def stripe_checkout(payload: CheckoutCreateRequest, request: Request, user=Depends(get_current_user)):
    tier = PRICING_TIERS.get(payload.tier_id)
    if not tier:
        raise HTTPException(status_code=400, detail="Invalid tier")
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment/cancel"
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    sc = _stripe_client(webhook_url)
    req = CheckoutSessionRequest(
        amount=float(tier["amount"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"tier_id": payload.tier_id, "user_id": user["user_id"]},
    )
    session = await sc.create_checkout_session(req)
    await db.payment_transactions.insert_one(
        {
            "session_id": session.session_id,
            "user_id": user["user_id"],
            "user_email": user["email"],
            "tier_id": payload.tier_id,
            "amount": float(tier["amount"]),
            "currency": "usd",
            "status": "initiated",
            "payment_status": "pending",
            "metadata": {"tier_id": payload.tier_id, "user_id": user["user_id"]},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "fulfilled": False,
        }
    )
    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request, user=Depends(get_current_user)):
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your transaction")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    sc = _stripe_client(webhook_url)
    s = None  # silence "possibly unbound" warnings from static analysers
    try:
        s = await sc.get_checkout_status(session_id)
    except Exception as e:
        logger.warning(f"Stripe status fetch failed for {session_id}: {e}")
        updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
        return {
            "status": txn.get("status", "unknown"),
            "payment_status": txn.get("payment_status", "pending"),
            "amount_total": int(float(txn.get("amount", 0)) * 100),
            "currency": txn.get("currency", "usd"),
            "user": public_user(updated_user) if updated_user else None,
            "warning": "Live status temporarily unavailable. Webhook will reconcile shortly.",
        }
    new_payment_status = s.payment_status
    new_status = s.status
    # Idempotent fulfillment
    if not txn.get("fulfilled") and new_payment_status == "paid":
        await _grant_purchase(user["user_id"], txn["tier_id"])
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": new_status, "payment_status": new_payment_status, "fulfilled": True}},
        )
    elif txn.get("payment_status") != new_payment_status or txn.get("status") != new_status:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": new_status, "payment_status": new_payment_status}},
        )
    updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return {
        "status": new_status,
        "payment_status": new_payment_status,
        "amount_total": s.amount_total,
        "currency": s.currency,
        "user": public_user(updated_user) if updated_user else None,
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    if StripeCheckout is None or not STRIPE_API_KEY:
        logger.warning("Stripe webhook ignored — checkout is not configured")
        return JSONResponse(status_code=200, content={"received": True})
    sc = _stripe_client(webhook_url)
    try:
        evt = await sc.handle_webhook(body, sig)
    except Exception as e:
        logger.warning(f"Stripe webhook parse failed: {e}")
        return JSONResponse(status_code=200, content={"received": True})
    if evt.payment_status == "paid":
        txn = await db.payment_transactions.find_one({"session_id": evt.session_id}, {"_id": 0})
        if txn and not txn.get("fulfilled"):
            await _grant_purchase(txn["user_id"], txn["tier_id"])
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"status": "complete", "payment_status": "paid", "fulfilled": True}},
            )
    return {"received": True}


# ────────────────────────────────────────────────────────────────────────────
# Misc routes
# ────────────────────────────────────────────────────────────────────────────
APP_VERSION = "4.8.0"
# Captured at import time so it reflects the deployed build, not the request time.
BOOT_TIME = datetime.now(timezone.utc)


def _build_commit() -> str:
    """Best-effort git short SHA of the deployed build. Falls back to 'unknown'."""
    sha = os.environ.get("GIT_COMMIT") or os.environ.get("BUILD_SHA")
    if sha:
        return sha[:7]
    try:
        head = (ROOT_DIR.parent / ".git" / "HEAD").read_text().strip()
        if head.startswith("ref:"):
            ref_path = ROOT_DIR.parent / ".git" / head.split(" ", 1)[1]
            return ref_path.read_text().strip()[:7]
        return head[:7]
    except Exception:
        return "unknown"


BUILD_COMMIT = _build_commit()


@api_router.get("/")
async def root():
    return {"message": "Aether API online", "version": APP_VERSION}


@api_router.get("/health")
async def health():
    """Liveness + Mongo readiness probe. Safe to poll from uptime monitors."""
    db_ok = True
    try:
        await db.command("ping")
    except Exception as exc:
        db_ok = False
        logger.error("Health check DB ping failed: %s", exc)

    payload = {
        "status": "ok" if db_ok else "degraded",
        "service": "aether-backend",
        "version": APP_VERSION,
        "commit": BUILD_COMMIT,
        "database": "ok" if db_ok else "unreachable",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(payload, status_code=200 if db_ok else 503)


@api_router.get("/repair/readiness")
async def repair_readiness():
    """API and database readiness for the repair console. USB I/O stays on the local CLI."""
    db_ok = True
    try:
        await db.command("ping")
    except Exception as exc:
        db_ok = False
        logger.error("Repair readiness DB ping failed: %s", exc)
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "aether-backend",
        "api": APP_VERSION,
        "database": "ok" if db_ok else "unreachable",
        "modules": ["mediatek", "qualcomm", "samsung", "apple"],
        "device_io": "local-cli",
    }


@api_router.get("/version")
async def version():
    """Deployed build metadata — useful for smoke-testing a fresh deploy."""
    return {
        "service": "aether-backend",
        "version": APP_VERSION,
        "commit": BUILD_COMMIT,
        "booted_at": BOOT_TIME.isoformat(),
    }


# ────────────────────────────────────────────────────────────────────────────
# Source download — a fresh, on-demand bundle of the software.
# Uses an ALLOWLIST of publishable paths (never a full-tree walk) so secrets,
# credential docs, and local-only files can never leak. Admin-only + cached.
# ────────────────────────────────────────────────────────────────────────────
PROJECT_ROOT = ROOT_DIR.parent  # /app

# Only these top-level entries are ever bundled. Anything else at the repo root
# (memory/, auth_testing.md, test_reports/, tests/, .git, .gitconfig, .emergent,
# design_guidelines.json, etc.) is intentionally excluded.
_ZIP_INCLUDE_DIRS = ("frontend", "backend", "aether-cli", "aether-desktop", ".github")
_ZIP_INCLUDE_FILES = ("README.md", "LICENSE.md", "BUILD.md", "SIGNING.md", "yarn.lock")

# Defense-in-depth denylist applied WITHIN the allowlisted dirs.
_ZIP_EXCLUDE_DIRS = {
    "node_modules", ".git", "target", "build", "dist", "__pycache__",
    ".venv", "venv", ".next", "coverage", "test_reports", ".emergent", ".cache",
}
_ZIP_EXCLUDE_SUFFIXES = (".pyc", ".log", ".zip", ".pem", ".key", ".p12", ".keystore")
_ZIP_EXCLUDE_NAMES = {
    ".env", ".gitconfig", "id_rsa", "id_rsa.pub", "test_credentials.md",
}


def _is_secretish(fn: str) -> bool:
    low = fn.lower()
    if fn in _ZIP_EXCLUDE_NAMES or low.endswith(_ZIP_EXCLUDE_SUFFIXES):
        return True
    if low.startswith(".env"):  # .env, .env.local, .env.production, .env.*
        return True
    if "credential" in low or "secret" in low:
        return True
    return False


def _add_tree(zf: "zipfile.ZipFile", base: str) -> None:
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in _ZIP_EXCLUDE_DIRS]
        for fn in files:
            if _is_secretish(fn):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, PROJECT_ROOT)
            try:
                zf.write(full, os.path.join("aether-repair-tool", rel))
            except OSError:
                continue


def _build_source_zip() -> str:
    fd, path = tempfile.mkstemp(prefix="aether-src-", suffix=".zip")
    os.close(fd)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for d in _ZIP_INCLUDE_DIRS:
            full = os.path.join(PROJECT_ROOT, d)
            if os.path.isdir(full):
                _add_tree(zf, full)
        for fn in _ZIP_INCLUDE_FILES:
            full = os.path.join(PROJECT_ROOT, fn)
            if os.path.isfile(full) and not _is_secretish(fn):
                zf.write(full, os.path.join("aether-repair-tool", fn))
    return path


# Cache one built artefact and rebuild at most once per TTL. A lock prevents
# concurrent heavy builds (resource-exhaustion mitigation).
_zip_lock = asyncio.Lock()
_zip_cache: Dict[str, Any] = {"path": None, "built_at": 0.0}
_ZIP_CACHE_TTL = 300.0  # seconds


async def _get_cached_source_zip() -> str:
    import time
    async with _zip_lock:
        now = time.time()
        c = _zip_cache
        if c["path"] and os.path.exists(c["path"]) and (now - c["built_at"]) < _ZIP_CACHE_TTL:
            return c["path"]
        new_path = await asyncio.to_thread(_build_source_zip)
        old = c["path"]
        c["path"], c["built_at"] = new_path, now
        if old and old != new_path and os.path.exists(old):
            try:
                os.remove(old)
            except OSError:
                pass
        return new_path


async def require_admin(user=Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin" and not user.get("founder"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@api_router.get("/download/source")
async def download_source(_admin=Depends(require_admin)):
    """Stream a freshly-built .zip of publishable source (admin/founder only).
    Uses an allowlist of paths — secrets and credential docs are never bundled.
    AUTHORIZED PERSONAL USE ONLY — see LICENSE.md inside the archive."""
    path = await _get_cached_source_zip()
    filename = f"aether-repair-tool-src-v{APP_VERSION}.zip"
    # Do not delete the cached file after send; the cache manages its lifecycle.
    return FileResponse(path, media_type="application/zip", filename=filename)


class DesktopWaitlistRequest(BaseModel):
    email: EmailStr
    platform: str = Field(default="windows", pattern="^(windows|macos|linux)$")


@api_router.post("/waitlist/desktop")
async def waitlist_desktop(payload: DesktopWaitlistRequest, request: Request):
    """Collect emails for the native desktop build launch waitlist.
    Idempotent per (email, platform) — resubmitting the same address updates
    the timestamp rather than creating duplicates.
    """
    email = payload.email.lower().strip()
    now = datetime.now(timezone.utc)
    doc = {
        "email": email,
        "platform": payload.platform,
        "created_at": now.isoformat(),
        "ip": request.client.host if request.client else None,
        "ua": request.headers.get("user-agent", "")[:200],
    }
    await db.desktop_waitlist.update_one(
        {"email": email, "platform": payload.platform},
        {"$set": doc, "$setOnInsert": {"first_seen": now.isoformat()}},
        upsert=True,
    )
    total = await db.desktop_waitlist.count_documents({"platform": payload.platform})
    return {"ok": True, "queued": True, "platform": payload.platform, "waitlist_size": total}


# ────────────────────────────────────────────────────────────────────────────
# Startup
# ────────────────────────────────────────────────────────────────────────────
FOUNDER_ACCOUNTS = [
    # Full-access founder accounts. Credentials come strictly from env vars; if they
    # are unset the account is simply not seeded (no in-source password fallback).
    {
        "name": "Braiden Barker",
        "email_env": "BRAIDEN_EMAIL",
        "pw_env": "BRAIDEN_PASSWORD",
    },
]

# Accounts to strip of founder/admin access on startup (demoted to standard users).
DEMOTED_FOUNDER_EMAILS = ["byron@aether.dev"]


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@aether.dev").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    if not admin_pw:
        logger.warning("ADMIN_PASSWORD not set — skipping admin seed.")
        return
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one(
            {
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": admin_email,
                "name": "Aether Admin",
                "picture": None,
                "password_hash": hash_password(admin_pw),
                "role": "admin",
                "plan": "founding_builder",
                "credits": 5000,
                "provider": "email",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
        logger.info("Updated admin password to .env value")


async def seed_founders() -> None:
    """Seed the two founder accounts (Braiden + Byron) with full access.

    - role: 'admin' (unlocks any protected route)
    - plan: 'founding_builder'  (highest tier)
    - credits: 1_000_000        (effectively unlimited)
    Idempotent: creates on first startup, refreshes plan/credits on subsequent
    ones so the founders can never accidentally deplete themselves.
    """
    for f in FOUNDER_ACCOUNTS:
        email = os.environ.get(f["email_env"])
        pw = os.environ.get(f["pw_env"])
        if not email or not pw:
            logger.warning("Founder '%s' not seeded — %s/%s env vars missing.", f["name"], f["email_env"], f["pw_env"])
            continue
        email = email.lower()
        existing = await db.users.find_one({"email": email})
        if existing is None:
            await db.users.insert_one(
                {
                    "user_id": f"user_{uuid.uuid4().hex[:12]}",
                    "email": email,
                    "name": f["name"],
                    "picture": None,
                    "password_hash": hash_password(pw),
                    "role": "admin",
                    "plan": "founding_builder",
                    "credits": 1_000_000,
                    "provider": "email",
                    "founder": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            logger.info(f"Seeded founder: {email}")
        else:
            # Refresh perms + reset credits to unlimited on every boot.
            updates = {
                "role": "admin",
                "plan": "founding_builder",
                "credits": max(existing.get("credits", 0), 1_000_000),
                "founder": True,
                "name": existing.get("name") or f["name"],
            }
            if not verify_password(pw, existing["password_hash"]):
                updates["password_hash"] = hash_password(pw)
            await db.users.update_one({"email": email}, {"$set": updates})
            logger.info(f"Refreshed founder: {email}")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.payment_transactions.create_index("session_id", unique=True)
    await seed_admin()
    await seed_founders()
    # Demote any accounts removed from the founder list (revoke admin + founder flag).
    for demoted_email in DEMOTED_FOUNDER_EMAILS:
        existing = await db.users.find_one({"email": demoted_email})
        if existing is not None:
            await db.users.update_one(
                {"email": demoted_email},
                {"$set": {"role": "user", "founder": False}},
            )
            logger.info(f"Demoted former founder account: {demoted_email}")
    logger.info("Aether backend startup complete")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# CORS — credentialed requests require an explicit origin allowlist (never a wildcard).
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
