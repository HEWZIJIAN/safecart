import express from 'express';
import { stripe } from '../stripe-client.js';
import { config, priceIdForTier, TIERS } from '../config.js';
import { getSubscriptionByRef, upsertSubscription } from '../db.js';

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/checkout-session', express.json(), async (req, res) => {
  const clientRef = req.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!clientRef || !UUID_RE.test(clientRef)) {
    return res.status(401).json({ error: 'missing_or_invalid_client_ref' });
  }

  const tier = String(req.body?.tier || '').toLowerCase();
  if (tier !== TIERS.PREMIUM && tier !== TIERS.FAMILY) {
    return res.status(400).json({ error: 'invalid_tier' });
  }
  const priceId = priceIdForTier(tier);
  if (!priceId) return res.status(500).json({ error: 'price_not_configured' });

  let row = getSubscriptionByRef(clientRef);
  if (!row) {
    row = upsertSubscription({ client_ref: clientRef, tier: 'free', status: 'inactive' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.checkout.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: config.checkout.cancelUrl,
      client_reference_id: clientRef,
      customer: row.stripe_customer_id || undefined,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { client_ref: clientRef, intended_tier: tier },
      },
      metadata: { client_ref: clientRef, intended_tier: tier },
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[checkout] create session failed', err);
    return res.status(502).json({ error: 'stripe_error', detail: err.message });
  }
});

export default router;
