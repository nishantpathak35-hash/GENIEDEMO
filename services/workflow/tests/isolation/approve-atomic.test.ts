import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext, TenantId } from '@cog/contracts';
import { ApprovalRefused, recordApproval } from '../../src/application/approve-in-transaction.js';
import type { ApprovalStage, ChainState } from '../../src/domain/approval.js';

/**
 * The decision, its history, its audit row and its event are ONE transaction.
 *
 * The legacy updates the request and then writes history with no transaction
 * between them (APPR-05), so a failure in between leaves a request approved
 * with no record of who approved it — and the record is the only thing a
 * dispute can be settled from.
 */

const SERVICES_DIR = join(import.meta.dirname, '../../..');

function collectMigrations(dir: string): Array<{ id: string; path: string }> {
  const found: Array<{ id: string; path: string }> = [];
  for (const service of readdirSync(dir)) {
    const d = join(dir, service, 'src/infrastructure/migrations');
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (f.endsWith('.sql')) found.push({ id: f, path: join(d, f) });
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

const TENANT = '11111111-1111-4111-8111-111111111111' as TenantId;
const AT = new Date('2026-09-04T10:00:00Z');

// `approvalCeilingPaise: null` — the shipped state, and the only value this
// fixture may carry. A ceiling is a figure the organisation agrees; a plausible
// number here would be indistinguishable from an agreed one later (PO-13d).
// The field was added to `ApprovalStage` and this fixture never followed,
// which nothing reported because no test file was typechecked.
const STAGES: ApprovalStage[] = [
  {
    name: 'Pending Finance',
    sequence: 1,
    approverRole: 'finance',
    minApprovals: 1,
    approvalCeilingPaise: null,
  },
  {
    name: 'Pending Director',
    sequence: 2,
    approverRole: 'director',
    minApprovals: 1,
    approvalCeilingPaise: null,
  },
];

const ctx = (id: string): TenantContext => ({
  tenantId: TENANT,
  principal: { kind: 'staff', id, roles: ['finance'] },
  requestId: 'req_1',
});

const state = (over: Partial<ChainState> = {}): ChainState => ({
  currentStage: 'Pending Finance',
  requesterId: 'u_requester',
  approvals: [],
  ...over,
});

let postgres: StartedTestContainer;
let client: Client;

async function inTx<T>(fn: (tx: { query: Client['query'] }) => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT]);
    const out = await fn({ query: ((s: string, p?: unknown[]) => client.query(s, p)) as never });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

const tx = {
  query: async (sql: string, params: readonly unknown[] = []) =>
    (await client.query(sql, params as unknown[])).rows as never,
};

beforeAll(async () => {
  postgres = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({
      POSTGRES_USER: 'cog',
      POSTGRES_PASSWORD: 'cog_local_dev',
      POSTGRES_DB: 'cog',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const port = postgres.getMappedPort(5432);
  const admin = new Client({
    host: 'localhost',
    port,
    user: 'cog',
    password: 'cog_local_dev',
    database: 'cog',
  });
  await admin.connect();
  for (const { path } of collectMigrations(SERVICES_DIR)) {
    await admin.query(readFileSync(path, 'utf8'));
  }
  await admin.query(`ALTER ROLE app_runtime LOGIN PASSWORD 'runtime_pw'`);
  await admin.query('BEGIN');
  await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT]);
  await admin.query(
    `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
     VALUES ($1, 'aarambh', 'Aarambh', 'https://x.example')`,
    [TENANT],
  );
  await admin.query('COMMIT');
  await admin.end();

  client = new Client({
    host: 'localhost',
    port,
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
  });
  await client.connect();
}, 300_000);

// No cleanup between tests, deliberately.
//
// The first version of this suite deleted from workflow.approval_history in a
// beforeEach and every test failed with "permission denied" — which is the
// guarantee working: the table is append-only by privilege, and that applies to
// the test harness too. Each test therefore uses its own entity id and counts
// are scoped to it.

afterAll(async () => {
  await client?.end().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

/** Counts scoped to one entity, since the tables are append-only. */
async function counts(entityId: string): Promise<{ history: number; audit: number; events: number }> {
  return inTx(async () => {
    const one = async (table: string): Promise<number> =>
      Number(
        (
          await client.query<{ n: string }>(
            `SELECT count(*) AS n FROM ${table} WHERE entity_id = $1`,
            [entityId],
          )
        ).rows[0]?.n,
      );
    return {
      history: await one('workflow.approval_history'),
      audit: await one('workflow.audit_events'),
      events: await one('workflow.events'),
    };
  });
}

describe('an approval writes history, audit and event together', () => {
  it('records all three when the decision succeeds', async () => {
    await inTx(async () =>
      recordApproval({
        tx,
        ctx: ctx('u_finance'),
        entityType: 'payment_request',
        entityId: 'pr_1',
        stages: STAGES,
        state: state(),
        approverRoles: ['finance'],
        at: AT,
        applyDecision: async () => undefined,
      }),
    );

    expect(await counts('pr_1')).toEqual({ history: 1, audit: 1, events: 1 });
  });

  it('ROLLS BACK all of it when the caller state change fails', async () => {
    // This is APPR-05. In the legacy the request is already updated and only
    // the history write fails, leaving an approved record with no evidence.
    await expect(
      inTx(async () =>
        recordApproval({
          tx,
          ctx: ctx('u_finance'),
          entityType: 'payment_request',
          entityId: 'pr_2',
          stages: STAGES,
          state: state(),
          approverRoles: ['finance'],
          at: AT,
          applyDecision: async () => {
            throw new Error('the aggregate write failed');
          },
        }),
      ),
    ).rejects.toThrow('the aggregate write failed');

    expect(await counts('pr_2')).toEqual({ history: 0, audit: 0, events: 0 });
  });

  it('writes nothing at all when the decision is refused', async () => {
    // A history row for a refused decision reads, later, as an approval that
    // was reversed.
    await expect(
      inTx(async () =>
        recordApproval({
          tx,
          ctx: ctx('u_requester'), // the requester approving their own request
          entityType: 'payment_request',
          entityId: 'pr_3',
          stages: STAGES,
          state: state(),
          approverRoles: ['finance'],
          at: AT,
          applyDecision: async () => undefined,
        }),
      ),
    ).rejects.toBeInstanceOf(ApprovalRefused);

    expect(await counts('pr_3')).toEqual({ history: 0, audit: 0, events: 0 });
  });
});

describe('the database enforces one approval per person per stage', () => {
  it('refuses a second approval from the same person, even bypassing the engine', async () => {
    // The engine checks this too, but an engine can be bypassed by a future
    // code path and a constraint cannot.
    await inTx(async () =>
      recordApproval({
        tx,
        ctx: ctx('u_finance'),
        entityType: 'payment_request',
        entityId: 'pr_4',
        stages: STAGES,
        state: state(),
        approverRoles: ['finance'],
        at: AT,
        applyDecision: async () => undefined,
      }),
    );

    await expect(
      inTx(async () =>
        client.query(
          `INSERT INTO workflow.approval_history
             (tenant_id, id, entity_type, entity_id, stage_name, decision,
              approver_id, requester_id)
           VALUES (tenancy.current_tenant_id(), gen_random_uuid(), 'payment_request',
                   'pr_4', 'Pending Finance', 'approved', 'u_finance', 'u_requester')`,
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('history is append-only', () => {
  it('cannot be edited or deleted by the runtime role', async () => {
    await inTx(async () =>
      recordApproval({
        tx,
        ctx: ctx('u_finance'),
        entityType: 'payment_request',
        entityId: 'pr_5',
        stages: STAGES,
        state: state(),
        approverRoles: ['finance'],
        at: AT,
        applyDecision: async () => undefined,
      }),
    );

    // The legacy po_approval_history is rewritten when a PO is renamed and
    // deleted with the PO, so the record disappears with the thing it records.
    await expect(
      inTx(async () =>
        client.query(
          `UPDATE workflow.approval_history SET decision = 'rejected' WHERE entity_id = 'pr_5'`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      inTx(async () =>
        client.query(`DELETE FROM workflow.approval_history WHERE entity_id = 'pr_5'`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
