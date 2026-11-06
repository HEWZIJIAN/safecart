'use strict';
/**
 * URL validation + normalization.
 *
 * Rejects anything that isn't a plain http(s) URL: dangerous schemes
 * (javascript:, data:, file:…), over-long inputs, and embedded credentials.
 * Also flags private / loopback / link-local hosts as defense-in-depth — we
 * never want this service (or a future "fetch the page to scan it" upgrade)
 * to be turned into an SSRF pivot against internal infrastructure.
 *
 * Returns { ok:true, url, host, isPrivate, parsed } or { ok:false, error }.
 */

const MAX_URL_LENGTH = 2048;

// Hostnames / IP ranges we never scan or proxy to.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0 – 172.31.255.255
  /^169\.254\./,                 // link-local
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,                 // IPv6 loopback
  /^\[?fc00:/i,                  // IPv6 unique-local
  /^\[?fe80:/i,                  // IPv6 link-local
];

function validateUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'URL must be a string' };

  const input = raw.trim();
  if (!input) return { ok: false, error: 'URL is empty' };
  if (input.length > MAX_URL_LENGTH) return { ok: false, error: 'URL too long' };

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: 'Malformed URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: `Unsupported scheme: ${parsed.protocol}` };
  }

  // No embedded credentials (https://user:pass@host) — a classic obfuscation trick.
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with credentials are not allowed' };
  }

  const host = parsed.hostname;
  if (!host) return { ok: false, error: 'Missing host' };

  const isPrivate = PRIVATE_HOST_PATTERNS.some((re) => re.test(host));

  // Normalized form is used as the cache key: drop the fragment, keep query
  // (some scams live on a query param), lowercase host courtesy of the URL API.
  parsed.hash = '';
  const url = parsed.toString();

  return { ok: true, url, host, isPrivate, parsed };
}

module.exports = { validateUrl, MAX_URL_LENGTH };
