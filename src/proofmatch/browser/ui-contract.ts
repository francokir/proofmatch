/** Stable browser/UI boundary. No Midnight providers or private values cross it. */
export type WalletStatus =
  | 'not_detected'
  | 'detected'
  | 'connecting'
  | 'connection_declined'
  | 'connected';

/** Public identification metadata of an injected wallet. Never secrets. */
export interface InjectedWalletSummary {
  readonly key: string;
  readonly name?: string;
  readonly rdns?: string;
  readonly apiVersion?: string;
  readonly compatible: boolean;
}
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
    /**
     * Looks for an injected connector without connecting to it.
     *
     * Detection and connection are separate on purpose: connecting prompts the
     * user, so the header cannot use it just to decide which label to show.
     */
    detectWallet(): Promise<WalletStatus>;
    /** Public metadata of everything injected, for troubleshooting. */
    injectedWallets(): InjectedWalletSummary[];
    connectWallet(): Promise<void>;
  };
  prepareCandidatePrivateState(contractAddress: string, terms: CandidateTermsInput): Promise<void>;
  proveMatch(contractAddress: string): Promise<void>;
  readPublicState(contractAddress: string): Promise<PublicJobState | null>;
  refreshPublicState(contractAddress: string): Promise<PublicJobState | null>;
  resetCandidatePrivateState(contractAddress: string): Promise<void>;
  subscribeProofStatus(listener: (status: ProofFlowStatus) => void): () => void;
}
