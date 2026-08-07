/**
 * Helpers for the ProofMatchJobV2 contract tests.
 *
 * V1 helpers live in tests/helpers.ts and are untouched: the two suites run
 * side by side so a V2 regression can never be mistaken for a V1 one.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as RT from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  ledger,
  WorkMode,
  type Ledger,
  type Witnesses,
} from '../contracts/managed/proofmatch-job-v2/contract/index.js';

export { WorkMode };
export type V2Ledger = Ledger;

export const COIN_PUBLIC_KEY = '0'.repeat(64);
export const JOB_ID = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
export const ZERO_32 = new Uint8Array(32);

/** Deterministic 32-byte test material. NOT a pattern for production. */
export const testBytes = (seed: number): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => (seed * 37 + i * 11 + 3) % 256);

export const EMPLOYER_SECRET = testBytes(10);
export const EMPLOYER_OPENING = testBytes(11);
export const CANDIDATE_SECRET = testBytes(20);
export const SALARY_OPENING = testBytes(21);
export const HOURS_OPENING = testBytes(22);

/** Two distinct, deterministic contract addresses. */
export const ADDRESS_1 = 'a'.repeat(64);
export const ADDRESS_2 = 'b'.repeat(64);

/** Default vacancy: band 1800–2100, 20 h/week, HYBRID, office at (1000, 1000). */
export const BAND_FLOOR = 1_800n;
export const BAND_CEILING = 2_100n;
export const REQUIRED_HOURS = 20n;
export const OFFICE_X = 1_000n;
export const OFFICE_Y = 1_000n;

export interface V2PrivateState {
  // employer
  exactMaximumCompensation?: bigint;
  budgetOpening?: Uint8Array;
  employerSecretBytes?: Uint8Array;
  // candidate
  minimumCompensation?: bigint;
  availableWeeklyHours?: bigint;
  acceptedWorkModes?: readonly WorkMode[];
  locationX?: bigint;
  locationY?: bigint;
  commuteRadius?: bigint;
  candidateSecretBytes?: Uint8Array;
  salaryOpening?: Uint8Array;
  hoursOpening?: Uint8Array;
}

/** Witnesses wired straight to the test private state, with no validation. */
export function makeWitnesses(): Witnesses<V2PrivateState> {
  const w = <T>(pick: (s: V2PrivateState) => T) =>
    ({ privateState }: { privateState: V2PrivateState }): [V2PrivateState, T] => [
      privateState,
      pick(privateState),
    ];
  return {
    employerSecret: w((s) => s.employerSecretBytes as Uint8Array),
    employerMaxCompensation: w((s) => s.exactMaximumCompensation as bigint),
    employerBudgetOpening: w((s) => s.budgetOpening as Uint8Array),
    candidateMinimumCompensation: w((s) => s.minimumCompensation as bigint),
    candidateAvailableWeeklyHours: w((s) => s.availableWeeklyHours as bigint),
    candidateSecret: w((s) => s.candidateSecretBytes as Uint8Array),
    candidateAcceptsWorkMode: ({ privateState }, mode: WorkMode) => [
      privateState,
      (privateState.acceptedWorkModes ?? []).includes(mode),
    ],
    candidateLocationX: w((s) => s.locationX as bigint),
    candidateLocationY: w((s) => s.locationY as bigint),
    candidateCommuteRadius: w((s) => s.commuteRadius as bigint),
    candidateSalaryOpening: w((s) => s.salaryOpening as Uint8Array),
    candidateHoursOpening: w((s) => s.hoursOpening as Uint8Array),
  };
}

export const employerState = (cap: bigint, over: Partial<V2PrivateState> = {}): V2PrivateState => ({
  exactMaximumCompensation: cap,
  budgetOpening: EMPLOYER_OPENING,
  employerSecretBytes: EMPLOYER_SECRET,
  ...over,
});

export const candidateState = (
  salary: bigint,
  hours: bigint,
  over: Partial<V2PrivateState> = {},
): V2PrivateState => ({
  minimumCompensation: salary,
  availableWeeklyHours: hours,
  acceptedWorkModes: [WorkMode.REMOTE, WorkMode.HYBRID],
  locationX: 1_500n,
  locationY: 1_000n,
  commuteRadius: 1_000n,
  candidateSecretBytes: CANDIDATE_SECRET,
  salaryOpening: SALARY_OPENING,
  hoursOpening: HOURS_OPENING,
  ...over,
});

export interface V2Deployment {
  readonly contract: Contract<V2PrivateState>;
  readonly context: RT.CircuitContext<V2PrivateState>;
}

export interface DeployOptions {
  jobId?: Uint8Array;
  bandFloor?: bigint;
  bandCeiling?: bigint;
  requiredHours?: bigint;
  workMode?: WorkMode;
  officeX?: bigint;
  officeY?: bigint;
  employerSk?: Uint8Array;
  address?: string;
  privateState?: V2PrivateState;
  witnesses?: Witnesses<V2PrivateState>;
}

export function deployV2(options: DeployOptions = {}): V2Deployment {
  const {
    jobId = JOB_ID,
    bandFloor = BAND_FLOOR,
    bandCeiling = BAND_CEILING,
    requiredHours = REQUIRED_HOURS,
    workMode = WorkMode.HYBRID,
    officeX = OFFICE_X,
    officeY = OFFICE_Y,
    employerSk = EMPLOYER_SECRET,
    address = ADDRESS_1,
    privateState = {},
    witnesses = makeWitnesses(),
  } = options;

  const contract = new Contract<V2PrivateState>(witnesses);
  const result = contract.initialState(
    RT.createConstructorContext(privateState, COIN_PUBLIC_KEY),
    jobId, bandFloor, bandCeiling, requiredHours, workMode, officeX, officeY, employerSk,
  );
  const context = RT.createCircuitContext(
    address, COIN_PUBLIC_KEY, result.currentContractState, result.currentPrivateState,
  );
  return { contract, context };
}

export const readV2 = (context: RT.CircuitContext<V2PrivateState>): Ledger =>
  ledger(context.currentQueryContext.state);

/** Swaps the private state on a context without re-deploying. */
export function withPrivateState(
  context: RT.CircuitContext<V2PrivateState>,
  privateState: V2PrivateState,
  address = ADDRESS_1,
): RT.CircuitContext<V2PrivateState> {
  return RT.createCircuitContext(
    address, COIN_PUBLIC_KEY, context.currentQueryContext.state, privateState,
  );
}

/** Deploys a vacancy and locks the employer budget in one step. */
export function deployAndLock(options: DeployOptions = {}, cap = 1_960n): V2Deployment {
  const dep = deployV2({ ...options, privateState: employerState(cap) });
  const locked = dep.contract.impureCircuits.lockPrivateBudget(dep.context);
  return { contract: dep.contract, context: locked.context };
}

// ─── Transcript inspection ───────────────────────────────────────────────────

const opName = (op: unknown): string =>
  typeof op === 'string' ? op : Object.keys(op as object)[0] ?? '';

const WRITE_OPS = new Set(['ins', 'addi']);

/** True when every public write happens after the last public read. */
export function writeHappensAfterAllReads(publicTranscript: readonly unknown[]): boolean {
  const names = publicTranscript.map(opName);
  const firstWrite = names.findIndex((n) => WRITE_OPS.has(n));
  const lastRead = names.lastIndexOf('popeq');
  return lastRead !== -1 && firstWrite > lastRead;
}

/** Every Uint8Array appearing anywhere in the transcript, hex-encoded. */
export function bytesInTranscript(publicTranscript: readonly unknown[]): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (node instanceof Uint8Array) {
      found.push(Buffer.from(node).toString('hex'));
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (node !== null && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(publicTranscript);
  return found;
}

/** Every bigint appearing anywhere in the transcript. */
export function bigintsInTranscript(publicTranscript: readonly unknown[]): bigint[] {
  const found: bigint[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'bigint') return void found.push(node);
    if (node instanceof Uint8Array) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node !== null && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(publicTranscript);
  return found;
}

// ─── Commitment recomputation (Consent Reveal verification) ──────────────────

export const pad32 = (text: string): Uint8Array => {
  const padded = new Uint8Array(32);
  padded.set(new TextEncoder().encode(text));
  return padded;
};

export const NULLIFIER_DOMAIN = 'proofmatch:v2:job-nullifier:v1';
export const EMPLOYER_KEY_DOMAIN = 'proofmatch:v2:employer-key:v1';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Recomputes `jobNullifier` outside the contract. */
export function expectedNullifier(contractAddress: string, secret: Uint8Array): string {
  const t = new RT.CompactTypeVector(3, new RT.CompactTypeBytes(32));
  return hex(RT.persistentHash(t, [
    pad32(NULLIFIER_DOMAIN), Uint8Array.from(Buffer.from(contractAddress, 'hex')), secret,
  ]));
}

/** Recomputes `employerKey` outside the contract. */
export function expectedEmployerKey(secret: Uint8Array): string {
  const t = new RT.CompactTypeVector(2, new RT.CompactTypeBytes(32));
  return hex(RT.persistentHash(t, [pad32(EMPLOYER_KEY_DOMAIN), secret]));
}

/**
 * Recomputes `persistentCommit` for a Uint value. This is exactly what a
 * Consent Reveal verifier does: given a claimed value and its opening, check
 * that it reproduces the commitment already on the ledger.
 */
export function expectedCommitment(value: bigint, opening: Uint8Array, bits: number): string {
  const t = new RT.CompactTypeUnsignedInteger(2n ** BigInt(bits) - 1n, Math.ceil(bits / 8));
  return hex(RT.persistentCommit(t, value, opening));
}

// ─── Fixtures compiled on demand ─────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_OUT_ROOT = path.resolve(HERE, '..', 'contracts', 'managed', '_test-fixtures');
const fixtureCache = new Map<string, unknown>();

export async function loadV2Fixture(name: string): Promise<any> {
  const cached = fixtureCache.get(name);
  if (cached !== undefined) return cached;
  const source = path.join(HERE, 'fixtures', `${name}.compact`);
  const outDir = path.join(FIXTURE_OUT_ROOT, name);
  execFileSync('compact', ['compile', '--skip-zk', source, outDir], { stdio: 'pipe' });
  const compiled = await import(pathToFileURL(path.join(outDir, 'contract', 'index.js')).href);
  fixtureCache.set(name, compiled);
  return compiled;
}
