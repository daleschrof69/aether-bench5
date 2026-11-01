"""Aether backend tests: auth (JWT, signup, login, lockout, logout, me, emergent session) + stripe pricing/checkout/status."""
import os
import uuid
import pytest
import requests

BASE_URL: str = os.environ.get("REACT_APP_BACKEND_URL", "https://mtk-qualcomm-tool.preview.emergentagent.com").rstrip("/")
API: str = f"{BASE_URL}/api"

ADMIN_EMAIL: str = os.environ.get("AETHER_TEST_ADMIN_EMAIL", "admin@aether.dev")
ADMIN_PASSWORD: str = os.environ.get("AETHER_TEST_ADMIN_PASSWORD", "aether_admin_2026")


def _new_email() -> str:
    return f"test_{uuid.uuid4().hex[:10]}@aether.dev"


# ──────────────── Health ────────────────
def test_root() -> None:
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert "Aether" in r.json().get("message", "")


# ──────────────── Signup / Me / Logout ────────────────
class TestSignupLoginMe:
    def test_signup_creates_user_with_defaults(self) -> None:
        s = requests.Session()
        email = _new_email()
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "hunter22", "name": "Tester"})
        assert r.status_code == 200, r.text
        self._assert_default_user_shape(r.json(), email)
        self._assert_auth_cookies(s)
        # /me works with cookies
        m = s.get(f"{API}/auth/me")
        assert m.status_code == 200
        assert m.json()["email"] == email

    @staticmethod
    def _assert_default_user_shape(data: dict, email: str) -> None:
        assert data["email"] == email
        assert data["credits"] == 100
        assert data["plan"] == "free"
        assert data["provider"] == "email"
        assert data["role"] == "user"
        assert data["user_id"].startswith("user_")

    @staticmethod
    def _assert_auth_cookies(s: requests.Session) -> None:
        ck = s.cookies.get_dict()
        assert "access_token" in ck
        assert "refresh_token" in ck

    def test_signup_duplicate_email_rejected(self) -> None:
        s = requests.Session()
        email = _new_email()
        r1 = s.post(f"{API}/auth/signup", json={"email": email, "password": "hunter22"})
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/signup", json={"email": email, "password": "hunter22"})
        assert r2.status_code == 400

    def test_admin_login_returns_admin_role(self) -> None:
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "admin"
        assert data["plan"] == "founding_builder"
        assert data["credits"] == 5000
        # me
        m = s.get(f"{API}/auth/me")
        assert m.status_code == 200
        assert m.json()["email"].lower() == ADMIN_EMAIL

    def test_logout_clears_cookies(self) -> None:
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # After logout, access_token cookie should be invalidated; /me should be 401
        s.cookies.clear()
        m = s.get(f"{API}/auth/me")
        assert m.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ──────────────── Brute-force lockout ────────────────
class TestBruteForce:
    def test_lockout_after_failures(self) -> None:
        # Use a unique email so we don't lock real users
        email = _new_email()
        # 5 failures should still 401, 6th should be 429
        last_status = None
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
            last_status = r.status_code
        assert last_status == 429, f"Expected 429 after 6 fails, got {last_status}"


# ──────────────── Emergent session exchange ────────────────
class TestEmergentSession:
    def test_session_missing_session_id_returns_400(self) -> None:
        r = requests.post(f"{API}/auth/session", json={})
        assert r.status_code == 400

    def test_session_invalid_session_id_returns_401(self) -> None:
        r = requests.post(f"{API}/auth/session", json={"session_id": "invalid_garbage_xyz"})
        assert r.status_code == 401


# ──────────────── Stripe pricing ────────────────
class TestStripePricing:
    def test_pricing_returns_six_tiers(self) -> None:
        r = requests.get(f"{API}/stripe/pricing")
        assert r.status_code == 200
        data = r.json()
        tiers = {t["tier_id"]: t for t in data["tiers"]}
        assert set(tiers.keys()) == {
            "solo_annual", "founding_lifetime",
            "credits_starter", "credits_builder", "credits_workshop", "credits_wholesale",
        }
        assert tiers["solo_annual"]["amount"] == 89.0
        assert tiers["founding_lifetime"]["amount"] == 299.0
        assert tiers["credits_starter"]["amount"] == 19.0
        assert tiers["credits_builder"]["amount"] == 49.0
        assert tiers["credits_workshop"]["amount"] == 149.0
        assert tiers["credits_wholesale"]["amount"] == 499.0


# ──────────────── Stripe checkout ────────────────
@pytest.fixture(scope="module")
def auth_session() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip("Admin login failed; cannot test authenticated endpoints")
    return s


class TestStripeCheckout:
    def test_checkout_requires_auth(self) -> None:
        r = requests.post(f"{API}/stripe/checkout", json={"tier_id": "credits_starter", "origin_url": "https://example.com"})
        assert r.status_code == 401

    def test_checkout_invalid_tier(self, auth_session: requests.Session) -> None:
        r = auth_session.post(f"{API}/stripe/checkout", json={"tier_id": "bogus_tier", "origin_url": "https://example.com"})
        assert r.status_code == 400

    def test_checkout_valid_creates_session(self, auth_session: requests.Session) -> None:
        r = auth_session.post(f"{API}/stripe/checkout", json={"tier_id": "credits_starter", "origin_url": "https://example.com"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("http")
        assert "session_id" in data
        # Store for status test
        TestStripeCheckout._last_session_id = data["session_id"]

    def test_status_own_session(self, auth_session: requests.Session) -> None:
        sid = getattr(TestStripeCheckout, "_last_session_id", None)
        if not sid:
            pytest.skip("No session id from checkout test")
        r = auth_session.get(f"{API}/stripe/status/{sid}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "payment_status" in data
        assert "status" in data

    def test_status_other_user_returns_403(self, auth_session: requests.Session) -> None:
        # create a session as admin
        r = auth_session.post(f"{API}/stripe/checkout", json={"tier_id": "credits_starter", "origin_url": "https://example.com"})
        sid = r.json()["session_id"]
        # signup a new user and try to access admin's session
        other = requests.Session()
        other.post(f"{API}/auth/signup", json={"email": _new_email(), "password": "hunter22"})
        r2 = other.get(f"{API}/stripe/status/{sid}")
        assert r2.status_code == 403

    def test_status_requires_auth(self) -> None:
        r = requests.get(f"{API}/stripe/status/cs_test_fake")
        assert r.status_code == 401
