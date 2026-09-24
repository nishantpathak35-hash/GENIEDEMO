import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Network, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — repo-level infrastructure, plain .mjs with no declarations.
// It is NOT a cross-service helper: `scripts/` belongs to no service, which is
// why `services/host/tests/isolation/tenant-routes.test.ts` already imports
// `migration-plan.mjs` from here. The FK graph is global, so a suite that only
// asserts on `procurement` still needs the whole graph to build its fixtures.
import { readCatalogue, buildRows, assertOverridesAreLive } from '../../../../scripts/tenant-rows.mjs';

/**
 * Every `procurement` tenant table, proved isolated one table at a time.
 *
 * **Why this suite exists.** `services/procurement` owns 13 tenant tables and
 * had no isolation suite. Their policies ran only when a `host` route happened
 * to reach them — and measured against a fully seeded stack after a 61-screen
 * browser pass, **4 of the 13 are never WRITTEN by anything**:
 * `purchase_order_acceptances`, `retention_holdings`, `vendor_bank_accounts`
 * and `vendor_bills`. Their `WITH CHECK` — the half that stops one tenant
 * planting a payable in another's books — was exercised by nothing at all.
 *
 * **The order of the two INSERT assertions is load-bearing, not stylistic.**
 * For each table the refusal is taken FIRST, against the identical statement
 * that will later succeed, at a moment when tenant B still has no row in that
 * table. Taken the other way round a unique-constraint collision (23505) would
 * arrive where the RLS refusal (42501) was expected and the test would still
 * see an error. That is why the assertion names the SQLSTATE rather than
 * accepting any rejection: a CHECK violation is 23514, a NOT NULL is 23502, an
 * FK is 23503, and every one of them would let a malformed fixture pass for a
 * policy result over exactly the tables nothing else covers.
 *
 * The positive is what proves the row was otherwise valid. Without it a fixture
 * quietly broken for one table gives a passing refusal and nothing to
 * contradict it.
 *
 * It runs as `app_runtime`, which holds neither superuser nor BYPASSRLS — a
 * superuser ignores every policy, so these same assertions would pass against a
 * completely open schema.
 */

const SERVICES_DIR = join(import.meta.dirname, '../../..');
const SCHEMA = 'procurement';

/**
 * Migrations live with the service that owns the tables but share one database
 * and therefore one ordering. Duplicated from the other isolation harnesses
 * rather than extracted, for the reason `tenant-isolation.test.ts` gives: a
 * shared test helper reaching across *service* directories is the coupling the
 * boundary rule exists to prevent.
 */
function collectMigrations(servicesDir: string): Array<{ id: string; path: string }> {
  const found: Array<{ id: string; path: string }> = [];
  for (const service of readdirSync(servicesDir)) {
    const dir = join(servicesDir, service, 'src/infrastructure/migrations');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.sql')) found.push({ id: file, path: join(dir, file) });
    }
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Tables deliberately outside the tenant-policy regime.
 *
 * Empty for this service. `identity` is the only one with entries, and its
 * suite asserts each excluded table really is protected by privilege instead —
 * so a name cannot be added here to silence a failure.
 */
const EXCLUDED = new Set<string>();

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

let postgres: StartedTestContainer;
let bouncer: StartedTestContainer;
let network: Awaited<ReturnType<Network['start']>>;
let bouncerPort: number;

/** Tables this suite asserts on, discovered rather than listed. */
let tables: string[] = [];
/** SQLSTATE returned when tenant A tried to insert tenant B's row. */
const refusal = new Map<string, string>();
/** Tables whose fixture row could not be built — each becomes a named failure. */
let buildFailures = new Map<string, string>();
let staleOverrides: string[] = [];
/**
 * What `app_runtime` may actually do to each table.
 *
 * Three `procurement` tables withhold DELETE, and two of those withhold UPDATE
 * too — `purchase_order_acceptances` and `stock_movements` are append-only
 * records, `vendor_bills` may be corrected but not removed. That is a STRONGER
 * guarantee than a policy, because the privilege does not exist at all, and the
 * write tests below assert whichever of the two applies rather than assuming
 * every table is fully granted.
 */
const grants = new Map<string, Set<string>>();

async function runtimeClient(): Promise<Client> {
  // Without this the first run connected to port `undefined`, which `pg` reads
  // as its default 5432 — the developer's own compose Postgres, not the
  // container this suite started. It failed on a password rather than passing
  // against the wrong database, but only by luck.
  if (!bouncerPort) throw new Error('PgBouncer is not started yet');
  const c = new Client({
    host: 'localhost',
    port: bouncerPort,
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
    application_name: 'procurement-isolation',
  });
  await c.connect();
  return c;
}

/** Set the tenant the way `withTenant` does: transaction-scoped, bind parameter. */
async function asTenant<T>(c: Client, tenantId: string, fn: () => Promise<T>): Promise<T> {
  await c.query('BEGIN');
  try {
    await c.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const out = await fn();
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

beforeAll(async () => {
  network = await new Network().start();

  postgres = await new GenericContainer('postgres:17-alpine')
    .withNetwork(network)
    .withNetworkAliases('pg')
    .withEnvironment({
      POSTGRES_USER: 'cog',
      POSTGRES_PASSWORD: 'cog_local_dev',
      POSTGRES_DB: 'cog',
      POSTGRES_HOST_AUTH_METHOD: 'scram-sha-256',
      POSTGRES_INITDB_ARGS: '--auth-host=scram-sha-256',
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

  // The tenants themselves are the root of the FK graph and belong to the
  // caller: a row the builder invented with a random id would fail every child.
  for (const t of [TENANT_A, TENANT_B]) {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', t]);
    await admin.query(
      `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
       VALUES ($1, $2, $3, $4)`,
      [t, `tenant-${t.slice(0, 4)}`, `Tenant ${t.slice(0, 4)}`, `https://${t.slice(0, 4)}.example`],
    );
    await admin.query('COMMIT');
  }

  const catalogue = await readCatalogue(admin);
  const grantRows = await admin.query<{ t: string; p: string }>(
    `SELECT table_name AS t, privilege_type AS p
       FROM information_schema.role_table_grants
      WHERE grantee = 'app_runtime' AND table_schema = $1`,
    [SCHEMA],
  );
  for (const row of grantRows.rows) {
    const k = `${SCHEMA}.${row.t}`;
    if (!grants.has(k)) grants.set(k, new Set());
    grants.get(k)?.add(row.p);
  }
  await admin.end();

  staleOverrides = assertOverridesAreLive(catalogue);
  tables = (catalogue.tenantTables as string[]).filter(
    (k) => k.startsWith(`${SCHEMA}.`) && !EXCLUDED.has(k),
  );

  bouncer = await new GenericContainer('edoburu/pgbouncer:latest')
    .withNetwork(network)
    .withEnvironment({
      DB_HOST: 'pg',
      DB_PORT: '5432',
      DB_NAME: 'cog',
      DB_USER: 'app_runtime',
      DB_PASSWORD: 'runtime_pw',
      POOL_MODE: 'transaction',
      AUTH_TYPE: 'scram-sha-256',
      MAX_CLIENT_CONN: '50',
      DEFAULT_POOL_SIZE: '1',
      MIN_POOL_SIZE: '1',
      RESERVE_POOL_SIZE: '0',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  bouncerPort = bouncer.getMappedPort(5432);

  const seeded = (t: string) => new Map([['tenancy.tenants', { id: t }]]);

  // Every insert gets its OWN transaction, the way `withTenant` scopes one per
  // operation. A single transaction wrapped around the whole build deadlocked
  // against `DEFAULT_POOL_SIZE: 1` — one client held the only server connection
  // while another waited for it — and died on an idle-in-transaction timeout.
  // Short transactions also mean this suite inherits the multiplexing property
  // for free: every statement below travels through ONE shared server
  // connection, so a tenant context surviving into the next statement would
  // show up here as a wrong answer rather than as a theoretical risk.
  const a = await runtimeClient();
  await buildRows(catalogue, {
    tenantId: TENANT_A,
    only: SCHEMA,
    seeded: seeded(TENANT_A),
    exec: (sql: string) => asTenant(a, TENANT_A, () => a.query(sql)),
  });
  await a.end();

  // Tenant B's rows. For every table the refusal is taken first, on the very
  // statement that is about to succeed, while B still has no row there.
  const b = await runtimeClient();
  const wrong = await runtimeClient();
  const out = await buildRows(catalogue, {
    tenantId: TENANT_B,
    only: SCHEMA,
    seeded: seeded(TENANT_B),
    exec: async (sql: string, k: string) => {
      if (k.startsWith(`${SCHEMA}.`) && !refusal.has(k)) {
        // The identical statement under tenant A's context.
        try {
          await asTenant(wrong, TENANT_A, () => wrong.query(sql));
          refusal.set(k, 'ACCEPTED');
        } catch (e) {
          refusal.set(k, (e as { code?: string }).code ?? 'UNKNOWN');
        }
      }
      return asTenant(b, TENANT_B, () => b.query(sql));
    },
  });
  buildFailures = new Map(
    [...(out.failures as Map<string, string>)].filter(([k]) => !EXCLUDED.has(k)),
  );
  await b.end();
  await wrong.end();

}, 600_000);

afterAll(async () => {
  await bouncer?.stop().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
  await network?.stop().catch(() => undefined);
});

describe('the suite covers what it claims to', () => {
  it('asserts on exactly the tenant tables the live database has', () => {
    // Two independent discoveries — the migration SQL on disk, which fixes the
    // parametrised tests at collection time, and `tenant_id` columns in the
    // running catalogue. Comparing them catches drift in both directions: a
    // table added without a test, and a test left behind pointing at a table
    // that no longer exists. A discovered list that silently shrinks is how a
    // suite reports green over tables it stopped covering.
    expect(DISCOVERED).toEqual([...tables].sort());
  });

  it('has no stale fixture overrides', () => {
    // An override naming a column that no longer exists keeps supplying a value
    // for a constraint that has since moved, and the builder goes on passing.
    expect(staleOverrides).toEqual([]);
  });

  it('built a fixture row for every one of them', () => {
    // Never a skip. A table whose row cannot be built is named here, because a
    // builder that quietly omitted it would report green over exactly the
    // tables least covered anywhere else.
    expect(Object.fromEntries(buildFailures)).toEqual({});
  });
});

// `describe.each` cannot read a list discovered in `beforeAll`, so the table
// list is fixed at collection time from the migrations on disk — the same
// source the container is built from. The count assertion above is what proves
// the two agree.
const DISCOVERED: string[] = (() => {
  const found = new Set<string>();
  const re = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${SCHEMA}\.([a-z_]+)`, 'gi');
  for (const { path } of collectMigrations(SERVICES_DIR)) {
    const sql = readFileSync(path, 'utf8');
    for (const m of sql.matchAll(re)) if (m[1] && !EXCLUDED.has(`${SCHEMA}.${m[1]}`)) {
      found.add(`${SCHEMA}.${m[1]}`);
    }
  }
  return [...found].sort();
})();

describe.each(DISCOVERED)('%s', (table) => {
  const bare = table.slice(SCHEMA.length + 1);

  it('refuses an INSERT carrying another tenant id — SQLSTATE 42501', () => {
    // 42501 is insufficient_privilege, which is what a WITH CHECK failure
    // raises. Naming it is the point: any other code means the statement was
    // rejected for a reason that has nothing to do with tenant isolation.
    expect(refusal.get(table)).toBe('42501');
  });

  it('tenant A reads none of tenant B rows', async () => {
    const c = await runtimeClient();
    try {
      const n = await asTenant(c, TENANT_A, async () => {
        const r = await c.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.${bare} WHERE tenant_id = $1`, [TENANT_B]);
        return (r.rows[0] as { n: number }).n;
      });
      expect(n).toBe(0);
    } finally {
      await c.end();
    }
  });

  /**
   * Run a write against tenant B's rows from inside tenant A's context.
   *
   * Returns the rows affected, or the SQLSTATE if the statement was refused.
   * Both are correct isolation outcomes and the caller asserts on whichever the
   * grant makes applicable — collapsing them into "it didn't work" is how a
   * permission error would come to stand in for a policy result.
   */
  async function attemptFromA(sql: string): Promise<number | string> {
    const c = await runtimeClient();
    try {
      return await asTenant(c, TENANT_A, async () => {
        const r = await c.query(sql, [TENANT_B]);
        return r.rowCount ?? 0;
      });
    } catch (e) {
      return (e as { code?: string }).code ?? 'UNKNOWN';
    } finally {
      await c.end();
    }
  }

  it('tenant A cannot UPDATE tenant B rows', async () => {
    // A SELECT-only test passes against a USING-only policy that has no
    // WITH CHECK, so the write side is asserted separately and explicitly.
    const out = await attemptFromA(
      `UPDATE ${SCHEMA}.${bare} SET tenant_id = tenant_id WHERE tenant_id = $1`,
    );
    // 42501 here is the absence of the privilege itself, which is strictly
    // stronger than a policy refusal. Asserted rather than tolerated, so a
    // table that GAINS an UPDATE grant later starts being held to the row count.
    expect(out).toBe(grants.get(table)?.has('UPDATE') ? 0 : '42501');
  });

  it('tenant A cannot DELETE tenant B rows', async () => {
    const out = await attemptFromA(`DELETE FROM ${SCHEMA}.${bare} WHERE tenant_id = $1`);
    expect(out).toBe(grants.get(table)?.has('DELETE') ? 0 : '42501');
  });

  it('has row level security ENABLEd and FORCEd', async () => {
    // ENABLE without FORCE exempts the table owner, and migrations run as the
    // owner — so an un-FORCEd table is isolated from `app_runtime` and wide
    // open to anything running as `cog`.
    const c = await runtimeClient();
    try {
      const r = await c.query(
        `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2`,
        [SCHEMA, bare],
      );
      expect(r.rows[0]).toEqual({ enabled: true, forced: true });
    } finally {
      await c.end();
    }
  });
});
