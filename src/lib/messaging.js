export function sendToBackground(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response ?? { ok: false, error: 'no_response' });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

export function onMessage(handler) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    Promise.resolve(handler(message, sender))
      .then((response) => sendResponse(response))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  });
}
