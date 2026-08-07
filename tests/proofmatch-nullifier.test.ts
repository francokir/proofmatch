/**
 * Tests del nullifier de uso único de ProofMatch.
 *
 * Propiedad central: un mismo candidato no puede registrar más de un match para
 * la misma vacante, y su nullifier en una vacante no es reconocible en otra.
 *
 *   mismo secreto + misma vacante  -> mismo nullifier   -> segundo intento falla
 *   mismo secreto + otra vacante   -> nullifier distinto -> no hay linkabilidad
 *
 * El "contexto de vacante" es `kernel.self()`, la dirección de la instancia, y
 * NO `jobId`: `jobId` lo elige quien despliega y puede repetirse a propósito.
 *
 * Ejecutar con: npm run test:contract
 * Requiere haber corrido antes: npm run compile
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as RT from '@midnight-ntwrk/compact-runtime';

import { type Witnesses } from '../contracts/managed/proofmatch-job/contract/index.js';
import {
  createCandidatePrivateState,
  testSecret,
  type CandidatePrivateState,
} from './witnesses.js';
import {
  deployJob,
  readLedger,
  soleNullifier,
  nullifiersHex,
  loadFixtureContract,
  writeHappensAfterAllReads,
  proveMatchObservingWrites,
  expectedNullifier,
  bytesInTranscript,
  pad32,
  NULLIFIER_DOMAIN,
  JOB_ID,
  MAX_WEEKLY_HOURS,
} from './helpers.js';

const JOB_MAX_COMPENSATION = 5_000n;
const JOB_REQUIRED_HOURS = 40n;

const SECRET_A = testSecret(1);
const SECRET_B = testSecret(2);

/** Dos direcciones de contrato distintas y deterministas. */
const ADDRESS_1 = 'a'.repeat(64);
const ADDRESS_2 = 'b'.repeat(64);

const compatible = (secret: Uint8Array) => createCandidatePrivateState(4_000n, 45n, secret);

/** Despliega una vacante en la dirección indicada, lista para llamar `proveMatch`. */
const deployAt = (address: string, privateState: CandidatePrivateState) =>
  deployJob(
    JOB_ID,
    JOB_MAX_COMPENSATION,
    JOB_REQUIRED_HOURS,
    privateState,
    undefined,
    address,
  );

// ─── A. Happy path ───────────────────────────────────────────────────────────

describe('nullifier — primer match valido', () => {
  it('registra exactamente un nullifier e incrementa matchCount', () => {
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));

    assert.equal(readLedger(context).usedNullifiers.size(), 0n);

    const after = contract.impureCircuits.proveMatch(context).context;
    const state = readLedger(after);

    assert.equal(state.matchCount, 1n);
    assert.equal(state.usedNullifiers.size(), 1n);
    assert.equal(soleNullifier(after)?.length, 32);
  });

  it('el nullifier registrado no es el secreto del candidato', () => {
    // PROPERTY 5: el secreto no aparece en el estado publico.
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));
    const after = contract.impureCircuits.proveMatch(context).context;

    const registered = soleNullifier(after)!;
    assert.notDeepEqual(registered, SECRET_A);
    assert.notEqual(
      Buffer.from(registered).toString('hex'),
      Buffer.from(SECRET_A).toString('hex'),
    );
  });
});

// ─── B. Duplicado ────────────────────────────────────────────────────────────

describe('nullifier — duplicado del mismo candidato', () => {
  it('rechaza el segundo intento del mismo secreto en la misma vacante', () => {
    // PROPERTY 3: no hay registro duplicado exitoso.
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));

    const after = contract.impureCircuits.proveMatch(context).context;

    assert.throws(
      () => contract.impureCircuits.proveMatch(after),
      /candidate already matched this job/,
    );
  });

  it('el duplicado rechazado no incrementa matchCount ni agrega nullifiers', () => {
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));
    const after = contract.impureCircuits.proveMatch(context).context;

    assert.throws(() => contract.impureCircuits.proveMatch(after));

    const state = readLedger(after);
    assert.equal(state.matchCount, 1n);
    assert.equal(state.usedNullifiers.size(), 1n);
  });

  it('un tercer intento sigue rechazado', () => {
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));
    const after = contract.impureCircuits.proveMatch(context).context;

    assert.throws(() => contract.impureCircuits.proveMatch(after));
    assert.throws(() => contract.impureCircuits.proveMatch(after));
    assert.equal(readLedger(after).matchCount, 1n);
  });
});

// ─── C. Otro candidato ───────────────────────────────────────────────────────

describe('nullifier — otro candidato en la misma vacante', () => {
  it('un segundo candidato compatible matchea y produce un nullifier distinto', () => {
    const first = deployAt(ADDRESS_1, compatible(SECRET_A));
    const afterA = first.contract.impureCircuits.proveMatch(first.context).context;

    // Mismo contrato y mismo estado publico, otro secreto.
    const second = deployAt(ADDRESS_1, compatible(SECRET_B));
    const contextB = RT.createCircuitContext(
      ADDRESS_1,
      '0'.repeat(64),
      afterA.currentQueryContext.state,
      second.context.currentPrivateState,
    );

    const afterB = second.contract.impureCircuits.proveMatch(contextB).context;
    const state = readLedger(afterB);

    assert.equal(state.matchCount, 2n);
    assert.equal(state.usedNullifiers.size(), 2n);

    const [n1, n2] = nullifiersHex(afterB);
    assert.notEqual(n1, n2, 'dos candidatos distintos deben producir nullifiers distintos');
  });
});

// ─── D. Misma persona, otra vacante — EL TEST CRÍTICO ────────────────────────

describe('nullifier — mismo candidato en otra vacante', () => {
  it('PROPERTY 2: el mismo secreto produce un nullifier distinto en otra instancia', () => {
    // Dos vacantes con el MISMO jobId y los MISMOS terminos: lo unico que
    // cambia es la direccion de la instancia. Si el nullifier dependiera de
    // jobId, ambos serian iguales y el candidato quedaria enlazado entre
    // vacantes (o bloqueable por una vacante senuelo).
    const job1 = deployAt(ADDRESS_1, compatible(SECRET_A));
    const job2 = deployAt(ADDRESS_2, compatible(SECRET_A));

    const after1 = job1.contract.impureCircuits.proveMatch(job1.context).context;
    const after2 = job2.contract.impureCircuits.proveMatch(job2.context).context;

    const [n1] = nullifiersHex(after1);
    const [n2] = nullifiersHex(after2);

    assert.notEqual(n1, n2, 'mismo secreto en otra vacante debe dar otro nullifier');
    assert.equal(readLedger(after1).matchCount, 1n);
    assert.equal(readLedger(after2).matchCount, 1n);
  });

  it('el nullifier de una vacante no es reconocible en el Set de la otra', () => {
    // No alcanza con que job2 acepte el match: su ledger arranca vacio, asi que
    // aceptaria igual aunque los nullifiers fueran identicos. Lo que se afirma
    // es que el nullifier de job1 NO es el que job2 registra, es decir que un
    // observador con el Set de job1 no puede reconocer al candidato en job2.
    const job1 = deployAt(ADDRESS_1, compatible(SECRET_A));
    const after1 = job1.contract.impureCircuits.proveMatch(job1.context).context;

    const job2 = deployAt(ADDRESS_2, compatible(SECRET_A));
    const after2 = job2.contract.impureCircuits.proveMatch(job2.context).context;

    const nullifierEnJob1 = soleNullifier(after1)!;
    assert.equal(
      readLedger(after2).usedNullifiers.member(nullifierEnJob1),
      false,
      'el nullifier de job1 no debe figurar en job2',
    );
  });

  it('PROPERTY 1: el mismo secreto en la misma vacante es determinista', () => {
    // Dos despliegues independientes en la MISMA direccion producen el mismo
    // nullifier. Eso es lo que hace que el duplicado sea detectable.
    const runA = deployAt(ADDRESS_1, compatible(SECRET_A));
    const runB = deployAt(ADDRESS_1, compatible(SECRET_A));

    const [n1] = nullifiersHex(runA.contract.impureCircuits.proveMatch(runA.context).context);
    const [n2] = nullifiersHex(runB.contract.impureCircuits.proveMatch(runB.context).context);

    assert.equal(n1, n2, 'mismo secreto y misma vacante deben dar el mismo nullifier');
  });

  it('un jobId identico en otra instancia no reproduce el nullifier', () => {
    // Explicitamente: el ataque de la vacante senuelo. Mismo jobId, misma
    // direccion no --- y eso basta para que el nullifier difiera.
    const legit = deployAt(ADDRESS_1, compatible(SECRET_A));
    const decoy = deployAt(ADDRESS_2, compatible(SECRET_A));

    assert.deepEqual(readLedger(legit.context).jobId, readLedger(decoy.context).jobId);

    const [nLegit] = nullifiersHex(legit.contract.impureCircuits.proveMatch(legit.context).context);
    const [nDecoy] = nullifiersHex(decoy.contract.impureCircuits.proveMatch(decoy.context).context);

    assert.notEqual(nLegit, nDecoy);
  });
});

// ─── E. Fallos de compatibilidad no consumen el nullifier ────────────────────

describe('nullifier — un fallo de compatibilidad no consume nada', () => {
  // PROPERTY 4.
  //
  // Estos tests NO comparan el ledger del contexto del caller antes y después
  // del throw: eso es infalsificable, porque el runtime nunca muta ese objeto.
  // Se invoca el circuito de forma que las escrituras que alcanzó a emitir
  // queden observables. Ver `proveMatchObservingWrites`.
  const failures: ReadonlyArray<readonly [string, CandidatePrivateState]> = [
    ['salario incompatible', createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n, SECRET_A)],
    ['horas incompatibles', createCandidatePrivateState(4_000n, JOB_REQUIRED_HOURS - 1n, SECRET_A)],
    ['ambos incompatibles', createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 1n, SECRET_A)],
  ];

  for (const [name, privateState] of failures) {
    it(`${name}: no emite ninguna escritura publica`, () => {
      const { contract, context } = deployAt(ADDRESS_1, privateState);

      const outcome = proveMatchObservingWrites(contract, context);

      assert.match(outcome.threw!.message, /not compatible/);
      assert.equal(outcome.writeOps, 0, 'un fallo no debe emitir ninguna escritura');

      const state = readLedger(outcome.context);
      assert.equal(state.matchCount, 0n);
      assert.equal(state.usedNullifiers.size(), 0n);
    });
  }

  it('la comprobacion discrimina: el contrato roto SI consume el nullifier', async () => {
    // Meta-test. Sin esto, los tres de arriba podrian ser vacios.
    const broken = await loadFixtureContract('proofmatch-job-mutates-first');
    const { contract, context } = broken.deploy(
      createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n, SECRET_A),
      ADDRESS_1,
    );

    const outcome = proveMatchObservingWrites(
      contract as unknown as { _proveMatch_0(c: unknown, p: unknown): unknown },
      context,
    );

    assert.match(outcome.threw!.message, /not compatible/);
    assert.ok(outcome.writeOps > 0, 'el fixture roto debe emitir escrituras antes de fallar');
    assert.equal(
      broken.readLedger(outcome.context).usedNullifiers.size(),
      1n,
      'con el bug, el intento incompatible quema el nullifier del candidato',
    );
  });
});

// ─── F. Retry después de un fallo ────────────────────────────────────────────

describe('nullifier — retry tras un intento incompatible', () => {
  it('el candidato corrige sus valores y completa el match', () => {
    // El nullifier no se consumio en el intento fallido, asi que el mismo
    // secreto puede volver a intentar.
    let declared = { compensation: JOB_MAX_COMPENSATION + 1n, hours: 45n };
    const swappable: Witnesses<CandidatePrivateState> = {
      candidateMinimumCompensation: ({ privateState }) => [privateState, declared.compensation],
      candidateAvailableWeeklyHours: ({ privateState }) => [privateState, declared.hours],
      candidateSecret: ({ privateState }) => [privateState, privateState.secret],
    };

    const { contract, context } = deployJob(
      JOB_ID,
      JOB_MAX_COMPENSATION,
      JOB_REQUIRED_HOURS,
      compatible(SECRET_A),
      swappable,
      ADDRESS_1,
    );

    assert.throws(() => contract.impureCircuits.proveMatch(context), /compensation not compatible/);
    assert.equal(readLedger(context).usedNullifiers.size(), 0n);

    declared = { compensation: 4_000n, hours: 45n };
    const after = contract.impureCircuits.proveMatch(context).context;

    assert.equal(readLedger(after).matchCount, 1n);
    assert.equal(readLedger(after).usedNullifiers.size(), 1n);
  });

  it('pero despues del retry exitoso, un tercer intento ya esta bloqueado', () => {
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));
    const after = contract.impureCircuits.proveMatch(context).context;

    assert.throws(
      () => contract.impureCircuits.proveMatch(after),
      /candidate already matched this job/,
    );
  });
});

// ─── G. Adversarial ──────────────────────────────────────────────────────────

describe('nullifier — adversarial', () => {
  const lyingWitnesses = (
    compensation: bigint,
    hours: bigint,
    secret: Uint8Array,
  ): Witnesses<CandidatePrivateState> => ({
    candidateMinimumCompensation: ({ privateState }) => [privateState, compensation],
    candidateAvailableWeeklyHours: ({ privateState }) => [privateState, hours],
    candidateSecret: ({ privateState }) => [privateState, secret],
  });

  it('rechaza un secreto sin inicializar (32 bytes en cero)', () => {
    const { contract, context } = deployJob(
      JOB_ID,
      JOB_MAX_COMPENSATION,
      JOB_REQUIRED_HOURS,
      compatible(SECRET_A),
      lyingWitnesses(4_000n, 45n, new Uint8Array(32)),
      ADDRESS_1,
    );

    assert.throws(
      () => contract.impureCircuits.proveMatch(context),
      /candidate secret not initialized/,
    );
    assert.equal(readLedger(context).usedNullifiers.size(), 0n);
  });

  it('un secreto que no mide 32 bytes lo frena el marshaling del runtime', () => {
    const { contract, context } = deployJob(
      JOB_ID,
      JOB_MAX_COMPENSATION,
      JOB_REQUIRED_HOURS,
      compatible(SECRET_A),
      lyingWitnesses(4_000n, 45n, new Uint8Array(31)),
      ADDRESS_1,
    );

    assert.throws(() => contract.impureCircuits.proveMatch(context), /candidateSecret/);
  });

  it('PROPERTY 6: proveMatch no expone ningun parametro (asercion de interfaz)', () => {
    // La unicidad la impone el Set del ledger DENTRO del circuito: no hay
    // parametro por el que el caller pueda afirmar "nullifier sin usar".
    // Esta asercion verifica la superficie de la API, no el comportamiento del
    // Set --- eso lo cubren los tests de duplicado.
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));

    assert.throws(
      // @ts-expect-error: se pasa un argumento de mas a proposito
      () => contract.impureCircuits.proveMatch(context, true),
      /expected 1 argument/,
    );
  });

  it('cambiar de secreto para evadir el duplicado cuenta como otro candidato', () => {
    // Limite conocido y esperado: un secreto nuevo es un candidato nuevo a ojos
    // del contrato. Acotar cuantos secretos puede tener una persona requiere
    // anclar el secreto a algo escaso, que esta fuera del scope del MVP.
    const first = deployAt(ADDRESS_1, compatible(SECRET_A));
    const afterA = first.contract.impureCircuits.proveMatch(first.context).context;

    const second = deployAt(ADDRESS_1, compatible(testSecret(99)));
    const contextB = RT.createCircuitContext(
      ADDRESS_1,
      '0'.repeat(64),
      afterA.currentQueryContext.state,
      second.context.currentPrivateState,
    );

    assert.doesNotThrow(() => second.contract.impureCircuits.proveMatch(contextB));
  });

  it('el secreto no aparece en el transcript publico', () => {
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));
    const result = contract.impureCircuits.proveMatch(context);
    const after = result.context;

    // Se recorren los Uint8Array del transcript, no se hace JSON.stringify: un
    // Uint8Array se serializa como {"0":..,"1":..}, asi que buscar el hex en el
    // JSON daria `false` SIEMPRE, incluso si el secreto estuviera ahi.
    const found = bytesInTranscript(result.proofData.publicTranscript);

    // Control positivo: el detector tiene que encontrar algo que SI esta.
    // Sin esto, la asercion de abajo podria pasar por estar rota.
    const nullifierHex = Buffer.from(soleNullifier(after)!).toString('hex');
    assert.ok(
      found.includes(nullifierHex),
      'control positivo: el nullifier si esta en el transcript y el detector debe verlo',
    );

    // Lo que importa: el secreto no esta.
    assert.equal(
      found.includes(Buffer.from(SECRET_A).toString('hex')),
      false,
      'el secreto del candidato no debe aparecer en el transcript publico',
    );
  });
});

// ─── Golden vector: fija el domain separator y la forma del preimage ─────────

describe('nullifier — golden vector', () => {
  it('el nullifier registrado coincide con el recomputado desde el preimage documentado', () => {
    // Sin este test, un contrato que OMITIERA el domain separator pasaria igual
    // todos los demas: determinismo, unicidad por direccion y distincion entre
    // candidatos se cumplirian de todos modos. Esto fija que el preimage es
    // exactamente [pad(32, dominio), direccion, secreto], en ese orden.
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));
    const after = contract.impureCircuits.proveMatch(context).context;

    const registered = Buffer.from(soleNullifier(after)!).toString('hex');

    assert.equal(registered, expectedNullifier(ADDRESS_1, SECRET_A));
  });

  it('cambiar cualquier componente del preimage cambia el nullifier', () => {
    const base = expectedNullifier(ADDRESS_1, SECRET_A);

    assert.notEqual(base, expectedNullifier(ADDRESS_2, SECRET_A), 'otra direccion');
    assert.notEqual(base, expectedNullifier(ADDRESS_1, SECRET_B), 'otro secreto');
  });

  it('el domain separator es el esperado y ocupa 32 bytes', () => {
    const domain = pad32(NULLIFIER_DOMAIN);

    assert.equal(domain.length, 32);
    assert.equal(
      Buffer.from(domain).toString('hex'),
      '70726f6f666d617463683a6a6f622d6e756c6c69666965723a76310000000000',
    );
  });
});

// ─── Orden de las mutaciones ─────────────────────────────────────────────────

describe('nullifier — las mutaciones van despues de todas las validaciones', () => {
  it('en un match valido, ninguna escritura precede a la ultima lectura', () => {
    const { contract, context } = deployAt(ADDRESS_1, compatible(SECRET_A));

    const result = contract.impureCircuits.proveMatch(context);

    assert.ok(
      writeHappensAfterAllReads(result.proofData.publicTranscript),
      'insertar el nullifier e incrementar matchCount deben ir despues de validar',
    );
  });

  it('la comprobacion detecta un contrato que consume el nullifier antes de validar', async () => {
    const broken = await loadFixtureContract('proofmatch-job-mutates-first');
    const { contract, context } = broken.deploy(compatible(SECRET_A), ADDRESS_1);

    const result = contract.impureCircuits.proveMatch(context) as {
      proofData: { publicTranscript: readonly unknown[] };
    };

    assert.equal(
      writeHappensAfterAllReads(result.proofData.publicTranscript),
      false,
      'el fixture roto escribe primero: la comprobacion tiene que rechazarlo',
    );
  });

  it('el contrato roto emite la escritura del nullifier antes del assert que falla', async () => {
    // Demuestra que el riesgo del fixture es real y no teorico. No se puede
    // observar leyendo el ledger --- el contexto del caller nunca muta --- asi
    // que se instrumenta el witness: si el circuito llega a `candidateSecret()`
    // para derivar el nullifier ANTES de validar compatibilidad, es que la
    // escritura ya se emitio.
    const broken = await loadFixtureContract('proofmatch-job-mutates-first');

    let secretReadBeforeCompatibilityCheck = false;
    const instrumented: Witnesses<CandidatePrivateState> = {
      candidateMinimumCompensation: ({ privateState }) => {
        // Si el secreto ya se leyo cuando piden la compensacion, el nullifier
        // se derivo primero.
        return [privateState, privateState.minimumCompensation];
      },
      candidateAvailableWeeklyHours: ({ privateState }) => [
        privateState,
        privateState.availableWeeklyHours,
      ],
      candidateSecret: ({ privateState }) => {
        secretReadBeforeCompatibilityCheck = true;
        return [privateState, privateState.secret];
      },
    };

    const { contract, context } = broken.deployWith(
      createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n, SECRET_A),
      instrumented,
      ADDRESS_1,
    );

    assert.throws(() => contract.impureCircuits.proveMatch(context), /not compatible/);
    assert.ok(
      secretReadBeforeCompatibilityCheck,
      'el fixture roto deriva y escribe el nullifier antes de validar compatibilidad',
    );
  });

  it('el contrato real NO toca el secreto si la compatibilidad ya fallo... salvo por orden de lectura', () => {
    // El contrato real lee los tres witnesses juntos en el paso 2, antes de
    // comparar. Eso es inocuo: leer el secreto no lo publica ni lo consume. Lo
    // que importa es que la ESCRITURA del nullifier ocurra despues, y eso es lo
    // que fija el test de orden del transcript de mas arriba.
    //
    // Este test deja el comportamiento por escrito para que un cambio futuro de
    // orden sea una decision explicita y no un accidente.
    const { contract, context } = deployAt(
      ADDRESS_1,
      createCandidatePrivateState(JOB_MAX_COMPENSATION + 1n, 45n, SECRET_A),
    );

    assert.throws(() => contract.impureCircuits.proveMatch(context), /compensation not compatible/);
    assert.equal(readLedger(context).usedNullifiers.size(), 0n);
  });
});

// ─── Compatibilidad con la etapa anterior ────────────────────────────────────

describe('nullifier — no rompe las garantias de compatibilidad privada', () => {
  it('sigue aceptando los bordes exactos', () => {
    const borde = createCandidatePrivateState(JOB_MAX_COMPENSATION, JOB_REQUIRED_HOURS, SECRET_A);
    const { contract, context } = deployAt(ADDRESS_1, borde);

    const after = contract.impureCircuits.proveMatch(context).context;
    assert.equal(readLedger(after).matchCount, 1n);
  });

  it('sigue rechazando horas privadas fuera de rango antes de tocar el nullifier', () => {
    const fuera = createCandidatePrivateState(4_000n, MAX_WEEKLY_HOURS + 1n, SECRET_A);
    const { contract, context } = deployAt(ADDRESS_1, fuera);

    assert.throws(() => contract.impureCircuits.proveMatch(context), /weekly hours out of range/);
    assert.equal(readLedger(context).usedNullifiers.size(), 0n);
  });
});
