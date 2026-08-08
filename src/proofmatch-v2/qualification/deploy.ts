import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import type { ProofMatchProviders } from '../../providers';
import type { WorkMode } from '../../../contracts/managed/proofmatch-job-v2q/contract/index.js';

import { createProofMatchV2QCompiledContract } from './contract';

export interface DeployProofMatchV2QJobOptions {
  readonly jobId: Uint8Array;
  readonly salaryBandFloor: bigint;
  readonly salaryBandCeiling: bigint;
  readonly jobRequiredWeeklyHours: bigint;
  readonly workMode: WorkMode;
  readonly officeX: bigint;
  readonly officeY: bigint;
  /** Only its hash is sealed on-chain; the secret never leaves the deployer. */
  readonly employerSecret: Uint8Array;
  /** 32-byte qualification type tag (see derivation.ts). */
  readonly qualificationType: Uint8Array;
  /** Minimum level on the type's scale (CEFR: 1..6). Public job term. */
  readonly requiredQualificationLevel: bigint;
  /** The verifier's PUBLIC key hash, obtained from the bridge's /verifier-info. */
  readonly qualificationVerifierKeyHash: Uint8Array;
  readonly privateStateId: string;
}

/**
 * Deploys a ProofMatchJobV2Q with its exact Compact constructor arguments.
 * The constructor calls no witness, so the private state can be prepared
 * afterwards against the real returned contract address.
 */
export async function deployProofMatchV2QJob(
  providers: ProofMatchProviders,
  zkConfigPath: string,
  options: DeployProofMatchV2QJobOptions,
) {
  const compiledContract = createProofMatchV2QCompiledContract(zkConfigPath);
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
      options.qualificationType,
      options.requiredQualificationLevel,
      options.qualificationVerifierKeyHash,
    ],
    privateStateId: options.privateStateId,
    initialPrivateState: {},
  });
}

export interface JoinProofMatchV2QJobOptions {
  readonly contractAddress: string;
  readonly privateStateId: string;
}

/**
 * Reconnects to a deployed ProofMatchJobV2Q without invoking a circuit.
 * `initialPrivateState` is omitted on purpose: Midnight.js then rehydrates the
 * contract-scoped value already held by the private-state provider.
 */
export async function joinProofMatchV2QJob(
  providers: ProofMatchProviders,
  zkConfigPath: string,
  options: JoinProofMatchV2QJobOptions,
) {
  const compiledContract = createProofMatchV2QCompiledContract(zkConfigPath);
  return findDeployedContract(providers as any, {
    contractAddress: options.contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: options.privateStateId,
  });
}
