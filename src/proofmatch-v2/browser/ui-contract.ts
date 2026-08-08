/**
 * Stable browser/UI boundary for ProofMatch V2.
 *
 * Nothing below this line leaks upwards: no Midnight providers, no generated
 * bindings, no witnesses, no secrets, no openings. The UI receives plain
 * strings, bigints and booleans, and can only ask for actions it is allowed to
 * take. Every privacy rule is enforced under this boundary, never above it.
 */
export type WalletStatus =
  | 'not_detected'
  | 'detected'
  | 'connecting'
  | 'connection_declined'
  | 'connected';

export type ProofFlowStatus =
  | 'idle'
  | 'proof_generating'
  | 'signature_pending'
  | 'transaction_pending'
  | 'indexing_pending'
  | 'confirmed'
  | 'failed';

export type SalaryFit = 'GUARANTEED' | 'NEGOTIATION_ZONE' | 'NO_FIT';
export type WorkModeName = 'REMOTE' | 'HYBRID' | 'ONSITE';

/** Public identification metadata of an injected wallet. Never secrets. */
export interface InjectedWalletSummary {
  readonly key: string;
  readonly name?: string;
  readonly rdns?: string;
  readonly apiVersion?: string;
  readonly compatible: boolean;
}

/**
 * Everything ProofMatchJobV2 publishes on-chain, projected for display.
 *
 * Note what is absent, because it is the whole point of V2: the employer's
 * exact cap, and the candidate's salary, hours, location and radius. The band
 * is public; the values inside it are not.
 */
export interface V2PublicJobState {
  readonly contractAddress: string;
  readonly jobId: string;
  readonly salaryBandFloor: bigint;
  readonly salaryBandCeiling: bigint;
  readonly requiredWeeklyHours: bigint;
  readonly workMode: WorkModeName;
  readonly officeX: bigint;
  readonly officeY: bigint;
  readonly jobState: 'Open' | 'Closed';
  readonly budgetLocked: boolean;
  /** Hex commitment to the employer's cap. Reveals nothing on its own. */
  readonly employerBudgetCommitment: string;
  readonly matchCount: bigint;
  readonly usedNullifierCount: bigint;
  readonly salaryCommitmentCount: bigint;
  readonly hoursCommitmentCount: bigint;
}

/** The candidate's reusable profile. Holds no secret, opening or nullifier. */
export interface V2Profile {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
  readonly acceptedWorkModes: readonly WorkModeName[];
  readonly locationX: bigint;
  readonly locationY: bigint;
  readonly maximumCommuteRadius: bigint;
}

/** One vacancy classified locally against the profile. No network, no proof. */
export interface V2JobPreview {
  readonly contractAddress: string;
  readonly publicState: V2PublicJobState;
  readonly salaryFit: SalaryFit;
  readonly hoursCompatible: boolean;
  readonly workModeAccepted: boolean;
  readonly commuteCompatible: boolean;
  readonly canProveGuaranteedMatch: boolean;
}

export type RevealField = 'candidateSalary' | 'candidateHours' | 'employerSalaryCap';

/** A voluntary disclosure of one field, checkable against the ledger. */
export interface V2RevealPackage {
  readonly field: RevealField;
  readonly contractAddress: string;
  readonly value: bigint;
  readonly transport: string;
}

export type V2RevealVerdict =
  | { readonly verified: true; readonly field: RevealField; readonly value: bigint }
  | { readonly verified: false; readonly reason: string };

export interface V2DeployJobInput {
  readonly salaryBandFloor: bigint;
  readonly salaryBandCeiling: bigint;
  readonly requiredWeeklyHours: bigint;
  readonly workMode: WorkModeName;
  readonly officeX: bigint;
  readonly officeY: bigint;
}

export interface ProofMatchV2UiApi {
  readonly wallet: {
    readonly status: WalletStatus;
    detectWallet(): Promise<WalletStatus>;
    injectedWallets(): InjectedWalletSummary[];
    connectWallet(): Promise<void>;
  };

  // ── Employer ────────────────────────────────────────────────────────────
  /** Publishes a vacancy with a public band. The exact cap is not sent. */
  deployJob(input: V2DeployJobInput): Promise<string>;
  /**
   * Commits to an exact cap inside the published band.
   *
   * The cap itself never reaches the ledger — only a commitment to it, and a
   * proof that it sits within the band.
   */
  lockPrivateBudget(contractAddress: string, exactMaximumCompensation: bigint): Promise<void>;

  // ── Candidate ───────────────────────────────────────────────────────────
  loadProfile(): Promise<V2Profile | null>;
  saveProfile(profile: V2Profile): Promise<V2Profile>;
  clearProfile(): Promise<void>;
  /** Local classification of several vacancies. Sends nothing, proves nothing. */
  previewJobs(jobs: readonly V2PublicJobState[], profile: V2Profile): V2JobPreview[];
  /** The only call that generates a real proof and a real transaction. */
  proveGuaranteedMatch(contractAddress: string, profile: V2Profile): Promise<void>;

  // ── Ledger ──────────────────────────────────────────────────────────────
  readJob(contractAddress: string): Promise<V2PublicJobState | null>;
  refreshJob(contractAddress: string): Promise<V2PublicJobState | null>;

  // ── Consent Reveal ──────────────────────────────────────────────────────
  /** Builds a disclosure from values this browser already holds privately. */
  createReveal(contractAddress: string, field: RevealField): Promise<V2RevealPackage>;
  /** Recomputes the commitment and compares it with the one on-chain. */
  verifyReveal(transport: string, contractAddress: string): Promise<V2RevealVerdict>;

  // ── Demo ────────────────────────────────────────────────────────────────
  resetCandidate(contractAddress: string): Promise<void>;
  subscribeProofStatus(listener: (status: ProofFlowStatus) => void): () => void;
}
