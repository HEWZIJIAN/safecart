import {
  parseUrl,
  getETLDPlusOne,
  isPunycode,
  hasMixedScript,
  findClosestBrand,
  containsBrandSubstring,
  brandCoreOf,
  isOfficialBrandDomain,
} from '../lib/url-utils.js';
import { checkSafeBrowsing, checkPhishTank, getDomainAgeDays } from '../lib/api-client.js';
import { getSettings, getCachedVerdict, setCachedVerdict } from './storage.js';
import { VERDICT, THRESHOLDS } from '../lib/constants.js';
import { toSafetyScore } from '../lib/score.js';

let BRANDS = [];
let BRAND_CORES = new Set();   // registrable labels, e.g. {'amazon','paypal'}
let BRAND_TLDS = new Set();    // allowlisted brand suffixes, e.g. {'com','de','co.uk'}
let heuristics = { weights: {}, suspiciousTlds: [], suspiciousKeywords: [], brandTlds: [] };
let W = heuristics.weights;
let dataReady = null;

async function loadData() {
  if (dataReady) return dataReady;
  dataReady = (async () => {
    const [brandsRes, heuristicsRes] = await Promise.all([
      fetch(chrome.runtime.getURL('src/data/known-merchants.json')),
      fetch(chrome.runtime.getURL('src/data/phishing-heuristics.json')),
    ]);
    const brandsJson = await brandsRes.json();
    const heuristicsJson = await heuristicsRes.json();
    BRANDS = brandsJson.brands;
    heuristics = heuristicsJson;
    W = heuristics.weights;
    BRAND_CORES = new Set(BRANDS.map(brandCoreOf));
    BRAND_TLDS = new Set(heuristics.brandTlds || []);
  })();
  return dataReady;
}

function isIpLiteral(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

function evaluateOfflineSignals(parsed) {
  const reasons = [];
  let score = 0;
  const { hostname, protocol } = parsed;
  const etld = getETLDPlusOne(hostname);

  if (protocol !== 'https') {
    score += W.nonHttps;
    reasons.push({ code: 'non_https', weight: W.nonHttps, detail: 'Page is not served over HTTPS.' });
  }

  if (isIpLiteral(hostname)) {
    score += W.ipLiteralHost;
    reasons.push({ code: 'ip_literal', weight: W.ipLiteralHost, detail: 'URL uses a raw IP address instead of a domain.' });
  }

  if (isPunycode(hostname)) {
    score += W.punycode;
    reasons.push({ code: 'punycode', weight: W.punycode, detail: 'Domain uses punycode — can disguise lookalike characters.' });
  }

  if (hasMixedScript(hostname)) {
    score += W.mixedScript;
    reasons.push({ code: 'mixed_script', weight: W.mixedScript, detail: 'Domain mixes characters from different alphabets.' });
  }

  const tld = hostname.split('.').pop();
  if (heuristics.suspiciousTlds.includes(tld)) {
    score += W.suspiciousTld;
    reasons.push({ code: 'suspicious_tld', weight: W.suspiciousTld, detail: `.${tld} is frequently abused for phishing.` });
  }

  const hyphensOrDigits = (hostname.match(/[-0-9]/g) || []).length;
  if (hyphensOrDigits >= 4) {
    score += W.manyHyphensOrDigits;
    reasons.push({ code: 'many_hyphens_digits', weight: W.manyHyphensOrDigits, detail: 'Domain has an unusual number of hyphens/digits.' });
  }

  for (const keyword of heuristics.suspiciousKeywords) {
    if (hostname.includes(keyword) && !BRANDS.some((b) => hostname.endsWith(b))) {
      score += W.suspiciousKeywordInHost;
      reasons.push({ code: 'suspicious_keyword', weight: W.suspiciousKeywordInHost, detail: `Hostname contains "${keyword}".` });
      break;
    }
  }

  // TLD-aware official-brand check: a domain is official when its registrable label
  // matches a known brand AND its public suffix is an allowlisted brand TLD. This
  // treats regional sites (amazon.de, amazon.co.uk) as official while still flagging
  // typo-squatters (amaz0n.de) and suffix abuse (amazon.tk) below.
  const officialBrand = isOfficialBrandDomain(etld, BRAND_CORES, BRAND_TLDS);
  if (!officialBrand) {
    const closest = findClosestBrand(etld, BRANDS);
    if (closest && !closest.exact) {
      if (closest.distance > 0 && closest.distance <= 2) {
        score += W.brandLookalikeNear;
        reasons.push({
          code: 'brand_lookalike_near',
          weight: W.brandLookalikeNear,
          detail: `Domain "${etld}" looks suspiciously similar to ${closest.brand}.`,
        });
      } else if (closest.distance === 3) {
        score += W.brandLookalikeMedium;
        reasons.push({
          code: 'brand_lookalike_medium',
          weight: W.brandLookalikeMedium,
          detail: `Domain "${etld}" is one of several edits away from ${closest.brand}.`,
        });
      }
    }
    const substring = containsBrandSubstring(hostname, BRANDS);
    if (substring) {
      score += W.brandSubstringMisuse;
      reasons.push({
        code: 'brand_substring',
        weight: W.brandSubstringMisuse,
        detail: `Hostname includes brand name "${substring}" but isn't an official ${substring} domain.`,
      });
    }
  }

  return { score, reasons, etld, isKnownBrand: officialBrand };
}

function applyDomainAge(ageResult) {
  if (!ageResult.available) {
    return {
      add: W.unknownDomainAge,
      reason: { code: 'unknown_domain_age', weight: W.unknownDomainAge, detail: 'Could not determine domain age.' },
    };
  }
  if (ageResult.ageDays < 30) {
    return {
      add: W.youngDomainUnder30d,
      reason: { code: 'very_young_domain', weight: W.youngDomainUnder30d, detail: `Domain is only ${ageResult.ageDays} days old.` },
    };
  }
  if (ageResult.ageDays < 180) {
    return {
      add: W.youngDomainUnder180d,
      reason: { code: 'young_domain', weight: W.youngDomainUnder180d, detail: `Domain is ${ageResult.ageDays} days old.` },
    };
  }
  return null;
}

function classify(score) {
  if (score >= THRESHOLDS.DANGEROUS) return VERDICT.DANGEROUS;
  if (score >= THRESHOLDS.SUSPICIOUS) return VERDICT.SUSPICIOUS;
  return VERDICT.SAFE;
}

export async function scoreUrl(rawUrl) {
  await loadData();
  const parsed = parseUrl(rawUrl);
  if (!parsed.ok) {
    return { verdict: VERDICT.UNKNOWN, score: 0, safetyScore: null, reasons: [], url: rawUrl };
  }

  const settings = await getSettings();
  const cacheKey = `${parsed.protocol}://${parsed.hostname}`;
  const cached = await getCachedVerdict(cacheKey);
  if (cached) return cached;

  const offline = evaluateOfflineSignals(parsed);
  let score = offline.score;
  const reasons = [...offline.reasons];

  if (offline.isKnownBrand) {
    const verdict = {
      verdict: VERDICT.SAFE,
      score: 0,
      safetyScore: 100,
      reasons: [{ code: 'known_brand', weight: 0, detail: `${offline.etld} is an official domain of a well-known retailer.` }],
      url: rawUrl,
      hostname: parsed.hostname,
    };
    await setCachedVerdict(cacheKey, verdict);
    return verdict;
  }

  const [safeBrowsing, phishTank, domainAge] = await Promise.all([
    checkSafeBrowsing(rawUrl, settings.safeBrowsingApiKey),
    checkPhishTank(rawUrl, settings.phishTankApiKey),
    getDomainAgeDays(offline.etld),
  ]);

  if (safeBrowsing.match) {
    score += W.safeBrowsingMatch;
    reasons.push({
      code: 'safe_browsing_match',
      weight: W.safeBrowsingMatch,
      detail: `Google Safe Browsing flagged this URL: ${(safeBrowsing.threatTypes || []).join(', ') || 'threat'}.`,
    });
  }
  if (phishTank.match) {
    score += W.phishTankMatch;
    reasons.push({
      code: 'phishtank_match',
      weight: W.phishTankMatch,
      detail: phishTank.verifiedPhish ? 'PhishTank lists this URL as a verified phishing site.' : 'PhishTank has this URL on its watchlist.',
    });
  }
  const ageSignal = applyDomainAge(domainAge);
  if (ageSignal) {
    score += ageSignal.add;
    reasons.push(ageSignal.reason);
  }

  score += settings.sensitivityBoost || 0;

  const verdict = {
    verdict: classify(score),
    score,
    safetyScore: toSafetyScore(score),
    reasons,
    url: rawUrl,
    hostname: parsed.hostname,
    etld: offline.etld,
    sources: {
      safeBrowsing: { available: safeBrowsing.available, match: safeBrowsing.match },
      phishTank: { available: phishTank.available, match: phishTank.match },
      domainAge: { available: domainAge.available, ageDays: domainAge.ageDays ?? null },
    },
  };

  await setCachedVerdict(cacheKey, verdict);
  return verdict;
}
