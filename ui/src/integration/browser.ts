import { createProofMatchUiApi, type BrowserProofMatchUiApi } from '@proofmatch/browser-ui-api';

import type { ProofMatchUiApi } from '../domain/integration';

export interface ConfiguredProofMatchUi {
  readonly api: ProofMatchUiApi;
  readonly contractAddress: string;
}

function configuredEnvironment(environment: ImportMetaEnv): ConfiguredProofMatchUi | undefined {
  const contractAddress = environment.VITE_PROOFMATCH_CONTRACT_ADDRESS;
  const networkId = environment.VITE_PROOFMATCH_NETWORK_ID;
  const zkConfigBaseUrl = environment.VITE_PROOFMATCH_ZK_CONFIG_BASE_URL;
  const privateStatePassword = environment.VITE_PROOFMATCH_PRIVATE_STATE_PASSWORD;
  if (!contractAddress || !networkId || !zkConfigBaseUrl || !privateStatePassword) return undefined;

  const api: BrowserProofMatchUiApi = createProofMatchUiApi({
    networkId,
    zkConfigBaseUrl,
    privateStateStoreName: environment.VITE_PROOFMATCH_PRIVATE_STATE_STORE_NAME ?? 'proofmatch-browser-state',
    privateStatePassword,
  });
  return { api, contractAddress };
}

export const configuredProofMatchUi = configuredEnvironment(import.meta.env);
