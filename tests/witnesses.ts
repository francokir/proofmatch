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
};

export const createCandidatePrivateState = (
  minimumCompensation: bigint,
  availableWeeklyHours: bigint,
): CandidatePrivateState => ({ minimumCompensation, availableWeeklyHours });

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
};
