import { TERM_KEYS, TERM_OPTIONS, type SaveTerminologyInput, type TermKey, type Terminology, type TerminologyResponse } from '@cog/contracts';
import type { TxLike } from './provisioning.js';

/**
 * The words this tenant uses — one per pair, read by every label.
 *
 * A pair with no row is the pair's first word. The write path refuses a word
 * outside its pair, because the word reaches the generated navigation, every
 * list's title and column, and a document's heading; the contract's enum
 * already says so at the edge and this says it again where the row is
 * written, so a caller that bypasses the contract cannot plant a label.
 */
export class TerminologyRefused extends Error {
  override readonly name = 'TerminologyRefused';
}

/** The pair's first word, for every pair — what a firm that never chose reads. */
export const DEFAULT_TERMINOLOGY: Terminology = Object.fromEntries(
  TERM_KEYS.map((key) => [key, TERM_OPTIONS[key][0]]),
) as Terminology;

export async function getTerminology(tx: TxLike): Promise<TerminologyResponse> {
  const rows = await tx.query<{ term_key: string; word: string; changed_at: string }>(
    `SELECT term_key, word, changed_at::text AS changed_at
       FROM tenancy.terminology
      ORDER BY changed_at DESC`,
  );
  const out: Record<string, string> = { ...DEFAULT_TERMINOLOGY };
  let changedAt: string | null = null;
  for (const row of rows) {
    const key = row.term_key as TermKey;
    // a row whose word left its pair (a pair rewritten in a later release) reads as the default, never as a stray label
    if (!TERM_KEYS.includes(key) || !(TERM_OPTIONS[key] as readonly string[]).includes(row.word)) continue;
    out[key] = row.word;
    if (changedAt === null) changedAt = row.changed_at;
  }
  return { ...(out as Terminology), changedAt };
}

/**
 * Choose a word for one or more pairs. Upsert, because the row may never have
 * existed; `changed_by` and `changed_at` are written on every change.
 */
export async function saveTerminology(
  tx: TxLike,
  tenantId: string,
  input: SaveTerminologyInput,
  changedBy: string | null,
): Promise<TerminologyResponse> {
  for (const key of TERM_KEYS) {
    const word = input[key];
    if (word === undefined) continue;
    if (!(TERM_OPTIONS[key] as readonly string[]).includes(word)) {
      throw new TerminologyRefused(`“${word}” is not one of the two words for that pair: ${TERM_OPTIONS[key].join(' or ')}.`);
    }
    await tx.query(
      `INSERT INTO tenancy.terminology (tenant_id, term_key, word, changed_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, term_key)
       DO UPDATE SET word       = EXCLUDED.word,
                     changed_by = EXCLUDED.changed_by,
                     changed_at = now()`,
      [tenantId, key, word, changedBy],
    );
  }
  return getTerminology(tx);
}
