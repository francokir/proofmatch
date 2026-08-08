import * as ProofMatchJobV2Q from '../../../contracts/managed/proofmatch-job-v2q/contract/index.js';

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { proofMatchV2QWitnesses } from './witnesses';

export const PROOF_MATCH_V2Q_CONTRACT_TAG = 'proofmatch-job-v2q';

export function createProofMatchV2QCompiledContract(zkConfigPath: string) {
  return CompiledContract.make(PROOF_MATCH_V2Q_CONTRACT_TAG, ProofMatchJobV2Q.Contract).pipe(
    CompiledContract.withWitnesses(proofMatchV2QWitnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}
