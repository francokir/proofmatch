import * as ProofMatchJobV2 from '../../contracts/managed/proofmatch-job-v2/contract/index.js';

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { proofMatchV2Witnesses } from './witnesses';

export const PROOF_MATCH_V2_CONTRACT_TAG = 'proofmatch-job-v2';

export function createProofMatchV2CompiledContract(zkConfigPath: string) {
  return CompiledContract.make(PROOF_MATCH_V2_CONTRACT_TAG, ProofMatchJobV2.Contract).pipe(
    CompiledContract.withWitnesses(proofMatchV2Witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}
