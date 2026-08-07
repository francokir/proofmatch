/**
 * Contract tests for ProofMatchJobV2.
 *
 * What V2 adds over V1, and therefore what this suite has to prove:
 *
 *   - the employer's exact cap is private; only a band and a commitment are public
 *   - the employer authenticates to lock that cap
 *   - a Guaranteed Match rests on transitivity: C <= floor <= cap
 *   - work mode and commute radius are private candidate conditions
 *   - candidate commitments are bound to the nullifier of their own match
 *
 * V1 keeps its own suite in tests/proofmatch-*.test.ts, untouched.
 *
 * Run with: npm run test:contract   (requires npm run compile first)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deployV2, deployAndLock, readV2, withPrivateState, makeWitnesses,
  employerState, candidateState,
  WorkMode, JOB_ID, ZERO_32, ADDRESS_1, ADDRESS_2,
  BAND_FLOOR, BAND_CEILING, REQUIRED_HOURS, OFFICE_X, OFFICE_Y,
  EMPLOYER_SECRET, CANDIDATE_SECRET, SALARY_OPENING, HOURS_OPENING,
  EMPLOYER_OPENING, testBytes,
  writeHappensAfterAllReads, bytesInTranscript, bigintsInTranscript,
  expectedNullifier, expectedEmployerKey, expectedCommitment,
} from './v2-helpers.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

// ─── Constructor: the public salary band ─────────────────────────────────────

describe('V2 constructor — salary band', () => {
  it('publishes the band and seals the employer key, not the secret', () => {
    const state = readV2(deployV2().context);

    assert.equal(state.salaryBandFloor, BAND_FLOOR);
    assert.equal(state.salaryBandCeiling, BAND_CEILING);
    assert.equal(hex(state.employerAuthKey), expectedEmployerKey(EMPLOYER_SECRET));
    assert.notEqual(hex(state.employerAuthKey), hex(EMPLOYER_SECRET));
  });

  it('starts unlocked, with no matches and no commitments', () => {
    const state = readV2(deployV2().context);

    assert.equal(state.budgetLocked, false);
    assert.equal(state.matchCount, 0n);
    assert.equal(state.usedNullifiers.size(), 0n);
    assert.equal(state.candidateSalaryCommitments.size(), 0n);
    assert.equal(state.candidateHoursCommitments.size(), 0n);
  });

  it('accepts a band exactly 300 wide', () => {
    const state = readV2(deployV2({ bandFloor: 1_800n, bandCeiling: 2_100n }).context);
    assert.equal(state.salaryBandCeiling - state.salaryBandFloor, 300n);
  });

  it('rejects a band narrower than 300', () => {
    assert.throws(
      () => deployV2({ bandFloor: 1_800n, bandCeiling: 2_099n }),
      /salary band must be at least 300 wide/,
    );
  });

  it('rejects a ceiling below the floor', () => {
    assert.throws(
      () => deployV2({ bandFloor: 2_100n, bandCeiling: 1_800n }),
      /salaryBandCeiling must exceed salaryBandFloor/,
    );
  });

  it('rejects a zero floor', () => {
    assert.throws(() => deployV2({ bandFloor: 0n, bandCeiling: 500n }), /salaryBandFloor must be greater than zero/);
  });

  it('rejects an uninitialised employer secret', () => {
    assert.throws(() => deployV2({ employerSk: ZERO_32 }), /employer secret not initialized/);
  });

  it('rejects the zero jobId', () => {
    assert.throws(() => deployV2({ jobId: ZERO_32 }), /jobId must not be the zero identifier/);
  });
});

// ─── lockPrivateBudget ───────────────────────────────────────────────────────

describe('V2 lockPrivateBudget — employer private cap', () => {
  const lock = (cap: bigint, over = {}) => {
    const dep = deployV2({ privateState: employerState(cap, over) });
    return dep.contract.impureCircuits.lockPrivateBudget(dep.context);
  };

  it('accepts a cap inside the band and publishes only its commitment', () => {
    const after = readV2(lock(1_960n).context);

    assert.equal(after.budgetLocked, true);
    assert.equal(hex(after.employerBudgetCommitment), expectedCommitment(1_960n, EMPLOYER_OPENING, 64));
  });

  it('accepts a cap exactly at the floor', () => {
    assert.equal(readV2(lock(BAND_FLOOR).context).budgetLocked, true);
  });

  it('accepts a cap exactly at the ceiling', () => {
    assert.equal(readV2(lock(BAND_CEILING).context).budgetLocked, true);
  });

  it('rejects a cap below the floor', () => {
    assert.throws(() => lock(BAND_FLOOR - 1n), /employer cap below band floor/);
  });

  it('rejects a cap above the ceiling', () => {
    assert.throws(() => lock(BAND_CEILING + 1n), /employer cap above band ceiling/);
  });

  it('rejects an unauthorized caller', () => {
    assert.throws(
      () => lock(1_960n, { employerSecretBytes: testBytes(99) }),
      /not authorized to lock budget/,
    );
  });

  it('rejects a second lock', () => {
    const dep = deployV2({ privateState: employerState(1_960n) });
    const locked = dep.contract.impureCircuits.lockPrivateBudget(dep.context);

    assert.throws(
      () => dep.contract.impureCircuits.lockPrivateBudget(locked.context),
      /budget already locked/,
    );
  });

  it('rejects an uninitialised opening', () => {
    assert.throws(() => lock(1_960n, { budgetOpening: ZERO_32 }), /employer opening not initialized/);
  });

  it('PRIVACY: the exact cap never appears in the public transcript', () => {
    const dep = deployV2({ privateState: employerState(1_960n) });
    const result = dep.contract.impureCircuits.lockPrivateBudget(dep.context);
    const transcript = result.proofData.publicTranscript;

    // Positive control: the commitment IS there, so the detector works.
    const commitment = expectedCommitment(1_960n, EMPLOYER_OPENING, 64);
    assert.ok(bytesInTranscript(transcript).includes(commitment), 'control: commitment must be found');

    assert.equal(bigintsInTranscript(transcript).includes(1_960n), false, 'exact cap leaked');
    assert.equal(bytesInTranscript(transcript).includes(hex(EMPLOYER_SECRET)), false, 'secret leaked');
    assert.equal(bytesInTranscript(transcript).includes(hex(EMPLOYER_OPENING)), false, 'opening leaked');
  });
});

// ─── proveGuaranteedMatch: salary ────────────────────────────────────────────

describe('V2 proveGuaranteedMatch — salary transitivity', () => {
  const attempt = (salary: bigint, over = {}) => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(salary, 28n, over));
    return () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx);
  };

  it('accepts a minimum below the floor', () => {
    assert.doesNotThrow(attempt(1_750n));
  });

  it('accepts a minimum exactly at the floor', () => {
    assert.doesNotThrow(attempt(BAND_FLOOR));
  });

  it('rejects floor + 1: that is Negotiation Zone, not a guaranteed match', () => {
    assert.throws(attempt(BAND_FLOOR + 1n), /not a guaranteed salary match/);
  });

  it('rejects a minimum above the ceiling', () => {
    assert.throws(attempt(BAND_CEILING + 1n), /not a guaranteed salary match/);
  });

  it('rejects a zero minimum', () => {
    assert.throws(attempt(0n), /candidate compensation out of range/);
  });

  it('requires the employer budget to be locked first', () => {
    const dep = deployV2();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n));

    assert.throws(
      () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx),
      /employer budget not locked/,
    );
  });
});

// ─── Hours, work mode, commute ───────────────────────────────────────────────

describe('V2 proveGuaranteedMatch — hours', () => {
  const attempt = (hours: bigint) => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, hours));
    return () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx);
  };

  it('accepts availability above the requirement', () => assert.doesNotThrow(attempt(28n)));
  it('accepts availability exactly at the requirement', () => assert.doesNotThrow(attempt(REQUIRED_HOURS)));
  it('rejects one hour below', () => assert.throws(attempt(REQUIRED_HOURS - 1n), /weekly hours not compatible/));
  it('rejects zero hours', () => assert.throws(attempt(0n), /candidate weekly hours out of range/));
  it('rejects more than 168', () => assert.throws(attempt(169n), /candidate weekly hours out of range/));
});

describe('V2 proveGuaranteedMatch — work mode', () => {
  const attemptMode = (jobMode: WorkMode, accepted: readonly WorkMode[]) => {
    const dep = deployAndLock({ workMode: jobMode });
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n, { acceptedWorkModes: accepted }));
    return () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx);
  };

  it('accepts HYBRID when the candidate accepts HYBRID', () => {
    assert.doesNotThrow(attemptMode(WorkMode.HYBRID, [WorkMode.REMOTE, WorkMode.HYBRID]));
  });

  it('rejects ONSITE when the candidate does not accept it', () => {
    assert.throws(attemptMode(WorkMode.ONSITE, [WorkMode.REMOTE, WorkMode.HYBRID]), /work mode not accepted/);
  });

  it('accepts REMOTE without needing any location', () => {
    const dep = deployAndLock({ workMode: WorkMode.REMOTE });
    // No location, no radius at all: a REMOTE vacancy must not require them.
    const ctx = withPrivateState(dep.context, {
      minimumCompensation: 1_750n, availableWeeklyHours: 28n,
      acceptedWorkModes: [WorkMode.REMOTE],
      candidateSecretBytes: CANDIDATE_SECRET,
      salaryOpening: SALARY_OPENING, hoursOpening: HOURS_OPENING,
    });

    assert.doesNotThrow(() => dep.contract.impureCircuits.proveGuaranteedMatch(ctx));
  });
});

describe('V2 proveGuaranteedMatch — private commute radius', () => {
  // Office at (1000, 1000). Distances are exact squares to pin the boundary.
  const attemptAt = (x: bigint, y: bigint, radius: bigint) => {
    const dep = deployAndLock({ workMode: WorkMode.HYBRID });
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n, {
      locationX: x, locationY: y, commuteRadius: radius,
    }));
    return () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx);
  };

  it('accepts a candidate inside the radius', () => {
    assert.doesNotThrow(attemptAt(1_500n, 1_000n, 1_000n)); // 500 <= 1000
  });

  it('accepts a candidate exactly on the boundary', () => {
    assert.doesNotThrow(attemptAt(1_600n, 1_000n, 600n)); // 600 <= 600
  });

  it('rejects a candidate one metre outside', () => {
    assert.throws(attemptAt(1_601n, 1_000n, 600n), /commute not compatible/);
  });

  it('handles a negative delta without underflow (candidate west of office)', () => {
    assert.doesNotThrow(attemptAt(400n, 1_000n, 600n)); // |400-1000| = 600
  });

  it('handles both axes at once', () => {
    assert.doesNotThrow(attemptAt(1_300n, 1_400n, 500n)); // 300-400-500 triangle
  });

  it('rejects the 3-4-5 triangle when the radius is one metre short', () => {
    assert.throws(attemptAt(1_300n, 1_400n, 499n), /commute not compatible/);
  });

  it('rejects a zero radius', () => {
    assert.throws(attemptAt(1_500n, 1_000n, 0n), /commute radius out of range/);
  });

  it('does not overflow at the top of Uint<32>', () => {
    const far = 4_294_967_295n; // 2^32 - 1
    const dep = deployAndLock({ workMode: WorkMode.HYBRID, officeX: 0n, officeY: 0n });
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n, {
      locationX: far, locationY: far, commuteRadius: far,
    }));
    // dx^2 + dy^2 = 2*(2^32-1)^2 > (2^32-1)^2, so this must reject on distance,
    // not blow up: the widened result type holds it.
    assert.throws(
      () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx),
      /commute not compatible/,
    );
  });
});

// ─── Nullifier and duplicates ────────────────────────────────────────────────

describe('V2 nullifier and duplicate prevention', () => {
  it('registers one nullifier and increments matchCount', () => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n));
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(ctx).context;
    const state = readV2(after);

    assert.equal(state.matchCount, 1n);
    assert.equal(state.usedNullifiers.size(), 1n);
    assert.ok(state.usedNullifiers.member(
      Uint8Array.from(Buffer.from(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET), 'hex'))));
  });

  it('rejects the same candidate twice', () => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n));
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(ctx).context;
    const again = withPrivateState(after, candidateState(1_750n, 28n));

    assert.throws(
      () => dep.contract.impureCircuits.proveGuaranteedMatch(again),
      /candidate already matched this job/,
    );
  });

  it('the same secret yields a different nullifier in another vacancy', () => {
    assert.notEqual(
      expectedNullifier(ADDRESS_1, CANDIDATE_SECRET),
      expectedNullifier(ADDRESS_2, CANDIDATE_SECRET),
    );
  });

  it('accepts a second, distinct candidate', () => {
    const dep = deployAndLock();
    const first = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_750n, 28n))).context;
    const second = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(first, candidateState(1_700n, 30n, {
        candidateSecretBytes: testBytes(50),
        salaryOpening: testBytes(51), hoursOpening: testBytes(52),
      }))).context;

    assert.equal(readV2(second).matchCount, 2n);
    assert.equal(readV2(second).usedNullifiers.size(), 2n);
  });
});

// ─── Commitments bound to the match ──────────────────────────────────────────

describe('V2 candidate commitments', () => {
  it('stores salary and hours commitments keyed by the nullifier', () => {
    const dep = deployAndLock();
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_750n, 28n))).context;
    const state = readV2(after);
    const nul = Uint8Array.from(Buffer.from(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET), 'hex'));

    assert.ok(state.candidateSalaryCommitments.member(nul), 'salary commitment must be keyed by nullifier');
    assert.ok(state.candidateHoursCommitments.member(nul), 'hours commitment must be keyed by nullifier');
  });

  it('CONSENT REVEAL: a correct opening reproduces the stored commitment', () => {
    const dep = deployAndLock();
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_750n, 28n))).context;
    const nul = Uint8Array.from(Buffer.from(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET), 'hex'));
    const stored = readV2(after).candidateSalaryCommitments.lookup(nul);

    // This is exactly what a recruiter does when the candidate reveals.
    assert.equal(hex(stored), expectedCommitment(1_750n, SALARY_OPENING, 64));
  });

  it('CONSENT REVEAL: a tampered value does not validate', () => {
    const dep = deployAndLock();
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_750n, 28n))).context;
    const nul = Uint8Array.from(Buffer.from(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET), 'hex'));
    const stored = hex(readV2(after).candidateSalaryCommitments.lookup(nul));

    assert.notEqual(stored, expectedCommitment(1_600n, SALARY_OPENING, 64), 'claiming a lower salary must fail');
  });

  it('CONSENT REVEAL: a tampered opening does not validate', () => {
    const dep = deployAndLock();
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_750n, 28n))).context;
    const nul = Uint8Array.from(Buffer.from(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET), 'hex'));
    const stored = hex(readV2(after).candidateSalaryCommitments.lookup(nul));

    assert.notEqual(stored, expectedCommitment(1_750n, testBytes(77), 64));
  });

  it('CONSENT REVEAL: the employer cap opening reproduces its commitment', () => {
    const dep = deployAndLock({}, 1_960n);

    assert.equal(
      hex(readV2(dep.context).employerBudgetCommitment),
      expectedCommitment(1_960n, EMPLOYER_OPENING, 64),
    );
  });

  it('rejects reusing one opening for both fields', () => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n, {
      salaryOpening: SALARY_OPENING, hoursOpening: SALARY_OPENING,
    }));

    assert.throws(
      () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx),
      /commitment openings must differ/,
    );
  });

  it('rejects uninitialised openings', () => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n, { salaryOpening: ZERO_32 }));

    assert.throws(
      () => dep.contract.impureCircuits.proveGuaranteedMatch(ctx),
      /salary opening not initialized/,
    );
  });
});

// ─── Privacy of the match circuit ────────────────────────────────────────────

describe('V2 proveGuaranteedMatch — privacy', () => {
  const successful = () => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n));
    return dep.contract.impureCircuits.proveGuaranteedMatch(ctx);
  };

  it('no private candidate value reaches the public transcript', () => {
    const result = successful();
    const transcript = result.proofData.publicTranscript;
    const bytes = bytesInTranscript(transcript);
    const numbers = bigintsInTranscript(transcript);

    // Positive control: the nullifier IS in the transcript.
    assert.ok(bytes.includes(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET)), 'control: nullifier must be found');

    assert.equal(bytes.includes(hex(CANDIDATE_SECRET)), false, 'candidate secret leaked');
    assert.equal(bytes.includes(hex(SALARY_OPENING)), false, 'salary opening leaked');
    assert.equal(bytes.includes(hex(HOURS_OPENING)), false, 'hours opening leaked');
    assert.equal(numbers.includes(1_750n), false, 'exact salary leaked');
    assert.equal(numbers.includes(28n), false, 'exact hours leaked');
    assert.equal(numbers.includes(1_500n), false, 'location X leaked');
  });

  it('the private commute radius never reaches the public transcript', () => {
    const dep = deployAndLock();
    const ctx = withPrivateState(dep.context, candidateState(1_750n, 28n, { commuteRadius: 777n }));
    const result = dep.contract.impureCircuits.proveGuaranteedMatch(ctx);

    assert.equal(bigintsInTranscript(result.proofData.publicTranscript).includes(777n), false);
  });

  it('every public write happens after the last public read', () => {
    assert.ok(writeHappensAfterAllReads(successful().proofData.publicTranscript));
  });
});

// ─── No mutation on failure ──────────────────────────────────────────────────

describe('V2 — a rejected attempt mutates nothing', () => {
  const failures: ReadonlyArray<readonly [string, () => unknown]> = [
    ['salary in negotiation zone', () => candidateState(BAND_FLOOR + 1n, 28n)],
    ['hours below requirement', () => candidateState(1_750n, REQUIRED_HOURS - 1n)],
    ['work mode not accepted', () => candidateState(1_750n, 28n, { acceptedWorkModes: [WorkMode.REMOTE] })],
    ['commute out of range', () => candidateState(1_750n, 28n, { locationX: 9_999n, commuteRadius: 10n })],
  ];

  for (const [name, build] of failures) {
    it(`${name}: no writes, no nullifier, no commitments`, () => {
      const dep = deployAndLock({ workMode: WorkMode.ONSITE });
      const ctx = withPrivateState(dep.context, build() as never);
      const own = { ...ctx, gasCost: (undefined as never) };
      const ppd = {
        input: { value: [], alignment: [] }, output: undefined,
        publicTranscript: [] as unknown[], privateTranscriptOutputs: [] as unknown[],
      };

      // Invoking the inner circuit makes partial writes observable: the public
      // wrapper copies the context, so comparing before/after would prove nothing.
      assert.throws(() => (dep.contract as any)._proveGuaranteedMatch_0(own, ppd));

      const writes = ppd.publicTranscript
        .map((op) => (typeof op === 'string' ? op : Object.keys(op as object)[0]))
        .filter((n) => n === 'ins' || n === 'addi');
      assert.equal(writes.length, 0, 'a rejected attempt must emit no writes');
    });
  }

  it('a rejected attempt does not consume the nullifier: the candidate can retry', () => {
    const dep = deployAndLock();
    // First attempt: hours too low.
    const bad = withPrivateState(dep.context, candidateState(1_750n, REQUIRED_HOURS - 1n));
    assert.throws(() => dep.contract.impureCircuits.proveGuaranteedMatch(bad));

    // Same secret, corrected hours.
    const good = withPrivateState(dep.context, candidateState(1_750n, 28n));
    const after = dep.contract.impureCircuits.proveGuaranteedMatch(good).context;

    assert.equal(readV2(after).matchCount, 1n);
  });
});

// ─── Surface ─────────────────────────────────────────────────────────────────

describe('V2 — contract surface', () => {
  it('exposes exactly the two V2 circuits', () => {
    const contract = deployV2().contract;
    assert.deepEqual(Object.keys(contract.circuits).sort(), ['lockPrivateBudget', 'proveGuaranteedMatch']);
  });

  it('neither circuit takes arguments: nothing can be asserted from outside', () => {
    const dep = deployAndLock();
    assert.throws(
      () => (dep.contract.impureCircuits.proveGuaranteedMatch as any)(dep.context, true),
      /expected 1 argument/,
    );
  });

  it('declares the twelve V2 witnesses', () => {
    const contract = deployV2().contract;
    assert.equal(Object.keys(contract.witnesses).length, 12);
  });
});
