import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';
import { getSubscriptionByUserId } from '../lib/supabase.js';

const me = new Hono();

me.use('*', authMiddleware);

me.get('/', async (c) => {
  const userId = c.get('userId');
  const email = c.get('email');
  let subscription = null;
  try {
    subscription = await getSubscriptionByUserId(c.env, userId);
  } catch (err) {
    return c.json({ error: 'supabase_error', detail: err.message }, 502);
  }
  return c.json({
    userId,
    email,
    subscription: subscription || { tier: 'free', status: 'inactive' },
  });
});

export default me;
