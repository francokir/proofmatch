import { createMidnightProviders } from '../providers';
import {
  prepareCandidatePrivateState,
  type CandidatePrivateInputs,
  type CandidatePrivateStateProvider,
  type ProofMatchCandidatePrivateState,
} from '../candidate-private-state';

import { deployProofMatchJob, type DeployProofMatchJobOptions } from './deploy';
import { joinProofMatchJob, type JoinProofMatchJobOptions } from './join';
import { readProofMatchPublicState, type ProofMatchPublicState } from './public-state';

export interface ProofMatchService {
  deployJob(options: DeployProofMatchJobOptions): ReturnType<typeof deployProofMatchJob>;
  joinJob(options: JoinProofMatchJobOptions): ReturnType<typeof joinProofMatchJob>;
  readPublicState(contractAddress: string): Promise<ProofMatchPublicState | null>;
  refreshPublicState(contractAddress: string): Promise<ProofMatchPublicState | null>;
  prepareCandidatePrivateState(
    contractAddress: string,
    inputs: CandidatePrivateInputs,
  ): Promise<ProofMatchCandidatePrivateState>;
  proveMatch(job: { callTx: { proveMatch(): Promise<unknown> } }): Promise<unknown>;
}

/**
 * Candidate state is contract-scoped by the real deployed address. The service
 * never creates a global identity or a synthetic contract address.
 */
export function createProofMatchService(
  providers: ReturnType<typeof createMidnightProviders>,
  zkConfigPath: string,
): ProofMatchService {
  return {
    deployJob: (options) => deployProofMatchJob(providers, zkConfigPath, options),
    joinJob: (options) => joinProofMatchJob(providers, zkConfigPath, options),
    readPublicState: (contractAddress) =>
      readProofMatchPublicState(providers.publicDataProvider, contractAddress),
    refreshPublicState: (contractAddress) =>
      readProofMatchPublicState(providers.publicDataProvider, contractAddress),
    prepareCandidatePrivateState: (contractAddress, inputs) =>
      prepareCandidatePrivateState(
        providers.privateStateProvider as CandidatePrivateStateProvider,
        contractAddress,
        inputs,
      ),
    proveMatch: (job) => job.callTx.proveMatch(),
  };
}
