/** Stable browser/UI boundary. No Midnight providers or private values cross it. */
export type WalletStatus = 'not_detected' | 'connecting' | 'connection_declined' | 'connected';
export type ProofFlowStatus = 'idle' | 'proof_generating' | 'signature_pending' | 'transaction_pending' | 'indexing_pending' | 'confirmed' | 'failed';

export interface CandidateTermsInput {
  minimumCompensation: bigint;
  availableWeeklyHours: bigint;
}

export interface PublicJobState {
  jobId: string;
  jobMaximumCompensation: bigint;
  jobRequiredWeeklyHours: bigint;
  jobState: string;
  matchCount: bigint;
  usedNullifierCount: bigint;
}

export interface ProofMatchUiApi {
  wallet: {
    status: WalletStatus;
    connectWallet(): Promise<void>;
  };
  prepareCandidatePrivateState(contractAddress: string, terms: CandidateTermsInput): Promise<void>;
  proveMatch(contractAddress: string): Promise<void>;
  readPublicState(contractAddress: string): Promise<PublicJobState | null>;
  refreshPublicState(contractAddress: string): Promise<PublicJobState | null>;
  resetCandidatePrivateState(contractAddress: string): Promise<void>;
  subscribeProofStatus(listener: (status: ProofFlowStatus) => void): () => void;
}
