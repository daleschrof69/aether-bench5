"""Iteration 12 — verify emergent OAuth session endpoint refactor.

The endpoint POST /api/auth/session was split into three helpers:
_fetch_emergent_profile / _upsert_google_user / _persist_emergent_session.
Public behavior must be unchanged:
  * missing body / missing session_id -> 400
  * invalid session_id (upstream Emergent oauth rejects) -> 401
Plus a smoke check that login (JWT auth) and /api/auth/me still work.
"""
import os
import pytest
import requests

BASE_URL: str = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL: str = os.environ.get("AETHER_TEST_ADMIN_EMAIL", "admin@aether.dev")
ADMIN_PASSWORD: str = os.environ.get("AETHER_TEST_ADMIN_PASSWORD", "aether_admin_2026")


@pytest.fixture
def api_client() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── Auth session endpoint (refactored) ────────────────────────────────────
class TestAuthSessionRefactor:
    def test_root_alive(self, api_client: requests.Session) -> None:
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200

    def test_session_empty_body_returns_400(self, api_client: requests.Session) -> None:
        r = api_client.post(f"{BASE_URL}/api/auth/session", data="{}")
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "session_id" in detail.lower()

    def test_session_missing_session_id_returns_400(self, api_client: requests.Session) -> None:
        r = api_client.post(f"{BASE_URL}/api/auth/session", json={"other": "x"})
        assert r.status_code == 400

    def test_session_invalid_session_id_returns_401(self, api_client: requests.Session) -> None:
        r = api_client.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": "definitely-not-a-real-session-id-xyz"},
        )
        # Upstream Emergent oauth will 401 on a bogus session_id
        assert r.status_code == 401
        detail = r.json().get("detail", "")
        assert "session_id" in detail.lower() or "invalid" in detail.lower()


# ── Smoke test — the rest of auth must still work post-refactor ───────────
class TestAdminAuthSmoke:
    def test_admin_login_returns_200_with_user(self, api_client: requests.Session) -> None:
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Response returns user object (public_user) — verify shape
        assert data.get("email") == ADMIN_EMAIL
        assert data.get("role") == "admin"
        assert data.get("credits", 0) >= 0
        # httpOnly access_token cookie should be set
        assert "access_token" in r.cookies

    def test_me_endpoint_with_cookie_after_login(self, api_client: requests.Session) -> None:
        login = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert login.status_code == 200
        # requests.Session preserves cookies
        me = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        assert me.json().get("email") == ADMIN_EMAIL

    def test_me_unauthenticated_returns_401(self, api_client: requests.Session) -> None:
        fresh = requests.Session()
        r = fresh.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401
