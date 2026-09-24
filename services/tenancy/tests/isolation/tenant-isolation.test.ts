import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Network, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The tenant-isolation suite.
 *
 * This is the artifact handed to a customer's security reviewer, so it is
 * written to fail rather than to pass. Three things make it non-vacuous:
 *
 *   1. It runs through **PgBouncer in transaction mode**, not straight to
 *      Postgres, because that is the pooling mode that silently discards a
 *      session variable.
 *   2. It uses **two separate client connections** and asserts they share one
 *      server backend (`pg_backend_pid()`), which is the only way to prove a
 *      server connection was actually reused between tenants. A single client
 *      would exercise Postgres's LOCAL-revert, which was never in doubt.
 *   3. It includes a **deliberately-broken** case proving the leak is real when
 *      the discipline is violated — so the suite fails the day someone changes
 *      the pooling config without understanding why it was set.
 *
 * It runs as `app_runtime`, which holds neither superuser nor BYPASSRLS. A
 * superuser silently ignores every policy, so the same assertions would pass
 * against a completely broken schema.
 */

const SERVICES_DIR = join(import.meta.dirname, '../../..');
/**
 * Migrations live with the service that owns the tables (TOPOLOGY), but they
 * share one database and therefore one ordering — the numeric prefix is global.
 * Ten lines duplicated across two test harnesses rather than extracted, because
 * a shared test helper that reaches across service directories is exactly the
 * coupling the boundary rule exists to prevent.
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
 * The only tables permitted to be ENABLE-without-FORCE.
 *
 * Each must be read BEFORE a tenant is known — resolving a bearer key or a
 * provider identity is what establishes the context — so no tenant predicate
 * can apply to them. They are protected by privilege instead: owned by
 * `app_auth`, with no grant to `app_runtime`, reachable only through a
 * SECURITY DEFINER function.
 *
 * The list is short and the tests below make it self-policing: an entry here
 * must have NO tenant policy (otherwise it should have been FORCEd) and must be
 * unreadable by `app_runtime`. Adding a name is therefore not enough to smuggle
 * a table past the guarantee.
 */
/**
 * Tables outside the tenant model, and the schema each lives in.
 *
 * An exception is legitimate only if it is genuinely not tenant-scoped AND
 * `app_runtime` cannot read it — the two assertions below are what keep this
 * from being a hole with a comment on it. The platform tables are exceptions
 * for the same reason the bootstrap ones are: a platform account belongs to no
 * tenant, so there is no tenant predicate that could be written for them, and
 * the runtime reaches them only through SECURITY DEFINER functions that check
 * for a platform principal.
 */
const BOOTSTRAP_TABLES = new Map([
  ['connector_keys', 'tenancy'],
  ['principal_lookup', 'identity'],
  // Redeeming an invitation is the same bootstrap as signing in, one step
  // earlier: the redeemer has no principal, so `identity.invites` — FORCE RLS —
  // returns them nothing. Same shape as `principal_lookup`, and held to the
  // same two assertions below: no tenant policy, unreadable by app_runtime.
  ['invite_lookup', 'identity'],
  ['platform_principals', 'tenancy'],
  ['provisioning_events', 'tenancy'],
  ['tenant_directory', 'tenancy'],
]);

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

let network: Awaited<ReturnType<Network['start']>>;
let postgres: StartedTestContainer;
let bouncer: StartedTestContainer;
let bouncerPort: number;

/** A client through PgBouncer, as app_runtime. */
async function runtimeClient(): Promise<Client> {
  const c = new Client({
    host: 'localhost',
    port: bouncerPort,
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
    application_name: 'isolation-suite',
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
      // PgBouncer authenticates the client itself; scram is what production uses.
      POSTGRES_HOST_AUTH_METHOD: 'scram-sha-256',
      POSTGRES_INITDB_ARGS: '--auth-host=scram-sha-256',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  // --- migrations, as the superuser -------------------------------------
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

  // The migration creates the roles NOLOGIN — they are not credentials, they
  // are privilege boundaries. Give the runtime role a login only for the test.
  await admin.query(`ALTER ROLE app_runtime LOGIN PASSWORD 'runtime_pw'`);

  // Seed one row per tenant, through the tenant context rather than around it,
  // so the fixtures themselves prove WITH CHECK accepts a correct write.
  for (const t of [TENANT_A, TENANT_B]) {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', t]);
    await admin.query(
      `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
       VALUES ($1, $2, $3, $4)`,
      [t, `tenant-${t.slice(0, 4)}`, `Tenant ${t.slice(0, 4)}`, `https://${t.slice(0, 4)}.example`],
    );
    await admin.query(
      `INSERT INTO tenancy.connector_instances (tenant_id, id, hostname)
       VALUES ($1, gen_random_uuid(), $2)`,
      [t, `machine-${t.slice(0, 4)}`],
    );
    await admin.query('COMMIT');
  }
  await admin.end();

  // --- PgBouncer, transaction mode, ONE server connection ----------------
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
      // The whole point: every client shares ONE server connection, so a leak
      // through connection reuse is guaranteed to be exercised rather than
      // merely possible.
      DEFAULT_POOL_SIZE: '1',
      MIN_POOL_SIZE: '1',
      RESERVE_POOL_SIZE: '0',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  bouncerPort = bouncer.getMappedPort(5432);
}, 300_000);

afterAll(async () => {
  await bouncer?.stop().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
  await network?.stop().catch(() => undefined);
});

describe('the pooler really is multiplexing', () => {
  it('two client connections share one server backend', async () => {
    // Without this assertion the whole suite can pass vacuously: with one
    // client, PgBouncer never has to hand the same server connection to a
    // different client, and the test degenerates into checking that Postgres
    // reverts a LOCAL setting at COMMIT — which was never in question.
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      const pidA = await asTenant(a, TENANT_A, async () =>
        (await a.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid,
      );
      const pidB = await asTenant(b, TENANT_B, async () =>
        (await b.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid,
      );
      expect(pidA).toBeDefined();
      expect(pidB).toBe(pidA);
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe('tenant A cannot read tenant B', () => {
  it('sees only its own tenant row', async () => {
    const a = await runtimeClient();
    try {
      const rows = await asTenant(a, TENANT_A, async () =>
        (await a.query<{ id: string }>('SELECT id FROM tenancy.tenants')).rows,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(TENANT_A);
    } finally {
      await a.end();
    }
  });

  it('sees zero rows of the other tenant on a REUSED server connection', async () => {
    // A then B, on two client connections sharing one backend.
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      await asTenant(a, TENANT_A, async () => {
        const r = await a.query('SELECT id FROM tenancy.connector_instances');
        expect(r.rowCount).toBe(1);
      });
      await asTenant(b, TENANT_B, async () => {
        const r = await b.query<{ tenant_id: string }>(
          'SELECT tenant_id FROM tenancy.connector_instances',
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0]?.tenant_id).toBe(TENANT_B);
      });
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('cannot UPDATE or DELETE another tenant, and gets no error saying so', async () => {
    const a = await runtimeClient();
    try {
      await asTenant(a, TENANT_A, async () => {
        const upd = await a.query('UPDATE tenancy.connector_instances SET hostname = $1 WHERE tenant_id = $2', [
          'stolen',
          TENANT_B,
        ]);
        expect(upd.rowCount).toBe(0);
        const del = await a.query('DELETE FROM tenancy.connector_instances WHERE tenant_id = $1', [TENANT_B]);
        expect(del.rowCount).toBe(0);
      });
    } finally {
      await a.end();
    }
  });

  it('cannot INSERT a row into another tenant — the WITH CHECK attack', async () => {
    // Omitting WITH CHECK is a WRITE hole, not a read one: it lets one tenant
    // plant a row in another's books. Poisoning is worse than exfiltration for
    // an ERP, because the victim reconciles against it.
    const a = await runtimeClient();
    try {
      await expect(
        asTenant(a, TENANT_A, async () =>
          a.query(
            `INSERT INTO tenancy.connector_instances (tenant_id, id, hostname)
             VALUES ($1, gen_random_uuid(), 'planted')`,
            [TENANT_B],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await a.end();
    }
  });
});

describe('terminology is one tenant’s words, never another’s', () => {
  // The word a firm chooses becomes every label on its screens and the heading
  // on its documents. A row read across tenants would relabel another firm's
  // product; a row planted across tenants would relabel it for them.
  it('tenant A’s choice is invisible to tenant B, who reads the pair’s first word', async () => {
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      await asTenant(a, TENANT_A, async () => {
        await a.query(
          `INSERT INTO tenancy.terminology (tenant_id, term_key, word) VALUES ($1, 'boq', 'Estimate')`,
          [TENANT_A],
        );
      });
      await asTenant(b, TENANT_B, async () => {
        const r = await b.query('SELECT word FROM tenancy.terminology');
        expect(r.rowCount).toBe(0);
      });
      await asTenant(a, TENANT_A, async () => {
        const r = await a.query<{ word: string }>(`SELECT word FROM tenancy.terminology WHERE term_key = 'boq'`);
        expect(r.rows.map((x) => x.word)).toEqual(['Estimate']);
      });
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('cannot plant a word in another tenant — the WITH CHECK attack', async () => {
    const a = await runtimeClient();
    try {
      await expect(
        asTenant(a, TENANT_A, async () =>
          a.query(`INSERT INTO tenancy.terminology (tenant_id, term_key, word) VALUES ($1, 'vendor', 'Supplier')`, [TENANT_B]),
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await a.end();
    }
  });

  it('one row per pair per tenant, and the same pair in the other tenant is not a conflict', async () => {
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      await asTenant(b, TENANT_B, async () => {
        await b.query(`INSERT INTO tenancy.terminology (tenant_id, term_key, word) VALUES ($1, 'boq', 'BOQ')`, [TENANT_B]);
      });
      await expect(
        asTenant(a, TENANT_A, async () =>
          a.query(`INSERT INTO tenancy.terminology (tenant_id, term_key, word) VALUES ($1, 'boq', 'BOQ')`, [TENANT_A]),
        ),
      ).rejects.toThrow(/terminology_unique/);
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe('staged Tally vouchers are isolated — a book-integrity control', () => {
  it('one tenant cannot see or claim a staged voucher of another', async () => {
    // The connector forwards opaque XML to a customer's Tally. A staged row
    // visible to the wrong tenant is not a privacy incident, it is a write into
    // the wrong set of books.
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      await asTenant(a, TENANT_A, async () => {
        await a.query(
          `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
           VALUES ($1, gen_random_uuid(), 'purchase', '<ENVELOPE/>', 'cog-a-1')`,
          [TENANT_A],
        );
      });

      await asTenant(b, TENANT_B, async () => {
        const seen = await b.query('SELECT id FROM finance.tally_vouchers');
        expect(seen.rowCount).toBe(0);

        // Nor can B lease it out from under A.
        const claimed = await b.query(
          `UPDATE finance.tally_vouchers SET status = 'leased' WHERE remote_id = 'cog-a-1'`,
        );
        expect(claimed.rowCount).toBe(0);
      });
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('remote_id is unique per tenant, not globally', async () => {
    // A global unique constraint would let one tenant discover, through the
    // violation message, that another had staged a document.
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      await asTenant(a, TENANT_A, async () =>
        a.query(
          `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
           VALUES ($1, gen_random_uuid(), 'purchase', '<ENVELOPE/>', 'shared-ref')`,
          [TENANT_A],
        ),
      );
      await asTenant(b, TENANT_B, async () =>
        b.query(
          `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
           VALUES ($1, gen_random_uuid(), 'purchase', '<ENVELOPE/>', 'shared-ref')`,
          [TENANT_B],
        ),
      );
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe('no tenant context', () => {
  it('denies with zero rows on a WARM connection, rather than raising 22P02', async () => {
    // The state production is always in. After any transaction has set the
    // placeholder LOCAL and ended, current_setting returns '' rather than NULL,
    // and ''::uuid raises 22P02 — a 500 that looks like a database fault. The
    // NULLIF in tenancy.current_tenant_id() is what makes this a deny.
    const c = await runtimeClient();
    try {
      await asTenant(c, TENANT_A, async () => {
        await c.query('SELECT 1');
      });

      const setting = await c.query<{ v: string | null }>(
        `SELECT current_setting('app.tenant_id', true) AS v`,
      );
      expect(setting.rows[0]?.v).toBe(''); // warm, not NULL

      const rows = await c.query('SELECT id FROM tenancy.tenants');
      expect(rows.rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });
});

describe('the leak is real when the discipline is violated', () => {
  it('a session-level set_config DOES leak across tenants', async () => {
    // This test asserts the BUG exists, which is what makes the "no session
    // SET" rule load-bearing rather than decorative. If this ever starts
    // failing, the pooling configuration changed and the rest of this suite
    // may have quietly stopped testing anything.
    const a = await runtimeClient();
    const b = await runtimeClient();
    try {
      // false = session-scoped. Survives COMMIT, rides the pooled connection.
      await a.query('SELECT set_config($1, $2, false)', ['app.tenant_id', TENANT_A]);

      const leaked = await b.query<{ v: string | null }>(
        `SELECT current_setting('app.tenant_id', true) AS v`,
      );
      expect(leaked.rows[0]?.v).toBe(TENANT_A);

      const rows = await b.query<{ id: string }>('SELECT id FROM tenancy.tenants');
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]?.id).toBe(TENANT_A); // B reading A. Deliberate.
    } finally {
      await a.query('SELECT set_config($1, $2, false)', ['app.tenant_id', '']).catch(() => undefined);
      await a.end();
      await b.end();
    }
  });
});

describe('drift — the control cannot be removed without failing CI', () => {
  async function admin(): Promise<Client> {
    const c = new Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'cog',
      password: 'cog_local_dev',
      database: 'cog',
    });
    await c.connect();
    return c;
  }

  it('the live database contains exactly the tables the migrations declare', async () => {
    // The independent claim, and the reason the static audit no longer asserts
    // a hand-maintained list. Two SEPARATE sources are compared:
    //
    //   * what the migration SQL says     — parsed from the .sql text
    //   * what the database actually has  — read from pg_class
    //
    // A hand-maintained list compared against a regex over the same files
    // proves only that somebody updated the list. This fails if a migration
    // creates a table it did not declare in the form we scan for, if a table is
    // created outside a migration, or if a migration silently failed to apply.
    const declared = new Set<string>();
    for (const { path } of collectMigrations(SERVICES_DIR)) {
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+\.\w+)/gi)) {
        declared.add((m[1] as string).toLowerCase());
      }
    }

    const c = await admin();
    try {
      const { rows } = await c.query<{ qualified: string }>(
        `SELECT n.nspname || '.' || c.relname AS qualified
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r'
            AND n.nspname NOT LIKE 'pg\_%'
            AND n.nspname NOT IN ('information_schema','public','migrations')
            -- Exactly one exemption, by exact name: a sibling test in this
            -- file creates __drift_probe and drops it in a finally block, so
            -- these two checks stay independent of the order vitest runs them
            -- in. A prefix exclusion would have been wrong: it would blind this
            -- check to every other stray table starting the same way.
            AND c.relname NOT IN ('__drift_probe', 'drift_probe')`,
      );
      const live = new Set(rows.map((r) => r.qualified.toLowerCase()));

      const declaredNotLive = [...declared].filter((t) => !live.has(t)).sort();
      const liveNotDeclared = [...live].filter((t) => !declared.has(t)).sort();

      expect(declaredNotLive, 'declared by a migration but absent from the database').toEqual([]);
      expect(liveNotDeclared, 'present in the database but declared by no migration').toEqual([]);
      expect(declared.size).toBeGreaterThan(15);
    } finally {
      await c.end();
    }
  });

  it('discovers every service schema, rather than a list someone must remember to extend', async () => {
    // This assertion exists because the checks below USED to name
    // ('tenancy','identity','finance') literally, and so had silently stopped
    // covering `workflow` when M4 added it and `procurement` when M5 did. A
    // drift check that does not see a new schema is worse than none: it
    // reports green over exactly the tables nobody has reviewed yet.
    //
    // D8's argument was always that per-table assertions pass happily when
    // someone adds a NEW table with no policy. The same argument applies one
    // level up, to schemas.
    const c = await admin();
    try {
      const { rows } = await c.query<{ nspname: string }>(
        `SELECT nspname FROM pg_namespace
          WHERE nspname NOT LIKE 'pg\_%'
            AND nspname NOT IN ('information_schema','public','migrations')
          ORDER BY nspname`,
      );
      const found = rows.map((r) => r.nspname);
      for (const expected of ['finance', 'identity', 'procurement', 'tenancy', 'workflow']) {
        expect(found, `schema ${expected} is not covered by the drift checks`).toContain(expected);
      }
    } finally {
      await c.end();
    }
  });

  it('FAILS on a table added without a policy — in a schema added later', async () => {
    // The check must be seen to fail, in the case it exists for: somebody adds
    // a table to a service schema and forgets the policy pair. Planted in
    // `procurement`, deliberately — a schema that was invisible to this suite
    // until the query above stopped naming schemas literally.
    const c = await admin();
    try {
      await c.query('CREATE TABLE procurement.__drift_probe (tenant_id uuid, id uuid)');
      const { rows } = await c.query<{ relname: string }>(
        `SELECT c.relname
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname NOT LIKE 'pg\_%'
            AND n.nspname NOT IN ('information_schema','public','migrations')
            AND c.relkind = 'r'
            AND NOT c.relrowsecurity`,
      );
      expect(rows.map((r) => r.relname)).toContain('__drift_probe');
    } finally {
      await c.query('DROP TABLE IF EXISTS procurement.__drift_probe');
      await c.end();
    }
  });

  it('every tenant-scoped table has RLS enabled AND forced', async () => {
    const c = await admin();
    try {
      const { rows } = await c.query<{ relname: string; rls: boolean; forced: boolean }>(
        `SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN (SELECT nspname FROM pg_namespace
             WHERE nspname NOT LIKE 'pg\_%'
               AND nspname NOT IN ('information_schema','public','migrations')) AND c.relkind = 'r'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        if (BOOTSTRAP_TABLES.has(r.relname)) {
          // An exception to the tenant model, and the test below is what makes
          // it one rather than a hole: no tenant policy, and no grant to
          // `app_runtime`. Row-level security on a table that belongs to no
          // tenant would have no predicate to enforce; unreadability is the
          // control instead.
          continue;
        }
        expect(r.rls, `${r.relname} has RLS disabled`).toBe(true);
        expect(r.forced, `${r.relname} is not FORCEd — its owner bypasses`).toBe(true);
      }
    } finally {
      await c.end();
    }
  });

  it('every policy is the canonical predicate — no magic tenant, no USING (true)', async () => {
    // The `'*'` magic-tenant trap is one string away: adding
    // `OR current_setting('app.tenant_id', true) = '*'` to every policy turns
    // isolation off platform-wide. Asserting the exact deparsed text is what
    // makes that unmergeable.
    const c = await admin();
    try {
      const { rows } = await c.query<{ tablename: string; policyname: string; permissive: string; qual: string; with_check: string }>(
        `SELECT tablename, policyname, permissive, qual, with_check
           FROM pg_policies WHERE schemaname IN (SELECT nspname FROM pg_namespace
             WHERE nspname NOT LIKE 'pg\_%'
               AND nspname NOT IN ('information_schema','public','migrations'))`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const p of rows) {
        expect(p.qual, `${p.tablename}.${p.policyname}`).toMatch(/current_tenant_id\(\)/);
        expect(p.qual).not.toMatch(/\btrue\b/);
        expect(p.qual).not.toContain('*');
        expect(p.with_check, `${p.tablename}.${p.policyname} has no WITH CHECK`).toBeTruthy();
      }
      // Both halves of the pair exist on every policied table.
      const byTable = new Map<string, Set<string>>();
      for (const p of rows) {
        byTable.set(p.tablename, (byTable.get(p.tablename) ?? new Set()).add(p.permissive));
      }
      for (const [table, kinds] of byTable) {
        expect([...kinds].sort(), `${table} is missing a policy kind`).toEqual([
          'PERMISSIVE',
          'RESTRICTIVE',
        ]);
      }
    } finally {
      await c.end();
    }
  });

  it('no column anywhere is a float', async () => {
    const c = await admin();
    try {
      const { rows } = await c.query(
        `SELECT table_name, column_name, data_type
           FROM information_schema.columns
          WHERE table_schema IN (SELECT nspname FROM pg_namespace
             WHERE nspname NOT LIKE 'pg\_%'
               AND nspname NOT IN ('information_schema','public','migrations'))
            AND data_type IN ('real','double precision')`,
      );
      expect(rows).toEqual([]);
    } finally {
      await c.end();
    }
  });

  it('no role in the cluster can bypass RLS', async () => {
    const c = await admin();
    try {
      const { rows } = await c.query<{ rolname: string }>(
        `SELECT rolname FROM pg_roles WHERE rolbypassrls AND rolname NOT LIKE 'pg\\_%'`,
      );
      // The bootstrap superuser is the container's own and is not an
      // application role; every role the app uses must be absent here.
      for (const r of rows) {
        expect(['app_runtime', 'app_migrator', 'app_auth']).not.toContain(r.rolname);
      }
    } finally {
      await c.end();
    }
  });

  it('every bootstrap exception is genuinely an exception', async () => {
    // An allowlist that is only a list of names is a hole. These two assertions
    // are what make it a boundary: an exception may not carry a tenant policy
    // (that would mean it should have been FORCEd), and it must be unreadable
    // by the role that serves untrusted requests.
    const c = await admin();
    try {
      for (const [table, schema] of BOOTSTRAP_TABLES) {
        const policies = await c.query(
          `SELECT 1 FROM pg_policies WHERE schemaname IN (SELECT nspname FROM pg_namespace
             WHERE nspname NOT LIKE 'pg\_%'
               AND nspname NOT IN ('information_schema','public','migrations')) AND tablename = $1`,
          [table],
        );
        expect(policies.rowCount, `${table} has a tenant policy but is not FORCEd`).toBe(0);

        const { rows } = await c.query<{ readable: boolean }>(
          `SELECT has_table_privilege('app_runtime', $1, 'SELECT') AS readable`,
          [`${schema}.${table}`],
        );
        expect(rows[0]?.readable, `app_runtime can read ${table}`).toBe(false);
      }
    } finally {
      await c.end();
    }
  });

  it('the INVITE bootstrap function returns ids only, and cannot enumerate', async () => {
    // `tenant_for_invite` is the second SECURITY DEFINER read across tenants,
    // so it is held to what the first one is: two ids for an exact match, and
    // nothing at all otherwise. A version that returned the email or the kind
    // would turn a stolen hash into a fact about a person, and one that matched
    // loosely would turn the table into a list of tenants with open invitations.
    const c = await runtimeClient();
    try {
      const miss = await c.query(
        `SELECT * FROM identity.tenant_for_invite(sha256('no-such-token'::bytea))`,
      );
      expect(miss.rowCount).toBe(0);
      expect(miss.fields.map((f) => f.name).sort()).toEqual(['invite_id', 'tenant_id']);
    } finally {
      await c.end();
    }
  });

  it('the bootstrap function returns ids only, and cannot enumerate', async () => {
    // resolve_principal is SECURITY DEFINER, so it is the one path that reads
    // across tenants. It must return two ids for an exact match and nothing at
    // all otherwise — never a list, never an email.
    const c = await runtimeClient();
    try {
      const miss = await c.query(`SELECT * FROM identity.resolve_principal('no-such-external-id')`);
      expect(miss.rowCount).toBe(0);
      expect(miss.fields.map((f) => f.name).sort()).toEqual(['principal_id', 'tenant_id']);
    } finally {
      await c.end();
    }
  });

  it('DETECTS an unprotected table — the drift check is not decorative', async () => {
    // M1's done-when requires the suite to fail if a policy is dropped. Proving
    // that needs a table that is actually unprotected, so one is created,
    // detected, and removed inside this test.
    const c = await admin();
    try {
      await c.query('CREATE TABLE tenancy.drift_probe (tenant_id uuid NOT NULL, id uuid NOT NULL)');
      await c.query('ALTER TABLE tenancy.drift_probe ENABLE ROW LEVEL SECURITY');
      // Deliberately: no FORCE, and no policy at all.

      const unforced = await c.query(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'tenancy' AND c.relkind = 'r' AND NOT c.relforcerowsecurity`,
      );
      expect(unforced.rows.map((r) => (r as { relname: string }).relname)).toContain('drift_probe');

      const unpolicied = await c.query(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'tenancy' AND c.relkind = 'r'
            AND NOT EXISTS (SELECT 1 FROM pg_policies p
                             WHERE p.schemaname = 'tenancy' AND p.tablename = c.relname)`,
      );
      expect(unpolicied.rows.map((r) => (r as { relname: string }).relname)).toContain('drift_probe');
    } finally {
      await c.query('DROP TABLE IF EXISTS tenancy.drift_probe').catch(() => undefined);
      await c.end();
    }
  });

  it('DETECTS a dropped policy', async () => {
    const c = await admin();
    try {
      await c.query('DROP POLICY tenant_isolation ON tenancy.connector_instances');
      const { rows } = await c.query<{ permissive: string }>(
        `SELECT permissive FROM pg_policies
          WHERE schemaname = 'tenancy' AND tablename = 'connector_instances'`,
      );
      // The pair assertion above requires both kinds; with one dropped it cannot hold.
      expect([...new Set(rows.map((r) => r.permissive))].sort()).not.toEqual([
        'PERMISSIVE',
        'RESTRICTIVE',
      ]);
    } finally {
      // Restore, so the rest of the suite still describes the real schema.
      await c.query(
        `CREATE POLICY tenant_isolation ON tenancy.connector_instances AS RESTRICTIVE FOR ALL
           USING (tenant_id = tenancy.current_tenant_id())
           WITH CHECK (tenant_id = tenancy.current_tenant_id())`,
      ).catch(() => undefined);
      await c.end();
    }
  });

  it('app_runtime holds no TRUNCATE and nothing on the connector key table', async () => {
    const c = await admin();
    try {
      const { rows } = await c.query<{ ok: boolean }>(
        `SELECT
           has_table_privilege('app_runtime','tenancy.connector_instances','TRUNCATE') AS trunc,
           has_table_privilege('app_runtime','tenancy.connector_keys','SELECT')        AS keys`,
      );
      const r = rows[0] as unknown as { trunc: boolean; keys: boolean };
      expect(r.trunc, 'TRUNCATE is not subject to RLS and must never be granted').toBe(false);
      expect(r.keys, 'app_runtime must not be able to read connector keys').toBe(false);
    } finally {
      await c.end();
    }
  });
});
