export interface LedgerEntry {
  id: string;
  type: string;
  reference: string;
  visibility: 'Public';
  status: string;
  summary: string;
}

export interface LedgerLensData {
  entries: LedgerEntry[];
  verifiedMatches: number;
  requiredAvailability: string;
}

import type { PublicJobState } from './integration';

export function ledgerLensDataFromPublicState(state: PublicJobState): LedgerLensData {
  return {
    verifiedMatches: Number(state.matchCount),
    requiredAvailability: `${state.jobRequiredWeeklyHours} h / week`,
    entries: [
      { id: 'job', type: 'Job', reference: state.jobId, visibility: 'Public', status: state.jobState, summary: 'Public job state' },
      { id: 'matches', type: 'Match count', reference: state.matchCount.toString(), visibility: 'Public', status: 'Confirmed', summary: 'Public verified match count. Private values: not present.' },
      { id: 'nullifiers', type: 'Uniqueness reference', reference: state.usedNullifierCount.toString(), visibility: 'Public', status: 'Used', summary: 'Public uniqueness count' },
    ],
  };
}
