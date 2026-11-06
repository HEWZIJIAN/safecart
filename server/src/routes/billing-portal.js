import express from 'express';
import { stripe } from '../stripe-client.js';
import { config } from '../config.js';
import { getSubscriptionByRef } from '../db.js';

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/billing-portal', express.json(), async (req, res) => {
  const clientRef = req.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!clientRef || !UUID_RE.test(clientRef)) {
    return res.status(401).json({ error: 'missing_or_invalid_client_ref' });
  }

  const row = getSubscriptionByRef(clientRef);
  if (!row?.stripe_customer_id) {
    return res.status(404).json({ error: 'no_customer_for_ref' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: config.billingPortal.returnUrl,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('[portal] create session failed', err);
    return res.status(502).json({ error: 'stripe_error', detail: err.message });
  }
});

export default router;
