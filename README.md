# SafeCart

**Spot the scam before you pay.** SafeCart is a Chrome extension that protects online shoppers from phishing and impostor checkout pages, tracks their payments, and surfaces data-breach alerts.

- 🌐 Website: https://safecart.co
- 🧩 Chrome Web Store: https://chromewebstore.google.com/detail/safecart/cljpoelnlljioahkhgiplbbgkacebech
- 🔒 Privacy policy: https://hewzijian.github.io/safecart-privacy/

## The problem

Scams like fake stores, look-alike bank logins, "USPS redelivery fee" texts, and fake parking QR codes all end the same way: a convincing page asks for your card. By the time you notice the URL is wrong, the money is gone. SafeCart checks the page **before** you type anything.

## Features

- **Checkout safety score (0–100).** Scores every checkout page with a color-coded ring: red 0–33 (dangerous), orange 34–66 (cautious), green 67–100 (safe).
- **Impostor & typo-squat detection.** Recognises brand look-alikes such as `amaz0n.de`, `amazon-login.de` and `amazon.de.evil.com`. Because it understands TLDs, the real regional stores (`amazon.de`, `amazon.co.uk`, `paypal.fr`) stay rated safe.
- **Multi-signal verdicts.** Combines local heuristics with Google Safe Browsing, PhishTank, and RDAP domain-age lookups.
- **In-page warning.** On risky pages, an overlay shows the same 0–100 score and the reasons behind it.
- **Payment tracking & chargeback help.** Detects completed orders and helps you dispute a charge with the right merchant contact.
- **Breach alerts.** Uses HaveIBeenPwned's domain endpoint to warn you about stores that have leaked customer data.

## Privacy by design

Purchases are stored locally. Phishing checks send only the checkout URL, through a proxy that keeps API keys server-side. Breach checks send only public store domains. The extension never holds third-party API keys.

## Architecture

```
safecart/
├─ src/           # Chrome MV3 extension (React popup + service worker + content scripts)
│  ├─ background/ # phishing engine, breach monitor, payment tracker, chargeback, storage
│  ├─ content/    # checkout / buy-button detection, order parsing, warning overlay
│  ├─ lib/        # 0–100 scoring, TLD-aware URL utils, API client
│  └─ popup/      # React UI (safety ring, recent payments, breach alerts)
├─ workers/       # Cloudflare Workers + Hono API: Supabase auth, Stripe billing,
│                 #   and key-hiding proxies for Safe Browsing / PhishTank / HIBP
├─ link-guard/    # Standalone pre-click link scanner (Express proxy + JS interceptor)
├─ server/        # Earlier Express + SQLite Stripe server (superseded by workers/)
├─ website/       # Landing page + scam guide
└─ tests/         # node:test + jsdom tests
```

**Tech stack:** JavaScript, React 18, Vite, Chrome Extensions Manifest V3, Cloudflare Workers (Hono), Supabase (Auth + Postgres), Stripe, node:test + jsdom.

## Run it locally

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select this repository's root folder (the one containing `manifest.json`).

### Tests

```bash
npm test
```

The 17 tests cover safety-score banding, TLD-aware impostor detection, the warning overlay (jsdom), and verdict-cache invalidation on extension update.

### Backend (optional)

The extension works against the deployed API. To run your own, see [`workers/README.md`](workers/README.md). Copy `workers/.dev.vars.example` to `workers/.dev.vars` and fill in your own keys.
