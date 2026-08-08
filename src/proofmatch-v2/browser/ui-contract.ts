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
  | 'credential_verifying'
  | 'attestation_pending'
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
/**
 * A vacancy's PUBLIC qualification requirement. This is a job term, like the
 * salary band: the board shows it. What never appears here (or anywhere
 * public): the candidate's exact level, the credential, the holder identity.
 */
export interface V2QualificationRequirement {
  readonly kind: 'english';
  /** CEFR number 1..6 (A1..C2) the vacancy demands. */
  readonly requiredLevel: bigint;
  readonly requiredLevelLabel: string;
  /** Opaque attestations registered by the authorized verifier so far. */
  readonly attestationCount: bigint;
  /** Hash identifying the authorized verifier. Public by design. */
  readonly verifierKeyHash: string;
}

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
  /** Present only on vacancies that REQUIRE a verified qualification. */
  readonly qualification?: V2QualificationRequirement;
}

/**
 * The candidate's own view of their stored credential. Rendered ONLY on the
 * candidate side; recruiters never receive this object.
 */
export interface V2CredentialSummary {
  readonly credentialId: string;
  readonly holderDid: string;
  readonly englishLevelLabel: string;
  readonly issuerName: string;
  readonly issuedAt?: string;
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
  /** True when the vacancy demands a verified qualification. */
  readonly qualificationRequired: boolean;
  /**
   * Local answer to "does my stored credential cover the requirement?".
   * Evaluated in this browser only — nothing is revealed to any recruiter
   * during preview. True when no qualification is required.
   */
  readonly qualificationSatisfiable: boolean;
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
  /**
   * Optional verified-qualification requirement. When set, the vacancy is
   * published on the qualification-gated contract and a Guaranteed Match is
   * IMPOSSIBLE without a credential-backed attestation. When absent the
   * vacancy behaves exactly like every V2 vacancy before this feature.
   */
  readonly englishRequirement?: {
    readonly minimumLevelLabel: string; // CEFR: 'A1'..'C2'
  };
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
  /**
   * Local classification of several vacancies. Sends nothing, proves nothing.
   * The credential (when given) is only consulted locally to answer whether a
   * qualification requirement is satisfiable — no recruiter learns anything
   * during preview.
   */
  previewJobs(
    jobs: readonly V2PublicJobState[],
    profile: V2Profile,
    credential?: V2CredentialSummary | null,
  ): V2JobPreview[];
  /**
   * The only call that generates real proofs and real transactions. On a
   * qualification-gated vacancy this runs the whole gate when needed:
   * credential presentation → Midnames verification → verifier attestation →
   * ZK ownership proof inside the match.
   */
  proveGuaranteedMatch(contractAddress: string, profile: V2Profile): Promise<void>;

  // ── Verified qualification ──────────────────────────────────────────────
  readonly credential: {
    /** The credential stored in THIS browser. Never shown to recruiters. */
    load(): Promise<V2CredentialSummary | null>;
    /**
     * Runs the full, real Midnames issuance for the demo: holder P-256 key in
     * WebCrypto, holder DID on the Midnames chain, signed W3C credential.
     */
    requestDemoCredential(
      candidateName: string,
      englishLevelLabel: string,
    ): Promise<V2CredentialSummary>;
    clear(): Promise<void>;
  };
  /**
   * Post-match consent: signs a fresh Verifiable Presentation of the stored
   * credential. Sharing the returned transport REVEALS the full credential
   * (including the exact level) to whoever verifies it — by design, and only
   * ever by this explicit call.
   */
  createCredentialPresentation(): Promise<string>;
  /** Recruiter side: verifies a presented credential end-to-end via Midnames. */
  verifyCredentialPresentation(transport: string): Promise<
    | {
        readonly verified: true;
        readonly holderDid: string;
        readonly englishLevelLabel: string;
        readonly issuerName: string;
        readonly credentialId: string;
      }
    | { readonly verified: false; readonly reason: string }
  >;

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
