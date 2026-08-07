/**
 * Stage 2 tests: Private Match Profile, multi-job preview and Consent Reveal.
 *
 * These cover the layer above the contract. The circuit itself is covered by
 * tests/proofmatch-v2.test.ts, and V1 by its own suites — all untouched.
 *
 * Run with: npm run test:contract   (requires npm run compile first)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  createFileProfileStore,
  createInMemoryProfileStore,
  createOrLoadPrivateProfile,
  updatePrivateProfile,
  validateProfile,
  freshOpening,
  type PrivateMatchProfile,
} from '../src/proofmatch-v2/profile';
import {
  createRevealPackage,
  encodeRevealPackage,
  decodeRevealPackage,
  verifyRevealPackage,
} from '../src/proofmatch-v2/consent-reveal';
import {
  candidateInputsFromProfile,
  classifySalaryFit,
  previewJobs,
  previewPrivateFit,
} from '../src/proofmatch-v2/service';
import type { ProofMatchV2PublicState } from '../src/proofmatch-v2/public-state';

import {
  deployAndLock, readV2, withPrivateState, candidateState,
  WorkMode, ADDRESS_1, ADDRESS_2, BAND_FLOOR, BAND_CEILING, REQUIRED_HOURS,
  OFFICE_X, OFFICE_Y, EMPLOYER_OPENING, SALARY_OPENING, HOURS_OPENING,
  CANDIDATE_SECRET, expectedNullifier, expectedCommitment, testBytes,
} from './v2-helpers.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const unhex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));

const PROFILE: PrivateMatchProfile = {
  minimumCompensation: 1_753n,
  availableWeeklyHours: 27n,
  acceptedWorkModes: [WorkMode.REMOTE, WorkMode.HYBRID],
  locationX: 1_437n,
  locationY: 1_291n,
  maximumCommuteRadius: 1_234n,
};

// ─── A. Private Match Profile ────────────────────────────────────────────────

describe('Stage 2 — Private Match Profile', () => {
  it('persists across store instances pointing at the same file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-profile-'));
    const file = path.join(dir, 'profile.json');
    try {
      await createFileProfileStore(file).save(PROFILE);
      // A fresh store: nothing carried over in memory.
      const reloaded = await createFileProfileStore(file).load();

      assert.deepEqual(reloaded, PROFILE);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('round-trips bigints without losing precision', async () => {
    const store = createInMemoryProfileStore();
    const big: PrivateMatchProfile = { ...PROFILE, minimumCompensation: 2n ** 63n - 1n };
    await store.save(big);

    assert.equal((await store.load())!.minimumCompensation, 2n ** 63n - 1n);
  });

  it('createOrLoad returns the stored profile instead of the fallback', async () => {
    const store = createInMemoryProfileStore(PROFILE);
    const other: PrivateMatchProfile = { ...PROFILE, minimumCompensation: 999n };

    assert.equal((await createOrLoadPrivateProfile(store, other)).minimumCompensation, 1_753n);
  });

  it('createOrLoad persists the fallback when nothing is stored', async () => {
    const store = createInMemoryProfileStore();

    await createOrLoadPrivateProfile(store, PROFILE);

    assert.deepEqual(await store.load(), PROFILE);
  });

  it('update applies a partial change and keeps the rest', async () => {
    const store = createInMemoryProfileStore(PROFILE);

    const updated = await updatePrivateProfile(store, { availableWeeklyHours: 35n });

    assert.equal(updated.availableWeeklyHours, 35n);
    assert.equal(updated.minimumCompensation, PROFILE.minimumCompensation);
    assert.deepEqual(await store.load(), updated);
  });

  it('the file store writes owner-only permissions', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-profile-'));
    const file = path.join(dir, 'profile.json');
    try {
      await createFileProfileStore(file).save(PROFILE);

      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the profile holds no secret, opening or nullifier', () => {
    // The whole point of the per-job split: a profile shared across vacancies
    // must not carry anything that could link the candidate between them.
    const keys = Object.keys(PROFILE).join(' ').toLowerCase();

    for (const forbidden of ['secret', 'opening', 'nullifier']) {
      assert.equal(keys.includes(forbidden), false, `profile must not carry a ${forbidden}`);
    }
  });

  it('rejects values the contract would reject anyway', () => {
    assert.throws(() => validateProfile({ ...PROFILE, minimumCompensation: 0n }), /greater than zero/);
    assert.throws(() => validateProfile({ ...PROFILE, availableWeeklyHours: 169n }), /exceed 168/);
    assert.throws(() => validateProfile({ ...PROFILE, acceptedWorkModes: [] }), /at least one accepted work mode/);
    assert.throws(() => validateProfile({ ...PROFILE, maximumCommuteRadius: 0n }), /greater than zero/);
    assert.throws(() => validateProfile({ ...PROFILE, locationX: 2n ** 32n }), /Uint<32>/);
  });
});

// ─── Per-job derivation from one profile ─────────────────────────────────────

describe('Stage 2 — one profile, per-job identity', () => {
  it('maps the profile onto the circuit inputs', () => {
    const inputs = candidateInputsFromProfile(PROFILE);

    assert.equal(inputs.minimumCompensation, PROFILE.minimumCompensation);
    assert.equal(inputs.commuteRadius, PROFILE.maximumCommuteRadius);
    assert.deepEqual(inputs.acceptedWorkModes, PROFILE.acceptedWorkModes);
  });

  it('the same secret still yields a different nullifier per vacancy', () => {
    // The profile is reused; the nullifier must not be.
    assert.notEqual(
      expectedNullifier(ADDRESS_1, CANDIDATE_SECRET),
      expectedNullifier(ADDRESS_2, CANDIDATE_SECRET),
    );
  });

  it('freshOpening never repeats', () => {
    const openings = new Set(Array.from({ length: 50 }, () => hex(freshOpening())));

    assert.equal(openings.size, 50);
    assert.equal([...openings][0].length, 64);
  });
});

// ─── D. Multi-job Private Preview ────────────────────────────────────────────

/** Minimal public state, enough for the local preview. */
function fakePublicState(over: Partial<ProofMatchV2PublicState> = {}): ProofMatchV2PublicState {
  return {
    jobId: new Uint8Array(32).fill(1),
    salaryBandFloor: BAND_FLOOR,
    salaryBandCeiling: BAND_CEILING,
    jobRequiredWeeklyHours: REQUIRED_HOURS,
    jobWorkMode: WorkMode.HYBRID,
    officeX: OFFICE_X,
    officeY: OFFICE_Y,
    employerAuthKey: new Uint8Array(32),
    jobState: 0,
    budgetLocked: true,
    employerBudgetCommitment: new Uint8Array(32).fill(9),
    matchCount: 0n,
    usedNullifiers: { isEmpty: () => true, size: () => 0n, member: () => false,
      [Symbol.iterator]: function* () {} } as never,
    candidateSalaryCommitments: { isEmpty: () => true, size: () => 0n, member: () => false,
      lookup: () => new Uint8Array(32), [Symbol.iterator]: function* () {} } as never,
    candidateHoursCommitments: { isEmpty: () => true, size: () => 0n, member: () => false,
      lookup: () => new Uint8Array(32), [Symbol.iterator]: function* () {} } as never,
    ...over,
  };
}

describe('Stage 2 — multi-job private preview', () => {
  it('classifies the three salary outcomes', () => {
    assert.equal(classifySalaryFit(1_700n, BAND_FLOOR, BAND_CEILING), 'GUARANTEED');
    assert.equal(classifySalaryFit(BAND_FLOOR, BAND_FLOOR, BAND_CEILING), 'GUARANTEED');
    assert.equal(classifySalaryFit(BAND_FLOOR + 1n, BAND_FLOOR, BAND_CEILING), 'NEGOTIATION_ZONE');
    assert.equal(classifySalaryFit(BAND_CEILING, BAND_FLOOR, BAND_CEILING), 'NEGOTIATION_ZONE');
    assert.equal(classifySalaryFit(BAND_CEILING + 1n, BAND_FLOOR, BAND_CEILING), 'NO_FIT');
  });

  it('previews five vacancies from one profile', () => {
    const jobs = [
      { contractAddress: 'aa', publicState: fakePublicState() },
      { contractAddress: 'bb', publicState: fakePublicState({ salaryBandFloor: 1_500n, salaryBandCeiling: 1_800n }) },
      { contractAddress: 'cc', publicState: fakePublicState({ salaryBandFloor: 1_000n, salaryBandCeiling: 1_400n }) },
      { contractAddress: 'dd', publicState: fakePublicState({ jobWorkMode: WorkMode.ONSITE }) },
      { contractAddress: 'ee', publicState: fakePublicState({ jobRequiredWeeklyHours: 40n }) },
    ];

    const previews = previewJobs(jobs, PROFILE);
    const guaranteed = previews.filter((p) => p.fit.canProveGuaranteedMatch);

    assert.equal(previews.length, 5);
    assert.equal(previews[0].fit.salaryFit, 'GUARANTEED');
    assert.equal(previews[1].fit.salaryFit, 'NEGOTIATION_ZONE'); // 1753 > 1500
    assert.equal(previews[2].fit.salaryFit, 'NO_FIT');           // 1753 > 1400
    assert.equal(previews[3].fit.workModeAccepted, false);       // ONSITE not accepted
    assert.equal(previews[4].fit.hoursCompatible, false);        // 27 < 40
    assert.equal(guaranteed.length, 1, 'only the first vacancy is provable');
  });

  it('a locked budget is required even when everything else fits', () => {
    const fit = previewPrivateFit(fakePublicState({ budgetLocked: false }), candidateInputsFromProfile(PROFILE));

    assert.equal(fit.salaryFit, 'GUARANTEED');
    assert.equal(fit.canProveGuaranteedMatch, false);
  });

  it('a REMOTE vacancy ignores the commute entirely', () => {
    const farAway = { ...PROFILE, locationX: 4_000_000n, locationY: 4_000_000n, maximumCommuteRadius: 1n };
    const fit = previewPrivateFit(fakePublicState({ jobWorkMode: WorkMode.REMOTE }),
      candidateInputsFromProfile(farAway));

    assert.equal(fit.commuteCompatible, true);
    assert.equal(fit.canProveGuaranteedMatch, true);
  });

  it('the preview agrees with the circuit on the boundary', () => {
    // Same 3-4-5 triangle the contract tests use: distance 500, radius 500.
    const onBoundary = { ...PROFILE, locationX: 1_300n, locationY: 1_400n, maximumCommuteRadius: 500n };
    const justOutside = { ...onBoundary, maximumCommuteRadius: 499n };

    assert.equal(previewPrivateFit(fakePublicState(), candidateInputsFromProfile(onBoundary)).commuteCompatible, true);
    assert.equal(previewPrivateFit(fakePublicState(), candidateInputsFromProfile(justOutside)).commuteCompatible, false);
  });
});

// ─── F. Consent Reveal ───────────────────────────────────────────────────────

/** Runs a real match and returns everything a reveal needs. */
function matchedVacancy() {
  const dep = deployAndLock({}, 1_960n);
  const ctx = withPrivateState(dep.context, candidateState(1_753n, 27n));
  const after = dep.contract.impureCircuits.proveGuaranteedMatch(ctx).context;
  const ledger = readV2(after);
  const nullifier = unhex(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET));
  // Shape the ledger into the public-state view the verifier consumes.
  const publicState = {
    ...fakePublicState(),
    budgetLocked: ledger.budgetLocked,
    employerBudgetCommitment: ledger.employerBudgetCommitment,
    candidateSalaryCommitments: ledger.candidateSalaryCommitments,
    candidateHoursCommitments: ledger.candidateHoursCommitments,
  } as ProofMatchV2PublicState;
  return { publicState, nullifier };
}

describe('Stage 2 — Consent Reveal', () => {
  it('a correct candidate salary reveal validates against the ledger', () => {
    const { publicState, nullifier } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier, value: 1_753n, opening: SALARY_OPENING,
    });

    const verdict = verifyRevealPackage(pkg, publicState, ADDRESS_1);

    assert.equal(verdict.valid, true);
    assert.equal(verdict.valid && verdict.value, 1_753n);
  });

  it('a tampered value does not validate', () => {
    const { publicState, nullifier } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier, value: 1_600n, opening: SALARY_OPENING,
    });

    const verdict = verifyRevealPackage(pkg, publicState, ADDRESS_1);

    assert.equal(verdict.valid, false);
    assert.match(!verdict.valid ? verdict.reason : '', /commitment mismatch/);
  });

  it('a tampered opening does not validate', () => {
    const { publicState, nullifier } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier, value: 1_753n, opening: testBytes(90),
    });

    assert.equal(verifyRevealPackage(pkg, publicState, ADDRESS_1).valid, false);
  });

  it('a package from job A does not validate against job B', () => {
    const { publicState, nullifier } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier, value: 1_753n, opening: SALARY_OPENING,
    });

    const verdict = verifyRevealPackage(pkg, publicState, ADDRESS_2);

    assert.equal(verdict.valid, false);
    assert.match(!verdict.valid ? verdict.reason : '', /different contract/);
  });

  it('a reveal for an unknown nullifier does not validate', () => {
    const { publicState } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier: testBytes(91), value: 1_753n, opening: SALARY_OPENING,
    });

    const verdict = verifyRevealPackage(pkg, publicState, ADDRESS_1);

    assert.equal(verdict.valid, false);
    assert.match(!verdict.valid ? verdict.reason : '', /no commitment registered/);
  });

  it('the hours reveal validates on its own, with the Uint<8> encoding', () => {
    const { publicState, nullifier } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateHours', contractAddress: ADDRESS_1,
      nullifier, value: 27n, opening: HOURS_OPENING,
    });

    assert.equal(verifyRevealPackage(pkg, publicState, ADDRESS_1).valid, true);
  });

  it('revealing the salary does not reveal the hours', () => {
    // The salary package carries only the salary opening. Trying to use it for
    // the hours field must fail: separate openings, separate consent.
    const { publicState, nullifier } = matchedVacancy();
    const salaryPkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier, value: 1_753n, opening: SALARY_OPENING,
    });

    assert.equal(verifyRevealPackage(salaryPkg, publicState, ADDRESS_1).valid, true);
    assert.equal(JSON.stringify(salaryPkg).includes(hex(HOURS_OPENING)), false);
    assert.equal(JSON.stringify(salaryPkg).includes('27'), false, 'hours must not appear in a salary reveal');

    const wrongField = { ...salaryPkg, field: 'candidateHours' as const };
    assert.equal(verifyRevealPackage(wrongField, publicState, ADDRESS_1).valid, false);
  });

  it('the employer cap reveal validates against its own commitment', () => {
    const { publicState } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'employerSalaryCap', contractAddress: ADDRESS_1,
      value: 1_960n, opening: EMPLOYER_OPENING,
    });

    const verdict = verifyRevealPackage(pkg, publicState, ADDRESS_1);

    assert.equal(verdict.valid, true);
    assert.equal(verdict.valid && verdict.value, 1_960n);
  });

  it('the employer cannot claim a different cap afterwards', () => {
    const { publicState } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'employerSalaryCap', contractAddress: ADDRESS_1,
      value: 2_100n, opening: EMPLOYER_OPENING,
    });

    assert.equal(verifyRevealPackage(pkg, publicState, ADDRESS_1).valid, false);
  });

  it('the employer reveal is rejected before the budget is locked', () => {
    const publicState = fakePublicState({ budgetLocked: false });
    const pkg = createRevealPackage({
      field: 'employerSalaryCap', contractAddress: ADDRESS_1,
      value: 1_960n, opening: EMPLOYER_OPENING,
    });

    const verdict = verifyRevealPackage(pkg, publicState, ADDRESS_1);

    assert.equal(verdict.valid, false);
    assert.match(!verdict.valid ? verdict.reason : '', /not locked/);
  });

  it('survives transport as a plain string', () => {
    const { publicState, nullifier } = matchedVacancy();
    const pkg = createRevealPackage({
      field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier, value: 1_753n, opening: SALARY_OPENING,
    });

    // Copy/paste, QR, file: any channel that carries a string.
    const roundTripped = decodeRevealPackage(encodeRevealPackage(pkg));

    assert.deepEqual(roundTripped, pkg);
    assert.equal(verifyRevealPackage(roundTripped, publicState, ADDRESS_1).valid, true);
  });

  it('rejects a malformed package instead of throwing', () => {
    const { publicState } = matchedVacancy();
    const pkg = { field: 'candidateSalary', contractAddress: ADDRESS_1,
      nullifier: 'zz', value: 'not-a-number', opening: hex(SALARY_OPENING) } as never;

    assert.equal(verifyRevealPackage(pkg, publicState, ADDRESS_1).valid, false);
  });

  it('refuses to build a candidate package without a nullifier', () => {
    assert.throws(
      () => createRevealPackage({
        field: 'candidateSalary', contractAddress: ADDRESS_1, value: 1n, opening: SALARY_OPENING,
      }),
      /needs its match nullifier/,
    );
  });

  it('the commitment recomputed here matches the one the contract stored', () => {
    // Ties the whole reveal path back to the contract: same value, same
    // opening, same width, same hash.
    const { publicState, nullifier } = matchedVacancy();

    assert.equal(
      hex(publicState.candidateSalaryCommitments.lookup(nullifier)),
      expectedCommitment(1_753n, SALARY_OPENING, 64),
    );
  });
});
