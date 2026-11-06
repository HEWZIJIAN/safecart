import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';

const route = new Hono();

route.use('*', authMiddleware);

route.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = body?.url;
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return c.json({ error: 'invalid_url' }, 400);
  }

  const params = new URLSearchParams({ url, format: 'json' });
  if (c.env.PHISHTANK_API_KEY) params.set('app_key', c.env.PHISHTANK_API_KEY);

  try {
    const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) {
      return c.json({ available: true, match: false, error: `upstream_${response.status}` }, 502);
    }
    const data = await response.json();
    const results = data?.results || {};
    return c.json({
      available: true,
      match: Boolean(results.in_database && results.valid),
      verifiedPhish: Boolean(results.verified),
    });
  } catch (err) {
    return c.json({ available: true, match: false, error: 'upstream_error', detail: err.message }, 502);
  }
});

export default route;
