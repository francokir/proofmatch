import { randomBytes } from 'node:crypto';

import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

import type { WorkMode } from '../../contracts/managed/proofmatch-job-v2/contract/index.js';

/**
 * Private state for one deployed ProofMatchJobV2, scoped by contract address.
 *
 * Employer and candidate fields live in the same record because Midnight.js
 * rehydrates a single private state per (contract address, privateStateId), and
 * the contract declares witnesses for both roles. Every field is optional: a
 * real deployment has the employer on one machine and the candidate on another,
 * each holding only its own half. The circuit only ever calls the witnesses on
 * its own path.
 *
 * The two roles keep separate secret fields on purpose — sharing one would make
 * the employer's authorisation key and the candidate's nullifier derive from
 * the same material.
 *
 * Units are the MVP convention: whole monthly USD, hours per week, metres.
 */
export interface ProofMatchV2PrivateState {
  // ─── Employer ──────────────────────────────────────────────────────────────
  /** The number this whole design protects. Only its commitment reaches chain. */
  readonly employerExactMaximumCompensation?: bigint;
  readonly employerBudgetOpening?: Uint8Array;
  /** Authorises `lockPrivateBudget`. Only its hash is sealed in the contract. */
  readonly employerSecret?: Uint8Array;

  // ─── Candidate ─────────────────────────────────────────────────────────────
  readonly candidateMinimumCompensation?: bigint;
  readonly candidateAvailableWeeklyHours?: bigint;
  readonly candidateAcceptedWorkModes?: readonly WorkMode[];
  readonly candidateLocationX?: bigint;
  readonly candidateLocationY?: bigint;
  readonly candidateCommuteRadius?: bigint;
  /** Stable per-vacancy identity. Drives the nullifier. */
  readonly candidateSecret?: Uint8Array;
  /** Independent per-field commitment openings. Never reuse across fields. */
  readonly candidateSalaryOpening?: Uint8Array;
  readonly candidateHoursOpening?: Uint8Array;
}

/**
 * Single private-state id for V2. It must be the same value passed to
 * `deployJob` / `joinJob`, or Midnight.js rehydrates a different record and the
 * witnesses see nothing.
 */
export const PROOF_MATCH_V2_PRIVATE_STATE_ID = 'proofmatchV2State';

export type ProofMatchV2StateProvider = PrivateStateProvider<
  typeof PROOF_MATCH_V2_PRIVATE_STATE_ID,
  ProofMatchV2PrivateState
>;

/**
 * 32 bytes from a CSPRNG. Never derive these from anything enumerable: the
 * nullifier is hash(domain, contractAddress, secret) and the first two are
 * public, so a guessable secret lets anyone recompute it and learn who applied.
 */
function fresh32(): Uint8Array {
  return Uint8Array.from(randomBytes(32));
}

function require32(bytes: Uint8Array | undefined, label: string): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`ProofMatch V2: ${label} must contain exactly 32 bytes`);
  }
  return bytes;
}

/** Reads the current record for a contract, or an empty one. */
async function load(
  provider: ProofMatchV2StateProvider,
  contractAddress: ContractAddress,
): Promise<ProofMatchV2PrivateState> {
  provider.setContractAddress(contractAddress);
  const existing = await provider.get(PROOF_MATCH_V2_PRIVATE_STATE_ID);
  // deployContract seeds this id with a placeholder before a real address
  // exists; treat anything without our fields as empty.
  return existing ?? {};
}

async function save(
  provider: ProofMatchV2StateProvider,
  contractAddress: ContractAddress,
  state: ProofMatchV2PrivateState,
): Promise<ProofMatchV2PrivateState> {
  provider.setContractAddress(contractAddress);
  await provider.set(PROOF_MATCH_V2_PRIVATE_STATE_ID, state);
  return state;
}

export interface CandidateV2Inputs {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
  readonly acceptedWorkModes: readonly WorkMode[];
  readonly locationX: bigint;
  readonly locationY: bigint;
  readonly commuteRadius: bigint;
}

/**
 * Merges the candidate's inputs into this vacancy's private state, generating
 * the secret and both commitment openings on first use and preserving them
 * afterwards.
 *
 * Preserving the secret is what makes a retry work after a rejected attempt:
 * the circuit derives the nullifier only once every condition passed, so a
 * rejection does not burn it.
 */
export async function prepareCandidateV2PrivateState(
  provider: ProofMatchV2StateProvider,
  contractAddress: ContractAddress,
  inputs: CandidateV2Inputs,
): Promise<ProofMatchV2PrivateState> {
  const existing = await load(provider, contractAddress);
  return save(provider, contractAddress, {
    ...existing,
    candidateMinimumCompensation: inputs.minimumCompensation,
    candidateAvailableWeeklyHours: inputs.availableWeeklyHours,
    candidateAcceptedWorkModes: inputs.acceptedWorkModes,
    candidateLocationX: inputs.locationX,
    candidateLocationY: inputs.locationY,
    candidateCommuteRadius: inputs.commuteRadius,
    candidateSecret: existing.candidateSecret ?? fresh32(),
    candidateSalaryOpening: existing.candidateSalaryOpening ?? fresh32(),
    candidateHoursOpening: existing.candidateHoursOpening ?? fresh32(),
  });
}

/** Merges the employer's exact cap, its opening and the authorisation secret. */
export async function prepareEmployerV2PrivateState(
  provider: ProofMatchV2StateProvider,
  contractAddress: ContractAddress,
  exactMaximumCompensation: bigint,
  employerSecret: Uint8Array,
): Promise<ProofMatchV2PrivateState> {
  const existing = await load(provider, contractAddress);
  return save(provider, contractAddress, {
    ...existing,
    employerExactMaximumCompensation: exactMaximumCompensation,
    employerSecret: require32(employerSecret, 'employer secret'),
    employerBudgetOpening: existing.employerBudgetOpening ?? fresh32(),
  });
}

/** Fresh employer identity. The contract seals only its hash. */
export function createEmployerSecret(): Uint8Array {
  return fresh32();
}

/**
 * Clears this vacancy's candidate fields for an explicit demo reset, leaving
 * the employer's state alone. Resetting changes the candidate identity for this
 * contract and therefore allows a new nullifier.
 */
export async function resetCandidateV2PrivateState(
  provider: ProofMatchV2StateProvider,
  contractAddress: ContractAddress,
): Promise<void> {
  const existing = await load(provider, contractAddress);
  await save(provider, contractAddress, {
    employerExactMaximumCompensation: existing.employerExactMaximumCompensation,
    employerBudgetOpening: existing.employerBudgetOpening,
    employerSecret: existing.employerSecret,
  });
}
