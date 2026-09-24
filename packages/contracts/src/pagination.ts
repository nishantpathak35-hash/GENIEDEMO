import { z } from 'zod';

/**
 * Cursor pagination.
 *
 * Cursor rather than offset because these are tenant-scoped ledgers under
 * concurrent write: with `LIMIT/OFFSET`, a row inserted while a finance user
 * pages through a payment register shifts every later page, so a voucher is
 * silently skipped or shown twice. That is tolerable in a search result and not
 * in a reconciliation.
 *
 * The legacy app has no pagination at all — `getBootBundle` and
 * `clearCacheAndGetMaster` return whole tables — so there is nothing to port
 * here, only a default to set before the surface exists.
 */

/**
 * A cursor is opaque to the client: it encodes the sort key of the last row
 * returned, and it is only valid for the query that produced it.
 *
 * It must be **tenant-scoped and unguessable enough not to be portable** — a
 * cursor from tenant A presented to tenant B's request must not widen anything.
 * RLS is the backstop that makes that true regardless, but the cursor should
 * not be the thing relying on it.
 */
export const cursor = z.string().min(1).max(512);

export const pageRequest = z.object({
  /**
   * Capped at 200. An uncapped `limit` is a denial-of-service parameter the
   * client controls, and with per-tenant row-level security every row costs a
   * policy evaluation.
   */
  limit: z.number().int().min(1).max(200).default(50),
  cursor: cursor.optional(),
  /** `before` walks to the page preceding the cursor — a "previous" link. */
  dir: z.enum(['after', 'before']).default('after'),
});

export type PageRequest = z.infer<typeof pageRequest>;

/**
 * A page of results.
 *
 * `nextCursor` is `string | null`, never an absent key: an optional property
 * that disappears from the JSON forces every client to distinguish "no more
 * pages" from "the server forgot to tell me", and they are not the same thing.
 * `prevCursor` is the same for the other direction. `count` is how many rows
 * match the request's filters in total — the number a pager prints after
 * "of" — and it is the server's, from the same predicate, never the length
 * of a page.
 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/** Build the page schema for a given item schema. */
export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: cursor.nullable(),
    prevCursor: cursor.nullable(),
    count: z.number().int().nonnegative(),
  });
}
