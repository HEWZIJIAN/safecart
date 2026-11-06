const COMMON_PUBLIC_SUFFIXES = new Set([
  'com', 'net', 'org', 'io', 'co', 'gov', 'edu', 'info', 'biz', 'app',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'or.jp',
  'com.sg', 'edu.sg',
  'com.br', 'com.mx', 'com.cn', 'com.hk', 'com.tw',
  // Additional second-level ccTLD suffixes so eTLD+1 / brand splitting works for
  // common regional brand domains (keep in sync with brandTlds in heuristics).
  'co.in', 'com.tr', 'co.kr', 'co.za', 'co.nz', 'com.my', 'co.th', 'com.ph',
  'com.ar', 'com.co',
]);

export function parseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return {
      ok: true,
      href: url.href,
      protocol: url.protocol.replace(':', ''),
      hostname: url.hostname.toLowerCase(),
      port: url.port,
      pathname: url.pathname,
    };
  } catch {
    return { ok: false };
  }
}

export function getETLDPlusOne(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length < 2) return hostname;
  const last2 = parts.slice(-2).join('.');
  const last3 = parts.slice(-3).join('.');
  if (parts.length >= 3 && COMMON_PUBLIC_SUFFIXES.has(parts.slice(-2).join('.'))) {
    return last3;
  }
  return last2;
}

export function isPunycode(hostname) {
  return hostname.split('.').some((label) => label.startsWith('xn--'));
}

export function hasMixedScript(hostname) {
  const labels = hostname.split('.');
  for (const label of labels) {
    const hasLatin = /[a-z]/i.test(label);
    const hasCyrillic = /[Ѐ-ӿ]/.test(label);
    const hasGreek = /[Ͱ-Ͽ]/.test(label);
    if ((hasLatin && hasCyrillic) || (hasLatin && hasGreek) || (hasCyrillic && hasGreek)) {
      return true;
    }
  }
  return false;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function findClosestBrand(domain, brands) {
  const stripped = domain.replace(/^www\./, '').split('.')[0];
  let best = null;
  for (const brand of brands) {
    const brandCore = brand.split('.')[0];
    if (stripped === brandCore) return { brand, distance: 0, exact: true };
    const distance = levenshtein(stripped, brandCore);
    if (best === null || distance < best.distance) {
      best = { brand, distance, exact: false };
    }
  }
  return best;
}

export function containsBrandSubstring(hostname, brands) {
  const lower = hostname.toLowerCase();
  for (const brand of brands) {
    const brandCore = brand.split('.')[0];
    if (lower.includes(brandCore) && !lower.endsWith(`.${brand}`) && lower !== brand) {
      return brand;
    }
  }
  return null;
}

/**
 * Split an eTLD+1 into its registrable label ("core") and its public suffix.
 * Uses the same suffix list as getETLDPlusOne so multi-part suffixes group correctly.
 *   amazon.com    -> { core: 'amazon', suffix: 'com' }
 *   amazon.de     -> { core: 'amazon', suffix: 'de' }
 *   amazon.co.uk  -> { core: 'amazon', suffix: 'co.uk' }
 */
export function splitDomain(etldPlusOne) {
  const parts = String(etldPlusOne || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return { core: parts[0] || '', suffix: '' };
  if (parts.length >= 3 && COMMON_PUBLIC_SUFFIXES.has(parts.slice(-2).join('.'))) {
    return { core: parts.slice(0, -2).join('.'), suffix: parts.slice(-2).join('.') };
  }
  return { core: parts.slice(0, -1).join('.'), suffix: parts.slice(-1)[0] };
}

/** The registrable label of a brand entry, e.g. 'amazon.com' / 'argos.co.uk' -> 'amazon' / 'argos'. */
export function brandCoreOf(brandEntry) {
  return splitDomain(brandEntry).core;
}

/**
 * TLD-aware official-brand check. Returns true only when the domain's registrable
 * label matches a known brand AND its public suffix is an allowlisted, legitimate
 * brand TLD. This is what lets official regional sites (amazon.de, amazon.co.uk,
 * paypal.fr) pass as Safe while still flagging typo-squatters (amaz0n.de) and
 * suffix abuse (amazon.tk) — those fail the label match or the TLD allowlist.
 *
 * @param {string} etldPlusOne   the domain's eTLD+1 (e.g. 'amazon.de')
 * @param {Set<string>} brandCores  known brand registrable labels (e.g. {'amazon','paypal'})
 * @param {Set<string>} allowedTlds allowlisted brand suffixes (e.g. {'com','de','co.uk'})
 */
export function isOfficialBrandDomain(etldPlusOne, brandCores, allowedTlds) {
  const { core, suffix } = splitDomain(etldPlusOne);
  if (!core || !suffix) return false;
  return brandCores.has(core) && allowedTlds.has(suffix);
}
