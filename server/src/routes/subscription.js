import express from 'express';
import { getSubscriptionByRef } from '../db.js';
import { TIERS } from '../config.js';

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/subscription', (req, res) => {
  const clientRef = req.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!clientRef || !UUID_RE.test(clientRef)) {
    return res.status(401).json({ error: 'missing_or_invalid_client_ref' });
  }

  const row = getSubscriptionByRef(clientRef);
  if (!row) {
    return res.json({
      tier: TIERS.FREE,
      status: 'inactive',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      hasStripeCustomer: false,
    });
  }

  return res.json({
    tier: row.tier,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    hasStripeCustomer: Boolean(row.stripe_customer_id),
  });
});

export default router;
