import * as ProofMatchJob from '../../contracts/managed/proofmatch-job/contract/index.js';

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { proofMatchWitnesses } from './witnesses';

export const PROOF_MATCH_CONTRACT_TAG = 'proofmatch-job';

export function createProofMatchCompiledContract(zkConfigPath: string) {
  return CompiledContract.make(PROOF_MATCH_CONTRACT_TAG, ProofMatchJob.Contract).pipe(
    CompiledContract.withWitnesses(proofMatchWitnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}
