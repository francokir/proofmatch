import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

import type {
  Ledger,
  Witnesses,
  WorkMode,
} from '../../contracts/managed/proofmatch-job-v2/contract/index.js';
import type { ProofMatchV2PrivateState } from './private-state';

// The contract declares twelve witnesses across two roles. A circuit only ever
// reaches the ones on its own path, but `new Contract(...)` requires all of
// them to be present, so both roles share one private-state shape.
export type { ProofMatchV2PrivateState };

function require32(bytes: Uint8Array | undefined, label: string): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`ProofMatch V2: ${label} must contain exactly 32 bytes`);
  }
  return bytes;
}

function requireBigint(value: bigint | undefined, label: string): bigint {
  if (typeof value !== 'bigint') {
    throw new Error(`ProofMatch V2: ${label} is missing from private state`);
  }
  return value;
}

/**
 * A witness returning a value the circuit did not ask for is harmless; one
 * returning garbage is not, which is why the circuit validates every value it
 * receives. These helpers only catch local misconfiguration early.
 */
export const proofMatchV2Witnesses: Witnesses<ProofMatchV2PrivateState> = {
  // ─── Employer ─────────────────────────────────────────────────────────────
  employerSecret: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    require32(privateState.employerSecret, 'employer secret'),
  ],
  employerMaxCompensation: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    requireBigint(privateState.employerExactMaximumCompensation, 'employer exact maximum compensation'),
  ],
  employerBudgetOpening: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    require32(privateState.employerBudgetOpening, 'employer budget opening'),
  ],

  // ─── Candidate ────────────────────────────────────────────────────────────
  candidateMinimumCompensation: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    requireBigint(privateState.candidateMinimumCompensation, 'candidate minimum compensation'),
  ],
  candidateAvailableWeeklyHours: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    requireBigint(privateState.candidateAvailableWeeklyHours, 'candidate available weekly hours'),
  ],
  candidateSecret: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    require32(privateState.candidateSecret, 'candidate secret'),
  ],
  candidateAcceptsWorkMode: (
    { privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>,
    mode: WorkMode,
  ) => [privateState, (privateState.candidateAcceptedWorkModes ?? []).includes(mode)],
  candidateLocationX: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    requireBigint(privateState.candidateLocationX, 'candidate location X'),
  ],
  candidateLocationY: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    requireBigint(privateState.candidateLocationY, 'candidate location Y'),
  ],
  candidateCommuteRadius: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    requireBigint(privateState.candidateCommuteRadius, 'candidate commute radius'),
  ],
  candidateSalaryOpening: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    require32(privateState.candidateSalaryOpening, 'candidate salary opening'),
  ],
  candidateHoursOpening: ({ privateState }: WitnessContext<Ledger, ProofMatchV2PrivateState>) => [
    privateState,
    require32(privateState.candidateHoursOpening, 'candidate hours opening'),
  ],
};
