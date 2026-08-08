/**
 * CEFR English proficiency scale as used by the verified-qualification demo.
 *
 * The NUMBER is what the contract seals as `requiredQualificationLevel` and
 * what the bridge compares against; the LABEL is what the Midnames credential
 * carries in `credentialSubject.englishLevel`. The candidate's exact level
 * never reaches the chain — only the vacancy's requirement does.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type CefrLabel = (typeof CEFR_LEVELS)[number];

/** A1=1 … C2=6. Matches the contract's 1..6 constructor assertion. */
export function cefrLevelNumber(label: string): bigint {
  const index = (CEFR_LEVELS as readonly string[]).indexOf(label);
  if (index === -1) throw new Error(`ProofMatch: unknown CEFR level "${label}"`);
  return BigInt(index + 1);
}

export function cefrLevelLabel(level: bigint): CefrLabel {
  const index = Number(level) - 1;
  const label = CEFR_LEVELS[index];
  if (!label) throw new Error(`ProofMatch: CEFR level number out of range: ${level}`);
  return label;
}

export function isCefrLabel(value: unknown): value is CefrLabel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

/** True when a credential at `credentialLevel` satisfies `requiredLevel`. */
export function satisfiesLevel(credentialLevel: bigint, requiredLevel: bigint): boolean {
  return credentialLevel >= requiredLevel;
}
