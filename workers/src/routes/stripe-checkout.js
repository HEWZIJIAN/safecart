import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';
import { stripeClient, priceIdForTier, TIERS } from '../lib/stripe.js';
import { getSubscriptionByUserId, upsertSubscription } from '../lib/supabase.js';

const checkout = new Hono();

checkout.use('*', authMiddleware);

checkout.post('/', async (c) => {
  const userId = c.get('userId');
  const email = c.get('email');
  const { tier } = await c.req.json().catch(() => ({}));

  if (tier !== TIERS.PREMIUM && tier !== TIERS.FAMILY) {
    return c.json({ error: 'invalid_tier' }, 400);
  }
  const priceId = priceIdForTier(c.env, tier);
  if (!priceId) return c.json({ error: 'price_not_configured' }, 500);

  const stripe = stripeClient(c.env);
  let row;
  try {
    row = await getSubscriptionByUserId(c.env, userId);
    if (!row) {
      row = await upsertSubscription(c.env, {
        user_id: userId,
        tier: 'free',
        status: 'inactive',
      });
    }
  } catch (err) {
    return c.json({ error: 'supabase_error', detail: err.message }, 502);
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${c.env.CHECKOUT_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: c.env.CHECKOUT_CANCEL_URL,
      customer: row?.stripe_customer_id || undefined,
      customer_email: row?.stripe_customer_id ? undefined : (email || undefined),
      client_reference_id: userId,
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: userId, intended_tier: tier } },
      metadata: { user_id: userId, intended_tier: tier },
    });
    return c.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return c.json({ error: 'stripe_error', detail: err.message }, 502);
  }
});

export default checkout;
