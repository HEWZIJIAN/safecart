import {
  savePayment, getPayment, updatePayment, findRecentPaymentByHost,
} from './storage.js';
import { checkInbox } from './email-checker.js';
import { trackMerchant } from './breach-monitor.js';
import { ALARMS, PAYMENT_STATUS, EMAIL_CHECK_DELAY_MIN } from '../lib/constants.js';

const RECENT_WINDOW_MS = 1000 * 60 * 60;

function newPaymentId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordBuyClick(details) {
  const id = newPaymentId();
  const payment = {
    id,
    merchantName: details.merchantName || details.merchantHost || 'Unknown',
    merchantHost: details.merchantHost || '',
    amount: details.amount ?? null,
    currency: details.currency || null,
    url: details.url || '',
    pageTitle: details.pageTitle || '',
    buttonLabel: details.buttonLabel || '',
    totalSource: details.totalSource || 'unknown',
    status: PAYMENT_STATUS.PENDING,
    createdAt: details.clickedAt || Date.now(),
    updatedAt: Date.now(),
    pageConfirmedAt: null,
    emailMatchedAt: null,
    emailMatches: [],
    notificationFired: false,
  };
  await savePayment(payment);

  if (payment.merchantHost) {
    await trackMerchant(payment.merchantHost, {
      displayName: payment.merchantName,
      incrementPayment: true,
    });
  }

  const alarmName = `${ALARMS.EMAIL_CHECK_PREFIX}${id}`;
  chrome.alarms.create(alarmName, { delayInMinutes: EMAIL_CHECK_DELAY_MIN });

  return payment;
}

export async function recordConfirmationPage(details) {
  if (!details.merchantHost) return null;
  const recent = await findRecentPaymentByHost(details.merchantHost, RECENT_WINDOW_MS);
  if (!recent) return null;
  return updatePayment(recent.id, {
    status: PAYMENT_STATUS.PAGE_CONFIRMED,
    pageConfirmedAt: details.detectedAt || Date.now(),
  });
}

export async function runEmailCheck(paymentId, { interactive = false } = {}) {
  const payment = await getPayment(paymentId);
  if (!payment) return { ok: false, error: 'payment_not_found' };
  if (payment.status === PAYMENT_STATUS.EMAIL_CONFIRMED || payment.status === PAYMENT_STATUS.USER_CONFIRMED) {
    return { ok: true, status: payment.status, payment };
  }

  const result = await checkInbox(payment, { interactive });
  if (!result.ok) {
    if (result.status === 'no_auth') {
      const updated = await updatePayment(paymentId, {
        status: PAYMENT_STATUS.UNCONFIRMED,
        emailCheckError: 'no_gmail_auth',
      });
      await fireUnconfirmedNotification(updated, 'no_auth');
      return { ok: true, status: 'no_auth', payment: updated };
    }
    return { ok: false, error: result.error };
  }

  if (result.status === 'match' && result.matches.length > 0) {
    const updated = await updatePayment(paymentId, {
      status: PAYMENT_STATUS.EMAIL_CONFIRMED,
      emailMatchedAt: Date.now(),
      emailMatches: result.matches,
    });
    return { ok: true, status: 'match', payment: updated };
  }

  const updated = await updatePayment(paymentId, {
    status: PAYMENT_STATUS.UNCONFIRMED,
    emailMatches: [],
  });
  await fireUnconfirmedNotification(updated, 'no_match');
  return { ok: true, status: 'no_match', payment: updated };
}

async function fireUnconfirmedNotification(payment, reason) {
  if (!payment || payment.notificationFired) return;

  const amountText = payment.amount != null
    ? `${payment.currency || ''} ${payment.amount.toFixed(2)}`.trim()
    : 'a charge';
  const merchant = payment.merchantName || payment.merchantHost || 'a merchant';
  const detail = reason === 'no_auth'
    ? 'Connect Gmail in SafeCart settings to auto-confirm orders.'
    : 'No order confirmation email found. Open SafeCart to start a chargeback if needed.';

  await chrome.notifications.create(`safecart-payment-${payment.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `SafeCart: no confirmation for ${amountText} at ${merchant}`,
    message: detail,
    buttons: [
      { title: 'Start chargeback' },
      { title: 'I have the receipt' },
    ],
    priority: 2,
    requireInteraction: true,
  });

  await updatePayment(payment.id, { notificationFired: true });
}

export function isEmailCheckAlarm(alarmName) {
  return alarmName?.startsWith(ALARMS.EMAIL_CHECK_PREFIX);
}

export function paymentIdFromAlarm(alarmName) {
  return alarmName.slice(ALARMS.EMAIL_CHECK_PREFIX.length);
}

export function paymentIdFromNotification(notifId) {
  return notifId?.startsWith('safecart-payment-') ? notifId.slice('safecart-payment-'.length) : null;
}

export async function openChargebackPage(paymentId) {
  const url = chrome.runtime.getURL(`src/chargeback/chargeback.html#id=${encodeURIComponent(paymentId)}`);
  await chrome.tabs.create({ url });
}

export async function markUserConfirmed(paymentId) {
  return updatePayment(paymentId, { status: PAYMENT_STATUS.USER_CONFIRMED });
}
