/**
 * Tests de inicialización del contrato ProofMatchJob.
 *
 * Cubre el constructor: términos sellados, estado inicial e invariantes.
 * La lógica de compatibilidad privada se prueba en
 * tests/proofmatch-compatibility.test.ts.
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

import { Contract, JobState } from '../contracts/managed/proofmatch-job/contract/index.js';
import { witnesses } from './witnesses.js';
import {
  deployJob,
  readLedger,
  JOB_ID,
  ZERO_JOB_ID,
  MAX_UINT64,
  MAX_UINT8,
  MAX_WEEKLY_HOURS,
} from './helpers.js';

/** Despliega y devuelve solo el estado público resultante. */
const deployedLedger = (jobId: Uint8Array, maximumCompensation: bigint, requiredWeeklyHours: bigint) =>
  readLedger(deployJob(jobId, maximumCompensation, requiredWeeklyHours).context);

describe('ProofMatchJob — inicializacion valida', () => {
  it('fija los terminos de la vacante exactamente como se pasaron', () => {
    const state = deployedLedger(JOB_ID, 5_000_000n, 40n);

    assert.deepEqual(state.jobId, JOB_ID);
    assert.equal(state.jobMaximumCompensation, 5_000_000n);
    assert.equal(state.jobRequiredWeeklyHours, 40n);
  });

  it('deja la vacante en estado OPEN', () => {
    assert.equal(deployedLedger(JOB_ID, 5_000_000n, 40n).jobState, JobState.OPEN);
  });

  it('arranca con matchCount en 0', () => {
    assert.equal(deployedLedger(JOB_ID, 5_000_000n, 40n).matchCount, 0n);
  });

  it('acepta la compensacion minima valida (1)', () => {
    assert.equal(deployedLedger(JOB_ID, 1n, 40n).jobMaximumCompensation, 1n);
  });

  it('acepta el maximo representable en Uint<64>', () => {
    assert.equal(deployedLedger(JOB_ID, MAX_UINT64, 40n).jobMaximumCompensation, MAX_UINT64);
  });

  it('acepta 1 hora semanal requerida', () => {
    assert.equal(deployedLedger(JOB_ID, 5_000_000n, 1n).jobRequiredWeeklyHours, 1n);
  });

  it('acepta exactamente 168 horas semanales (una semana completa)', () => {
    assert.equal(
      deployedLedger(JOB_ID, 5_000_000n, MAX_WEEKLY_HOURS).jobRequiredWeeklyHours,
      MAX_WEEKLY_HOURS,
    );
  });
});

describe('ProofMatchJob — inicializacion invalida', () => {
  it('rechaza el jobId cero', () => {
    assert.throws(
      () => deployedLedger(ZERO_JOB_ID, 5_000_000n, 40n),
      /jobId must not be the zero identifier/,
    );
  });

  it('rechaza compensacion maxima igual a cero', () => {
    assert.throws(
      () => deployedLedger(JOB_ID, 0n, 40n),
      /jobMaximumCompensation must be greater than zero/,
    );
  });

  it('rechaza cero horas semanales requeridas', () => {
    assert.throws(
      () => deployedLedger(JOB_ID, 5_000_000n, 0n),
      /jobRequiredWeeklyHours must be greater than zero/,
    );
  });

  it('rechaza 169 horas semanales requeridas (mas de una semana)', () => {
    assert.throws(
      () => deployedLedger(JOB_ID, 5_000_000n, MAX_WEEKLY_HOURS + 1n),
      /jobRequiredWeeklyHours must not exceed 168/,
    );
  });

  it('rechaza el jobId 0x00..01 solo si es exactamente cero, no si es casi cero', () => {
    // Fija el borde de la comparacion contra `default<Bytes<32>>`: un solo bit
    // distinto de cero ya alcanza para que el jobId sea valido.
    const almostZero = new Uint8Array(32);
    almostZero[31] = 1;

    assert.deepEqual(deployedLedger(almostZero, 5_000_000n, 40n).jobId, almostZero);
  });
});

// Estos casos NO ejercitan los `assert` del contrato: los frena antes el
// type-guard de argumentos que genera el compilador. Van aparte para no
// confundirlos con las invariantes del constructor, y se afirman contra una
// parte estable del mensaje (que argumento fallo), no contra la notacion de
// rango, que es un detalle de codegen.
describe('ProofMatchJob — marshaling de argumentos', () => {
  it('rechaza una compensacion que desborda Uint<64>', () => {
    assert.throws(() => deployedLedger(JOB_ID, MAX_UINT64 + 1n, 40n), /type error.*argument 2/s);
  });

  it('rechaza horas semanales que desbordan Uint<8>', () => {
    assert.throws(() => deployedLedger(JOB_ID, 5_000_000n, MAX_UINT8 + 1n), /type error.*argument 3/s);
  });

  it('rechaza un jobId que no mide 32 bytes', () => {
    assert.throws(
      () => deployedLedger(new Uint8Array(31).fill(1), 5_000_000n, 40n),
      /type error.*argument 1/s,
    );
  });
});

describe('ProofMatchJob — superficie del contrato', () => {
  it('expone proveMatch como unico circuito', () => {
    const contract = new Contract(witnesses);

    assert.deepEqual(Object.keys(contract.circuits), ['proveMatch']);
    assert.deepEqual(Object.keys(contract.impureCircuits), ['proveMatch']);
  });

  it('declara exactamente los tres witnesses del candidato', () => {
    const contract = new Contract(witnesses);

    assert.deepEqual(Object.keys(contract.witnesses).sort(), [
      'candidateAvailableWeeklyHours',
      'candidateMinimumCompensation',
      'candidateSecret',
    ]);
  });

  it('exige que el DApp provea ambos witnesses', () => {
    // @ts-expect-error: se omiten los witnesses a proposito
    assert.throws(() => new Contract({}), /candidateMinimumCompensation/);
  });
});

describe('ProofMatchJob — inmutabilidad de los terminos sellados', () => {
  // `sealed` es una garantia de tiempo de COMPILACION. La unica prueba real es
  // que el compilador rechace un contrato que intente mutar un termino sellado
  // desde un circuito exportado.
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
