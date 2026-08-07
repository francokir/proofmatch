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
