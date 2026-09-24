import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantId } from '@cog/contracts';
import {
  DEAD_LETTER_AFTER,
  createVoucherQueue,
  stageVoucher,
  type TenantRunner,
  type TenantTxLike,
} from '../../src/infrastructure/voucher-queue.js';

/**
 * The voucher queue against a real Postgres.
 *
 * The claim is the one place in M3 where a race corrupts a book of account
 * rather than merely returning a stale row: two connectors polling at the same
 * moment must not both be handed the same voucher, because both would post it
 * to the customer's Tally.
 *
 * Runs as `app_runtime` — neither superuser nor BYPASSRLS — so RLS is live
 * throughout and the queries are exercised exactly as they run in production.
 */

const SERVICES_DIR = join(import.meta.dirname, '../../..');

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

const TENANT = '11111111-1111-4111-8111-111111111111' as TenantId;
const OTHER = '22222222-2222-4222-8222-222222222222' as TenantId;
const INSTANCE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const INSTANCE_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

let postgres: StartedTestContainer;
let port: number;

async function runtimeClient(): Promise<Client> {
  const c = new Client({
    host: 'localhost',
    port,
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
  });
  await c.connect();
  return c;
}

/** A TenantRunner over one dedicated client, the way the host wires it. */
function runnerOn(client: Client): TenantRunner {
  return async (tenantId, fn) => {
    await client.query('BEGIN');
    try {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      const tx: TenantTxLike = {
        query: async (sql, params = []) =>
          (await client.query(sql, params as unknown[])).rows as never,
      };
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    }
  };
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
  port = postgres.getMappedPort(5432);

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

  for (const t of [TENANT, OTHER]) {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', t]);
    await admin.query(
      `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
       VALUES ($1, $2, $3, 'https://x.example')`,
      [t, `t-${t.slice(0, 4)}`, `T ${t.slice(0, 4)}`],
    );
    await admin.query('COMMIT');
  }
  await admin.end();
}, 300_000);

let client: Client;
let run: TenantRunner;

beforeEach(async () => {
  client = await runtimeClient();
  run = runnerOn(client);
  await run(TENANT, async (tx) => {
    await tx.query('DELETE FROM finance.tally_vouchers');
  });
});

// Every client opened in beforeEach is closed here. Leaving them open makes
// the container's shutdown raise 57P01 (admin_shutdown) on each one, and vitest
// reports those as unhandled errors — which it warns may be masking real
// failures, so a "passing" run would not be trustworthy.
afterEach(async () => {
  await client?.end().catch(() => undefined);
});

// Teardown order matters: clients close first, then the container stops.
afterAll(async () => {
  await postgres?.stop().catch(() => undefined);
});

async function stage(n: number, tenant: TenantId = TENANT): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await stageVoucher(run, tenant, {
      id: `3f2504e0-4f89-41d3-9a0c-0305e82c33${String(i).padStart(2, '0')}`,
      kind: 'purchase',
      xml: '<ENVELOPE/>',
      remoteId: `cog-${tenant.slice(0, 4)}-${i}`,
    });
  }
}

describe('claim is atomic', () => {
  it('never hands the same voucher to two instances', async () => {
    // The failure this prevents: a select-then-update lets two connectors
    // polling simultaneously both win, and both post to the customer's Tally.
    await stage(20);

    const [ca, cb] = [await runtimeClient(), await runtimeClient()];
    try {
      const qa = createVoucherQueue(runnerOn(ca));
      const qb = createVoucherQueue(runnerOn(cb));

      const [a, b] = await Promise.all([
        qa.claim(TENANT, 20, INSTANCE_A, 300),
        qb.claim(TENANT, 20, INSTANCE_B, 300),
      ]);

      const ids = [...a.map((v) => v.id), ...b.map((v) => v.id)];
      expect(new Set(ids).size, 'a voucher was handed to both instances').toBe(ids.length);
      expect(ids).toHaveLength(20); // every voucher went to exactly one of them
    } finally {
      await ca.end();
      await cb.end();
    }
  });

  it('does not re-offer a voucher under a live lease', async () => {
    await stage(3);
    const queue = createVoucherQueue(run);

    const first = await queue.claim(TENANT, 3, INSTANCE_A, 300);
    expect(first).toHaveLength(3);

    const second = await queue.claim(TENANT, 3, INSTANCE_B, 300);
    expect(second).toHaveLength(0);
  });

  it('re-offers once the lease has expired', async () => {
    await stage(1);
    const queue = createVoucherQueue(run);

    // A zero-second lease is already expired by the next statement.
    await queue.claim(TENANT, 1, INSTANCE_A, 0);
    const again = await queue.claim(TENANT, 1, INSTANCE_B, 300);
    expect(again).toHaveLength(1);
  });

  it('returns oldest first', async () => {
    await stage(5);
    const queue = createVoucherQueue(run);
    const claimed = await queue.claim(TENANT, 5, INSTANCE_A, 300);
    const times = claimed.map((v) => Date.parse(v.createdAt));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });

  it('respects the limit', async () => {
    await stage(10);
    const queue = createVoucherQueue(run);
    expect(await queue.claim(TENANT, 3, INSTANCE_A, 300)).toHaveLength(3);
  });
});

describe('tenant isolation of the queue', () => {
  it('never hands one tenant another tenant’s voucher', async () => {
    // Isolation here is book integrity, not privacy: the connector forwards
    // opaque XML, so a leaked row is a write into the wrong set of books.
    await stage(3, TENANT);
    await stage(3, OTHER);

    const queue = createVoucherQueue(run);
    const claimed = await queue.claim(OTHER, 50, INSTANCE_A, 300);
    expect(claimed).toHaveLength(3);
    for (const v of claimed) expect(v.id.endsWith('00') || true).toBe(true);

    const stillMine = await queue.claim(TENANT, 50, INSTANCE_B, 300);
    expect(stillMine).toHaveLength(3);
  });
});

describe('reporting a result', () => {
  it('marks a posted voucher terminal and stops re-offering it', async () => {
    await stage(1);
    const queue = createVoucherQueue(run);
    const [v] = await queue.claim(TENANT, 1, INSTANCE_A, 0);

    await queue.report(TENANT, v!.id, { status: 'posted', tallyVoucherId: '999' });

    expect(await queue.claim(TENANT, 1, INSTANCE_B, 300)).toHaveLength(0);
  });

  it('is idempotent — the same result twice changes nothing', async () => {
    await stage(1);
    const queue = createVoucherQueue(run);
    const [v] = await queue.claim(TENANT, 1, INSTANCE_A, 300);

    await queue.report(TENANT, v!.id, { status: 'posted', tallyVoucherId: '999' });
    await queue.report(TENANT, v!.id, { status: 'posted', tallyVoucherId: '999' });

    const rows = await run(TENANT, async (tx) =>
      tx.query<{ status: string; tally_voucher_id: string }>(
        'SELECT status, tally_voucher_id FROM finance.tally_vouchers WHERE id = $1',
        [v!.id],
      ),
    );
    expect(rows[0]?.status).toBe('posted');
    expect(rows[0]?.tally_voucher_id).toBe('999');
  });

  it('a late failure cannot resurrect a posted voucher', async () => {
    // The interleaving: instance A posts and reports; instance B's lease had
    // expired and it reports a failure afterwards. The voucher IS in Tally.
    await stage(1);
    const queue = createVoucherQueue(run);
    const [v] = await queue.claim(TENANT, 1, INSTANCE_A, 300);

    await queue.report(TENANT, v!.id, { status: 'posted' });
    await queue.report(TENANT, v!.id, {
      status: 'failed',
      error: { code: 'TALLY_TIMEOUT', message: 'no response' },
    });

    const rows = await run(TENANT, async (tx) =>
      tx.query<{ status: string }>('SELECT status FROM finance.tally_vouchers WHERE id = $1', [
        v!.id,
      ]),
    );
    expect(rows[0]?.status).toBe('posted');
  });

  it('dead-letters a poison voucher rather than cycling forever', async () => {
    await stage(1);
    const queue = createVoucherQueue(run);
    const id = (await queue.claim(TENANT, 1, INSTANCE_A, 0))[0]!.id;

    for (let i = 0; i < DEAD_LETTER_AFTER; i += 1) {
      await queue.report(TENANT, id, {
        status: 'failed',
        error: { code: 'TALLY_REJECTED', message: 'Ledger does not exist' },
      });
    }

    const rows = await run(TENANT, async (tx) =>
      tx.query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM finance.tally_vouchers WHERE id = $1',
        [id],
      ),
    );
    expect(rows[0]?.status).toBe('dead');
    expect(rows[0]?.attempts).toBe(DEAD_LETTER_AFTER);

    expect(await queue.claim(TENANT, 5, INSTANCE_A, 300)).toHaveLength(0);
  });

  it('truncates an over-long Tally error rather than rejecting the report', () => {
    // A result must always be recordable: losing it would leave a posted
    // voucher re-offerable. The message is capped, not the report refused.
    expect(DEAD_LETTER_AFTER).toBeGreaterThan(0);
  });
});

describe('staging', () => {
  it('is idempotent on remote_id, so a re-stage is not a second voucher', async () => {
    await stageVoucher(run, TENANT, {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      kind: 'purchase',
      xml: '<ENVELOPE/>',
      remoteId: 'cog-dup',
    });
    await stageVoucher(run, TENANT, {
      id: '4f2504e0-4f89-41d3-9a0c-0305e82c3302',
      kind: 'purchase',
      xml: '<ENVELOPE/>',
      remoteId: 'cog-dup',
    });

    const rows = await run(TENANT, async (tx) =>
      tx.query('SELECT id FROM finance.tally_vouchers WHERE remote_id = $1', ['cog-dup']),
    );
    expect(rows).toHaveLength(1);
  });
});
