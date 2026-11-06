import { useEffect, useState, useCallback } from 'react';
import { sendMessage } from '../hooks/useChromeMessage.js';
import { MSG, TIERS, TIER_DETAILS } from '../../lib/constants.js';

// "Get notified" sends people to the site's waitlist capture (#waitForm).
const NOTIFY_URL = 'https://safecart.co/#waitForm';

function fmtPeriodEnd(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString();
}

export default function UpgradeButton() {
  const [subscription, setSubscription] = useState(null);

  const load = useCallback(async () => {
    const res = await sendMessage(MSG.SUBSCRIPTION_GET, {});
    if (res?.ok) setSubscription(res.subscription);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onStorage = (changes, area) => {
      if (area === 'local' && changes['safecart.subscription']) load();
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [load]);

  if (!subscription) return null;

  const isPremium = subscription.tier === TIERS.PREMIUM || subscription.tier === TIERS.FAMILY;
  const tierMeta = TIER_DETAILS[subscription.tier] || TIER_DETAILS[TIERS.FREE];

  async function openPortal() {
    const res = await sendMessage(MSG.SUBSCRIPTION_PORTAL, {});
    if (res?.ok && res.url) chrome.tabs.create({ url: res.url });
  }

  // Anyone who subscribed during testing keeps a manage link. We deliberately do NOT
  // offer a new checkout: SafeCart is free, and Pro features aren't built yet — so we
  // don't take money for them. We stay transparent that paid features are planned (below).
  if (isPremium) {
    return (
      <section className="upgrade upgrade--premium">
        <div className="upgrade__title">{tierMeta.name} active</div>
        {subscription.currentPeriodEnd && (
          <div className="upgrade__sub">
            {subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {fmtPeriodEnd(subscription.currentPeriodEnd)}
          </div>
        )}
        <button className="link-button" onClick={openPortal} style={{ marginTop: 6 }}>
          Manage subscription →
        </button>
      </section>
    );
  }

  // Free users — upfront about the plan to monetize later, without charging for
  // anything that doesn't exist yet.
  return (
    <section className="upgrade upgrade--soon">
      <div className="upgrade__title">SafeCart is free</div>
      <div className="upgrade__sub">
        A Pro plan is on the way (cross-device sync &amp; more). Everything works free for now —
        want a heads-up when Pro lands?
      </div>
      <button className="upgrade__cta" onClick={() => chrome.tabs.create({ url: NOTIFY_URL })}>
        Get notified →
      </button>
    </section>
  );
}
