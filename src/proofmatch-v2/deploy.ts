import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import type { createMidnightProviders } from '../providers';
import type { WorkMode } from '../../contracts/managed/proofmatch-job-v2/contract/index.js';

import { createProofMatchV2CompiledContract } from './contract';

export interface DeployProofMatchV2JobOptions {
  readonly jobId: Uint8Array;
  /** Public band. The employer's exact cap stays private inside it. */
  readonly salaryBandFloor: bigint;
  readonly salaryBandCeiling: bigint;
  readonly jobRequiredWeeklyHours: bigint;
  readonly workMode: WorkMode;
  /** Office position on a local metre grid. Public. */
  readonly officeX: bigint;
  readonly officeY: bigint;
  /** Only its hash is sealed on-chain; the secret never leaves the deployer. */
  readonly employerSecret: Uint8Array;
  readonly privateStateId: string;
}

/**
 * Deploys a ProofMatchJobV2 with its exact Compact constructor arguments.
 * The constructor calls no witness, so the private state can be prepared
 * afterwards against the real returned contract address.
 */
export async function deployProofMatchV2Job(
  providers: ReturnType<typeof createMidnightProviders>,
  zkConfigPath: string,
  options: DeployProofMatchV2JobOptions,
) {
  const compiledContract = createProofMatchV2CompiledContract(zkConfigPath);
  return deployContract(providers as any, {
    compiledContract: compiledContract as any,
    args: [
      options.jobId,
      options.salaryBandFloor,
      options.salaryBandCeiling,
      options.jobRequiredWeeklyHours,
      options.workMode,
      options.officeX,
      options.officeY,
      options.employerSecret,
    ],
    privateStateId: options.privateStateId,
    initialPrivateState: {},
  });
}

export interface JoinProofMatchV2JobOptions {
  readonly contractAddress: string;
  readonly privateStateId: string;
}

/**
 * Reconnects to a deployed ProofMatchJobV2 without invoking a circuit.
 * `initialPrivateState` is omitted on purpose: Midnight.js then rehydrates the
 * contract-scoped value already held by the private-state provider.
 */
export async function joinProofMatchV2Job(
  providers: ReturnType<typeof createMidnightProviders>,
  zkConfigPath: string,
  options: JoinProofMatchV2JobOptions,
) {
  const compiledContract = createProofMatchV2CompiledContract(zkConfigPath);
  return findDeployedContract(providers as any, {
    contractAddress: options.contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: options.privateStateId,
  });
}
