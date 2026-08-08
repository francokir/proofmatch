import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

import {
  JobState,
  WorkMode,
} from '../../../contracts/managed/proofmatch-job-v2/contract/index.js';
import {
  LaceConnectionError,
  describeInjectedWallets,
  waitForLaceInitialApi,
} from '../../proofmatch/browser/lace';
import {
  createEmployerSecret,
  prepareEmployerV2PrivateState,
  readV2PrivateState,
  resetCandidateV2PrivateState,
} from '../private-state';
import { decodeRevealPackage, encodeRevealPackage } from '../consent-reveal';
import { candidateInputsFromProfile, previewPrivateFit } from '../service';
import { createBrowserProfileStore } from './profile-store';
import { connectProofMatchV2, type ConnectProofMatchV2Options, type ProofMatchV2Client } from './client';
import type { ProofMatchV2PublicState } from '../public-state';
import type { PrivateMatchProfile } from '../profile';
import type {
  InjectedWalletSummary,
  ProofFlowStatus,
  ProofMatchV2UiApi,
  RevealField,
  V2DeployJobInput,
  V2JobPreview,
  V2Profile,
  V2PublicJobState,
  V2RevealPackage,
  V2RevealVerdict,
  WalletStatus,
  WorkModeName,
} from './ui-contract';

const WORK_MODE_NAMES: Record<WorkMode, WorkModeName> = {
  [WorkMode.REMOTE]: 'REMOTE',
  [WorkMode.HYBRID]: 'HYBRID',
  [WorkMode.ONSITE]: 'ONSITE',
};
const WORK_MODE_VALUES: Record<WorkModeName, WorkMode> = {
  REMOTE: WorkMode.REMOTE,
  HYBRID: WorkMode.HYBRID,
  ONSITE: WorkMode.ONSITE,
};

/** How long to keep asking the indexer after a transaction is submitted. */
const INDEXER_POLL_ATTEMPTS = 40;
const INDEXER_POLL_INTERVAL_MS = 3_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Public label for a vacancy. Not an identity and not a secret. */
function freshJobId(): Uint8Array {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function projectPublicState(
  contractAddress: string,
  state: ProofMatchV2PublicState,
): V2PublicJobState {
  return {
    contractAddress,
    jobId: toHex(state.jobId),
    salaryBandFloor: state.salaryBandFloor,
    salaryBandCeiling: state.salaryBandCeiling,
    requiredWeeklyHours: state.jobRequiredWeeklyHours,
    workMode: WORK_MODE_NAMES[state.jobWorkMode],
    officeX: state.officeX,
    officeY: state.officeY,
    jobState: state.jobState === JobState.OPEN ? 'Open' : 'Closed',
    budgetLocked: state.budgetLocked,
    employerBudgetCommitment: toHex(state.employerBudgetCommitment),
    matchCount: state.matchCount,
    usedNullifierCount: BigInt(state.usedNullifiers.size()),
    salaryCommitmentCount: BigInt(state.candidateSalaryCommitments.size()),
    hoursCommitmentCount: BigInt(state.candidateHoursCommitments.size()),
  };
}

/**
 * Rebuilds the on-chain shape the shared preview expects.
 *
 * `budgetLocked` matters as much as the band: an unlocked vacancy can never
 * yield a guaranteed match, because there is no committed cap to be guaranteed
 * against. Leaving it out silently reported every vacancy as unlockable.
 */
function toPreviewState(job: V2PublicJobState): ProofMatchV2PublicState {
  return {
    jobId: new Uint8Array(32),
    salaryBandFloor: job.salaryBandFloor,
    salaryBandCeiling: job.salaryBandCeiling,
    jobRequiredWeeklyHours: job.requiredWeeklyHours,
    jobWorkMode: WORK_MODE_VALUES[job.workMode],
    officeX: job.officeX,
    officeY: job.officeY,
    jobState: job.jobState === 'Open' ? JobState.OPEN : JobState.CLOSED,
    budgetLocked: job.budgetLocked,
  } as unknown as ProofMatchV2PublicState;
}

/**
 * Local classification of several vacancies against one profile.
 *
 * Deliberately not a method on the connected client: it touches no network and
 * proves nothing, so a candidate can weigh vacancies before ever connecting a
 * wallet. It delegates to the shared Stage 2 logic, which mirrors the circuit
 * exactly — including the commute boundary — so the two cannot drift.
 */
export function previewJobs(
  jobs: readonly V2PublicJobState[],
  profile: V2Profile,
): V2JobPreview[] {
  const candidate = candidateInputsFromProfile(toDomainProfile(profile));
  return jobs.map((job) => {
    const fit = previewPrivateFit(toPreviewState(job), candidate);
    return {
      contractAddress: job.contractAddress,
      publicState: job,
      salaryFit: fit.salaryFit,
      hoursCompatible: fit.hoursCompatible,
      workModeAccepted: fit.workModeAccepted,
      commuteCompatible: fit.commuteCompatible,
      canProveGuaranteedMatch: fit.canProveGuaranteedMatch,
    };
  });
}

function toDomainProfile(profile: V2Profile): PrivateMatchProfile {
  return {
    minimumCompensation: profile.minimumCompensation,
    availableWeeklyHours: profile.availableWeeklyHours,
    acceptedWorkModes: profile.acceptedWorkModes.map((name) => WORK_MODE_VALUES[name]),
    locationX: profile.locationX,
    locationY: profile.locationY,
    maximumCommuteRadius: profile.maximumCommuteRadius,
  };
}

function toUiProfile(profile: PrivateMatchProfile): V2Profile {
  return {
    minimumCompensation: profile.minimumCompensation,
    availableWeeklyHours: profile.availableWeeklyHours,
    acceptedWorkModes: profile.acceptedWorkModes.map((mode) => WORK_MODE_NAMES[mode]),
    locationX: profile.locationX,
    locationY: profile.locationY,
    maximumCommuteRadius: profile.maximumCommuteRadius,
  };
}

export interface CreateProofMatchV2UiApiOptions extends ConnectProofMatchV2Options {}

/**
 * Browser facade for ProofMatch V2.
 *
 * It owns the wallet, the providers and the private state, and hands the UI
 * only values it is allowed to render. Nothing here trusts the caller: the
 * contract still re-checks every public term, and the privacy guarantees come
 * from the circuits, not from this file.
 */
export function createProofMatchV2UiApi(
  options: CreateProofMatchV2UiApiOptions,
): ProofMatchV2UiApi {
  let client: ProofMatchV2Client | undefined;
  let walletStatus: WalletStatus = 'not_detected';
  let proofStatus: ProofFlowStatus = 'idle';
  const proofListeners = new Set<(status: ProofFlowStatus) => void>();
  const profileStore = createBrowserProfileStore();
  /**
   * Nullifiers this browser produced, per vacancy.
   *
   * The ledger stores the whole set without saying which entry belongs to
   * whom — that anonymity is the point. To reveal a field later the candidate
   * needs to name its own match, so the entry that appears across its own
   * proof is remembered here, in memory only.
   */
  const ownNullifiers = new Map<string, Uint8Array>();

  const setProofStatus = (next: ProofFlowStatus): void => {
    proofStatus = next;
    for (const listener of proofListeners) listener(proofStatus);
  };

  const requireClient = (): ProofMatchV2Client => {
    if (!client) throw new Error('Connect Lace before using ProofMatch V2.');
    return client;
  };

  const readState = async (contractAddress: string): Promise<ProofMatchV2PublicState | null> =>
    requireClient().service.refreshPublicState(contractAddress);

  const waitForIndexedState = async (
    contractAddress: string,
    satisfied: (state: ProofMatchV2PublicState) => boolean,
  ): Promise<ProofMatchV2PublicState | null> => {
    for (let attempt = 0; attempt < INDEXER_POLL_ATTEMPTS; attempt += 1) {
      const state = await readState(contractAddress);
      if (state && satisfied(state)) return state;
      await delay(INDEXER_POLL_INTERVAL_MS);
    }
    return null;
  };

  return {
    wallet: {
      get status(): WalletStatus {
        return walletStatus;
      },
      async detectWallet(): Promise<WalletStatus> {
        if (walletStatus === 'connected' || walletStatus === 'connecting') return walletStatus;
        walletStatus = (await waitForLaceInitialApi()) ? 'detected' : 'not_detected';
        return walletStatus;
      },
      injectedWallets(): InjectedWalletSummary[] {
        return describeInjectedWallets();
      },
      async connectWallet(): Promise<void> {
        walletStatus = 'connecting';
        try {
          client = await connectProofMatchV2(options);
          walletStatus = 'connected';
        } catch (error) {
          walletStatus = error instanceof LaceConnectionError ? error.status : 'connection_declined';
          throw error;
        }
      },
    },

    async deployJob(input: V2DeployJobInput): Promise<string> {
      const active = requireClient();
      const employerSecret = createEmployerSecret();
      const deployed = await active.service.deployJob({
        jobId: freshJobId(),
        salaryBandFloor: input.salaryBandFloor,
        salaryBandCeiling: input.salaryBandCeiling,
        jobRequiredWeeklyHours: input.requiredWeeklyHours,
        workMode: WORK_MODE_VALUES[input.workMode],
        officeX: input.officeX,
        officeY: input.officeY,
        employerSecret,
        privateStateId: active.privateStateId,
      });
      const contractAddress = (deployed as { deployTxData: { public: { contractAddress: string } } })
        .deployTxData.public.contractAddress;
      // Persist the secret against the real address straight away: without it
      // this browser could never authorise the lock it is about to be asked
      // for. The provisional cap is the band floor, always inside the band.
      await prepareEmployerV2PrivateState(
        active.privateStateProvider,
        contractAddress as ContractAddress,
        input.salaryBandFloor,
        employerSecret,
      );
      await waitForIndexedState(contractAddress, () => true);
      return contractAddress;
    },

    async lockPrivateBudget(contractAddress: string, exactMaximumCompensation: bigint): Promise<void> {
      const active = requireClient();
      const stored = await readV2PrivateState(
        active.privateStateProvider,
        contractAddress as ContractAddress,
      );
      if (!stored.employerSecret) {
        throw new Error(
          'This browser did not publish that vacancy, so it cannot authorise its budget lock.',
        );
      }
      await active.service.prepareEmployerState(
        contractAddress,
        exactMaximumCompensation,
        stored.employerSecret,
      );
      const job = await active.service.joinJob({
        contractAddress,
        privateStateId: active.privateStateId,
      });
      setProofStatus('proof_generating');
      try {
        await active.service.lockPrivateBudget(job as never);
        setProofStatus('indexing_pending');
        await waitForIndexedState(contractAddress, (state) => state.budgetLocked);
        setProofStatus('confirmed');
      } catch (error) {
        setProofStatus('failed');
        throw error;
      }
    },

    async loadProfile(): Promise<V2Profile | null> {
      const stored = await profileStore.load();
      return stored === null ? null : toUiProfile(stored);
    },

    async saveProfile(profile: V2Profile): Promise<V2Profile> {
      return toUiProfile(await profileStore.save(toDomainProfile(profile)));
    },

    async clearProfile(): Promise<void> {
      await profileStore.clear();
    },

    previewJobs,

    async proveGuaranteedMatch(contractAddress: string, profile: V2Profile): Promise<void> {
      const active = requireClient();
      const before = await readState(contractAddress);
      const nullifiersBefore = new Set(
        [...(before?.usedNullifiers ?? [])].map((entry) => toHex(entry)),
      );
      await active.service.prepareCandidateStateFromProfile(contractAddress, toDomainProfile(profile));
      const job = await active.service.joinJob({
        contractAddress,
        privateStateId: active.privateStateId,
      });
      setProofStatus('proof_generating');
      try {
        await active.service.proveGuaranteedMatch(job as never);
        setProofStatus('indexing_pending');
        const after = await waitForIndexedState(
          contractAddress,
          (state) => state.matchCount > (before?.matchCount ?? 0n),
        );
        if (after) {
          const fresh = [...after.usedNullifiers].find((entry) => !nullifiersBefore.has(toHex(entry)));
          if (fresh) ownNullifiers.set(contractAddress, fresh);
        }
        setProofStatus('confirmed');
      } catch (error) {
        setProofStatus('failed');
        throw error;
      }
    },

    async readJob(contractAddress: string): Promise<V2PublicJobState | null> {
      if (!client) return null;
      const state = await client.service.readPublicState(contractAddress);
      return state === null ? null : projectPublicState(contractAddress, state);
    },

    async refreshJob(contractAddress: string): Promise<V2PublicJobState | null> {
      const state = await readState(contractAddress);
      return state === null ? null : projectPublicState(contractAddress, state);
    },

    async createReveal(contractAddress: string, field: RevealField): Promise<V2RevealPackage> {
      const active = requireClient();
      const stored = await readV2PrivateState(
        active.privateStateProvider,
        contractAddress as ContractAddress,
      );

      const source = field === 'employerSalaryCap'
        ? { value: stored.employerExactMaximumCompensation, opening: stored.employerBudgetOpening }
        : field === 'candidateSalary'
          ? { value: stored.candidateMinimumCompensation, opening: stored.candidateSalaryOpening }
          : { value: stored.candidateAvailableWeeklyHours, opening: stored.candidateHoursOpening };

      if (source.value === undefined || source.opening === undefined) {
        throw new Error('There is nothing to reveal for that field in this browser.');
      }

      const nullifier = field === 'employerSalaryCap' ? undefined : ownNullifiers.get(contractAddress);
      if (field !== 'employerSalaryCap' && nullifier === undefined) {
        throw new Error(
          'This browser has no match on that vacancy in this session, so it cannot name which one to reveal.',
        );
      }

      const pkg = active.service.createRevealPackage({
        field,
        contractAddress,
        nullifier,
        value: source.value,
        opening: source.opening,
      });
      return {
        field,
        contractAddress,
        value: source.value,
        transport: encodeRevealPackage(pkg),
      };
    },

    async verifyReveal(transport: string, contractAddress: string): Promise<V2RevealVerdict> {
      const active = requireClient();
      const state = await readState(contractAddress);
      if (!state) return { verified: false, reason: 'The vacancy is not readable from the indexer.' };
      let decoded;
      try {
        decoded = decodeRevealPackage(transport);
      } catch {
        return { verified: false, reason: 'That is not a ProofMatch reveal package.' };
      }
      const verdict = active.service.verifyRevealPackage(decoded, state, contractAddress);
      return verdict.valid
        ? { verified: true, field: verdict.field, value: verdict.value }
        : { verified: false, reason: verdict.reason };
    },

    async resetCandidate(contractAddress: string): Promise<void> {
      const active = requireClient();
      await resetCandidateV2PrivateState(
        active.privateStateProvider,
        contractAddress as ContractAddress,
      );
      ownNullifiers.delete(contractAddress);
      setProofStatus('idle');
    },

    subscribeProofStatus(listener: (status: ProofFlowStatus) => void): () => void {
      listener(proofStatus);
      proofListeners.add(listener);
      return () => proofListeners.delete(listener);
    },
  };
}

export type { ProofMatchV2UiApi } from './ui-contract';
