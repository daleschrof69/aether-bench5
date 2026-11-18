"""Hosted session exchange is retired; local JWT authentication is preserved.

Vendor removal intentionally replaces the former 400/401 session exchange
contract with 410 for all requests. Google now uses /api/auth/google.
"""
import os
import pytest
import requests

BASE_URL: str = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:3000").rstrip("/")
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

    @pytest.mark.parametrize("payload", [{}, {"other": "x"}, {"session_id": "retired"}])
    def test_hosted_session_exchange_is_retired(self, api_client, payload):
        r = api_client.post(f"{BASE_URL}/api/auth/session", json=payload)
        assert r.status_code == 410
        assert "retired" in r.json()["detail"].lower()


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
