/**
 * Browser store for the candidate's English credential and holder key.
 *
 * What lives here is the CANDIDATE'S OWN wallet-side material: the signed VC
 * (which names the exact level) and the P-256 holder key that can present it.
 * It never syncs anywhere; recruiters and the bridge only ever receive what
 * the candidate explicitly presents. Same storage strategy as the profile
 * store: localStorage, injectable for tests, unreadable JSON discarded.
 *
 * Demo honesty note: production would keep the holder key in a real wallet or
 * non-extractable WebCrypto storage; localStorage is the hackathon tradeoff.
 */
import type { VerifiableCredential } from '../qualification/credential';

export interface StoredCredential {
  readonly credentialId: string;
  readonly holderDid: string;
  readonly englishLevelLabel: string;
  readonly issuerName: string;
  readonly issuedAt?: string;
  readonly vc: VerifiableCredential<unknown>;
  readonly holderPrivateKeyPkcs8: Uint8Array;
}

export interface CredentialStore {
  load(): Promise<StoredCredential | null>;
  save(credential: StoredCredential): Promise<StoredCredential>;
  clear(): Promise<void>;
}

export const BROWSER_CREDENTIAL_KEY = 'proofmatch.v2.english-credential';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

export function createBrowserCredentialStore(
  storage: StorageLike | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
  key: string = BROWSER_CREDENTIAL_KEY,
): CredentialStore {
  if (!storage) throw new Error('ProofMatch: no storage available for the credential store');

  return {
    async load(): Promise<StoredCredential | null> {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (
          typeof parsed.credentialId !== 'string' ||
          typeof parsed.holderDid !== 'string' ||
          typeof parsed.englishLevelLabel !== 'string' ||
          typeof parsed.issuerName !== 'string' ||
          typeof parsed.holderPrivateKeyPkcs8 !== 'string' ||
          typeof parsed.vc !== 'object' ||
          parsed.vc === null
        ) {
          storage.removeItem(key);
          return null;
        }
        return {
          credentialId: parsed.credentialId,
          holderDid: parsed.holderDid,
          englishLevelLabel: parsed.englishLevelLabel,
          issuerName: parsed.issuerName,
          issuedAt: typeof parsed.issuedAt === 'string' ? parsed.issuedAt : undefined,
          vc: parsed.vc as VerifiableCredential<unknown>,
          holderPrivateKeyPkcs8: fromBase64(parsed.holderPrivateKeyPkcs8),
        };
      } catch {
        storage.removeItem(key);
        return null;
      }
    },

    async save(credential: StoredCredential): Promise<StoredCredential> {
      storage.setItem(
        key,
        JSON.stringify({
          credentialId: credential.credentialId,
          holderDid: credential.holderDid,
          englishLevelLabel: credential.englishLevelLabel,
          issuerName: credential.issuerName,
          issuedAt: credential.issuedAt,
          vc: credential.vc,
          holderPrivateKeyPkcs8: toBase64(credential.holderPrivateKeyPkcs8),
        }),
      );
      return credential;
    },

    async clear(): Promise<void> {
      storage.removeItem(key);
    },
  };
}
