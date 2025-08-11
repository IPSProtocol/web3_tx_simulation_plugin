import React, { useEffect, useState } from 'react';
import QuarantineResultView from './QuarantineResultView';
import PopupPage from './PopupPage';
import IntentGuardSimulatorPage from './IntentGuardSimulatorPage';
import { BgToPopupMsg, QuarantineResponse } from '../types/quarantine';

type AppState = 'simulation' | 'intentguard' | 'quarantine';

export default function App() {
  const [qr, setQr] = useState<QuarantineResponse | null>(null);
  const [appState, setAppState] = useState<AppState>('simulation');

  useEffect(() => {
    (async () => {
      const saved = await chrome.storage.local.get(['quarantine:last', 'quarantine:current']);
      const last = saved['quarantine:last'] as QuarantineResponse | undefined;
      const current = saved['quarantine:current'] as { canonicalId: string } | undefined;
      if (last && current && last.canonicalId === current.canonicalId) {
        setQr(last);
        setAppState('quarantine');
        // Clear the quarantine result from storage after displaying it once
        await chrome.storage.local.remove('quarantine:last');
      }
    })();

    const chromeListener = (msg: BgToPopupMsg) => {
      if (msg?.type === 'QUARANTINE_RESULT') {
        // Only show if it matches current tx
        chrome.storage.local.get('quarantine:current').then(async ({ ['quarantine:current']: cur }) => {
          if (!cur || msg.payload.canonicalId !== cur.canonicalId) return;
          setQr(msg.payload);
          setAppState('quarantine');
          // Clear the quarantine result from storage after displaying it
          await chrome.storage.local.remove('quarantine:last');
        });
      }
      if (msg?.type === 'QUARANTINE_ERROR') {
        // Only show if it matches current tx
        chrome.storage.local.get('quarantine:current').then(async ({ ['quarantine:current']: cur }) => {
          if (!cur || msg.canonicalId !== cur.canonicalId) return;
          setQr({ canonicalId: msg.canonicalId, status: 'unknown', timestamp: new Date().toISOString(), details: msg.error });
          setAppState('quarantine');
          // Clear the quarantine result from storage after displaying it
          await chrome.storage.local.remove('quarantine:last');
        });
      }
    };

    const windowListener = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data.type === 'TRANSACTION_APPROVED' || event.data.type === 'TRANSACTION_REJECTED') {
        setAppState('intentguard');
      }
    };

    chrome.runtime.onMessage.addListener(chromeListener);
    window.addEventListener('message', windowListener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(chromeListener);
      window.removeEventListener('message', windowListener);
    };
  }, []);

  const handleClose = () => {
    // Clear quarantine state and go back to simulation results
    setQr(null);
    setAppState('simulation');
    // Also clear any remaining quarantine data
    chrome.storage.local.remove(['quarantine:last', 'quarantine:current']).catch(() => {});
  };
  const handleRetry = () => {
    setQr(null);
    setAppState('simulation');
  };

  // Route to appropriate page based on app state
  if (appState === 'quarantine' && qr) {
    return <QuarantineResultView response={qr} onClose={handleClose} onRetry={handleRetry} />;
  }
  
  if (appState === 'intentguard') {
    return <IntentGuardSimulatorPage />;
  }

  return <PopupPage />;
}


