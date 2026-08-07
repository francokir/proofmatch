import {
  CompactTypeUnsignedInteger,
  persistentCommit,
  type CompactType,
} from '@midnight-ntwrk/compact-runtime';

import type { ProofMatchV2PublicState } from './public-state';

/**
 * Consent Reveal.
 *
 * During a match the contract stores commitments, not values. Later, if both
 * sides want to move forward, one of them can hand over the value and its
 * opening; the other recomputes the commitment and checks it against the one
 * already on the ledger.
 *
 * Two properties matter:
 *
 *   - Revealing is voluntary and per field. Revealing the salary says nothing
 *     about the hours, the location or the radius.
 *   - Neither side can move the goalposts. The commitment was published before
 *     any negotiation, so a value that validates is provably the one used in
 *     the original match.
 *
 * None of this needs a circuit: verification is a local hash recomputation.
 */

export type RevealField = 'candidateSalary' | 'candidateHours' | 'employerSalaryCap';

/**
 * What one party hands to the other. Safe to send over any channel the two
 * already trust — copy/paste, a QR, a file. It is not secret in itself, but it
 * does contain the revealed value, which is the whole point of consenting.
 */
export interface RevealPackage {
  readonly field: RevealField;
  /** Contract address of the vacancy this reveal belongs to. */
  readonly contractAddress: string;
  /** Nullifier of the match, hex. Absent for the employer cap, which is per-job. */
  readonly nullifier?: string;
  readonly value: string;
  readonly opening: string;
}

export type RevealVerdict =
  | { readonly valid: true; readonly field: RevealField; readonly value: bigint }
  | { readonly valid: false; readonly reason: string };

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const unhex = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'hex'));

/** Runtime types matching the Compact declarations exactly. */
const UINT64: CompactType<bigint> = new CompactTypeUnsignedInteger(2n ** 64n - 1n, 8);
const UINT8: CompactType<bigint> = new CompactTypeUnsignedInteger(2n ** 8n - 1n, 1);

function runtimeTypeFor(field: RevealField): CompactType<bigint> {
  // Must mirror the contract: salary and cap are Uint<64>, hours are Uint<8>.
  // Using the wrong width changes the encoding and the commitment never matches.
  return field === 'candidateHours' ? UINT8 : UINT64;
}

/**
 * Builds the package one party sends to the other.
 *
 * The caller supplies the value and opening from its own private state; this
 * function never reads private state itself, so it cannot leak more than the
 * single field being revealed.
 */
export function createRevealPackage(input: {
  readonly field: RevealField;
  readonly contractAddress: string;
  readonly nullifier?: Uint8Array;
  readonly value: bigint;
  readonly opening: Uint8Array;
}): RevealPackage {
  if (input.opening.length !== 32) {
    throw new Error('ProofMatch V2 reveal: opening must contain exactly 32 bytes');
  }
  if (input.field !== 'employerSalaryCap' && input.nullifier === undefined) {
    throw new Error('ProofMatch V2 reveal: a candidate reveal needs its match nullifier');
  }
  return {
    field: input.field,
    contractAddress: input.contractAddress,
    ...(input.nullifier === undefined ? {} : { nullifier: hex(input.nullifier) }),
    value: input.value.toString(),
    opening: hex(input.opening),
  };
}

/** Serialises a package for transport. Any channel works; no backend needed. */
export const encodeRevealPackage = (pkg: RevealPackage): string => JSON.stringify(pkg);

export function decodeRevealPackage(text: string): RevealPackage {
  const parsed = JSON.parse(text) as RevealPackage;
  if (typeof parsed?.field !== 'string' || typeof parsed?.value !== 'string'
      || typeof parsed?.opening !== 'string' || typeof parsed?.contractAddress !== 'string') {
    throw new Error('ProofMatch V2 reveal: malformed package');
  }
  return parsed;
}

/**
 * Verifies a reveal against the commitment already on the ledger.
 *
 * The public state must have been read from the indexer for the same contract
 * the package names — that check is enforced here, so a package from job A can
 * never validate against job B.
 */
export function verifyRevealPackage(
  pkg: RevealPackage,
  publicState: ProofMatchV2PublicState,
  contractAddress: string,
): RevealVerdict {
  if (pkg.contractAddress !== contractAddress) {
    return { valid: false, reason: 'package belongs to a different contract' };
  }

  let value: bigint;
  let opening: Uint8Array;
  try {
    value = BigInt(pkg.value);
    opening = unhex(pkg.opening);
  } catch {
    return { valid: false, reason: 'malformed value or opening' };
  }
  if (opening.length !== 32) return { valid: false, reason: 'opening must contain exactly 32 bytes' };

  let onChain: Uint8Array | undefined;

  if (pkg.field === 'employerSalaryCap') {
    if (!publicState.budgetLocked) return { valid: false, reason: 'employer budget is not locked' };
    onChain = publicState.employerBudgetCommitment;
  } else {
    if (pkg.nullifier === undefined) return { valid: false, reason: 'missing match nullifier' };
    let nullifier: Uint8Array;
    try {
      nullifier = unhex(pkg.nullifier);
    } catch {
      return { valid: false, reason: 'malformed nullifier' };
    }
    const commitments = pkg.field === 'candidateSalary'
      ? publicState.candidateSalaryCommitments
      : publicState.candidateHoursCommitments;
    if (!commitments.member(nullifier)) {
      return { valid: false, reason: 'no commitment registered for that match in this contract' };
    }
    onChain = commitments.lookup(nullifier);
  }

  if (onChain === undefined) return { valid: false, reason: 'no commitment found on chain' };

  let recomputed: Uint8Array;
  try {
    recomputed = persistentCommit(runtimeTypeFor(pkg.field), value, opening);
  } catch (error) {
    return { valid: false, reason: `value does not fit its field type: ${(error as Error).message}` };
  }

  if (hex(recomputed) !== hex(onChain)) {
    return { valid: false, reason: 'commitment mismatch: value or opening was altered' };
  }

  return { valid: true, field: pkg.field, value };
}
