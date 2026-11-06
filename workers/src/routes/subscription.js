import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';
import { getSubscriptionByUserId } from '../lib/supabase.js';

const subscription = new Hono();

subscription.use('*', authMiddleware);

subscription.get('/', async (c) => {
  const userId = c.get('userId');
  try {
    const row = await getSubscriptionByUserId(c.env, userId);
    if (!row) {
      return c.json({
        tier: 'free',
        status: 'inactive',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasStripeCustomer: false,
      });
    }
    return c.json({
      tier: row.tier,
      status: row.status,
      currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).getTime() : null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      hasStripeCustomer: Boolean(row.stripe_customer_id),
    });
  } catch (err) {
    return c.json({ error: 'supabase_error', detail: err.message }, 502);
  }
});

export default subscription;
