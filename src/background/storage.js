import { STORAGE_KEYS, DEFAULT_SETTINGS, CACHE_TTL_MS, TIERS } from '../lib/constants.js';

export async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

export async function getCachedVerdict(host) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VERDICT_CACHE);
  const cache = result[STORAGE_KEYS.VERDICT_CACHE] || {};
  const entry = cache[host];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry.verdict;
}

export async function setCachedVerdict(host, verdict) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VERDICT_CACHE);
  const cache = result[STORAGE_KEYS.VERDICT_CACHE] || {};
  cache[host] = { verdict, timestamp: Date.now() };
  for (const [key, value] of Object.entries(cache)) {
    if (Date.now() - value.timestamp > CACHE_TTL_MS * 4) delete cache[key];
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.VERDICT_CACHE]: cache });
}

// Drop all cached verdicts. Called on extension update so new scoring logic
// re-scores every site immediately instead of serving stale verdicts for up to
// CACHE_TTL_MS (otherwise a fix can look like it didn't take effect for hours).
export async function clearVerdictCache() {
  await chrome.storage.local.remove(STORAGE_KEYS.VERDICT_CACHE);
}

export async function isHostDismissed(host) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_HOSTS);
  const list = result[STORAGE_KEYS.DISMISSED_HOSTS] || {};
  const entry = list[host];
  if (!entry) return false;
  return Date.now() - entry < CACHE_TTL_MS;
}

export async function dismissHost(host) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_HOSTS);
  const list = result[STORAGE_KEYS.DISMISSED_HOSTS] || {};
  list[host] = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_HOSTS]: list });
}

export async function getPayments() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PAYMENTS);
  return result[STORAGE_KEYS.PAYMENTS] || {};
}

export async function getPayment(id) {
  const all = await getPayments();
  return all[id] || null;
}

export async function savePayment(payment) {
  const all = await getPayments();
  all[payment.id] = payment;
  await chrome.storage.local.set({ [STORAGE_KEYS.PAYMENTS]: all });
  return payment;
}

export async function updatePayment(id, patch) {
  const all = await getPayments();
  if (!all[id]) return null;
  all[id] = { ...all[id], ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEYS.PAYMENTS]: all });
  return all[id];
}

export async function deletePayment(id) {
  const all = await getPayments();
  delete all[id];
  await chrome.storage.local.set({ [STORAGE_KEYS.PAYMENTS]: all });
}

export async function listRecentPayments(limit = 20) {
  const all = await getPayments();
  return Object.values(all)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function findRecentPaymentByHost(hostname, withinMs) {
  const all = await getPayments();
  const now = Date.now();
  return Object.values(all)
    .filter((p) => p.merchantHost === hostname && now - p.createdAt <= withinMs)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

export async function getTrackedMerchants() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TRACKED_MERCHANTS);
  return result[STORAGE_KEYS.TRACKED_MERCHANTS] || {};
}

export async function upsertTrackedMerchant(domain, patch = {}) {
  const all = await getTrackedMerchants();
  const existing = all[domain] || { firstSeen: Date.now(), paymentCount: 0, displayName: domain };
  all[domain] = {
    ...existing,
    ...patch,
    lastSeen: Date.now(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.TRACKED_MERCHANTS]: all });
  return all[domain];
}

export async function removeTrackedMerchant(domain) {
  const all = await getTrackedMerchants();
  delete all[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.TRACKED_MERCHANTS]: all });
  const breaches = await getBreachRecords();
  delete breaches[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.BREACHES]: breaches });
}

export async function getBreachRecords() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BREACHES);
  return result[STORAGE_KEYS.BREACHES] || {};
}

export async function getBreachRecordFor(domain) {
  const all = await getBreachRecords();
  return all[domain] || null;
}

export async function setBreachRecordFor(domain, record) {
  const all = await getBreachRecords();
  all[domain] = record;
  await chrome.storage.local.set({ [STORAGE_KEYS.BREACHES]: all });
  return record;
}

function randomUuidV4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export async function getOrCreateIdentityRef() {
  const sync = await chrome.storage.sync.get(STORAGE_KEYS.IDENTITY_REF);
  if (sync[STORAGE_KEYS.IDENTITY_REF]) return sync[STORAGE_KEYS.IDENTITY_REF];
  const ref = randomUuidV4();
  await chrome.storage.sync.set({ [STORAGE_KEYS.IDENTITY_REF]: ref });
  return ref;
}

export async function getSubscription() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SUBSCRIPTION);
  return result[STORAGE_KEYS.SUBSCRIPTION] || {
    tier: TIERS.FREE,
    status: 'inactive',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasStripeCustomer: false,
    lastRefreshedAt: 0,
  };
}

export async function setSubscription(patch) {
  const current = await getSubscription();
  const next = { ...current, ...patch, lastRefreshedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEYS.SUBSCRIPTION]: next });
  return next;
}

export async function dismissBreach(domain, breachName) {
  const all = await getBreachRecords();
  const record = all[domain];
  if (!record) return null;
  record.breaches = (record.breaches || []).map((b) =>
    b.name === breachName ? { ...b, dismissedAt: Date.now() } : b,
  );
  all[domain] = record;
  await chrome.storage.local.set({ [STORAGE_KEYS.BREACHES]: all });
  return record;
}
