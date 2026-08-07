import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { createMidnightProviders } from '../providers';

import { createProofMatchCompiledContract } from './contract';

export interface JoinProofMatchJobOptions {
  readonly contractAddress: string;
  /** Must match the ID supplied when this local contract handle was created. */
  readonly privateStateId: string;
}

/**
 * Reconnects to a deployed ProofMatchJob without invoking any circuit.
 * Omitting initialPrivateState is intentional: Midnight.js then rehydrates the
 * contract-scoped value already stored by the private-state provider.
 */
export async function joinProofMatchJob(
  providers: ReturnType<typeof createMidnightProviders>,
  zkConfigPath: string,
  options: JoinProofMatchJobOptions,
) {
  const compiledContract = createProofMatchCompiledContract(zkConfigPath);
  return findDeployedContract(providers as any, {
    contractAddress: options.contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: options.privateStateId,
  });
}
