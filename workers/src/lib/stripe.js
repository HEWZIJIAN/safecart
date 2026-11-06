import Stripe from 'stripe';

export function stripeClient(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
    appInfo: { name: 'SafeCart-Workers', version: '0.1.0' },
  });
}

export const TIERS = { FREE: 'free', PREMIUM: 'premium', FAMILY: 'family' };

export function priceIdForTier(env, tier) {
  if (tier === TIERS.PREMIUM) return env.STRIPE_PREMIUM_PRICE_ID;
  if (tier === TIERS.FAMILY) return env.STRIPE_FAMILY_PRICE_ID;
  return null;
}

export function tierForPriceId(env, priceId) {
  if (priceId === env.STRIPE_PREMIUM_PRICE_ID) return TIERS.PREMIUM;
  if (priceId === env.STRIPE_FAMILY_PRICE_ID) return TIERS.FAMILY;
  return null;
}

export function tierFromSubscription(env, subscription) {
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  return tierForPriceId(env, priceId) || TIERS.FREE;
}

export function activeStatus(status) {
  return status === 'active' || status === 'trialing';
}
