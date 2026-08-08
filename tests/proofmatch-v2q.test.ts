/**
 * ProofMatchJobV2Q — V2 + verified qualification gate.
 *
 * Qué tiene que valer acá y no puede romperse:
 *
 *   1. Solo el verifier autorizado (hash-secret) registra attestations.
 *   2. Q es específica de vacante Y tipo: attestations de otra vacante u otro
 *      tipo de qualification no sirven.
 *   3. El match exige conocimiento PRIVADO del qualificationSecret detrás de
 *      una Q attestada: una Q copiada del ledger no alcanza.
 *   4. El witness del camino de Merkle NO es confiable: un camino de otra hoja
 *      o con hermanos falsos no pasa (leaf re-bind + checkRoot).
 *   5. Un fallo de qualification no consume el nullifier.
 *   6. Nada privado (secretos, niveles, salario, horas) toca el transcript.
 *
 * El nivel exacto del candidato NO existe en este contrato: la attestation es
 * la declaración del verifier de que el requisito se cumple. Eso es a
 * propósito y es el modelo de confianza documentado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ADDRESS_1, ADDRESS_2, BAND_FLOOR, CANDIDATE_SECRET, ENGLISH_QUALIFICATION_TYPE, JOB_ID,
  OTHER_QUALIFICATION_SECRET, OTHER_QUALIFICATION_TYPE, QUALIFICATION_SECRET,
  REQUIRED_ENGLISH_LEVEL, VERIFIER_SECRET, WorkMode, ZERO_32,
  attest, bigintsInTranscript, bytesInTranscript, candidateState, deployAndLock,
  deployLockAttest, deployV2Q, employerState, expectedNullifier, expectedQualificationTag,
  expectedVerifierKeyBytes, loadV2QFixture, makeWitnesses, readV2Q, testBytes, verifierState,
  withPrivateState, writeHappensAfterAllReads,
} from './v2q-helpers.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

const DEFAULT_Q = () =>
  expectedQualificationTag(ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET);

describe('V2Q constructor: qualification terms', () => {
  it('deploys with English >= B2 and seals the qualification terms', () => {
    const dep = deployV2Q();
    const state = readV2Q(dep.context);
    assert.equal(hex(state.qualificationType), hex(ENGLISH_QUALIFICATION_TYPE));
    assert.equal(state.requiredQualificationLevel, REQUIRED_ENGLISH_LEVEL);
    assert.equal(hex(state.qualificationVerifierKey), hex(expectedVerifierKeyBytes(VERIFIER_SECRET)));
    assert.equal(state.attestationCount, 0n);
    assert.equal(state.matchCount, 0n);
  });

  it('publishes the verifier key hash, never a verifier secret', () => {
    const dep = deployV2Q();
    const state = readV2Q(dep.context);
    assert.notEqual(hex(state.qualificationVerifierKey), hex(VERIFIER_SECRET));
  });

  it('rejects a zero qualification type', () => {
    assert.throws(() => deployV2Q({ qualificationType: ZERO_32 }),
      /qualification type not initialized/);
  });

  it('rejects required level 0', () => {
    assert.throws(() => deployV2Q({ requiredLevel: 0n }),
      /required qualification level out of range/);
  });

  it('rejects required level 7 (beyond C2)', () => {
    assert.throws(() => deployV2Q({ requiredLevel: 7n }),
      /required qualification level out of range/);
  });

  it('rejects a zero verifier key', () => {
    assert.throws(() => deployV2Q({ verifierKeyHash: ZERO_32 }),
      /verifier key not initialized/);
  });

  it('accepts every CEFR level from A1 (1) to C2 (6)', () => {
    for (const level of [1n, 2n, 3n, 4n, 5n, 6n]) {
      const dep = deployV2Q({ requiredLevel: level });
      assert.equal(readV2Q(dep.context).requiredQualificationLevel, level);
    }
  });
});

describe('attestQualification: authorized verifier only', () => {
  it('the authorized verifier attests an opaque Q', () => {
    const dep = attest(deployV2Q(), DEFAULT_Q());
    const state = readV2Q(dep.context);
    assert.equal(state.attestationCount, 1n);
  });

  it('a wrong verifier secret is rejected', () => {
    assert.throws(
      () => attest(deployV2Q(), DEFAULT_Q(), verifierState({ verifierSecretBytes: testBytes(99) })),
      /not authorized to attest/);
  });

  it('the employer secret does not authorize attestations', () => {
    assert.throws(
      () => attest(deployV2Q(), DEFAULT_Q(), verifierState({ verifierSecretBytes: employerState(1_960n).employerSecretBytes })),
      /not authorized to attest/);
  });

  it('an uninitialized verifier secret is rejected before hashing', () => {
    assert.throws(
      () => attest(deployV2Q(), DEFAULT_Q(), verifierState({ verifierSecretBytes: ZERO_32 })),
      /verifier secret not initialized/);
  });

  it('a zero attestation value is rejected', () => {
    assert.throws(() => attest(deployV2Q(), ZERO_32), /attestation must not be zero/);
  });

  it('attestation works before AND after the budget lock (independent lifecycles)', () => {
    const before = attest(deployV2Q(), DEFAULT_Q());
    assert.equal(readV2Q(before.context).attestationCount, 1n);

    const after = attest(deployAndLock(), DEFAULT_Q());
    assert.equal(readV2Q(after.context).attestationCount, 1n);
    assert.equal(readV2Q(after.context).budgetLocked, true);
  });

  it('a failed attestation writes nothing', () => {
    const dep = deployV2Q();
    try {
      attest(dep, DEFAULT_Q(), verifierState({ verifierSecretBytes: testBytes(99) }));
    } catch { /* expected */ }
    assert.equal(readV2Q(dep.context).attestationCount, 0n);
  });
});

describe('proveGuaranteedMatch: the qualification gate', () => {
  const proveAs = (
    dep: ReturnType<typeof deployLockAttest>,
    state = candidateState(1_753n, 27n),
    address = ADDRESS_1,
  ) => dep.contract.impureCircuits.proveGuaranteedMatch(withPrivateState(dep.context, state, address));

  it('a qualified, compatible candidate registers the match', () => {
    const dep = deployLockAttest();
    const result = proveAs(dep);
    const state = readV2Q(result.context);
    assert.equal(state.matchCount, 1n);
    assert.equal(state.usedNullifiers.size(), 1n);
    assert.equal(state.attestationCount, 1n);
    assert.ok(state.usedNullifiers.member(
      Uint8Array.from(Buffer.from(expectedNullifier(ADDRESS_1, CANDIDATE_SECRET), 'hex'))));
  });

  it('without any attestation the match is impossible', () => {
    const dep = deployAndLock();
    assert.throws(() => proveAs(dep), /qualification attestation not found for leaf/);
    assert.equal(readV2Q(dep.context).matchCount, 0n);
  });

  it('a wrong qualificationSecret cannot use someone else\'s attestation', () => {
    const dep = deployLockAttest(); // attested for QUALIFICATION_SECRET
    assert.throws(
      () => proveAs(dep, candidateState(1_753n, 27n, { qualificationSecretBytes: OTHER_QUALIFICATION_SECRET })),
      /qualification attestation not found for leaf/);
  });

  it('an uninitialized qualificationSecret is rejected explicitly', () => {
    const dep = deployLockAttest();
    assert.throws(
      () => proveAs(dep, candidateState(1_753n, 27n, { qualificationSecretBytes: ZERO_32 })),
      /qualification secret not initialized/);
  });

  it('SECURITY: a malicious path witness pointing at another leaf hits the leaf re-bind', () => {
    // The attacker holds a DIFFERENT qualificationSecret but implements the
    // path witness to return the path of the victim's attested leaf.
    const dep = deployLockAttest();
    const victimQ = DEFAULT_Q();
    const malicious = makeWitnesses({
      findQualificationPath: ({ ledger: l, privateState }, _q: Uint8Array) => {
        const found = l.qualificationAttestations.findPathForLeaf(victimQ);
        if (!found) throw new Error('victim leaf not found');
        return [privateState, found];
      },
    });
    const attacker = new dep.contract.constructor(malicious) as typeof dep.contract;
    assert.throws(
      () => attacker.impureCircuits.proveGuaranteedMatch(withPrivateState(
        dep.context,
        candidateState(1_753n, 27n, { qualificationSecretBytes: OTHER_QUALIFICATION_SECRET }),
      )),
      /qualification attestation path mismatch/);
  });

  it('SECURITY: the broken fixture (no leaf re-bind) DOES fall to that same attack', async () => {
    // Prueba que el assert del contrato real es el que sostiene la propiedad:
    // el mismo ataque contra un contrato sin `leaf == Q` PASA.
    const fixture = await loadV2QFixture('proofmatch-v2q-unbound-leaf');
    const RT = await import('@midnight-ntwrk/compact-runtime');
    const victimQ = DEFAULT_Q();
    const malicious = makeWitnesses({
      findQualificationPath: ({ ledger: l, privateState }, _q: Uint8Array) => {
        const found = l.qualificationAttestations.findPathForLeaf(victimQ);
        if (!found) throw new Error('victim leaf not found');
        return [privateState, found];
      },
    });
    const contract = new fixture.Contract(malicious);
    const init = contract.initialState(
      RT.createConstructorContext(employerState(1_960n), '0'.repeat(64)),
      JOB_ID, 1_800n, 2_100n, 20n, WorkMode.HYBRID, 1_000n, 1_000n,
      employerState(1_960n).employerSecretBytes, ENGLISH_QUALIFICATION_TYPE,
      REQUIRED_ENGLISH_LEVEL, expectedVerifierKeyBytes(VERIFIER_SECRET),
    );
    let context = RT.createCircuitContext(
      ADDRESS_1, '0'.repeat(64), init.currentContractState, init.currentPrivateState);
    context = contract.impureCircuits.lockPrivateBudget(context).context;
    context = contract.impureCircuits.attestQualification(
      RT.createCircuitContext(ADDRESS_1, '0'.repeat(64), context.currentQueryContext.state, verifierState()),
      victimQ,
    ).context;
    // Attacker with a foreign qualificationSecret: on the REAL contract this
    // throws "path mismatch"; on the broken fixture it must SUCCEED.
    const result = contract.impureCircuits.proveGuaranteedMatch(
      RT.createCircuitContext(
        ADDRESS_1, '0'.repeat(64), context.currentQueryContext.state,
        candidateState(1_753n, 27n, { qualificationSecretBytes: OTHER_QUALIFICATION_SECRET })));
    assert.equal(fixture.ledger(result.context.currentQueryContext.state).matchCount, 1n);
  });

  it('SECURITY: a forged path with the right leaf but fake siblings fails checkRoot', () => {
    const dep = deployAndLock(); // NO attestation at all
    const forged = makeWitnesses({
      findQualificationPath: ({ privateState }, q: Uint8Array) => {
        // Fabricates a structurally valid path whose siblings are garbage.
        const entry = () => ({ sibling: { field: 0n }, goes_left: false });
        return [privateState, { leaf: q, path: Array.from({ length: 10 }, entry) }];
      },
    });
    const attacker = new dep.contract.constructor(forged) as typeof dep.contract;
    assert.throws(
      () => attacker.impureCircuits.proveGuaranteedMatch(
        withPrivateState(dep.context, candidateState(1_753n, 27n))),
      /qualification not attested for this job/);
  });

  it('an attestation for job A is useless on job B (same secret, same type)', () => {
    // Job B never received an attestation for this candidate: the candidate's
    // Q_B differs from the attested Q_A because kernel.self() differs.
    const depB = deployLockAttest({ address: ADDRESS_2 }, 1_960n, OTHER_QUALIFICATION_SECRET);
    // depB has SOME attestation (another candidate's); ours was never attested.
    assert.throws(
      () => proveAs(depB, candidateState(1_753n, 27n), ADDRESS_2),
      /qualification attestation not found for leaf/);
  });

  it('an attestation for English is useless on a job requiring another type', () => {
    // Same candidate secret, same address, but the vacancy seals OTHER type:
    // the circuit derives Q with ITS OWN sealed type, which was never attested.
    const dep = deployAndLock({ qualificationType: OTHER_QUALIFICATION_TYPE });
    const englishQ = expectedQualificationTag(ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, QUALIFICATION_SECRET);
    const attested = attest(dep, englishQ);
    assert.throws(
      () => proveAs(attested, candidateState(1_753n, 27n)),
      /qualification attestation not found for leaf/);
  });

  it('a failed qualification does NOT consume the nullifier: attest later, match later', () => {
    const dep = deployAndLock();
    try { proveAs(dep); } catch { /* expected: no attestation yet */ }
    assert.equal(readV2Q(dep.context).usedNullifiers.size(), 0n);

    const attested = attest(dep, DEFAULT_Q());
    const result = proveAs(attested);
    assert.equal(readV2Q(result.context).matchCount, 1n);
  });

  it('a duplicate match is rejected after a successful qualified match', () => {
    const dep = deployLockAttest();
    const first = proveAs(dep);
    assert.throws(
      () => dep.contract.impureCircuits.proveGuaranteedMatch(
        withPrivateState(first.context, candidateState(1_753n, 27n))),
      /already matched this job/);
  });

  it('the V2 conditions still gate the match (salary outside guaranteed zone)', () => {
    const dep = deployLockAttest();
    assert.throws(() => proveAs(dep, candidateState(BAND_FLOOR + 1n, 27n)),
      /not a guaranteed salary match/);
  });

  it('the V2 conditions still gate the match (hours below requirement)', () => {
    const dep = deployLockAttest();
    assert.throws(() => proveAs(dep, candidateState(1_753n, 10n)),
      /weekly hours not compatible/);
  });

  it('the qualification gate runs even for fully V2-compatible candidates', () => {
    // Belt-and-braces: compatible salary/hours/mode/commute but zero
    // qualification material — the gate must still be what blocks it.
    const dep = deployAndLock();
    assert.throws(() =>
      proveAs(dep, candidateState(1_753n, 27n, { qualificationSecretBytes: undefined })));
    assert.equal(readV2Q(dep.context).matchCount, 0n);
    assert.equal(readV2Q(dep.context).usedNullifiers.size(), 0n);
  });

  it('a second attestation keeps historical paths valid (HistoricMerkleTree)', () => {
    // Candidate builds the proof against the tree as of attestation time; a
    // later attestation must not invalidate it. We simulate by capturing the
    // path BEFORE the second insert and replaying it via a witness override.
    const dep = deployLockAttest();
    const myQ = DEFAULT_Q();
    const frozenPath = readV2Q(dep.context).qualificationAttestations.findPathForLeaf(myQ);
    assert.ok(frozenPath);

    const later = attest(dep, expectedQualificationTag(
      ADDRESS_1, ENGLISH_QUALIFICATION_TYPE, OTHER_QUALIFICATION_SECRET));
    const replay = makeWitnesses({
      findQualificationPath: ({ privateState }) => [privateState, frozenPath],
    });
    const contract = new later.contract.constructor(replay) as typeof later.contract;
    const result = contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(later.context, candidateState(1_753n, 27n)));
    assert.equal(readV2Q(result.context).matchCount, 1n);
  });
});

describe('V2Q privacy: the transcript', () => {
  it('a match discloses neither secrets nor Q nor private numbers', () => {
    const dep = deployLockAttest();
    const result = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_753n, 27n)));

    const bytes = bytesInTranscript(result.proofData.publicTranscript as never);
    const secrets = [
      CANDIDATE_SECRET, QUALIFICATION_SECRET, VERIFIER_SECRET,
      employerState(1_960n).employerSecretBytes as Uint8Array,
    ].map(hex);
    for (const secret of secrets) {
      assert.ok(!bytes.includes(secret), `secret ${secret.slice(0, 8)}… leaked to transcript`);
    }
    // La Q attestada tampoco: la membresia es por raiz, no por hoja.
    assert.ok(!bytes.includes(hex(DEFAULT_Q())), 'attested Q leaked into the match transcript');

    const numbers = bigintsInTranscript(result.proofData.publicTranscript as never);
    assert.ok(!numbers.includes(1_753n), 'candidate salary leaked');
    assert.ok(!numbers.includes(27n), 'candidate hours leaked');
  });

  it('an attestation publishes only merkle material: not the secret, not even raw Q', () => {
    const dep = deployAndLock();
    const q = DEFAULT_Q();
    const result = dep.contract.impureCircuits.attestQualification(
      withPrivateState(dep.context, verifierState()), q);
    const bytes = bytesInTranscript(result.proofData.publicTranscript as never);
    // El arbol guarda hash(hoja): ni siquiera la Q cruda aparece en el
    // transcript publico — solo nodos de Merkle. La attestation es opaca de
    // punta a punta.
    assert.ok(!bytes.includes(hex(q)), 'raw Q should not appear in the transcript');
    assert.ok(!bytes.includes(hex(VERIFIER_SECRET)), 'verifier secret leaked');
    assert.ok(!bytes.includes(hex(QUALIFICATION_SECRET)), 'qualification secret leaked');
    // Y la attestation quedo realmente registrada: hay camino para Q.
    const state = readV2Q(result.context);
    assert.equal(state.attestationCount, 1n);
    assert.ok(state.qualificationAttestations.findPathForLeaf(q));
    // El nivel del candidato no existe en el circuito: nada que filtrar.
  });

  it('match writes happen only after every read', () => {
    const dep = deployLockAttest();
    const result = dep.contract.impureCircuits.proveGuaranteedMatch(
      withPrivateState(dep.context, candidateState(1_753n, 27n)));
    assert.ok(writeHappensAfterAllReads(result.proofData.publicTranscript as never));
  });
});

describe('V2Q contract surface', () => {
  it('exposes exactly the three V2Q circuits', () => {
    const contract = deployV2Q().contract;
    assert.deepEqual(Object.keys(contract.circuits).sort(),
      ['attestQualification', 'lockPrivateBudget', 'proveGuaranteedMatch']);
  });

  it('the match circuit takes no arguments: nothing can be asserted from outside', () => {
    const dep = deployLockAttest();
    assert.throws(
      () => (dep.contract.impureCircuits.proveGuaranteedMatch as any)(dep.context, true),
      /expected 1 argument/);
  });

  it('attestQualification takes exactly the opaque Q', () => {
    const dep = deployV2Q();
    assert.throws(
      () => (dep.contract.impureCircuits.attestQualification as any)(dep.context),
      /expected 2 arguments/);
  });

  it('declares exactly fifteen witnesses', () => {
    assert.equal(Object.keys(makeWitnesses()).length, 15);
  });
});
