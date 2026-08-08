import type { ProofMatchProviders } from '../providers';
import type { WorkMode } from '../../contracts/managed/proofmatch-job-v2/contract/index.js';

import {
  deployProofMatchV2Job,
  joinProofMatchV2Job,
  type DeployProofMatchV2JobOptions,
  type JoinProofMatchV2JobOptions,
} from './deploy';
import {
  readProofMatchV2PublicState,
  type ProofMatchV2PublicState,
} from './public-state';
import {
  createOrLoadPrivateProfile,
  updatePrivateProfile,
  type PrivateMatchProfile,
  type PrivateMatchProfileStore,
} from './profile';
import {
  createRevealPackage,
  verifyRevealPackage,
  type RevealField,
  type RevealPackage,
  type RevealVerdict,
} from './consent-reveal';
import {
  prepareCandidateV2PrivateState,
  prepareEmployerV2PrivateState,
  resetCandidateV2PrivateState,
  type CandidateV2Inputs,
  type ProofMatchV2PrivateState,
  type ProofMatchV2StateProvider,
} from './private-state';

/**
 * The three outcomes of comparing a candidate against a public salary band.
 *
 * Only GUARANTEED can be proven on-chain. The other two are local results: the
 * contract deliberately records nothing for them.
 */
export type SalaryFit = 'GUARANTEED' | 'NEGOTIATION_ZONE' | 'NO_FIT';

/**
 * Classifies a candidate's minimum against the public band.
 *
 * With the employer having proven `floor <= cap <= ceiling`:
 *
 *   minimum <= floor            => minimum <= floor <= cap, guaranteed
 *   floor < minimum <= ceiling  => unknown, both exact numbers stay private
 *   minimum > ceiling           => minimum > ceiling >= cap, no fit
 *
 * This runs entirely on the candidate's machine and reveals nothing.
 */
export function classifySalaryFit(
  candidateMinimum: bigint,
  salaryBandFloor: bigint,
  salaryBandCeiling: bigint,
): SalaryFit {
  if (candidateMinimum <= salaryBandFloor) return 'GUARANTEED';
  if (candidateMinimum <= salaryBandCeiling) return 'NEGOTIATION_ZONE';
  return 'NO_FIT';
}

export interface PrivateFitPreview {
  readonly salaryFit: SalaryFit;
  readonly hoursCompatible: boolean;
  readonly workModeAccepted: boolean;
  readonly commuteCompatible: boolean;
  /** True only when a real `proveGuaranteedMatch` would be expected to pass. */
  readonly canProveGuaranteedMatch: boolean;
}

/** Squared distance, matching the circuit exactly. No floating point. */
function withinRadius(
  cx: bigint, cy: bigint, ox: bigint, oy: bigint, radius: bigint,
): boolean {
  const dx = cx >= ox ? cx - ox : ox - cx;
  const dy = cy >= oy ? cy - oy : oy - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Local preview: mirrors every condition the circuit checks, without touching
 * the network and without revealing anything.
 *
 * This is a convenience, never a source of truth. A green preview is not a
 * match: only a real proof is.
 */
export function previewPrivateFit(
  publicState: ProofMatchV2PublicState,
  candidate: CandidateV2Inputs,
): PrivateFitPreview {
  const salaryFit = classifySalaryFit(
    candidate.minimumCompensation,
    publicState.salaryBandFloor,
    publicState.salaryBandCeiling,
  );
  const hoursCompatible = candidate.availableWeeklyHours >= publicState.jobRequiredWeeklyHours;
  const workModeAccepted = candidate.acceptedWorkModes.includes(publicState.jobWorkMode);
  // REMOTE (enum member 0) needs no location at all.
  const commuteCompatible =
    publicState.jobWorkMode === 0
      ? true
      : withinRadius(
          candidate.locationX, candidate.locationY,
          publicState.officeX, publicState.officeY,
          candidate.commuteRadius,
        );

  return {
    salaryFit,
    hoursCompatible,
    workModeAccepted,
    commuteCompatible,
    canProveGuaranteedMatch:
      publicState.budgetLocked &&
      salaryFit === 'GUARANTEED' &&
      hoursCompatible &&
      workModeAccepted &&
      commuteCompatible,
  };
}

/**
 * Turns the reusable profile into the per-job inputs the circuit needs.
 *
 * The profile is shared across vacancies; the secret and the openings are not,
 * and they are added later by `prepareCandidateState` against the real contract
 * address. That split is what keeps a candidate unlinkable between jobs.
 */
export function candidateInputsFromProfile(profile: PrivateMatchProfile): CandidateV2Inputs {
  return {
    minimumCompensation: profile.minimumCompensation,
    availableWeeklyHours: profile.availableWeeklyHours,
    acceptedWorkModes: profile.acceptedWorkModes,
    locationX: profile.locationX,
    locationY: profile.locationY,
    commuteRadius: profile.maximumCommuteRadius,
  };
}

/** One vacancy as seen by the multi-job preview. */
export interface JobPreview {
  readonly contractAddress: string;
  readonly publicState: ProofMatchV2PublicState;
  readonly fit: PrivateFitPreview;
}

/**
 * Classifies several vacancies against one profile, entirely locally.
 *
 * Nothing is proven and nothing is sent: this is the screen where a candidate
 * sees "3 potential fits, 2 no fit" before deciding which single vacancy is
 * worth a real proof. Generating five proofs automatically would be both
 * wasteful and a privacy leak.
 */
export function previewJobs(
  jobs: ReadonlyArray<{ contractAddress: string; publicState: ProofMatchV2PublicState }>,
  profile: PrivateMatchProfile,
): JobPreview[] {
  const inputs = candidateInputsFromProfile(profile);
  return jobs.map((job) => ({
    contractAddress: job.contractAddress,
    publicState: job.publicState,
    fit: previewPrivateFit(job.publicState, inputs),
  }));
}

// Same generic provider surface V1 uses: the browser supplies a fetch-based
// ZK config provider, so pinning the concrete Node shape here would reject it.
type Providers = ProofMatchProviders;

/** Minimal shape of the deployed-contract handle this service drives. */
interface DeployedV2Contract {
  readonly callTx: {
    lockPrivateBudget(): Promise<unknown>;
    proveGuaranteedMatch(): Promise<unknown>;
  };
}

/**
 * Application layer for ProofMatchJobV2.
 *
 * Deliberately headless: no UI, no fixtures. Every public value it returns is
 * read from the indexer, and every state change goes through a real proof.
 */
export interface ProofMatchV2Service {
  deployJob(options: DeployProofMatchV2JobOptions): ReturnType<typeof deployProofMatchV2Job>;
  joinJob(options: JoinProofMatchV2JobOptions): ReturnType<typeof joinProofMatchV2Job>;

  readPublicState(contractAddress: string): Promise<ProofMatchV2PublicState | null>;
  refreshPublicState(contractAddress: string): Promise<ProofMatchV2PublicState | null>;

  prepareEmployerState(
    contractAddress: string,
    exactMaximumCompensation: bigint,
    employerSecret: Uint8Array,
  ): Promise<ProofMatchV2PrivateState>;
  prepareCandidateState(
    contractAddress: string,
    inputs: CandidateV2Inputs,
  ): Promise<ProofMatchV2PrivateState>;
  resetCandidateState(contractAddress: string): Promise<void>;

  previewPrivateFit(
    publicState: ProofMatchV2PublicState,
    candidate: CandidateV2Inputs,
  ): PrivateFitPreview;

  // ─── Private Match Profile: one profile, many vacancies ───────────────────
  createOrLoadPrivateProfile(fallback: PrivateMatchProfile): Promise<PrivateMatchProfile>;
  updatePrivateProfile(changes: Partial<PrivateMatchProfile>): Promise<PrivateMatchProfile>;
  /** Derives this job's private state from the reusable profile. */
  prepareCandidateStateFromProfile(
    contractAddress: string,
    profile: PrivateMatchProfile,
  ): Promise<ProofMatchV2PrivateState>;
  /** Local, network-free classification of several vacancies at once. */
  previewJobs(
    jobs: ReadonlyArray<{ contractAddress: string; publicState: ProofMatchV2PublicState }>,
    profile: PrivateMatchProfile,
  ): JobPreview[];

  // ─── Consent Reveal ───────────────────────────────────────────────────────
  createRevealPackage(input: {
    field: RevealField;
    contractAddress: string;
    nullifier?: Uint8Array;
    value: bigint;
    opening: Uint8Array;
  }): RevealPackage;
  verifyRevealPackage(
    pkg: RevealPackage,
    publicState: ProofMatchV2PublicState,
    contractAddress: string,
  ): RevealVerdict;

  lockPrivateBudget(job: DeployedV2Contract): Promise<unknown>;
  proveGuaranteedMatch(job: DeployedV2Contract): Promise<unknown>;

  /** Clears this vacancy's candidate state and the stored profile. */
  resetV2Demo(contractAddress: string): Promise<void>;
}

export function createProofMatchV2Service(
  providers: Providers,
  zkConfigPath: string,
  profileStore?: PrivateMatchProfileStore,
): ProofMatchV2Service {
  const requireProfileStore = (): PrivateMatchProfileStore => {
    if (profileStore === undefined) {
      throw new Error('ProofMatch V2: this service was created without a profile store');
    }
    return profileStore;
  };
  const candidateStateProvider = () =>
    providers.privateStateProvider as unknown as ProofMatchV2StateProvider;

  return {
    deployJob: (options) => deployProofMatchV2Job(providers, zkConfigPath, options),
    joinJob: (options) => joinProofMatchV2Job(providers, zkConfigPath, options),

    readPublicState: (address) => readProofMatchV2PublicState(providers.publicDataProvider, address),
    refreshPublicState: (address) => readProofMatchV2PublicState(providers.publicDataProvider, address),

    prepareEmployerState: (address, cap, secret) =>
      prepareEmployerV2PrivateState(
        providers.privateStateProvider as unknown as ProofMatchV2StateProvider,
        address, cap, secret,
      ),
    prepareCandidateState: (address, inputs) =>
      prepareCandidateV2PrivateState(
        providers.privateStateProvider as unknown as ProofMatchV2StateProvider,
        address, inputs,
      ),
    resetCandidateState: (address) =>
      resetCandidateV2PrivateState(
        providers.privateStateProvider as unknown as ProofMatchV2StateProvider,
        address,
      ),

    previewPrivateFit,

    createOrLoadPrivateProfile: (fallback) =>
      createOrLoadPrivateProfile(requireProfileStore(), fallback),
    updatePrivateProfile: (changes) => updatePrivateProfile(requireProfileStore(), changes),
    prepareCandidateStateFromProfile: (address, profile) =>
      prepareCandidateV2PrivateState(
        candidateStateProvider(), address, candidateInputsFromProfile(profile),
      ),
    previewJobs,

    createRevealPackage,
    verifyRevealPackage,

    lockPrivateBudget: (job) => job.callTx.lockPrivateBudget(),
    proveGuaranteedMatch: (job) => job.callTx.proveGuaranteedMatch(),

    async resetV2Demo(address) {
      await resetCandidateV2PrivateState(candidateStateProvider(), address);
      if (profileStore !== undefined) await profileStore.clear();
    },
  };
}

export type { PrivateMatchProfile, PrivateMatchProfileStore } from './profile';
export type { RevealField, RevealPackage, RevealVerdict } from './consent-reveal';

export type { WorkMode };
