import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import * as ProofMatchJob from '../../contracts/managed/proofmatch-job/contract/index.js';

export interface ProofMatchPublicState {
  readonly jobId: Uint8Array;
  readonly jobMaximumCompensation: bigint;
  readonly jobRequiredWeeklyHours: bigint;
  readonly jobState: ProofMatchJob.JobState;
  readonly matchCount: bigint;
  readonly usedNullifiers: ProofMatchJob.Ledger['usedNullifiers'];
}

export async function readProofMatchPublicState(
  publicDataProvider: PublicDataProvider,
  contractAddress: string,
): Promise<ProofMatchPublicState | null> {
  const contractState = await publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;

  const ledger = ProofMatchJob.ledger(contractState.data);
  return {
    jobId: ledger.jobId,
    jobMaximumCompensation: ledger.jobMaximumCompensation,
    jobRequiredWeeklyHours: ledger.jobRequiredWeeklyHours,
    jobState: ledger.jobState,
    matchCount: ledger.matchCount,
    usedNullifiers: ledger.usedNullifiers,
  };
}
