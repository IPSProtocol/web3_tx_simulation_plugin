import React, { useEffect, useState } from 'react';

import { canonicalTxId } from '../utils/canonicalTxId';

type Props = {
  tx: { to?: string; nonce?: string | number | bigint; value?: string | number | bigint; data?: string };
};

type QuarantineEntry = { found: boolean; reason?: string; ts?: number };

export default function QuarantineBanner({ tx }: Props) {
  const [state, setState] = useState<{ found: boolean; reason?: string } | null>(null);

  useEffect(() => {
    if (!tx) return;
    const id = canonicalTxId(tx);

    let mounted = true;

    const applyFromStore = async () => {
      const all = await chrome.storage.local.get('quarantineResults');
      const map = (all.quarantineResults || {}) as Record<string, QuarantineEntry>;
      const entry = map[id];
      if (mounted && entry?.found) setState({ found: true, reason: entry.reason });
    };

    const onStorage = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local' || !changes.quarantineResults) return;
      const newVal = changes.quarantineResults.newValue as Record<string, QuarantineEntry>;
      const entry = newVal?.[id];
      if (entry?.found) setState({ found: true, reason: entry.reason });
    };

    const onMessage = (msg: any) => {
      if (msg?.type === 'QUARANTINE_FOUND' && msg.id) {
        const foundId: string = msg.id;
        if (foundId === id) setState({ found: true, reason: msg.reason });
      }
    };

    // initial check and subscribe
    applyFromStore();
    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [tx]);

  if (!state?.found) return null;

  return (
    <div style={{ background: '#e8f5e9', color: '#1b5e20', border: '1px solid #c8e6c9', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 18 }}>✅</span>
      <div>
        <div style={{ fontWeight: 600 }}>IntentGuard protected you.</div>
        {state.reason ? <div style={{ fontSize: 12, opacity: 0.9 }}>{state.reason}</div> : null}
      </div>
    </div>
  );
}
