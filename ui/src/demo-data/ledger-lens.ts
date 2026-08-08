/** DEMO DATA — NOT FROM MIDNIGHT, INDEXER, OR LEDGER. No candidate private values. */
import type { LedgerLensData } from '../domain/ledger';

export const ledgerLensDemo: LedgerLensData = {
  verifiedMatches: 3,
  requiredAvailability: '20 h / week',
  entries: [
    { id: 'job', type: 'Job', reference: 'PM-AI-001', visibility: 'Public', status: 'Open', summary: 'Public job state' },
    { id: 'a7f2', type: 'Match', reference: 'A7F2', visibility: 'Public', status: 'Confirmed', summary: 'Job reference, match ticket, confirmed state. Private values: not present.' },
    { id: 'b3c9', type: 'Match', reference: 'B3C9', visibility: 'Public', status: 'Confirmed', summary: 'Job reference, match ticket, confirmed state. Private values: not present.' },
    { id: 'd91e', type: 'Match', reference: 'D91E', visibility: 'Public', status: 'Confirmed', summary: 'Job reference, match ticket, confirmed state. Private values: not present.' },
    { id: 'nullifier', type: 'Uniqueness reference', reference: '0x7A3F...91C2', visibility: 'Public', status: 'Used', summary: 'Job-specific uniqueness reference' },
    { id: 'contract', type: 'Contract reference', reference: '0x...A18C', visibility: 'Public', status: 'Active', summary: 'Demo contract reference' },
  ],
};
