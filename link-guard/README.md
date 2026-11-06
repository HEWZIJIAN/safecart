# 🛡️ link-guard — pre-click link verification

Intercepts a user's intent to visit an **external** link, scans the destination with a
threat-intelligence API, and either lets the navigation proceed seamlessly (safe) or
shows a warning modal (suspicious / malicious).

Direct client-side scanning is impossible (CORS) and unsafe (it would expose your API
key in the browser), so this is a small **frontend interceptor → backend proxy** that
holds the key server-side, caches results, and rate-limits abuse.

```
link-guard/
├─ server/
│  ├─ index.js              # Express app: CORS, JSON limit, rate limit, static
│  ├─ routes/scan.js        # POST /api/scan  (+ GET /api/healthz)
│  └─ lib/
│     ├─ validateUrl.js     # strict URL validation / normalization / SSRF guard
│     ├─ cache.js           # in-memory TTL + LRU cache
│     ├─ rateLimit.js       # per-IP fixed-window limiter (no deps)
│     └─ scanner.js         # threat provider: mock | Google Web Risk | VirusTotal
├─ public/
│  ├─ link-guard.js         # drop-in frontend interceptor (vanilla, 0 deps)
│  ├─ link-guard.css        # chip + modal styles
│  └─ demo.html             # try it locally
├─ .env.example
└─ package.json
```

## Quick start

```bash
cd link-guard
cp .env.example .env          # runs as-is on the mock provider
npm install
npm start                     # → http://localhost:8787/demo.html
```

Open `http://localhost:8787/demo.html` and click the sample links. No API key needed —
the **mock** provider returns deterministic verdicts (e.g. `paypa1-…` → malicious).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Server port. |
| `ALLOWED_ORIGINS` | `http://localhost:8787` | Comma-separated origins allowed to call the API (your site). |
| `TRUST_PROXY` | _unset_ | Hops to trust for the real client IP behind a proxy/LB (e.g. `1`). Needed for correct rate-limiting. |
| `THREAT_PROVIDER` | `mock` | `mock` \| `google` \| `virustotal`. |
| `GOOGLE_WEB_RISK_API_KEY` | _unset_ | Key for Google Web Risk Lookup API. |
| `VIRUSTOTAL_API_KEY` | _unset_ | Key for VirusTotal v3. |
| `SCAN_TIMEOUT_MS` | `4000` | Upstream threat-API timeout before failing open. |
| `CACHE_MAX` | `5000` | Max cached URLs (LRU eviction). |
| `CACHE_TTL_SAFE_MS` | `1800000` | TTL for `safe` verdicts (30 min). |
| `CACHE_TTL_BAD_MS` | `600000` | TTL for `suspicious`/`malicious` (10 min). |
| `RATE_WINDOW_MS` | `60000` | Rate-limit window. |
| `RATE_MAX` | `30` | Max scans per IP per window. |
| `REPORT_MAX` | `1000` | Max user reports kept in the in-memory ring buffer. |

## API

`POST /api/scan` — body `{ "url": "https://example.com/path" }`

```json
{
  "url": "https://example.com/path",
  "host": "example.com",
  "threat": "safe",          // safe | suspicious | malicious | unknown
  "score": 0,                 // 0..100
  "sources": ["mock:clean"],
  "checkedAt": "2026-06-26T12:00:00.000Z",
  "cached": false
}
```

Errors: `400 invalid_url` / `400 private_host` / `429 rate_limited`.

`POST /api/report` — let users flag a wrong verdict. Body `{ url, claim, note? }` where
`claim ∈ { false_positive, false_negative, report_scam }`.

```json
{ "ok": true, "id": "Zk3p…", "status": "received" }   // 202
```

Stored in a capped in-memory ring buffer; `GET /api/report/stats` returns aggregate counts
(no URLs exposed). **In production, forward each report to a durable queue/DB and into your
threat-review pipeline** so a real false-negative becomes a blocklist entry (TODO marked in
`routes/report.js`).

## Tests

```bash
npm test        # node --test — 28 tests, zero extra deps
```

Covers URL validation/SSRF guard, cache TTL + LRU eviction, the rate limiter (cap → 429),
mock-scanner verdicts, and full API round-trips (scan, cache hit, 400s, report). The API
tests boot the real Express app on an ephemeral port.

## Plugging in a real provider

The mock conforms to the same response contract as the real integrations, already written
in `server/lib/scanner.js`:

- **Google Web Risk** — set `THREAT_PROVIDER=google` and `GOOGLE_WEB_RISK_API_KEY`. Uses the
  [Lookup API](https://cloud.google.com/web-risk/docs/lookup-api) (`MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`).
- **VirusTotal v3** — set `THREAT_PROVIDER=virustotal` and `VIRUSTOTAL_API_KEY`. Looks up
  `last_analysis_stats`. Note: an **unseen** URL returns 404 → treated as low-confidence safe; to
  force a fresh analysis, `POST /urls` then poll the analysis id (left as a TODO comment).

No frontend changes are needed — the proxy keeps the key server-side.

## Security notes

- **URL validation** (`validateUrl.js`): http/https only; rejects `javascript:`/`data:`/`file:`,
  embedded `user:pass@` credentials, and over-2 KB inputs; normalizes for cache keying.
- **SSRF guard**: private/loopback/link-local hosts are refused (`400 private_host`). We don't
  fetch the URL today, but this keeps the door shut if you later add page-content scanning.
- **Rate limiting**: per-IP fixed window protects your upstream key/quota. Behind a proxy, set
  `TRUST_PROXY`. For multi-instance, swap `lib/rateLimit.js` for
  [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit) + a Redis store.
- **CORS** is locked to `ALLOWED_ORIGINS`.
- **No XSS in the modal**: every dynamic value (host, sources) is written via `textContent`,
  never `innerHTML` — a hostile URL string can't inject markup into your page.
- **Body size** capped at 8 KB.

## Design decisions worth knowing

- **Fail-open by default.** If our own scanner is down/slow, the user still navigates (verdict
  `unknown` → allowed), because blocking on *our* outage is worse UX for a helper feature. Flip
  `failOpen: false` in the frontend to show a soft "couldn't verify" warning instead.
- **Caching** is per-verdict: safe lives longer, bad re-resolves sooner. In-memory by default;
  use Redis for shared cache across instances.
- **Hover pre-warm**: hovering a link for `hoverDelayMs` pre-fetches the verdict so the click
  usually resolves instantly (no visible "Checking…" delay).
- **Modifier/middle-click**: left-click is fully intercepted. True middle-click fires `auxclick`,
  which browsers don't let us cancel reliably — those open without a block (documented tradeoff).

## Frontend usage

```html
<link rel="stylesheet" href="/link-guard.css" />
<script src="/link-guard.js" data-auto data-endpoint="/api/scan"></script>
```

Or manually / in a framework:

```js
import '/link-guard.css';
const guard = LinkGuard.create({ endpoint: 'https://api.safecart.co/api/scan', failOpen: false });
guard.attach();                 // document-wide
// React: call guard.attach() in a top-level useEffect; guard.detach() on cleanup.
// SPA routers: re-attach is unnecessary (listeners are delegated on document).
```

Opt a link out with `data-lg-ignore`.
