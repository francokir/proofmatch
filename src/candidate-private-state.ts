import { randomBytes } from 'node:crypto';

import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

/** Private candidate inputs scoped to one deployed ProofMatchJob. */
export interface ProofMatchCandidatePrivateState {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
  readonly secret: Uint8Array;
}

export const CANDIDATE_PRIVATE_STATE_ID = 'proofmatchCandidateState';

export type CandidatePrivateStateProvider = PrivateStateProvider<
  typeof CANDIDATE_PRIVATE_STATE_ID,
  ProofMatchCandidatePrivateState
>;

export interface CandidatePrivateInputs {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
}

function newCandidateSecret(): Uint8Array {
  return Uint8Array.from(randomBytes(32));
}

function requireCandidateSecret(secret: Uint8Array): Uint8Array {
  if (secret.length !== 32) {
    throw new Error('ProofMatch candidate secret must contain exactly 32 bytes');
  }
  return secret;
}

/**
 * Persists candidate inputs for one contract address. The secret is generated
 * once for that vacante and reused on later updates; it is never logged.
 */
export async function prepareCandidatePrivateState(
  provider: CandidatePrivateStateProvider,
  contractAddress: ContractAddress,
  inputs: CandidatePrivateInputs,
): Promise<ProofMatchCandidatePrivateState> {
  provider.setContractAddress(contractAddress);
  const existing = await provider.get(CANDIDATE_PRIVATE_STATE_ID);
  const state: ProofMatchCandidatePrivateState = {
    minimumCompensation: inputs.minimumCompensation,
    availableWeeklyHours: inputs.availableWeeklyHours,
    // deployContract seeds this ID with {}, before a real contract address is
    // available to the application. That empty value is not a candidate
    // identity, so first preparation generates the per-vacante secret.
    secret: existing?.secret === undefined ? newCandidateSecret() : requireCandidateSecret(existing.secret),
  };
  await provider.set(CANDIDATE_PRIVATE_STATE_ID, state);
  return state;
}

/**
 * Removes this vacante's private state for an explicit demo reset. Resetting
 * changes the candidate identity for this contract and permits a new nullifier.
 */
export async function resetCandidatePrivateState(
  provider: CandidatePrivateStateProvider,
  contractAddress: ContractAddress,
): Promise<void> {
  provider.setContractAddress(contractAddress);
  await provider.remove(CANDIDATE_PRIVATE_STATE_ID);
}
