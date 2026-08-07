import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';

import type { NetworkConfig } from './network';
import type { WalletContext } from './wallet';

/** Provider surface shared by the Node and browser integrations. */
export type ProofMatchProviders = MidnightProviders;

export const LOCAL_PRIVATE_STATE_PASSWORD = 'Local-Devnet-Development-Placeholder-1';

export interface CreateMidnightProvidersOptions {
  readonly walletCtx: WalletContext;
  readonly networkConfig: NetworkConfig;
  readonly zkConfigPath: string;
  readonly privateStateStoreName: string;
  readonly privateStatePassword?: string;
  readonly readOnly?: boolean;
}

/** Builds the WalletProvider shape used by Midnight.js 4.1.x. */
export function createWalletProvider(walletCtx: WalletContext, readOnly = false) {
  return {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      if (readOnly) throw new Error('This provider is read-only and should not balance transactions');
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx: any) {
      if (readOnly) throw new Error('This provider is read-only and should not submit transactions');
      return walletCtx.wallet.submitTransaction(tx) as any;
    },
  };
}

/** Creates the provider bundle shared by deploy, reconnect/join and e2e checks. */
export function createMidnightProviders(options: CreateMidnightProvidersOptions) {
  const {
    walletCtx,
    networkConfig,
    zkConfigPath,
    privateStateStoreName,
    privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || LOCAL_PRIVATE_STATE_PASSWORD,
    readOnly,
  } = options;
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const walletProvider = createWalletProvider(walletCtx, readOnly);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}
