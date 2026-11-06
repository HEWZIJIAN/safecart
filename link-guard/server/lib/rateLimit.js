'use strict';
/**
 * Minimal in-memory fixed-window rate limiter (zero external deps).
 *
 * Protects our upstream threat-API key/quota from being spammed. Keys on the
 * client IP by default. For production behind multiple instances or a proxy,
 * prefer `express-rate-limit` with a shared Redis store, and set TRUST_PROXY so
 * req.ip is the real client (see README). This implementation is per-process.
 */
function rateLimit({ windowMs = 60_000, max = 30, keyFn } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Periodically drop expired buckets so the Map can't grow unbounded.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }, windowMs);
  if (timer.unref) timer.unref(); // don't keep the process alive for cleanup

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn ? keyFn(req) : req.ip || 'unknown';
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please slow down.' });
    }
    return next();
  };
}

module.exports = { rateLimit };
