import { createProofMatchV2UiApi } from '@proofmatch/v2-ui-api';
import type { ProofMatchV2UiApi } from '../domain/v2';

/**
 * Wires the V2 facade from the environment, mirroring the V1 integration.
 *
 * V2 keeps its own private-state store: the two contracts hold different
 * records under different addresses, and sharing a store name would make a
 * demo reset of one silently disturb the other.
 */
export const V2_PRIVATE_STATE_STORE_NAME = 'proofmatch-v2-browser-state';

export interface ConfiguredProofMatchV2 {
  readonly api: ProofMatchV2UiApi;
  /** Vacancies known at startup. Deploying from the UI adds more. */
  readonly seedJobs: readonly string[];
}

function seedJobsFrom(environment: ImportMetaEnv): string[] {
  return (environment.VITE_PROOFMATCH_V2_JOBS ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}

function configuredEnvironment(environment: ImportMetaEnv): ConfiguredProofMatchV2 | undefined {
  const networkId = environment.VITE_PROOFMATCH_NETWORK_ID;
  const privateStatePassword = environment.VITE_PROOFMATCH_PRIVATE_STATE_PASSWORD;
  // No contract address is required: V2 can publish its own vacancy from the
  // recruiter panel, which is part of what the stage has to demonstrate.
  if (!networkId || !privateStatePassword) return undefined;

  return {
    api: createProofMatchV2UiApi({
      networkId,
      zkConfigBaseUrl: environment.VITE_PROOFMATCH_ZK_CONFIG_BASE_URL || window.location.origin,
      privateStateStoreName:
        environment.VITE_PROOFMATCH_V2_PRIVATE_STATE_STORE_NAME ?? V2_PRIVATE_STATE_STORE_NAME,
      privateStatePassword,
    }),
    seedJobs: seedJobsFrom(environment),
  };
}

export const configuredProofMatchV2 = configuredEnvironment(import.meta.env);
