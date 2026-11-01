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

## 4. Emergent Google OAuth (mocked path)
Backend route: `POST /api/auth/session` with `{ session_id }` exchanges to `session_token` cookie.
For browser test, simulate by inserting a session document directly:
```
mongosh --eval "
use('test_database');
const uid = 'user_'+Date.now();
db.users.insertOne({user_id: uid, email:'google.tester@example.com', name:'GTester', role:'user', plan:'free', credits:100, provider:'google', created_at: new Date()});
db.user_sessions.insertOne({user_id: uid, session_token:'test_session_xyz', expires_at: new Date(Date.now()+7*86400000), created_at: new Date()});
"
curl -b "session_token=test_session_xyz" $BACKEND_URL/api/auth/me
```

## 5. Stripe checkout
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
