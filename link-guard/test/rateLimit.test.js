'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { rateLimit } = require('../server/lib/rateLimit');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

test('allows up to max, then returns 429', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2 });
  const req = { ip: '1.2.3.4' };
  let next = 0;
  const r1 = mockRes(); mw(req, r1, () => next++);
  const r2 = mockRes(); mw(req, r2, () => next++);
  const r3 = mockRes(); mw(req, r3, () => next++);

  assert.equal(next, 2);
  assert.equal(r3.statusCode, 429);
  assert.equal(r3.body.error, 'rate_limited');
  assert.ok(r3.headers['Retry-After']);
});

test('keys separate IPs into separate buckets', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  let next = 0;
  mw({ ip: 'a' }, mockRes(), () => next++);
  mw({ ip: 'b' }, mockRes(), () => next++);
  assert.equal(next, 2); // neither IP exceeded its own cap
});

test('exposes remaining-quota headers', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 5 });
  const res = mockRes();
  mw({ ip: 'z' }, res, () => {});
  assert.equal(res.headers['X-RateLimit-Limit'], '5');
  assert.equal(res.headers['X-RateLimit-Remaining'], '4');
});
