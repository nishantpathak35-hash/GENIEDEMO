import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll } from 'vitest';

/**
 * The fixture the three person-state suites share: a real Postgres with every
 * migration applied, two tenants, three people, and the runtime role's client
 * inside one transaction at a time. A person's working state — preferences,
 * the trail of records opened, saved views — is tenant-scoped like every other
 * table AND a person's own; the second is what those suites add to the
 * introspection walk in the host.
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

export const TENANT_A = '11111111-1111-4111-8111-111111111111';
export const TENANT_B = '22222222-2222-4222-8222-222222222222';
export const A_ONE = '3a000000-0000-4000-8000-000000000001';
export const A_TWO = '3a000000-0000-4000-8000-000000000002';
export const B_ONE = '3b000000-0000-4000-8000-000000000001';
export const PROJECT_1 = '5a000000-0000-4000-8000-000000000001';
export const PROJECT_2 = '5a000000-0000-4000-8000-000000000002';

let postgres: StartedTestContainer;
let runtime: Client;

/** The shape the application functions take: one client inside one transaction. */
export const tx = {
  async query<R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<R[]> {
    return (await runtime.query<R>(sql, params === undefined ? undefined : [...params])).rows;
  },
};

export async function asTenant<T>(tenant: string, fn: () => Promise<T>): Promise<T> {
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

/** Call once at the top of a suite: starts the database before its tests and stops it after. */
export function withPersonFixture(): void {
  beforeAll(async () => {
  postgres = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_USER: 'cog', POSTGRES_PASSWORD: 'cog_local_dev', POSTGRES_DB: 'cog' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const admin = new Client({ host: 'localhost', port: postgres.getMappedPort(5432), user: 'cog', password: 'cog_local_dev', database: 'cog' });
  await admin.connect();
  for (const { path } of collectMigrations(SERVICES_DIR)) await admin.query(readFileSync(path, 'utf8'));
  await admin.query(`ALTER ROLE app_runtime LOGIN PASSWORD 'runtime_pw'`);
  for (const [t, people] of [
    [TENANT_A, [A_ONE, A_TWO]],
    [TENANT_B, [B_ONE]],
  ] as const) {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', t]);
    await admin.query(
      `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin) VALUES ($1, $2, 'T', 'https://x.example')`,
      [t, `t-${t.slice(0, 4)}`],
    );
    for (const p of people) {
      await admin.query(
        `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email) VALUES ($1, $2::uuid, 'staff', $3, $4)`,
        [t, p, p, `${p}@example.test`],
      );
    }
    await admin.query('COMMIT');
  }
  await admin.end();

  runtime = new Client({ host: 'localhost', port: postgres.getMappedPort(5432), user: 'app_runtime', password: 'runtime_pw', database: 'cog' });
  await runtime.connect();
  }, 300_000);

  afterAll(async () => {
    await runtime?.end().catch(() => undefined);
    await postgres?.stop().catch(() => undefined);
  });
}

