import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { previewJobs } from '../src/proofmatch-v2/browser/ui-api';
import type { V2Profile, V2PublicJobState } from '../src/proofmatch-v2/browser/ui-contract';

/** The demo profile: guaranteed against the demo vacancy. */
const PROFILE: V2Profile = {
  minimumCompensation: 1_753n,
  availableWeeklyHours: 27n,
  acceptedWorkModes: ['REMOTE', 'HYBRID'],
  locationX: 1_437n,
  locationY: 1_291n,
  maximumCommuteRadius: 1_234n,
};

function job(overrides: Partial<V2PublicJobState> = {}): V2PublicJobState {
  return {
    contractAddress: 'aa'.repeat(32),
    jobId: 'bb'.repeat(32),
    salaryBandFloor: 1_800n,
    salaryBandCeiling: 2_100n,
    requiredWeeklyHours: 20n,
    workMode: 'HYBRID',
    officeX: 1_000n,
    officeY: 1_000n,
    jobState: 'Open',
    budgetLocked: true,
    employerBudgetCommitment: 'cc'.repeat(32),
    matchCount: 0n,
    usedNullifierCount: 0n,
    salaryCommitmentCount: 0n,
    hoursCommitmentCount: 0n,
    ...overrides,
  };
}

describe('browser multi-job preview', () => {
  it('marks a fitting vacancy with a locked budget as provable', () => {
    const [preview] = previewJobs([job()], PROFILE);
    assert.equal(preview.salaryFit, 'GUARANTEED');
    assert.equal(preview.canProveGuaranteedMatch, true);
  });

  it('refuses to call a vacancy provable while its budget is unlocked', () => {
    // The projection into the shared preview once dropped `budgetLocked`, which
    // reads as `undefined` and made every vacancy look unlockable. The salary
    // fit still says GUARANTEED, so only this flag catches the regression.
    const [preview] = previewJobs([job({ budgetLocked: false })], PROFILE);
    assert.equal(preview.salaryFit, 'GUARANTEED');
    assert.equal(preview.canProveGuaranteedMatch, false);
  });

  it('classifies a band the candidate only reaches by negotiating', () => {
    const [preview] = previewJobs([job({ salaryBandFloor: 1_700n, salaryBandCeiling: 2_000n })], {
      ...PROFILE,
      minimumCompensation: 1_900n,
    });
    assert.equal(preview.salaryFit, 'NEGOTIATION_ZONE');
    assert.equal(preview.canProveGuaranteedMatch, false);
  });

  it('classifies a band that cannot reach the candidate at all', () => {
    const [preview] = previewJobs([job()], { ...PROFILE, minimumCompensation: 3_000n });
    assert.equal(preview.salaryFit, 'NO_FIT');
  });

  it('blocks on hours, work mode and commute independently', () => {
    const [hours] = previewJobs([job({ requiredWeeklyHours: 40n })], PROFILE);
    assert.equal(hours.hoursCompatible, false);
    const [mode] = previewJobs([job({ workMode: 'ONSITE' })], PROFILE);
    assert.equal(mode.workModeAccepted, false);
    const [commute] = previewJobs([job({ officeX: 90_000n, officeY: 90_000n })], PROFILE);
    assert.equal(commute.commuteCompatible, false);
  });

  it('ignores location entirely for a remote vacancy', () => {
    // The circuit skips the commute check when the job is REMOTE, so a preview
    // that still enforced it would hide vacancies a real proof would accept.
    const [preview] = previewJobs([job({ workMode: 'REMOTE', officeX: 90_000n, officeY: 90_000n })], PROFILE);
    assert.equal(preview.commuteCompatible, true);
    assert.equal(preview.canProveGuaranteedMatch, true);
  });

  it('classifies several vacancies in one pass and keeps them addressable', () => {
    const previews = previewJobs(
      [job({ contractAddress: 'a1' }), job({ contractAddress: 'b2', requiredWeeklyHours: 40n })],
      PROFILE,
    );
    assert.deepEqual(previews.map((preview) => preview.contractAddress), ['a1', 'b2']);
    assert.deepEqual(previews.map((preview) => preview.canProveGuaranteedMatch), [true, false]);
  });
});
