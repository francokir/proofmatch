import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

import type { CandidatePrivateInputs } from '../../candidate-private-state';
import type { ProofMatchPublicState } from '../public-state';
import { LaceConnectionError, type LaceWalletStatus } from './lace';
import { connectProofMatchLace, type LaceProofMatchClient } from './client';
import type {
  CandidateTermsInput,
  ProofFlowStatus,
  ProofMatchUiApi,
  PublicJobState,
  WalletStatus,
} from './ui-contract';

export interface CreateProofMatchUiApiOptions {
  readonly networkId: string;
  readonly zkConfigBaseUrl: string;
  readonly privateStateStoreName: string;
  readonly privateStatePassword: string;
}

export type ProofStatusListener = (status: ProofFlowStatus) => void;

export interface BrowserProofMatchUiApi extends ProofMatchUiApi {
  subscribeProofStatus(listener: ProofStatusListener): () => void;
}

function asContractAddress(contractAddress: string): ContractAddress {
  return contractAddress as ContractAddress;
}

function asCandidateInputs(terms: CandidateTermsInput): CandidatePrivateInputs {
  return {
    minimumCompensation: terms.minimumCompensation,
    availableWeeklyHours: terms.availableWeeklyHours,
  };
}

function projectPublicState(state: ProofMatchPublicState): PublicJobState {
  return {
    jobId: toHex(state.jobId),
    jobMaximumCompensation: state.jobMaximumCompensation,
    jobRequiredWeeklyHours: state.jobRequiredWeeklyHours,
    jobState: state.jobState === 0 ? 'Open' : 'Closed',
    matchCount: state.matchCount,
    usedNullifierCount: state.usedNullifiers.size(),
  };
}

/**
 * Browser-facing facade. It owns Lace and Midnight details while exposing only
 * the UI contract agreed with the product shell.
 */
export function createProofMatchUiApi(options: CreateProofMatchUiApiOptions): BrowserProofMatchUiApi {
  let client: LaceProofMatchClient | undefined;
  let walletStatus: WalletStatus = 'not_detected';
  let proofStatus: ProofFlowStatus = 'idle';
  let matchCountBeforeProof: bigint | undefined;
  const proofListeners = new Set<ProofStatusListener>();

  const setProofStatus = (nextStatus: ProofFlowStatus): void => {
    proofStatus = nextStatus;
    for (const listener of proofListeners) listener(proofStatus);
  };

  const requireClient = (): LaceProofMatchClient => {
    if (!client) throw new Error('Connect Lace before using ProofMatch.');
    return client;
  };

  const readPublicState = async (contractAddress: string): Promise<PublicJobState | null> => {
    if (!client) return null;
    const state = await client.readPublicState(contractAddress);
    return state === null ? null : projectPublicState(state);
  };

  return {
    wallet: {
      get status(): LaceWalletStatus {
        return walletStatus;
      },
      async connectWallet(): Promise<void> {
        walletStatus = 'connecting';
        try {
          client = await connectProofMatchLace(options);
          walletStatus = 'connected';
        } catch (error) {
          walletStatus = error instanceof LaceConnectionError ? error.status : 'connection_declined';
          throw error;
        }
      },
    },
    async prepareCandidatePrivateState(contractAddress: string, terms: CandidateTermsInput): Promise<void> {
      await requireClient().prepareCandidatePrivateState(asContractAddress(contractAddress), asCandidateInputs(terms));
    },
    async proveMatch(contractAddress: string): Promise<void> {
      const connectedClient = requireClient();
      const stateBeforeProof = await connectedClient.readPublicState(contractAddress);
      matchCountBeforeProof = stateBeforeProof?.matchCount;
      setProofStatus('proof_generating');
      try {
        await connectedClient.proveMatch(asContractAddress(contractAddress));
        setProofStatus('indexing_pending');
      } catch (error) {
        setProofStatus('failed');
        throw error;
      }
    },
    readPublicState,
    async refreshPublicState(contractAddress: string): Promise<PublicJobState | null> {
      const state = await readPublicState(contractAddress);
      if (proofStatus === 'indexing_pending' && state !== null && matchCountBeforeProof !== undefined && state.matchCount > matchCountBeforeProof) {
        setProofStatus('confirmed');
      }
      return state;
    },
    async resetCandidatePrivateState(contractAddress: string): Promise<void> {
      await requireClient().resetCandidatePrivateState(asContractAddress(contractAddress));
      matchCountBeforeProof = undefined;
      setProofStatus('idle');
    },
    subscribeProofStatus(listener: ProofStatusListener): () => void {
      listener(proofStatus);
      proofListeners.add(listener);
      return () => proofListeners.delete(listener);
    },
  };
}
