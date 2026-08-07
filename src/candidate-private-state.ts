import { randomBytes } from 'node:crypto';

import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

/** A contract-scoped candidate secret; never log or send this value off-device. */
export interface CandidatePrivateState {
  readonly candidateSecret: string;
}

export const CANDIDATE_PRIVATE_STATE_ID = 'proofmatchCandidateState';

export type CandidatePrivateStateProvider = PrivateStateProvider<
  typeof CANDIDATE_PRIVATE_STATE_ID,
  CandidatePrivateState
>;

/** Initializes encrypted, contract-scoped candidate state only when absent. */
export async function initializeCandidatePrivateState(
  provider: CandidatePrivateStateProvider,
  contractAddress: ContractAddress,
): Promise<CandidatePrivateState> {
  provider.setContractAddress(contractAddress);
  const existing = await provider.get(CANDIDATE_PRIVATE_STATE_ID);
  if (existing) return existing;

  const state: CandidatePrivateState = {
    candidateSecret: randomBytes(32).toString('hex'),
  };
  await provider.set(CANDIDATE_PRIVATE_STATE_ID, state);
  return state;
}

/** Removes only this candidate's contract-scoped state for a demo reset. */
export async function resetCandidatePrivateState(
  provider: CandidatePrivateStateProvider,
  contractAddress: ContractAddress,
): Promise<void> {
  provider.setContractAddress(contractAddress);
  await provider.remove(CANDIDATE_PRIVATE_STATE_ID);
}
