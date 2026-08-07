/** States exposed by the future integration layer, independent from any UI. */
export type WalletStatus = 'not_detected' | 'locked' | 'connection_declined' | 'connected';

export type ProofTransactionStatus =
  | 'idle'
  | 'proof_generating'
  | 'signature_pending'
  | 'transaction_pending'
  | 'indexing_pending'
  | 'confirmed'
  | 'failed';

export type IntegrationErrorCode =
  | 'wallet_not_detected'
  | 'wallet_locked'
  | 'wallet_connection_declined'
  | 'proof_server_unavailable'
  | 'proof_generation_failed'
  | 'transaction_failed'
  | 'indexer_unavailable'
  | 'indexer_timeout'
  | 'job_not_open'
  | 'job_terms_invalid'
  | 'candidate_input_invalid'
  | 'match_incompatible'
  | 'match_duplicate'
  | 'unknown';

export type CandidateMatchFailure =
  | 'compensation_not_compatible'
  | 'weekly_hours_not_compatible';

export interface IntegrationError {
  readonly code: IntegrationErrorCode;
  readonly cause?: unknown;
  /** Keep this detail within the candidate/integration layer; never send it to recruiters. */
  readonly candidateFailure?: CandidateMatchFailure;
}

/** Maps the real Compact assertion messages without exposing private-value detail. */
export function mapProofMatchError(error: unknown): IntegrationError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ProofMatch: job is not open')) return { code: 'job_not_open', cause: error };
  if (message.includes('ProofMatch: malformed job terms')) return { code: 'job_terms_invalid', cause: error };
  if (message.includes('ProofMatch: candidate compensation out of range')) {
    return { code: 'candidate_input_invalid', cause: error };
  }
  if (message.includes('ProofMatch: candidate weekly hours out of range')) {
    return { code: 'candidate_input_invalid', cause: error };
  }
  if (message.includes('ProofMatch: candidate secret not initialized')) {
    return { code: 'candidate_input_invalid', cause: error };
  }
  if (message.includes('ProofMatch: compensation not compatible')) {
    return { code: 'match_incompatible', cause: error, candidateFailure: 'compensation_not_compatible' };
  }
  if (message.includes('ProofMatch: weekly hours not compatible')) {
    return { code: 'match_incompatible', cause: error, candidateFailure: 'weekly_hours_not_compatible' };
  }
  if (message.includes('ProofMatch: candidate already matched this job')) {
    return { code: 'match_duplicate', cause: error };
  }
  return { code: 'unknown', cause: error };
}
