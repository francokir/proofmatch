/**
 * Thin HTTP client for the Midnames credential server (@midnames/vc).
 *
 * Browser-safe: plain fetch, no node imports, no secrets. Authenticated
 * issuer-side calls (/offer, /revoke) are deliberately ABSENT — those carry
 * the API key and belong to the bridge process (bridge-server.ts), never to
 * the browser bundle.
 */
import type { VerifiableCredential, VerifiablePresentation } from './credential';

export interface MidnamesClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

export interface ClaimInfo {
  readonly credential_issuer: string;
  readonly credential_types: readonly string[];
  readonly pre_authorized_code: string;
  readonly ttl: number;
  readonly authRequired: boolean;
}

export interface AckResult {
  readonly accepted?: boolean;
  readonly holderDid: string;
  readonly error?: string;
}

export interface VerifyResult {
  readonly verified: boolean;
  readonly status?: 'verified' | 'invalid' | 'revoked' | string;
  readonly holder?: string;
  readonly credentialId?: string;
  readonly error?: string;
}

export class MidnamesClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MidnamesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    // Wrapped instead of stored bare: a detached `fetch` invoked as
    // `this.fetchImpl(...)` gets the client as `this` and browsers reject it
    // with "Illegal invocation" (same failure cross-fetch-browser.ts shims).
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  private async post<T>(route: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  /** Wallet-side view of an offer created by the issuer. */
  async claim(sessionId: string): Promise<ClaimInfo> {
    const res = await this.fetchImpl(`${this.baseUrl}/claim/${sessionId}`);
    const parsed = (await res.json()) as ClaimInfo & { error?: string };
    if (parsed.error) throw new Error(`Midnames /claim failed: ${parsed.error}`);
    return parsed;
  }

  /** Deploys the holder DID on-chain (server-side) and binds the commitment. */
  async acknowledge(input: {
    preAuthorizedCode: string;
    holderCommitment: string;
    holderPublicKey: string;
  }): Promise<AckResult> {
    const parsed = await this.post<AckResult & { error?: string }>('/ack', input);
    if (parsed.error) throw new Error(`Midnames /ack failed: ${parsed.error}`);
    return parsed;
  }

  async issue(input: { sessionId: string; holderCommitment: string }): Promise<VerifiableCredential> {
    const parsed = await this.post<{ verifiableCredential?: VerifiableCredential; error?: string }>(
      '/issue',
      input,
    );
    if (parsed.error || !parsed.verifiableCredential) {
      throw new Error(`Midnames /issue failed: ${parsed.error ?? 'no credential returned'}`);
    }
    return parsed.verifiableCredential;
  }

  /** Signature + issuer DID + validity + on-chain revocation, all Midnames-side. */
  async verify(vc: VerifiableCredential<unknown>): Promise<VerifyResult> {
    return this.post<VerifyResult>('/verify', vc);
  }

  /** Single-use nonce for a Verifiable Presentation. */
  async challenge(): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/challenge`);
    const parsed = (await res.json()) as { challenge?: string; error?: string };
    if (!parsed.challenge) throw new Error(`Midnames /challenge failed: ${parsed.error ?? 'no nonce'}`);
    return parsed.challenge;
  }

  /** VC checks + holder binding against the holder DID document on-chain. */
  async verifyPresentation(vp: VerifiablePresentation<unknown>): Promise<VerifyResult> {
    return this.post<VerifyResult>('/verify-presentation', vp);
  }

  async revocationStatus(credentialId: string): Promise<{ isRevoked: boolean }> {
    const parsed = await this.post<{ isRevoked?: boolean; error?: string }>('/revocation-status', {
      credentialId,
    });
    if (typeof parsed.isRevoked !== 'boolean') {
      throw new Error(`Midnames /revocation-status failed: ${parsed.error ?? 'no status'}`);
    }
    return { isRevoked: parsed.isRevoked };
  }
}
