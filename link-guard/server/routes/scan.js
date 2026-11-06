'use strict';
const express = require('express');
const { validateUrl } = require('../lib/validateUrl');
const { scanUrl } = require('../lib/scanner');
const { TtlCache } = require('../lib/cache');

const router = express.Router();

// Per-verdict cache TTLs. Safe results can live longer; bad/suspicious re-resolve
// sooner so a site that gets cleaned up (or freshly compromised) updates quickly.
const TTL = {
  safe: Number(process.env.CACHE_TTL_SAFE_MS || 30 * 60_000),
  suspicious: Number(process.env.CACHE_TTL_BAD_MS || 10 * 60_000),
  malicious: Number(process.env.CACHE_TTL_BAD_MS || 10 * 60_000),
  // 'unknown' (upstream error) is cached very briefly so we retry soon.
  unknown: 30_000,
};

const cache = new TtlCache({ max: Number(process.env.CACHE_MAX || 5000) });

/**
 * POST /api/scan   body: { "url": "https://example.com/path" }
 * → 200 { url, host, threat, score, sources, checkedAt, cached }
 * → 400 invalid_url | private_host
 * → 429 rate_limited (handled by middleware)
 */
router.post('/scan', async (req, res) => {
  const { url } = req.body || {};

  const v = validateUrl(url);
  if (!v.ok) return res.status(400).json({ error: 'invalid_url', message: v.error });
  if (v.isPrivate) {
    return res.status(400).json({ error: 'private_host', message: 'Refusing to scan a private/internal host.' });
  }

  const cached = cache.get(v.url);
  if (cached) return res.json({ ...cached, cached: true });

  const result = await scanUrl({ url: v.url, host: v.host });

  const payload = {
    url: v.url,
    host: v.host,
    threat: result.threat, // safe | suspicious | malicious | unknown
    score: result.score,   // 0..100
    sources: result.sources || [],
    checkedAt: new Date().toISOString(),
    cached: false,
  };

  const ttl = TTL[result.threat];
  if (ttl) cache.set(v.url, payload, ttl);

  return res.json(payload);
});

// Liveness/diagnostics.
router.get('/healthz', (_req, res) => res.json({ ok: true, cacheSize: cache.size }));

module.exports = router;
