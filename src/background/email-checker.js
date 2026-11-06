// =============================================================================
// PRIVACY NOTE
// -----------------------------------------------------------------------------
// This module reads the user's Gmail entirely on the user's own device.
//
// Data flow:
//   Chrome extension service worker  ──HTTPS──▶  gmail.googleapis.com
//                                    ◀──HTTPS──
//   (results parsed in memory, written to chrome.storage.local only)
//
// No email content, headers, tokens, or query strings are ever sent to a
// SafeCart-operated server. Gmail is read entirely on-device (only From/Subject/
// Date headers + the snippet — never full message bodies) and only the matched
// results are written to chrome.storage.local. SafeCart DOES run a backend — for
// account/subscription and as a keyless proxy for the URL + breach lookups in
// api-client.js — but it never receives any email data.
//
// The OAuth token is obtained via chrome.identity.getAuthToken (Chrome handles
// the OAuth dance) and is held only in memory or in Chrome's identity store.
// Scope requested: https://www.googleapis.com/auth/gmail.readonly (read-only).
// =============================================================================

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getAuthToken(interactive = false) {
  return new Promise((resolve) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          resolve({ ok: false, error: chrome.runtime.lastError?.message || 'no_token' });
          return;
        }
        resolve({ ok: true, token });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    try {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function gmailFetch(path, token, retry = true) {
  const response = await fetchWithTimeout(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 && retry) {
    await removeCachedAuthToken(token);
    const fresh = await getAuthToken(false);
    if (fresh.ok) return gmailFetch(path, fresh.token, false);
  }
  return response;
}

function buildQuery({ merchantHost, merchantName, amount, currency, afterSec }) {
  const senderTerms = [];
  if (merchantHost) {
    const parts = merchantHost.split('.');
    const core = parts.length >= 2 ? parts.slice(-2).join('.') : merchantHost;
    senderTerms.push(`from:${core}`);
    if (parts.length >= 2) senderTerms.push(`from:${parts[parts.length - 2]}`);
  }
  if (merchantName) {
    const cleanName = merchantName.replace(/[^\w\s]/g, '').trim();
    if (cleanName) senderTerms.push(`from:"${cleanName}"`);
  }

  const subjectTerms = '(subject:(order OR receipt OR confirmation OR invoice OR purchase) OR "order confirmation" OR "your order")';
  const senderClause = senderTerms.length ? `(${senderTerms.join(' OR ')})` : '';
  const afterClause = `after:${afterSec}`;
  return [senderClause, subjectTerms, afterClause].filter(Boolean).join(' ');
}

function buildFallbackQuery({ merchantName, merchantHost, afterSec }) {
  const name = merchantName || merchantHost?.split('.')[0];
  if (!name) return '';
  const clean = name.replace(/[^\w\s]/g, '').trim();
  return `"${clean}" (subject:order OR subject:receipt OR subject:confirmation) after:${afterSec}`;
}

function formatAmountForBody(amount, currency) {
  if (amount == null) return [];
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };
  const sym = symbols[currency] || '';
  const fixed = amount.toFixed(2);
  const variants = new Set([fixed, amount.toString()]);
  if (sym) {
    variants.add(`${sym}${fixed}`);
    variants.add(`${sym} ${fixed}`);
  }
  if (currency) variants.add(`${fixed} ${currency}`);
  return [...variants];
}

async function listMessages(query, token, maxResults = 10) {
  const url = `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const response = await gmailFetch(url, token);
  if (!response.ok) {
    return { ok: false, error: `http_${response.status}` };
  }
  const data = await response.json();
  return { ok: true, messages: data.messages || [] };
}

async function getMessage(id, token) {
  const response = await gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, token);
  if (!response.ok) return null;
  return response.json();
}

function scoreMessage(message, { merchantHost, merchantName, amount, currency }) {
  let score = 0;
  const reasons = [];
  const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
  const from = (headers.from || '').toLowerCase();
  const subject = (headers.subject || '').toLowerCase();
  const snippet = (message.snippet || '').toLowerCase();

  if (merchantHost) {
    const core = merchantHost.split('.').slice(-2).join('.');
    if (from.includes(core)) { score += 40; reasons.push(`from contains ${core}`); }
  }
  if (merchantName) {
    const name = merchantName.toLowerCase();
    if (from.includes(name) || subject.includes(name) || snippet.includes(name)) {
      score += 20; reasons.push(`name match: ${name}`);
    }
  }

  const subjectKeywords = ['order', 'receipt', 'confirmation', 'invoice', 'purchase'];
  if (subjectKeywords.some((k) => subject.includes(k))) {
    score += 20; reasons.push('subject keyword');
  }

  if (amount != null) {
    for (const variant of formatAmountForBody(amount, currency)) {
      if (snippet.includes(variant.toLowerCase())) {
        score += 30; reasons.push(`amount in snippet: ${variant}`);
        break;
      }
    }
  }

  return { score, reasons, headers };
}

export async function checkInbox(payment, { interactive = false } = {}) {
  const auth = await getAuthToken(interactive);
  if (!auth.ok) {
    return { ok: false, status: 'no_auth', error: auth.error };
  }

  const afterSec = Math.max(0, Math.floor(payment.createdAt / 1000) - 5 * 60);
  const ctx = {
    merchantHost: payment.merchantHost,
    merchantName: payment.merchantName,
    amount: payment.amount,
    currency: payment.currency,
    afterSec,
  };

  const primaryQuery = buildQuery(ctx);
  let listing = await listMessages(primaryQuery, auth.token);
  if (!listing.ok) return { ok: false, status: 'api_error', error: listing.error };

  if (listing.messages.length === 0) {
    const fallback = buildFallbackQuery(ctx);
    if (fallback) {
      listing = await listMessages(fallback, auth.token);
      if (!listing.ok) return { ok: false, status: 'api_error', error: listing.error };
    }
  }

  if (listing.messages.length === 0) {
    return { ok: true, status: 'no_match', matches: [] };
  }

  const evaluated = [];
  for (const ref of listing.messages.slice(0, 8)) {
    const message = await getMessage(ref.id, auth.token);
    if (!message) continue;
    const scored = scoreMessage(message, ctx);
    if (scored.score >= 40) {
      evaluated.push({
        id: ref.id,
        score: scored.score,
        reasons: scored.reasons,
        from: scored.headers.from || '',
        subject: scored.headers.subject || '',
        date: scored.headers.date || '',
      });
    }
  }

  evaluated.sort((a, b) => b.score - a.score);
  if (evaluated.length === 0) {
    return { ok: true, status: 'no_match', matches: [] };
  }
  return { ok: true, status: 'match', matches: evaluated };
}
