import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Binding, Proof, SignatureEnabled, Transaction, type TransactionId } from '@midnight-ntwrk/ledger-v8';
import type { UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { fromHex, parseCoinPublicKeyToHex, parseEncPublicKeyToHex, toHex } from '@midnight-ntwrk/midnight-js-utils';

export type LaceWalletStatus = 'not_detected' | 'connecting' | 'connection_declined' | 'connected';
type FinalizedTransaction = Transaction<SignatureEnabled, Proof, Binding>;

export class LaceConnectionError extends Error {
  constructor(readonly status: Exclude<LaceWalletStatus, 'connected' | 'connecting'>, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function isVersionFour(api: InitialAPI): boolean {
  return api.apiVersion.split('.', 1)[0] === '4';
}

/** Finds the preferred compatible Midnight Lace connector injected by the extension. */
export function findLaceInitialApi(windowObject: Window = window): InitialAPI | undefined {
  const wallets = windowObject.midnight;
  if (!wallets) return undefined;
  const preferred = wallets.mnLace;
  if (preferred && isVersionFour(preferred)) return preferred;
  return Object.values(wallets).find((api) => isVersionFour(api) && /lace/i.test(`${api.rdns} ${api.name}`));
}

export async function connectLace(networkId: string, windowObject: Window = window): Promise<ConnectedAPI> {
  const api = findLaceInitialApi(windowObject);
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
