/**
 * Witnesses de prueba para el contrato ProofMatchJob.
 *
 * ALCANCE: solo tests contractuales. Esta NO es la implementacion productiva
 * de private state: esa vive en la capa de integracion TypeScript y es
 * ownership de Coqui. Acá solo se provee lo mínimo para poder ejercitar el
 * circuito desde `node --test`.
 *
 * El contrato declara los witnesses; la implementación siempre la aporta el
 * DApp. Por eso el circuito nunca confía en lo que estas funciones devuelven:
 * valida rango y compatibilidad sobre el valor recibido.
 */
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

import type { Ledger } from '../contracts/managed/proofmatch-job/contract/index.js';

/**
 * Estado privado del candidato.
 *
 * Unidades (convención del MVP, ver docs/CONTRACT_INTERFACE.md):
 * - `minimumCompensation`: USD mensuales enteros.
 * - `availableWeeklyHours`: horas por semana.
 */
export type CandidatePrivateState = {
  readonly minimumCompensation: bigint;
  readonly availableWeeklyHours: bigint;
  /** Secreto estable del candidato, 32 bytes. Nunca sale de su máquina. */
  readonly secret: Uint8Array;
};

/**
 * Secreto de prueba determinista, distinto por `seed`.
 *
 * ⚠️ SOLO PARA TESTS. NO copiar como referencia de implementación.
 *
 * Esto es exactamente el antipatrón que la implementación productiva debe
 * evitar: un secreto derivado de un valor enumerable. El nullifier es
 * `hash(dominio, direcciónDelContrato, secreto)`, y los dos primeros son
 * públicos — así que si el secreto es adivinable, cualquiera puede recomputar
 * el nullifier de un candidato concreto y comprobar en `usedNullifiers` si se
 * postuló. Eso rompe la privacidad entera del esquema sin tocar el contrato.
 *
 * En producción: 32 bytes de un CSPRNG (`crypto.getRandomValues`), generados
 * una sola vez y persistidos. Ver docs/CONTRACT_INTERFACE.md.
 *
 * Acá es deliberadamente determinista para que los tests sean reproducibles.
 */
export const testSecret = (seed: number): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => (seed * 31 + i * 7 + 1) % 256);

export const createCandidatePrivateState = (
  minimumCompensation: bigint,
  availableWeeklyHours: bigint,
  secret: Uint8Array = testSecret(1),
): CandidatePrivateState => ({ minimumCompensation, availableWeeklyHours, secret });

/**
 * Implementación honesta: devuelve tal cual lo que hay en el private state.
 * Los tests adversariales usan implementaciones alternativas para simular un
 * DApp que miente.
 */
export const witnesses = {
  candidateMinimumCompensation: ({
    privateState,
  }: WitnessContext<Ledger, CandidatePrivateState>): [CandidatePrivateState, bigint] => [
    privateState,
    privateState.minimumCompensation,
  ],

  candidateAvailableWeeklyHours: ({
    privateState,
  }: WitnessContext<Ledger, CandidatePrivateState>): [CandidatePrivateState, bigint] => [
    privateState,
    privateState.availableWeeklyHours,
  ],

  candidateSecret: ({
    privateState,
  }: WitnessContext<Ledger, CandidatePrivateState>): [CandidatePrivateState, Uint8Array] => [
    privateState,
    privateState.secret,
  ],
};
