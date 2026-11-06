'use strict';
process.env.THREAT_PROVIDER = 'mock'; // force the mock provider for deterministic tests
const { test } = require('node:test');
const assert = require('node:assert');
const { scanUrl, verdictFromScore } = require('../server/lib/scanner');

test('verdictFromScore thresholds', () => {
  assert.equal(verdictFromScore(0), 'safe');
  assert.equal(verdictFromScore(29), 'safe');
  assert.equal(verdictFromScore(30), 'suspicious');
  assert.equal(verdictFromScore(69), 'suspicious');
  assert.equal(verdictFromScore(70), 'malicious');
});

test('clean url → safe', async () => {
  const r = await scanUrl({ url: 'https://example.com/', host: 'example.com' });
  assert.equal(r.threat, 'safe');
});

test('brand lookalike → malicious', async () => {
  const r = await scanUrl({ url: 'https://paypa1-login.com/', host: 'paypa1-login.com' });
  assert.equal(r.threat, 'malicious');
});

test('deep subdomains → suspicious', async () => {
  const r = await scanUrl({ url: 'https://a.b.c.d.e.com/', host: 'a.b.c.d.e.com' });
  assert.equal(r.threat, 'suspicious');
});

test('threat keyword in url → malicious', async () => {
  const r = await scanUrl({ url: 'https://safe-bank.com/phishing/login', host: 'safe-bank.com' });
  assert.equal(r.threat, 'malicious');
});
