import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import * as ProofMatchJobV2 from '../../contracts/managed/proofmatch-job-v2/contract/index.js';

/**
 * Everything ProofMatchJobV2 keeps on-chain. Note what is NOT here: the
 * employer's exact cap, the candidate's salary, hours, location and radius.
 * Only the band, the commitments and the nullifiers are public.
 */
export interface ProofMatchV2PublicState {
  readonly jobId: Uint8Array;
  readonly salaryBandFloor: bigint;
  readonly salaryBandCeiling: bigint;
  readonly jobRequiredWeeklyHours: bigint;
  readonly jobWorkMode: ProofMatchJobV2.WorkMode;
  readonly officeX: bigint;
  readonly officeY: bigint;
  readonly employerAuthKey: Uint8Array;
  readonly jobState: ProofMatchJobV2.JobState;
  readonly budgetLocked: boolean;
  readonly employerBudgetCommitment: Uint8Array;
  readonly matchCount: bigint;
  readonly usedNullifiers: ProofMatchJobV2.Ledger['usedNullifiers'];
  readonly candidateSalaryCommitments: ProofMatchJobV2.Ledger['candidateSalaryCommitments'];
  readonly candidateHoursCommitments: ProofMatchJobV2.Ledger['candidateHoursCommitments'];
}

export async function readProofMatchV2PublicState(
  publicDataProvider: PublicDataProvider,
  contractAddress: string,
): Promise<ProofMatchV2PublicState | null> {
  const contractState = await publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;

  const ledger = ProofMatchJobV2.ledger(contractState.data);
  return {
    jobId: ledger.jobId,
    salaryBandFloor: ledger.salaryBandFloor,
    salaryBandCeiling: ledger.salaryBandCeiling,
    jobRequiredWeeklyHours: ledger.jobRequiredWeeklyHours,
    jobWorkMode: ledger.jobWorkMode,
    officeX: ledger.officeX,
    officeY: ledger.officeY,
    employerAuthKey: ledger.employerAuthKey,
    jobState: ledger.jobState,
    budgetLocked: ledger.budgetLocked,
    employerBudgetCommitment: ledger.employerBudgetCommitment,
    matchCount: ledger.matchCount,
    usedNullifiers: ledger.usedNullifiers,
    candidateSalaryCommitments: ledger.candidateSalaryCommitments,
    candidateHoursCommitments: ledger.candidateHoursCommitments,
  };
}
