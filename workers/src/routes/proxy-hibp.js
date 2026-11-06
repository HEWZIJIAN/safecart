import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';

const route = new Hono();

route.use('*', authMiddleware);

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

route.get('/breaches', async (c) => {
  const domain = c.req.query('domain') || '';
  if (!DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid_domain' }, 400);
  }

  const headers = {
    'User-Agent': 'SafeCart-Workers/0.1 (Cloudflare Workers; +github)',
    Accept: 'application/json',
  };
  if (c.env.HIBP_API_KEY) headers['hibp-api-key'] = c.env.HIBP_API_KEY;

  try {
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`,
      { headers },
    );
    if (response.status === 404) return c.json([]);
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after') || '5';
      return c.json({ error: 'rate_limited', retryAfter }, 429);
    }
    if (!response.ok) {
      return c.json({ error: `upstream_${response.status}` }, 502);
    }
    const data = await response.json();
    return c.json(Array.isArray(data) ? data : []);
  } catch (err) {
    return c.json({ error: 'upstream_error', detail: err.message }, 502);
  }
});

export default route;
