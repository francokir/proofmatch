/**
 * Application service for ProofMatchJobV2Q — the chain-facing operations the
 * browser facade and the headless flows share. Mirrors ../service.ts for the
 * qualified-vacancy contract; the credential/VP orchestration lives above
 * (facade / bridge), never here.
 */
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

import type { ProofMatchProviders } from '../../providers';
import type { PrivateMatchProfile } from '../profile';
import { candidateInputsFromProfile } from '../service';
import {
  PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
  ensureQualificationSecret,
  prepareCandidateV2QPrivateState,
  prepareEmployerV2QPrivateState,
  type ProofMatchV2QStateProvider,
} from './private-state';
import {
  deployProofMatchV2QJob,
  joinProofMatchV2QJob,
  type DeployProofMatchV2QJobOptions,
  type JoinProofMatchV2QJobOptions,
} from './deploy';
import {
  readProofMatchV2QPublicState,
  type ProofMatchV2QPublicState,
} from './public-state';

export type { ProofMatchV2QPublicState };

export interface ProofMatchV2QService {
  deployJob(options: DeployProofMatchV2QJobOptions): Promise<unknown>;
  joinJob(options: JoinProofMatchV2QJobOptions): Promise<unknown>;
  readPublicState(contractAddress: string): Promise<ProofMatchV2QPublicState | null>;
  refreshPublicState(contractAddress: string): Promise<ProofMatchV2QPublicState | null>;
  prepareEmployerState(
    contractAddress: string,
    exactMaximumCompensation: bigint,
    employerSecret: Uint8Array,
  ): Promise<void>;
  prepareCandidateStateFromProfile(
    contractAddress: string,
    profile: PrivateMatchProfile,
  ): Promise<void>;
  /** Creates (or returns) the per-vacancy qualification secret. Never leaves. */
  qualificationSecret(contractAddress: string): Promise<Uint8Array>;
  lockPrivateBudget(job: unknown): Promise<unknown>;
  proveGuaranteedMatch(job: unknown): Promise<unknown>;
}

export function createProofMatchV2QService(
  providers: ProofMatchProviders,
  zkConfigPath: string,
): ProofMatchV2QService {
  const stateProvider = providers.privateStateProvider as unknown as ProofMatchV2QStateProvider;

  return {
    deployJob: (options) => deployProofMatchV2QJob(providers, zkConfigPath, options),
    joinJob: (options) => joinProofMatchV2QJob(providers, zkConfigPath, options),
    readPublicState: (contractAddress) =>
      readProofMatchV2QPublicState(providers.publicDataProvider, contractAddress),
    refreshPublicState: (contractAddress) =>
      readProofMatchV2QPublicState(providers.publicDataProvider, contractAddress),
    prepareEmployerState: async (contractAddress, exactMaximumCompensation, employerSecret) => {
      await prepareEmployerV2QPrivateState(
        stateProvider,
        contractAddress as ContractAddress,
        exactMaximumCompensation,
        employerSecret,
      );
    },
    prepareCandidateStateFromProfile: async (contractAddress, profile) => {
      await prepareCandidateV2QPrivateState(
        stateProvider,
        contractAddress as ContractAddress,
        candidateInputsFromProfile(profile),
      );
    },
    qualificationSecret: (contractAddress) =>
      ensureQualificationSecret(stateProvider, contractAddress as ContractAddress),
    lockPrivateBudget: (job) => (job as any).callTx.lockPrivateBudget(),
    proveGuaranteedMatch: (job) => (job as any).callTx.proveGuaranteedMatch(),
  };
}

export { PROOF_MATCH_V2Q_PRIVATE_STATE_ID };
