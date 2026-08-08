import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

import type {
  Ledger,
  Witnesses,
  WorkMode,
} from '../../../contracts/managed/proofmatch-job-v2q/contract/index.js';
import type { ProofMatchV2QPrivateState } from './private-state';

export type { ProofMatchV2QPrivateState };

// The contract declares fifteen witnesses across three roles (employer,
// verifier, candidate). A circuit only ever reaches the ones on its own path,
// but `new Contract(...)` requires all of them to be present.

function require32(bytes: Uint8Array | undefined, label: string): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`ProofMatch V2Q: ${label} must contain exactly 32 bytes`);
  }
  return bytes;
}

function requireBigint(value: bigint | undefined, label: string): bigint {
  if (typeof value !== 'bigint') {
    throw new Error(`ProofMatch V2Q: ${label} is missing from private state`);
  }
  return value;
}

type Ctx = WitnessContext<Ledger, ProofMatchV2QPrivateState>;

/**
 * Witness providers for every role. The merkle-path witness reads the LIVE
 * ledger state: it is untrusted input that the circuit re-binds (leaf == Q,
 * root == this vacancy's attestation tree).
 */
export const proofMatchV2QWitnesses: Witnesses<ProofMatchV2QPrivateState> = {
  // ─── Employer ─────────────────────────────────────────────────────────────
  employerSecret: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.employerSecret, 'employer secret'),
  ],
  employerMaxCompensation: ({ privateState }: Ctx) => [
    privateState,
    requireBigint(privateState.employerExactMaximumCompensation, 'employer exact maximum compensation'),
  ],
  employerBudgetOpening: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.employerBudgetOpening, 'employer budget opening'),
  ],

  // ─── Qualification verifier ───────────────────────────────────────────────
  qualificationVerifierSecret: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.qualificationVerifierSecret, 'qualification verifier secret'),
  ],

  // ─── Candidate ────────────────────────────────────────────────────────────
  candidateMinimumCompensation: ({ privateState }: Ctx) => [
    privateState,
    requireBigint(privateState.candidateMinimumCompensation, 'candidate minimum compensation'),
  ],
  candidateAvailableWeeklyHours: ({ privateState }: Ctx) => [
    privateState,
    requireBigint(privateState.candidateAvailableWeeklyHours, 'candidate available weekly hours'),
  ],
  candidateSecret: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.candidateSecret, 'candidate secret'),
  ],
  candidateAcceptsWorkMode: ({ privateState }: Ctx, mode: WorkMode) => [
    privateState,
    (privateState.candidateAcceptedWorkModes ?? []).includes(mode),
  ],
  candidateLocationX: ({ privateState }: Ctx) => [
    privateState,
    requireBigint(privateState.candidateLocationX, 'candidate location X'),
  ],
  candidateLocationY: ({ privateState }: Ctx) => [
    privateState,
    requireBigint(privateState.candidateLocationY, 'candidate location Y'),
  ],
  candidateCommuteRadius: ({ privateState }: Ctx) => [
    privateState,
    requireBigint(privateState.candidateCommuteRadius, 'candidate commute radius'),
  ],
  candidateSalaryOpening: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.candidateSalaryOpening, 'candidate salary opening'),
  ],
  candidateHoursOpening: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.candidateHoursOpening, 'candidate hours opening'),
  ],
  candidateQualificationSecret: ({ privateState }: Ctx) => [
    privateState,
    require32(privateState.candidateQualificationSecret, 'candidate qualification secret'),
  ],
  findQualificationPath: ({ ledger, privateState }: Ctx, q: Uint8Array) => {
    const path = ledger.qualificationAttestations.findPathForLeaf(q);
    if (!path) {
      throw new Error(
        'ProofMatch V2Q: no attestation found for this candidate on this vacancy — request one first',
      );
    }
    return [privateState, path];
  },
};
