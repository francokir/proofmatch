/**
 * Stage 2 end-to-end flow, against a live devnet.
 *
 * Walks the whole gate the plan defines:
 *
 *   deploy V2 job → lock private employer budget → load private candidate
 *   profile → multi-job private preview → real guaranteed proof → ledger
 *   commitments + match → reveal candidate salary → verify against the
 *   original commitment
 *
 * Two vacancies are deployed on purpose: one to match against, and a second to
 * show that the same reusable profile produces a different nullifier there and
 * that a reveal from one job never validates against the other.
 *
 * Run with: npm run test:e2e:v2:stage2   (needs the devnet up and a compile)
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { createMidnightProviders, LOCAL_PRIVATE_STATE_PASSWORD } from '../src/providers';
import { createProofMatchV2Service } from '../src/proofmatch-v2/service';
import { createEmployerSecret, PROOF_MATCH_V2_PRIVATE_STATE_ID } from '../src/proofmatch-v2/private-state';
import { createFileProfileStore, type PrivateMatchProfile } from '../src/proofmatch-v2/profile';
import { encodeRevealPackage, decodeRevealPackage } from '../src/proofmatch-v2/consent-reveal';
import { WorkMode } from '../contracts/managed/proofmatch-job-v2/contract/index.js';
import { getOrCreateWallet, resolveNetwork } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';

// @ts-expect-error Required by the wallet SDK in Node.js.
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_STORE_NAME = 'proofmatch-v2-stage2-state';
const PRIVATE_STATE_ID = PROOF_MATCH_V2_PRIVATE_STATE_ID;

// Values chosen so no private number collides with a public one, otherwise the
// privacy audit at the end would raise a false positive and prove nothing.
const BAND_FLOOR = 1_800n;
const BAND_CEILING = 2_100n;
const EMPLOYER_EXACT_CAP = 1_960n;
const REQUIRED_HOURS = 20n;
const OFFICE_X = 1_000n;
const OFFICE_Y = 1_000n;

const PROFILE: PrivateMatchProfile = {
  minimumCompensation: 1_753n,
  availableWeeklyHours: 27n,
  acceptedWorkModes: [WorkMode.REMOTE, WorkMode.HYBRID],
  locationX: 1_437n,
  locationY: 1_291n,
  maximumCommuteRadius: 1_234n,
};

const log = (msg: string) => console.log(`v2-stage2-e2e: ${msg}`);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function fail(msg: string): never {
  console.error(`PROOFMATCH_V2_STAGE2_E2E_FAIL: ${msg}`);
  process.exit(1);
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
    walletCtx, networkConfig, zkConfigPath,
    privateStateStoreName: PRIVATE_STATE_STORE_NAME,
    privateStatePassword: LOCAL_PRIVATE_STATE_PASSWORD,
  });

  // The profile lives in a throwaway directory for this run.
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofmatch-v2-profile-'));
  const profileStore = createFileProfileStore(path.join(profileDir, 'profile.json'));
  const service = createProofMatchV2Service(providers, zkConfigPath, profileStore);

  const deployJob = async (label: string, employerSecret: Uint8Array) => {
    const deployed = await service.deployJob({
      jobId: Uint8Array.from(randomBytes(32)),
      salaryBandFloor: BAND_FLOOR,
      salaryBandCeiling: BAND_CEILING,
      jobRequiredWeeklyHours: REQUIRED_HOURS,
      workMode: WorkMode.HYBRID,
      officeX: OFFICE_X, officeY: OFFICE_Y,
      employerSecret,
      privateStateId: PRIVATE_STATE_ID,
    });
    const address = (deployed as any).deployTxData.public.contractAddress as string;
    log(`${label} deployed at ${address.slice(0, 20)}...`);
    return address;
  };

  const waitForState = async (address: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const state = await service.refreshPublicState(address);
      if (state) return state;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    return fail(`indexer did not expose ${address} within 30 seconds`);
  };

  // ─── 1. Two vacancies ─────────────────────────────────────────────────────
  const employerSecretA = createEmployerSecret();
  const employerSecretB = createEmployerSecret();
  const jobA = await deployJob('job A', employerSecretA);
  const jobB = await deployJob('job B', employerSecretB);
  await waitForState(jobA);
  await waitForState(jobB);

  // ─── 2. Employer locks its private budget on both ─────────────────────────
  for (const [address, secret, label] of [
    [jobA, employerSecretA, 'job A'], [jobB, employerSecretB, 'job B'],
  ] as const) {
    await service.prepareEmployerState(address, EMPLOYER_EXACT_CAP, secret);
    const handle = await service.joinJob({ contractAddress: address, privateStateId: PRIVATE_STATE_ID });
    await service.lockPrivateBudget(handle as any);
    const state = await service.refreshPublicState(address);
    if (!state?.budgetLocked) fail(`${label}: budget must be locked`);
    log(`${label}: budgetLocked=true`);
  }

  // ─── 3. Private Match Profile ─────────────────────────────────────────────
  const profile = await service.createOrLoadPrivateProfile(PROFILE);
  log(`profile loaded: ${profile.acceptedWorkModes.length} work modes, radius ${profile.maximumCommuteRadius}m`);
  const reloaded = await service.createOrLoadPrivateProfile({ ...PROFILE, minimumCompensation: 1n });
  if (reloaded.minimumCompensation !== PROFILE.minimumCompensation) {
    fail('profile did not persist: the fallback overwrote the stored value');
  }
  log('profile persisted across reloads');

  // ─── 4. Multi-job private preview, entirely local ─────────────────────────
  const stateA = (await service.refreshPublicState(jobA))!;
  const stateB = (await service.refreshPublicState(jobB))!;
  const previews = service.previewJobs(
    [{ contractAddress: jobA, publicState: stateA }, { contractAddress: jobB, publicState: stateB }],
    profile,
  );
  const provable = previews.filter((p) => p.fit.canProveGuaranteedMatch);
  log(`private preview: ${previews.length} jobs, ${provable.length} provable (${previews[0].fit.salaryFit})`);
  if (provable.length !== 2) fail('both vacancies should preview as provable');

  // ─── 5. One real proof, on the chosen vacancy only ────────────────────────
  const candidateStateA = await service.prepareCandidateStateFromProfile(jobA, profile);
  let handleA = await service.joinJob({ contractAddress: jobA, privateStateId: PRIVATE_STATE_ID });
  log('submitting real proveGuaranteedMatch on job A');
  const matchTx: any = await service.proveGuaranteedMatch(handleA as any);
  const matchTxId = matchTx?.public?.txId ?? '(no txId)';
  log(`match tx=${matchTxId}`);

  const afterA = (await service.refreshPublicState(jobA))!;
  if (afterA.matchCount !== 1n) fail(`job A matchCount should be 1, got ${afterA.matchCount}`);
  if (afterA.candidateSalaryCommitments.size() !== 1n) fail('job A salary commitment missing');
  const nullifierA = [...afterA.usedNullifiers][0];

  // Job B untouched: the preview never proved anything there.
  const untouchedB = (await service.refreshPublicState(jobB))!;
  if (untouchedB.matchCount !== 0n) fail('job B must have no matches: preview is local only');
  log('job A matched; job B untouched by the preview');

  // ─── 6. Same profile, second vacancy, different nullifier ─────────────────
  await service.prepareCandidateStateFromProfile(jobB, profile);
  const handleB = await service.joinJob({ contractAddress: jobB, privateStateId: PRIVATE_STATE_ID });
  await service.proveGuaranteedMatch(handleB as any);
  const afterB = (await service.refreshPublicState(jobB))!;
  const nullifierB = [...afterB.usedNullifiers][0];
  if (hex(nullifierA) === hex(nullifierB)) {
    fail('the same profile produced the same nullifier in two vacancies: candidate is linkable');
  }
  log('same profile, different nullifier per vacancy: not linkable');

  // ─── 7. Duplicate still rejected ──────────────────────────────────────────
  handleA = await service.joinJob({ contractAddress: jobA, privateStateId: PRIVATE_STATE_ID });
  let duplicateRejected = false;
  try {
    await service.proveGuaranteedMatch(handleA as any);
  } catch {
    duplicateRejected = true;
  }
  if (!duplicateRejected) fail('a duplicate match must be rejected');
  if ((await service.refreshPublicState(jobA))!.matchCount !== 1n) fail('duplicate changed matchCount');
  log('duplicate on job A: REJECTED');

  // ─── 8. Consent Reveal, verified against the real ledger ──────────────────
  const salaryPkg = service.createRevealPackage({
    field: 'candidateSalary', contractAddress: jobA, nullifier: nullifierA,
    value: candidateStateA.candidateMinimumCompensation!,
    opening: candidateStateA.candidateSalaryOpening!,
  });

  // Transport it as a plain string, the way a QR or a copy/paste would.
  const transported = decodeRevealPackage(encodeRevealPackage(salaryPkg));
  const verdict = service.verifyRevealPackage(transported, afterA, jobA);
  if (!verdict.valid) fail(`candidate salary reveal failed: ${verdict.reason}`);
  log(`candidate salary reveal: VERIFIED (${verdict.value})`);

  // Tampered value must not validate.
  const tampered = { ...salaryPkg, value: '1600' };
  if (service.verifyRevealPackage(tampered, afterA, jobA).valid) {
    fail('a tampered salary must not validate');
  }

  // A reveal from job A must not validate against job B.
  if (service.verifyRevealPackage(salaryPkg, afterB, jobB).valid) {
    fail('a reveal from job A must not validate against job B');
  }
  log('tampered value and cross-job reveal: both REJECTED');

  // Employer reveals its cap, verified against the commitment locked earlier.
  const employerPkg = service.createRevealPackage({
    field: 'employerSalaryCap', contractAddress: jobA,
    value: EMPLOYER_EXACT_CAP,
    opening: (await service.prepareEmployerState(jobA, EMPLOYER_EXACT_CAP, employerSecretA))
      .employerBudgetOpening!,
  });
  const employerVerdict = service.verifyRevealPackage(employerPkg, afterA, jobA);
  if (!employerVerdict.valid) fail(`employer cap reveal failed: ${employerVerdict.reason}`);
  log(`employer cap reveal: VERIFIED (${employerVerdict.value})`);

  // Revealing the salary must not reveal the hours. Checked three ways, none
  // of them by substring: searching for a small decimal like "27" inside a
  // JSON full of hex matches by chance and proves nothing.
  const encoded = encodeRevealPackage(salaryPkg);
  // 1. The hours opening — a 64-char hex, no false positives — is absent.
  if (encoded.includes(hex(candidateStateA.candidateHoursOpening!))) {
    fail('a salary reveal must not carry the hours opening');
  }
  // 2. The package carries exactly the expected fields and nothing else.
  const expectedKeys = ['field', 'contractAddress', 'nullifier', 'value', 'opening'];
  const actualKeys = Object.keys(salaryPkg).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort())) {
    fail(`reveal package carries unexpected fields: ${actualKeys.join(', ')}`);
  }
  // 3. Relabelling it as an hours reveal does not validate: the salary opening
  //    cannot open the hours commitment.
  if (service.verifyRevealPackage({ ...salaryPkg, field: 'candidateHours' }, afterA, jobA).valid) {
    fail('the salary opening must not open the hours commitment');
  }
  log('salary reveal carries nothing about hours or location');

  // ─── 9. Privacy audit against the real ledger ─────────────────────────────
  const publicNumbers = [
    afterA.salaryBandFloor, afterA.salaryBandCeiling, afterA.jobRequiredWeeklyHours,
    afterA.officeX, afterA.officeY, afterA.matchCount,
  ];
  for (const [label, value] of [
    ['employer exact cap', EMPLOYER_EXACT_CAP],
    ['candidate salary', profile.minimumCompensation],
    ['candidate hours', profile.availableWeeklyHours],
    ['candidate location X', profile.locationX],
    ['candidate commute radius', profile.maximumCommuteRadius],
  ] as const) {
    if (publicNumbers.includes(value)) fail(`${label} (${value}) is visible in public ledger state`);
  }
  const publicBytes = [
    hex(afterA.jobId), hex(afterA.employerAuthKey), hex(afterA.employerBudgetCommitment),
    ...[...afterA.usedNullifiers].map(hex),
  ];
  for (const [label, secret] of [
    ['employer secret', employerSecretA],
    ['candidate secret', candidateStateA.candidateSecret!],
    ['salary opening', candidateStateA.candidateSalaryOpening!],
  ] as const) {
    if (publicBytes.includes(hex(secret))) fail(`${label} is visible in public ledger state`);
  }

  // The stored profile must never hold per-job material.
  const profileOnDisk = fs.readFileSync(path.join(profileDir, 'profile.json'), 'utf8');
  for (const [label, secret] of [
    ['candidate secret', candidateStateA.candidateSecret!],
    ['salary opening', candidateStateA.candidateSalaryOpening!],
  ] as const) {
    if (profileOnDisk.includes(hex(secret))) fail(`${label} leaked into the reusable profile`);
  }

  // ─── 10. Demo reset ───────────────────────────────────────────────────────
  await service.resetV2Demo(jobA);
  if (await profileStore.load() !== null) fail('resetV2Demo must clear the stored profile');
  log('demo reset clears profile and candidate state');

  fs.rmSync(profileDir, { recursive: true, force: true });

  console.log('');
  console.log('PROOFMATCH_V2_STAGE2_E2E_PASS');
  console.log(`jobA=${jobA}`);
  console.log(`jobB=${jobB}`);
  console.log(`guaranteedMatchTx=${matchTxId}`);
  console.log(`jobA.matchCount=${afterA.matchCount}  jobB.matchCount=${afterB.matchCount}`);
  console.log(`nullifierA=${hex(nullifierA).slice(0, 24)}...`);
  console.log(`nullifierB=${hex(nullifierB).slice(0, 24)}...  (different: not linkable)`);
  console.log(`profilePersisted=true  multiJobPreview=${previews.length} jobs`);
  console.log('candidateSalaryReveal=VERIFIED  employerCapReveal=VERIFIED');
  console.log('tamperedReveal=REJECTED  crossJobReveal=REJECTED  duplicate=REJECTED');
  console.log('privateValuesInLedger=NONE  perJobMaterialInProfile=NONE');
  console.log('demoReset=OK');

  await walletCtx.wallet.stop();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  fail(error instanceof Error ? error.message : String(error));
});
