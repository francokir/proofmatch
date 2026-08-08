import * as fs from 'node:fs';
import * as path from 'node:path';

import type { WorkMode } from '../../contracts/managed/proofmatch-job-v2/contract/index.js';

/**
 * The candidate's reusable Private Match Profile.
 *
 * One profile, many vacancies. The candidate fills this in once and every job
 * reuses it; nothing here is ever sent anywhere.
 *
 * Deliberately absent: any secret, opening or nullifier. Those stay per-job in
 * the Midnight private state (see `private-state.ts`). If the profile carried a
 * single secret shared across vacancies, the same candidate would be
 * recognisable between them — exactly what the per-job derivation prevents.
 *
 * Units are the MVP convention: whole monthly USD, hours per week, metres.
 */
export interface PrivateMatchProfile {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
  readonly acceptedWorkModes: readonly WorkMode[];
  readonly locationX: bigint;
  readonly locationY: bigint;
  readonly maximumCommuteRadius: bigint;
  /** Not yet enforced by the contract. Stored so Stage 3 can use it. */
  readonly maximumOnsiteDays?: bigint;
}

export interface PrivateMatchProfileStore {
  load(): Promise<PrivateMatchProfile | null>;
  save(profile: PrivateMatchProfile): Promise<PrivateMatchProfile>;
  clear(): Promise<void>;
}

/** Default location for the local profile file. Gitignored via `*-state/`. */
export const DEFAULT_PROFILE_PATH = '.proofmatch-v2-state/private-match-profile.json';

interface SerialisedProfile {
  readonly minimumCompensation: string;
  readonly availableWeeklyHours: string;
  readonly acceptedWorkModes: readonly number[];
  readonly locationX: string;
  readonly locationY: string;
  readonly maximumCommuteRadius: string;
  readonly maximumOnsiteDays?: string;
}

const serialise = (p: PrivateMatchProfile): SerialisedProfile => ({
  minimumCompensation: p.minimumCompensation.toString(),
  availableWeeklyHours: p.availableWeeklyHours.toString(),
  acceptedWorkModes: [...p.acceptedWorkModes],
  locationX: p.locationX.toString(),
  locationY: p.locationY.toString(),
  maximumCommuteRadius: p.maximumCommuteRadius.toString(),
  ...(p.maximumOnsiteDays === undefined ? {} : { maximumOnsiteDays: p.maximumOnsiteDays.toString() }),
});

const deserialise = (raw: SerialisedProfile): PrivateMatchProfile => ({
  minimumCompensation: BigInt(raw.minimumCompensation),
  availableWeeklyHours: BigInt(raw.availableWeeklyHours),
  acceptedWorkModes: raw.acceptedWorkModes as readonly WorkMode[],
  locationX: BigInt(raw.locationX),
  locationY: BigInt(raw.locationY),
  maximumCommuteRadius: BigInt(raw.maximumCommuteRadius),
  ...(raw.maximumOnsiteDays === undefined ? {} : { maximumOnsiteDays: BigInt(raw.maximumOnsiteDays) }),
});

/**
 * Rejects a profile the contract would reject anyway, so the candidate finds
 * out while typing instead of halfway through a proof.
 */
export function validateProfile(profile: PrivateMatchProfile): void {
  const fail = (why: string): never => {
    throw new Error(`ProofMatch V2 profile: ${why}`);
  };
  if (profile.minimumCompensation <= 0n) fail('minimumCompensation must be greater than zero');
  if (profile.availableWeeklyHours <= 0n) fail('availableWeeklyHours must be greater than zero');
  if (profile.availableWeeklyHours > 168n) fail('availableWeeklyHours must not exceed 168');
  if (profile.acceptedWorkModes.length === 0) fail('at least one accepted work mode is required');
  if (profile.maximumCommuteRadius <= 0n) fail('maximumCommuteRadius must be greater than zero');
  // Uint<32> is what the circuit uses for coordinates and radius.
  const maxU32 = 2n ** 32n - 1n;
  for (const [label, value] of [
    ['locationX', profile.locationX],
    ['locationY', profile.locationY],
    ['maximumCommuteRadius', profile.maximumCommuteRadius],
  ] as const) {
    if (value < 0n || value > maxU32) fail(`${label} must fit in Uint<32>`);
  }
}

/**
 * File-backed profile store.
 *
 * A plain local file, not the Midnight private-state provider: that provider
 * namespaces everything by contract address and requires `setContractAddress`,
 * so it cannot hold something that is deliberately shared across vacancies.
 *
 * No backend, no network. The file is written with owner-only permissions.
 */
export function createFileProfileStore(filePath = DEFAULT_PROFILE_PATH): PrivateMatchProfileStore {
  const resolved = path.resolve(filePath);

  return {
    async load() {
      if (!fs.existsSync(resolved)) return null;
      const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as SerialisedProfile;
      return deserialise(raw);
    },
    async save(profile) {
      validateProfile(profile);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, `${JSON.stringify(serialise(profile), null, 2)}\n`, { mode: 0o600 });
      return profile;
    },
    async clear() {
      if (fs.existsSync(resolved)) fs.rmSync(resolved);
    },
  };
}

/** In-memory store, for tests and for a browser layer to swap in later. */
export function createInMemoryProfileStore(initial?: PrivateMatchProfile): PrivateMatchProfileStore {
  let current: PrivateMatchProfile | null = initial ?? null;
  return {
    async load() {
      return current;
    },
    async save(profile) {
      validateProfile(profile);
      current = profile;
      return profile;
    },
    async clear() {
      current = null;
    },
  };
}

/** Loads the stored profile, or creates and persists the supplied default. */
export async function createOrLoadPrivateProfile(
  store: PrivateMatchProfileStore,
  fallback: PrivateMatchProfile,
): Promise<PrivateMatchProfile> {
  const existing = await store.load();
  if (existing !== null) return existing;
  return store.save(fallback);
}

/** Applies a partial update and persists the result. */
export async function updatePrivateProfile(
  store: PrivateMatchProfileStore,
  changes: Partial<PrivateMatchProfile>,
): Promise<PrivateMatchProfile> {
  const existing = await store.load();
  if (existing === null) throw new Error('ProofMatch V2 profile: nothing stored to update');
  return store.save({ ...existing, ...changes });
}

/**
 * Fresh 32 bytes from a CSPRNG. Exposed here so a caller never has to invent
 * its own randomness for per-job material.
 */
export function freshOpening(): Uint8Array {
  // Web Crypto, not node:crypto: this module runs in the browser too,
  // and both are CSPRNGs of the same strength.
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
