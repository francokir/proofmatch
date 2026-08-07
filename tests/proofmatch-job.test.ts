/**
 * Tests contractuales del skeleton de ProofMatch.
 *
 * Etapa: contract/skeleton. Se prueba UNICAMENTE la inicializacion de una
 * vacante: terminos sellados, estado inicial e invariantes del constructor.
 * Todavia no existe matching privado ni nullifier, asi que no hay nada mas
 * que ejercitar.
 *
 * Ejecutar con: npm run test:contract
 * Requiere haber corrido antes: npm run compile
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as RT from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  JobState,
  ledger,
  type Ledger,
} from '../contracts/managed/proofmatch-job/contract/index.js';

// El constructor no toca private state ni Zswap: alcanza con una coin public
// key de relleno, igual que en los ejemplos de la documentacion oficial.
const COIN_PUBLIC_KEY = '0'.repeat(64);

const JOB_ID = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const ZERO_JOB_ID = new Uint8Array(32);

const MAX_UINT64 = 2n ** 64n - 1n;
const MAX_UINT8 = 2n ** 8n - 1n;

/** Horas de una semana calendario: cota superior aceptada por el contrato. */
const MAX_WEEKLY_HOURS = 168n;

/**
 * Ejecuta el constructor del contrato y devuelve el estado publico resultante.
 * Lanza si alguna invariante del constructor falla.
 */
function deployJob(
  jobId: Uint8Array,
  maximumCompensation: bigint,
  requiredWeeklyHours: bigint,
): Ledger {
  const contract = new Contract({});
  const constructorContext = RT.createConstructorContext({}, COIN_PUBLIC_KEY);
  const result = contract.initialState(
    constructorContext,
    jobId,
    maximumCompensation,
    requiredWeeklyHours,
  );
  return ledger(result.currentContractState.data);
}

describe('ProofMatchJob — inicializacion valida', () => {
  it('fija los terminos de la vacante exactamente como se pasaron', () => {
    const state = deployJob(JOB_ID, 5_000_000n, 40n);

    assert.deepEqual(state.jobId, JOB_ID);
    assert.equal(state.jobMaximumCompensation, 5_000_000n);
    assert.equal(state.jobRequiredWeeklyHours, 40n);
  });

  it('deja la vacante en estado OPEN', () => {
    const state = deployJob(JOB_ID, 5_000_000n, 40n);

    assert.equal(state.jobState, JobState.OPEN);
  });

  it('arranca con matchCount en 0', () => {
    const state = deployJob(JOB_ID, 5_000_000n, 40n);

    assert.equal(state.matchCount, 0n);
  });

  it('acepta la compensacion minima valida (1)', () => {
    const state = deployJob(JOB_ID, 1n, 40n);

    assert.equal(state.jobMaximumCompensation, 1n);
  });

  it('acepta el maximo representable en Uint<64>', () => {
    const state = deployJob(JOB_ID, MAX_UINT64, 40n);

    assert.equal(state.jobMaximumCompensation, MAX_UINT64);
  });

  it('acepta 1 hora semanal requerida', () => {
    const state = deployJob(JOB_ID, 5_000_000n, 1n);

    assert.equal(state.jobRequiredWeeklyHours, 1n);
  });

  it('acepta exactamente 168 horas semanales (una semana completa)', () => {
    const state = deployJob(JOB_ID, 5_000_000n, MAX_WEEKLY_HOURS);

    assert.equal(state.jobRequiredWeeklyHours, MAX_WEEKLY_HOURS);
  });
});

describe('ProofMatchJob — inicializacion invalida', () => {
  it('rechaza el jobId cero', () => {
    assert.throws(
      () => deployJob(ZERO_JOB_ID, 5_000_000n, 40n),
      /jobId must not be the zero identifier/,
    );
  });

  it('rechaza compensacion maxima igual a cero', () => {
    assert.throws(
      () => deployJob(JOB_ID, 0n, 40n),
      /jobMaximumCompensation must be greater than zero/,
    );
  });

  it('rechaza cero horas semanales requeridas', () => {
    assert.throws(
      () => deployJob(JOB_ID, 5_000_000n, 0n),
      /jobRequiredWeeklyHours must be greater than zero/,
    );
  });

  it('rechaza 169 horas semanales requeridas (mas de una semana)', () => {
    assert.throws(
      () => deployJob(JOB_ID, 5_000_000n, MAX_WEEKLY_HOURS + 1n),
      /jobRequiredWeeklyHours must not exceed 168/,
    );
  });

  it('rechaza el jobId 0x00..01 solo si es exactamente cero, no si es casi cero', () => {
    // Fija el borde de la comparacion contra `default<Bytes<32>>`: un solo bit
    // distinto de cero ya alcanza para que el jobId sea valido.
    const almostZero = new Uint8Array(32);
    almostZero[31] = 1;

    const state = deployJob(almostZero, 5_000_000n, 40n);

    assert.deepEqual(state.jobId, almostZero);
  });
});

// Estos casos NO ejercitan los `assert` del contrato: los frena antes el
// type-guard de argumentos que genera el compilador. Van aparte para no
// confundirlos con las invariantes del constructor, y se afirman contra una
// parte estable del mensaje (que argumento fallo), no contra la notacion de
// rango, que es un detalle de codegen.
describe('ProofMatchJob — marshaling de argumentos', () => {
  it('rechaza una compensacion que desborda Uint<64>', () => {
    assert.throws(
      () => deployJob(JOB_ID, MAX_UINT64 + 1n, 40n),
      /type error.*argument 2/s,
    );
  });

  it('rechaza horas semanales que desbordan Uint<8>', () => {
    assert.throws(
      () => deployJob(JOB_ID, 5_000_000n, MAX_UINT8 + 1n),
      /type error.*argument 3/s,
    );
  });

  it('rechaza un jobId que no mide 32 bytes', () => {
    assert.throws(
      () => deployJob(new Uint8Array(31).fill(1), 5_000_000n, 40n),
      /type error.*argument 1/s,
    );
  });
});

describe('ProofMatchJob — superficie del contrato en esta etapa', () => {
  it('no expone ningun circuito todavia', () => {
    const contract = new Contract({});

    assert.deepEqual(Object.keys(contract.circuits), []);
    assert.deepEqual(Object.keys(contract.impureCircuits), []);
  });

  it('no declara witnesses: todavia no hay inputs privados', () => {
    const contract = new Contract({});

    assert.deepEqual(Object.keys(contract.witnesses), []);
  });
});

describe('ProofMatchJob — inmutabilidad de los terminos sellados', () => {
  // `sealed` es una garantia de tiempo de COMPILACION: no hay forma de
  // observarla desde los bindings de un contrato que no tiene circuitos. La
  // unica prueba real es que el compilador rechace un contrato que intente
  // mutar un termino sellado desde un circuito exportado.
  it('el compilador rechaza un circuito exportado que muta un termino sellado', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixture = path.join(here, 'fixtures', 'sealed-tamper.compact');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofmatch-sealed-'));

    try {
      assert.throws(
        () => execFileSync('compact', ['compile', fixture, outDir], { stdio: 'pipe' }),
        (err: unknown) => {
          const output = String((err as { stderr?: Buffer; stdout?: Buffer }).stderr ?? '')
            + String((err as { stdout?: Buffer }).stdout ?? '');
          assert.match(output, /exported circuits cannot modify sealed ledger fields/);
          assert.match(output, /jobMaximumCompensation/);
          return true;
        },
      );
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
