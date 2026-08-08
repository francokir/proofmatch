/**
 * Private state for one deployed ProofMatchJobV2Q, scoped by contract address.
 *
 * Same design as the V2 record (see ../private-state.ts) plus the two
 * qualification secrets. Three roles share the record because the contract
 * declares witnesses for all of them; each machine only ever fills its own
 * fields.
 */
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

import type { WorkMode } from '../../../contracts/managed/proofmatch-job-v2q/contract/index.js';

export interface ProofMatchV2QPrivateState {
  // ─── Employer ──────────────────────────────────────────────────────────────
  readonly employerExactMaximumCompensation?: bigint;
  readonly employerBudgetOpening?: Uint8Array;
  readonly employerSecret?: Uint8Array;

  // ─── Qualification verifier (the bridge process only) ─────────────────────
  readonly qualificationVerifierSecret?: Uint8Array;

  // ─── Candidate ─────────────────────────────────────────────────────────────
  readonly candidateMinimumCompensation?: bigint;
  readonly candidateAvailableWeeklyHours?: bigint;
  readonly candidateAcceptedWorkModes?: readonly WorkMode[];
  readonly candidateLocationX?: bigint;
  readonly candidateLocationY?: bigint;
  readonly candidateCommuteRadius?: bigint;
  readonly candidateSecret?: Uint8Array;
  readonly candidateSalaryOpening?: Uint8Array;
  readonly candidateHoursOpening?: Uint8Array;
  /**
   * Fresh 32 bytes per (vacancy, qualification type). Q derives from it; the
   * verifier sees Q, never this. A copied Q is useless without it.
   */
  readonly candidateQualificationSecret?: Uint8Array;
}

export const PROOF_MATCH_V2Q_PRIVATE_STATE_ID = 'proofmatchV2QState';

export type ProofMatchV2QStateProvider = PrivateStateProvider<
  typeof PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
  ProofMatchV2QPrivateState
>;

function fresh32(): Uint8Array {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function require32(bytes: Uint8Array | undefined, label: string): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`ProofMatch V2Q: ${label} must contain exactly 32 bytes`);
  }
  return bytes;
}

async function load(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
): Promise<ProofMatchV2QPrivateState> {
  provider.setContractAddress(contractAddress);
  const existing = await provider.get(PROOF_MATCH_V2Q_PRIVATE_STATE_ID);
  return existing ?? {};
}

async function save(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
  state: ProofMatchV2QPrivateState,
): Promise<ProofMatchV2QPrivateState> {
  provider.setContractAddress(contractAddress);
  await provider.set(PROOF_MATCH_V2Q_PRIVATE_STATE_ID, state);
  return state;
}

export interface CandidateV2QInputs {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
  readonly acceptedWorkModes: readonly WorkMode[];
  readonly locationX: bigint;
  readonly locationY: bigint;
  readonly commuteRadius: bigint;
}

/**
 * Prepares the candidate half for one vacancy. Secrets and openings are
 * created on first use and PRESERVED on retry, so a rejected proof burns
 * neither the nullifier nor the qualification attestation.
 */
export async function prepareCandidateV2QPrivateState(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
  inputs: CandidateV2QInputs,
): Promise<ProofMatchV2QPrivateState> {
  const current = await load(provider, contractAddress);
  return save(provider, contractAddress, {
    ...current,
    candidateMinimumCompensation: inputs.minimumCompensation,
    candidateAvailableWeeklyHours: inputs.availableWeeklyHours,
    candidateAcceptedWorkModes: [...inputs.acceptedWorkModes],
    candidateLocationX: inputs.locationX,
    candidateLocationY: inputs.locationY,
    candidateCommuteRadius: inputs.commuteRadius,
    candidateSecret: current.candidateSecret ?? fresh32(),
    candidateSalaryOpening: current.candidateSalaryOpening ?? fresh32(),
    candidateHoursOpening: current.candidateHoursOpening ?? fresh32(),
    candidateQualificationSecret: current.candidateQualificationSecret ?? fresh32(),
  });
}

/**
 * Returns the candidate's qualification secret for this vacancy, creating it
 * if absent. Called BEFORE requesting an attestation: Q derives from it.
 */
export async function ensureQualificationSecret(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
): Promise<Uint8Array> {
  const current = await load(provider, contractAddress);
  if (current.candidateQualificationSecret instanceof Uint8Array) {
    return require32(current.candidateQualificationSecret, 'qualification secret');
  }
  const secret = fresh32();
  await save(provider, contractAddress, { ...current, candidateQualificationSecret: secret });
  return secret;
}

export async function readV2QPrivateState(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
): Promise<ProofMatchV2QPrivateState> {
  return load(provider, contractAddress);
}

export async function prepareEmployerV2QPrivateState(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
  exactMaximumCompensation: bigint,
  employerSecret: Uint8Array,
): Promise<ProofMatchV2QPrivateState> {
  const current = await load(provider, contractAddress);
  return save(provider, contractAddress, {
    ...current,
    employerExactMaximumCompensation: exactMaximumCompensation,
    employerBudgetOpening: current.employerBudgetOpening ?? fresh32(),
    employerSecret: require32(employerSecret, 'employer secret'),
  });
}

/** Prepares the verifier half (bridge process only). */
export async function prepareVerifierV2QPrivateState(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
  verifierSecret: Uint8Array,
): Promise<ProofMatchV2QPrivateState> {
  const current = await load(provider, contractAddress);
  return save(provider, contractAddress, {
    ...current,
    qualificationVerifierSecret: require32(verifierSecret, 'verifier secret'),
  });
}

export function createEmployerSecret(): Uint8Array {
  return fresh32();
}

export async function resetCandidateV2QPrivateState(
  provider: ProofMatchV2QStateProvider,
  contractAddress: ContractAddress,
): Promise<void> {
  const current = await load(provider, contractAddress);
  await save(provider, contractAddress, {
    employerExactMaximumCompensation: current.employerExactMaximumCompensation,
    employerBudgetOpening: current.employerBudgetOpening,
    employerSecret: current.employerSecret,
    qualificationVerifierSecret: current.qualificationVerifierSecret,
  });
}
