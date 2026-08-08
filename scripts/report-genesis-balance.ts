/** Reports the local devnet genesis wallet balances. Diagnostic only, spends nothing. */
import { WebSocket } from 'ws';
import * as rx from 'rxjs';

import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet } from '../src/wallet';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

async function main() {
  const { network, config: networkConfig } = resolveNetwork();
  const wallet = getOrCreateWallet(network);
  const walletCtx = await createWallet({ network, networkConfig, seed: wallet.seed });
  try {
    await walletCtx.wallet.waitForSyncedState();
    const state = await rx.firstValueFrom(walletCtx.wallet.state());
    console.log('');
    console.log('GENESIS_BALANCE_REPORT');
    console.log(`network=${network}`);
    console.log(`synced=${state.isSynced}`);
    console.log(`unshielded.availableCoins=${state.unshielded.availableCoins.length}`);
    console.log(
      `unshielded.total=${state.unshielded.availableCoins.reduce((sum: bigint, c: { utxo: { value: bigint } }) => sum + c.utxo.value, 0n)}`,
    );
    console.log(`dust.availableCoins=${state.dust.availableCoins.length}`);
    console.log(`shielded.availableCoins=${state.shielded.availableCoins.length}`);
  } finally {
    await walletCtx.wallet.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
