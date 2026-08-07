/**
 * Helpers compartidos por los tests contractuales de ProofMatch.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as RT from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  ledger,
  type Ledger,
  type Witnesses,
} from '../contracts/managed/proofmatch-job/contract/index.js';
import { witnesses, type CandidatePrivateState } from './witnesses.js';

/** Coin public key de relleno: el contrato no usa Zswap. */
export const COIN_PUBLIC_KEY = '0'.repeat(64);

export const JOB_ID = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
export const ZERO_JOB_ID = new Uint8Array(32);

export const MAX_UINT64 = 2n ** 64n - 1n;
export const MAX_UINT8 = 2n ** 8n - 1n;

/** Horas de una semana calendario: cota superior aceptada por el contrato. */
export const MAX_WEEKLY_HOURS = 168n;

export type Deployment = {
  readonly contract: Contract<CandidatePrivateState>;
  readonly context: RT.CircuitContext<CandidatePrivateState>;
};

/**
 * Ejecuta el constructor y devuelve un contexto de circuito listo para llamar
 * `proveMatch`. Lanza si alguna invariante del constructor falla.
 */
export function deployJob(
  jobId: Uint8Array,
  maximumCompensation: bigint,
  requiredWeeklyHours: bigint,
  privateState: CandidatePrivateState = { minimumCompensation: 1n, availableWeeklyHours: 1n },
  candidateWitnesses: Witnesses<CandidatePrivateState> = witnesses,
): Deployment {
  const contract = new Contract<CandidatePrivateState>(candidateWitnesses);
  const constructorContext = RT.createConstructorContext(privateState, COIN_PUBLIC_KEY);
  const result = contract.initialState(
    constructorContext,
    jobId,
    maximumCompensation,
    requiredWeeklyHours,
  );
  const context = RT.createCircuitContext(
    RT.dummyContractAddress(),
    COIN_PUBLIC_KEY,
    result.currentContractState,
    result.currentPrivateState,
  );
  return { contract, context };
}

/** Lee el estado público de un contexto de circuito. */
export function readLedger(context: RT.CircuitContext<CandidatePrivateState>): Ledger {
  return ledger(context.currentQueryContext.state);
}

// ─── Inspección del transcript público ───────────────────────────────────────

/** Nombre de la operación de un op del transcript (`'lt'` viene como string). */
const opName = (op: unknown): string =>
  typeof op === 'string' ? op : Object.keys(op as object)[0] ?? '';

/**
 * ¿La escritura pública ocurre después de todas las lecturas?
 *
 * En el transcript, una lectura de ledger termina en `popeq` y el incremento de
 * un `Counter` es `idx(pushPath) → addi → ins`. Si el `addi` está después del
 * último `popeq`, entonces el circuito leyó y validó todo antes de escribir.
 *
 * Esta es la única comprobación mecánica de que `matchCount += 1` va al final:
 * ni el compilador ni el runtime obligan ese orden. Contrastar con el fixture
 * `proofmatch-job-mutates-first`, donde da `false`.
 */
export function writeHappensAfterAllReads(publicTranscript: readonly unknown[]): boolean {
  const names = publicTranscript.map(opName);
  const write = names.indexOf('addi');
  const lastRead = names.lastIndexOf('popeq');
  return write > lastRead && lastRead !== -1;
}

/** Cantidad de operaciones de escritura en el transcript. */
export function countWriteOps(publicTranscript: readonly unknown[]): number {
  return publicTranscript.map(opName).filter((n) => n === 'addi' || n === 'ins').length;
}

// ─── Fixtures compilados bajo demanda ────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Los fixtures se compilan dentro de `contracts/managed/`, que está en
 * .gitignore, así que no ensucian el repositorio. `npm run clean` los borra y
 * la suite los regenera.
 */
const FIXTURE_OUT_ROOT = path.resolve(HERE, '..', 'contracts', 'managed', '_test-fixtures');

type FixtureDeployment = {
  readonly contract: { impureCircuits: { proveMatch(context: unknown): { context: unknown } } };
  readonly context: RT.CircuitContext<CandidatePrivateState>;
};

type FixtureContract = {
  deploy(privateState: CandidatePrivateState): FixtureDeployment;
  readLedger(context: RT.CircuitContext<CandidatePrivateState>): Ledger;
};

const fixtureCache = new Map<string, FixtureContract>();

/**
 * Compila un fixture `.compact` de tests/fixtures y devuelve helpers para
 * desplegarlo y leer su estado.
 *
 * Se usa `--skip-zk`: estos fixtures se ejecutan en el simulador, no necesitan
 * proving keys, y generarlas multiplicaría el tiempo de la suite.
 */
export async function loadFixtureContract(name: string): Promise<FixtureContract> {
  const cached = fixtureCache.get(name);
  if (cached !== undefined) return cached;

  const source = path.join(HERE, 'fixtures', `${name}.compact`);
  const outDir = path.join(FIXTURE_OUT_ROOT, name);
  execFileSync('compact', ['compile', '--skip-zk', source, outDir], { stdio: 'pipe' });

  const compiled = await import(pathToFileURL(path.join(outDir, 'contract', 'index.js')).href);

  const fixture: FixtureContract = {
    deploy(privateState) {
      const contract = new compiled.Contract(witnesses);
      const result = contract.initialState(
        RT.createConstructorContext(privateState, COIN_PUBLIC_KEY),
        JOB_ID,
        5_000n,
        40n,
      );
      const context = RT.createCircuitContext(
        RT.dummyContractAddress(),
        COIN_PUBLIC_KEY,
        result.currentContractState,
        result.currentPrivateState,
      );
      return { contract, context };
    },
    readLedger: (context) => compiled.ledger(context.currentQueryContext.state),
  };

  fixtureCache.set(name, fixture);
  return fixture;
}
