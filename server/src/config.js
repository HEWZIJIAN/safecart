import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. See server/.env.example.`);
  }
  return value;
}

function optional(name, fallback) {
  return process.env[name] || fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  dbPath: optional('DB_PATH', './data/safecart.db'),
  stripe: {
    secretKey: required('STRIPE_SECRET_KEY'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
    premiumPriceId: required('STRIPE_PREMIUM_PRICE_ID'),
    familyPriceId: required('STRIPE_FAMILY_PRICE_ID'),
  },
  checkout: {
    successUrl: optional('CHECKOUT_SUCCESS_URL', 'http://localhost:3001/success.html'),
    cancelUrl: optional('CHECKOUT_CANCEL_URL', 'http://localhost:3001/cancel.html'),
  },
  billingPortal: {
    returnUrl: optional('BILLING_PORTAL_RETURN_URL', 'http://localhost:3001/success.html'),
  },
};

export const TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  FAMILY: 'family',
};

export function priceIdForTier(tier) {
  if (tier === TIERS.PREMIUM) return config.stripe.premiumPriceId;
  if (tier === TIERS.FAMILY) return config.stripe.familyPriceId;
  return null;
}

export function tierForPriceId(priceId) {
  if (priceId === config.stripe.premiumPriceId) return TIERS.PREMIUM;
  if (priceId === config.stripe.familyPriceId) return TIERS.FAMILY;
  return null;
}
