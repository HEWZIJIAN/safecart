# SafeCart — Project Plan

A Chrome browser extension (Manifest V3) that protects online shoppers through three core features:
1. **Phishing detection** — flag suspicious checkout/storefront pages before the user enters payment details.
2. **Payment tracking** — log purchases the user makes so they have a single ledger of online spend.
3. **Data breach alerts** — warn the user when a site they've shopped on appears in a known breach.

---

## 1. Folder Structure

```
safecart/
├── manifest.json
├── PLAN.md
├── README.md
├── .gitignore
├── package.json
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   ├── service-worker.js          # MV3 background entry point
│   │   ├── phishing-engine.js         # URL/domain heuristics + remote lookups
│   │   ├── breach-monitor.js          # Periodic breach checks, alarms
│   │   ├── payment-logger.js          # Captures payment events from content scripts
│   │   └── storage.js                 # chrome.storage wrapper (get/set/migrate)
│   ├── content/
│   │   ├── checkout-detector.js       # Detects checkout pages, payment forms
│   │   ├── phishing-overlay.js        # Injects warning banner/modal
│   │   └── payment-capture.js         # Pulls amount/merchant from confirmation pages
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   ├── popup.js                   # Tab status, quick actions
│   │   └── components/
│   │       ├── site-status.js
│   │       ├── recent-payments.js
│   │       └── breach-banner.js
│   ├── options/
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js                 # Settings, monitored emails, export data
│   ├── dashboard/
│   │   ├── dashboard.html             # Full-page payment/breach history
│   │   ├── dashboard.css
│   │   └── dashboard.js
│   ├── lib/
│   │   ├── api-client.js              # Wrapper around breach + phishing APIs
│   │   ├── url-utils.js               # Domain parsing, punycode, similarity
│   │   ├── crypto-utils.js            # SHA-1 prefix hashing for HIBP-style lookups
│   │   ├── messaging.js               # chrome.runtime.sendMessage helpers
│   │   └── constants.js
│   └── data/
│       ├── known-merchants.json       # Allowlist of well-known retailers
│       └── phishing-heuristics.json   # Rules: suspicious TLDs, keywords, patterns
├── rules/
│   └── declarative-rules.json         # declarativeNetRequest blocklist
├── tests/
│   ├── unit/
│   │   ├── url-utils.test.js
│   │   ├── phishing-engine.test.js
│   │   └── breach-monitor.test.js
│   └── fixtures/
│       └── sample-pages/
└── build/                             # Output of packaging step (gitignored)
```

---

## 2. File Inventory

### Root
- **manifest.json** — MV3 manifest. Declares service worker, content scripts, permissions (`storage`, `alarms`, `activeTab`, `scripting`, `declarativeNetRequest`, `notifications`), host permissions, action popup, options page.
- **README.md** — User-facing install + usage docs.
- **package.json** — Dev tooling (linter, bundler, test runner). No runtime deps shipped to users.
- **.gitignore** — Excludes `build/`, `node_modules/`, local secrets.

### Icons
- **icon16/32/48/128.png** — Required action + extension icons.

### Background (MV3 service worker)
- **service-worker.js** — Wires up listeners: `chrome.runtime.onInstalled`, `chrome.tabs.onUpdated`, `chrome.alarms.onAlarm`, message routing.
- **phishing-engine.js** — Scores a URL using heuristics (lookalike domain, recent registration signal, suspicious keywords, mixed-charset) and optionally a remote safe-browsing-style lookup.
- **breach-monitor.js** — Runs on a daily alarm, checks monitored emails against a breach API using k-anonymity hash prefixes, dispatches notifications.
- **payment-logger.js** — Receives payment events from content scripts, normalizes, persists to storage.
- **storage.js** — Single source of truth for reading/writing `chrome.storage.local` (payments, breaches, settings) and `chrome.storage.sync` (preferences).

### Content scripts
- **checkout-detector.js** — Heuristics for detecting payment forms (card number inputs, common checkout DOM patterns). Triggers phishing check via message.
- **phishing-overlay.js** — Injects a blocking warning UI when the background says the page is risky.
- **payment-capture.js** — On order-confirmation pages, extracts merchant, amount, currency, date; sends to background.

### Popup
- **popup.html / popup.css / popup.js** — Shows current tab's safety status, last 3 payments, any active breach alerts, link to dashboard.
- **components/** — Small render helpers for the three popup sections.

### Options
- **options.html / options.css / options.js** — Manage monitored email addresses, toggle features, set sensitivity, export/import data, clear history.

### Dashboard
- **dashboard.html / dashboard.css / dashboard.js** — Full-page view of all logged payments with filtering, breach timeline, and per-merchant breakdown.

### Library
- **api-client.js** — `fetch` wrappers for the breach + phishing APIs with retry + backoff.
- **url-utils.js** — Extract eTLD+1, detect punycode/homograph attacks, Levenshtein distance to known brands.
- **crypto-utils.js** — `SubtleCrypto` SHA-1 for k-anonymity prefix lookups.
- **messaging.js** — Typed send/receive helpers between content, popup, background.
- **constants.js** — Message types, storage keys, alarm names, default settings.

### Data
- **known-merchants.json** — Curated list of legitimate retailer domains (used as the "compare-against" set for lookalike detection).
- **phishing-heuristics.json** — Configurable rule weights so the engine isn't hardcoded.

### Rules
- **declarative-rules.json** — Static blocklist for the worst offenders; loaded via `declarativeNetRequest`.

### Tests
- **unit/** — Jest tests for pure logic (URL parsing, scoring, hashing).
- **fixtures/sample-pages/** — Saved HTML for content-script integration tests.

---

## 3. Build Steps

### Phase 1 — Scaffold
1. Initialize `package.json`, add ESLint + Prettier + Jest.
2. Write `manifest.json` with minimum viable permissions and stub entry points.
3. Add placeholder icons and verify the extension loads unpacked in Chrome.
4. Set up `storage.js`, `constants.js`, `messaging.js` — foundations everything else uses.

### Phase 2 — Phishing detection
5. Implement `url-utils.js` (eTLD+1, punycode decoding, similarity scoring).
6. Build `phishing-engine.js` with offline heuristics first; unit-test against good/bad URL fixtures.
7. Wire `service-worker.js` to run the engine on `tabs.onUpdated`.
8. Implement `checkout-detector.js` + `phishing-overlay.js` for in-page warnings.
9. Integrate a remote phishing API in `api-client.js` (cache results to respect quotas).
10. Add `declarative-rules.json` for hard blocks.

### Phase 3 — Payment tracking
11. Implement `payment-capture.js`: detect order-confirmation pages (URL patterns + DOM signals) and parse merchant/amount.
12. Implement `payment-logger.js` to dedupe and persist via `storage.js`.
13. Build the popup's `recent-payments.js` component.
14. Build the `dashboard/` page with filtering and a per-merchant view.
15. Add CSV export in `options.js`.

### Phase 4 — Data breach alerts
16. Implement `crypto-utils.js` (SHA-1 prefix for k-anonymity).
17. Implement `breach-monitor.js`: read monitored emails from storage, query API, diff against last-known breaches, persist.
18. Register a daily `chrome.alarms` job in the service worker.
19. Surface alerts via `chrome.notifications` + the popup `breach-banner.js`.
20. Add monitored-email management in `options.js`.

### Phase 5 — Polish
21. Cross-link the three features (e.g., if you paid a merchant that later appears in a breach, surface it in the dashboard).
22. Add settings: sensitivity sliders, per-feature toggles, data retention window.
23. Localize popup + options strings.
24. Write `README.md` with screenshots and a privacy statement (everything stored locally; only hash prefixes leave the device).

### Phase 6 — Test, package, publish
25. Unit tests pass; manual QA against fixture pages and a real checkout flow.
26. Package via `chrome://extensions` "Pack extension" or a `zip` script.
27. Create a Chrome Web Store developer account, prepare store listing assets.
28. Submit for review; iterate on policy feedback.

---

## 4. Key Technical Decisions

- **Manifest V3 service worker** — no persistent background page; all long-running work driven by events + `chrome.alarms`.
- **Local-first storage** — payments and breach state live in `chrome.storage.local`; preferences in `chrome.storage.sync`.
- **Privacy boundary** — only hash *prefixes* (k-anonymity) are sent to the breach API; full emails never leave the device.
- **Heuristics first, network second** — phishing engine returns a fast offline verdict, then upgrades the score with a cached remote lookup.
- **No bundler required initially** — vanilla ES modules keep the dev loop tight; add Rollup/esbuild only if the codebase outgrows it.
