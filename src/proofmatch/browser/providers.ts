import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { createLaceMidnightProvider, createLaceWalletProvider } from './lace';

export class NonLocalProverError extends Error {}

export function assertLocalProverUrl(proverServerUri: string): void {
  const hostname = new URL(proverServerUri).hostname.replace(/^\[|\]$/g, '');
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new NonLocalProverError('ProofMatch demo requires a local prover; refusing a remote prover URL.');
  }
}

export async function createLaceBrowserProviders(
  connected: ConnectedAPI,
  zkConfigBaseUrl: string,
  privateStateStoreName: string,
  privateStatePassword: string,
) {
  const configuration = await connected.getConfiguration();
  // Must happen before any wallet, ledger or contract call: the SDK keeps the
  // network id in module state that starts unset, and `getNetworkId()` throws
  // rather than defaulting. The headless path does this inside `createWallet`;
  // in the browser the value comes from the wallet, so it lands here.
  setNetworkId(configuration.networkId);
  if (!configuration.proverServerUri) throw new NonLocalProverError('Lace did not provide a prover server URI.');
  assertLocalProverUrl(configuration.proverServerUri);
  const walletProvider = await createLaceWalletProvider(connected, configuration.networkId);
  const midnightProvider = createLaceMidnightProvider(connected);
  const zkConfigProvider = new FetchZkConfigProvider(zkConfigBaseUrl);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId: (await connected.getUnshieldedAddress()).unshieldedAddress,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(configuration.indexerUri, configuration.indexerWsUri),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(configuration.proverServerUri, zkConfigProvider),
    walletProvider,
    midnightProvider,
  };
}
