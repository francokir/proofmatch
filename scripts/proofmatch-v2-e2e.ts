/**
 * Real devnet end-to-end flow for ProofMatchJobV2.
 *
 * Proves the whole V2 core against a live chain: deploy, employer budget lock
 * with a real ZK proof, guaranteed match with a real ZK proof, and every
 * rejection path. Nothing here is simulated.
 *
 * It deliberately does not touch `.midnight-state.json`: that file belongs to
 * the Hello World baseline. V1's own e2e scripts stay untouched.
 *
 * Run with: npm run test:e2e:v2   (needs the devnet up and `npm run compile`)
 */
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { createMidnightProviders, LOCAL_PRIVATE_STATE_PASSWORD } from '../src/providers';
import { createProofMatchV2Service } from '../src/proofmatch-v2/service';
import { createEmployerSecret, PROOF_MATCH_V2_PRIVATE_STATE_ID } from '../src/proofmatch-v2/private-state';
import { WorkMode } from '../contracts/managed/proofmatch-job-v2/contract/index.js';
import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_STORE_NAME = 'proofmatch-v2-state';
const PRIVATE_STATE_ID = PROOF_MATCH_V2_PRIVATE_STATE_ID;

// The demo vacancy: public band 1800–2100, private employer cap 1960.
const BAND_FLOOR = 1_800n;
const BAND_CEILING = 2_100n;
const EMPLOYER_EXACT_CAP = 1_960n;
const REQUIRED_HOURS = 20n;
const OFFICE_X = 1_000n;
const OFFICE_Y = 1_000n;

const log = (msg: string) => console.log(`proofmatch-v2-e2e: ${msg}`);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function fail(msg: string): never {
  console.error(`PROOFMATCH_V2_E2E_FAIL: ${msg}`);
  process.exit(1);
}

/** Asserts that an action is rejected, and reports the reason it gave. */
async function expectRejected(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  ${label}: REJECTED (${message.split('\n')[0].slice(0, 70)})`);
    return message;
  }
  return fail(`${label} should have been rejected but succeeded`);
}

async function main() {
  const { network, config: networkConfig } = resolveNetwork();
  const seed = getOrCreateWallet(network).seed;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(here, '..', 'contracts', 'managed', 'proofmatch-job-v2');

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
  const service = createProofMatchV2Service(providers, zkConfigPath);

  // ─── 1. Deploy ────────────────────────────────────────────────────────────
  const employerSecret = createEmployerSecret();
  log('deploying V2 job');
  const deployed = await service.deployJob({
    jobId: Uint8Array.from(randomBytes(32)),
    salaryBandFloor: BAND_FLOOR,
    salaryBandCeiling: BAND_CEILING,
    jobRequiredWeeklyHours: REQUIRED_HOURS,
    workMode: WorkMode.HYBRID,
    officeX: OFFICE_X,
    officeY: OFFICE_Y,
    employerSecret,
    privateStateId: PRIVATE_STATE_ID,
  });
  const contractAddress = (deployed as any).deployTxData.public.contractAddress as string;
  log(`contractAddress=${contractAddress}`);

  // ─── 2. Public state before anything happens ──────────────────────────────
  let publicState = null;
  for (let attempt = 0; attempt < 30 && publicState === null; attempt += 1) {
    publicState = await service.refreshPublicState(contractAddress);
    if (publicState === null) await new Promise((r) => setTimeout(r, 1_000));
  }
  if (!publicState) fail('indexer did not expose the deployed V2 job within 30 seconds');

  if (publicState.budgetLocked) fail('budget must not be locked before lockPrivateBudget');
  if (publicState.salaryBandFloor !== BAND_FLOOR) fail('band floor mismatch on chain');
  if (publicState.salaryBandCeiling !== BAND_CEILING) fail('band ceiling mismatch on chain');
  log(`band=${publicState.salaryBandFloor}-${publicState.salaryBandCeiling} budgetLocked=false`);

  // ─── 3. Employer cap outside the band must be rejected ────────────────────
  await service.prepareEmployerState(contractAddress, BAND_CEILING + 1n, employerSecret);
  let job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
  await expectRejected('employer cap above ceiling', () => service.lockPrivateBudget(job as any));

  // ─── 4. Unauthorized lock must be rejected ────────────────────────────────
  await service.prepareEmployerState(contractAddress, EMPLOYER_EXACT_CAP, createEmployerSecret());
  job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
  await expectRejected('unauthorized employer', () => service.lockPrivateBudget(job as any));

  // ─── 5. Real lockPrivateBudget ────────────────────────────────────────────
  const employerState = await service.prepareEmployerState(
    contractAddress, EMPLOYER_EXACT_CAP, employerSecret);
  job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
  log('submitting real lockPrivateBudget proof');
  const lockTx: any = await service.lockPrivateBudget(job as any);
  const lockTxId = lockTx?.public?.txId ?? '(no txId)';
  log(`lockPrivateBudget tx=${lockTxId}`);

  publicState = await service.refreshPublicState(contractAddress);
  if (!publicState?.budgetLocked) fail('budgetLocked must be true after locking');
  if (publicState.employerBudgetCommitment.every((b) => b === 0)) {
    fail('employer budget commitment must be published');
  }
  log(`budgetLocked=true commitment=${hex(publicState.employerBudgetCommitment).slice(0, 24)}...`);

  // ─── 6. Candidate paths that must be rejected ─────────────────────────────
  // Values chosen so none of them collides with a legitimately public number
  // (band 1800/2100, required hours 20, office 1000/1000). Otherwise the
  // privacy audit below would raise a false positive and prove nothing.
  const baseCandidate = {
    minimumCompensation: 1_753n,
    availableWeeklyHours: 27n,
    acceptedWorkModes: [WorkMode.REMOTE, WorkMode.HYBRID] as const,
    locationX: 1_437n,
    locationY: 1_291n,
    commuteRadius: 1_234n,
  };

  const rejectionCases = [
    ['salary in negotiation zone', { ...baseCandidate, minimumCompensation: BAND_FLOOR + 1n }],
    ['hours below requirement', { ...baseCandidate, availableWeeklyHours: REQUIRED_HOURS - 1n }],
    ['work mode not accepted', { ...baseCandidate, acceptedWorkModes: [WorkMode.REMOTE] as const }],
    ['commute out of range', { ...baseCandidate, locationX: 99_000n, commuteRadius: 500n }],
  ] as const;

  for (const [label, inputs] of rejectionCases) {
    await service.prepareCandidateState(contractAddress, inputs as never);
    job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
    await expectRejected(label, () => service.proveGuaranteedMatch(job as any));
  }

  publicState = await service.refreshPublicState(contractAddress);
  if (publicState!.matchCount !== 0n) fail('rejected attempts must not increment matchCount');
  if (publicState!.usedNullifiers.size() !== 0n) fail('rejected attempts must not register a nullifier');
  log('after all rejections: matchCount=0 nullifiers=0');

  // ─── 7. Real Guaranteed Match ─────────────────────────────────────────────
  const candidateState = await service.prepareCandidateState(contractAddress, baseCandidate as never);
  const preview = service.previewPrivateFit(publicState!, baseCandidate as never);
  log(`local preview: salaryFit=${preview.salaryFit} canProve=${preview.canProveGuaranteedMatch}`);
  if (!preview.canProveGuaranteedMatch) fail('local preview should predict a guaranteed match');

  job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
  log('submitting real proveGuaranteedMatch proof');
  const matchTx: any = await service.proveGuaranteedMatch(job as any);
  const matchTxId = matchTx?.public?.txId ?? '(no txId)';
  log(`proveGuaranteedMatch tx=${matchTxId}`);

  publicState = await service.refreshPublicState(contractAddress);
  if (publicState!.matchCount !== 1n) fail(`matchCount should be 1, got ${publicState!.matchCount}`);
  if (publicState!.usedNullifiers.size() !== 1n) fail('exactly one nullifier should be registered');
  if (publicState!.candidateSalaryCommitments.size() !== 1n) fail('salary commitment missing');
  if (publicState!.candidateHoursCommitments.size() !== 1n) fail('hours commitment missing');

  const nullifier = [...publicState!.usedNullifiers][0];
  if (!publicState!.candidateSalaryCommitments.member(nullifier)) {
    fail('salary commitment must be keyed by the match nullifier');
  }

  // ─── 8. Duplicate must be rejected ────────────────────────────────────────
  job = await service.joinJob({ contractAddress, privateStateId: PRIVATE_STATE_ID });
  await expectRejected('duplicate match', () => service.proveGuaranteedMatch(job as any));

  publicState = await service.refreshPublicState(contractAddress);
  if (publicState!.matchCount !== 1n) fail('duplicate must not increment matchCount');

  // ─── 9. Privacy audit against the real ledger ─────────────────────────────
  const ledgerNumbers = [
    publicState!.salaryBandFloor, publicState!.salaryBandCeiling,
    publicState!.jobRequiredWeeklyHours, publicState!.officeX, publicState!.officeY,
    publicState!.matchCount,
  ];
  const privateValues: ReadonlyArray<readonly [string, bigint]> = [
    ['employer exact cap', EMPLOYER_EXACT_CAP],
    ['candidate salary', candidateState.candidateMinimumCompensation!],
    ['candidate hours', candidateState.candidateAvailableWeeklyHours!],
    ['candidate location X', candidateState.candidateLocationX!],
    ['candidate commute radius', candidateState.candidateCommuteRadius!],
  ];
  for (const [label, value] of privateValues) {
    if (ledgerNumbers.includes(value)) fail(`${label} (${value}) is visible in public ledger state`);
  }

  const ledgerBytes = [
    hex(publicState!.jobId), hex(publicState!.employerAuthKey),
    hex(publicState!.employerBudgetCommitment),
    ...[...publicState!.usedNullifiers].map(hex),
  ];
  for (const [label, secret] of [
    ['employer secret', employerSecret],
    ['candidate secret', candidateState.candidateSecret!],
    ['salary opening', candidateState.candidateSalaryOpening!],
    ['hours opening', candidateState.candidateHoursOpening!],
  ] as const) {
    if (ledgerBytes.includes(hex(secret))) fail(`${label} is visible in public ledger state`);
  }

  // ─── 10. Consent Reveal verified against the real on-chain commitment ─────
  const { persistentCommit, CompactTypeUnsignedInteger } = await import('@midnight-ntwrk/compact-runtime');
  const u64 = new CompactTypeUnsignedInteger(2n ** 64n - 1n, 8);
  const recomputed = hex(persistentCommit(u64, candidateState.candidateMinimumCompensation!, candidateState.candidateSalaryOpening!));
  const onChain = hex(publicState!.candidateSalaryCommitments.lookup(nullifier));
  if (recomputed !== onChain) fail('consent reveal: recomputed commitment does not match the ledger');

  const tampered = hex(persistentCommit(u64, candidateState.candidateMinimumCompensation! - 100n, candidateState.candidateSalaryOpening!));
  if (tampered === onChain) fail('consent reveal: a tampered value must not validate');

  console.log('');
  console.log('PROOFMATCH_V2_E2E_PASS');
  console.log(`contractAddress=${contractAddress}`);
  console.log(`lockPrivateBudgetTx=${lockTxId}`);
  console.log(`guaranteedMatchTx=${matchTxId}`);
  console.log(`publicBand=${publicState!.salaryBandFloor}-${publicState!.salaryBandCeiling}`);
  console.log(`budgetLocked=${publicState!.budgetLocked}`);
  console.log(`employerBudgetCommitment=${hex(publicState!.employerBudgetCommitment).slice(0, 32)}...`);
  console.log(`matchCount=${publicState!.matchCount}`);
  console.log(`usedNullifiers=${publicState!.usedNullifiers.size()}`);
  console.log(`salaryCommitments=${publicState!.candidateSalaryCommitments.size()}`);
  console.log(`hoursCommitments=${publicState!.candidateHoursCommitments.size()}`);
  console.log('duplicate=REJECTED');
  console.log('employerCapOutOfBand=REJECTED  unauthorizedLock=REJECTED');
  console.log('negotiationZone=REJECTED  hours=REJECTED  workMode=REJECTED  commute=REJECTED');
  console.log('privateValuesInLedger=NONE');
  console.log('consentRevealVerified=true');

  await walletCtx.wallet.stop();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  fail(error instanceof Error ? error.message : String(error));
});
