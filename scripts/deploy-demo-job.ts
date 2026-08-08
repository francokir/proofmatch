/**
 * Deploys one fresh ProofMatch V1 job for the browser demo and prints its address.
 *
 * The browser demo needs a job that actually exists on the devnet it is pointed
 * at. Devnet state does not survive a reset, so a hardcoded address in
 * `ui/.env.local` goes stale silently — the UI just reads nothing. Run this,
 * paste the printed address into `VITE_PROOFMATCH_CONTRACT_ADDRESS`, restart
 * the dev server.
 *
 * Terms match the demo happy path: a candidate asking 1200 for 24 weekly hours
 * fits a job paying up to 1500 that requires at least 20.
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { WebSocket } from 'ws';

import { createMidnightProviders, LOCAL_PRIVATE_STATE_PASSWORD } from '../src/providers';
import { createProofMatchService } from '../src/proofmatch/service';
import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

const JOB_MAXIMUM_COMPENSATION = 1_500n;
const JOB_REQUIRED_WEEKLY_HOURS = 20n;

async function main() {
  const { network, config: networkConfig } = resolveNetwork();
  const wallet = getOrCreateWallet(network);
  const walletCtx = await createWallet({ network, networkConfig, seed: wallet.seed });
  try {
    await walletCtx.wallet.waitForSyncedState();
    await persistWalletState(network, walletCtx);

    const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
    const zkConfigPath = path.resolve(scriptDirectory, '..', 'contracts', 'managed', 'proofmatch-job');
    const providers = createMidnightProviders({
      walletCtx,
      networkConfig,
      zkConfigPath,
      privateStateStoreName: 'proofmatch-demo-deployer-state',
      privateStatePassword: LOCAL_PRIVATE_STATE_PASSWORD,
    });
    const service = createProofMatchService(providers, zkConfigPath);

    console.log('deploy-demo-job: deploying');
    const deployment = await service.deployJob({
      jobId: Uint8Array.from(randomBytes(32)),
      jobMaximumCompensation: JOB_MAXIMUM_COMPENSATION,
      jobRequiredWeeklyHours: JOB_REQUIRED_WEEKLY_HOURS,
    });
    const contractAddress = deployment.deployTxData.public.contractAddress;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const state = await service.refreshPublicState(contractAddress);
      if (state) {
        console.log('');
        console.log(`VITE_PROOFMATCH_CONTRACT_ADDRESS=${contractAddress}`);
        console.log(
          `max=${state.jobMaximumCompensation} requiredHours=${state.jobRequiredWeeklyHours} matchCount=${state.matchCount}`,
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error('Indexer did not expose the deployed job within 30 seconds.');
  } finally {
    await walletCtx.wallet.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
