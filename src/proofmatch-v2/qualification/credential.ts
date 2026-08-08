/**
 * W3C Verifiable Credential shapes as issued/verified by the Midnames stack.
 * Structural subset — only the fields ProofMatch reads. The authoritative
 * validation always happens on the Midnames verification server, never here.
 */

export interface EnglishCredentialSubject {
  readonly id?: string;
  readonly candidateName: string;
  readonly englishLevel: string; // CEFR label: A1..C2
  readonly scale?: string;
  readonly assessmentMethod?: string;
}

export interface VerifiableCredential<TSubject = EnglishCredentialSubject> {
  readonly '@context': readonly string[];
  readonly id?: string;
  readonly type: readonly string[];
  readonly issuer: string | { readonly id: string; readonly name?: string };
  readonly issuanceDate?: string;
  readonly expirationDate?: string;
  readonly credentialSubject: TSubject;
  readonly proof?: {
    readonly type: string;
    readonly cryptosuite?: string;
    readonly created?: string;
    readonly proofPurpose?: string;
    readonly verificationMethod?: string;
    readonly proofValue?: string;
  };
  readonly [key: string]: unknown;
}

export interface VerifiablePresentation<TSubject = EnglishCredentialSubject> {
  readonly type: 'VerifiablePresentation';
  readonly verifiableCredential: readonly VerifiableCredential<TSubject>[];
  readonly holder: string;
  readonly proof: {
    readonly type: 'DataIntegrityProof';
    readonly challenge: string;
    readonly created: string;
    readonly proofValue: string;
  };
}

export const ENGLISH_CREDENTIAL_TYPE = 'EnglishProficiencyCredential';

export function issuerName(vc: VerifiableCredential<unknown>): string {
  return typeof vc.issuer === 'string' ? vc.issuer : (vc.issuer.name ?? vc.issuer.id);
}

export function isEnglishCredential(vc: VerifiableCredential<unknown>): boolean {
  return Array.isArray(vc.type) && vc.type.includes(ENGLISH_CREDENTIAL_TYPE);
}
