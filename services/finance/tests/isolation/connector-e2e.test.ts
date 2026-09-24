import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Paise, TenantId } from '@cog/contracts';
import { bp, paise, toRupeeString } from '@cog/money';
import {
  approve,
  buildVoucherXml,
  computeDeduction,
  connectorRoutes,
  effectiveAmount,
  netPayable,
  remit,
  splitGst,
  submit,
  tallyAccepted,
  type PaymentRequest,
} from '../../src/index.js';
import { roundToPaise } from '@cog/money';
import {
  createVoucherQueue,
  stageVoucher,
  type TenantRunner,
  type TenantTxLike,
} from '../../src/infrastructure/voucher-queue.js';

/**
 * M3's done-when, end to end, against a real database:
 *
 *   PO -> approval -> payment request -> TDS -> staged Tally voucher -> connector
 *
 * **Every rate here is synthetic.** GST 18% is used because it is the shape of
 * a split, not because it has been verified; the TDS rate is 10% flat, which is
 * not a statutory value and is not meant to resemble one. CA-01 … CA-09 are
 * open, and nothing this test produces may be filed. What it proves is that the
 * pipeline carries a figure from a purchase order to a Tally voucher without
 * losing or inventing money along the way.
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
const INSTANCE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KEY_PREFIX = 'abcd1234';
const KEY = `cog_ck_${KEY_PREFIX}_${'z'.repeat(43)}`;

let postgres: StartedTestContainer;
let admin: Client;
let runtime: Client;
let run: TenantRunner;

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

  admin = new Client({
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

  await admin.query('BEGIN');
  await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT]);
  await admin.query(
    `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
     VALUES ($1, 'aarambh', 'Aarambh Interiors', 'https://aarambh.example')`,
    [TENANT],
  );
  await admin.query('COMMIT');

  // A connector key, hashed exactly as services/tenancy mints them.
  await admin.query(
    `INSERT INTO tenancy.connector_keys (id, tenant_id, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), TENANT, KEY_PREFIX, createHash('sha256').update(KEY, 'utf8').digest()],
  );

  runtime = new Client({
    host: 'localhost',
    port: postgres.getMappedPort(5432),
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
  });
  await runtime.connect();
  run = runnerOn(runtime);
}, 300_000);

afterAll(async () => {
  await runtime?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

describe('the key resolves to a tenant without any tenant context', () => {
  it('authenticates through the SECURITY DEFINER function', async () => {
    // app_runtime cannot read tenancy.connector_keys at all — this is the only
    // path in, and it verifies the hash inside the function so the stored hash
    // never enters the runtime session.
    const { rows } = await runtime.query<{ tenant_id: string }>(
      'SELECT * FROM tenancy.resolve_connector_key($1, $2)',
      [KEY_PREFIX, createHash('sha256').update(KEY, 'utf8').digest()],
    );
    expect(rows[0]?.tenant_id).toBe(TENANT);
  });

  it('refuses a wrong secret with the right prefix', async () => {
    const { rows } = await runtime.query('SELECT * FROM tenancy.resolve_connector_key($1, $2)', [
      KEY_PREFIX,
      createHash('sha256').update('wrong', 'utf8').digest(),
    ]);
    expect(rows).toHaveLength(0);
  });

  it('refuses a revoked key, so rotation actually revokes', async () => {
    await admin.query(
      `UPDATE tenancy.connector_keys SET revoked_at = now() WHERE key_prefix = $1`,
      [KEY_PREFIX],
    );
    const { rows } = await runtime.query('SELECT * FROM tenancy.resolve_connector_key($1, $2)', [
      KEY_PREFIX,
      createHash('sha256').update(KEY, 'utf8').digest(),
    ]);
    expect(rows).toHaveLength(0);
    await admin.query(`UPDATE tenancy.connector_keys SET revoked_at = NULL`);
  });

  it('cannot read the key table directly', async () => {
    await expect(runtime.query('SELECT * FROM tenancy.connector_keys')).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('PO -> approval -> payment request -> TDS -> staged voucher', () => {
  it('carries the figure end to end without losing money', async () => {
    // --- the purchase order -------------------------------------------
    // 10 units at ₹500.00, GST 18% (synthetic).
    const taxable = paise(5_00_000n); // ₹5000.00
    const gstBreakdown = splitGst(taxable, bp(1800), 'intra_state');
    expect(toRupeeString(gstBreakdown.cgst)).toBe('450.00');
    expect(gstBreakdown.cgst).toBe(gstBreakdown.sgst);
    // `bigint + bigint` is an unbranded `bigint`, which is the brand doing its
    // job: a sum of money is still money and has to be said so deliberately.
    const gross = (taxable + gstBreakdown.total) as Paise; // ₹5900.00

    // --- the payment request ------------------------------------------
    let pr: PaymentRequest = {
      id: randomUUID(),
      purchaseOrderId: randomUUID(),
      vendorId: 'v_1',
      state: 'draft',
      amountRequested: gross,
      amountApproved: null,
      tdsAmount: null,
      version: 1,
    };
    pr = submit(pr);
    pr = approve(pr, { approverId: 'u_finance' });
    expect(toRupeeString(effectiveAmount(pr))).toBe('5900.00');

    // --- TDS ----------------------------------------------------------
    // 10% flat, SYNTHETIC. Base excludes GST per CBDT Circular 23/2017,
    // which is HUMAN(CA-08) and unsettled for works contracts.
    const deduction = computeDeduction({
      base: { taxable, gst: gstBreakdown.total },
      rate: bp(1000),
      includeGst: false,
      boundary: roundToPaise,
    });
    expect(toRupeeString(deduction.tds)).toBe('500.00'); // 10% of ₹5000, not of ₹5900

    pr = remit(pr, { tdsAmount: deduction.tds });
    expect(toRupeeString(netPayable(pr))).toBe('5400.00'); // 5900 - 500

    // Money is conserved: what the vendor gets plus what is withheld is
    // exactly what was approved. No rounding leaked out of the pipeline.
    expect(netPayable(pr) + (pr.tdsAmount as bigint)).toBe(effectiveAmount(pr));

    // --- the Tally voucher --------------------------------------------
    const xml = buildVoucherXml({
      remoteId: `cog-pr-${pr.id}`,
      voucherType: 'Payment',
      voucherNumber: 'PAY/2026/0001',
      date: '2026-09-04',
      company: 'Aarambh Interiors',
      partyLedger: 'M/s A&B Interiors',
      narration: 'Payment against PO',
      entries: [
        { ledgerName: 'M/s A&B Interiors', amountRupees: '5900.00' },
        { ledgerName: 'Bank', amountRupees: '-5400.00' },
        { ledgerName: 'TDS Payable', amountRupees: '-500.00' },
      ],
    });
    // The vendor name is escaped, which the legacy generator does not do.
    expect(xml).toContain('M/s A&amp;B Interiors');
    expect(xml).not.toMatch(/A&B/);

    // --- staged, then delivered ---------------------------------------
    const voucherId = randomUUID();
    await stageVoucher(run, TENANT, {
      id: voucherId,
      kind: 'payment',
      xml,
      remoteId: `cog-pr-${pr.id}`,
    });

    const queue = createVoucherQueue(run);
    const auth = {
      authenticate: async (presented: string) => {
        const m = /^cog_ck_([A-Za-z0-9]{8})_/.exec(presented);
        if (m === null) return null;
        const rows = await run(TENANT, async (tx) =>
          tx.query<{ tenant_id: string; key_id: string }>(
            'SELECT * FROM tenancy.resolve_connector_key($1, $2)',
            [m[1], createHash('sha256').update(presented, 'utf8').digest()],
          ),
        );
        const row = rows[0];
        return row === undefined
          ? null
          : { tenantId: row.tenant_id as TenantId, keyId: row.key_id };
      },
    };

    const app = connectorRoutes({
      auth,
      queue,
      minConnectorVersion: '1.0.0',
      leaseSeconds: 300,
    });

    const headers = {
      authorization: `Bearer ${KEY}`,
      'X-Connector-Version': '1.0.0',
      'X-Connector-Instance': INSTANCE,
    };

    const pulled = (await (await app.request('/vouchers', { headers })).json()) as {
      vouchers: { id: string; kind: string; xml: string }[];
      leaseSeconds: number;
    };
    expect(pulled.vouchers).toHaveLength(1);
    // Named once. Under `noUncheckedIndexedAccess` every `[0]` is possibly
    // undefined, and repeating the index three times repeats the check.
    const offered = pulled.vouchers[0];
    expect(offered).toBeDefined();
    expect(offered?.id).toBe(voucherId);
    expect(offered?.kind).toBe('payment');
    // The connector receives the XML exactly as we escaped it.
    expect(offered?.xml).toContain('M/s A&amp;B Interiors');
    expect(pulled.leaseSeconds).toBe(300);

    // The connector posts to Tally and reports what Tally actually said —
    // parsed, not assumed from a 200.
    expect(tallyAccepted('<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS></RESPONSE>')).toBe(true);

    const reported = await app.request(`/vouchers/${voucherId}/result`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'posted', tallyVoucherId: '4242' }),
    });
    expect(reported.status).toBe(200);

    // And it is not offered again.
    const after = (await (await app.request('/vouchers', { headers })).json()) as {
      vouchers: unknown[];
    };
    expect(after.vouchers).toHaveLength(0);
  });

  it('an unauthenticated connector gets nothing, not an empty list', async () => {
    const queue = createVoucherQueue(run);
    const app = connectorRoutes({
      auth: { authenticate: async () => null },
      queue,
      minConnectorVersion: '1.0.0',
      leaseSeconds: 300,
    });
    const res = await app.request('/vouchers', {
      headers: { authorization: 'Bearer cog_ck_bogus000_x', 'X-Connector-Version': '1.0.0' },
    });
    expect(res.status).toBe(401);
  });
});
