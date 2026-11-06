'use strict';
/**
 * In-memory store for user-submitted link reports (false positive / false negative
 * / generic scam report). Capped ring buffer.
 *
 * In production, forward every report to a durable queue or DB and into your
 * threat-review pipeline (so a real false-negative becomes a blocklist entry).
 * This module deliberately keeps the same tiny surface so swapping it for a real
 * store is a one-file change.
 */
const crypto = require('crypto');

const CLAIMS = new Set(['false_positive', 'false_negative', 'report_scam']);

class ReportStore {
  constructor({ max = 1000 } = {}) {
    this.max = max;
    this.items = [];
  }

  add(report) {
    const entry = { id: crypto.randomBytes(9).toString('base64url'), at: new Date().toISOString(), ...report };
    this.items.push(entry);
    if (this.items.length > this.max) this.items.shift(); // drop oldest
    return entry;
  }

  /** Aggregate counts only — never exposes the reported URLs. */
  stats() {
    const byClaim = {};
    for (const r of this.items) byClaim[r.claim] = (byClaim[r.claim] || 0) + 1;
    return { total: this.items.length, byClaim };
  }
}

module.exports = { ReportStore, CLAIMS };
