import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import * as ProofMatchJobV2Q from '../../../contracts/managed/proofmatch-job-v2q/contract/index.js';

/**
 * Everything ProofMatchJobV2Q keeps on-chain. Beyond V2: the qualification
 * REQUIREMENT (type, minimum level, verifier key hash) and the opaque
 * attestation tree. What is NOT here: the candidate's exact level, the
 * credential, any holder identity, and which attestation backed a match.
 */
export interface ProofMatchV2QPublicState {
  readonly jobId: Uint8Array;
  readonly salaryBandFloor: bigint;
  readonly salaryBandCeiling: bigint;
  readonly jobRequiredWeeklyHours: bigint;
  readonly jobWorkMode: ProofMatchJobV2Q.WorkMode;
  readonly officeX: bigint;
  readonly officeY: bigint;
  readonly employerAuthKey: Uint8Array;
  readonly jobState: ProofMatchJobV2Q.JobState;
  readonly budgetLocked: boolean;
  readonly employerBudgetCommitment: Uint8Array;
  readonly qualificationType: Uint8Array;
  readonly requiredQualificationLevel: bigint;
  readonly qualificationVerifierKey: Uint8Array;
  readonly attestationCount: bigint;
  readonly matchCount: bigint;
  readonly usedNullifiers: ProofMatchJobV2Q.Ledger['usedNullifiers'];
  readonly candidateSalaryCommitments: ProofMatchJobV2Q.Ledger['candidateSalaryCommitments'];
  readonly candidateHoursCommitments: ProofMatchJobV2Q.Ledger['candidateHoursCommitments'];
  readonly qualificationAttestations: ProofMatchJobV2Q.Ledger['qualificationAttestations'];
}

export async function readProofMatchV2QPublicState(
  publicDataProvider: PublicDataProvider,
  contractAddress: string,
): Promise<ProofMatchV2QPublicState | null> {
  const contractState = await publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;

  const ledger = ProofMatchJobV2Q.ledger(contractState.data);
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
    qualificationType: ledger.qualificationType,
    requiredQualificationLevel: ledger.requiredQualificationLevel,
    qualificationVerifierKey: ledger.qualificationVerifierKey,
    attestationCount: ledger.attestationCount,
    matchCount: ledger.matchCount,
    usedNullifiers: ledger.usedNullifiers,
    candidateSalaryCommitments: ledger.candidateSalaryCommitments,
    candidateHoursCommitments: ledger.candidateHoursCommitments,
    qualificationAttestations: ledger.qualificationAttestations,
  };
}
