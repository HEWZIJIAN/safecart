'use strict';
const express = require('express');
const { validateUrl } = require('../lib/validateUrl');
const { ReportStore, CLAIMS } = require('../lib/reportStore');

const router = express.Router();
const store = new ReportStore({ max: Number(process.env.REPORT_MAX || 1000) });
const MAX_NOTE = 500;

/**
 * POST /api/report   body: { url, claim, note? }
 *   claim ∈ { false_positive, false_negative, report_scam }
 * → 202 { ok, id, status:'received' }
 * → 400 invalid_url | invalid_claim | invalid_note
 *
 * Same validation + rate-limit + CORS as /scan (it's mounted under /api).
 */
router.post('/report', (req, res) => {
  const { url, claim, note } = req.body || {};

  const v = validateUrl(url);
  if (!v.ok) return res.status(400).json({ error: 'invalid_url', message: v.error });
  if (!CLAIMS.has(claim)) {
    return res.status(400).json({ error: 'invalid_claim', message: 'claim must be one of: ' + [...CLAIMS].join(', ') });
  }

  let safeNote;
  if (note != null) {
    if (typeof note !== 'string') return res.status(400).json({ error: 'invalid_note', message: 'note must be a string' });
    safeNote = note.slice(0, MAX_NOTE); // cap length; stored/escaped on display, never rendered as HTML
  }

  const entry = store.add({ url: v.url, host: v.host, claim, note: safeNote });
  // TODO(prod): forward `entry` to your durable review queue / threat pipeline.
  return res.status(202).json({ ok: true, id: entry.id, status: 'received' });
});

/** Aggregate counts for ops dashboards (no URLs exposed). */
router.get('/report/stats', (_req, res) => res.json(store.stats()));

module.exports = router;
