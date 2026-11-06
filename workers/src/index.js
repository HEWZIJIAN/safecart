import { Hono } from 'hono';
import { cors } from 'hono/cors';

import me from './routes/me.js';
import subscription from './routes/subscription.js';
import checkout from './routes/stripe-checkout.js';
import portal from './routes/stripe-portal.js';
import webhook from './routes/stripe-webhook.js';
import proxySafeBrowsing from './routes/proxy-safe-browsing.js';
import proxyPhishTank from './routes/proxy-phishtank.js';
import proxyHibp from './routes/proxy-hibp.js';

const app = new Hono();

app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (origin.startsWith('chrome-extension://')) return origin;
    if (origin.endsWith('.workers.dev')) return origin;
    return origin; // permissive in dev; tighten via WHITELIST_ORIGINS in prod if needed
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.get('/health', (c) => c.json({ ok: true }));

// Stripe webhook receives raw body for signature verification and must NOT
// require auth (it's authenticated by signature).
app.route('/api/stripe/webhook', webhook);

app.route('/api/me', me);
app.route('/api/subscription', subscription);
app.route('/api/stripe/checkout-session', checkout);
app.route('/api/stripe/billing-portal', portal);
app.route('/api/proxy/safe-browsing', proxySafeBrowsing);
app.route('/api/proxy/phishtank', proxyPhishTank);
app.route('/api/proxy/hibp', proxyHibp);

app.get('/success.html', (c) => c.html(SUCCESS_HTML));
app.get('/cancel.html', (c) => c.html(CANCEL_HTML));

const SUCCESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Payment received — SafeCart</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f6f7f9;color:#1a1a1a;margin:0;padding:64px 24px;text-align:center}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,.08)}.check{width:56px;height:56px;border-radius:50%;background:#d3f9d8;color:#2b8a3e;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;font-weight:700}h1{margin:0 0 8px;font-size:22px}p{color:#555;line-height:1.5}</style>
</head><body><div class="card"><div class="check">✓</div><h1>Payment received</h1><p>Thanks for upgrading. You can close this tab and return to the SafeCart extension.</p></div></body></html>`;

const CANCEL_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Checkout canceled — SafeCart</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f6f7f9;color:#1a1a1a;margin:0;padding:64px 24px;text-align:center}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,.08)}.x{width:56px;height:56px;border-radius:50%;background:#ffe3e3;color:#c92a2a;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;font-weight:700}h1{margin:0 0 8px;font-size:22px}p{color:#555;line-height:1.5}</style>
</head><body><div class="card"><div class="x">×</div><h1>Checkout canceled</h1><p>No charges were made. You can close this tab and return to the SafeCart extension.</p></div></body></html>`;

export default app;
