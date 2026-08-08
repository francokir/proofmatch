/**
 * Sends NIGHT from the local devnet genesis wallet to a browser wallet.
 *
 * On `undeployed` our headless wallet IS the genesis wallet (see
 * `GENESIS_SEED` in `src/network.ts`), so it holds every minted NIGHT. A Lace
 * Midnight Preview wallet pointed at the same local network starts empty and
 * cannot pay fees until it holds NIGHT and has generated DUST.
 *
 * Takes a PUBLIC unshielded address and nothing else. It never asks for, reads
 * or prints a seed, a mnemonic or any secret — the community tooling that
 * funds by mnemonic is deliberately not used here.
 *
 * DUST is not sent: the recipient generates it from the NIGHT it now holds,
 * in the Lace UI. This script only removes the "no funds" blocker.
 *
 *   npx tsx scripts/fund-lace-wallet.ts mn_addr_undeployed1... [amount]
 */
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { WebSocket } from 'ws';

import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';

import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

/**
 * NIGHT is quoted in STAR on the wire: 1 NIGHT = 10^6 STAR.
 *
 * The argument is in whole NIGHT, deliberately. Passing raw STAR is how you
 * end up transferring 1000 STAR — a real, confirmed, on-chain transfer of
 * 0.001 NIGHT that every wallet UI rounds to 0.00 and that looks exactly like
 * a transfer that never arrived.
 */
const STAR_PER_NIGHT = 1_000_000n;
const DEFAULT_AMOUNT_NIGHT = 50_000n;
const TRANSACTION_TTL_MINUTES = 30;

function parseArguments(): { address: string; night: bigint; star: bigint } {
  const [address, rawAmount] = process.argv.slice(2);
  if (!address) {
    throw new Error(
      'Usage: npx tsx scripts/fund-lace-wallet.ts <unshielded-address> [amountInNight]\n' +
        'Pass the PUBLIC unshielded address of the Undeployed network. Never a seed or a mnemonic.',
    );
  }
  if (/\s/.test(address.trim()) || address.trim().split(' ').length > 1) {
    throw new Error('That looks like a mnemonic, not an address. This script only accepts a public address.');
  }
  const night = rawAmount ? BigInt(rawAmount) : DEFAULT_AMOUNT_NIGHT;
  if (night <= 0n) throw new Error('Amount must be a positive whole number of NIGHT.');
  return { address: address.trim(), night, star: night * STAR_PER_NIGHT };
}

async function main() {
  const { address, night, star } = parseArguments();
  const { network, config: networkConfig } = resolveNetwork();
  if (network !== 'undeployed') {
    throw new Error(
      `Refusing to run on '${network}'. This script spends the genesis wallet, which only exists on the local devnet.`,
    );
  }

  const receiverAddress = MidnightBech32m.parse(address).decode(UnshieldedAddress, network);

  const wallet = getOrCreateWallet(network);
  const walletCtx = await createWallet({ network, networkConfig, seed: wallet.seed });
  try {
    await walletCtx.wallet.waitForSyncedState();
    await persistWalletState(network, walletCtx);

    const ttl = new Date(Date.now() + TRANSACTION_TTL_MINUTES * 60 * 1_000);
    const recipe = await walletCtx.wallet.transferTransaction(
      [
        {
          type: 'unshielded',
          outputs: [{ type: unshieldedToken().raw, receiverAddress, amount: star }],
        },
      ],
      {
        shieldedSecretKeys: walletCtx.shieldedSecretKeys,
        dustSecretKey: walletCtx.dustSecretKey,
      },
      { ttl },
    );

    const signed = await walletCtx.wallet.signRecipe(recipe, (payload) =>
      walletCtx.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletCtx.wallet.finalizeRecipe(signed);
    const transactionId = await walletCtx.wallet.submitTransaction(finalized);

    console.log('');
    console.log('FUND_LACE_WALLET_OK');
    console.log(`recipient=${address}`);
    console.log(`amount=${night} NIGHT (${star} STAR)`);
    console.log(`tx=${transactionId}`);
    console.log('Next: generate DUST in the Lace UI before submitting any transaction.');
  } finally {
    await walletCtx.wallet.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
