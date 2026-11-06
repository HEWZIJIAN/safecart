// Safety-score mapping.
//
// The phishing engine produces an additive *risk* score where HIGHER = WORSE
// (0, 5, 45, 90…). That's great for the algorithm but confusing in the UI.
// This module maps that risk score to a clean 0-100 *safety* score where
// HIGHER = SAFER, and defines the color bands the popup renders.
//
// The mapping is anchored to the engine's existing verdict thresholds so the
// color band and the verdict can never disagree:
//
//   risk < SUSPICIOUS(40)        -> safety 67-100  -> green  "Safe"      (VERDICT.SAFE)
//   SUSPICIOUS <= risk < DANGER  -> safety 34-66   -> orange "Caution"   (VERDICT.SUSPICIOUS)
//   risk >= DANGEROUS(70)        -> safety 0-33    -> red    "Dangerous" (VERDICT.DANGEROUS)

import { THRESHOLDS } from './constants.js';

// UI color-band cutoffs on the 0-100 safety scale.
export const SAFETY_BANDS = { SAFE_MIN: 67, CAUTION_MIN: 34 };

// How much additional risk beyond the DANGEROUS threshold drives safety to 0.
const RED_SPAN = 60;

/**
 * Map an additive risk score (>=0, higher = worse) to a 0-100 safety score
 * (higher = safer). Piecewise-linear, anchored at the verdict thresholds.
 */
export function toSafetyScore(riskScore) {
  const Ts = THRESHOLDS.SUSPICIOUS; // 40
  const Td = THRESHOLDS.DANGEROUS;  // 70
  const r = Math.max(0, Number(riskScore) || 0);

  let safety;
  if (r < Ts) {
    // 0 -> 100, approaching Ts -> 67
    safety = 100 - (r / Ts) * (100 - SAFETY_BANDS.SAFE_MIN);
  } else if (r < Td) {
    // Ts -> 66, approaching Td -> 34
    safety = (SAFETY_BANDS.SAFE_MIN - 1) -
      ((r - Ts) / (Td - Ts)) * ((SAFETY_BANDS.SAFE_MIN - 1) - SAFETY_BANDS.CAUTION_MIN);
  } else {
    // Td -> 33, Td+RED_SPAN (and beyond) -> 0
    safety = (SAFETY_BANDS.CAUTION_MIN - 1) -
      Math.min(1, (r - Td) / RED_SPAN) * (SAFETY_BANDS.CAUTION_MIN - 1);
  }
  return Math.max(0, Math.min(100, Math.round(safety)));
}

/** 'safe' | 'caution' | 'dangerous' | 'unknown' from a 0-100 safety score. */
export function safetyBand(safetyScore) {
  if (typeof safetyScore !== 'number' || Number.isNaN(safetyScore)) return 'unknown';
  if (safetyScore >= SAFETY_BANDS.SAFE_MIN) return 'safe';
  if (safetyScore >= SAFETY_BANDS.CAUTION_MIN) return 'caution';
  return 'dangerous';
}

const BAND_META = {
  safe: { band: 'safe', color: 'green', label: 'Safe', tone: 'This site looks safe to use.' },
  caution: { band: 'caution', color: 'yellow', label: 'Caution', tone: 'Some warning signs were detected.' },
  dangerous: { band: 'dangerous', color: 'red', label: 'Dangerous', tone: 'Strong signals of phishing or fraud.' },
  unknown: { band: 'unknown', color: 'gray', label: 'Unknown', tone: 'Could not score this URL.' },
};

/** Color/label/tone for the popup, derived purely from the 0-100 safety score. */
export function safetyMeta(safetyScore) {
  return BAND_META[safetyBand(safetyScore)];
}
