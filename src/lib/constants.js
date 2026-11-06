export const MSG = {
  CHECKOUT_DETECTED: 'safecart/checkout-detected',
  PHISHING_VERDICT: 'safecart/phishing-verdict',
  REQUEST_VERDICT: 'safecart/request-verdict',
  USER_DISMISSED_WARNING: 'safecart/user-dismissed-warning',
  USER_PROCEEDED: 'safecart/user-proceeded',
  PAYMENT_BUY_CLICKED: 'safecart/payment-buy-clicked',
  PAYMENT_CONFIRMATION_PAGE: 'safecart/payment-confirmation-page',
  PAYMENT_LIST: 'safecart/payment-list',
  PAYMENT_GET: 'safecart/payment-get',
  PAYMENT_MARK_CONFIRMED: 'safecart/payment-mark-confirmed',
  PAYMENT_DELETE: 'safecart/payment-delete',
  EMAIL_CHECK_NOW: 'safecart/email-check-now',
  BREACH_LIST: 'safecart/breach-list',
  BREACH_SCAN_NOW: 'safecart/breach-scan-now',
  BREACH_DISMISS: 'safecart/breach-dismiss',
  BREACH_TRACKED_LIST: 'safecart/breach-tracked-list',
  BREACH_UNTRACK: 'safecart/breach-untrack',
  SUBSCRIPTION_GET: 'safecart/subscription-get',
  SUBSCRIPTION_REFRESH: 'safecart/subscription-refresh',
  SUBSCRIPTION_CHECKOUT_START: 'safecart/subscription-checkout-start',
  SUBSCRIPTION_PORTAL: 'safecart/subscription-portal',
  AUTH_SIGN_UP: 'safecart/auth-sign-up',
  AUTH_SIGN_IN: 'safecart/auth-sign-in',
  AUTH_SIGN_OUT: 'safecart/auth-sign-out',
  AUTH_GET_SESSION: 'safecart/auth-get-session',
};

export const STORAGE_KEYS = {
  SETTINGS: 'safecart.settings',
  VERDICT_CACHE: 'safecart.verdict_cache',
  DISMISSED_HOSTS: 'safecart.dismissed_hosts',
  PAYMENTS: 'safecart.payments',
  TRACKED_MERCHANTS: 'safecart.tracked_merchants',
  BREACHES: 'safecart.breaches',
  SUBSCRIPTION: 'safecart.subscription',
  IDENTITY_REF: 'safecart.identity_ref',
  SUPABASE_SESSION: 'safecart.supabase_session',
};

export const ALARMS = {
  EMAIL_CHECK_PREFIX: 'safecart.email_check.',
  BREACH_DAILY: 'safecart.breach_daily',
  SUBSCRIPTION_REFRESH: 'safecart.subscription_refresh',
};

export const TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  FAMILY: 'family',
};

// Only `name` is used now — the popup's "Pro is coming" card replaced the old plan
// picker. The pricing + feature lists were removed because they advertised features
// that aren't built or gated yet; reintroduce them here when a real Pro tier ships.
export const TIER_DETAILS = {
  [TIERS.FREE]: { name: 'Free' },
  [TIERS.PREMIUM]: { name: 'Premium' },
  [TIERS.FAMILY]: { name: 'Family' },
};

export const DEFAULT_SUBSCRIPTION_SERVER = 'https://safecart-api.safecart-hzj.workers.dev';
export const DEFAULT_SUPABASE_URL = 'https://kwptfmvvlvjvseksnpxb.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cHRmbXZ2bHZqdnNla3NucHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTE4MTAsImV4cCI6MjA5NDc4NzgxMH0.J18wmaTQN9d1eWWHpfewCketK4s7dkzKzeetKlMwHZE';
export const SUBSCRIPTION_REFRESH_HOURS = 24;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAGE_CONFIRMED: 'page_confirmed',
  EMAIL_CONFIRMED: 'email_confirmed',
  UNCONFIRMED: 'unconfirmed',
  USER_CONFIRMED: 'user_confirmed',
  DISMISSED: 'dismissed',
};

export const EMAIL_CHECK_DELAY_MIN = 30;

export const VERDICT = {
  SAFE: 'safe',
  SUSPICIOUS: 'suspicious',
  DANGEROUS: 'dangerous',
  UNKNOWN: 'unknown',
};

export const THRESHOLDS = {
  SUSPICIOUS: 40,
  DANGEROUS: 70,
};

export const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

export const DEFAULT_SETTINGS = {
  safeBrowsingApiKey: '',
  phishTankApiKey: '',
  enablePhishingDetection: true,
  enablePaymentTracking: true,
  enableBreachMonitoring: true,
  sensitivityBoost: 0,
  subscriptionServerUrl: DEFAULT_SUBSCRIPTION_SERVER,
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
};
