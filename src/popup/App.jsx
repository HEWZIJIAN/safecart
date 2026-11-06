import SafetyScore from './components/SafetyScore.jsx';
import RecentPayments from './components/RecentPayments.jsx';
import BreachAlerts from './components/BreachAlerts.jsx';
import UpgradeButton from './components/UpgradeButton.jsx';

function openOptions(event) {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
}

function openReview(event) {
  event.preventDefault();
  // detail/<id>/reviews resolves to this extension's live Chrome Web Store reviews tab.
  chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });
}

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3l8 3v5.5c0 4.6-3.2 7.8-8 9.5-4.8-1.7-8-4.9-8-9.5V6l8-3z" strokeLinejoin="round" />
              <path d="M8.5 12.2l2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand__text">
            <h1 className="brand__name">SafeCart</h1>
            <span className="brand__tag">Checkout protection</span>
          </span>
        </div>
      </header>

      <main className="app__main">
        <SafetyScore />
        <BreachAlerts />
        <RecentPayments />
        <UpgradeButton />
      </main>

      <footer className="app__footer">
        <a href="#" onClick={openOptions}>Settings</a>
        <a href="#" className="rate" onClick={openReview} title="Rate SafeCart on the Chrome Web Store">★ Rate us</a>
      </footer>
    </div>
  );
}
