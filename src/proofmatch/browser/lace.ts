import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Binding, Proof, SignatureEnabled, Transaction, type TransactionId } from '@midnight-ntwrk/ledger-v8';
import type { UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { fromHex, parseCoinPublicKeyToHex, parseEncPublicKeyToHex, toHex } from '@midnight-ntwrk/midnight-js-utils';

export type LaceWalletStatus =
  | 'not_detected'
  | 'detected'
  | 'connecting'
  | 'connection_declined'
  | 'connected';
type FinalizedTransaction = Transaction<SignatureEnabled, Proof, Binding>;

/** Extensions inject `window.midnight` asynchronously, so a single read can miss it. */
const INJECTION_POLL_TIMEOUT_MS = 3_000;
const INJECTION_POLL_INTERVAL_MS = 100;

export class LaceConnectionError extends Error {
  constructor(readonly status: Exclude<LaceWalletStatus, 'connected' | 'connecting' | 'detected'>, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Major version of the DApp Connector API a connector claims to speak.
 *
 * Defensive on purpose: `window.midnight` is populated by third-party
 * extensions, so an entry may be missing `apiVersion` or expose something that
 * is not a string. One malformed entry must not hide a perfectly good Lace.
 */
function majorApiVersion(api: Partial<InitialAPI> | undefined): string | undefined {
  const version = api?.apiVersion;
  return typeof version === 'string' ? version.split('.', 1)[0] : undefined;
}

function isVersionFour(api: Partial<InitialAPI> | undefined): boolean {
  return majorApiVersion(api) === '4';
}

/** Public metadata of one injected connector. Never carries keys or addresses. */
export interface InjectedWalletInfo {
  readonly key: string;
  readonly name?: string;
  readonly rdns?: string;
  readonly apiVersion?: string;
  readonly compatible: boolean;
}

/**
 * Lists what is injected under `window.midnight`, for diagnostics.
 *
 * Deliberately limited to the four public identification fields the connector
 * standard defines. It never calls `connect()`, never reads addresses and never
 * touches anything that could be a secret, so it is safe to surface in the UI
 * or log to the console.
 */
export function describeInjectedWallets(windowObject: Window = window): InjectedWalletInfo[] {
  const wallets = windowObject.midnight;
  if (!wallets || typeof wallets !== 'object') return [];
  return Object.entries(wallets).map(([key, api]) => {
    const candidate = api as Partial<InitialAPI> | undefined;
    return {
      key,
      name: typeof candidate?.name === 'string' ? candidate.name : undefined,
      rdns: typeof candidate?.rdns === 'string' ? candidate.rdns : undefined,
      apiVersion: typeof candidate?.apiVersion === 'string' ? candidate.apiVersion : undefined,
      compatible: isVersionFour(candidate),
    };
  });
}

/** Finds the preferred compatible Midnight Lace connector injected by the extension. */
export function findLaceInitialApi(windowObject: Window = window): InitialAPI | undefined {
  const wallets = windowObject.midnight;
  if (!wallets) return undefined;
  const preferred = wallets.mnLace;
  if (preferred && isVersionFour(preferred)) return preferred;
  return Object.values(wallets).find((api) => isVersionFour(api) && /lace/i.test(`${api?.rdns} ${api?.name}`));
}

/**
 * Same lookup, but tolerant of the extension injecting after the app mounts.
 *
 * Without this a page that renders faster than the extension reports
 * "not detected" for good, which looks exactly like a missing wallet.
 */
export async function waitForLaceInitialApi(
  windowObject: Window = window,
  timeoutMs: number = INJECTION_POLL_TIMEOUT_MS,
): Promise<InitialAPI | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const api = findLaceInitialApi(windowObject);
    if (api) return api;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, INJECTION_POLL_INTERVAL_MS));
  }
}

export async function connectLace(networkId: string, windowObject: Window = window): Promise<ConnectedAPI> {
  const api = await waitForLaceInitialApi(windowObject);
  if (!api) throw new LaceConnectionError('not_detected', 'No compatible Midnight Lace wallet was detected.');
  try {
    return await api.connect(networkId);
  } catch (error) {
    throw new LaceConnectionError('connection_declined', 'Lace connection was declined or failed.', { cause: error });
  }
}

export async function createLaceWalletProvider(connected: ConnectedAPI, networkId: string): Promise<WalletProvider> {
  const addresses = await connected.getShieldedAddresses();
  return {
    getCoinPublicKey: () => parseCoinPublicKeyToHex(addresses.shieldedCoinPublicKey, networkId as never),
    getEncryptionPublicKey: () => parseEncPublicKeyToHex(addresses.shieldedEncryptionPublicKey, networkId as never),
    async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
      const balanced = await connected.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced.tx));
    },
  };
}

export function createLaceMidnightProvider(connected: ConnectedAPI) {
  return {
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      await connected.submitTransaction(toHex(tx.serialize()));
      const [transactionId] = tx.identifiers();
      return transactionId;
    },
  };
}
