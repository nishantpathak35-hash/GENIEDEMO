import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client , type Notification } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT_CHANNEL, parseNotification } from '../../src/domain/events.js';

/**
 * The event stream, against a real Postgres.
 *
 * The property that matters: **`NOTIFY` is not subject to row-level security.**
 * Every listener on a channel receives every payload regardless of tenant, so
 * the payload must carry nothing but ids — and a subscriber must re-read the
 * row through a tenant context, which is the only policy-checked path.
 *
 * This suite proves both halves: that the notification leaks nothing, and that
 * the follow-up read is refused for the wrong tenant.
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

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let postgres: StartedTestContainer;
let writer: Client;
let listener: Client;

async function asTenant<T>(c: Client, tenant: string, fn: () => Promise<T>): Promise<T> {
  await c.query('BEGIN');
  try {
    await c.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenant]);
    const out = await fn();
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
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
  for (const t of [A, B]) {
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

  const conn = {
    host: 'localhost',
    port,
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
  };
  writer = new Client(conn);
  listener = new Client(conn);
  await writer.connect();
  await listener.connect();
}, 300_000);

afterAll(async () => {
  await writer?.end().catch(() => undefined);
  await listener?.end().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

/** Wait for the next notification, or time out. */
function nextNotification(timeoutMs = 5000): Promise<{ channel: string; payload: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.removeListener('notification', onNote);
      reject(new Error('no notification arrived'));
    }, timeoutMs);
    const onNote = (msg: Notification): void => {
      clearTimeout(timer);
      listener.removeListener('notification', onNote);
      resolve({ channel: msg.channel, payload: msg.payload ?? '' });
    };
    listener.on('notification', onNote);
  });
}

describe('the write wakes the listener', () => {
  it('publishes on commit rather than being polled', async () => {
    // The legacy SSE endpoint polls broadcast_events every two seconds PER
    // CONNECTED CLIENT. Twenty users is 600 queries a minute against a table
    // that is almost always unchanged, and a change is still up to 2s late.
    await listener.query(`LISTEN ${EVENT_CHANNEL}`);
    const arriving = nextNotification();

    await asTenant(writer, A, async () => {
      await writer.query(
        `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action)
         VALUES (tenancy.current_tenant_id(), 'po', 'po_1', 'approved')`,
      );
    });

    const note = await arriving;
    expect(note.channel).toBe(EVENT_CHANNEL);
    expect(parseNotification(note.payload)).toMatchObject({ tenantId: A });
  });
});

describe('NOTIFY is not subject to RLS, so it must carry nothing', () => {
  it('the payload contains only tenantId and id', async () => {
    // This is the whole reason the payload is restricted: a listener scoped to
    // tenant B receives tenant A's notification. If entity data travelled in
    // it, that would be a cross-tenant leak on a side channel, invisible to
    // every query-level control in the system.
    await listener.query(`LISTEN ${EVENT_CHANNEL}`);
    const arriving = nextNotification();

    await asTenant(writer, A, async () => {
      await writer.query(
        `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action, payload)
         VALUES (tenancy.current_tenant_id(), 'vendor', 'v_1', 'updated',
                 $1::jsonb)`,
        [JSON.stringify({ bankAccount: '50100123456789', secret: 'do-not-leak' })],
      );
    });

    const note = await arriving;
    expect(note.payload).not.toContain('50100123456789');
    expect(note.payload).not.toContain('do-not-leak');
    expect(note.payload).not.toContain('vendor');
    expect(Object.keys(JSON.parse(note.payload)).sort()).toEqual(['id', 'tenantId']);
  });

  it('the follow-up read IS policy-checked, which is what protects the data', async () => {
    // The notification is only a hint to go and read. The read is where
    // isolation applies.
    const id = await asTenant(writer, A, async () =>
      (
        await writer.query<{ id: string }>(
          `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action)
           VALUES (tenancy.current_tenant_id(), 'po', 'po_secret', 'approved')
           RETURNING id`,
        )
      ).rows[0]?.id,
    );

    const asB = await asTenant(writer, B, async () =>
      (await writer.query('SELECT entity_id FROM workflow.events WHERE id = $1', [id])).rows,
    );
    expect(asB).toHaveLength(0);

    const asA = await asTenant(writer, A, async () =>
      (
        await writer.query<{ entity_id: string }>(
          'SELECT entity_id FROM workflow.events WHERE id = $1',
          [id],
        )
      ).rows,
    );
    expect(asA[0]?.entity_id).toBe('po_secret');
  });
});

describe('the events table is tenant-scoped', () => {
  it('one tenant cannot write an event into another', async () => {
    await expect(
      asTenant(writer, A, async () =>
        writer.query(
          `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action)
           VALUES ($1, 'po', 'planted', 'approved')`,
          [B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('one tenant cannot read another events', async () => {
    await asTenant(writer, A, async () => {
      await writer.query(
        `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action)
         VALUES (tenancy.current_tenant_id(), 'po', 'a_only', 'created')`,
      );
    });
    const seen = await asTenant(writer, B, async () =>
      (await writer.query(`SELECT id FROM workflow.events WHERE entity_id = 'a_only'`)).rows,
    );
    expect(seen).toHaveLength(0);
  });
});
