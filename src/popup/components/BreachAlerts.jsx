import { useMemo } from 'react';
import { useChromeMessage } from '../hooks/useChromeMessage.js';
import { MSG } from '../../lib/constants.js';

function openBreachPage(domain) {
  const url = chrome.runtime.getURL(
    domain
      ? `src/breaches/breaches.html#domain=${encodeURIComponent(domain)}`
      : 'src/breaches/breaches.html',
  );
  chrome.tabs.create({ url });
}

export default function BreachAlerts() {
  const { loading, data, error } = useChromeMessage(MSG.BREACH_LIST, {}, []);

  const alerts = useMemo(() => {
    if (!data?.breaches) return [];
    const out = [];
    for (const [domain, record] of Object.entries(data.breaches)) {
      for (const breach of record.breaches || []) {
        if (breach.dismissedAt) continue;
        out.push({
          domain,
          merchantName: data.merchants?.[domain]?.displayName || domain,
          breach,
        });
      }
    }
    return out.sort((a, b) => (b.breach.seenAt || 0) - (a.breach.seenAt || 0));
  }, [data]);

  return (
    <section className="card">
      <h2 className="card__title">Breach alerts</h2>
      {loading && <div className="muted">Loading…</div>}
      {error && <div className="muted">Could not load breaches.</div>}
      {!loading && !error && (alerts.length === 0 ? (
        <div className="muted">No active breaches on stores you shop at.</div>
      ) : (
        <ul className="breach-list">
          {alerts.slice(0, 3).map((a) => {
            const leaked = (a.breach.dataClasses || []).slice(0, 3).join(', ') || 'account details';
            return (
              <li
                key={`${a.domain}__${a.breach.name}`}
                className="breach-alert"
                onClick={() => openBreachPage(a.domain)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') openBreachPage(a.domain); }}
              >
                <div className="breach-alert__merchant">{a.merchantName}</div>
                <div className="breach-alert__what">Leaked: {leaked}</div>
                <div className="breach-alert__when">
                  {a.breach.title}{a.breach.breachDate ? ` · ${a.breach.breachDate}` : ''}
                </div>
              </li>
            );
          })}
          {alerts.length > 3 && (
            <li className="muted breach-alert__more">
              +{alerts.length - 3} more · <button className="link-button" onClick={() => openBreachPage()}>see all</button>
            </li>
          )}
        </ul>
      ))}
    </section>
  );
}
