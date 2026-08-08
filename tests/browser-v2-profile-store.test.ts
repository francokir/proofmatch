import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WorkMode } from '../contracts/managed/proofmatch-job-v2/contract/index.js';
import { createBrowserProfileStore } from '../src/proofmatch-v2/browser/profile-store';
import type { PrivateMatchProfile } from '../src/proofmatch-v2/profile';

/** Stand-in for `window.localStorage`, which only stores strings. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    get size() {
      return map.size;
    },
    raw: (key: string) => map.get(key),
  };
}

const PROFILE: PrivateMatchProfile = {
  minimumCompensation: 1_753n,
  availableWeeklyHours: 27n,
  acceptedWorkModes: [WorkMode.REMOTE, WorkMode.HYBRID],
  locationX: 1_437n,
  locationY: 1_291n,
  maximumCommuteRadius: 1_234n,
};

describe('browser profile store', () => {
  it('round-trips a profile through string-only storage', async () => {
    // bigints do not survive JSON, and work modes are a numeric enum. A naive
    // JSON.stringify throws on the first and silently corrupts the second.
    const storage = fakeStorage();
    const store = createBrowserProfileStore(storage, 'test-key');
    await store.save(PROFILE);
    assert.deepEqual(await store.load(), PROFILE);
  });

  it('returns null when nothing was ever saved', async () => {
    assert.equal(await createBrowserProfileStore(fakeStorage(), 'test-key').load(), null);
  });

  it('clears the stored profile', async () => {
    const storage = fakeStorage();
    const store = createBrowserProfileStore(storage, 'test-key');
    await store.save(PROFILE);
    await store.clear();
    assert.equal(await store.load(), null);
  });

  it('discards an unreadable profile instead of throwing', async () => {
    // A profile written by an older build holds no secret, so dropping it costs
    // a retype. Throwing here would break the whole studio on load.
    const storage = fakeStorage({ 'test-key': 'not json at all' });
    assert.equal(await createBrowserProfileStore(storage, 'test-key').load(), null);
    assert.equal(storage.raw('test-key'), undefined);
  });

  it('never writes a secret, an opening or a nullifier', async () => {
    const storage = fakeStorage();
    await createBrowserProfileStore(storage, 'test-key').save(PROFILE);
    const written = storage.raw('test-key') ?? '';
    // The profile is what makes the candidate reusable across vacancies; per-job
    // material in it would make the same candidate recognisable between them.
    for (const forbidden of ['secret', 'opening', 'nullifier']) {
      assert.equal(written.toLowerCase().includes(forbidden), false, `stored profile leaked ${forbidden}`);
    }
    assert.deepEqual(
      Object.keys(JSON.parse(written)).sort(),
      ['acceptedWorkModes', 'availableWeeklyHours', 'locationX', 'locationY', 'maximumCommuteRadius', 'minimumCompensation'],
    );
  });
});
