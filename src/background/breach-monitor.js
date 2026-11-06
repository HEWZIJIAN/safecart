// =============================================================================
// PRIVACY NOTE
// -----------------------------------------------------------------------------
// This module checks the HaveIBeenPwned "breaches by domain" endpoint, which
// is a public-information lookup: we send only public merchant domain names
// (e.g. "amazon.com"), not the user's email, password, or any PII.
//
// Data flow (merchant DOMAIN only — never email, password, or PII):
//   signed out:  service worker  ──HTTPS──▶  haveibeenpwned.com/api/v3
//   signed in:   service worker  ──HTTPS──▶  SafeCart Worker (keyless proxy)  ──▶  HIBP
//   (results parsed in memory, written to chrome.storage.local only)
//
// The tracked-merchant list is built from the user's own checkout/purchase
// activity on-device. The SafeCart proxy exists only so the HIBP API key isn't
// shipped in the extension; it forwards the domain to HIBP and stores nothing.
// =============================================================================

import {
  getTrackedMerchants, upsertTrackedMerchant,
  getBreachRecordFor, setBreachRecordFor,
} from './storage.js';
import { getBreachesForDomain } from '../lib/api-client.js';
import { getETLDPlusOne } from '../lib/url-utils.js';
import { ALARMS } from '../lib/constants.js';

const THROTTLE_MS = 1600;
const RECHECK_INTERVAL_MS = 18 * 60 * 60 * 1000;

const DATA_CLASS_RECOMMENDATIONS = [
  { match: /password/i,    advice: 'Change your password on this site immediately. If you reused that password elsewhere, change it there too.' },
  { match: /credit card|payment|cvv|cvc/i, advice: 'Contact your card issuer and request a replacement card. Review recent statements for unauthorized charges.' },
  { match: /social security|ssn|tax/i, advice: 'Place a fraud alert or credit freeze with the major credit bureaus.' },
  { match: /email/i,        advice: 'Expect targeted phishing emails referencing this breach. Do not click links in unexpected messages from this merchant.' },
  { match: /phone/i,        advice: 'Watch for SMS phishing and SIM-swap attempts. Consider adding a PIN with your mobile carrier.' },
  { match: /date of birth|dob/i, advice: 'Treat unsolicited identity-verification calls or emails as suspicious.' },
  { match: /address|physical/i, advice: 'Be wary of mailed scams, fake delivery notices, and tailored phishing using your address.' },
  { match: /security question|secret answer/i, advice: 'Change any account using these security answers; reuse makes them effective forever.' },
  { match: /name/i,         advice: 'Combined with other leaked data, names enable targeted social engineering — verify any unexpected outreach independently.' },
];

const GENERIC_ADVICE = [
  'Enable two-factor authentication on the breached account if it offers it.',
  'Audit recent activity on the account for anything you did not do.',
];

export function recommendationsFor(dataClasses) {
  const advice = new Set();
  for (const cls of dataClasses || []) {
    for (const rule of DATA_CLASS_RECOMMENDATIONS) {
      if (rule.match.test(cls)) advice.add(rule.advice);
    }
  }
  for (const a of GENERIC_ADVICE) advice.add(a);
  return [...advice];
}

export function ensureDailyAlarm() {
  chrome.alarms.get(ALARMS.BREACH_DAILY, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARMS.BREACH_DAILY, {
        delayInMinutes: 5,
        periodInMinutes: 24 * 60,
      });
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBreachesForDomain(domain) {
  try {
    return await getBreachesForDomain(domain);
  } catch (err) {
    if (err.message === 'hibp_rate_limited') {
      await delay(((err.retryAfter || 5) + 1) * 1000);
      return getBreachesForDomain(domain);
    }
    throw err;
  }
}

export async function trackMerchant(hostname, { displayName, incrementPayment = false } = {}) {
  if (!hostname) return null;
  const cleaned = hostname.replace(/^www\./, '').toLowerCase();
  const domain = getETLDPlusOne(cleaned) || cleaned;
  const existing = (await getTrackedMerchants())[domain];
  const patch = {};
  if (displayName) patch.displayName = displayName;
  if (incrementPayment) patch.paymentCount = (existing?.paymentCount || 0) + 1;
  if (!existing) patch.firstSeen = Date.now();
  return upsertTrackedMerchant(domain, patch);
}

function normalizeBreach(b) {
  return {
    name: b.Name,
    title: b.Title || b.Name,
    domain: b.Domain || '',
    breachDate: b.BreachDate || '',
    addedDate: b.AddedDate || '',
    pwnCount: b.PwnCount || 0,
    dataClasses: Array.isArray(b.DataClasses) ? b.DataClasses : [],
    description: stripHtml(b.Description || ''),
    isVerified: Boolean(b.IsVerified),
    isSensitive: Boolean(b.IsSensitive),
  };
}

function stripHtml(html) {
  return html
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fireBreachNotification(domain, merchant, breach) {
  const merchantName = merchant.displayName || domain;
  const leaked = (breach.dataClasses || []).slice(0, 4).join(', ') || 'account details';
  const notifId = `safecart-breach-${domain}__${breach.name}`;

  await chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `SafeCart: ${merchantName} had a data breach`,
    message: `Leaked in ${breach.title}: ${leaked}. Click to see what to do next.`,
    contextMessage: breach.breachDate ? `Breach date: ${breach.breachDate}` : '',
    priority: 2,
    requireInteraction: true,
  });
}

export async function runBreachCheck({ forceAll = false } = {}) {
  const merchants = await getTrackedMerchants();
  const domains = Object.keys(merchants);
  const summary = { checked: 0, skipped: 0, newBreaches: 0, errors: [] };

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    const merchant = merchants[domain];
    const existingRecord = (await getBreachRecordFor(domain)) || { breaches: [], lastCheckedAt: 0 };

    if (!forceAll && existingRecord.lastCheckedAt && Date.now() - existingRecord.lastCheckedAt < RECHECK_INTERVAL_MS) {
      summary.skipped += 1;
      continue;
    }

    if (i > 0) await delay(THROTTLE_MS);

    let fetched;
    try {
      fetched = await fetchBreachesForDomain(domain);
    } catch (err) {
      summary.errors.push({ domain, error: err.message });
      await setBreachRecordFor(domain, {
        ...existingRecord,
        lastCheckedAt: Date.now(),
        lastError: err.message,
      });
      continue;
    }
    summary.checked += 1;

    const knownNames = new Set((existingRecord.breaches || []).map((b) => b.name));
    const fresh = [];
    const merged = [];

    for (const raw of fetched) {
      const norm = normalizeBreach(raw);
      const prior = (existingRecord.breaches || []).find((b) => b.name === norm.name);
      if (prior) {
        merged.push({ ...norm, seenAt: prior.seenAt, dismissedAt: prior.dismissedAt || null });
      } else {
        merged.push({ ...norm, seenAt: Date.now(), dismissedAt: null });
        fresh.push(norm);
      }
    }

    await setBreachRecordFor(domain, {
      breaches: merged,
      lastCheckedAt: Date.now(),
      lastError: null,
    });

    for (const breach of fresh) {
      if (knownNames.has(breach.name)) continue;
      summary.newBreaches += 1;
      await fireBreachNotification(domain, merchant, breach);
    }
  }

  return summary;
}

export function isBreachAlarm(alarmName) {
  return alarmName === ALARMS.BREACH_DAILY;
}

export function domainAndNameFromNotification(notifId) {
  const prefix = 'safecart-breach-';
  if (!notifId?.startsWith(prefix)) return null;
  const rest = notifId.slice(prefix.length);
  const sep = rest.indexOf('__');
  if (sep < 0) return null;
  return { domain: rest.slice(0, sep), breachName: rest.slice(sep + 2) };
}

export async function openBreachPage(domain) {
  const url = chrome.runtime.getURL(
    domain ? `src/breaches/breaches.html#domain=${encodeURIComponent(domain)}` : 'src/breaches/breaches.html',
  );
  await chrome.tabs.create({ url });
}
