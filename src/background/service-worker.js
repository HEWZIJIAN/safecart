import { scoreUrl } from './phishing-engine.js';
import { onMessage } from '../lib/messaging.js';
import {
  isHostDismissed, dismissHost, getSettings,
  listRecentPayments, getPayment, deletePayment,
  getTrackedMerchants, getBreachRecords, removeTrackedMerchant, dismissBreach,
  clearVerdictCache,
} from './storage.js';
import {
  recordBuyClick, recordConfirmationPage, runEmailCheck,
  isEmailCheckAlarm, paymentIdFromAlarm,
  paymentIdFromNotification, openChargebackPage, markUserConfirmed,
} from './payment-tracker.js';
import {
  trackMerchant, ensureDailyAlarm, runBreachCheck,
  isBreachAlarm, domainAndNameFromNotification, openBreachPage,
} from './breach-monitor.js';
import {
  refreshSubscription, startCheckout, openBillingPortal,
  ensureRefreshAlarm, isSubscriptionAlarm,
} from './subscription-client.js';
import {
  signUp, signIn, signOut, getCurrentSessionSummary,
} from './auth-client.js';
import { getSubscription } from './storage.js';
import { MSG, VERDICT } from '../lib/constants.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  console.info('[SafeCart] installed', details.reason);
  ensureDailyAlarm();
  ensureRefreshAlarm();
  // On update, drop cached verdicts so changed scoring/detection logic re-scores
  // every site right away (otherwise old verdicts linger for up to CACHE_TTL_MS).
  if (details.reason === 'update') {
    await clearVerdictCache();
  }
  // Show the first-run tour only on a fresh install, not on updates.
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureDailyAlarm();
  ensureRefreshAlarm();
});

onMessage(async (message, sender) => {
  if (!message || typeof message !== 'object') return { ok: false, error: 'bad_message' };

  switch (message.type) {
    case MSG.REQUEST_VERDICT:
    case MSG.CHECKOUT_DETECTED: {
      const url = message.payload?.url || sender.tab?.url;
      if (!url) return { ok: false, error: 'missing_url' };

      const settings = await getSettings();

      if (message.type === MSG.CHECKOUT_DETECTED && settings.enableBreachMonitoring) {
        try {
          const host = new URL(url).hostname;
          await trackMerchant(host);
        } catch { /* ignore bad URL */ }
      }

      if (!settings.enablePhishingDetection) {
        return { ok: true, verdict: { verdict: VERDICT.SAFE, score: 0, reasons: [], disabled: true } };
      }

      const verdict = await scoreUrl(url);
      if (verdict.hostname && (await isHostDismissed(verdict.hostname))) {
        verdict.userDismissed = true;
      }
      return { ok: true, verdict };
    }

    case MSG.USER_DISMISSED_WARNING: {
      const host = message.payload?.hostname;
      if (host) await dismissHost(host);
      return { ok: true };
    }

    case MSG.PAYMENT_BUY_CLICKED: {
      const settings = await getSettings();
      if (!settings.enablePaymentTracking) return { ok: true, skipped: true };
      const payment = await recordBuyClick(message.payload || {});
      return { ok: true, payment };
    }

    case MSG.PAYMENT_CONFIRMATION_PAGE: {
      const payment = await recordConfirmationPage(message.payload || {});
      return { ok: true, payment };
    }

    case MSG.PAYMENT_LIST: {
      const payments = await listRecentPayments(message.payload?.limit || 20);
      return { ok: true, payments };
    }

    case MSG.PAYMENT_GET: {
      const payment = await getPayment(message.payload?.id);
      return { ok: true, payment };
    }

    case MSG.PAYMENT_MARK_CONFIRMED: {
      const payment = await markUserConfirmed(message.payload?.id);
      return { ok: true, payment };
    }

    case MSG.PAYMENT_DELETE: {
      await deletePayment(message.payload?.id);
      return { ok: true };
    }

    case MSG.EMAIL_CHECK_NOW: {
      return runEmailCheck(message.payload?.id, { interactive: true });
    }

    case MSG.BREACH_LIST: {
      const [merchants, breaches] = await Promise.all([getTrackedMerchants(), getBreachRecords()]);
      return { ok: true, merchants, breaches };
    }

    case MSG.BREACH_TRACKED_LIST: {
      const merchants = await getTrackedMerchants();
      return { ok: true, merchants };
    }

    case MSG.BREACH_SCAN_NOW: {
      const settings = await getSettings();
      if (!settings.enableBreachMonitoring) return { ok: false, error: 'disabled' };
      try {
        const summary = await runBreachCheck({ forceAll: Boolean(message.payload?.forceAll) });
        return { ok: true, summary };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case MSG.BREACH_DISMISS: {
      const record = await dismissBreach(message.payload?.domain, message.payload?.breachName);
      return { ok: true, record };
    }

    case MSG.BREACH_UNTRACK: {
      await removeTrackedMerchant(message.payload?.domain);
      return { ok: true };
    }

    case MSG.SUBSCRIPTION_GET: {
      const subscription = await getSubscription();
      return { ok: true, subscription };
    }

    case MSG.SUBSCRIPTION_REFRESH: {
      return refreshSubscription();
    }

    case MSG.SUBSCRIPTION_CHECKOUT_START: {
      return startCheckout(message.payload?.tier);
    }

    case MSG.SUBSCRIPTION_PORTAL: {
      return openBillingPortal();
    }

    case MSG.AUTH_SIGN_UP: {
      return signUp(message.payload?.email, message.payload?.password);
    }

    case MSG.AUTH_SIGN_IN: {
      const result = await signIn(message.payload?.email, message.payload?.password);
      if (result.ok) refreshSubscription().catch(() => null);
      return result;
    }

    case MSG.AUTH_SIGN_OUT: {
      const result = await signOut();
      return result;
    }

    case MSG.AUTH_GET_SESSION: {
      const summary = await getCurrentSessionSummary();
      return { ok: true, session: summary };
    }

    default:
      return { ok: false, error: 'unknown_message_type' };
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (isEmailCheckAlarm(alarm.name)) {
      await runEmailCheck(paymentIdFromAlarm(alarm.name), { interactive: false });
    } else if (isBreachAlarm(alarm.name)) {
      const settings = await getSettings();
      if (settings.enableBreachMonitoring) await runBreachCheck();
    } else if (isSubscriptionAlarm(alarm.name)) {
      await refreshSubscription();
    }
  } catch (err) {
    console.error('[SafeCart] alarm handler failed', err);
  }
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  const paymentId = paymentIdFromNotification(notifId);
  if (paymentId) {
    await openChargebackPage(paymentId);
    chrome.notifications.clear(notifId);
    return;
  }
  const breachRef = domainAndNameFromNotification(notifId);
  if (breachRef) {
    await openBreachPage(breachRef.domain);
    chrome.notifications.clear(notifId);
  }
});

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  const paymentId = paymentIdFromNotification(notifId);
  if (paymentId) {
    if (buttonIndex === 0) await openChargebackPage(paymentId);
    else if (buttonIndex === 1) await markUserConfirmed(paymentId);
    chrome.notifications.clear(notifId);
  }
});
