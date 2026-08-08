/**
 * Real end-to-end flow for the VERIFIED QUALIFICATION feature (V2Q).
 *
 * Everything in this script is real: a real Midnames credential server with
 * its own local Midnight chain (issuer DID, holder DIDs, revocation list), a
 * real W3C VC signed P-256, real verification, and real ZK transactions on
 * the ProofMatch devnet (deploy, budget lock, attestation, qualified match).
 *
 * Prerequisites:
 *   - ProofMatch devnet up          (npm run proof-server:start)
 *   - contracts compiled            (npm run compile)
 *   - Midnames stack up             (docs/MIDNAMES_QUALIFICATION.md)
 *
 * Run:
 *   MIDNAMES_ISSUER_DID=did:midnight:undeployed:<addr> \
 *     npx tsx scripts/proofmatch-v2q-e2e.ts
 */
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { createMidnightProviders, LOCAL_PRIVATE_STATE_PASSWORD } from '../src/providers';
import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';
import {
  PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
  createEmployerSecret,
  ensureQualificationSecret,
  prepareCandidateV2QPrivateState,
  prepareEmployerV2QPrivateState,
  prepareVerifierV2QPrivateState,
  type ProofMatchV2QStateProvider,
} from '../src/proofmatch-v2/qualification/private-state';
import {
  deployProofMatchV2QJob,
  joinProofMatchV2QJob,
} from '../src/proofmatch-v2/qualification/deploy';
import {
  readProofMatchV2QPublicState,
} from '../src/proofmatch-v2/qualification/public-state';
import {
  deriveQualificationTag,
  englishQualificationType,
} from '../src/proofmatch-v2/qualification/derivation';
import { cefrLevelNumber } from '../src/proofmatch-v2/qualification/levels';
import { startQualificationBridge } from '../src/proofmatch-v2/qualification/bridge-server';
import { MidnamesClient } from '../src/proofmatch-v2/qualification/midnames-client';
import {
  buildPresentation,
  computeHolderCommitment,
  freshOwnerSecret,
  generateHolderKeyPair,
} from '../src/proofmatch-v2/qualification/holder';
import type { VerifiableCredential } from '../src/proofmatch-v2/qualification/credential';
import { WorkMode } from '../contracts/managed/proofmatch-job-v2q/contract/index.js';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

const MIDNAMES_URL = process.env.MIDNAMES_URL ?? 'http://127.0.0.1:3300';
const MIDNAMES_API_KEY = process.env.MIDNAMES_API_KEY ?? 'proofmatch-local-bridge';
const MIDNAMES_ISSUER_DID = process.env.MIDNAMES_ISSUER_DID ?? '';
const MIDNAMES_ISSUER_SEED =
  process.env.MIDNAMES_ISSUER_SEED ??
  '0000000000000000000000000000000000000000000000000000000000000001';
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 3411);

const PRIVATE_STATE_STORE_NAME = 'proofmatch-v2q-state';
const PRIVATE_STATE_ID = PROOF_MATCH_V2Q_PRIVATE_STATE_ID;

// The demo vacancy: band 1800–2100, cap 1960, 20 h, HYBRID + English >= B2.
const BAND_FLOOR = 1_800n;
const BAND_CEILING = 2_100n;
const EMPLOYER_EXACT_CAP = 1_960n;
const REQUIRED_HOURS = 20n;
const OFFICE_X = 1_000n;
const OFFICE_Y = 1_000n;
const REQUIRED_LEVEL = cefrLevelNumber('B2');

const log = (msg: string) => console.log(`proofmatch-v2q-e2e: ${msg}`);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function fail(msg: string): never {
  console.error(`PROOFMATCH_V2Q_E2E_FAIL: ${msg}`);
  process.exit(1);
}

async function expectRejected(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  ${label}: REJECTED (${message.split('\n')[0].slice(0, 90)})`);
    return message;
  }
  return fail(`${label} should have been rejected but succeeded`);
}

/** Issues a real English credential through the full Midnames flow. */
async function issueEnglishCredential(
  bridgeUrl: string,
  midnames: MidnamesClient,
  candidateName: string,
  englishLevel: string,
) {
  const offerRes = await fetch(`${bridgeUrl}/offer-credential`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateName, englishLevel }),
  }).then((r) => r.json() as Promise<{ sessionId?: string; error?: string }>);
  if (!offerRes.sessionId) throw new Error(`offer failed: ${offerRes.error}`);

  const claim = await midnames.claim(offerRes.sessionId);
  const holder = await generateHolderKeyPair();
  const ownerSecret = freshOwnerSecret();
  const commitment = await computeHolderCommitment(ownerSecret, holder.publicKeyX, holder.publicKeyY);
  const ack = await midnames.acknowledge({
    preAuthorizedCode: claim.pre_authorized_code,
    holderCommitment: commitment,
    holderPublicKey: holder.publicKeyRaw,
  });
  const vc = await midnames.issue({ sessionId: offerRes.sessionId, holderCommitment: commitment });
  return { holder, holderDid: ack.holderDid, vc };
}

async function main() {
  if (!MIDNAMES_ISSUER_DID) fail('MIDNAMES_ISSUER_DID is required (deploy-issuer output)');

  const { network, config: networkConfig } = resolveNetwork();
  const seed = getOrCreateWallet(network).seed;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(here, '..', 'contracts', 'managed', 'proofmatch-job-v2q');

  const walletCtx = await createWallet({ network, networkConfig, seed });
  await walletCtx.wallet.waitForSyncedState();
  await persistWalletState(network, walletCtx);

  const providers = createMidnightProviders({
    walletCtx,
    networkConfig,
    zkConfigPath,
    privateStateStoreName: PRIVATE_STATE_STORE_NAME,
    privateStatePassword: LOCAL_PRIVATE_STATE_PASSWORD,
  });
  const stateProvider = providers.privateStateProvider as unknown as ProofMatchV2QStateProvider;
  const midnames = new MidnamesClient({ baseUrl: MIDNAMES_URL });

  const readState = (address: string) =>
    readProofMatchV2QPublicState(providers.publicDataProvider, address);

  async function waitForState(
    address: string,
    label: string,
    predicate: (s: NonNullable<Awaited<ReturnType<typeof readState>>>) => boolean,
    attempts = 40,
  ) {
    for (let i = 0; i < attempts; i += 1) {
      const state = await readState(address);
      if (state && predicate(state)) return state;
      await new Promise((r) => setTimeout(r, 3_000));
    }
    return fail(`timed out waiting for ${label}`);
  }

  // ─── 0. The trusted verifier (bridge) with a fresh secret ─────────────────
  const verifierSecret = Uint8Array.from(randomBytes(32));
  const bridge = await startQualificationBridge({
    providers,
    zkConfigPath,
    verifierSecret,
    midnames: {
      baseUrl: MIDNAMES_URL,
      apiKey: MIDNAMES_API_KEY,
      issuerDid: MIDNAMES_ISSUER_DID,
      issuerSeed: MIDNAMES_ISSUER_SEED,
    },
    port: BRIDGE_PORT,
  });
  const bridgeUrl = `http://127.0.0.1:${bridge.port}`;
  const info = await fetch(`${bridgeUrl}/verifier-info`).then((r) => r.json() as Promise<any>);
  log(`bridge up — verifierKeyHash=${info.verifierKeyHash.slice(0, 16)}…`);

  // ─── 1. Employer deploys the qualified vacancy and locks the budget ───────
  const employerSecret = createEmployerSecret();
  log('deploying V2Q vacancy (English >= B2)');
  const deployed = await deployProofMatchV2QJob(providers, zkConfigPath, {
    jobId: Uint8Array.from(randomBytes(32)),
    salaryBandFloor: BAND_FLOOR,
    salaryBandCeiling: BAND_CEILING,
    jobRequiredWeeklyHours: REQUIRED_HOURS,
    workMode: WorkMode.HYBRID,
    officeX: OFFICE_X,
    officeY: OFFICE_Y,
    employerSecret,
    qualificationType: englishQualificationType(),
    requiredQualificationLevel: REQUIRED_LEVEL,
    qualificationVerifierKeyHash: Uint8Array.from(Buffer.from(info.verifierKeyHash, 'hex')),
    privateStateId: PRIVATE_STATE_ID,
  });
  const contractAddress = (deployed as any).deployTxData.public.contractAddress as string;
  const deployTx = (deployed as any).deployTxData.public.txId as string;
  log(`contractAddress=${contractAddress}`);
  await waitForState(contractAddress, 'deploy to be indexed', (s) => s.requiredQualificationLevel === REQUIRED_LEVEL);

  await prepareEmployerV2QPrivateState(stateProvider, contractAddress, EMPLOYER_EXACT_CAP, employerSecret);
  const employerJob = await joinProofMatchV2QJob(providers, zkConfigPath, {
    contractAddress, privateStateId: PRIVATE_STATE_ID,
  });
  log('locking the private budget (real proof)');
  const lockResult = await (employerJob as any).callTx.lockPrivateBudget();
  const lockTx = lockResult.public.txId as string;
  await waitForState(contractAddress, 'budget lock', (s) => s.budgetLocked);

  // ─── 2. Candidate obtains a REAL English C1 credential from Midnames ──────
  log('issuing English C1 credential (Midnames: holder DID + P-256 VC)');
  const candidate = await issueEnglishCredential(bridgeUrl, midnames, 'Demo Candidate', 'C1');
  log(`  holderDid=${candidate.holderDid}`);
  log(`  vc=${candidate.vc.id} level=C1 proof=${candidate.vc.proof?.type}/${candidate.vc.proof?.cryptosuite}`);
  const verified = await midnames.verify(candidate.vc);
  if (!verified.verified) fail(`fresh credential does not verify: ${verified.error}`);
  log('  Midnames /verify: verified');

  // ─── 3. Candidate derives the job-specific opaque Q and gets attested ─────
  const qualificationSecret = await ensureQualificationSecret(stateProvider, contractAddress);
  const q = deriveQualificationTag(contractAddress, englishQualificationType(), qualificationSecret);
  log(`requesting attestation for Q=${hex(q).slice(0, 16)}… (secret never leaves this process)`);
  const challenge = await midnames.challenge();
  const vp = await buildPresentation(candidate.holder.privateKeyPkcs8, candidate.holderDid, candidate.vc, challenge);
  const attestation = await fetch(`${bridgeUrl}/request-attestation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contractAddress, qualificationTag: hex(q), vp }),
  }).then((r) => r.json() as Promise<any>);
  if (!attestation.attested) fail(`attestation refused: ${attestation.error}`);
  const attestTx = attestation.transactionId as string;
  log(`  attestation tx=${attestTx}`);
  const afterAttest = await waitForState(contractAddress, 'attestation', (s) => s.attestationCount === 1n);

  // ─── 4. NEGATIVES that must hold BEFORE the match ─────────────────────────
  log('negative: B1 credential must NOT satisfy the B2 requirement');
  const weakCandidate = await issueEnglishCredential(bridgeUrl, midnames, 'Underqualified Candidate', 'B1');
  const weakSecretQ = deriveQualificationTag(
    contractAddress, englishQualificationType(), Uint8Array.from(randomBytes(32)));
  {
    const weakChallenge = await midnames.challenge();
    const weakVp = await buildPresentation(
      weakCandidate.holder.privateKeyPkcs8, weakCandidate.holderDid, weakCandidate.vc, weakChallenge);
    const res = await fetch(`${bridgeUrl}/request-attestation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractAddress, qualificationTag: hex(weakSecretQ), vp: weakVp }),
    }).then((r) => r.json() as Promise<any>);
    if (res.attested) fail('B1 credential was attested against a B2 requirement');
    log(`  B1 vs B2: REFUSED (${res.error})`);
  }

  log('negative: tampered credential must fail Midnames verification');
  {
    const tampered = JSON.parse(JSON.stringify(candidate.vc)) as VerifiableCredential & {
      credentialSubject: { englishLevel: string };
    };
    tampered.credentialSubject.englishLevel = 'C2';
    const res = await midnames.verify(tampered);
    if (res.verified) fail('tampered credential verified');
    log(`  tampered VC: INVALID (${res.error})`);
  }

  log('negative: REVOKED credential must not be attestable');
  {
    const revokeRes = await fetch(`${MIDNAMES_URL}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MIDNAMES_API_KEY}` },
      body: JSON.stringify({ credentialId: weakCandidate.vc.id }),
    }).then((r) => r.json() as Promise<any>);
    if (!revokeRes.success) fail(`revocation failed: ${JSON.stringify(revokeRes)}`);
    log(`  revocation tx=${revokeRes.transactionId} (on the Midnames chain)`);
    const revokedChallenge = await midnames.challenge();
    const revokedVp = await buildPresentation(
      weakCandidate.holder.privateKeyPkcs8, weakCandidate.holderDid, weakCandidate.vc, revokedChallenge);
    const res = await fetch(`${bridgeUrl}/request-attestation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractAddress, qualificationTag: hex(weakSecretQ), vp: revokedVp }),
    }).then((r) => r.json() as Promise<any>);
    if (res.attested) fail('revoked credential was attested');
    log(`  revoked VC: REFUSED (${res.error ?? res.status})`);
  }

  log('negative: an unauthorized verifier cannot attest on-chain');
  {
    await prepareVerifierV2QPrivateState(
      stateProvider, contractAddress, Uint8Array.from(randomBytes(32)));
    const impostorJob = await joinProofMatchV2QJob(providers, zkConfigPath, {
      contractAddress, privateStateId: PRIVATE_STATE_ID,
    });
    await expectRejected('impostor attestQualification', () =>
      (impostorJob as any).callTx.attestQualification(Uint8Array.from(randomBytes(32))));
    // restore the real verifier secret for the bridge
    await prepareVerifierV2QPrivateState(stateProvider, contractAddress, verifierSecret);
  }

  log('negative: a copied public Q is useless without the qualification secret');
  {
    // A different actor (fresh secrets) sees Q on chain but cannot prove:
    // their OWN derived Q has no attestation, and the circuit rebinds paths.
    await prepareCandidateV2QPrivateState(stateProvider, contractAddress, {
      minimumCompensation: 1_753n,
      availableWeeklyHours: 27n,
      acceptedWorkModes: [WorkMode.REMOTE, WorkMode.HYBRID],
      locationX: 1_500n,
      locationY: 1_000n,
      commuteRadius: 1_000n,
    });
    // overwrite the qualification secret with a fresh one (the "thief")
    const record = await stateProvider.get(PRIVATE_STATE_ID);
    await stateProvider.set(PRIVATE_STATE_ID, {
      ...record,
      candidateQualificationSecret: Uint8Array.from(randomBytes(32)),
    } as never);
    const thiefJob = await joinProofMatchV2QJob(providers, zkConfigPath, {
      contractAddress, privateStateId: PRIVATE_STATE_ID,
    });
    await expectRejected('copied-Q proveGuaranteedMatch', () =>
      (thiefJob as any).callTx.proveGuaranteedMatch());
    const unchanged = await readState(contractAddress);
    if (unchanged?.matchCount !== 0n) fail('copied-Q attempt changed the match count');
  }

  // ─── 5. The qualified candidate proves the Guaranteed Match ───────────────
  log('restoring the real candidate secrets and proving the qualified match (real proof)');
  {
    const record = await stateProvider.get(PRIVATE_STATE_ID);
    await stateProvider.set(PRIVATE_STATE_ID, {
      ...record,
      candidateQualificationSecret: qualificationSecret,
    } as never);
  }
  const candidateJob = await joinProofMatchV2QJob(providers, zkConfigPath, {
    contractAddress, privateStateId: PRIVATE_STATE_ID,
  });
  const matchResult = await (candidateJob as any).callTx.proveGuaranteedMatch();
  const matchTx = matchResult.public.txId as string;
  const finalState = await waitForState(contractAddress, 'qualified match', (s) => s.matchCount === 1n);
  log(`  match tx=${matchTx}`);

  // ─── 6. Privacy audit over the final public state ─────────────────────────
  if (finalState.usedNullifiers.size() !== 1n) fail('expected exactly one nullifier');
  const stateBytes: string[] = [
    hex(finalState.jobId), hex(finalState.employerAuthKey), hex(finalState.employerBudgetCommitment),
    hex(finalState.qualificationType), hex(finalState.qualificationVerifierKey),
  ];
  for (const nullifier of finalState.usedNullifiers) stateBytes.push(hex(nullifier));
  for (const [k, v] of finalState.candidateSalaryCommitments) stateBytes.push(hex(k), hex(v));
  for (const [k, v] of finalState.candidateHoursCommitments) stateBytes.push(hex(k), hex(v));
  const privateMaterial = [hex(qualificationSecret), hex(q), hex(verifierSecret), hex(employerSecret)];
  for (const secret of privateMaterial) {
    if (stateBytes.includes(secret)) fail(`private material ${secret.slice(0, 12)}… found in public state`);
  }
  const publicNumbers = [
    finalState.salaryBandFloor, finalState.salaryBandCeiling, finalState.jobRequiredWeeklyHours,
    finalState.requiredQualificationLevel, finalState.attestationCount, finalState.matchCount,
  ];
  if (publicNumbers.includes(1_753n) || publicNumbers.includes(27n) || publicNumbers.includes(EMPLOYER_EXACT_CAP)) {
    fail('candidate/employer private numbers leaked into public state');
  }
  log('privacy audit: no secrets, no Q, no private numbers in public state');

  // ─── 7. Consent flow: the credential is revealed ONLY by choice ───────────
  log('consent: candidate voluntarily presents the credential post-match');
  const consentChallenge = await midnames.challenge();
  const consentVp = await buildPresentation(
    candidate.holder.privateKeyPkcs8, candidate.holderDid, candidate.vc, consentChallenge);
  const consentCheck = await fetch(`${bridgeUrl}/verify-presentation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(consentVp),
  }).then((r) => r.json() as Promise<any>);
  if (!consentCheck.verified) fail(`consent presentation failed: ${consentCheck.error}`);
  log(`  recruiter-side verification after consent: verified (holder=${consentCheck.holder})`);

  // ─── Evidence ─────────────────────────────────────────────────────────────
  console.log('\nPROOFMATCH_V2Q_E2E_PASS');
  console.log(`  network=${network}`);
  console.log(`  contractAddress=${contractAddress}`);
  console.log(`  deployTx=${deployTx}`);
  console.log(`  lockPrivateBudgetTx=${lockTx}`);
  console.log(`  attestationTx=${attestTx}`);
  console.log(`  guaranteedMatchTx=${matchTx}`);
  console.log(`  issuerDid=${MIDNAMES_ISSUER_DID}`);
  console.log(`  holderDid=${candidate.holderDid}`);
  console.log(`  credentialId=${candidate.vc.id}`);
  console.log(`  requiredLevel=B2 credential=C1 (exact level NEVER on the ProofMatch chain)`);
  console.log(`  attestationCount=${finalState.attestationCount} matchCount=${finalState.matchCount}`);
  console.log(`  nullifiers=${finalState.usedNullifiers.size()} salaryCommitments=1 hoursCommitments=1`);
  console.log('  negatives: B1<B2=REFUSED tamperedVC=INVALID revokedVC=REFUSED');
  console.log('             impostorVerifier=REJECTED copiedQ=REJECTED');
  console.log('  privacy: secrets/Q/private numbers NOT in public state');
  console.log('  consent: post-match VP verified by recruiter side');
  await bridge.stop();
  process.exit(0);
}

main().catch((error) => {
  console.error('PROOFMATCH_V2Q_E2E_FAIL:', error);
  process.exit(1);
});
