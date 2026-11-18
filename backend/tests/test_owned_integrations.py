"""Provider contract tests plus isolated MongoDB fulfillment and auth checks.

Run with: python -m unittest discover -s tests -p test_owned_integrations.py
MongoDB must be reachable at AETHER_TEST_MONGO_URL (defaults to localhost).
No requests are sent to Google or Stripe; provider responses are synthetic.
"""
import asyncio
import hashlib
import hmac
import json
import os
import time
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
import stripe
from motor.motor_asyncio import AsyncIOMotorClient

os.environ.setdefault("JWT_SECRET", "test-signing-key-not-for-deployment-00000000")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "aether_owned_tests_unused")

import google_auth
from payments import CheckoutSessionRequest, StripeCheckout, verify_webhook
import server


SECRET = "whsec_synthetic_test_secret"
CONFIG = {
    "GOOGLE_CLIENT_ID": "synthetic-client", "GOOGLE_CLIENT_SECRET": "synthetic-secret",
    "APP_ORIGIN": "http://testserver", "GOOGLE_REDIRECT_URI": "http://testserver/api/auth/google/callback",
}


def signed_event(session, event_type="checkout.session.completed", timestamp=None):
    body = json.dumps({"id": "evt_synthetic", "type": event_type, "data": {"object": session}}).encode()
    timestamp = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(SECRET.encode(), str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, f"t={timestamp},v1={digest}"


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_checkout_uses_official_api_with_fixed_price_in_cents(self):
        checkout = StripeCheckout("sk_test_synthetic")
        checkout.client = MagicMock()
        sessions = checkout.client.v1.checkout.sessions
        sessions.create_async = AsyncMock(return_value=stripe.StripeObject.construct_from({"id": "cs_test", "url": "https://checkout.stripe.com/test", "payment_status": "unpaid"}, "sk_test_synthetic"))
        result = await checkout.create_checkout_session(CheckoutSessionRequest(
            19.99, "usd", "https://app.test/success", "https://app.test/cancel",
            {"user_id": "user_test", "tier_id": "credits_starter"}, "Starter"))
        params = sessions.create_async.call_args.args[0]
        self.assertEqual(params["line_items"][0]["price_data"]["unit_amount"], 1999)
        self.assertEqual(params["metadata"]["user_id"], "user_test")
        self.assertEqual(params["mode"], "payment")
        self.assertEqual(result.session_id, "cs_test")
        sessions.retrieve_async = AsyncMock(return_value=stripe.StripeObject.construct_from({"id": "cs_test", "status": "complete", "payment_status": "paid", "amount_total": 1999, "currency": "usd"}, "sk_test_synthetic"))
        status = await checkout.get_checkout_status("cs_test")
        sessions.retrieve_async.assert_awaited_once_with("cs_test")
        self.assertEqual(status.amount_total, 1999)
        self.assertEqual(status.payment_status, "paid")

    def test_webhook_signature_required_and_stale_or_tampered_rejected(self):
        body, signature = signed_event({"id": "cs_test"})
        self.assertEqual(verify_webhook(body, signature, SECRET)["id"], "evt_synthetic")
        for candidate, sig, secret in [(body, "", SECRET), (body + b" ", signature, SECRET),
                                       (body, signature, ""), (body, signature, "wrong-secret")]:
            with self.assertRaises(ValueError):
                verify_webhook(candidate, sig, secret)
        stale_body, stale_sig = signed_event({"id": "cs_test"}, timestamp=int(time.time()) - 600)
        with self.assertRaises(ValueError):
            verify_webhook(stale_body, stale_sig, SECRET)

    async def test_google_code_exchange_uses_pkce_and_verified_profile(self):
        config = google_auth.GoogleConfig("client", "secret", "http://app.test/callback", "http://app.test")
        http = AsyncMock()
        http.post.return_value = httpx.Response(200, json={"access_token": "synthetic-access-token"}, request=httpx.Request("POST", "https://oauth2.googleapis.com/token"))
        http.get.return_value = httpx.Response(200, json={"sub": "google-user", "email": "TEST@example.com", "email_verified": True}, request=httpx.Request("GET", "https://openidconnect.googleapis.com/v1/userinfo"))
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=http)
        context.__aexit__ = AsyncMock(return_value=False)
        with patch("google_auth.httpx.AsyncClient", return_value=context):
            profile = await google_auth.exchange_code(config, "synthetic-code", "pkce-verifier")
            self.assertEqual(profile["email"], "test@example.com")
            self.assertEqual(http.post.call_args.kwargs["data"]["code_verifier"], "pkce-verifier")
            self.assertEqual(http.get.call_args.kwargs["headers"]["Authorization"], "Bearer synthetic-access-token")
            http.get.return_value = httpx.Response(200, json={"sub": "google-user", "email": "test@example.com", "email_verified": False}, request=httpx.Request("GET", "https://openidconnect.googleapis.com/v1/userinfo"))
            with self.assertRaises(ValueError):
                await google_auth.exchange_code(config, "synthetic-code", "pkce-verifier")


class ApplicationIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mongo = AsyncIOMotorClient(os.environ.get("AETHER_TEST_MONGO_URL", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=3000)
        await self.mongo.admin.command("ping")
        self.db_name = "aether_owned_test_" + uuid.uuid4().hex
        self.db = self.mongo[self.db_name]
        self.database_patch = patch.object(server, "db", self.db)
        self.database_patch.start()
        self.secret_patch = patch.object(server, "STRIPE_WEBHOOK_SECRET", SECRET)
        self.secret_patch.start()
        self.http = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://testserver")
        self.user = {"user_id": "user_test", "email": "test@example.com", "credits": 100, "plan": "free"}
        await self.db.users.insert_one(dict(self.user))
        self.txn = {"session_id": "cs_synthetic", "user_id": "user_test", "tier_id": "credits_starter", "amount": 19.0, "currency": "usd", "fulfilled": False}
        await self.db.payment_transactions.insert_one(dict(self.txn))
        self.session = {"id": "cs_synthetic", "status": "complete", "payment_status": "paid", "amount_total": 1900, "currency": "usd"}

    async def asyncTearDown(self):
        await self.http.aclose()
        self.secret_patch.stop()
        self.database_patch.stop()
        await self.mongo.drop_database(self.db_name)
        self.mongo.close()

    async def send_event(self, session, signature_override=None):
        body, signature = signed_event(session)
        return await self.http.post("/api/webhook/stripe", content=body, headers={"Stripe-Signature": signature if signature_override is None else signature_override})

    async def test_unsigned_webhook_rejected_without_credit_grant(self):
        response = await self.send_event(self.session, "")
        self.assertEqual(response.status_code, 400)
        self.assertEqual((await self.db.users.find_one({"user_id": "user_test"}))["credits"], 100)
        self.assertFalse((await self.db.payment_transactions.find_one({}))["fulfilled"])

    async def test_missing_webhook_configuration_rejects_event(self):
        with patch.object(server, "STRIPE_WEBHOOK_SECRET", ""):
            response = await self.send_event(self.session)
        self.assertEqual(response.status_code, 503)
        self.assertEqual((await self.db.users.find_one({"user_id": "user_test"}))["credits"], 100)

    async def test_signed_webhooks_and_poll_race_grant_once(self):
        # Polling and parallel webhook deliveries all race through the real DB.
        token = server.create_access_token("user_test", "test@example.com")
        checkout = MagicMock()
        from payments import CheckoutSession
        checkout.get_checkout_status = AsyncMock(return_value=CheckoutSession.from_stripe(self.session))
        with patch.object(server, "_stripe_client", return_value=checkout):
            results = await asyncio.gather(
                self.send_event(self.session), self.send_event(self.session),
                self.http.get("/api/stripe/status/cs_synthetic", headers={"Authorization": f"Bearer {token}"}),
            )
        self.assertTrue(all(r.status_code == 200 for r in results))
        self.assertEqual((await self.db.users.find_one({"user_id": "user_test"}))["credits"], 150)
        self.assertTrue((await self.db.payment_transactions.find_one({}))["fulfilled"])

    async def test_retry_after_transaction_write_failure_does_not_double_credit(self):
        await server._grant_purchase("user_test", "credits_starter", "cs_synthetic")
        response = await self.send_event(self.session)
        self.assertEqual(response.status_code, 200)
        self.assertEqual((await self.db.users.find_one({"user_id": "user_test"}))["credits"], 150)
        self.assertTrue((await self.db.payment_transactions.find_one({}))["fulfilled"])

    async def test_wrong_amount_or_currency_never_fulfills(self):
        for overrides in ({"amount_total": 1}, {"currency": "cad"}):
            response = await self.send_event({**self.session, **overrides})
            self.assertEqual(response.status_code, 400)
        self.assertEqual((await self.db.users.find_one({"user_id": "user_test"}))["credits"], 100)

    async def test_unpaid_session_never_grants_credits(self):
        response = await self.send_event({**self.session, "payment_status": "unpaid"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse((await self.db.payment_transactions.find_one({}))["fulfilled"])
        self.assertEqual((await self.db.users.find_one({"user_id": "user_test"}))["credits"], 100)

    async def test_google_disabled_and_hosted_session_retired(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}):
            self.assertEqual((await self.http.get("/api/auth/providers")).json(), {"google": False})
            self.assertEqual((await self.http.get("/api/auth/google")).status_code, 503)
        for payload in ({}, {"session_id": "old-vendor-session"}):
            self.assertEqual((await self.http.post("/api/auth/session", json=payload)).status_code, 410)

    async def test_google_state_binding_and_success_issue_local_jwt(self):
        with patch.dict(os.environ, CONFIG), patch("google_auth.exchange_code", new_callable=AsyncMock) as exchange:
            exchange.return_value = {"sub": "google-user", "email": "google@example.com", "name": "Google Tester"}
            start = await self.http.get("/api/auth/google")
            self.assertEqual(start.status_code, 302)
            query = parse_qs(urlparse(start.headers["location"]).query)
            self.assertEqual(query["code_challenge_method"], ["S256"])
            self.assertIn("HttpOnly", start.headers["set-cookie"])
            self.assertEqual((await self.http.get("/api/auth/google/callback?code=test&state=wrong")).status_code, 400)
            exchange.assert_not_awaited()
            callback = await self.http.get("/api/auth/google/callback", params={"code": "test", "state": query["state"][0]})
            self.assertEqual(callback.status_code, 302)
            self.assertEqual(callback.headers["location"], "http://testserver/")
            self.assertIn("access_token", callback.cookies)
            me = await self.http.get("/api/auth/me")
            self.assertEqual(me.status_code, 200)
            self.assertEqual(me.json()["email"], "google@example.com")
            self.assertEqual(me.json()["provider"], "google")
            # Consumed browser cookie cannot be replayed.
            self.assertEqual((await self.http.get("/api/auth/google/callback", params={"code": "test", "state": query["state"][0]})).status_code, 400)

    async def test_google_missing_and_expired_cookie_rejected(self):
        with patch.dict(os.environ, CONFIG), patch("google_auth.exchange_code", new_callable=AsyncMock) as exchange:
            self.assertEqual((await self.http.get("/api/auth/google/callback?code=test&state=test")).status_code, 400)
            expired = server.pyjwt.encode({"type": "google_oauth", "state": "test", "verifier": "test", "exp": 1}, server.JWT_SECRET, algorithm=server.JWT_ALGORITHM)
            self.http.cookies.set("google_oauth", expired, path="/api/auth/google")
            self.assertEqual((await self.http.get("/api/auth/google/callback?code=test&state=test")).status_code, 400)
            exchange.assert_not_awaited()

    async def test_email_signup_login_logout_still_work_without_vendor(self):
        credentials = {"email": "new@example.com", "password": "synthetic-passphrase"}
        signup = await self.http.post("/api/auth/signup", json=credentials)
        self.assertEqual(signup.status_code, 200)
        self.assertEqual(signup.json()["credits"], 100)
        self.assertEqual((await self.http.get("/api/auth/me")).status_code, 200)
        self.assertEqual((await self.http.post("/api/auth/logout")).status_code, 200)
        self.assertEqual((await self.http.get("/api/auth/me")).status_code, 401)
        self.assertEqual((await self.http.post("/api/auth/login", json=credentials)).status_code, 200)
        self.assertEqual((await self.http.get("/api/auth/me")).json()["email"], credentials["email"])


if __name__ == "__main__":
    unittest.main()
