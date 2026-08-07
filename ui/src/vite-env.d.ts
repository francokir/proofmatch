/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROOFMATCH_CONTRACT_ADDRESS?: string;
  readonly VITE_PROOFMATCH_NETWORK_ID?: string;
  readonly VITE_PROOFMATCH_ZK_CONFIG_BASE_URL?: string;
  readonly VITE_PROOFMATCH_PRIVATE_STATE_PASSWORD?: string;
  readonly VITE_PROOFMATCH_PRIVATE_STATE_STORE_NAME?: string;
}
