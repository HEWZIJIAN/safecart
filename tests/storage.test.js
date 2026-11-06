import { test } from 'node:test';
import assert from 'node:assert';
import { clearVerdictCache } from '../src/background/storage.js';

// clearVerdictCache() runs on extension update so changed scoring logic re-scores
// immediately instead of serving stale cached verdicts for up to CACHE_TTL_MS.
test('clearVerdictCache removes the verdict-cache storage key', async () => {
  let removedKey = null;
  global.chrome = { storage: { local: { remove: async (key) => { removedKey = key; } } } };
  try {
    await clearVerdictCache();
    assert.equal(removedKey, 'safecart.verdict_cache');
  } finally {
    delete global.chrome;
  }
});
