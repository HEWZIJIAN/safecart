import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';
import { stripeClient } from '../lib/stripe.js';
import { getSubscriptionByUserId } from '../lib/supabase.js';

const portal = new Hono();

portal.use('*', authMiddleware);

portal.post('/', async (c) => {
  const userId = c.get('userId');
  const row = await getSubscriptionByUserId(c.env, userId).catch(() => null);
  if (!row?.stripe_customer_id) {
    return c.json({ error: 'no_customer_for_user' }, 404);
  }
  const stripe = stripeClient(c.env);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: c.env.BILLING_PORTAL_RETURN_URL,
    });
    return c.json({ url: session.url });
  } catch (err) {
    return c.json({ error: 'stripe_error', detail: err.message }, 502);
  }
});

export default portal;
