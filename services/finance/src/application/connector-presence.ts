import type { TxLike } from './tax-rates.js';

/**
 * Whether Tally has ever received anything from this tenant.
 *
 * `finance.tally_vouchers.posted_at` is set only by a connector reporting
 * `posted` for a voucher it took from the queue, so the latest one is the
 * last moment a book of account was written to. Nothing here computes a
 * figure; it answers "yes, when" or "never" — the Tally step on the Today
 * setup card used to answer `unknown` because nothing recorded this
 * (DATA-05).
 */
export interface ConnectorPosting {
  readonly lastPostedAt: string | null;
  readonly postedCount: number;
  /** Vouchers waiting for a connector to take them. */
  readonly pendingCount: number;
}

export async function connectorPosting(tx: TxLike): Promise<ConnectorPosting> {
  const rows = await tx.query<{
    last_posted_at: string | null;
    posted_count: number;
    pending_count: number;
  }>(
    `SELECT max(posted_at)::text AS last_posted_at,
            count(*) FILTER (WHERE status = 'posted')::int AS posted_count,
            count(*) FILTER (WHERE status = 'pending')::int AS pending_count
       FROM finance.tally_vouchers`,
  );
  const row = rows[0];
  return {
    lastPostedAt: row?.last_posted_at ?? null,
    postedCount: row?.posted_count ?? 0,
    pendingCount: row?.pending_count ?? 0,
  };
}
