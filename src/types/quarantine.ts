export type QuarantineResponse = {
  canonicalId: string;
  status: 'cleared' | 'quarantined' | 'unknown';
  reason?: string;
  details?: string;
  matchedRuleIds?: string[];
  timestamp: string; // ISO
};

export type BgToPopupMsg =
  | { type: 'QUARANTINE_RESULT'; payload: QuarantineResponse }
  | { type: 'QUARANTINE_ERROR'; error: string; canonicalId: string };

export type PopupToBgMsg =
  | { type: 'SUBSCRIBE_QUARANTINE'; canonicalId: string }
  | { type: 'UNSUBSCRIBE_QUARANTINE'; canonicalId: string };


