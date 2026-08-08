import type { PrivateMatchProfile, PrivateMatchProfileStore } from '../profile';
import { WorkMode } from '../../../contracts/managed/proofmatch-job-v2/contract/index.js';

/**
 * Browser-side store for the reusable Private Match Profile.
 *
 * The Node store writes a `0600` file; the browser equivalent is per-origin
 * storage. The profile holds the candidate's terms — salary floor, hours,
 * location — but deliberately no secret, opening or nullifier, so losing it
 * cannot unmask a past match and it can always be retyped.
 *
 * It is stored unencrypted, unlike the contract-scoped private state, which the
 * SDK encrypts with a password. That is acceptable for a local demo on a
 * machine the candidate controls, and is a real limitation for anything else.
 */
export const BROWSER_PROFILE_KEY = 'proofmatch.v2.private-match-profile';

interface SerialisedProfile {
  minimumCompensation: string;
  availableWeeklyHours: string;
  acceptedWorkModes: number[];
  locationX: string;
  locationY: string;
  maximumCommuteRadius: string;
}

function serialise(profile: PrivateMatchProfile): SerialisedProfile {
  return {
    minimumCompensation: profile.minimumCompensation.toString(),
    availableWeeklyHours: profile.availableWeeklyHours.toString(),
    acceptedWorkModes: profile.acceptedWorkModes.map((mode) => Number(mode)),
    locationX: profile.locationX.toString(),
    locationY: profile.locationY.toString(),
    maximumCommuteRadius: profile.maximumCommuteRadius.toString(),
  };
}

function deserialise(raw: SerialisedProfile): PrivateMatchProfile {
  return {
    minimumCompensation: BigInt(raw.minimumCompensation),
    availableWeeklyHours: BigInt(raw.availableWeeklyHours),
    acceptedWorkModes: raw.acceptedWorkModes.map((mode) => mode as WorkMode),
    locationX: BigInt(raw.locationX),
    locationY: BigInt(raw.locationY),
    maximumCommuteRadius: BigInt(raw.maximumCommuteRadius),
  };
}

export function createBrowserProfileStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.localStorage,
  key: string = BROWSER_PROFILE_KEY,
): PrivateMatchProfileStore {
  return {
    async load() {
      const text = storage.getItem(key);
      if (text === null) return null;
      try {
        return deserialise(JSON.parse(text) as SerialisedProfile);
      } catch {
        // A profile written by an older build is not worth crashing over:
        // it holds no secret, so discarding it costs the candidate a retype.
        storage.removeItem(key);
        return null;
      }
    },
    async save(profile) {
      storage.setItem(key, JSON.stringify(serialise(profile)));
      return profile;
    },
    async clear() {
      storage.removeItem(key);
    },
  };
}
