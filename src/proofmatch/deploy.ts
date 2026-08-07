import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';

import type { ProofMatchProviders } from '../providers';

import { createProofMatchCompiledContract } from './contract';

export interface DeployProofMatchJobOptions {
  readonly jobId: Uint8Array;
  readonly jobMaximumCompensation: bigint;
  readonly jobRequiredWeeklyHours: bigint;
  /** Local identifier for the SDK private-state store, supplied by the caller. */
  readonly privateStateId: string;
}

/**
 * Deploys a ProofMatchJob with its exact Compact constructor arguments.
 * The constructor does not consume candidate private state. After deployment,
 * prepare candidate state using the real returned contract address before
 * invoking proveMatch.
 */
export async function deployProofMatchJob(
  providers: ProofMatchProviders,
  zkConfigPath: string,
  options: DeployProofMatchJobOptions,
) {
  const compiledContract = createProofMatchCompiledContract(zkConfigPath);
  return deployContract(providers as any, {
    compiledContract: compiledContract as any,
    args: [
      options.jobId,
      options.jobMaximumCompensation,
      options.jobRequiredWeeklyHours,
    ],
    privateStateId: options.privateStateId,
    initialPrivateState: {},
  });
}
