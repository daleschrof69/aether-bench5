# Aether Auth Testing Playbook

## 1. MongoDB verification
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
```
Confirm: admin user exists, password_hash starts with `$2b$`, indexes: `users.email` (unique), `users.user_id` (unique), `user_sessions.session_token` (unique), `login_attempts.identifier`, `payment_transactions.session_id` (unique).

## 2. JWT email/password flow
```
curl -c /tmp/c.txt -X POST $BACKEND_URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test+jwt@aether.dev","password":"hunter22","name":"JWT Tester"}'

curl -c /tmp/c.txt -X POST $BACKEND_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test+jwt@aether.dev","password":"hunter22"}'

curl -b /tmp/c.txt $BACKEND_URL/api/auth/me
```
Expect `200` with `{ user_id, email, plan: "free", credits: 100, provider: "email", member_since }`.

## 3. Admin login
```
curl -c /tmp/admin.txt -X POST $BACKEND_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aether.dev","password":"aether_admin_2026"}'
curl -b /tmp/admin.txt $BACKEND_URL/api/auth/me
```
Expect role=`admin`, plan=`founding_builder`, credits=`5000`.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:aee15ec0e3299cf29be4797501809761f82ee53b4ebab747e707d52ca3bfc4cd -->

## 4. Direct Google OAuth

Configure your own client using BUILD.md. Open `/login` and choose Google.
Confirm the authorization page belongs to Google and the callback returns to
Aether with HttpOnly JWT cookies. Wrong, missing or expired state must fail.
A Google account without a verified email must fail. No provider credentials
are needed for email/password login. The old `/api/auth/session` returns 410.

Automated provider and database checks use synthetic responses, with no real
payment or Google account:

```bash
cd backend
python -m unittest discover -s tests -p test_owned_integrations.py
```

MongoDB must be running at `AETHER_TEST_MONGO_URL` (default localhost:27017).
Each test creates and removes its own randomly named database. These checks
verify signatures, replay protection, concurrent fulfillment, OAuth state and
PKCE, and preservation of local email authentication. Live provider setup is
still a separate deployment check.

## 5. Stripe checkout

<!-- /coderabbit-ai-generated:v1 -->
```
curl -b /tmp/c.txt -X POST $BACKEND_URL/api/stripe/checkout \
  -H "Content-Type: application/json" \
  -d '{"tier_id":"credits_starter","origin_url":"https://localhost"}'
```
Expect 200 with `url` (https://checkout.stripe.com/...) and `session_id`.
Then:
```
curl -b /tmp/c.txt $BACKEND_URL/api/stripe/status/<session_id>
```
Expect 200 with `payment_status` and `user` payload.

## 6. Brute-force lockout
6 failed POSTs to /api/auth/login → expect HTTP 429 on the 6th.

## 7. Pricing tiers expose to frontend
```
curl $BACKEND_URL/api/stripe/pricing
```
Expect 6 tiers: solo_annual, founding_lifetime, credits_starter/builder/workshop/wholesale.
