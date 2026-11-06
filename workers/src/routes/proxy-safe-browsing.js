import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';

const route = new Hono();

route.use('*', authMiddleware);

route.post('/', async (c) => {
  if (!c.env.SAFE_BROWSING_API_KEY) {
    return c.json({ available: false, error: 'not_configured' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const url = body?.url;
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return c.json({ error: 'invalid_url' }, 400);
  }

  const upstream = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(c.env.SAFE_BROWSING_API_KEY)}`;
  const payload = {
    client: { clientId: 'safecart-workers', clientVersion: '0.1.0' },
    threatInfo: {
      threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  };

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return c.json({ available: true, match: false, error: `upstream_${response.status}` }, 502);
    }
    const data = await response.json();
    const matches = data.matches || [];
    return c.json({
      available: true,
      match: matches.length > 0,
      threatTypes: matches.map((m) => m.threatType),
    });
  } catch (err) {
    return c.json({ available: true, match: false, error: 'upstream_error', detail: err.message }, 502);
  }
});

export default route;
