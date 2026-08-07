import { createProofMatchUiApi, type BrowserProofMatchUiApi } from '@proofmatch/browser-ui-api';

import type { ProofMatchUiApi } from '../domain/integration';

export interface ConfiguredProofMatchUi {
  readonly api: ProofMatchUiApi;
  readonly contractAddress: string;
}

/** Names of the variables that must be set for the real integration to run. */
const REQUIRED_ENVIRONMENT = [
  'VITE_PROOFMATCH_CONTRACT_ADDRESS',
  'VITE_PROOFMATCH_NETWORK_ID',
  'VITE_PROOFMATCH_PRIVATE_STATE_PASSWORD',
] as const;

export function missingEnvironment(environment: ImportMetaEnv): string[] {
  return REQUIRED_ENVIRONMENT.filter((name) => !environment[name]);
}

function configuredEnvironment(environment: ImportMetaEnv): ConfiguredProofMatchUi | undefined {
  const contractAddress = environment.VITE_PROOFMATCH_CONTRACT_ADDRESS;
  const networkId = environment.VITE_PROOFMATCH_NETWORK_ID;
  const privateStatePassword = environment.VITE_PROOFMATCH_PRIVATE_STATE_PASSWORD;
  if (!contractAddress || !networkId || !privateStatePassword) return undefined;

  const api: BrowserProofMatchUiApi = createProofMatchUiApi({
    networkId,
    // Same origin as the page by default: the dev server serves the ZK assets
    // itself, and hardcoding a host is how you end up fetching keys
    // cross-origin from 127.0.0.1 while browsing localhost.
    zkConfigBaseUrl: environment.VITE_PROOFMATCH_ZK_CONFIG_BASE_URL || window.location.origin,
    privateStateStoreName: environment.VITE_PROOFMATCH_PRIVATE_STATE_STORE_NAME ?? 'proofmatch-browser-state',
    privateStatePassword,
  });
  return { api, contractAddress };
}

export const configuredProofMatchUi = configuredEnvironment(import.meta.env);

/**
 * Says out loud which mode the app is in.
 *
 * Silently falling back to the demo API is what made a missing `.env` look like
 * a missing wallet: the header said "Wallet not detected" while nothing had
 * ever asked the extension anything.
 */
if (!configuredProofMatchUi) {
  console.warn(
    `[ProofMatch] DEMO MODE — no Midnight, no Lace, no real ledger. Missing: ${missingEnvironment(import.meta.env).join(', ')}. Copy ui/.env.example to ui/.env.local and restart the dev server.`,
  );
} else {
  console.info('[ProofMatch] live mode — run proofmatchDiagnostics() in the console to inspect wallet detection.');
}

/**
 * Console helper for troubleshooting wallet detection.
 *
 * Returns only public identification metadata plus which mode the app is in.
 * It never connects, never reads an address and never touches private state.
 */
Object.defineProperty(window, 'proofmatchDiagnostics', {
  value: () => ({
    mode: configuredProofMatchUi ? 'live' : 'demo',
    missingEnvironment: missingEnvironment(import.meta.env),
    origin: window.location.origin,
    injectedWalletKeys: Object.keys((window as { midnight?: object }).midnight ?? {}),
    injectedWallets: configuredProofMatchUi?.api.wallet.injectedWallets() ?? [],
  }),
  writable: false,
  configurable: true,
});
