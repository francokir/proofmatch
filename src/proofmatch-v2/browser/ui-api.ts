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
import { createBrowserCredentialStore, type StoredCredential } from './credential-store';
import { connectProofMatchV2, type ConnectProofMatchV2Options, type ProofMatchV2Client } from './client';
import type { ProofMatchV2PublicState } from '../public-state';
import type { ProofMatchV2QPublicState } from '../qualification/public-state';
import {
  prepareEmployerV2QPrivateState,
  readV2QPrivateState,
  resetCandidateV2QPrivateState,
} from '../qualification/private-state';
import { deriveQualificationTag, englishQualificationType } from '../qualification/derivation';
import { cefrLevelLabel, cefrLevelNumber, isCefrLabel, satisfiesLevel } from '../qualification/levels';
import { MidnamesClient } from '../qualification/midnames-client';
import {
  buildPresentation,
  computeHolderCommitment,
  freshOwnerSecret,
  generateHolderKeyPair,
} from '../qualification/holder';
import { issuerName as credentialIssuerName } from '../qualification/credential';
import type { VerifiablePresentation } from '../qualification/credential';
import type { PrivateMatchProfile } from '../profile';
import type {
  InjectedWalletSummary,
  ProofFlowStatus,
  ProofMatchV2UiApi,
  RevealField,
  V2CredentialSummary,
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

function projectV2QPublicState(
  contractAddress: string,
  state: ProofMatchV2QPublicState,
): V2PublicJobState {
  return {
    contractAddress,
    jobId: toHex(state.jobId),
    salaryBandFloor: state.salaryBandFloor,
    salaryBandCeiling: state.salaryBandCeiling,
    requiredWeeklyHours: state.jobRequiredWeeklyHours,
    // The two contracts share the enum values; the projection is the same.
    workMode: WORK_MODE_NAMES[state.jobWorkMode as unknown as WorkMode],
    officeX: state.officeX,
    officeY: state.officeY,
    jobState: Number(state.jobState) === Number(JobState.OPEN) ? 'Open' : 'Closed',
    budgetLocked: state.budgetLocked,
    employerBudgetCommitment: toHex(state.employerBudgetCommitment),
    matchCount: state.matchCount,
    usedNullifierCount: BigInt(state.usedNullifiers.size()),
    salaryCommitmentCount: BigInt(state.candidateSalaryCommitments.size()),
    hoursCommitmentCount: BigInt(state.candidateHoursCommitments.size()),
    qualification: {
      kind: 'english',
      requiredLevel: state.requiredQualificationLevel,
      requiredLevelLabel: cefrLevelLabel(state.requiredQualificationLevel),
      attestationCount: state.attestationCount,
      verifierKeyHash: toHex(state.qualificationVerifierKey),
    },
  };
}

/** Sanity gate for the V2Q decode probe: a mis-decoded state never passes. */
function plausibleV2QState(state: ProofMatchV2QPublicState): boolean {
  return (
    state.requiredQualificationLevel >= 1n &&
    state.requiredQualificationLevel <= 6n &&
    toHex(state.qualificationType) !== '00'.repeat(32) &&
    toHex(state.qualificationType) === toHex(englishQualificationType())
  );
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
  credential?: V2CredentialSummary | null,
): V2JobPreview[] {
  const candidate = candidateInputsFromProfile(toDomainProfile(profile));
  return jobs.map((job) => {
    const fit = previewPrivateFit(toPreviewState(job), candidate);
    const qualificationRequired = job.qualification !== undefined;
    // Local-only evaluation: does the credential stored in THIS browser cover
    // the requirement? Nothing is presented and no recruiter learns anything
    // until the candidate actually proves on ONE selected vacancy.
    const qualificationSatisfiable =
      !qualificationRequired ||
      (credential != null &&
        isCefrLabel(credential.englishLevelLabel) &&
        satisfiesLevel(
          cefrLevelNumber(credential.englishLevelLabel),
          job.qualification!.requiredLevel,
        ));
    return {
      contractAddress: job.contractAddress,
      publicState: job,
      salaryFit: fit.salaryFit,
      hoursCompatible: fit.hoursCompatible,
      workModeAccepted: fit.workModeAccepted,
      commuteCompatible: fit.commuteCompatible,
      qualificationRequired,
      qualificationSatisfiable,
      canProveGuaranteedMatch: fit.canProveGuaranteedMatch && qualificationSatisfiable,
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
  const credentialStore = createBrowserCredentialStore();
  /** Which contract flavour lives at an address, learned from decode probes. */
  const jobKinds = new Map<string, 'v2' | 'v2q'>();
  /** Midnames base URL, discovered once from the bridge's /verifier-info. */
  let midnamesClient: MidnamesClient | undefined;
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

  const requireV2Q = () => {
    const active = requireClient();
    if (!active.v2q) {
      throw new Error(
        'Verified qualifications are not configured (set the qualification bridge URL).',
      );
    }
    return active.v2q;
  };

  const bridgeFetch = async <T>(route: string, body?: unknown): Promise<T> => {
    const { bridgeUrl } = requireV2Q();
    const res = await fetch(`${bridgeUrl}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as T;
  };

  const requireMidnames = async (): Promise<MidnamesClient> => {
    if (midnamesClient) return midnamesClient;
    const info = await bridgeFetch<{ midnamesUrl?: string }>('/verifier-info');
    if (!info.midnamesUrl) throw new Error('The qualification bridge did not report a Midnames URL.');
    midnamesClient = new MidnamesClient({ baseUrl: info.midnamesUrl });
    return midnamesClient;
  };

  const readState = async (contractAddress: string): Promise<ProofMatchV2PublicState | null> =>
    requireClient().service.refreshPublicState(contractAddress);

  /** Reads an address as V2Q or V2, remembering which flavour answered. */
  const readAnyState = async (
    contractAddress: string,
  ): Promise<
    | { kind: 'v2'; state: ProofMatchV2PublicState }
    | { kind: 'v2q'; state: ProofMatchV2QPublicState }
    | null
  > => {
    const active = requireClient();
    const known = jobKinds.get(contractAddress);
    if (active.v2q && known !== 'v2') {
      try {
        const state = await active.v2q.service.refreshPublicState(contractAddress);
        if (state && plausibleV2QState(state)) {
          jobKinds.set(contractAddress, 'v2q');
          return { kind: 'v2q', state };
        }
      } catch {
        // Not a V2Q vacancy — fall through to the V2 decode.
      }
    }
    try {
      const state = await active.service.refreshPublicState(contractAddress);
      if (state) {
        jobKinds.set(contractAddress, 'v2');
        return { kind: 'v2', state };
      }
    } catch {
      // Not readable as V2 either.
    }
    return null;
  };

  const projectAny = (
    contractAddress: string,
    read: NonNullable<Awaited<ReturnType<typeof readAnyState>>>,
  ): V2PublicJobState =>
    read.kind === 'v2q'
      ? projectV2QPublicState(contractAddress, read.state)
      : projectPublicState(contractAddress, read.state);

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

  const waitForIndexedV2QState = async (
    contractAddress: string,
    satisfied: (state: ProofMatchV2QPublicState) => boolean,
  ): Promise<ProofMatchV2QPublicState | null> => {
    const { service } = requireV2Q();
    for (let attempt = 0; attempt < INDEXER_POLL_ATTEMPTS; attempt += 1) {
      const state = await service.refreshPublicState(contractAddress);
      if (state && satisfied(state)) return state;
      await delay(INDEXER_POLL_INTERVAL_MS);
    }
    return null;
  };

  const toCredentialSummary = (stored: StoredCredential): V2CredentialSummary => ({
    credentialId: stored.credentialId,
    holderDid: stored.holderDid,
    englishLevelLabel: stored.englishLevelLabel,
    issuerName: stored.issuerName,
    issuedAt: stored.issuedAt,
  });

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

      if (input.englishRequirement) {
        // Qualification-gated vacancy: publish on the V2Q contract. The
        // verifier's public key hash comes from the bridge; the employer
        // seals it so ONLY that verifier can register attestations.
        const v2q = requireV2Q();
        if (!isCefrLabel(input.englishRequirement.minimumLevelLabel)) {
          throw new Error('The English requirement must be a CEFR level (A1..C2).');
        }
        const info = await bridgeFetch<{ verifierKeyHash?: string }>('/verifier-info');
        if (!info.verifierKeyHash || !/^[0-9a-f]{64}$/i.test(info.verifierKeyHash)) {
          throw new Error('The qualification bridge did not report a verifier key.');
        }
        const deployed = await v2q.service.deployJob({
          jobId: freshJobId(),
          salaryBandFloor: input.salaryBandFloor,
          salaryBandCeiling: input.salaryBandCeiling,
          jobRequiredWeeklyHours: input.requiredWeeklyHours,
          workMode: WORK_MODE_VALUES[input.workMode],
          officeX: input.officeX,
          officeY: input.officeY,
          employerSecret,
          qualificationType: englishQualificationType(),
          requiredQualificationLevel: cefrLevelNumber(input.englishRequirement.minimumLevelLabel),
          qualificationVerifierKeyHash: Uint8Array.from(Buffer.from(info.verifierKeyHash, 'hex')),
          privateStateId: v2q.privateStateId,
        });
        const contractAddress = (
          deployed as { deployTxData: { public: { contractAddress: string } } }
        ).deployTxData.public.contractAddress;
        await prepareEmployerV2QPrivateState(
          v2q.privateStateProvider,
          contractAddress as ContractAddress,
          input.salaryBandFloor,
          employerSecret,
        );
        jobKinds.set(contractAddress, 'v2q');
        await waitForIndexedV2QState(contractAddress, () => true);
        return contractAddress;
      }

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
      jobKinds.set(contractAddress, 'v2');
      await waitForIndexedState(contractAddress, () => true);
      return contractAddress;
    },

    async lockPrivateBudget(contractAddress: string, exactMaximumCompensation: bigint): Promise<void> {
      const active = requireClient();
      const read = await readAnyState(contractAddress);
      if (!read) throw new Error('The vacancy is not readable from the indexer.');

      if (read.kind === 'v2q') {
        const v2q = requireV2Q();
        const stored = await readV2QPrivateState(
          v2q.privateStateProvider,
          contractAddress as ContractAddress,
        );
        if (!stored.employerSecret) {
          throw new Error(
            'This browser did not publish that vacancy, so it cannot authorise its budget lock.',
          );
        }
        await v2q.service.prepareEmployerState(
          contractAddress,
          exactMaximumCompensation,
          stored.employerSecret,
        );
        const job = await v2q.service.joinJob({
          contractAddress,
          privateStateId: v2q.privateStateId,
        });
        setProofStatus('proof_generating');
        try {
          await v2q.service.lockPrivateBudget(job as never);
          setProofStatus('indexing_pending');
          await waitForIndexedV2QState(contractAddress, (state) => state.budgetLocked);
          setProofStatus('confirmed');
        } catch (error) {
          setProofStatus('failed');
          throw error;
        }
        return;
      }

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
      const read = await readAnyState(contractAddress);
      if (!read) throw new Error('The vacancy is not readable from the indexer.');

      if (read.kind === 'v2q') {
        // Qualification-gated match. Order matters and mirrors the trust
        // model: credential presented → Midnames verifies → verifier attests
        // opaque Q → ONLY THEN the candidate's ZK proof can pass the gate.
        const v2q = requireV2Q();
        const stored = await credentialStore.load();
        if (!stored) {
          throw new Error(
            'This vacancy requires a verified English credential. Get one in the profile panel first.',
          );
        }
        await v2q.service.prepareCandidateStateFromProfile(contractAddress, toDomainProfile(profile));
        const qualificationSecret = await v2q.service.qualificationSecret(contractAddress);
        const q = deriveQualificationTag(
          contractAddress,
          englishQualificationType(),
          qualificationSecret,
        );

        const attested = read.state.qualificationAttestations.findPathForLeaf(q) !== undefined;
        if (!attested) {
          setProofStatus('credential_verifying');
          try {
            const midnames = await requireMidnames();
            const challenge = await midnames.challenge();
            const vp = await buildPresentation(
              stored.holderPrivateKeyPkcs8,
              stored.holderDid,
              stored.vc,
              challenge,
            );
            setProofStatus('attestation_pending');
            const attestation = await bridgeFetch<{
              attested?: boolean;
              error?: string;
            }>('/request-attestation', {
              contractAddress,
              qualificationTag: toHex(q),
              vp,
            });
            if (!attestation.attested) {
              throw new Error(attestation.error ?? 'The verifier refused the attestation.');
            }
            const confirmed = await waitForIndexedV2QState(
              contractAddress,
              (state) => state.qualificationAttestations.findPathForLeaf(q) !== undefined,
            );
            if (!confirmed) throw new Error('The attestation did not reach the indexer in time.');
          } catch (error) {
            setProofStatus('failed');
            throw error;
          }
        }

        const before = await v2q.service.refreshPublicState(contractAddress);
        const nullifiersBefore = new Set(
          [...(before?.usedNullifiers ?? [])].map((entry) => toHex(entry)),
        );
        const job = await v2q.service.joinJob({
          contractAddress,
          privateStateId: v2q.privateStateId,
        });
        setProofStatus('proof_generating');
        try {
          await v2q.service.proveGuaranteedMatch(job as never);
          setProofStatus('indexing_pending');
          const after = await waitForIndexedV2QState(
            contractAddress,
            (state) => state.matchCount > (before?.matchCount ?? 0n),
          );
          if (after) {
            const fresh = [...after.usedNullifiers].find(
              (entry) => !nullifiersBefore.has(toHex(entry)),
            );
            if (fresh) ownNullifiers.set(contractAddress, fresh);
          }
          setProofStatus('confirmed');
        } catch (error) {
          setProofStatus('failed');
          throw error;
        }
        return;
      }

      const before = read.state;
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

    credential: {
      async load(): Promise<V2CredentialSummary | null> {
        const stored = await credentialStore.load();
        return stored === null ? null : toCredentialSummary(stored);
      },

      async requestDemoCredential(
        candidateName: string,
        englishLevelLabel: string,
      ): Promise<V2CredentialSummary> {
        if (!isCefrLabel(englishLevelLabel)) {
          throw new Error('The English level must be a CEFR label (A1..C2).');
        }
        // Issuer side (bridge holds the API key) creates the offer…
        const offer = await bridgeFetch<{ sessionId?: string; error?: string }>(
          '/offer-credential',
          { candidateName, englishLevel: englishLevelLabel },
        );
        if (!offer.sessionId) {
          throw new Error(offer.error ?? 'The demo issuer refused the credential offer.');
        }
        // …and the HOLDER side runs here, in this browser: fresh P-256 key in
        // WebCrypto, commitment, on-chain holder DID, signed credential.
        const midnames = await requireMidnames();
        const claim = await midnames.claim(offer.sessionId);
        const holder = await generateHolderKeyPair();
        const ownerSecret = freshOwnerSecret();
        const commitment = await computeHolderCommitment(
          ownerSecret,
          holder.publicKeyX,
          holder.publicKeyY,
        );
        const ack = await midnames.acknowledge({
          preAuthorizedCode: claim.pre_authorized_code,
          holderCommitment: commitment,
          holderPublicKey: holder.publicKeyRaw,
        });
        const vc = await midnames.issue({
          sessionId: offer.sessionId,
          holderCommitment: commitment,
        });
        const stored = await credentialStore.save({
          credentialId: vc.id ?? '',
          holderDid: ack.holderDid,
          englishLevelLabel,
          issuerName: credentialIssuerName(vc),
          issuedAt: typeof vc.issuanceDate === 'string' ? vc.issuanceDate : undefined,
          vc,
          holderPrivateKeyPkcs8: holder.privateKeyPkcs8,
        });
        return toCredentialSummary(stored);
      },

      async clear(): Promise<void> {
        await credentialStore.clear();
      },
    },

    async createCredentialPresentation(): Promise<string> {
      const stored = await credentialStore.load();
      if (!stored) throw new Error('There is no credential stored in this browser to present.');
      const midnames = await requireMidnames();
      const challenge = await midnames.challenge();
      const vp = await buildPresentation(
        stored.holderPrivateKeyPkcs8,
        stored.holderDid,
        stored.vc,
        challenge,
      );
      return btoa(JSON.stringify(vp));
    },

    async verifyCredentialPresentation(transport: string) {
      let vp: VerifiablePresentation<unknown>;
      try {
        vp = JSON.parse(atob(transport.trim())) as VerifiablePresentation<unknown>;
      } catch {
        return { verified: false as const, reason: 'That is not a credential presentation.' };
      }
      const result = await bridgeFetch<{
        verified?: boolean;
        holder?: string;
        error?: string;
        status?: string;
      }>('/verify-presentation', vp);
      if (!result.verified) {
        return {
          verified: false as const,
          reason: result.error ?? result.status ?? 'The presentation did not verify.',
        };
      }
      const vc = vp.verifiableCredential?.[0];
      const subject = (vc?.credentialSubject ?? {}) as { englishLevel?: string };
      return {
        verified: true as const,
        holderDid: result.holder ?? vp.holder,
        englishLevelLabel: typeof subject.englishLevel === 'string' ? subject.englishLevel : '—',
        issuerName: vc ? credentialIssuerName(vc) : '—',
        credentialId: vc?.id ?? '—',
      };
    },

    async readJob(contractAddress: string): Promise<V2PublicJobState | null> {
      if (!client) return null;
      const read = await readAnyState(contractAddress);
      return read === null ? null : projectAny(contractAddress, read);
    },

    async refreshJob(contractAddress: string): Promise<V2PublicJobState | null> {
      const read = await readAnyState(contractAddress);
      return read === null ? null : projectAny(contractAddress, read);
    },

    async createReveal(contractAddress: string, field: RevealField): Promise<V2RevealPackage> {
      const active = requireClient();
      // Both contract flavours keep the same candidate/employer commitment
      // fields; only WHERE the private half lives differs.
      const stored =
        jobKinds.get(contractAddress) === 'v2q'
          ? await readV2QPrivateState(
              requireV2Q().privateStateProvider,
              contractAddress as ContractAddress,
            )
          : await readV2PrivateState(
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
      const read = await readAnyState(contractAddress);
      if (!read) return { verified: false, reason: 'The vacancy is not readable from the indexer.' };
      let decoded;
      try {
        decoded = decodeRevealPackage(transport);
      } catch {
        return { verified: false, reason: 'That is not a ProofMatch reveal package.' };
      }
      // The verification recomputes commitments against fields both contract
      // flavours share (nullifier-keyed maps + the employer commitment).
      const verdict = active.service.verifyRevealPackage(
        decoded,
        read.state as ProofMatchV2PublicState,
        contractAddress,
      );
      return verdict.valid
        ? { verified: true, field: verdict.field, value: verdict.value }
        : { verified: false, reason: verdict.reason };
    },

    async resetCandidate(contractAddress: string): Promise<void> {
      const active = requireClient();
      if (jobKinds.get(contractAddress) === 'v2q') {
        await resetCandidateV2QPrivateState(
          requireV2Q().privateStateProvider,
          contractAddress as ContractAddress,
        );
      } else {
        await resetCandidateV2PrivateState(
          active.privateStateProvider,
          contractAddress as ContractAddress,
        );
      }
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
