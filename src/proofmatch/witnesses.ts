import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

import type { ProofMatchCandidatePrivateState } from '../candidate-private-state';
import type { Ledger, Witnesses } from '../../contracts/managed/proofmatch-job/contract/index.js';

function candidateSecret(state: ProofMatchCandidatePrivateState): Uint8Array {
  if (!(state.secret instanceof Uint8Array) || state.secret.length !== 32) {
    throw new Error('ProofMatch candidate secret must contain exactly 32 bytes');
  }
  return state.secret;
}

export const proofMatchWitnesses: Witnesses<ProofMatchCandidatePrivateState> = {
  candidateMinimumCompensation: ({ privateState }: WitnessContext<Ledger, ProofMatchCandidatePrivateState>) => [
    privateState,
    privateState.minimumCompensation,
  ],
  candidateAvailableWeeklyHours: ({ privateState }: WitnessContext<Ledger, ProofMatchCandidatePrivateState>) => [
    privateState,
    privateState.availableWeeklyHours,
  ],
  candidateSecret: ({ privateState }: WitnessContext<Ledger, ProofMatchCandidatePrivateState>) => [
    privateState,
    candidateSecret(privateState),
  ],
};
