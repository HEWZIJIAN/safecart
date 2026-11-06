'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { TtlCache } = require('../server/lib/cache');

test('stores and retrieves a value', () => {
  const c = new TtlCache();
  c.set('k', { v: 1 }, 1000);
  assert.deepEqual(c.get('k'), { v: 1 });
});

test('expires a value after its TTL', async () => {
  const c = new TtlCache();
  c.set('k', 1, 20);
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(c.get('k'), undefined);
});

test('evicts the least-recently-used entry past max', () => {
  const c = new TtlCache({ max: 2 });
  c.set('a', 1, 1000);
  c.set('b', 2, 1000);
  c.get('a'); // touch 'a' so 'b' is now the LRU
  c.set('c', 3, 1000); // should evict 'b'
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
});
