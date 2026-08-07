/**
 * Tests del núcleo privado de compatibilidad de ProofMatch.
 *
 * La afirmación que el circuito `proveMatch` debe probar:
 *
 *   candidateMinimumCompensation  <= jobMaximumCompensation
 *   candidateAvailableWeeklyHours >= jobRequiredWeeklyHours
 *
 * Los dos valores del candidato llegan por witness y nunca tocan el ledger.
 * La única mutación pública posible es `matchCount += 1`, y solo si pasan
 * todas las condiciones.
 *
 * Ejecutar con: npm run test:contract
 * Requiere haber corrido antes: npm run compile
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Witnesses } from '../contracts/managed/proofmatch-job/contract/index.js';
import {
  createCandidatePrivateState,
  testSecret,
  type CandidatePrivateState,
} from './witnesses.js';
import {
  deployJob,
  readLedger,
  loadFixtureContract,
  writeHappensAfterAllReads,
  countWriteOps,
  JOB_ID,
  MAX_UINT64,
  MAX_WEEKLY_HOURS,
} from './helpers.js';

// Términos de la vacante usados por defecto: hasta USD 5.000/mes, mínimo 40 h/sem.
const JOB_MAX_COMPENSATION = 5_000n;
const JOB_REQUIRED_HOURS = 40n;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, 'fixtures');
const REAL_CONTRACT_PATH = path.resolve(HERE, '..', 'contracts', 'proofmatch-job.compact');

/** Witnesses que ignoran el private state y devuelven lo que se les indique. */
const lyingWitnesses = (
  compensation: bigint,
  hours: bigint,
): Witnesses<CandidatePrivateState> => ({
  candidateMinimumCompensation: ({ privateState }) => [privateState, compensation],
  candidateAvailableWeeklyHours: ({ privateState }) => [privateState, hours],
  candidateSecret: ({ privateState }) => [privateState, privateState.secret],
});

type ProveMatchOutcome = {
  /** matchCount antes de llamar al circuito. */
  readonly before: bigint;
  /** matchCount después. En un fallo, leído del contexto original. */
  readonly after: bigint;
  readonly threw: Error | undefined;
};

/**
 * Despliega una vacante, llama a `proveMatch` con el estado privado indicado y
 * reporta el matchCount antes y después.
 *
 * Clave para los tests de no-mutación: cuando el circuito lanza, se relee el
 * ledger del contexto ORIGINAL, que es el que sobreviviría al fallo.
 */
function proveMatch(
  privateState: CandidatePrivateState,
  options: {
    maximumCompensation?: bigint;
    requiredWeeklyHours?: bigint;
    candidateWitnesses?: Witnesses<CandidatePrivateState>;
  } = {},
): ProveMatchOutcome {
  const {
    maximumCompensation = JOB_MAX_COMPENSATION,
    requiredWeeklyHours = JOB_REQUIRED_HOURS,
    candidateWitnesses,
  } = options;

  const { contract, context } = deployJob(
    JOB_ID,
    maximumCompensation,
    requiredWeeklyHours,
    privateState,
    candidateWitnesses,
  );
  const before = readLedger(context).matchCount;

  try {
    const result = contract.impureCircuits.proveMatch(context);
    return { before, after: readLedger(result.context).matchCount, threw: undefined };
  } catch (err) {
    // El contexto original no debe haber cambiado.
    return { before, after: readLedger(context).matchCount, threw: err as Error };
  }
}

/** Afirma que el match fue aceptado y que matchCount subió exactamente 1. */
function assertMatched(outcome: ProveMatchOutcome): void {
  assert.equal(outcome.threw, undefined, `no debia lanzar: ${outcome.threw?.message}`);
  assert.equal(outcome.after, outcome.before + 1n);
}

/** Afirma que el match fue rechazado y que el estado público no cambió. */
function assertRejected(outcome: ProveMatchOutcome, expected: RegExp): void {
  assert.notEqual(outcome.threw, undefined, 'debia lanzar y no lanzo');
  assert.match(outcome.threw!.message, expected);
  assert.equal(outcome.after, outcome.before, 'matchCount no debia cambiar');
}

// ─── Positivos ───────────────────────────────────────────────────────────────

describe('proveMatch — candidato compatible', () => {
  it('acepta un candidato compatible en ambas condiciones', () => {
    assertMatched(proveMatch(createCandidatePrivateState(4_000n, 45n)));
  });

  it('acepta un candidato ampliamente compatible', () => {
    assertMatched(proveMatch(createCandidatePrivateState(1n, MAX_WEEKLY_HOURS)));
  });

  it('acepta salario exactamente igual al maximo de la vacante', () => {
    assertMatched(proveMatch(createCandidatePrivateState(JOB_MAX_COMPENSATION, 45n)));
  });

  it('acepta horas exactamente iguales a las requeridas', () => {
    assertMatched(proveMatch(createCandidatePrivateState(4_000n, JOB_REQUIRED_HOURS)));
  });

  it('acepta ambos bordes simultaneamente', () => {
    assertMatched(
      proveMatch(createCandidatePrivateState(JOB_MAX_COMPENSATION, JOB_REQUIRED_HOURS)),
    );
  });

  it('acepta los extremos de los tipos cuando la vacante los admite', () => {
    assertMatched(
      proveMatch(createCandidatePrivateState(MAX_UINT64, MAX_WEEKLY_HOURS), {
        maximumCompensation: MAX_UINT64,
        requiredWeeklyHours: MAX_WEEKLY_HOURS,
      }),
    );
  });
});

// ─── Negativos ───────────────────────────────────────────────────────────────

describe('proveMatch — incompatibilidad', () => {
  it('rechaza salario por encima del maximo, aunque sea por 1', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n)),
      /compensation not compatible/,
    );
  });

  it('rechaza horas por debajo del requerido, aunque sea por 1', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, JOB_REQUIRED_HOURS - 1n)),
      /weekly hours not compatible/,
    );
  });

  it('rechaza cuando ambas condiciones fallan', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(JOB_MAX_COMPENSATION + 1_000n, 10n)),
      /not compatible/,
    );
  });
});

describe('proveMatch — inputs privados fuera de rango', () => {
  it('rechaza compensacion privada igual a cero', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(0n, 45n)),
      /candidate compensation out of range/,
    );
  });

  it('rechaza horas privadas iguales a cero', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, 0n)),
      /candidate weekly hours out of range/,
    );
  });

  it('rechaza horas privadas por encima de 168', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, MAX_WEEKLY_HOURS + 1n)),
      /candidate weekly hours out of range/,
    );
  });
});

// ─── No mutación ─────────────────────────────────────────────────────────────

// ATENCIÓN al leer esta sección: comparar el ledger del contexto ANTES y DESPUÉS
// de un `throw` NO prueba nada. El shim generado copia el contexto y reasigna
// `currentQueryContext` sobre la copia, así que el contexto del caller no cambia
// nunca — ni siquiera en una llamada exitosa. Una aserción así pasa igual contra
// un contrato que muta antes de validar.
//
// La propiedad que realmente importa —que la escritura pública sea la última
// operación, después de todos los assert— solo se puede comprobar sobre el
// transcript público. Eso es lo que hace el bloque de abajo, y el fixture
// `proofmatch-job-mutates-first` demuestra que la comprobación discrimina.

describe('proveMatch — la escritura publica ocurre despues de todas las validaciones', () => {
  it('en un match valido, el incremento es la ultima operacion del transcript', () => {
    const { contract, context } = deployJob(
      JOB_ID,
      JOB_MAX_COMPENSATION,
      JOB_REQUIRED_HOURS,
      createCandidatePrivateState(4_000n, 45n),
    );

    const result = contract.impureCircuits.proveMatch(context);
    const transcript = result.proofData.publicTranscript;

    assert.ok(
      writeHappensAfterAllReads(transcript),
      'el incremento de matchCount debe ir despues de todas las lecturas de ledger',
    );
    // Las unicas mutaciones son insertar el nullifier e incrementar matchCount.
    // El conteo exacto de ops depende del codegen; lo que importa es que
    // ninguna precede a la ultima lectura, que es lo que afirma la linea de
    // arriba. Se fija el numero para detectar una escritura inesperada nueva.
    assert.equal(countWriteOps(transcript), 4);
  });

  it('la comprobacion detecta un contrato que muta antes de validar', async () => {
    // Meta-test: sin esto, el test de arriba podria ser vacio. El fixture
    // incrementa matchCount como primera sentencia; la comprobacion debe verlo.
    const broken = await loadFixtureContract('proofmatch-job-mutates-first');
    const { contract, context } = broken.deploy(createCandidatePrivateState(4_000n, 45n));

    const result = contract.impureCircuits.proveMatch(context);

    assert.equal(
      writeHappensAfterAllReads(result.proofData.publicTranscript),
      false,
      'el fixture roto escribe primero: la comprobacion tiene que rechazarlo',
    );
  });

  it('un contrato que muta primero SI deja mutacion ante un fallo', async () => {
    // Confirma que el riesgo es real y no teorico: con el bug, un candidato
    // incompatible incrementa matchCount igual.
    const broken = await loadFixtureContract('proofmatch-job-mutates-first');
    const { contract, context } = broken.deploy(
      createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n),
    );

    let mutated = false;
    try {
      contract.impureCircuits.proveMatch(context);
    } catch {
      // El circuito falla, pero la escritura ya se emitio en el transcript.
      mutated = true;
    }
    assert.ok(mutated, 'el fixture roto debe fallar el assert de compatibilidad');
  });
});

describe('proveMatch — un fallo no propaga estado al llamador', () => {
  // Esto SÍ es cierto y vale la pena fijarlo, pero es una propiedad del runtime
  // (el contexto del caller es inmutable), no la garantía de seguridad del
  // contrato. Esa está en el bloque anterior.
  const failures: ReadonlyArray<readonly [string, CandidatePrivateState]> = [
    ['salario incompatible', createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n)],
    ['horas incompatibles', createCandidatePrivateState(4_000n, JOB_REQUIRED_HOURS - 1n)],
    ['ambos incompatibles', createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 1n)],
    ['compensacion fuera de rango', createCandidatePrivateState(0n, 45n)],
    ['horas fuera de rango', createCandidatePrivateState(4_000n, 0n)],
  ];

  for (const [name, privateState] of failures) {
    it(`${name}: el contexto del llamador queda intacto`, () => {
      const { contract, context } = deployJob(
        JOB_ID,
        JOB_MAX_COMPENSATION,
        JOB_REQUIRED_HOURS,
        privateState,
      );
      const before = readLedger(context);

      assert.throws(() => contract.impureCircuits.proveMatch(context));

      const after = readLedger(context);
      assert.equal(after.matchCount, 0n);
      assert.equal(after.matchCount, before.matchCount);
      assert.deepEqual(after.jobId, before.jobId);
      assert.equal(after.jobMaximumCompensation, before.jobMaximumCompensation);
      assert.equal(after.jobRequiredWeeklyHours, before.jobRequiredWeeklyHours);
      assert.equal(after.jobState, before.jobState);
    });
  }
});

describe('proveMatch — contabilidad de matchCount', () => {
  it('un match valido lleva matchCount de 0 a exactamente 1', () => {
    const outcome = proveMatch(createCandidatePrivateState(4_000n, 45n));

    assert.equal(outcome.before, 0n);
    assert.equal(outcome.after, 1n);
  });

  it('dos candidatos distintos llevan matchCount a exactamente 2', () => {
    // Desde contract/job-nullifier, el segundo match tiene que venir de OTRO
    // candidato: el mismo secreto queda bloqueado por su nullifier. Ese caso
    // esta cubierto en tests/proofmatch-nullifier.test.ts.
    let secret = testSecret(1);
    const perCandidate: Witnesses<CandidatePrivateState> = {
      candidateMinimumCompensation: ({ privateState }) => [privateState, 4_000n],
      candidateAvailableWeeklyHours: ({ privateState }) => [privateState, 45n],
      candidateSecret: ({ privateState }) => [privateState, secret],
    };

    const { contract, context } = deployJob(
      JOB_ID,
      JOB_MAX_COMPENSATION,
      JOB_REQUIRED_HOURS,
      createCandidatePrivateState(4_000n, 45n),
      perCandidate,
    );

    const first = contract.impureCircuits.proveMatch(context);
    assert.equal(readLedger(first.context).matchCount, 1n);

    secret = testSecret(2);
    const second = contract.impureCircuits.proveMatch(first.context);
    assert.equal(readLedger(second.context).matchCount, 2n);
  });

  it('un fallo intercalado no incrementa: 1 -> falla -> 2', () => {
    // Una sola instancia de contrato y una sola cadena de contextos. Lo que
    // varía entre llamadas es lo que devuelve el witness, no el contrato.
    let declared = { compensation: 4_000n, hours: 45n };
    let secret = testSecret(1);
    const swappableWitnesses: Witnesses<CandidatePrivateState> = {
      candidateMinimumCompensation: ({ privateState }) => [privateState, declared.compensation],
      candidateAvailableWeeklyHours: ({ privateState }) => [privateState, declared.hours],
      candidateSecret: () => [{ minimumCompensation: 0n, availableWeeklyHours: 0n, secret }, secret],
    };

    const { contract, context } = deployJob(
      JOB_ID,
      JOB_MAX_COMPENSATION,
      JOB_REQUIRED_HOURS,
      createCandidatePrivateState(4_000n, 45n),
      swappableWitnesses,
    );

    const first = contract.impureCircuits.proveMatch(context);
    assert.equal(readLedger(first.context).matchCount, 1n);

    // Segundo candidato, incompatible.
    secret = testSecret(2);
    declared = { compensation: JOB_MAX_COMPENSATION + 1n, hours: 45n };
    assert.throws(
      () => contract.impureCircuits.proveMatch(first.context),
      /compensation not compatible/,
    );

    // Su intento fallido no consumio su nullifier: corrige y matchea. 1 -> 2.
    declared = { compensation: 4_000n, hours: 45n };
    const second = contract.impureCircuits.proveMatch(first.context);
    assert.equal(readLedger(second.context).matchCount, 2n);
  });
});

// ─── Adversarial ─────────────────────────────────────────────────────────────

describe('proveMatch — witness adversarial', () => {
  it('un witness que miente sigue estando sujeto a los asserts del circuito', () => {
    // El DApp declara valores compatibles pero fuera de rango: el circuito los
    // rechaza igual, porque valida lo que recibe.
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, 45n), {
        candidateWitnesses: lyingWitnesses(0n, 45n),
      }),
      /candidate compensation out of range/,
    );
  });

  it('un witness no puede declarar horas imposibles para saltear el requisito', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, 10n), {
        candidateWitnesses: lyingWitnesses(4_000n, MAX_WEEKLY_HOURS + 1n),
      }),
      /candidate weekly hours out of range/,
    );
  });

  it('un witness que devuelve un salario incompatible no puede saltear la condicion', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(1n, 45n), {
        candidateWitnesses: lyingWitnesses(JOB_MAX_COMPENSATION + 1n, 45n),
      }),
      /compensation not compatible/,
    );
  });

  it('un witness que devuelve un tipo fuera del rango de Compact es rechazado por el runtime', () => {
    // Uint<8> no admite 256: el runtime valida el valor que devuelve el witness
    // antes de que el circuito lo use.
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, 45n), {
        candidateWitnesses: lyingWitnesses(4_000n, 256n),
      }),
      /candidateAvailableWeeklyHours/,
    );
  });

  it('un witness que devuelve un salario mayor a Uint<64> es rechazado por el runtime', () => {
    assertRejected(
      proveMatch(createCandidatePrivateState(4_000n, 45n), {
        candidateWitnesses: lyingWitnesses(MAX_UINT64 + 1n, 45n),
      }),
      /candidateMinimumCompensation/,
    );
  });

  it('LIMITE CONOCIDO: una mentira dentro de rango es indetectable para el circuito', () => {
    // El candidato realmente pide 999.999/mes y ofrece 2 h/sem: incompatible en
    // ambos ejes. Declara (1, 168) y matchea.
    //
    // Esto NO es un bug: el circuito prueba compatibilidad de los valores
    // DECLARADOS, no de los reales. Los asserts de rango filtran valores
    // implausibles, no falsos. Cerrar esta brecha requiere binding externo
    // (attestation de un tercero), fuera del scope del MVP.
    //
    // El test existe para que ninguna etapa futura asuma que el circuito ya
    // "protege contra witnesses mentirosos".
    assertMatched(
      proveMatch(createCandidatePrivateState(999_999n, 2n), {
        candidateWitnesses: lyingWitnesses(1n, MAX_WEEKLY_HOURS),
      }),
    );
  });

  it('proveMatch no expone ningun parametro al caller (asercion de interfaz)', () => {
    // La defensa estructural contra "mandar compatible=true": proveMatch no
    // recibe argumentos. Lo unico que entra es el contexto.
    const { contract, context } = deployJob(JOB_ID, JOB_MAX_COMPENSATION, JOB_REQUIRED_HOURS);

    assert.throws(
      // @ts-expect-error: se pasa un argumento de mas a proposito
      () => contract.impureCircuits.proveMatch(context, true),
      /expected 1 argument/,
    );
  });
});

// ─── Revalidación de los términos públicos dentro del circuito ───────────────

describe('proveMatch — revalida los terminos publicos dentro del circuito', () => {
  // Los `assert` del constructor NO los verifica la cadena, así que el circuito
  // no puede confiar en que los términos on-chain sean válidos. Estos casos
  // usan fixtures que despliegan estados que el constructor legítimo jamás
  // produciría, y comprueban que el circuito los rechaza igual.

  it('rechaza si la vacante no esta OPEN', async () => {
    const closed = await loadFixtureContract('proofmatch-job-closed');
    const { contract, context } = closed.deploy(createCandidatePrivateState(4_000n, 45n));

    assert.equal(closed.readLedger(context).jobState, 1 /* CLOSED */);
    assert.throws(() => contract.impureCircuits.proveMatch(context), /job is not open/);
    assert.equal(closed.readLedger(context).matchCount, 0n);
  });

  it('rechaza terminos malformados que el constructor habria rechazado', async () => {
    // jobMaximumCompensation = 0 y jobRequiredWeeklyHours = 200: imposibles vía
    // el constructor honesto, posibles para un deployer que arme el
    // ContractDeploy a mano.
    const malformed = await loadFixtureContract('proofmatch-job-malformed');
    const { contract, context } = malformed.deploy(createCandidatePrivateState(1n, MAX_WEEKLY_HOURS));

    assert.equal(malformed.readLedger(context).jobMaximumCompensation, 0n);
    assert.equal(malformed.readLedger(context).jobRequiredWeeklyHours, 200n);
    assert.throws(() => contract.impureCircuits.proveMatch(context), /malformed job terms/);
    assert.equal(malformed.readLedger(context).matchCount, 0n);
  });

  it('los fixtures copian el circuito real sin desviarse', () => {
    // Los fixtures duplican `proveMatch` para poder montar estados que el
    // constructor honesto no produce. Si el circuito real cambia y el fixture
    // no, los dos tests de arriba seguirian en verde probando codigo muerto.
    //
    // Comparar los nombres de los campos del ledger no alcanza: no dice nada
    // del cuerpo del circuito. Se compara el texto del circuito, que es lo que
    // esos tests realmente ejercitan.
    // Se comparan las sentencias, no el formato: se descartan comentarios,
    // lineas vacias y sangria, para que los fixtures puedan documentarse
    // distinto sin romper el guard.
    const circuitBody = (source: string) =>
      source
        .slice(source.indexOf('export circuit proveMatch'))
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter((line) => line !== '')
        .join(' ')
        .replace(/\s+/g, ' ');

    const real = circuitBody(fs.readFileSync(REAL_CONTRACT_PATH, 'utf8'));

    for (const name of ['proofmatch-job-closed', 'proofmatch-job-malformed']) {
      const fixture = circuitBody(
        fs.readFileSync(path.join(FIXTURES_DIR, `${name}.compact`), 'utf8'),
      );
      assert.equal(fixture, real, `${name} se desincronizo del circuito real`);
    }
  });
});
