/**
 * Candidate-side credential holder built ONLY on Web Crypto.
 *
 * The holder key pair, the owner secret and the signed Verifiable
 * Presentation all happen here, in the candidate's own runtime (browser or
 * node). No Midnames code is imported and no secret ever goes to ProofMatch's
 * bridge: the bridge sees a finished VP, never the holder's private key.
 *
 * P-256 detail that matters: Midnames verifies signatures with a strict
 * LOW-S rule, while Web Crypto's ECDSA does not normalise S. (r, s) and
 * (r, n - s) are both valid ECDSA signatures for the same message, so we
 * normalise locally — a pure bigint transform needing no key material.
 */
import type { VerifiableCredential, VerifiablePresentation } from './credential';

/** P-256 group order n. */
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_HALF_ORDER = P256_ORDER >> 1n;

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('ProofMatch: WebCrypto (crypto.subtle) is not available in this runtime');
  return s;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const bytesToBigInt = (bytes: Uint8Array): bigint => BigInt('0x' + (bytesToHex(bytes) || '0'));

function bigIntTo32Bytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** If s > n/2, replace it with n - s. Verification-equivalent, low-S normal form. */
export function normalizeLowS(signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) {
    throw new Error(`ProofMatch: expected 64-byte P-256 signature, got ${signature.length}`);
  }
  const s = bytesToBigInt(signature.slice(32));
  if (s <= P256_HALF_ORDER) return signature;
  const normalized = new Uint8Array(signature);
  normalized.set(bigIntTo32Bytes(P256_ORDER - s), 32);
  return normalized;
}

export interface HolderKeyPair {
  /** "0x04" + x + y — the uncompressed point Midnames' /ack expects. */
  readonly publicKeyRaw: string;
  readonly publicKeyX: string;
  readonly publicKeyY: string;
  /** PKCS8, so the key survives storage round-trips. */
  readonly privateKeyPkcs8: Uint8Array;
}

export async function generateHolderKeyPair(): Promise<HolderKeyPair> {
  const keyPair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
  const raw = new Uint8Array(await subtle().exportKey('raw', keyPair.publicKey));
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error('ProofMatch: unexpected P-256 public key export shape');
  }
  const hex = bytesToHex(raw.slice(1));
  return {
    publicKeyRaw: '0x04' + hex,
    publicKeyX: hex.slice(0, 64),
    publicKeyY: hex.slice(64, 128),
    privateKeyPkcs8: new Uint8Array(await subtle().exportKey('pkcs8', keyPair.privateKey)),
  };
}

export function freshOwnerSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * SHA-256(ownerSecret(32) || x(32) || y(32)) — the holder commitment the
 * Midnames issuance session binds the credential to.
 */
export async function computeHolderCommitment(
  ownerSecretHex: string,
  publicKeyX: string,
  publicKeyY: string,
): Promise<string> {
  const input = new Uint8Array(96);
  const put = (hex: string, offset: number) => {
    for (let i = 0; i < 32; i++) input[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  };
  put(ownerSecretHex, 0);
  put(publicKeyX, 32);
  put(publicKeyY, 64);
  const digest = await subtle().digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
}

/** Signs challenge+credentialId the way Midnames' VP verification expects. */
export async function signPresentation(
  privateKeyPkcs8: Uint8Array,
  challenge: string,
  credentialId: string,
): Promise<string> {
  const key = await subtle().importKey(
    'pkcs8',
    privateKeyPkcs8 as unknown as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const message = new TextEncoder().encode(challenge + credentialId);
  const signature = new Uint8Array(
    await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, message),
  );
  const normalized = normalizeLowS(signature);
  let binary = '';
  for (const byte of normalized) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function buildPresentation(
  privateKeyPkcs8: Uint8Array,
  holderDid: string,
  vc: VerifiableCredential<unknown>,
  challenge: string,
): Promise<VerifiablePresentation<unknown>> {
  const proofValue = await signPresentation(privateKeyPkcs8, challenge, vc.id ?? '');
  return {
    type: 'VerifiablePresentation',
    verifiableCredential: [vc],
    holder: holderDid,
    proof: {
      type: 'DataIntegrityProof',
      challenge,
      created: new Date().toISOString(),
      proofValue,
    },
  };
}
