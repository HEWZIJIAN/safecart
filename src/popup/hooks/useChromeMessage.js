import { useEffect, useState, useCallback } from 'react';

export function sendMessage(type, payload = {}) {
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

export function useChromeMessage(type, payload, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const response = await sendMessage(type, payload);
    if (response?.ok) {
      setState({ loading: false, data: response, error: null });
    } else {
      setState({ loading: false, data: null, error: response?.error || 'unknown' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}

export function useCurrentTab() {
  const [tab, setTab] = useState(null);
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      setTab(tabs[0] || null);
    });
  }, []);
  return tab;
}
