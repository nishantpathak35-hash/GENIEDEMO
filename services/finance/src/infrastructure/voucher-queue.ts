import type { TenantId, Voucher } from '@cog/contracts';
import type { VoucherQueue, VoucherResult } from '../api/connector.js';

/**
 * The staged-voucher queue, backed by `finance.tally_vouchers`.
 *
 * Runs through a tenant-scoped transaction supplied by the host, so RLS applies
 * to every statement here. Nothing in this file adds a `WHERE tenant_id = ...`
 * of its own — the policy does that, and duplicating it in application code is
 * how the two drift apart and one of them gets forgotten.
 */

export interface TenantTxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

/** Runs a callback inside a transaction with the tenant context set. */
export type TenantRunner = <T>(
  tenantId: TenantId,
  fn: (tx: TenantTxLike) => Promise<T>,
) => Promise<T>;

interface VoucherRow extends Record<string, unknown> {
  id: string;
  kind: string;
  xml: string;
  created_at: Date;
  attempts: number;
}

const toVoucher = (r: VoucherRow): Voucher => ({
  id: r.id,
  kind: r.kind,
  xml: r.xml,
  createdAt: r.created_at.toISOString(),
  attempts: r.attempts,
});

/**
 * Attempts after which a voucher stops being re-offered.
 *
 * Provisional, and agreed with the connector session as changeable. It counts
 * PERMANENT failures only — see CONNECTOR-02, where the increment point is
 * still undefined on the wire. Counting hand-outs instead would dead-letter a
 * whole batch in minutes when a connector crash-loops, with nothing having
 * reached Tally.
 */
export const DEAD_LETTER_AFTER = 5;

export function createVoucherQueue(run: TenantRunner): VoucherQueue {
  return {
    async claim(tenantId, limit, instanceId, leaseSeconds) {
      return run(tenantId, async (tx) => {
        if (instanceId === null) {
          // The frozen contract's unleased path: a connector that omits
          // X-Connector-Instance gets the old behaviour. This is CONNECTOR-04 —
          // it re-opens the double-post hole, and it protects a population of
          // zero deployed builds. Implemented as frozen, not as recommended.
          const rows = await tx.query<VoucherRow>(
            `SELECT id, kind, xml, created_at, attempts
               FROM finance.tally_vouchers
              WHERE status = 'pending'
              ORDER BY created_at
              LIMIT $1`,
            [limit],
          );
          return rows.map(toVoucher);
        }

        // ONE statement, not a select followed by an update.
        //
        // Two connectors polling at the same moment would both win a
        // select-then-update, hand the same voucher to two machines, and put it
        // into a book of account twice. `FOR UPDATE SKIP LOCKED` lets the
        // second poller take the next rows instead of blocking on the first.
        const rows = await tx.query<VoucherRow>(
          `WITH claimable AS (
             SELECT tenant_id, id
               FROM finance.tally_vouchers
              WHERE status IN ('pending', 'leased')
                AND (leased_until IS NULL OR leased_until < now())
              ORDER BY created_at
              LIMIT $1
              FOR UPDATE SKIP LOCKED
           )
           UPDATE finance.tally_vouchers v
              SET status       = 'leased',
                  leased_by    = $2::uuid,
                  leased_until = now() + make_interval(secs => $3)
             FROM claimable c
            WHERE v.tenant_id = c.tenant_id AND v.id = c.id
          RETURNING v.id, v.kind, v.xml, v.created_at, v.attempts`,
          [limit, instanceId, leaseSeconds],
        );
        return rows.map(toVoucher);
      });
    },

    async report(tenantId, voucherId, result: VoucherResult) {
      return run(tenantId, async (tx) => {
        if (result.status === 'posted') {
          // A posted report is a fact about Tally, not about the queue, and it
          // is terminal. Accepted regardless of who holds the lease: refusing a
          // late report from an instance whose lease expired would leave the
          // voucher re-offerable when it is already in the customer's books.
          //
          // `status <> 'posted'` makes the repeat a no-op rather than an error,
          // which is what the contract's idempotency promise requires.
          const posted = await tx.query(
            `UPDATE finance.tally_vouchers
                SET status = 'posted',
                    tally_voucher_id = $2,
                    posted_at = now(),
                    leased_by = NULL,
                    leased_until = NULL
              WHERE id = $1 AND status <> 'posted'
              RETURNING id`,
            [voucherId, result.tallyVoucherId ?? null],
          );
          // The operator directory learns that Tally took something (0090) —
          // on the first report only; a repeated report posts nothing new.
          if (posted.length > 0) await tx.query(`SELECT tenancy.note_tenant_activity('posted')`);
          return;
        }

        // A failure increments the attempt count and dead-letters once the
        // budget is spent, so a poison voucher stops cycling forever.
        //
        // It does NOT overwrite a voucher already marked posted: a stale
        // failure arriving after a success must not resurrect it.
        await tx.query(
          `UPDATE finance.tally_vouchers
              SET attempts = attempts + 1,
                  status = CASE WHEN attempts + 1 >= $3 THEN 'dead' ELSE 'pending' END,
                  last_error_code = $2,
                  last_error_message = left($4, 4096),
                  leased_by = NULL,
                  leased_until = NULL
            WHERE id = $1 AND status NOT IN ('posted', 'dead')`,
          [
            voucherId,
            result.error?.code ?? 'UNKNOWN',
            DEAD_LETTER_AFTER,
            result.error?.message ?? '',
          ],
        );
      });
    },

    async touchInstance(tenantId, instanceId, version) {
      if (instanceId === null) return;
      return run(tenantId, async (tx) => {
        // This is what makes "the connector is down" a diagnosable support
        // category rather than a guess.
        await tx.query(
          `INSERT INTO tenancy.connector_instances (tenant_id, id, version, last_seen_at)
           VALUES (tenancy.current_tenant_id(), $1::uuid, $2, now())
           ON CONFLICT (tenant_id, id)
           DO UPDATE SET last_seen_at = now(), version = EXCLUDED.version`,
          [instanceId, version ?? ''],
        );
        await tx.query(`SELECT tenancy.note_tenant_activity('connector_seen')`);
      });
    },
  };
}

/** Stage a voucher for the connector to pick up. */
export async function stageVoucher(
  run: TenantRunner,
  tenantId: TenantId,
  voucher: { id: string; kind: string; xml: string; remoteId: string },
): Promise<void> {
  await run(tenantId, async (tx) => {
    // `remote_id` is unique per tenant, so re-staging the same document is a
    // no-op rather than a second voucher. That is the cloud-side half of
    // deduplication; the other half is Tally seeing the same REMOTEID.
    await tx.query(
      `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
       VALUES (tenancy.current_tenant_id(), $1::uuid, $2, $3, $4)
       ON CONFLICT (tenant_id, remote_id) DO NOTHING`,
      [voucher.id, voucher.kind, voucher.xml, voucher.remoteId],
    );
  });
}
