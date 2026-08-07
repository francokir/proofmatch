import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

import { CANDIDATE_PRIVATE_STATE_ID, type CandidatePrivateInputs } from '../../candidate-private-state';
import { createProofMatchService, type ProofMatchService } from '../service';
import { connectLace, type LaceWalletStatus } from './lace';
import { createLaceBrowserProviders } from './providers';

export type BrowserProofStatus =
  | 'idle'
  | 'proof_generating'
  | 'signature_pending'
  | 'transaction_pending'
  | 'indexing_pending'
  | 'confirmed'
  | 'failed';

export interface LaceProofMatchClient {
  readonly walletStatus: LaceWalletStatus;
  prepareCandidatePrivateState(contractAddress: ContractAddress, inputs: CandidatePrivateInputs): ReturnType<ProofMatchService['prepareCandidatePrivateState']>;
  joinJob(contractAddress: ContractAddress): Promise<void>;
  proveMatch(contractAddress: ContractAddress): Promise<unknown>;
  readPublicState: ProofMatchService['readPublicState'];
  refreshPublicState: ProofMatchService['refreshPublicState'];
  resetCandidatePrivateState: ProofMatchService['resetCandidatePrivateState'];
}

export async function connectProofMatchLace(options: {
  readonly networkId: string;
  readonly zkConfigBaseUrl: string;
  readonly privateStateStoreName: string;
  readonly privateStatePassword: string;
}): Promise<LaceProofMatchClient> {
  const connected = await connectLace(options.networkId);
  const providers = await createLaceBrowserProviders(
    connected,
    options.zkConfigBaseUrl,
    options.privateStateStoreName,
    options.privateStatePassword,
  );
  const service = createProofMatchService(providers, options.zkConfigBaseUrl);
  return {
    walletStatus: 'connected',
    prepareCandidatePrivateState: service.prepareCandidatePrivateState,
    joinJob: async (contractAddress) => {
      await service.joinJob({ contractAddress, privateStateId: CANDIDATE_PRIVATE_STATE_ID });
    },
    proveMatch: async (contractAddress) => {
      const job = await service.joinJob({ contractAddress, privateStateId: CANDIDATE_PRIVATE_STATE_ID });
      // The generic SDK handle erases the generated circuit-name union; the
      // ProofMatch wrapper restores the known zero-argument proveMatch call.
      return service.proveMatch(job as unknown as { callTx: { proveMatch(): Promise<unknown> } });
    },
    readPublicState: service.readPublicState,
    refreshPublicState: service.refreshPublicState,
    resetCandidatePrivateState: service.resetCandidatePrivateState,
  };
}
