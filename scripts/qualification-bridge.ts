/**
 * Runs the ProofMatch credential bridge against the local devnet.
 *
 * Needs: the ProofMatch devnet up (npm run proof-server:start), the v2q
 * contract compiled (npm run compile), and the Midnames stack running (see
 * docs/MIDNAMES_QUALIFICATION.md).
 *
 * Run:  npx tsx scripts/qualification-bridge.ts
 *
 * Env (see scripts/qualification-bridge.env.example):
 *   MIDNAMES_URL          Midnames server        (default http://127.0.0.1:3300)
 *   MIDNAMES_API_KEY      /offer bearer token    (required)
 *   MIDNAMES_ISSUER_DID   trusted issuer DID     (required)
 *   MIDNAMES_ISSUER_SEED  issuer signing seed    (required; local dev value)
 *   PROOFMATCH_VERIFIER_SECRET  32-byte hex; generated+persisted when absent
 *   BRIDGE_PORT           default 3400
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { createMidnightProviders, LOCAL_PRIVATE_STATE_PASSWORD } from '../src/providers';
import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';
import { startQualificationBridge } from '../src/proofmatch-v2/qualification/bridge-server';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

const log = (msg: string) => console.log(`qualification-bridge: ${msg}`);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.resolve(HERE, '..', '.midnight-verifier-secret.seed');

function resolveVerifierSecret(): Uint8Array {
  const fromEnv = process.env.PROOFMATCH_VERIFIER_SECRET;
  if (fromEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      throw new Error('PROOFMATCH_VERIFIER_SECRET must be 32 bytes of hex');
    }
    return Uint8Array.from(Buffer.from(fromEnv, 'hex'));
  }
  if (fs.existsSync(SECRET_FILE)) {
    const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(stored)) return Uint8Array.from(Buffer.from(stored, 'hex'));
  }
  const fresh = randomBytes(32);
  fs.writeFileSync(SECRET_FILE, fresh.toString('hex') + '\n', { mode: 0o600 });
  log(`generated a new verifier secret at ${SECRET_FILE} (kept out of git)`);
  return Uint8Array.from(fresh);
}

async function main() {
  const midnamesUrl = process.env.MIDNAMES_URL ?? 'http://127.0.0.1:3300';
  const apiKey = process.env.MIDNAMES_API_KEY;
  const issuerDid = process.env.MIDNAMES_ISSUER_DID;
  const issuerSeed = process.env.MIDNAMES_ISSUER_SEED;
  if (!apiKey || !issuerDid || !issuerSeed) {
    throw new Error('MIDNAMES_API_KEY, MIDNAMES_ISSUER_DID and MIDNAMES_ISSUER_SEED are required');
  }
  const port = Number(process.env.BRIDGE_PORT ?? 3400);

  const { network, config: networkConfig } = resolveNetwork();
  const seed = getOrCreateWallet(network).seed;
  const zkConfigPath = path.resolve(HERE, '..', 'contracts', 'managed', 'proofmatch-job-v2q');

  log(`network=${network} — starting wallet`);
  const walletCtx = await createWallet({ network, networkConfig, seed });
  await walletCtx.wallet.waitForSyncedState();
  await persistWalletState(network, walletCtx);

  const providers = createMidnightProviders({
    walletCtx,
    networkConfig,
    zkConfigPath,
    privateStateStoreName: 'proofmatch-v2q-bridge-state',
    privateStatePassword: LOCAL_PRIVATE_STATE_PASSWORD,
  });

  const handle = await startQualificationBridge({
    providers,
    zkConfigPath,
    verifierSecret: resolveVerifierSecret(),
    midnames: { baseUrl: midnamesUrl, apiKey, issuerDid, issuerSeed },
    port,
  });

  log(`listening on http://127.0.0.1:${handle.port}`);
  log(`verifierKeyHash=${Buffer.from(handle.verifierKeyHash).toString('hex')}`);
  log('employers embed that hash at deploy time; candidates request attestations here');
}

main().catch((error) => {
  console.error('qualification-bridge failed:', error);
  process.exit(1);
});
