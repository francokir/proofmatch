/**
 * ProofMatch credential bridge — the trusted verifier of the qualification
 * architecture, as one small server-side process:
 *
 *   candidate VP ──► Midnames verifies OFF-CHAIN (signature, issuer DID,
 *                    holder binding, validity, on-chain revocation)
 *              ──► bridge checks level >= vacancy requirement (read from chain)
 *              ──► bridge attests opaque Q on the V2Q contract (real ZK tx)
 *
 * Secrets held HERE and never in the browser: the Midnames issuer API key,
 * the issuer signing seed and the qualification verifier secret. The bridge
 * never sees a qualificationSecret — only derived Q values.
 *
 * Trust model (honest): the bridge is a trusted entity, exactly like the
 * verification server it fronts. The chain enforces that ONLY this bridge
 * (hash-secret authorization) can attest, and that a candidate can only USE
 * an attestation by proving knowledge of the secret behind Q.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { ProofMatchProviders } from '../../providers';
import { readProofMatchV2QPublicState } from './public-state';
import { joinProofMatchV2QJob } from './deploy';
import {
  PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
  prepareVerifierV2QPrivateState,
  type ProofMatchV2QStateProvider,
} from './private-state';
import { deriveVerifierKeyHash, englishQualificationType } from './derivation';
import { cefrLevelNumber, isCefrLabel, satisfiesLevel } from './levels';
import { ENGLISH_CREDENTIAL_TYPE, type VerifiablePresentation } from './credential';
import { MidnamesClient } from './midnames-client';

export interface QualificationBridgeOptions {
  readonly providers: ProofMatchProviders;
  readonly zkConfigPath: string;
  /** 32 bytes. Its hash is what employers seal as qualificationVerifierKey. */
  readonly verifierSecret: Uint8Array;
  readonly midnames: {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly issuerDid: string;
    readonly issuerSeed: string;
    readonly issuerName?: string;
  };
  readonly port: number;
}

export interface QualificationBridgeHandle {
  readonly port: number;
  readonly verifierKeyHash: Uint8Array;
  stop(): Promise<void>;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function hexToBytes(value: string, label: string): Uint8Array {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error(`${label} must be 32 bytes of hex`);
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export function extractEnglishLevel(vp: VerifiablePresentation<unknown>): string {
  const vc = vp.verifiableCredential?.[0];
  if (!vc) throw new Error('presentation carries no credential');
  if (!Array.isArray(vc.type) || !vc.type.includes(ENGLISH_CREDENTIAL_TYPE)) {
    throw new Error(`credential is not an ${ENGLISH_CREDENTIAL_TYPE}`);
  }
  const subject = vc.credentialSubject as { englishLevel?: unknown } | undefined;
  const level = subject?.englishLevel;
  if (!isCefrLabel(level)) throw new Error('credential carries no CEFR englishLevel');
  return level;
}

export function extractIssuerDid(vp: VerifiablePresentation<unknown>): string {
  const vc = vp.verifiableCredential?.[0];
  const issuer = vc?.issuer;
  const did = typeof issuer === 'string' ? issuer : issuer?.id;
  if (!did) throw new Error('credential carries no issuer');
  return did;
}

export async function startQualificationBridge(
  options: QualificationBridgeOptions,
): Promise<QualificationBridgeHandle> {
  const verifierKeyHash = deriveVerifierKeyHash(options.verifierSecret);
  const midnames = new MidnamesClient({ baseUrl: options.midnames.baseUrl });
  const englishType = englishQualificationType();
  const privateStateProvider = options.providers
    .privateStateProvider as unknown as ProofMatchV2QStateProvider;

  // One attestation at a time: the wallet submits sequentially anyway, and a
  // queue keeps two demo clicks from racing the same coins.
  let attestationChain: Promise<unknown> = Promise.resolve();

  async function attest(contractAddress: string, q: Uint8Array): Promise<string> {
    const run = async () => {
      await prepareVerifierV2QPrivateState(
        privateStateProvider,
        contractAddress,
        options.verifierSecret,
      );
      const job = await joinProofMatchV2QJob(options.providers, options.zkConfigPath, {
        contractAddress,
        privateStateId: PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
      });
      const result = await (job as any).callTx.attestQualification(q);
      return result.public.txId as string;
    };
    const next = attestationChain.then(run, run);
    attestationChain = next.catch(() => undefined);
    return next;
  }

  async function handleRequestAttestation(res: ServerResponse, body: string): Promise<void> {
    const parsed = JSON.parse(body) as {
      contractAddress?: string;
      qualificationTag?: string;
      vp?: VerifiablePresentation<unknown>;
    };
    if (!parsed.contractAddress || !parsed.qualificationTag || !parsed.vp) {
      json(res, 400, { error: 'contractAddress, qualificationTag and vp are required' });
      return;
    }

    // 1. The vacancy really is one of ours to attest, and carries the terms.
    const publicState = await readProofMatchV2QPublicState(
      options.providers.publicDataProvider,
      parsed.contractAddress,
    );
    if (!publicState) {
      json(res, 404, { error: 'vacancy not found on chain' });
      return;
    }
    if (hex(publicState.qualificationVerifierKey) !== hex(verifierKeyHash)) {
      json(res, 409, { error: 'this vacancy names a different qualification verifier' });
      return;
    }
    if (hex(publicState.qualificationType) !== hex(englishType)) {
      json(res, 409, { error: 'this vacancy requires a qualification type this bridge does not handle' });
      return;
    }

    // 2. Midnames verifies the presentation END TO END: credential signature
    //    against the issuer DID document on-chain, holder binding, validity
    //    window and the on-chain revocation list. Nothing is trusted locally.
    const verification = await midnames.verifyPresentation(parsed.vp);
    if (!verification.verified) {
      json(res, 403, {
        error: `credential verification failed: ${verification.error ?? verification.status}`,
        status: verification.status ?? 'invalid',
      });
      return;
    }

    // 3. Only credentials from the trusted demo issuer count. Midnames proves
    //    the signature matches the DID the credential NAMES; the bridge pins
    //    WHICH issuer DID this vacancy trusts.
    const issuerDid = extractIssuerDid(parsed.vp);
    if (issuerDid !== options.midnames.issuerDid) {
      json(res, 403, { error: `credential issuer ${issuerDid} is not the trusted issuer` });
      return;
    }

    // 4. The requirement itself: credential level >= vacancy minimum.
    const level = extractEnglishLevel(parsed.vp);
    const levelNumber = cefrLevelNumber(level);
    if (!satisfiesLevel(levelNumber, publicState.requiredQualificationLevel)) {
      json(res, 403, {
        error: `credential level ${level} does not satisfy the vacancy requirement`,
        // The exact level goes back to the CANDIDATE only — it never goes
        // on-chain and the recruiter never sees this response.
      });
      return;
    }

    // 5. Attest the opaque Q with a real proof. The exact level is not an
    //    input: the attestation IS the statement "requirement satisfied".
    const q = hexToBytes(parsed.qualificationTag, 'qualificationTag');
    const txId = await attest(parsed.contractAddress, q);
    const after = await readProofMatchV2QPublicState(
      options.providers.publicDataProvider,
      parsed.contractAddress,
    );
    json(res, 200, {
      attested: true,
      transactionId: txId,
      attestationCount: after ? after.attestationCount.toString() : undefined,
    });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }
      const url = req.url ?? '';
      if (req.method === 'GET' && url === '/health') {
        json(res, 200, { ok: true, issuerDid: options.midnames.issuerDid });
        return;
      }
      if (req.method === 'GET' && url === '/verifier-info') {
        json(res, 200, {
          verifierKeyHash: hex(verifierKeyHash),
          qualificationTypeTag: hex(englishType),
          issuerDid: options.midnames.issuerDid,
          midnamesUrl: options.midnames.baseUrl,
        });
        return;
      }
      if (req.method !== 'POST') {
        json(res, 404, { error: 'not found' });
        return;
      }
      const body = await readBody(req);
      switch (url) {
        case '/offer-credential': {
          // Issuer-side step: holds the API key so the browser never does.
          const parsed = JSON.parse(body) as { candidateName?: string; englishLevel?: string };
          if (!parsed.candidateName || !isCefrLabel(parsed.englishLevel)) {
            json(res, 400, { error: 'candidateName and a CEFR englishLevel are required' });
            return;
          }
          const offerRes = await fetch(`${options.midnames.baseUrl}/offer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.midnames.apiKey}`,
            },
            body: JSON.stringify({
              issuerDid: options.midnames.issuerDid,
              issuerSeed: options.midnames.issuerSeed,
              issuerName: options.midnames.issuerName ?? 'ProofMatch Demo Issuer',
              credential: {
                candidateName: parsed.candidateName,
                englishLevel: parsed.englishLevel,
              },
            }),
          });
          const offer = (await offerRes.json()) as any;
          if (offer.error) {
            json(res, 502, { error: `Midnames offer failed: ${offer.error}` });
            return;
          }
          const sessionId =
            offer.offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'][
              'pre-authorized_code'
            ];
          json(res, 200, { sessionId, claimUrl: offer.claimUrl });
          return;
        }
        case '/request-attestation':
          await handleRequestAttestation(res, body);
          return;
        case '/verify-credential': {
          json(res, 200, await midnames.verify(JSON.parse(body)));
          return;
        }
        case '/verify-presentation': {
          json(res, 200, await midnames.verifyPresentation(JSON.parse(body)));
          return;
        }
        default:
          json(res, 404, { error: 'not found' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(res, 500, { error: message });
    }
  }

  const server = createServer((req, res) => {
    void handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(options.port, '127.0.0.1', resolve));

  return {
    port: options.port,
    verifierKeyHash,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
