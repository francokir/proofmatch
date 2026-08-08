/**
 * Off-chain recomputation of the V2Q contract's hash derivations.
 *
 * These MUST stay byte-identical to `contracts/proofmatch-job-v2q.compact`:
 * the candidate derives Q locally and hands it to the verifier; the circuit
 * later recomputes the same Q from the private secret. A drift here means the
 * attested Q and the proven Q never match and every qualified match fails.
 *
 * Browser-safe: only compact-runtime hashing, no node imports.
 */
import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';

export const QUALIFICATION_DOMAIN = 'proofmatch:qualification:v1';
export const VERIFIER_KEY_DOMAIN = 'proofmatch:v2q:verifier-key:v1';

/** The one qualification type this MVP ships. */
export const ENGLISH_QUALIFICATION_TYPE_TEXT = 'proofmatch:qual:english:v1';

export function pad32(text: string): Uint8Array {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > 32) throw new Error(`ProofMatch: tag longer than 32 bytes: ${text}`);
  const padded = new Uint8Array(32);
  padded.set(encoded);
  return padded;
}

export const englishQualificationType = (): Uint8Array => pad32(ENGLISH_QUALIFICATION_TYPE_TEXT);

function hexToBytes32(hex: string, label: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`ProofMatch: ${label} must be 32 bytes of hex`);
  }
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}

/**
 * Q = persistentHash([domain, contractAddress, qualificationType, secret]).
 * Mirrors circuit `qualificationTag`, with kernel.self() replaced by the
 * known deployed address.
 */
export function deriveQualificationTag(
  contractAddress: string,
  qualificationType: Uint8Array,
  qualificationSecret: Uint8Array,
): Uint8Array {
  const t = new CompactTypeVector(4, new CompactTypeBytes(32));
  return persistentHash(t, [
    pad32(QUALIFICATION_DOMAIN),
    hexToBytes32(contractAddress, 'contract address'),
    qualificationType,
    qualificationSecret,
  ]);
}

/** Mirrors circuit `verifierKey`. This hash is public; the secret is not. */
export function deriveVerifierKeyHash(verifierSecret: Uint8Array): Uint8Array {
  const t = new CompactTypeVector(2, new CompactTypeBytes(32));
  return persistentHash(t, [pad32(VERIFIER_KEY_DOMAIN), verifierSecret]);
}
