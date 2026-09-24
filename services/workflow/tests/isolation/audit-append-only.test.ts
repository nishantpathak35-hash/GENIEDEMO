import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The audit log is append-only, and that is enforced by privilege.
 *
 * "Append-only" asserted in a code comment is worth nothing to an auditor. The
 * question they ask is "what stops someone editing it", and the answer has to
 * be a `GRANT` that omits UPDATE and DELETE — checked here against a real
 * database, as the role that actually serves requests.
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

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

let postgres: StartedTestContainer;
let runtime: Client;

async function asTenant<T>(tenant: string, fn: () => Promise<T>): Promise<T> {
  await runtime.query('BEGIN');
  try {
    await runtime.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenant]);
    const out = await fn();
    await runtime.query('COMMIT');
    return out;
  } catch (e) {
    await runtime.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

async function writeEvent(tenant: string, action: string): Promise<string> {
  const id = randomUUID();
  await asTenant(tenant, async () => {
    await runtime.query(
      `INSERT INTO workflow.audit_events
         (tenant_id, id, actor_id, actor_kind, action, entity_type, entity_id, after)
       VALUES (tenancy.current_tenant_id(), $1, 'u_1', 'staff', $2, 'po', 'po_1', $3)`,
      [id, action, JSON.stringify({ total: '120000' })],
    );
  });
  return id;
}

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

  const admin = new Client({
    host: 'localhost',
    port: postgres.getMappedPort(5432),
    user: 'cog',
    password: 'cog_local_dev',
    database: 'cog',
  });
  await admin.connect();
  for (const { path } of collectMigrations(SERVICES_DIR)) {
    await admin.query(readFileSync(path, 'utf8'));
  }
  await admin.query(`ALTER ROLE app_runtime LOGIN PASSWORD 'runtime_pw'`);
  for (const t of [TENANT_A, TENANT_B]) {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', t]);
    await admin.query(
      `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
       VALUES ($1, $2, 'T', 'https://x.example')`,
      [t, `t-${t.slice(0, 4)}`],
    );
    await admin.query('COMMIT');
  }
  await admin.end();

  runtime = new Client({
    host: 'localhost',
    port: postgres.getMappedPort(5432),
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
  });
  await runtime.connect();
}, 300_000);

afterAll(async () => {
  await runtime?.end().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

describe('append-only is a privilege, not a convention', () => {
  it('allows INSERT and SELECT', async () => {
    const id = await writeEvent(TENANT_A, 'po.approved');
    const rows = await asTenant(TENANT_A, async () =>
      (await runtime.query('SELECT action FROM workflow.audit_events WHERE id = $1', [id])).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it('refuses UPDATE — history cannot be rewritten', async () => {
    const id = await writeEvent(TENANT_A, 'po.approved');
    await expect(
      asTenant(TENANT_A, async () =>
        runtime.query(`UPDATE workflow.audit_events SET action = 'nothing happened' WHERE id = $1`, [
          id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses DELETE — history cannot be erased', async () => {
    const id = await writeEvent(TENANT_A, 'po.deleted');
    await expect(
      asTenant(TENANT_A, async () =>
        runtime.query('DELETE FROM workflow.audit_events WHERE id = $1', [id]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses TRUNCATE, which is not subject to RLS at all', async () => {
    await expect(
      asTenant(TENANT_A, async () => runtime.query('TRUNCATE workflow.audit_events')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the privilege set is exactly SELECT and INSERT', async () => {
    const { rows } = await runtime.query<{ sel: boolean; ins: boolean; upd: boolean; del: boolean }>(
      `SELECT has_table_privilege('app_runtime','workflow.audit_events','SELECT')   AS sel,
              has_table_privilege('app_runtime','workflow.audit_events','INSERT')   AS ins,
              has_table_privilege('app_runtime','workflow.audit_events','UPDATE')   AS upd,
              has_table_privilege('app_runtime','workflow.audit_events','DELETE')   AS del`,
    );
    expect(rows[0]).toEqual({ sel: true, ins: true, upd: false, del: false });
  });
});

describe('the audit log is tenant-scoped like everything else', () => {
  it('one tenant cannot read another tenant audit trail', async () => {
    // An audit log that leaks is worse than one that is missing: it hands one
    // customer a record of another customer's internal approvals.
    await writeEvent(TENANT_A, 'po.approved');
    const seen = await asTenant(TENANT_B, async () =>
      (await runtime.query('SELECT id FROM workflow.audit_events')).rows,
    );
    expect(seen).toHaveLength(0);
  });

  it('cannot write an event attributed to another tenant', async () => {
    await expect(
      asTenant(TENANT_A, async () =>
        runtime.query(
          `INSERT INTO workflow.audit_events
             (tenant_id, id, actor_id, actor_kind, action, entity_type, entity_id)
           VALUES ($1, $2, 'u_1', 'staff', 'planted', 'po', 'po_1')`,
          [TENANT_B, randomUUID()],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('money in the audit trail', () => {
  it('round-trips a value a float could not hold', async () => {
    // jsonb is parsed with JSON.parse on the way out, so money is stored as a
    // string. This is the one table where losing precision is unrecoverable.
    const id = randomUUID();
    const exact = '9007199254740993';
    await asTenant(TENANT_A, async () => {
      await runtime.query(
        `INSERT INTO workflow.audit_events
           (tenant_id, id, actor_id, actor_kind, action, entity_type, entity_id, after)
         VALUES (tenancy.current_tenant_id(), $1, 'u_1', 'staff', 'po.updated', 'po', 'po_1', $2)`,
        [id, JSON.stringify({ totalPaise: exact })],
      );
    });

    const rows = await asTenant(TENANT_A, async () =>
      (
        await runtime.query<{ after: { totalPaise: string } }>(
          'SELECT after FROM workflow.audit_events WHERE id = $1',
          [id],
        )
      ).rows,
    );
    expect(rows[0]?.after.totalPaise).toBe(exact);
  });
});
