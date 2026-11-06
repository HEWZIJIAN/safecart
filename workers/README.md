# SafeCart Workers backend

Small Cloudflare Workers + Hono backend that:

1. **Authenticates users** with Supabase Auth (HS256 JWT verification on every request).
2. **Stores subscription state** (tier, status, Stripe IDs, period end) in a Supabase Postgres table.
3. **Proxies API calls that need to keep keys secret**: Google Safe Browsing, PhishTank, and HaveIBeenPwned. The extension never sees these keys.
4. **Handles Stripe Checkout, webhooks, and the Billing Portal** for $0/$2.49/$4.99 tiers.

Supersedes the Express server in `../server/` — that is kept for reference but the extension now talks to this Workers backend.

## Endpoints

| Method | Path                              | Auth | Purpose                                                 |
|--------|-----------------------------------|------|---------------------------------------------------------|
| `GET`  | `/health`                         | none | Liveness probe.                                         |
| `GET`  | `/api/me`                         | JWT  | Current user + subscription summary.                    |
| `GET`  | `/api/subscription`               | JWT  | Tier/status/period-end for the authed user.             |
| `POST` | `/api/stripe/checkout-session`    | JWT  | Creates a Stripe Checkout Session for `premium`/`family`. |
| `POST` | `/api/stripe/billing-portal`      | JWT  | Creates a Billing Portal session for the user's customer. |
| `POST` | `/api/stripe/webhook`             | sig  | Stripe webhook target. Verifies `Stripe-Signature`.     |
| `POST` | `/api/proxy/safe-browsing`        | JWT  | Body: `{ url }`. Proxies to Google Safe Browsing.       |
| `POST` | `/api/proxy/phishtank`            | JWT  | Body: `{ url }`. Proxies to PhishTank.                  |
| `GET`  | `/api/proxy/hibp/breaches`        | JWT  | Query: `domain=...`. Proxies to HIBP breaches-by-domain. |

"Auth: JWT" = `Authorization: Bearer <supabase_access_token>`. The Worker verifies the HS256 signature using `SUPABASE_JWT_SECRET`. The Stripe webhook is authenticated by signature, not JWT.

## One-time setup

### 1. Supabase

1. Create a project at <https://supabase.com>.
2. Run the schema in `supabase/migrations/0001_init.sql` (SQL Editor → New query → paste → Run).
3. Grab three values from **Project Settings → API**:
   - `Project URL`              → `SUPABASE_URL`
   - `anon public` key          → goes into the extension config (not the Worker)
   - `service_role` key (secret) → `SUPABASE_SERVICE_ROLE_KEY`
4. Grab the JWT secret from **Project Settings → API → JWT Settings → JWT Secret** → `SUPABASE_JWT_SECRET`.

### 2. Stripe

1. Create products + prices once (use the script from the Express server, or create manually in the dashboard):
   ```
   cd ../server && cp .env.example .env  # fill in STRIPE_SECRET_KEY only
   npm install && npm run setup:stripe
   ```
   That prints `STRIPE_PREMIUM_PRICE_ID` and `STRIPE_FAMILY_PRICE_ID`.
2. Get `STRIPE_SECRET_KEY` from the Stripe dashboard.
3. Webhook secret comes from either:
   - **Dev**: `stripe listen --forward-to localhost:8787/api/stripe/webhook` prints `whsec_...`.
   - **Prod**: Dashboard → Developers → Webhooks → add endpoint `/api/stripe/webhook`, copy the signing secret.

### 3. Third-party API keys to proxy

- `SAFE_BROWSING_API_KEY` — Google Cloud Console → Enable "Safe Browsing API" → create API key.
- `PHISHTANK_API_KEY` — optional. PhishTank doesn't strictly require one for low volumes.
- `HIBP_API_KEY` — only needed for the email-based account endpoints; the breach-by-domain endpoint used here is free.

## Running locally

```bash
cd workers
npm install
cp .dev.vars.example .dev.vars     # fill in all values
npm run dev                        # serves on http://localhost:8787
```

In another terminal:

```bash
stripe listen --forward-to localhost:8787/api/stripe/webhook
# copy whsec_... → put into .dev.vars as STRIPE_WEBHOOK_SECRET
```

## Deploying

```bash
# Set non-secret vars in wrangler.toml (already templated).
# Set secrets one at a time:
wrangler secret put SUPABASE_JWT_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put SAFE_BROWSING_API_KEY
# optional:
wrangler secret put PHISHTANK_API_KEY
wrangler secret put HIBP_API_KEY

wrangler deploy
```

Production webhook endpoint registration:

1. After deploy, your Worker URL is `https://safecart-api.<your-account>.workers.dev` (or your custom domain).
2. Stripe Dashboard → Developers → Webhooks → Add endpoint → `https://safecart-api.<your-account>.workers.dev/api/stripe/webhook`.
3. Subscribe to events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
4. Copy the new signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`.

## Security model

- **Stripe secret + Safe Browsing + PhishTank + HIBP keys never leave the Worker.** The extension only talks to `/api/proxy/*`, which the Worker authenticates and forwards.
- **Supabase service-role key never leaves the Worker.** Writes to the `subscriptions` table use it; the extension uses the user's own access token and is restricted to its own row via RLS.
- **Webhook verification is mandatory.** `stripe.webhooks.constructEventAsync` runs on the raw body using Web Crypto — Workers' standard signing primitive.
- **Event deduplication** lives in the `processed_events` table; Stripe retries on a non-2xx and we won't double-apply.

## Things this intentionally does NOT do

- No password reset emails from the Worker — Supabase Auth handles that.
- No PII logging. Logs go through `console.log`; only error context is logged, not user emails or tokens.
- No rate limiting per user on proxy endpoints. Add a Cloudflare Rate Limiting rule on the Worker route or implement KV-based counts if you start to see abuse.
- No premium-gating on proxy endpoints. The whole API requires authentication (so usage is bounded by your free-tier signups), but `premium` users currently have the same proxy access as `free`. Add a tier check in each `proxy-*` route if you want to restrict.
