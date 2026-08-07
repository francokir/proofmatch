/**
 * Real devnet smoke flow for one compatible ProofMatch candidate.
 *
 * It intentionally does not record this deployment in .midnight-state.json:
 * that file remains owned by the Hello World baseline.
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { WebSocket } from 'ws';

import { createMidnightProviders, LOCAL_PRIVATE_STATE_PASSWORD } from '../src/providers';
import { createProofMatchService } from '../src/proofmatch/service';
import { mapProofMatchError, type IntegrationErrorCode } from '../src/integration-state';
import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_STORE_NAME = 'proofmatch-candidate-state';
const PRIVATE_STATE_ID = 'proofmatchCandidateState';

async function waitForPublicState(
  service: ReturnType<typeof createProofMatchService>,
  contractAddress: string,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await service.refreshPublicState(contractAddress);
    if (state) return state;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Indexer did not expose the deployed ProofMatchJob within 30 seconds.');
}

async function expectRejected(action: () => Promise<unknown>, expectedCode: IntegrationErrorCode) {
  try {
    await action();
  } catch (error) {
    if (mapProofMatchError(error).code === expectedCode) return;
    throw error;
  }
  throw new Error(`Expected ProofMatch rejection '${expectedCode}', but the transaction succeeded.`);
}

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
      privateStateStoreName: PRIVATE_STATE_STORE_NAME,
      privateStatePassword: LOCAL_PRIVATE_STATE_PASSWORD,
    });
    const service = createProofMatchService(providers, zkConfigPath);

    console.log('proofmatch-e2e: deploying job');
    const deployment = await service.deployJob({
      jobId: Uint8Array.from(randomBytes(32)),
      jobMaximumCompensation: 1500n,
      jobRequiredWeeklyHours: 20n,
      privateStateId: PRIVATE_STATE_ID,
    });
    const contractAddress = deployment.deployTxData.public.contractAddress;
    console.log(`proofmatch-e2e: contractAddress=${contractAddress}`);

    console.log('proofmatch-e2e: preparing candidate private state');
    await service.prepareCandidatePrivateState(contractAddress, {
      minimumCompensation: 1200n,
      availableWeeklyHours: 24n,
    });
    providers.privateStateProvider.setContractAddress(contractAddress);
    const persistedCandidateState = await providers.privateStateProvider.get(PRIVATE_STATE_ID);
    if (!(persistedCandidateState?.secret instanceof Uint8Array) || persistedCandidateState.secret.length !== 32) {
      throw new Error('Candidate private state was not persisted as a 32-byte secret.');
    }
    console.log('proofmatch-e2e: joining deployed job');
    const job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
    const before = await waitForPublicState(service, contractAddress);
    console.log(`proofmatch-e2e: matchCountBefore=${before.matchCount}`);
    if (
      before.jobId.length !== 32 ||
      before.jobMaximumCompensation !== 1500n ||
      before.jobRequiredWeeklyHours !== 20n ||
      before.jobState !== 0
    ) {
      throw new Error('Public ProofMatchJob state did not match the deployed OPEN job terms.');
    }

    console.log('proofmatch-e2e: submitting compatible proveMatch');
    const compatibleTx = await service.proveMatch(job) as { public?: { txId?: string } };
    await persistWalletState(network, walletCtx);

    let after = before;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      after = await waitForPublicState(service, contractAddress);
      if (after.matchCount === before.matchCount + 1n) break;
    }
    if (after.matchCount !== before.matchCount + 1n) {
      throw new Error('matchCount did not increase by exactly one after proveMatch.');
    }
    if (after.usedNullifiers.size() !== before.usedNullifiers.size() + 1n) {
      throw new Error('usedNullifiers did not register exactly one nullifier after proveMatch.');
    }

    console.log('proofmatch-e2e: submitting duplicate proveMatch');
    await expectRejected(() => service.proveMatch(job), 'match_duplicate');
    const afterDuplicate = await waitForPublicState(service, contractAddress);
    if (
      afterDuplicate.matchCount !== after.matchCount ||
      afterDuplicate.usedNullifiers.size() !== after.usedNullifiers.size()
    ) {
      throw new Error('Duplicate proveMatch changed public state.');
    }

    console.log('proofmatch-e2e: deploying incompatible job');
    const incompatibleDeployment = await service.deployJob({
      jobId: Uint8Array.from(randomBytes(32)),
      jobMaximumCompensation: 1500n,
      jobRequiredWeeklyHours: 20n,
      privateStateId: PRIVATE_STATE_ID,
    });
    const incompatibleAddress = incompatibleDeployment.deployTxData.public.contractAddress;
    await service.prepareCandidatePrivateState(incompatibleAddress, {
      minimumCompensation: 1600n,
      availableWeeklyHours: 24n,
    });
    const incompatibleJob = await service.joinJob({
      contractAddress: incompatibleAddress,
      privateStateId: PRIVATE_STATE_ID,
    });
    const incompatibleBefore = await waitForPublicState(service, incompatibleAddress);
    await expectRejected(() => service.proveMatch(incompatibleJob), 'match_incompatible');
    const incompatibleAfter = await waitForPublicState(service, incompatibleAddress);
    if (
      incompatibleAfter.matchCount !== incompatibleBefore.matchCount ||
      incompatibleAfter.usedNullifiers.size() !== incompatibleBefore.usedNullifiers.size()
    ) {
      throw new Error('Incompatible proveMatch changed public state.');
    }

    console.log('PROOFMATCH_E2E_PASS');
    console.log(`contractAddress=${contractAddress}`);
    console.log(`compatibleTxId=${compatibleTx.public?.txId ?? 'unavailable'}`);
    console.log(`matchCountBefore=${before.matchCount}`);
    console.log(`matchCountAfter=${after.matchCount}`);
    console.log(`usedNullifierCount=${after.usedNullifiers.size()}`);
    console.log('duplicate=REJECTED');
    console.log('incompatible=REJECTED');
  } finally {
    await walletCtx.wallet.stop();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
