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
  | 'unknown';

export interface IntegrationError {
  readonly code: IntegrationErrorCode;
  readonly cause?: unknown;
}
