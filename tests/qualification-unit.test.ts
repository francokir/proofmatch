/**
 * Unit tests for the qualification modules that do NOT need a chain:
 * CEFR levels, Q derivation (cross-checked against the contract test
 * helpers), WebCrypto holder signatures (low-S), and the bridge's VP
 * extractors.
 */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  CEFR_LEVELS, cefrLevelLabel, cefrLevelNumber, isCefrLabel, satisfiesLevel,
} from '../src/proofmatch-v2/qualification/levels';
import {
  deriveQualificationTag, deriveVerifierKeyHash, englishQualificationType, pad32,
} from '../src/proofmatch-v2/qualification/derivation';
import {
  computeHolderCommitment, generateHolderKeyPair, normalizeLowS, signPresentation,
} from '../src/proofmatch-v2/qualification/holder';
import {
  extractEnglishLevel, extractIssuerDid,
} from '../src/proofmatch-v2/qualification/bridge-server';
import {
  ADDRESS_1, ADDRESS_2, ENGLISH_QUALIFICATION_TYPE, OTHER_QUALIFICATION_TYPE,
  QUALIFICATION_SECRET, VERIFIER_SECRET, expectedQualificationTag, expectedVerifierKeyBytes,
  testBytes,
} from './v2q-helpers.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('CEFR levels', () => {
  it('maps A1..C2 to 1..6 and back', () => {
    CEFR_LEVELS.forEach((label, i) => {
      assert.equal(cefrLevelNumber(label), BigInt(i + 1));
      assert.equal(cefrLevelLabel(BigInt(i + 1)), label);
    });
  });

  it('rejects unknown labels and out-of-range numbers', () => {
    assert.throws(() => cefrLevelNumber('Z9'));
    assert.throws(() => cefrLevelLabel(0n));
    assert.throws(() => cefrLevelLabel(7n));
    assert.equal(isCefrLabel('B2'), true);
    assert.equal(isCefrLabel('b2'), false);
    assert.equal(isCefrLabel(4), false);
  });

  it('C1 satisfies B2; B1 does not', () => {
    assert.equal(satisfiesLevel(cefrLevelNumber('C1'), cefrLevelNumber('B2')), true);
    assert.equal(satisfiesLevel(cefrLevelNumber('B1'), cefrLevelNumber('B2')), false);
    assert.equal(satisfiesLevel(cefrLevelNumber('B2'), cefrLevelNumber('B2')), true);
  });
});

describe('Q derivation (must stay byte-identical to the circuit)', () => {
  it('matches the contract-test recomputation exactly', () => {
    assert.equal(
      hex(deriveQualificationTag(ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET)),
      hex(expectedQualificationTag(ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET)),
    );
    assert.equal(
      hex(deriveVerifierKeyHash(VERIFIER_SECRET)),
      hex(expectedVerifierKeyBytes(VERIFIER_SECRET)),
    );
  });

  it('the english type tag equals the padded constant the tests use', () => {
    assert.equal(hex(englishQualificationType()), hex(ENGLISH_QUALIFICATION_TYPE));
  });

  it('Q differs per vacancy, per type and per secret', () => {
    const base = deriveQualificationTag(ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET);
    assert.notEqual(hex(base),
      hex(deriveQualificationTag(ADDRESS_2, ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET)));
    assert.notEqual(hex(base),
      hex(deriveQualificationTag(ADDRESS_1, OTHER_QUALIFICATION_TYPE, QUALIFICATION_SECRET)));
    assert.notEqual(hex(base),
      hex(deriveQualificationTag(ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, testBytes(77))));
  });

  it('rejects malformed addresses and oversized tags', () => {
    assert.throws(() => deriveQualificationTag('xyz', ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET));
    assert.throws(() => pad32('this-text-is-definitely-longer-than-32-bytes'));
  });
});

describe('WebCrypto holder (P-256, low-S)', () => {
  const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

  it('normalizeLowS leaves low-S untouched and flips high-S', () => {
    const low = new Uint8Array(64);
    low[63] = 1; // s = 1
    assert.deepEqual(normalizeLowS(low), low);

    const high = new Uint8Array(64);
    const sHigh = P256_ORDER - 5n; // way above n/2
    const sHex = sHigh.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) high[32 + i] = parseInt(sHex.slice(i * 2, i * 2 + 2), 16);
    const normalized = normalizeLowS(high);
    const sOut = BigInt('0x' + Buffer.from(normalized.slice(32)).toString('hex'));
    assert.equal(sOut, 5n);
  });

  it('signPresentation always yields low-S signatures that WebCrypto verifies', async () => {
    const holder = await generateHolderKeyPair();
    const raw = Buffer.from(holder.publicKeyRaw.slice(2), 'hex');
    const publicKey = await webcrypto.subtle.importKey(
      'raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    for (let i = 0; i < 20; i += 1) {
      const proofValue = await signPresentation(holder.privateKeyPkcs8, `challenge-${i}`, 'urn:uuid:x');
      const signature = Buffer.from(proofValue, 'base64');
      assert.equal(signature.length, 64);
      const s = BigInt('0x' + signature.subarray(32).toString('hex'));
      assert.ok(s <= P256_ORDER >> 1n, `signature ${i} is not low-S`);
      const message = new TextEncoder().encode(`challenge-${i}` + 'urn:uuid:x');
      assert.ok(await webcrypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, message));
    }
  });

  it('holder commitment is SHA-256(secret || x || y)', async () => {
    const holder = await generateHolderKeyPair();
    const secret = 'ab'.repeat(32);
    const commitment = await computeHolderCommitment(secret, holder.publicKeyX, holder.publicKeyY);
    const expected = createHash('sha256')
      .update(Buffer.concat([
        Buffer.from(secret, 'hex'),
        Buffer.from(holder.publicKeyX, 'hex'),
        Buffer.from(holder.publicKeyY, 'hex'),
      ]))
      .digest('hex');
    assert.equal(commitment, expected);
  });
});

describe('bridge VP extractors', () => {
  const vp = (over: Record<string, unknown> = {}) => ({
    type: 'VerifiablePresentation' as const,
    holder: 'did:midnight:undeployed:aa',
    proof: { type: 'DataIntegrityProof' as const, challenge: 'c', created: '', proofValue: '' },
    verifiableCredential: [{
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiableCredential', 'EnglishProficiencyCredential'],
      issuer: { id: 'did:midnight:undeployed:issuer', name: 'ProofMatch Demo Issuer' },
      credentialSubject: { candidateName: 'Demo', englishLevel: 'C1', id: 'did:midnight:undeployed:aa' },
      ...over,
    }],
  });

  it('extracts the CEFR level and the issuer DID', () => {
    assert.equal(extractEnglishLevel(vp() as never), 'C1');
    assert.equal(extractIssuerDid(vp() as never), 'did:midnight:undeployed:issuer');
  });

  it('rejects a presentation without an English credential', () => {
    assert.throws(() => extractEnglishLevel(vp({ type: ['VerifiableCredential', 'UniversityDegree'] }) as never),
      /not an EnglishProficiencyCredential/);
  });

  it('rejects a credential without a CEFR level', () => {
    assert.throws(
      () => extractEnglishLevel(vp({ credentialSubject: { candidateName: 'X', englishLevel: 'fluent' } }) as never),
      /no CEFR englishLevel/);
  });

  it('accepts string issuers too', () => {
    assert.equal(extractIssuerDid(vp({ issuer: 'did:midnight:undeployed:zz' }) as never),
      'did:midnight:undeployed:zz');
  });
});
