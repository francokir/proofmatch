/**
 * The multi-job preview with verified qualifications: local-only evaluation,
 * no network, no proof, no reveal. A vacancy that demands English >= B2 must
 * gate `canProveGuaranteedMatch` on the stored credential — and vacancies
 * without a requirement must behave exactly as before.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { previewJobs } from '../src/proofmatch-v2/browser/ui-api';
import type {
  V2CredentialSummary,
  V2Profile,
  V2PublicJobState,
} from '../src/proofmatch-v2/browser/ui-contract';

const PROFILE: V2Profile = {
  minimumCompensation: 1_753n,
  availableWeeklyHours: 27n,
  acceptedWorkModes: ['REMOTE', 'HYBRID'],
  locationX: 1_500n,
  locationY: 1_000n,
  maximumCommuteRadius: 1_000n,
};

const CREDENTIAL_C1: V2CredentialSummary = {
  credentialId: 'urn:uuid:test',
  holderDid: 'did:midnight:undeployed:aa',
  englishLevelLabel: 'C1',
  issuerName: 'ProofMatch Demo Issuer',
};

function job(overrides: Partial<V2PublicJobState> = {}): V2PublicJobState {
  return {
    contractAddress: 'a'.repeat(64),
    jobId: 'b'.repeat(64),
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

const englishB2 = {
  kind: 'english' as const,
  requiredLevel: 4n,
  requiredLevelLabel: 'B2',
  attestationCount: 0n,
  verifierKeyHash: 'dd'.repeat(32),
};

describe('browser preview with verified qualifications', () => {
  it('a vacancy without requirement behaves exactly as before', () => {
    const [preview] = previewJobs([job()], PROFILE);
    assert.equal(preview.qualificationRequired, false);
    assert.equal(preview.qualificationSatisfiable, true);
    assert.equal(preview.canProveGuaranteedMatch, true);
  });

  it('C1 credential satisfies an English >= B2 vacancy', () => {
    const [preview] = previewJobs([job({ qualification: englishB2 })], PROFILE, CREDENTIAL_C1);
    assert.equal(preview.qualificationRequired, true);
    assert.equal(preview.qualificationSatisfiable, true);
    assert.equal(preview.canProveGuaranteedMatch, true);
  });

  it('no credential means the qualified vacancy is not provable', () => {
    const [preview] = previewJobs([job({ qualification: englishB2 })], PROFILE);
    assert.equal(preview.qualificationRequired, true);
    assert.equal(preview.qualificationSatisfiable, false);
    assert.equal(preview.canProveGuaranteedMatch, false);
  });

  it('a B1 credential does not satisfy B2 — locally, before anything is sent', () => {
    const [preview] = previewJobs([job({ qualification: englishB2 })], PROFILE, {
      ...CREDENTIAL_C1,
      englishLevelLabel: 'B1',
    });
    assert.equal(preview.qualificationSatisfiable, false);
    assert.equal(preview.canProveGuaranteedMatch, false);
  });

  it('an exact B2 credential satisfies B2', () => {
    const [preview] = previewJobs([job({ qualification: englishB2 })], PROFILE, {
      ...CREDENTIAL_C1,
      englishLevelLabel: 'B2',
    });
    assert.equal(preview.qualificationSatisfiable, true);
  });

  it('the qualification gate never rescues an otherwise incompatible vacancy', () => {
    const [preview] = previewJobs(
      [job({ qualification: englishB2, salaryBandFloor: 1_700n })],
      PROFILE,
      CREDENTIAL_C1,
    );
    assert.equal(preview.qualificationSatisfiable, true);
    assert.equal(preview.salaryFit, 'NEGOTIATION_ZONE');
    assert.equal(preview.canProveGuaranteedMatch, false);
  });

  it('an unknown credential label counts as not satisfiable, never as a throw', () => {
    const [preview] = previewJobs([job({ qualification: englishB2 })], PROFILE, {
      ...CREDENTIAL_C1,
      englishLevelLabel: 'native',
    });
    assert.equal(preview.qualificationSatisfiable, false);
  });
});
