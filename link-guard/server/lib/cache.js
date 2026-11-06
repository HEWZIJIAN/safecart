'use strict';
/**
 * Tiny in-memory TTL + LRU cache. Keyed by normalized URL.
 *
 * Good enough for a single instance. For multi-instance deployments use a shared
 * store (Redis) so a cache hit on one node serves the others — see README.
 */
class TtlCache {
  constructor({ max = 5000 } = {}) {
    this.max = max;
    this.store = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU recency (re-insert moves it to the end).
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key, value, ttlMs) {
    if (!this.store.has(key) && this.store.size >= this.max) {
      // Evict the least-recently-used entry (first key in insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { TtlCache };
