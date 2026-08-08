/**
 * The browser credential store: round-trips the candidate's own credential
 * and holder key, discards garbage, and never mixes keys with the profile
 * store's namespace.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BROWSER_CREDENTIAL_KEY,
  createBrowserCredentialStore,
  type StoredCredential,
} from '../src/proofmatch-v2/browser/credential-store';
import { BROWSER_PROFILE_KEY } from '../src/proofmatch-v2/browser/profile-store';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    raw: () => data,
  };
}

const CREDENTIAL: StoredCredential = {
  credentialId: 'urn:uuid:11111111-2222-3333-4444-555555555555',
  holderDid: 'did:midnight:undeployed:' + 'ab'.repeat(32),
  englishLevelLabel: 'C1',
  issuerName: 'ProofMatch Demo Issuer',
  issuedAt: '2026-08-08T00:00:00.000Z',
  vc: {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    id: 'urn:uuid:11111111-2222-3333-4444-555555555555',
    type: ['VerifiableCredential', 'EnglishProficiencyCredential'],
    issuer: { id: 'did:midnight:undeployed:issuer', name: 'ProofMatch Demo Issuer' },
    credentialSubject: { candidateName: 'Demo Candidate', englishLevel: 'C1' },
    proof: { type: 'DataIntegrityProof', proofValue: 'AAA=' },
  },
  holderPrivateKeyPkcs8: Uint8Array.from({ length: 138 }, (_, i) => i % 256),
};

describe('browser credential store', () => {
  it('round-trips the credential including the holder key bytes', async () => {
    const storage = fakeStorage();
    const store = createBrowserCredentialStore(storage);
    await store.save(CREDENTIAL);
    const loaded = await store.load();
    assert.ok(loaded);
    assert.equal(loaded.credentialId, CREDENTIAL.credentialId);
    assert.equal(loaded.englishLevelLabel, 'C1');
    assert.equal(loaded.issuerName, 'ProofMatch Demo Issuer');
    assert.deepEqual(loaded.holderPrivateKeyPkcs8, CREDENTIAL.holderPrivateKeyPkcs8);
    assert.deepEqual(loaded.vc, CREDENTIAL.vc);
  });

  it('returns null when empty and after clear', async () => {
    const store = createBrowserCredentialStore(fakeStorage());
    assert.equal(await store.load(), null);
    await store.save(CREDENTIAL);
    await store.clear();
    assert.equal(await store.load(), null);
  });

  it('discards unreadable JSON instead of throwing', async () => {
    const storage = fakeStorage();
    storage.setItem(BROWSER_CREDENTIAL_KEY, '{not json');
    const store = createBrowserCredentialStore(storage);
    assert.equal(await store.load(), null);
    assert.equal(storage.raw().size, 0);
  });

  it('discards records missing the holder key', async () => {
    const storage = fakeStorage();
    storage.setItem(BROWSER_CREDENTIAL_KEY, JSON.stringify({ credentialId: 'x' }));
    const store = createBrowserCredentialStore(fakeStorage());
    assert.equal(await store.load(), null);
  });

  it('uses its own storage key, disjoint from the profile store', () => {
    assert.notEqual(BROWSER_CREDENTIAL_KEY, BROWSER_PROFILE_KEY);
  });
});
