'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { validateUrl } = require('../server/lib/validateUrl');

test('accepts a normal https url and strips the fragment', () => {
  const r = validateUrl('https://example.com/path?q=1#frag');
  assert.equal(r.ok, true);
  assert.equal(r.host, 'example.com');
  assert.equal(r.url.includes('#'), false);
});

test('rejects a non-string', () => {
  assert.equal(validateUrl(1234).ok, false);
});

test('rejects the javascript: scheme', () => {
  assert.equal(validateUrl('javascript:alert(1)').ok, false);
});

test('rejects data: and file: schemes', () => {
  assert.equal(validateUrl('data:text/html,<h1>x').ok, false);
  assert.equal(validateUrl('file:///etc/passwd').ok, false);
});

test('rejects embedded credentials', () => {
  assert.equal(validateUrl('https://user:pass@example.com/').ok, false);
});

test('rejects an over-long url', () => {
  assert.equal(validateUrl('https://x.com/' + 'a'.repeat(3000)).ok, false);
});

test('flags loopback IP as private', () => {
  const r = validateUrl('http://127.0.0.1:22/');
  assert.equal(r.ok, true);
  assert.equal(r.isPrivate, true);
});

test('flags localhost and RFC-1918 ranges as private', () => {
  assert.equal(validateUrl('http://localhost/').isPrivate, true);
  assert.equal(validateUrl('http://192.168.1.10/').isPrivate, true);
  assert.equal(validateUrl('http://10.0.0.5/').isPrivate, true);
  assert.equal(validateUrl('http://172.16.0.1/').isPrivate, true);
});

test('public host is not flagged private', () => {
  assert.equal(validateUrl('https://example.com/').isPrivate, false);
});
