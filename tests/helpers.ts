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
import { witnesses, testSecret, type CandidatePrivateState } from './witnesses.js';

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
  privateState: CandidatePrivateState = {
    minimumCompensation: 1n,
    availableWeeklyHours: 1n,
    secret: testSecret(1),
  },
  candidateWitnesses: Witnesses<CandidatePrivateState> = witnesses,
  contractAddress: string = RT.dummyContractAddress(),
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
    contractAddress,
    COIN_PUBLIC_KEY,
    result.currentContractState,
    result.currentPrivateState,
  );
  return { contract, context };
}

/** Único nullifier registrado en el ledger, o `undefined` si no hay ninguno. */
export function soleNullifier(context: RT.CircuitContext<CandidatePrivateState>): Uint8Array | undefined {
  return [...readLedger(context).usedNullifiers][0];
}

/** Todos los nullifiers registrados, en hex, para comparaciones legibles. */
export function nullifiersHex(context: RT.CircuitContext<CandidatePrivateState>): string[] {
  return [...readLedger(context).usedNullifiers].map((n) => Buffer.from(n).toString('hex'));
}

/** Lee el estado público de un contexto de circuito. */
export function readLedger(context: RT.CircuitContext<CandidatePrivateState>): Ledger {
  return ledger(context.currentQueryContext.state);
}

// ─── Inspección del transcript público ───────────────────────────────────────

/** Nombre de la operación de un op del transcript (`'lt'` viene como string). */
const opName = (op: unknown): string =>
  typeof op === 'string' ? op : Object.keys(op as object)[0] ?? '';

/** Ops que mutan estado público: `ins` (escribir/insertar) y `addi` (Counter). */
const WRITE_OPS = new Set(['ins', 'addi']);

/**
 * ¿TODAS las escrituras públicas ocurren después de la última lectura?
 *
 * En el transcript, una lectura de ledger termina en `popeq`; escribir una celda
 * o insertar en un `Set` emite `ins`, y un `Counter` emite `addi`.
 *
 * OJO con lo que esto prueba y lo que no: los `assert` de Compact son
 * constraints del circuito y NO emiten operaciones en el transcript público.
 * Así que esto establece el orden **lectura → escritura**, no que el circuito
 * haya validado algo. Un contrato que leyera todo, no validara nada y después
 * escribiera también daría `true`.
 *
 * Que las validaciones existan y muerdan lo cubren los tests de rechazo; que las
 * escrituras vayan al final lo cubre esto. Contrastar con el fixture
 * `proofmatch-job-mutates-first`, donde da `false`.
 */
export function writeHappensAfterAllReads(publicTranscript: readonly unknown[]): boolean {
  const names = publicTranscript.map(opName);
  const firstWrite = names.findIndex((n) => WRITE_OPS.has(n));
  const lastRead = names.lastIndexOf('popeq');
  return lastRead !== -1 && firstWrite > lastRead;
}

/** Cantidad de operaciones de escritura en el transcript. */
export function countWriteOps(publicTranscript: readonly unknown[]): number {
  return publicTranscript.map(opName).filter((n) => WRITE_OPS.has(n)).length;
}

// ─── Observar mutaciones parciales ───────────────────────────────────────────

/**
 * Llama al circuito de forma que las mutaciones sean observables aunque lance.
 *
 * Por qué hace falta: el wrapper generado copia el `CircuitContext` y
 * `queryLedgerState` reasigna `currentQueryContext` sobre la copia. El contexto
 * del caller NO cambia nunca — ni siquiera en una llamada exitosa. Por eso
 * comparar el ledger antes y después de un `throw` no prueba nada: da igual
 * contra un contrato que muta antes de validar.
 *
 * Acá se invoca el circuito interno (`_proveMatch_0`) con un contexto propio y
 * un `partialProofData` propio, que sí quedan mutados con lo que el circuito
 * alcanzó a escribir antes de abortar.
 *
 * Verificado que discrimina: contra el contrato real un fallo deja 0 escrituras;
 * contra `proofmatch-job-mutates-first` deja 4 y el nullifier ya consumido.
 */
export function proveMatchObservingWrites(
  contract: { _proveMatch_0(context: unknown, partialProofData: unknown): unknown },
  context: RT.CircuitContext<CandidatePrivateState>,
): {
  readonly threw: Error | undefined;
  readonly writeOps: number;
  readonly context: RT.CircuitContext<CandidatePrivateState>;
} {
  const own = { ...context, gasCost: RT.emptyRunningCost() };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [] as unknown[],
    privateTranscriptOutputs: [] as unknown[],
  };

  let threw: Error | undefined;
  try {
    contract._proveMatch_0(own, partialProofData);
  } catch (err) {
    threw = err as Error;
  }

  return { threw, writeOps: countWriteOps(partialProofData.publicTranscript), context: own };
}

// ─── Golden vector del nullifier ─────────────────────────────────────────────

/** `pad(32, s)` de Compact: los bytes UTF-8 de `s`, rellenados con ceros a 32. */
export function pad32(text: string): Uint8Array {
  const padded = new Uint8Array(32);
  padded.set(new TextEncoder().encode(text));
  return padded;
}

/** Domain separator del nullifier. Debe coincidir con el del contrato. */
export const NULLIFIER_DOMAIN = 'proofmatch:job-nullifier:v1';

/**
 * Recomputa, fuera del contrato, el nullifier que `jobNullifier` debería
 * producir para una dirección y un secreto dados.
 *
 * Es el golden vector de la etapa: fija el domain separator, el orden de los
 * tres campos del preimage y el uso de la dirección de la instancia. Sin esto,
 * un contrato que omitiera el domain separator pasaría igual todos los demás
 * tests, porque determinismo y unicidad se cumplirían de todos modos.
 */
export function expectedNullifier(contractAddress: string, secret: Uint8Array): string {
  const rtType = new RT.CompactTypeVector(3, new RT.CompactTypeBytes(32));
  const digest = RT.persistentHash(rtType, [
    pad32(NULLIFIER_DOMAIN),
    Uint8Array.from(Buffer.from(contractAddress, 'hex')),
    secret,
  ]);
  return Buffer.from(digest).toString('hex');
}

/** Todos los `Uint8Array` que aparecen en el transcript, en hex. */
export function bytesInTranscript(publicTranscript: readonly unknown[]): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (node instanceof Uint8Array) {
      found.push(Buffer.from(node).toString('hex'));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node !== null && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(publicTranscript);
  return found;
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
  deploy(privateState: CandidatePrivateState, contractAddress?: string): FixtureDeployment;
  /** Igual que `deploy`, pero con witnesses propios (para tests instrumentados). */
  deployWith(
    privateState: CandidatePrivateState,
    candidateWitnesses: Witnesses<CandidatePrivateState>,
    contractAddress?: string,
  ): FixtureDeployment;
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

  const deployWith: FixtureContract['deployWith'] = (
    privateState,
    candidateWitnesses,
    contractAddress = RT.dummyContractAddress(),
  ) => {
    const contract = new compiled.Contract(candidateWitnesses);
    const result = contract.initialState(
      RT.createConstructorContext(privateState, COIN_PUBLIC_KEY),
      JOB_ID,
      5_000n,
      40n,
    );
    const context = RT.createCircuitContext(
      contractAddress,
      COIN_PUBLIC_KEY,
      result.currentContractState,
      result.currentPrivateState,
    );
    return { contract, context };
  };

  const fixture: FixtureContract = {
    deploy: (privateState, contractAddress) =>
      deployWith(privateState, witnesses, contractAddress),
    deployWith,
    readLedger: (context) => compiled.ledger(context.currentQueryContext.state),
  };

  fixtureCache.set(name, fixture);
  return fixture;
}
