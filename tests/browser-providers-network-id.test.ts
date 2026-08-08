import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { createLaceBrowserProviders, NonLocalProverError } from '../src/proofmatch/browser/providers';

/**
 * The SDK keeps the network id in module-level state that starts unset, and
 * `getNetworkId()` throws instead of defaulting. The headless path sets it in
 * `createWallet`; the browser path has to take it from the wallet's own
 * configuration. Forgetting that produced:
 *
 *   Network ID has not been configured. Call setNetworkId() before any wallet
 *   or contract operation.
 *
 * only once a real transaction was attempted — long after connecting looked
 * like it had succeeded.
 */
const LACE_NETWORK_ID = 'undeployed';
const SOME_OTHER_NETWORK_ID = 'preprod';

/** Raised by the fake wallet to stop before the real providers are built. */
class ProbeReached extends Error {
  constructor(readonly networkIdAtCallTime: string | undefined) {
    super('probe');
  }
}

/**
 * Minimal ConnectedAPI that records the network id the SDK would see at the
 * moment the first wallet operation runs, then aborts.
 */
function fakeConnectedApi(configuration: { networkId: string; proverServerUri?: string }) {
  return {
    getConfiguration: async () => ({
      networkId: configuration.networkId,
      indexerUri: 'http://localhost:8088/api/v4/graphql',
      indexerWsUri: 'ws://localhost:8088/api/v4/graphql/ws',
      proverServerUri: configuration.proverServerUri,
    }),
    getShieldedAddresses: async () => {
      let observed: string | undefined;
      try {
        observed = getNetworkId();
      } catch {
        observed = undefined;
      }
      throw new ProbeReached(observed);
    },
    getUnshieldedAddress: async () => ({ unshieldedAddress: 'mn_addr_undeployed1probe' }),
  } as never;
}

async function networkIdWhenWalletIsFirstUsed(configuredNetworkId: string): Promise<string | undefined> {
  try {
    await createLaceBrowserProviders(
      fakeConnectedApi({ networkId: configuredNetworkId, proverServerUri: 'http://localhost:6300' }),
      'http://localhost:5173',
      'proofmatch-test-state',
      'ProofMatch-Local-Demo-7',
    );
  } catch (error) {
    if (error instanceof ProbeReached) return error.networkIdAtCallTime;
    throw error;
  }
  throw new Error('the fake wallet was never asked for an address, so the probe proved nothing');
}

describe('browser providers network id', () => {
  it('registers the wallet network id before the first wallet operation', async () => {
    // Deliberately leave a different network id in place first. If the browser
    // path stopped calling setNetworkId, this test would observe the stale
    // value instead of failing to find one — which is exactly how the bug hid
    // in a process where something else had already configured the SDK.
    setNetworkId(SOME_OTHER_NETWORK_ID);
    assert.equal(await networkIdWhenWalletIsFirstUsed(LACE_NETWORK_ID), LACE_NETWORK_ID);
  });

  it('takes the network id from the wallet rather than assuming a local devnet', async () => {
    setNetworkId(LACE_NETWORK_ID);
    assert.equal(await networkIdWhenWalletIsFirstUsed(SOME_OTHER_NETWORK_ID), SOME_OTHER_NETWORK_ID);
  });

  it('still refuses a non-local prover', async () => {
    await assert.rejects(
      () =>
        createLaceBrowserProviders(
          fakeConnectedApi({ networkId: LACE_NETWORK_ID, proverServerUri: 'https://prover.example.com' }),
          'http://localhost:5173',
          'proofmatch-test-state',
          'ProofMatch-Local-Demo-7',
        ),
      NonLocalProverError,
    );
  });

  it('still refuses a wallet that reports no prover at all', async () => {
    await assert.rejects(
      () =>
        createLaceBrowserProviders(
          fakeConnectedApi({ networkId: LACE_NETWORK_ID }),
          'http://localhost:5173',
          'proofmatch-test-state',
          'ProofMatch-Local-Demo-7',
        ),
      NonLocalProverError,
    );
  });
});
