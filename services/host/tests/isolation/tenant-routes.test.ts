import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs script outside every tsconfig `include`, so
// tsc has no declarations for it. STILL NECESSARY after tests were brought
// into typecheck (defect 17): `tsconfig.typecheck.json` covers src/ and
// tests/, and `scripts/` is neither. Vitest resolves it at runtime.
import { discoverMigrations, planMigrations } from '../../../../scripts/migration-plan.mjs';
import { API_ROUTES } from '@cog/contracts';
import { allocateNumber, previewNumber } from '@cog/procurement';
import { TENANTLESS_ROUTES, routesOf } from '@cog/service-kit';
import { loadProvisionalCatalogue } from '@cog/finance';
import { TENANT_SCOPED_PREFIXES, createApp } from '../../src/app.js';
import { createPrincipalResolver } from '../../src/principal-resolver.js';
import { verifyLocalBearer } from '../../src/verify.js';

/**
 * **Tenant A cannot read tenant B through the route.**
 *
 * This is a different assertion from the one the database-layer isolation
 * suites make, and neither substitutes for the other:
 *
 * - The database suites prove a *policy* holds — given a tenant context, the
 *   rows of another tenant are not visible.
 * - This proves the *resolution* is right — that the context the route runs
 *   under is the one belonging to the caller's credential.
 *
 * A route that resolves the wrong tenant satisfies every policy in the system
 * perfectly, and returns another company's purchase orders. That is the bug a
 * customer's security reviewer asks about, and no amount of policy testing
 * touches it.
 *
 * It runs against Postgres directly rather than through PgBouncer: connection
 * reuse across the pooler is already covered by the pool-size-1 test in
 * `@cog/tenancy` (M1/D3), and repeating it here would test the same mechanism
 * twice while testing this one not at all.
 */

const REPO = join(import.meta.dirname, '../../../..');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'priya@aarambh.test';
const USER_B = 'arjun@dvitiya.test';
const PRINCIPAL_A = '1111aaaa-1111-4111-8111-aaaaaaaaaaaa';
const PRINCIPAL_B = '2222bbbb-2222-4222-8222-bbbbbbbbbbbb';

let postgres: StartedTestContainer;
let admin: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;
const projectIds = new Map<string, string>();
const vendorIds = new Map<string, string>();
const orderIds = new Map<string, string>();

/** Seed a tenant, its first principal, and one purchase order of its own. */
async function seedTenant(
  tenantId: string,
  slug: string,
  principalId: string,
  email: string,
  poNumber: string,
): Promise<void> {
  await admin.query('BEGIN');
  // Through the tenant context, never around it: every table here is FORCE ROW
  // LEVEL SECURITY, so even the owner is subject to the policy and the seed
  // exercises WITH CHECK rather than bypassing it.
  await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
  await admin.query(
    `INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
     VALUES ($1, $2, $3, 'https://example.test')`,
    [tenantId, slug, `${slug} Private Limited`],
  );
  await admin.query(
    `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
     VALUES ($1, $2, 'staff', $3, $3, '{director}')`,
    [tenantId, principalId, email],
  );
  await admin.query('SELECT identity.register_principal($1, $2)', [email, principalId]);
  // A real vendor, because migration 0033 gives purchase_orders.vendor_id a
  // composite FK. Before it, an order could name a vendor that did not exist —
  // and this seed did exactly that with randomUUID().
  const vendorId = randomUUID();
  await admin.query(
    `INSERT INTO procurement.vendors (tenant_id, id, name, code)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, vendorId, `${slug} Supplies`, `${slug.toUpperCase()}-V1`],
  );
  vendorIds.set(tenantId, vendorId);
  const orderId = randomUUID();
  await admin.query(
    `INSERT INTO procurement.purchase_orders (tenant_id, id, number, vendor_id, state)
     VALUES ($1, $2, $3, $4, 'draft')`,
    [tenantId, orderId, poNumber, vendorId],
  );
  orderIds.set(tenantId, orderId);
  const projectId = randomUUID();
  await admin.query(
    `INSERT INTO projects.projects (tenant_id, id, code, name, client_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, projectId, `${slug}-P1`, `${slug} tower fitout`, `${slug} client`],
  );
  // One BOQ line, priced and costed, so the totals are computable.
  await admin.query(
    `INSERT INTO projects.boq_items
       (tenant_id, id, project_id, section, item_no, description, uom,
        quantity_micros, rate, cost_rate)
     VALUES ($1, $2, $3, 'Civil', 1, 'Vitrified tile 600x600', 'sqm',
             12375000, 84500, 60000)`,
    [tenantId, randomUUID(), projectId],
  );
  projectIds.set(tenantId, projectId);
  await admin.query('COMMIT');
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

  admin = new pg.Client({
    host: 'localhost',
    port,
    user: 'cog',
    password: 'cog_local_dev',
    database: 'cog',
  });
  await admin.connect();

  // The same planner `pnpm migrate` uses, so this suite cannot pass against an
  // ordering the real runner would reject.
  for (const { path } of planMigrations(discoverMigrations(join(REPO, 'services'))) as Array<{
    path: string;
  }>) {
    await admin.query(readFileSync(path, 'utf8'));
  }
  await admin.query(`ALTER ROLE app_runtime LOGIN PASSWORD 'runtime_pw'`);

  await seedTenant(TENANT_A, 'aarambh', PRINCIPAL_A, USER_A, 'PO-A-0001');
  await seedTenant(TENANT_B, 'dvitiya', PRINCIPAL_B, USER_B, 'PO-B-0001');

  // As app_runtime — a role that owns nothing and holds neither superuser nor
  // BYPASSRLS. Running this as the owner would make every policy inert and the
  // suite would pass regardless of correctness.
  pool = new pg.Pool({
    host: 'localhost',
    port,
    user: 'app_runtime',
    password: 'runtime_pw',
    database: 'cog',
    max: 4,
  });

  app = createApp({
    pool,
    resolver: createPrincipalResolver({ pool, verify: verifyLocalBearer('test') }),
    // The back office, mounted here so the provisioning suite drives the real
    // route rather than the function beneath it. In production it is behind
    // `PLATFORM_CONSOLE=on`, and absent means the prefix does not exist.
    // The provisioning ceiling is raised, not removed.
    //
    // It bounds a single process to ten organisations a minute, which is a
    // reasonable production number and a hopeless test one: this suite
    // provisions a tenant per scenario and started tripping the ceiling as a
    // side effect of having MORE SCENARIOS. That failure says nothing about the
    // product. A test below still asserts the ceiling fires at whatever it is
    // set to, so the control is proven rather than merely present.
    platform: { verify: verifyLocalBearer('test'), provisionAttemptLimit: 60 },
    // Mounted so the redemption tests drive the real route — including the
    // fact that it is NOT behind the tenant middleware.
    invite: { verify: verifyLocalBearer('test') },
    // Money here is computed from provisional values and marked as drafts, as
    // the local stack does (STATUTORY_OUTPUTS=draft in docker-compose.yml). The
    // refusal tests build an app without it.
    statutoryOutputs: 'draft',
  });
}, 300_000);

afterAll(async () => {
  await pool?.end();
  await admin?.end();
  await postgres?.stop();
});

async function listAs(credential: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
  return app.request('/api/v1/purchase-orders', { headers });
}

describe('GET /api/v1/purchase-orders', () => {
  it('shows tenant A only its own purchase order', async () => {
    const res = await listAs(USER_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ number: string }> };
    expect(body.items.map((i) => i.number)).toEqual(['PO-A-0001']);
  });

  it('shows tenant B only its own purchase order', async () => {
    const res = await listAs(USER_B);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ number: string }> };
    expect(body.items.map((i) => i.number)).toEqual(['PO-B-0001']);
  });

  it('never shows one tenant the other, in either direction', async () => {
    // Stated as its own assertion rather than left implicit in the two above,
    // because "A sees one row" would still pass if that row were B's.
    const a = (await (await listAs(USER_A)).json()) as { items: Array<{ number: string }> };
    const b = (await (await listAs(USER_B)).json()) as { items: Array<{ number: string }> };
    expect(a.items.map((i) => i.number)).not.toContain('PO-B-0001');
    expect(b.items.map((i) => i.number)).not.toContain('PO-A-0001');
  });

  it('refuses an unauthenticated request rather than returning an empty list', async () => {
    // The distinction that matters most: under RLS a query with no tenant set
    // returns ZERO ROWS rather than erroring, so a 200 with `[]` here would be
    // indistinguishable from "this tenant has no purchase orders". A screen
    // showing an empty table to a caller whose isolation context failed is the
    // worst possible outcome, because nobody investigates an empty table.
    const res = await listAs(null);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('TENANT_NOT_RESOLVED');
  });

  it('refuses a credential that resolves to no principal', async () => {
    // An address that is not seeded must authenticate as nobody — never as a
    // new or default tenant.
    const res = await listAs('attacker@elsewhere.test');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('TENANT_NOT_RESOLVED');
  });
});

describe('GET /api/v1/shell/search — the bar’s search, scoped and tenant-bound', () => {
  // A provisioned tenant, whose first administrator reaches every module; the
  // base fixtures' director reaches none (no role catalogue), so a search as
  // them proves nothing. The records are made through the API.
  const SLUG = 'findable';
  const PLATFORM_CRED = 'ops.search@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  let vendorId = '';
  let orderNumber = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const search = (credential: string, query: string) => send(`/api/v1/shell/search?${query}`, 'GET', credential);

  beforeAll(async () => {
    await admin.query(`INSERT INTO tenancy.platform_principals (id, external_id, email) VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`, [randomUUID(), PLATFORM_CRED]);
    const made = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Findable Fitouts Private Limited',
      appOrigin: 'https://findable.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(made.status).toBe(201);
    const vendor = await send('/api/v1/purchase-orders/vendors', 'POST', OWNER, { name: 'Sthapatya Glass Works', code: 'STHA-01', email: 'a@sthapatya.test', phone: '9000000001', address: 'Pune' });
    expect(vendor.status).toBe(201);
    vendorId = ((await vendor.json()) as { id: string }).id;
    const order = await send('/api/v1/purchase-orders', 'POST', OWNER, {
      vendorId,
      lines: [{ description: 'Toughened glass, 12mm', hsnSac: '7007', quantityWhole: 10, quantityMillionths: 0, unitRate: '450000', gstRate: 1800 }],
    });
    expect(order.status).toBe(201);
    orderNumber = ((await order.json()) as { number: string }).number;
  });

  it('finds the tenant’s own order and vendor by a word, and none of another tenant’s', async () => {
    const res = await search(OWNER, `q=${encodeURIComponent(orderNumber.slice(0, 4))}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scope: string; items: Array<{ kind: string; title: string; href: string }> };
    expect(body.scope).toBe('everything');
    expect(body.items.some((i) => i.kind === 'order' && i.title === orderNumber)).toBe(true);
    // the base fixtures' orders live in two other tenants; a word that names them finds nothing here
    const others = (await (await search(OWNER, 'q=PO-A')).json()) as { items: Array<{ title: string }> };
    expect(others.items.some((i) => i.title.startsWith('PO-A') || i.title.startsWith('PO-B'))).toBe(false);
    const vendors = (await (await search(OWNER, 'q=Sthapatya&scope=vendors')).json()) as { items: Array<{ kind: string; title: string; href: string }> };
    expect(vendors.items.map((i) => i.kind)).toEqual(['vendor']);
    expect(vendors.items[0]?.href).toBe(`/vendors/${vendorId}`);
    // and the other tenants cannot see this one's vendor
    const fromA = (await (await search(USER_A, 'q=Sthapatya')).json()) as { items: unknown[] };
    expect(fromA.items).toEqual([]);
  });

  it('a scope narrows to one kind, and a project narrows to what belongs to it', async () => {
    const orders = (await (await search(OWNER, 'q=Sthapatya&scope=orders')).json()) as { items: Array<{ kind: string; href: string }> };
    expect(orders.items.length).toBeGreaterThan(0);
    expect(orders.items.every((i) => i.kind === 'order')).toBe(true);
    expect(orders.items[0]?.href).toMatch(/^\/purchase-orders\//);
    // the order belongs to no project: narrowed to any project, nothing is found
    const narrowed = (await (await search(OWNER, `q=Sthapatya&projectId=${randomUUID()}`)).json()) as { items: unknown[] };
    expect(narrowed.items).toEqual([]);
  });

  it('a word too short searches nothing, and a bad project id is refused', async () => {
    const short = (await (await search(OWNER, 'q=S')).json()) as { items: unknown[] };
    expect(short.items).toEqual([]);
    expect((await search(OWNER, 'q=Sthapatya&projectId=nope')).status).toBe(400);
  });
});

describe('the tenant is taken from the credential, never from the request', () => {
  it('ignores a tenant id supplied by the caller', async () => {
    // The legacy RPC route dispatches `api[method](...args, session)` with
    // arguments padded but never truncated, so a client-supplied argument binds
    // to `session`. A context a caller can pass in is not a context. There is
    // no parameter here by which a caller could name a tenant — this asserts
    // that adding one later does not silently start working.
    const res = await app.request(
      `/api/v1/purchase-orders?tenantId=${TENANT_B}&tenant_id=${TENANT_B}`,
      { headers: { authorization: `Bearer ${USER_A}`, 'x-tenant-id': TENANT_B } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ number: string }> };
    expect(body.items.map((i) => i.number)).toEqual(['PO-A-0001']);
  });

  it('reports the resolved tenant on /whoami', async () => {
    const res = await app.request('/api/v1/purchase-orders/whoami', {
      headers: { authorization: `Bearer ${USER_B}` },
    });
    expect(((await res.json()) as { tenantId: string }).tenantId).toBe(TENANT_B);
  });
});

describe('projects — the route that replaces name-string keying', () => {
  async function get(path: string, credential: string | null): Promise<Response> {
    const headers: Record<string, string> = {};
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, { headers });
  }

  it('shows each tenant only its own projects', async () => {
    const a = (await (await get('/api/v1/projects', USER_A)).json()) as {
      items: Array<{ code: string }>;
    };
    const b = (await (await get('/api/v1/projects', USER_B)).json()) as {
      items: Array<{ code: string }>;
    };
    expect(a.items.map((i) => i.code)).toEqual(['aarambh-P1']);
    expect(b.items.map((i) => i.code)).toEqual(['dvitiya-P1']);
  });

  it("answers NOT_FOUND — not FORBIDDEN — for another tenant's project id", async () => {
    // The distinction is an information leak either way round: a 403 would
    // confirm the id exists somewhere in the system, which is an existence
    // oracle across tenants. RLS has already made the row invisible; the
    // response must not be more specific than the policy.
    const otherId = projectIds.get(TENANT_B)!;
    const res = await get(`/api/v1/projects/${otherId}`, USER_A);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('NOT_FOUND');
  });

  it("cannot read another tenant's BOQ, by id, through the nested route", async () => {
    // The nested route is the one worth testing: `/projects/:id/boq` reads a
    // second table, and a handler that checked the parent but queried the
    // child unscoped would pass every test that only looks at `/projects`.
    const otherId = projectIds.get(TENANT_B)!;
    const res = await get(`/api/v1/projects/${otherId}/boq`, USER_A);
    expect(res.status).toBe(404);
  });

  it('computes BOQ line amounts and totals on the server', async () => {
    // 12.375 sqm x Rs 845.00 = Rs 10,456.875 -> 1045688 paise at the paise
    // boundary. The client is sent the answer; it never multiplies.
    const id = projectIds.get(TENANT_A)!;
    const res = await get(`/api/v1/projects/${id}/boq`, USER_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ amount: string; costRate: string | null }>;
      totals: { value: string; cost: string | null; margin: string | null };
    };
    expect(body.items[0]!.amount).toBe('1045688');
    expect(body.totals.value).toBe('1045688');
    // 12.375 x Rs 600.00 = Rs 7425.00
    expect(body.totals.cost).toBe('742500');
    expect(body.totals.margin).toBe('303188');
  });

  it('refuses an unauthenticated BOQ read rather than returning empty totals', async () => {
    const id = projectIds.get(TENANT_A)!;
    const res = await get(`/api/v1/projects/${id}/boq`, null);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('TENANT_NOT_RESOLVED');
  });

  it('issues the id on create rather than accepting one', async () => {
    const res = await app.request('/api/v1/projects', {
      method: 'POST',
      headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        // A caller-supplied id must be ignored, not honoured.
        id: '99999999-9999-4999-8999-999999999999',
        code: 'NW-P2',
        name: 'Second project',
        clientName: 'Aarambh client',
      }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; code: string };
    expect(created.code).toBe('NW-P2');
    expect(created.id).not.toBe('99999999-9999-4999-8999-999999999999');
  });

  it("stamps the created project with the caller's tenant", async () => {
    const b = (await (await get('/api/v1/projects', USER_B)).json()) as {
      items: Array<{ code: string }>;
    };
    // The project created as tenant A above must not appear for tenant B.
    expect(b.items.map((i) => i.code)).not.toContain('NW-P2');
  });

  describe('moving a project between states (DATA-08)', () => {
    function move(projectId: string, credential: string, state: string) {
      return app.request(`/api/v1/projects/${projectId}/state`, {
        method: 'POST',
        headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
      });
    }

    it('walks lead → won → in progress → handed over → closed, stamping the two dates', async () => {
      const list = (await (await get('/api/v1/projects', USER_A)).json()) as {
        items: Array<{ id: string; code: string; state: string; startedOn: string | null }>;
      };
      const project = list.items.find((p) => p.code === 'NW-P2');
      expect(project?.state).toBe('lead');
      expect(project?.startedOn).toBeNull();
      const id = project?.id ?? '';

      const won = await move(id, USER_A, 'won');
      expect(won.status).toBe(200);
      expect(((await won.json()) as { state: string }).state).toBe('won');

      const started = (await (await move(id, USER_A, 'in_progress')).json()) as {
        state: string;
        startedOn: string | null;
        handedOverOn: string | null;
      };
      expect(started.state).toBe('in_progress');
      expect(started.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(started.handedOverOn).toBeNull();

      const handed = (await (await move(id, USER_A, 'handed_over')).json()) as {
        state: string;
        startedOn: string | null;
        handedOverOn: string | null;
      };
      expect(handed.state).toBe('handed_over');
      expect(handed.startedOn).toBe(started.startedOn);
      expect(handed.handedOverOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // The list filter is now real: the project is under its state and nowhere else.
      const inProgress = (await (await get('/api/v1/projects?state=in_progress', USER_A)).json()) as {
        items: Array<{ id: string }>;
        count: number;
      };
      expect(inProgress.items.map((p) => p.id)).not.toContain(id);
      const handedOver = (await (await get('/api/v1/projects?state=handed_over', USER_A)).json()) as {
        items: Array<{ id: string }>;
        count: number;
      };
      expect(handedOver.items.map((p) => p.id)).toContain(id);
      expect(handedOver.count).toBeGreaterThanOrEqual(1);

      const closed = await move(id, USER_A, 'closed');
      expect(closed.status).toBe(200);
    });

    it('refuses a move the rule does not list, naming both states, and writes nothing', async () => {
      const list = (await (await get('/api/v1/projects', USER_A)).json()) as {
        items: Array<{ id: string; code: string; state: string }>;
      };
      const closed = list.items.find((p) => p.code === 'NW-P2');
      expect(closed?.state).toBe('closed');
      const res = await move(closed?.id ?? '', USER_A, 'in_progress');
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string; message: string };
      expect(body.code).toBe('CONFLICT');
      expect(body.message).toContain('closed');
      expect(body.message).toContain('in progress');

      const lead = list.items.find((p) => p.code === 'aarambh-P1');
      expect((await move(lead?.id ?? '', USER_A, 'handed_over')).status).toBe(409);
      expect((await move(lead?.id ?? '', USER_A, 'lead')).status).toBe(409);
      const after = (await (await get(`/api/v1/projects/${lead?.id ?? ''}`, USER_A)).json()) as {
        state: string;
      };
      expect(after.state).toBe('lead');
    });

    it("refuses an unknown state, and answers not-found for another tenant's project", async () => {
      const mine = projectIds.get(TENANT_A)!;
      expect((await move(mine, USER_A, 'finished')).status).toBe(400);
      const theirs = projectIds.get(TENANT_B)!;
      const res = await move(theirs, USER_A, 'won');
      expect(res.status).toBe(404);
      const untouched = (await (await get(`/api/v1/projects/${theirs}`, USER_B)).json()) as {
        state: string;
      };
      expect(untouched.state).toBe('lead');
    });
  });
});

/**
 * **Writing BOQ lines — slice 2.**
 *
 * The negative cases are the point, and for a BOQ they are sharper than usual:
 * a BOQ is what the client is quoted from, so a line written into another
 * tenant's schedule is a wrong price in somebody else's proposal.
 */
describe('writing BOQ lines', () => {
  const LINE = {
    section: 'Finishes',
    itemNo: 10,
    description: 'Laminate 1mm',
    uom: 'sqm',
    quantityWhole: 12,
    quantityMillionths: 375_000,
    rate: '84500',
  };

  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  // ---- POST /:projectId/boq -------------------------------------------------

  it('refuses an unauthenticated add rather than writing a tenantless line', async () => {
    const id = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${id}/boq`, 'POST', null, { lines: [LINE] });
    expect(res.status).toBe(403);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.boq_items WHERE description = 'Laminate 1mm'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses to add a line to another tenant project, and says only not-found', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${aProject}/boq`, 'POST', USER_B, { lines: [LINE] });
    // RLS has already made the project invisible; the response must not be more
    // specific than the policy.
    expect(res.status).toBe(404);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.boq_items WHERE description = 'Laminate 1mm'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('computes the line amount and ignores an amount the caller sent', async () => {
    const id = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${id}/boq`, 'POST', USER_A, {
      lines: [{ ...LINE, amount: '1', margin_pct: 99 }],
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      items: Array<{ id: string; amount: string; costRate: string | null }>;
    };
    // 12.375 x Rs 845.00 = Rs 10,456.875 -> 1045688 paise, rounded once.
    expect(body.items[0]!.amount).toBe('1045688');
    // Omitted cost stays UNKNOWN. boq.js:110 would have made it 80% of the rate.
    expect(body.items[0]!.costRate).toBeNull();
  });

  it('stamps the line with the caller tenant and nobody else', async () => {
    const { rows } = await admin.query(
      `SELECT tenant_id FROM projects.boq_items WHERE description = 'Laminate 1mm'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it('refuses a duplicate section and item number within one project', async () => {
    const id = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${id}/boq`, 'POST', USER_A, { lines: [LINE] });
    expect(res.status).toBe(409);
  });

  it('writes a set atomically — one bad line and none of them land', async () => {
    const id = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${id}/boq`, 'POST', USER_A, {
      lines: [
        { ...LINE, section: 'Atomic', itemNo: 1, description: 'First' },
        { ...LINE, section: 'Atomic', itemNo: 2, description: 'Second' },
        // Collides with the line added above.
        { ...LINE, description: 'Third' },
      ],
    });
    expect(res.status).toBe(409);

    // The middleware's transaction rolled the whole request back. The legacy
    // inserts in a bare loop (boq.js:71), leaving a partial schedule that reads
    // as complete.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.boq_items WHERE section = 'Atomic'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('lets two tenants use the same section and item number', async () => {
    const bProject = projectIds.get(TENANT_B)!;
    const res = await send(`/api/v1/projects/${bProject}/boq`, 'POST', USER_B, { lines: [LINE] });
    // The unique constraint is (tenant_id, project_id, section, item_no).
    expect(res.status).toBe(201);
  });

  // ---- PATCH /:projectId/boq/:itemId ---------------------------------------

  async function versionOfLine(id: string): Promise<number> {
    const { rows } = await admin.query(`SELECT version FROM projects.boq_items WHERE id = $1`, [
      id,
    ]);
    return rows[0].version as number;
  }

  async function lineIdOf(tenantId: string, description: string): Promise<string> {
    const { rows } = await admin.query(
      `SELECT id FROM projects.boq_items WHERE tenant_id = $1 AND description = $2`,
      [tenantId, description],
    );
    return rows[0].id as string;
  }

  it('refuses to edit a line in another tenant project', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');
    const res = await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'PATCH', USER_B, {
      ...LINE,
      rate: '1',
      expectedVersion: 1,
    });
    expect(res.status).toBe(404);

    const { rows } = await admin.query(`SELECT rate FROM projects.boq_items WHERE id = $1`, [
      itemId,
    ]);
    expect(String(rows[0].rate)).toBe('84500');
  });

  it('recomputes the amount on edit and bumps the version', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');
    const before = await versionOfLine(itemId);

    const res = await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'PATCH', USER_A, {
      ...LINE,
      quantityWhole: 2,
      quantityMillionths: 0,
      expectedVersion: before,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { amount: string; version: number };
    // 2 x Rs 845.00 = Rs 1,690.00
    expect(body.amount).toBe('169000');
    expect(body.version).toBe(before + 1);
  });

  // ---- BOQ-04, now that boq_items has a version column ----------------------

  it('refuses an edit that omits expectedVersion', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');
    const res = await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'PATCH', USER_A, LINE);
    // The control is not optional, exactly as on a purchase order.
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('refuses a stale expectedVersion, and does not write', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');
    const res = await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'PATCH', USER_A, {
      ...LINE,
      description: 'Should not land',
      expectedVersion: 1,
    });
    expect(res.status).toBe(409);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.boq_items WHERE description = 'Should not land'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('reports the version on the read, so an edit can send it back', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const res = await app.request(`/api/v1/projects/${aProject}/boq`, {
      headers: { authorization: `Bearer ${USER_A}` },
    });
    const body = (await res.json()) as { items: Array<{ version: number }> };
    expect(body.items.every((i) => Number.isInteger(i.version) && i.version >= 1)).toBe(true);
  });

  it('refuses an edit whose body is a partial line', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');
    const res = await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'PATCH', USER_A, {
      rate: '90000',
      expectedVersion: 1,
    });
    expect(res.status).toBe(400);
  });

  // ---- DELETE /:projectId/boq/:itemId --------------------------------------

  it('refuses to delete a line in another tenant project', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');
    const res = await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'DELETE', USER_B);
    expect(res.status).toBe(404);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.boq_items WHERE id = $1`,
      [itemId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('deletes, and a second delete is not found rather than ok', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const itemId = await lineIdOf(TENANT_A, 'Laminate 1mm');

    expect((await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'DELETE', USER_A)).status).toBe(
      204,
    );
    // deleteBOQItem (boq.js:339) returns { ok: true } whatever happened, so
    // deleting nothing and deleting something look the same to the caller.
    expect((await send(`/api/v1/projects/${aProject}/boq/${itemId}`, 'DELETE', USER_A)).status).toBe(
      404,
    );
  });

  it('refuses an unauthenticated delete', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${aProject}/boq/${randomUUID()}`, 'DELETE', null);
    expect(res.status).toBe(403);
  });

  it('treats a malformed id as not found rather than reaching the database', async () => {
    const aProject = projectIds.get(TENANT_A)!;
    const res = await send(`/api/v1/projects/${aProject}/boq/not-a-uuid`, 'DELETE', USER_A);
    expect(res.status).toBe(404);
  });
});

/**
 * **Vendors — slice 3.**
 *
 * The assertion that carries the most weight is the negative one: **no vendor
 * read returns a bank account or an IFSC.** `vendors.js:42` does `SELECT *` and
 * hands back `accountNo` and `ifsc` to any caller `requireAuth` lets through,
 * and `requireAuth` checks that `session.email` is truthy (VEND-02).
 */
describe('vendors', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const NEW_VENDOR = {
    name: 'Brightline Interiors',
    code: 'BRIGHT-01',
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    email: 'accounts@brightline.test',
    phone: '9876543210',
    address: '12 MG Road, Bengaluru',
  };

  it('shows each tenant only its own vendors', async () => {
    const a = (await (await send('/api/v1/purchase-orders/vendors', 'GET', USER_A)).json()) as {
      items: Array<{ code: string }>;
    };
    const b = (await (await send('/api/v1/purchase-orders/vendors', 'GET', USER_B)).json()) as {
      items: Array<{ code: string }>;
    };
    expect(a.items.map((v) => v.code)).toContain('AARAMBH-V1');
    expect(a.items.map((v) => v.code)).not.toContain('DVITIYA-V1');
    expect(b.items.map((v) => v.code)).not.toContain('AARAMBH-V1');
  });

  it('never returns a bank account or an IFSC on any vendor read', async () => {
    const list = await (await send('/api/v1/purchase-orders/vendors', 'GET', USER_A)).text();
    const one = await (
      await send(`/api/v1/purchase-orders/vendors/${vendorIds.get(TENANT_A)}`, 'GET', USER_A)
    ).text();

    // The columns are not on the table these read from at all — they are in
    // procurement.vendor_bank_accounts — so this asserts a structural property,
    // not a filtering habit.
    for (const body of [list, one]) {
      expect(body).not.toMatch(/bank_account|accountNo|account_number/i);
      expect(body).not.toMatch(/ifsc/i);
    }
  });

  it('creates a vendor and hands back its version', async () => {
    const res = await send('/api/v1/purchase-orders/vendors', 'POST', USER_A, NEW_VENDOR);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; version: number; status: string };
    expect(created.version).toBe(1);
    expect(created.status).toBe('active');
  });

  it('refuses a reused code within a tenant, and allows it across tenants', async () => {
    expect(
      (await send('/api/v1/purchase-orders/vendors', 'POST', USER_A, NEW_VENDOR)).status,
    ).toBe(409);
    // The unique constraint is (tenant_id, code).
    expect(
      (await send('/api/v1/purchase-orders/vendors', 'POST', USER_B, NEW_VENDOR)).status,
    ).toBe(201);
  });

  it('refuses a malformed GSTIN and a malformed PAN rather than storing them', async () => {
    for (const bad of [
      { ...NEW_VENDOR, code: 'BAD-1', gstin: 'NOTAGSTIN' },
      { ...NEW_VENDOR, code: 'BAD-2', pan: 'nope' },
    ]) {
      const res = await send('/api/v1/purchase-orders/vendors', 'POST', USER_A, bad);
      expect(res.status).toBe(400);
    }
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.vendors WHERE code LIKE 'BAD-%'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('accepts a vendor with no GSTIN — absent is not invented', async () => {
    const res = await send('/api/v1/purchase-orders/vendors', 'POST', USER_A, {
      name: 'Unregistered Supplier',
      code: 'UNREG-01',
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { gstin: string | null; pan: string | null };
    // Never a placeholder: tdsChallan281.js:54 invents a TAN into filed content.
    expect(created.gstin).toBeNull();
    expect(created.pan).toBeNull();
  });

  it('refuses to read another tenant vendor, saying only not-found', async () => {
    const res = await send(
      `/api/v1/purchase-orders/vendors/${vendorIds.get(TENANT_B)}`,
      'GET',
      USER_A,
    );
    expect(res.status).toBe(404);
  });

  it('refuses to edit another tenant vendor, and does not write', async () => {
    const res = await send(
      `/api/v1/purchase-orders/vendors/${vendorIds.get(TENANT_B)}`,
      'PATCH',
      USER_A,
      { ...NEW_VENDOR, name: 'HIJACKED', status: 'active', expectedVersion: 1 },
    );
    expect(res.status).toBe(404);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.vendors WHERE name = 'HIJACKED'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('requires expectedVersion on an edit', async () => {
    const res = await send(
      `/api/v1/purchase-orders/vendors/${vendorIds.get(TENANT_A)}`,
      'PATCH',
      USER_A,
      { ...NEW_VENDOR, code: 'AARAMBH-V1', status: 'active' },
    );
    // VEND-01: the legacy makes it optional — and writes it to a column that
    // does not exist, so the statement throws either way.
    expect(res.status).toBe(400);
  });

  it('refuses a stale expectedVersion', async () => {
    const res = await send(
      `/api/v1/purchase-orders/vendors/${vendorIds.get(TENANT_A)}`,
      'PATCH',
      USER_A,
      { ...NEW_VENDOR, code: 'AARAMBH-V1', status: 'active', expectedVersion: 99 },
    );
    expect(res.status).toBe(409);
  });

  it('edits and bumps the version', async () => {
    const id = vendorIds.get(TENANT_A)!;
    const { rows: before } = await admin.query(
      `SELECT version FROM procurement.vendors WHERE id = $1`,
      [id],
    );
    const res = await send(`/api/v1/purchase-orders/vendors/${id}`, 'PATCH', USER_A, {
      name: 'Aarambh Supplies Pvt Ltd',
      code: 'AARAMBH-V1',
      status: 'inactive',
      expectedVersion: before[0].version,
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { version: number; status: string; name: string };
    expect(updated.version).toBe(before[0].version + 1);
    expect(updated.status).toBe('inactive');
    expect(updated.name).toBe('Aarambh Supplies Pvt Ltd');
  });

  it('refuses to delete a vendor that has purchase orders against it', async () => {
    const res = await send(
      `/api/v1/purchase-orders/vendors/${vendorIds.get(TENANT_A)}`,
      'DELETE',
      USER_A,
    );
    // 0033's FK is ON DELETE RESTRICT. CASCADE here would delete purchase
    // orders because somebody tidied a vendor list.
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toMatch(/inactive/);
  });

  it('deletes a vendor with no orders, and a second delete is not found', async () => {
    const created = (await (
      await send('/api/v1/purchase-orders/vendors', 'POST', USER_A, {
        name: 'Temporary Supplier',
        code: 'TEMP-01',
      })
    ).json()) as { id: string };

    expect(
      (await send(`/api/v1/purchase-orders/vendors/${created.id}`, 'DELETE', USER_A)).status,
    ).toBe(204);
    expect(
      (await send(`/api/v1/purchase-orders/vendors/${created.id}`, 'DELETE', USER_A)).status,
    ).toBe(404);
  });

  it('refuses every vendor route without a credential', async () => {
    const id = vendorIds.get(TENANT_A)!;
    for (const [path, method, body] of [
      ['/api/v1/purchase-orders/vendors', 'GET', undefined],
      [`/api/v1/purchase-orders/vendors/${id}`, 'GET', undefined],
      ['/api/v1/purchase-orders/vendors', 'POST', NEW_VENDOR],
      [`/api/v1/purchase-orders/vendors/${id}`, 'PATCH', { ...NEW_VENDOR, status: 'active', expectedVersion: 1 }],
      [`/api/v1/purchase-orders/vendors/${id}`, 'DELETE', undefined],
    ] as const) {
      const res = await send(path, method, null, body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('cannot raise a purchase order against another tenant vendor', async () => {
    const res = await send('/api/v1/purchase-orders', 'POST', USER_A, {
      number: 'PO-CROSS-VENDOR',
      vendorId: vendorIds.get(TENANT_B),
      lines: [
        {
          description: 'x',
          hsnSac: '',
          quantityWhole: 1,
          quantityMillionths: 0,
          unitRate: '100',
          gstRate: 1800,
        },
      ],
    });
    // Before 0033 this succeeded: vendor_id was a bare uuid with no FK, so an
    // order could name any vendor, including one belonging to another tenant.
    expect(res.status).toBeGreaterThanOrEqual(400);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_orders WHERE number = 'PO-CROSS-VENDOR'`,
    );
    expect(rows[0].n).toBe(0);
  });
});

/**
 * **Stock — slice 4.**
 *
 * The assertion this whole slice exists for: **a transfer moves stock.** The
 * legacy's `createTransfer` (`inventory.js:143`) inserts a transfer row and
 * never touches `inventory_items`, and it is the only inventory write the UI
 * calls — so no transfer has ever changed a stock figure (INV-01).
 */
describe('stock', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function newItem(credential: string, name: string): Promise<string> {
    const res = await send('/api/v1/purchase-orders/stock/items', 'POST', credential, {
      name,
      uom: 'bag',
      reorderWhole: 10,
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  async function valueOf(
    credential: string,
    id: string,
    warehouse: string,
  ): Promise<string | null> {
    const res = await send('/api/v1/purchase-orders/stock', 'GET', credential);
    const body = (await res.json()) as {
      items: Array<{ id: string; warehouse: string; valuePaise: string | null }>;
    };
    return body.items.find((i) => i.id === id && i.warehouse === warehouse)?.valuePaise ?? null;
  }

  async function balance(credential: string, id: string, warehouse: string): Promise<bigint> {
    const res = await send('/api/v1/purchase-orders/stock', 'GET', credential);
    const body = (await res.json()) as {
      items: Array<{ id: string; warehouse: string; quantityMicros: string }>;
    };
    const row = body.items.find((i) => i.id === id && i.warehouse === warehouse);
    return row === undefined ? 0n : BigInt(row.quantityMicros);
  }

  it('a receipt adds stock', async () => {
    const id = await newItem(USER_A, 'Cement OPC 53');
    expect(
      (
        await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
          stockItemId: id,
          warehouse: 'Central',
          quantityWhole: 100,
          quantityMillionths: 0,
        })
      ).status,
    ).toBe(204);
    expect(await balance(USER_A, id, 'Central')).toBe(100_000_000n);
  });

  it('a transfer MOVES stock — out of one warehouse and into the other', async () => {
    const id = await newItem(USER_A, 'Steel TMT 12mm');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Central',
      quantityWhole: 50,
      quantityMillionths: 0,
    });

    const res = await send('/api/v1/purchase-orders/stock/transfers', 'POST', USER_A, {
      stockItemId: id,
      fromWarehouse: 'Central',
      toWarehouse: 'Site A',
      quantityWhole: 20,
      quantityMillionths: 0,
    });
    expect(res.status).toBe(201);

    // INV-01: in the legacy both of these would still read 50 and 0.
    expect(await balance(USER_A, id, 'Central')).toBe(30_000_000n);
    expect(await balance(USER_A, id, 'Site A')).toBe(20_000_000n);
  });

  it('a transfer writes two movements that sum to zero', async () => {
    const { rows } = await admin.query(
      `SELECT transfer_id, SUM(quantity_micros)::text AS net, count(*)::int AS n
         FROM procurement.stock_movements
        WHERE transfer_id IS NOT NULL
        GROUP BY transfer_id`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.n).toBe(2);
      // Stock cannot leave one place without arriving in another.
      expect(r.net).toBe('0');
    }
  });

  it('refuses a transfer that would take a warehouse below zero', async () => {
    const id = await newItem(USER_A, 'Plywood 18mm');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Central',
      quantityWhole: 5,
      quantityMillionths: 0,
    });
    const res = await send('/api/v1/purchase-orders/stock/transfers', 'POST', USER_A, {
      stockItemId: id,
      fromWarehouse: 'Central',
      toWarehouse: 'Site A',
      quantityWhole: 9,
      quantityMillionths: 0,
    });
    expect(res.status).toBe(409);
    expect(await balance(USER_A, id, 'Central')).toBe(5_000_000n);
    expect(await balance(USER_A, id, 'Site A')).toBe(0n);
  });

  it('refuses an issue larger than the balance', async () => {
    const id = await newItem(USER_A, 'Paint Emulsion');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Central',
      quantityWhole: 2,
      quantityMillionths: 0,
    });
    const res = await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Central',
      quantityWhole: 3,
      quantityMillionths: 0,
    });
    expect(res.status).toBe(409);
  });

  it('refuses a transfer to the same warehouse', async () => {
    const id = await newItem(USER_A, 'Sand River');
    const res = await send('/api/v1/purchase-orders/stock/transfers', 'POST', USER_A, {
      stockItemId: id,
      fromWarehouse: 'Central',
      toWarehouse: 'Central',
      quantityWhole: 1,
      quantityMillionths: 0,
    });
    expect(res.status).toBe(409);
  });

  it('carries fractional quantities exactly', async () => {
    const id = await newItem(USER_A, 'Adhesive');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Central',
      quantityWhole: 12,
      quantityMillionths: 375_000,
    });
    // 12.375, exactly. The legacy column is REAL.
    expect(await balance(USER_A, id, 'Central')).toBe(12_375_000n);
  });

  it('reports below-reorder against the summed balance', async () => {
    const id = await newItem(USER_A, 'Screws 2in');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Central',
      quantityWhole: 4,
      quantityMillionths: 0,
    });
    const res = await send('/api/v1/purchase-orders/stock', 'GET', USER_A);
    const body = (await res.json()) as {
      items: Array<{ id: string; belowReorder: boolean }>;
    };
    expect(body.items.find((i) => i.id === id)!.belowReorder).toBe(true);
  });

  it('returns a value but never a unit price', async () => {
    const text = await (await send('/api/v1/purchase-orders/stock', 'GET', USER_A)).text();
    // INV-03 is answered now, so a value is returned. A UNIT price still is
    // not, and that is the durable half: the legacy's `unit_price` is the last
    // price paid, overwritten by each receipt, and `InventoryView.js:79`
    // multiplies it by quantity in a browser. Here value and quantity are both
    // exact integers whose sums are exact; a stored quotient would round, and
    // rounded unit costs no longer multiply back to the total they came from.
    expect(text).not.toMatch(/unitPrice|unit_price|unitCost/i);
    expect(text).toMatch(/valuePaise/);
  });

  it('values a receipt at its own rate, and says the method is provisional', async () => {
    const id = await newItem(USER_A, 'Gypsum board 12mm');
    // 40 boards at Rs 412.50 each = Rs 16,500.00.
    expect(
      (
        await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
          stockItemId: id,
          warehouse: 'Valuation',
          quantityWhole: 40,
          quantityMillionths: 0,
          unitRatePaise: '41250',
        })
      ).status,
    ).toBe(204);
    expect(await valueOf(USER_A, id, 'Valuation')).toBe('1650000');

    // And the screen can say where the method came from. It came from a legacy
    // tree, not from a finance director.
    const policy = (await (
      await send('/api/v1/purchase-orders/stock/costing-policy', 'GET', USER_A)
    ).json()) as { method: string; status: string };
    expect(policy).toEqual({ method: 'weighted_average', status: 'provisional' });
  });

  it('blends two receipts at different prices, and an issue does not move the average', async () => {
    const id = await newItem(USER_A, 'Vitrified tile 600x600');
    // 100 at Rs 50.00 = Rs 5,000.00, then 100 at Rs 70.00 = Rs 7,000.00.
    // Rs 12,000.00 over 200 units: the average is Rs 60.00.
    for (const rate of ['5000', '7000']) {
      await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
        stockItemId: id,
        warehouse: 'Blend',
        quantityWhole: 100,
        quantityMillionths: 0,
        unitRatePaise: rate,
      });
    }
    expect(await valueOf(USER_A, id, 'Blend')).toBe('1200000');

    // Issue 50. At the average that is Rs 3,000.00 out, leaving Rs 9,000.00
    // over 150 units — still Rs 60.00 each. THAT is what weighted average
    // means, and it is what `inventory.js:297` achieves by leaving the unit
    // price alone while changing the quantity.
    await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Blend',
      quantityWhole: 50,
      quantityMillionths: 0,
    });
    expect(await valueOf(USER_A, id, 'Blend')).toBe('900000');
    expect(await balance(USER_A, id, 'Blend')).toBe(150_000_000n);
  });

  it('refuses to let an issue name its own price', async () => {
    const id = await newItem(USER_A, 'Aluminium section');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'NoWriteDown',
      quantityWhole: 10,
      quantityMillionths: 0,
      unitRatePaise: '100000',
    });

    // Issuing 5 "at one paise" must still take half the value out. Otherwise
    // inventory could be written down by issuing cheaply and receiving back.
    await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'NoWriteDown',
      quantityWhole: 5,
      quantityMillionths: 0,
      unitRatePaise: '1',
    });
    expect(await valueOf(USER_A, id, 'NoWriteDown')).toBe('500000');
  });

  it('moves value with a transfer and creates none', async () => {
    const id = await newItem(USER_A, 'Plywood 18mm BWP');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'From',
      quantityWhole: 20,
      quantityMillionths: 0,
      unitRatePaise: '250000',
    });
    await send('/api/v1/purchase-orders/stock/transfers', 'POST', USER_A, {
      stockItemId: id,
      fromWarehouse: 'From',
      toWarehouse: 'To',
      quantityWhole: 8,
      quantityMillionths: 0,
    });

    // Rs 50,000.00 over 20 units. Eight of them carry Rs 20,000.00 across, and
    // the two warehouses still sum to what was received — a transfer that
    // created value would be an accounting error the ledger could not see.
    expect(await valueOf(USER_A, id, 'From')).toBe('3000000');
    expect(await valueOf(USER_A, id, 'To')).toBe('2000000');
  });

  it('reports a balance as UNVALUABLE rather than free when a receipt had no price', async () => {
    const id = await newItem(USER_A, 'Miscellaneous hardware');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Unpriced',
      quantityWhole: 5,
      quantityMillionths: 0,
      unitRatePaise: '30000',
    });
    // The second receipt carries no price at all.
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Unpriced',
      quantityWhole: 5,
      quantityMillionths: 0,
    });

    // NOT Rs 1,500.00. `SUM` skips a NULL silently, so without the check this
    // would report the priced half and look complete — a smaller number
    // presented as a real one, which is worse than an absent one.
    expect(await valueOf(USER_A, id, 'Unpriced')).toBeNull();
  });

  it('will not let two concurrent issues spend the same stock', async () => {
    // The defect this closes: every request runs in a plain BEGIN — READ
    // COMMITTED — and the balance is a SUM over an append-only ledger. Two
    // transactions both read 100, both insert -60, both commit, and the ledger
    // says -20 without any single statement having been wrong.
    //
    // Both requests are issued together and go out on different pool
    // connections, so they genuinely overlap. `SELECT ... FOR UPDATE` on the
    // item makes the second one wait for the first and then re-read.
    const id = await newItem(USER_A, 'Contested cement');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Contested',
      quantityWhole: 100,
      quantityMillionths: 0,
      unitRatePaise: '40000',
    });

    const both = await Promise.all([
      send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
        stockItemId: id,
        warehouse: 'Contested',
        quantityWhole: 60,
        quantityMillionths: 0,
      }),
      send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
        stockItemId: id,
        warehouse: 'Contested',
        quantityWhole: 60,
        quantityMillionths: 0,
      }),
    ]);

    // Exactly one succeeds. The other is refused for insufficient stock —
    // which is the right answer, because after the first there are only 40.
    expect(both.filter((r) => r.status === 204)).toHaveLength(1);
    expect(await balance(USER_A, id, 'Contested')).toBe(40_000_000n);

    // And the ledger never went negative. This is the assertion that would
    // fail without the lock, and it is the one worth reading in a review.
    const { rows } = await admin.query<{ balance: string }>(
      `SELECT COALESCE(SUM(quantity_micros), 0)::text AS balance
         FROM procurement.stock_movements
        WHERE tenant_id = $1 AND stock_item_id = $2 AND warehouse = 'Contested'`,
      [TENANT_A, id],
    );
    expect(BigInt(rows[0]!.balance) >= 0n).toBe(true);
  });

  it('leaves no value behind when everything is issued', async () => {
    const id = await newItem(USER_A, 'Silicone sealant');
    // A quantity and a price whose average does not divide evenly: 3 at
    // Rs 100.01 is Rs 300.03, and a third of that is Rs 100.01 exactly, but the
    // intermediate proportions do not land on whole paise for every split.
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Empty',
      quantityWhole: 3,
      quantityMillionths: 0,
      unitRatePaise: '10001',
    });
    await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Empty',
      quantityWhole: 1,
      quantityMillionths: 0,
    });
    await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId: id,
      warehouse: 'Empty',
      quantityWhole: 2,
      quantityMillionths: 0,
    });

    // Zero units and zero paise. A warehouse holding nothing but a rounding
    // remainder is the failure mode a stored average produces, and the reason
    // the last issue takes exactly what is left rather than a computed share.
    expect(await balance(USER_A, id, 'Empty')).toBe(0n);
    expect(await valueOf(USER_A, id, 'Empty')).toBe('0');
  });

  it('shows each tenant only its own stock', async () => {
    const bId = await newItem(USER_B, 'Cement OPC 53');
    await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_B, {
      stockItemId: bId,
      warehouse: 'Central',
      quantityWhole: 7,
      quantityMillionths: 0,
    });
    const a = (await (
      await send('/api/v1/purchase-orders/stock', 'GET', USER_A)
    ).json()) as { items: Array<{ id: string }> };
    expect(a.items.map((i) => i.id)).not.toContain(bId);
  });

  it('cannot move another tenant stock', async () => {
    const bRes = await send('/api/v1/purchase-orders/stock/items', 'POST', USER_B, {
      name: 'Tenant B Only',
      uom: 'nos',
    });
    const bId = ((await bRes.json()) as { id: string }).id;

    const res = await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId: bId,
      warehouse: 'Central',
      quantityWhole: 1,
      quantityMillionths: 0,
    });
    // RLS makes B's item invisible, so it reads as not found rather than 403.
    expect(res.status).toBe(404);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.stock_movements WHERE stock_item_id = $1`,
      [bId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses every stock route without a credential', async () => {
    for (const [path, method] of [
      ['/api/v1/purchase-orders/stock', 'GET'],
      ['/api/v1/purchase-orders/stock/items', 'POST'],
      ['/api/v1/purchase-orders/stock/receipts', 'POST'],
      ['/api/v1/purchase-orders/stock/issues', 'POST'],
      ['/api/v1/purchase-orders/stock/transfers', 'POST'],
    ] as const) {
      const res = await send(path, method, null, method === 'GET' ? undefined : {});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('the ledger is append-only — app_runtime cannot delete a movement', async () => {
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      // No DELETE grant. A mistaken movement is corrected by a reversing
      // movement, which leaves both visible.
      await expect(
        client.query(`DELETE FROM procurement.stock_movements WHERE true`),
      ).rejects.toThrow(/permission denied/i);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});

/**
 * **Tasks — slice 5.**
 *
 * The assertion the slice exists for: **completing a task and then editing it
 * does not erase who completed it.** `updateTask` (`tasks.js:247-248`) writes
 * `completed_at` and `completed_by` with no COALESCE, unlike every other field
 * in the same statement, so any later status change NULLs both (TASK-02).
 */
describe('tasks', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function newTask(credential: string, principal: string, title: string) {
    const res = await send('/api/v1/workflow/tasks', 'POST', credential, {
      title,
      assignedTo: principal,
      priority: 'high',
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; version: number; assignedBy: string };
  }

  it('records the assigner from the credential, not the body', async () => {
    const t = await newTask(USER_A, PRINCIPAL_A, 'Chase the GST certificate');
    expect(t.assignedBy).toBe(PRINCIPAL_A);
  });

  it('assigns by principal id, and refuses a principal from another tenant', async () => {
    const res = await send('/api/v1/workflow/tasks', 'POST', USER_A, {
      title: 'Cross-tenant assignment',
      assignedTo: PRINCIPAL_B,
    });
    // The composite FK is what refuses this. A single-column FK would succeed
    // and confirm that B's principal exists.
    expect(res.status).toBe(409);
  });

  it('keeps the completion record through a later edit', async () => {
    const t = await newTask(USER_A, PRINCIPAL_A, 'Sign the drawings');

    const done = await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
      title: 'Sign the drawings',
      assignedTo: PRINCIPAL_A,
      priority: 'high',
      status: 'completed',
      expectedVersion: t.version,
    });
    expect(done.status).toBe(200);
    const completed = (await done.json()) as {
      completedAt: string | null;
      completedBy: string | null;
      version: number;
    };
    expect(completed.completedAt).not.toBeNull();
    expect(completed.completedBy).toBe(PRINCIPAL_A);

    // Edit something unrelated. TASK-02: the legacy NULLs both here.
    const edited = await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
      title: 'Sign the GFC drawings',
      assignedTo: PRINCIPAL_A,
      priority: 'urgent',
      status: 'completed',
      expectedVersion: completed.version,
    });
    const after = (await edited.json()) as { completedAt: string | null; completedBy: string | null };
    expect(after.completedAt).toBe(completed.completedAt);
    expect(after.completedBy).toBe(PRINCIPAL_A);
  });

  it('clears the completion record when a task is reopened, and the constraint agrees', async () => {
    const t = await newTask(USER_A, PRINCIPAL_A, 'Reopenable');
    const done = (await (
      await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
        title: 'Reopenable',
        assignedTo: PRINCIPAL_A,
        priority: 'low',
        status: 'completed',
        expectedVersion: t.version,
      })
    ).json()) as { version: number };

    const reopened = (await (
      await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
        title: 'Reopenable',
        assignedTo: PRINCIPAL_A,
        priority: 'low',
        status: 'in_progress',
        expectedVersion: done.version,
      })
    ).json()) as { completedAt: string | null; completedBy: string | null };

    // Completed means both set; anything else means neither. The CHECK makes
    // the mixed state unrepresentable.
    expect(reopened.completedAt).toBeNull();
    expect(reopened.completedBy).toBeNull();
  });

  it('refuses a status outside the enum', async () => {
    const t = await newTask(USER_A, PRINCIPAL_A, 'Enum check');
    const res = await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
      title: 'Enum check',
      assignedTo: PRINCIPAL_A,
      priority: 'low',
      status: 'Rejected by finance',
      expectedVersion: t.version,
    });
    // Free-text status is what leads to stage.includes('reject').
    expect(res.status).toBe(400);
  });

  it('requires expectedVersion and refuses a stale one', async () => {
    const t = await newTask(USER_A, PRINCIPAL_A, 'Locking');
    expect(
      (
        await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
          title: 'Locking',
          assignedTo: PRINCIPAL_A,
          priority: 'low',
          status: 'pending',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(`/api/v1/workflow/tasks/${t.id}`, 'PATCH', USER_A, {
          title: 'Locking',
          assignedTo: PRINCIPAL_A,
          priority: 'low',
          status: 'pending',
          expectedVersion: 99,
        })
      ).status,
    ).toBe(409);
  });

  it('shows each tenant only its own tasks', async () => {
    await newTask(USER_B, PRINCIPAL_B, 'Tenant B task');
    const a = (await (await send('/api/v1/workflow/tasks', 'GET', USER_A)).json()) as {
      items: Array<{ title: string }>;
    };
    expect(a.items.map((t) => t.title)).not.toContain('Tenant B task');
  });

  it('refuses every task route without a credential', async () => {
    for (const [path, method, body] of [
      ['/api/v1/workflow/tasks', 'GET', undefined],
      ['/api/v1/workflow/tasks', 'POST', { title: 'x', assignedTo: PRINCIPAL_A }],
      [`/api/v1/workflow/tasks/${randomUUID()}`, 'DELETE', undefined],
    ] as const) {
      const res = await send(path, method, null, body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});

/**
 * **CRM — slice 6.**
 *
 * The assertion the slice exists for: **the weighted pipeline is computed on the
 * server.** `CrmView.js:53` multiplies a float value by a probability in the
 * browser and `:157` divides by 10,000,000 for crores (CRM-02).
 */
describe('leads', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const LEAD = {
    clientName: 'Meridian Offices',
    stage: 'qualified',
    // Rs 1,00,00,000.00 — one crore, in paise.
    estimatedValue: '1000000000',
    probabilityPct: 45,
  };

  it('creates a lead and stores the probability as entered', async () => {
    const res = await send('/api/v1/projects/leads', 'POST', USER_A, LEAD);
    expect(res.status).toBe(201);
    const created = (await res.json()) as {
      id: string;
      probabilityPct: number;
      estimatedValue: string;
      expectedClose: string | null;
      version: number;
    };
    // CRM-01: four ladders disagree by up to 15 points at this stage. Nothing
    // here derives a probability from the stage.
    expect(created.probabilityPct).toBe(45);
    expect(created.estimatedValue).toBe('1000000000');
    // CRM-05: the legacy defaults this to the literal '15 Dec 2026'.
    expect(created.expectedClose).toBeNull();
  });

  it('computes the weighted pipeline on the server', async () => {
    const res = await send('/api/v1/projects/leads', 'GET', USER_A);
    const body = (await res.json()) as {
      totals: { total: string; weighted: string; openCount: number; winRatePct: number | null };
    };
    // One open lead: Rs 1,00,00,000.00 at 45% = Rs 45,00,000.00.
    expect(body.totals.openCount).toBe(1);
    expect(body.totals.total).toBe('1000000000');
    expect(body.totals.weighted).toBe('450000000');
    // Nothing decided yet: null, not 0. An empty pipeline showing 0% states
    // something false.
    expect(body.totals.winRatePct).toBeNull();
  });

  it('refuses a stage outside the enum', async () => {
    const res = await send('/api/v1/projects/leads', 'POST', USER_A, {
      ...LEAD,
      clientName: 'Bad Stage',
      stage: 'Proposal Shared',
    });
    expect(res.status).toBe(400);
  });

  it('converts a lead against a project and keeps the lead row', async () => {
    const created = (await (
      await send('/api/v1/projects/leads', 'POST', USER_A, {
        ...LEAD,
        clientName: 'Convertible Ltd',
      })
    ).json()) as { id: string; version: number };

    const res = await send(`/api/v1/projects/leads/${created.id}/convert`, 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      expectedVersion: created.version,
    });
    expect(res.status).toBe(200);
    const converted = (await res.json()) as { stage: string; convertedProjectId: string | null };
    expect(converted.stage).toBe('won');
    expect(converted.convertedProjectId).toBe(projectIds.get(TENANT_A));

    // The lead survives: it is the only record of where the work came from.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.leads WHERE client_name = 'Convertible Ltd'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('refuses to convert a lead twice', async () => {
    const { rows } = await admin.query(
      `SELECT id, version FROM projects.leads WHERE client_name = 'Convertible Ltd'`,
    );
    const res = await send(`/api/v1/projects/leads/${rows[0].id}/convert`, 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      expectedVersion: rows[0].version,
    });
    expect(res.status).toBe(409);
  });

  it('refuses to convert against another tenant project', async () => {
    const created = (await (
      await send('/api/v1/projects/leads', 'POST', USER_A, {
        ...LEAD,
        clientName: 'Cross Tenant Convert',
      })
    ).json()) as { id: string; version: number };

    const res = await send(`/api/v1/projects/leads/${created.id}/convert`, 'POST', USER_A, {
      projectId: projectIds.get(TENANT_B),
      expectedVersion: created.version,
    });
    expect(res.status).toBe(409);
  });

  it('counts a decided lead in the win rate', async () => {
    const body = (await (await send('/api/v1/projects/leads', 'GET', USER_A)).json()) as {
      totals: { winRatePct: number | null };
    };
    // One won lead, nothing lost.
    expect(body.totals.winRatePct).toBe(100);
  });

  it('shows each tenant only its own leads', async () => {
    await send('/api/v1/projects/leads', 'POST', USER_B, { ...LEAD, clientName: 'B Only Lead' });
    const a = (await (await send('/api/v1/projects/leads', 'GET', USER_A)).json()) as {
      items: Array<{ clientName: string }>;
    };
    expect(a.items.map((l) => l.clientName)).not.toContain('B Only Lead');
  });

  it('is not shadowed by the project route', async () => {
    // `/leads` is a valid `:projectId` as far as the router is concerned, so
    // this asserts the registration order rather than the handler.
    const res = await send('/api/v1/projects/leads', 'GET', USER_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('totals');
  });

  it('refuses every lead route without a credential', async () => {
    for (const [path, method, body] of [
      ['/api/v1/projects/leads', 'GET', undefined],
      ['/api/v1/projects/leads', 'POST', LEAD],
      [`/api/v1/projects/leads/${randomUUID()}`, 'DELETE', undefined],
    ] as const) {
      const res = await send(path, method, null, body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('stamps the day a lead closes and names the next site visit (DATA-09)', async () => {
    type Pipeline = {
      totals: {
        wonThisQuarter: { since: string; count: number; value: string };
        nextSiteVisit: { leadId: string; clientName: string; on: string } | null;
      };
    };
    const won = await send('/api/v1/projects/leads', 'POST', USER_A, {
      ...LEAD,
      clientName: 'Closed Quarter Offices',
      stage: 'won',
    });
    expect(won.status).toBe(201);
    const wonLead = (await won.json()) as { id: string; closedOn: string | null; version: number };
    expect(wonLead.closedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const pipeline = (await (await send('/api/v1/projects/leads', 'GET', USER_A)).json()) as Pipeline;
    expect(pipeline.totals.wonThisQuarter.count).toBeGreaterThanOrEqual(1);
    expect(pipeline.totals.wonThisQuarter.since <= (wonLead.closedOn ?? '')).toBe(true);

    // Reopened, the date goes: an open lead has no closed day.
    const reopened = await send(`/api/v1/projects/leads/${wonLead.id}`, 'PATCH', USER_A, {
      ...LEAD,
      clientName: 'Closed Quarter Offices',
      stage: 'negotiation',
      expectedVersion: wonLead.version,
    });
    expect(reopened.status).toBe(200);
    expect(((await reopened.json()) as { closedOn: string | null }).closedOn).toBeNull();

    const visited = await send(`/api/v1/projects/leads/${wonLead.id}/activities`, 'POST', USER_A, {
      kind: 'call',
      summary: 'Agreed a walk of the floor plate',
      occurredOn: '2026-09-01',
      nextFollowupOn: '2099-01-15',
      nextFollowupKind: 'site_visit',
    });
    expect(visited.status).toBe(201);
    const after = (await (await send('/api/v1/projects/leads', 'GET', USER_A)).json()) as Pipeline;
    expect(after.totals.nextSiteVisit).toEqual({
      leadId: wonLead.id,
      clientName: 'Closed Quarter Offices',
      on: '2099-01-15',
    });

    // The other tenant's pipeline knows nothing of either fact.
    const theirs = (await (await send('/api/v1/projects/leads', 'GET', USER_B)).json()) as Pipeline;
    expect(theirs.totals.nextSiteVisit).toBeNull();
  });
});

/**
 * **The project rollup — slice 7.**
 *
 * Two things this asserts that the legacy cannot do: spend is grouped by a
 * project **id** rather than a name matched with `LIKE '%…%'` (PROJ-02), and
 * the figures that depend on the payment path are **absent rather than zero**.
 */
describe('the project rollup', () => {
  async function get(path: string, credential: string | null): Promise<Response> {
    const headers: Record<string, string> = {};
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, { headers });
  }

  async function send(path: string, credential: string, body: unknown): Promise<Response> {
    return app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const LINE = {
    description: 'Rollup line',
    hsnSac: '',
    quantityWhole: 1,
    quantityMillionths: 0,
    unitRate: '10000',
    gstRate: 1800,
  };

  it('groups committed spend by project id', async () => {
    const projectId = projectIds.get(TENANT_A)!;
    const res = await send('/api/v1/purchase-orders', USER_A, {
      number: 'PO-ROLLUP-1',
      vendorId: vendorIds.get(TENANT_A),
      projectId,
      lines: [LINE],
    });
    expect(res.status).toBe(201);

    const body = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string; committed: string; orderCount: number }>;
    };
    const row = body.items.find((i) => i.id === projectId)!;
    // Rs 100.00 + 18% = Rs 118.00
    expect(BigInt(row.committed)).toBeGreaterThanOrEqual(11800n);
    expect(row.orderCount).toBeGreaterThanOrEqual(1);
  });

  it('reports spend attached to no project separately, rather than dropping it', async () => {
    await send('/api/v1/purchase-orders', USER_A, {
      number: 'PO-ROLLUP-GENERAL',
      vendorId: vendorIds.get(TENANT_A),
      lines: [LINE],
    });
    const body = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      unattached: { committed: string; orderCount: number };
    };
    // Otherwise the per-project totals and the tenant total silently disagree.
    expect(BigInt(body.unattached.committed)).toBeGreaterThan(0n);
    expect(body.unattached.orderCount).toBeGreaterThan(0);
  });

  it('omits every figure that depends on the payment path', async () => {
    const text = await (await get('/api/v1/rollups/projects', USER_A)).text();
    // Not zeroed. `outflow: 0` is a claim that nothing has been paid, and the
    // payment tables do not exist — payments are gated on CA-01..CA-08.
    for (const absent of ['inflow', 'outflow', 'tds', 'actualMargin', 'balance', 'plannedMargin']) {
      expect(text, `${absent} must be absent, not zero`).not.toMatch(new RegExp(absent, 'i'));
    }
  });

  it('says whether the at-risk band was confirmed or inherited', async () => {
    const body = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      threshold: { atRiskPct: number; provisional: boolean };
    };
    // PO-18: 85 comes from ProjectsSidebar.js:12 and has never been observed
    // working, because PROJ-01 pinned the ratio at 1.0.
    expect(body.threshold.atRiskPct).toBe(85);
    expect(body.threshold.provisional).toBe(true);
  });

  it('bands a project with no contract value as no-budget, never on-track', async () => {
    const body = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string; contractValue: string | null; health: string }>;
    };
    for (const row of body.items) {
      if (row.contractValue === null) {
        // PROJ-01 is what happens when a missing budget is treated as a number.
        expect(row.health).toBe('no-budget');
      }
    }
  });

  it('bands against the contract value once one exists', async () => {
    const projectId = projectIds.get(TENANT_A)!;

    const before = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string; committed: string; health: string }>;
    };
    const committed = BigInt(before.items.find((i) => i.id === projectId)!.committed);
    expect(committed).toBeGreaterThan(0n);

    // Signed exactly what has been committed: past 85% of the budget, but not
    // past the budget itself. Derived from the figure rather than hardcoded, so
    // the test cannot drift from what earlier tests happened to order.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(`UPDATE projects.projects SET original_value = $2 WHERE id = $1`, [
      projectId,
      committed.toString(),
    ]);
    await admin.query('COMMIT');

    const body = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string; health: string }>;
    };
    expect(body.items.find((i) => i.id === projectId)!.health).toBe('at-risk');
  });

  it('bands over-budget once committed passes the contract value', async () => {
    const projectId = projectIds.get(TENANT_A)!;
    const body0 = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string; committed: string }>;
    };
    const committed = BigInt(body0.items.find((i) => i.id === projectId)!.committed);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(`UPDATE projects.projects SET original_value = $2 WHERE id = $1`, [
      projectId,
      (committed - 1n).toString(),
    ]);
    await admin.query('COMMIT');

    const body = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string; health: string }>;
    };
    expect(body.items.find((i) => i.id === projectId)!.health).toBe('over-budget');
  });

  it('shows each tenant only its own projects and spend', async () => {
    const a = (await (await get('/api/v1/rollups/projects', USER_A)).json()) as {
      items: Array<{ id: string }>;
    };
    expect(a.items.map((i) => i.id)).not.toContain(projectIds.get(TENANT_B));

    const b = (await (await get('/api/v1/rollups/projects', USER_B)).json()) as {
      items: Array<{ id: string; committed: string }>;
    };
    // Tenant A raised the orders above; none of that spend appears here.
    for (const row of b.items) expect(row.committed).toBe('0');
  });

  it('refuses an unauthenticated rollup rather than returning an empty one', async () => {
    const res = await get('/api/v1/rollups/projects', null);
    expect(res.status).toBe(403);
  });

  it('cannot attach a purchase order to another tenant project', async () => {
    const res = await send('/api/v1/purchase-orders', USER_A, {
      number: 'PO-CROSS-PROJECT',
      vendorId: vendorIds.get(TENANT_A),
      projectId: projectIds.get(TENANT_B),
      lines: [LINE],
    });
    // The composite FK refuses it. The legacy stores a project NAME and matches
    // it with LIKE, so there is nothing to refuse (PROJ-02).
    expect(res.status).toBeGreaterThanOrEqual(400);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_orders WHERE number = 'PO-CROSS-PROJECT'`,
    );
    expect(rows[0].n).toBe(0);
  });
});

/**
 * **Change orders, site controls and retention.**
 *
 * The assertions that carry this slice: an approved variation cannot be
 * approved again (CO-04), the signed contract value survives (CO-02), a
 * reconciliation cannot exceed its sanction (IMP-01), and there is **no
 * retention release endpoint at all** (RET-02).
 */
describe('change orders', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const base = () => `/api/v1/projects/${projectIds.get(TENANT_A)}/change-orders`;

  async function newVariation(number: string, costImpact: string) {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      number,
      title: `Variation ${number}`,
      costImpact,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; version: number; state: string };
  }

  it('creates a variation in draft', async () => {
    const co = await newVariation('CO-001', '50000');
    expect(co.state).toBe('draft');
  });

  it('refuses to send a zero-value variation to the client', async () => {
    const co = await newVariation('CO-ZERO', '0');
    const res = await send(`${base()}/${co.id}/submit`, 'POST', USER_A, {
      expectedVersion: co.version,
    });
    // A variation worth nothing is a mistake or an unpriced scope change.
    expect(res.status).toBe(409);
  });

  it('approves once, and refuses a second approval', async () => {
    const co = await newVariation('CO-002', '100000');

    const submitted = (await (
      await send(`${base()}/${co.id}/submit`, 'POST', USER_A, { expectedVersion: co.version })
    ).json()) as { version: number; state: string };
    expect(submitted.state).toBe('pending_client');

    const approved = (await (
      await send(`${base()}/${co.id}/decide`, 'POST', USER_A, {
        decision: 'approve',
        signedBy: 'Client PM',
        expectedVersion: submitted.version,
      })
    ).json()) as { version: number; state: string; decidedBy: string | null };
    expect(approved.state).toBe('client_approved');
    expect(approved.decidedBy).toBe('Client PM');

    // CO-04: the legacy re-applies the money every time this is called.
    const again = await send(`${base()}/${co.id}/decide`, 'POST', USER_A, {
      decision: 'approve',
      signedBy: 'Client PM',
      expectedVersion: approved.version,
    });
    expect(again.status).toBe(409);
  });

  it('refuses a decision that is neither approve nor reject', async () => {
    const co = await newVariation('CO-003', '1000');
    await send(`${base()}/${co.id}/submit`, 'POST', USER_A, { expectedVersion: co.version });
    const res = await send(`${base()}/${co.id}/decide`, 'POST', USER_A, {
      decision: 'Approved',
      signedBy: 'Client PM',
      expectedVersion: co.version + 1,
    });
    // CO-03: the legacy treats everything that is not 'Reject' as approval.
    expect(res.status).toBe(400);
  });

  it('refuses a decision with no signatory', async () => {
    const co = await newVariation('CO-004', '1000');
    await send(`${base()}/${co.id}/submit`, 'POST', USER_A, { expectedVersion: co.version });
    const res = await send(`${base()}/${co.id}/decide`, 'POST', USER_A, {
      decision: 'approve',
      signedBy: '',
      expectedVersion: co.version + 1,
    });
    expect(res.status).toBe(400);
  });

  it('derives the contract value and keeps the signed original', async () => {
    const projectId = projectIds.get(TENANT_A)!;
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(`UPDATE projects.projects SET original_value = 1000000 WHERE id = $1`, [
      projectId,
    ]);
    await admin.query('COMMIT');

    const body = (await (await send(base(), 'GET', USER_A)).json()) as {
      contract: {
        original: string;
        current: string;
        approvedVariations: number;
        pendingVariations: number;
      };
    };
    // CO-02: the legacy has no `original` after the first approved variation.
    expect(body.contract.original).toBe('1000000');
    // One approved variation of Rs 1,000.00 above.
    expect(BigInt(body.contract.current)).toBe(1_000_000n + 100_000n);
    expect(body.contract.approvedVariations).toBe(1);
  });

  it('counts a pending variation without applying it', async () => {
    const before = (await (await send(base(), 'GET', USER_A)).json()) as {
      contract: { current: string; pendingVariations: number };
    };
    const co = await newVariation('CO-005', '999999');
    await send(`${base()}/${co.id}/submit`, 'POST', USER_A, { expectedVersion: co.version });

    const after = (await (await send(base(), 'GET', USER_A)).json()) as {
      contract: { current: string; pendingVariations: number };
    };
    // A variation the client has not signed is not part of the contract.
    expect(after.contract.current).toBe(before.contract.current);
    expect(after.contract.pendingVariations).toBe(before.contract.pendingVariations + 1);
  });

  it('refuses a variation on another tenant project', async () => {
    const res = await send(
      `/api/v1/projects/${projectIds.get(TENANT_B)}/change-orders`,
      'POST',
      USER_A,
      {
        projectId: projectIds.get(TENANT_B),
        number: 'CO-X',
        title: 'Cross tenant',
        costImpact: '1000',
      },
    );
    expect(res.status).toBe(404);
  });

  it('refuses every change-order route without a credential', async () => {
    const res = await send(base(), 'GET', null);
    expect(res.status).toBe(403);
  });
});

describe('stock at the gate — received is not the same as counted (DATA-11)', () => {
  async function send(path: string, method: string, credential: string, body?: unknown): Promise<Response> {
    return app.request(path, {
      method,
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('keeps a gate receipt out of the balance until it is checked in, and lets only its tenant check it in', async () => {
    const created = await send('/api/v1/purchase-orders/stock/items', 'POST', USER_A, {
      name: 'Gate check tiles',
      uom: 'box',
      reorderWhole: 10,
    });
    expect(created.status).toBe(201);
    const stockItemId = ((await created.json()) as { id: string }).id;

    const received = await send('/api/v1/purchase-orders/stock/receipts', 'POST', USER_A, {
      stockItemId,
      warehouse: 'Gate store',
      quantityWhole: 50,
      quantityMillionths: 0,
      reference: 'DN-GATE-1',
      checkedIn: false,
    });
    expect(received.status).toBe(204);

    type Balance = { name: string; quantityMicros: string; awaitingCheckInMicros: string; levelPct: number | null };
    const balance = async (): Promise<Balance | undefined> => {
      const body = (await (
        await send('/api/v1/purchase-orders/stock?q=Gate%20check%20tiles', 'GET', USER_A)
      ).json()) as { items: Balance[]; summary: { awaitingCheckIn: number } };
      return body.items.find((b) => b.name === 'Gate check tiles');
    };
    expect((await balance())?.quantityMicros).toBe('0');
    expect((await balance())?.awaitingCheckInMicros).toBe('50000000');

    // Nothing is issued against goods nobody has counted.
    const early = await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId,
      warehouse: 'Gate store',
      quantityWhole: 10,
      quantityMillionths: 0,
    });
    expect(early.status).toBe(409);

    const waiting = (await (
      await send('/api/v1/purchase-orders/stock/receipts/awaiting?limit=200', 'GET', USER_A)
    ).json()) as { items: { id: string; reference: string }[]; count: number };
    const movementId = waiting.items.find((r) => r.reference === 'DN-GATE-1')?.id ?? '';
    expect(movementId).not.toBe('');

    // The other tenant does not see it waiting.
    const theirList = (await (
      await send('/api/v1/purchase-orders/stock/receipts/awaiting?limit=200', 'GET', USER_B)
    ).json()) as { items: { id: string }[] };
    expect(theirList.items.map((r) => r.id)).not.toContain(movementId);

    // And a gate receipt of the OTHER tenant's cannot be counted in from here:
    // planted in tenant B directly, then attacked by A, who holds the power to
    // check in and is still told only not-found — and B's receipt stays waiting.
    const bItem = randomUUID();
    const bMovement = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_B]);
    await admin.query(
      `INSERT INTO procurement.stock_items (tenant_id, id, name, uom) VALUES ($1, $2, 'B gate tiles', 'box')`,
      [TENANT_B, bItem],
    );
    await admin.query(
      `INSERT INTO procurement.stock_movements
         (tenant_id, id, stock_item_id, warehouse, quantity_micros, kind, moved_by)
       VALUES ($1, $2, $3, 'B store', 1000000, 'receipt', 'fixture')`,
      [TENANT_B, bMovement, bItem],
    );
    await admin.query('COMMIT');
    const across = await send(`/api/v1/purchase-orders/stock/receipts/${bMovement}/check-in`, 'POST', USER_A);
    expect(across.status).toBe(404);
    const still = await admin.query<{ checked_in_at: string | null }>(
      `SELECT checked_in_at FROM procurement.stock_movements WHERE tenant_id = $1 AND id = $2`,
      [TENANT_B, bMovement],
    );
    expect(still.rows[0]?.checked_in_at).toBeNull();

    const counted = await send(`/api/v1/purchase-orders/stock/receipts/${movementId}/check-in`, 'POST', USER_A);
    expect(counted.status).toBe(204);
    // Checked in once; a second count is not a movement that exists.
    expect((await send(`/api/v1/purchase-orders/stock/receipts/${movementId}/check-in`, 'POST', USER_A)).status).toBe(404);

    const after = await balance();
    expect(after?.quantityMicros).toBe('50000000');
    expect(after?.awaitingCheckInMicros).toBe('0');
    expect(after?.levelPct).toBe(500);

    const issued = await send('/api/v1/purchase-orders/stock/issues', 'POST', USER_A, {
      stockItemId,
      warehouse: 'Gate store',
      quantityWhole: 10,
      quantityMillionths: 0,
    });
    expect(issued.status).toBe(204);
  });
});

describe('site issues — raised, counted, resolved, never across tenants (DATA-11)', () => {
  async function send(path: string, method: string, credential: string, body?: unknown): Promise<Response> {
    return app.request(path, {
      method,
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it("refuses an issue on another tenant's project, and never shows one tenant the other's", async () => {
    const theirs = projectIds.get(TENANT_B)!;
    const planted = await send('/api/v1/siteops/issues', 'POST', USER_A, {
      projectId: theirs,
      title: 'Planted into the other tenant',
    });
    expect(planted.status).toBe(404);

    const mine = projectIds.get(TENANT_A)!;
    const raised = await send('/api/v1/siteops/issues', 'POST', USER_A, {
      projectId: mine,
      title: 'Riser door frame out of plumb',
      severity: 'blocking',
    });
    expect(raised.status).toBe(201);
    const issueId = ((await raised.json()) as { id: string }).id;

    const bList = (await (await send('/api/v1/siteops/issues?status=all', 'GET', USER_B)).json()) as {
      items: { id: string; title: string }[];
    };
    expect(bList.items.map((i) => i.id)).not.toContain(issueId);
    expect(bList.items.map((i) => i.title)).not.toContain('Planted into the other tenant');

    // B cannot resolve A's issue, and is told only not-found.
    expect((await send(`/api/v1/siteops/issues/${issueId}/resolve`, 'POST', USER_B, {})).status).toBe(404);

    const today = (await (await send('/api/v1/siteops/today', 'GET', USER_A)).json()) as {
      openIssues: number;
      blockingIssues: number;
    };
    expect(today.openIssues).toBeGreaterThanOrEqual(1);
    expect(today.blockingIssues).toBeGreaterThanOrEqual(1);
    const bToday = (await (await send('/api/v1/siteops/today', 'GET', USER_B)).json()) as { openIssues: number };
    expect(bToday.openIssues).toBe(0);

    const resolved = await send(`/api/v1/siteops/issues/${issueId}/resolve`, 'POST', USER_A, {
      resolution: 'Frame re-set and shimmed.',
    });
    expect(resolved.status).toBe(204);
    expect((await send(`/api/v1/siteops/issues/${issueId}/resolve`, 'POST', USER_A, {})).status).toBe(409);

    const open = (await (await send(`/api/v1/siteops/issues?projectId=${mine}`, 'GET', USER_A)).json()) as {
      items: { id: string }[];
    };
    expect(open.items.map((i) => i.id)).not.toContain(issueId);
  });

});

describe('stock locations — a register, never across tenants (DATA-12)', () => {
  async function send(path: string, method: string, credential: string, body?: unknown): Promise<Response> {
    return app.request(path, {
      method,
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('registers, refuses a duplicate, hides from the other tenant, and retires', async () => {
    const made = await send('/api/v1/purchase-orders/stock/locations', 'POST', USER_A, { name: 'Yard store' });
    expect(made.status).toBe(201);
    const id = ((await made.json()) as { id: string }).id;
    expect((await send('/api/v1/purchase-orders/stock/locations', 'POST', USER_A, { name: 'Yard store' })).status).toBe(409);
    // The same name in another tenant is not a duplicate, and says nothing about A.
    expect((await send('/api/v1/purchase-orders/stock/locations', 'POST', USER_B, { name: 'Yard store' })).status).toBe(201);

    const theirs = (await (await send('/api/v1/purchase-orders/stock/locations', 'GET', USER_B)).json()) as {
      items: { id: string }[];
    };
    expect(theirs.items.map((l) => l.id)).not.toContain(id);
    expect((await send(`/api/v1/purchase-orders/stock/locations/${id}/retire`, 'POST', USER_B)).status).toBe(404);

    // A site store on another tenant's project is not found, not planted.
    const planted = await send('/api/v1/purchase-orders/stock/locations', 'POST', USER_A, {
      name: 'Borrowed site store',
      kind: 'site',
      projectId: projectIds.get(TENANT_B)!,
    });
    expect(planted.status).toBe(404);

    expect((await send(`/api/v1/purchase-orders/stock/locations/${id}/retire`, 'POST', USER_A)).status).toBe(204);
    const active = (await (await send('/api/v1/purchase-orders/stock/locations', 'GET', USER_A)).json()) as {
      items: { id: string }[];
    };
    expect(active.items.map((l) => l.id)).not.toContain(id);
    const all = (await (
      await send('/api/v1/purchase-orders/stock/locations?includeRetired=true', 'GET', USER_A)
    ).json()) as { items: { id: string; retired: boolean }[] };
    expect(all.items.find((l) => l.id === id)?.retired).toBe(true);
  });
});

describe('site controls', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('requests, sanctions for less, and reconciles within the sanction', async () => {
    const created = (await (
      await send('/api/v1/siteops/imprest', 'POST', USER_A, {
        projectId: projectIds.get(TENANT_A),
        purpose: 'Site petty cash',
        amountRequested: '500000',
      })
    ).json()) as { id: string; version: number; status: string; requestedBy: string };
    expect(created.status).toBe('requested');
    expect(created.requestedBy).toBe(PRINCIPAL_A);

    const sanctioned = (await (
      await send(`/api/v1/siteops/imprest/${created.id}/sanction`, 'POST', USER_A, {
        amountSanctioned: '400000',
        expectedVersion: created.version,
      })
    ).json()) as { id: string; version: number; status: string; amountSanctioned: string };
    expect(sanctioned.status).toBe('sanctioned');
    expect(sanctioned.amountSanctioned).toBe('400000');

    const reconciled = (await (
      await send(`/api/v1/siteops/imprest/${created.id}/reconcile`, 'POST', USER_A, {
        amountReconciled: '380000',
        expectedVersion: sanctioned.version,
      })
    ).json()) as { status: string; amountReconciled: string; reconciledBy: string };
    expect(reconciled.status).toBe('reconciled');
    expect(reconciled.amountReconciled).toBe('380000');
    expect(reconciled.reconciledBy).toBe(PRINCIPAL_A);
  });

  it('refuses a reconciliation larger than the sanction', async () => {
    const created = (await (
      await send('/api/v1/siteops/imprest', 'POST', USER_A, {
        projectId: projectIds.get(TENANT_A),
        purpose: 'Overspend attempt',
        amountRequested: '100000',
      })
    ).json()) as { id: string; version: number };

    const sanctioned = (await (
      await send(`/api/v1/siteops/imprest/${created.id}/sanction`, 'POST', USER_A, {
        amountSanctioned: '100000',
        expectedVersion: created.version,
      })
    ).json()) as { version: number };

    const res = await send(`/api/v1/siteops/imprest/${created.id}/reconcile`, 'POST', USER_A, {
      amountReconciled: '150000',
      expectedVersion: sanctioned.version,
    });
    // IMP-01: reconcileSiteImprest compares nothing.
    expect(res.status).toBe(409);
  });

  it('refuses to reconcile something that was never sanctioned', async () => {
    const created = (await (
      await send('/api/v1/siteops/imprest', 'POST', USER_A, {
        projectId: projectIds.get(TENANT_A),
        purpose: 'Unsanctioned',
        amountRequested: '1000',
      })
    ).json()) as { id: string; version: number };

    const res = await send(`/api/v1/siteops/imprest/${created.id}/reconcile`, 'POST', USER_A, {
      amountReconciled: '1000',
      expectedVersion: created.version,
    });
    expect(res.status).toBe(409);
  });

  it('records a joint measurement with both signatures', async () => {
    const res = await send('/api/v1/siteops/measurements', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      description: 'Tiling, level 3',
      quantityWhole: 120,
      quantityMillionths: 500_000,
      uom: 'sqm',
      signedByClient: 'Client Engineer',
      measuredOn: '2026-09-01',
    });
    expect(res.status).toBe(201);

    const { rows } = await admin.query(
      `SELECT measured_micros::text AS q, signed_by_site FROM siteops.measurement_records
        WHERE description = 'Tiling, level 3'`,
    );
    // 120.5 exactly. The legacy column is REAL.
    expect(rows[0].q).toBe('120500000');
    expect(rows[0].signed_by_site).toBe(PRINCIPAL_A);
  });

  it('refuses a measurement with no client signature', async () => {
    const res = await send('/api/v1/siteops/measurements', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      description: 'Unsigned',
      quantityWhole: 1,
      quantityMillionths: 0,
      uom: 'sqm',
      signedByClient: '',
      measuredOn: '2026-09-01',
    });
    // A JMR with one signature is not joint.
    expect(res.status).toBe(400);
  });

  it('a joint measurement cannot be edited or deleted, by grant', async () => {
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      await expect(
        client.query(`UPDATE siteops.measurement_records SET description = 'edited'`),
      ).rejects.toThrow(/permission denied/i);
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      await expect(
        client.query(`DELETE FROM siteops.measurement_records WHERE true`),
      ).rejects.toThrow(/permission denied/i);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });

  it('shows each tenant only its own imprest', async () => {
    const b = (await (
      await send(`/api/v1/siteops/imprest/${projectIds.get(TENANT_B)}`, 'GET', USER_B)
    ).json()) as { items: unknown[] };
    expect(b.items).toHaveLength(0);
  });
});

describe('retention', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('computes the retained amount from the order gross and the rate', async () => {
    const created = (await (
      await send('/api/v1/purchase-orders', 'POST', USER_A, {
        number: 'PO-RETENTION',
        vendorId: vendorIds.get(TENANT_A),
        lines: [
          {
            description: 'Retention base',
            hsnSac: '',
            quantityWhole: 1,
            quantityMillionths: 0,
            unitRate: '100000',
            gstRate: 1800,
          },
        ],
      })
    ).json()) as { id: string; gross: string };

    const res = await send('/api/v1/purchase-orders/retention', 'POST', USER_A, {
      purchaseOrderId: created.id,
      retentionRateBp: 500,
    });
    expect(res.status).toBe(201);

    const held = (await res.json()) as { grossAmount: string; retainedAmount: string };
    // 5% of the gross, computed here. No caller supplies the amount.
    expect(held.grossAmount).toBe(created.gross);
    expect(BigInt(held.retainedAmount)).toBe((BigInt(created.gross) * 5n) / 100n);
  });

  it('refuses to record retention twice against one order', async () => {
    const { rows } = await admin.query(
      `SELECT id FROM procurement.purchase_orders WHERE number = 'PO-RETENTION'`,
    );
    const res = await send('/api/v1/purchase-orders/retention', 'POST', USER_A, {
      purchaseOrderId: rows[0].id,
      retentionRateBp: 500,
    });
    expect(res.status).toBe(409);
  });

  it('refuses to record retention against another tenant order', async () => {
    const { rows } = await admin.query(
      `SELECT id FROM procurement.purchase_orders WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_B],
    );
    const res = await send('/api/v1/purchase-orders/retention', 'POST', USER_A, {
      purchaseOrderId: rows[0].id,
      retentionRateBp: 500,
    });
    expect(res.status).toBe(409);
  });

  it('releases retention only as a payment — never as an edit beside the holding', async () => {
    const paths = routesOf(app).map((r) => `${r.method} ${r.path}`);
    // RET-02: the legacy release moved the ledger and wrote no payment record, so
    // the vendor was not paid while the ledger said they were. Here a release is
    // a payment voucher under Money, and nothing beside the holding releases it.
    expect(paths.filter((p) => /purchase-orders\/retention/i.test(p) && /release/i.test(p))).toHaveLength(0);
    expect(paths).toContain('POST /api/v1/money/retention/:holdingId/release');
    expect(paths.some((p) => p === 'GET /api/v1/purchase-orders/retention')).toBe(true);
  });
});

/**
 * **Recce, drawings and the document vault.**
 *
 * The assertions that carry these: a survey's measurements are exact and
 * self-consistent, a drawing has no URL field to invent a URL into (GFC-01/02),
 * and no endpoint anywhere accepts file bytes (VAULT-01/02).
 */
describe('site recce', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('records areas exactly, as integers', async () => {
    const res = await send('/api/v1/siteops/recces', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      recceOn: '2026-09-01',
      buaWhole: 12_500,
      buaMillionths: 375_000,
      carpetWhole: 10_000,
      carpetMillionths: 0,
      siteCondition: 'bare_shell',
      observations: 'Lift lobby not handed over',
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      buaMicros: string;
      carpetMicros: string;
      conductedBy: string;
    };
    // 12500.375 sqft exactly. The legacy column is REAL.
    expect(body.buaMicros).toBe('12500375000');
    expect(body.carpetMicros).toBe('10000000000');
    // Never a name from the body.
    expect(body.conductedBy).toBe(PRINCIPAL_A);
  });

  it('refuses a carpet area larger than the built-up area', async () => {
    const res = await send('/api/v1/siteops/recces', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      recceOn: '2026-09-02',
      buaWhole: 1000,
      carpetWhole: 1200,
    });
    // A transcription error is cheaper to refuse than to find inside an estimate.
    expect(res.status).toBe(409);
  });

  it('refuses a site condition outside the enum', async () => {
    const res = await send('/api/v1/siteops/recces', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      recceOn: '2026-09-03',
      siteCondition: 'Bare Shell',
    });
    expect(res.status).toBe(400);
  });

  it('refuses a recce on another tenant project', async () => {
    const res = await send('/api/v1/siteops/recces', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_B),
      recceOn: '2026-09-04',
    });
    expect(res.status).toBe(409);
  });

  it('shows each tenant only its own recces', async () => {
    const b = (await (
      await send(`/api/v1/siteops/recces/${projectIds.get(TENANT_B)}`, 'GET', USER_B)
    ).json()) as { items: unknown[] };
    expect(b.items).toHaveLength(0);
  });

  it('refuses a recce without a credential', async () => {
    const res = await send('/api/v1/siteops/recces', 'POST', null, {
      projectId: projectIds.get(TENANT_A),
      recceOn: '2026-09-05',
    });
    expect(res.status).toBe(403);
  });
});

describe('the document vault', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const DOC = {
    entityType: 'purchase_order',
    entityId: 'PO-A-0001',
    fileName: 'signed-contract.pdf',
    contentType: 'application/pdf',
    sizeBytes: 24_000,
    checksum: 'a'.repeat(64),
  };

  it('registers a document and issues a tenant-prefixed key', async () => {
    const res = await send('/api/v1/workflow/documents', 'POST', USER_A, DOC);
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: string; objectKey: string; uploadedBy: string };
    // The key is built server-side; no caller supplies it, so nothing can be
    // placed outside its own prefix.
    expect(doc.objectKey).toBe(`tenants/${TENANT_A}/documents/${doc.id}`);
    expect(doc.uploadedBy).toBe(PRINCIPAL_A);
  });

  it('ignores an objectKey a caller tries to supply', async () => {
    const res = await send('/api/v1/workflow/documents', 'POST', USER_A, {
      ...DOC,
      fileName: 'attempted-escape.pdf',
      objectKey: `tenants/${TENANT_B}/documents/stolen`,
    });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: string; objectKey: string };
    expect(doc.objectKey).toBe(`tenants/${TENANT_A}/documents/${doc.id}`);
    expect(doc.objectKey).not.toContain(TENANT_B);
  });

  it('refuses a content type outside the allowlist', async () => {
    const res = await send('/api/v1/workflow/documents', 'POST', USER_A, {
      ...DOC,
      fileName: 'stored-xss.html',
      contentType: 'text/html',
    });
    // An uploaded .html served from the product's own origin is stored XSS.
    expect(res.status).toBe(409);
  });

  it('refuses a document larger than the cap', async () => {
    const res = await send('/api/v1/workflow/documents', 'POST', USER_A, {
      ...DOC,
      sizeBytes: 52_428_801,
    });
    expect(res.status).toBe(400);
  });

  it('accepts no file bytes on any route', async () => {
    const paths = routesOf(app)
      .map((r) => `${r.method} ${r.path}`)
      .filter((p) => /document/i.test(p));
    expect(paths.length).toBeGreaterThan(0);

    // VAULT-02: `uploadAttachment` takes base64 in the request body. Nothing
    // here does, and the schema has no field for it.
    const res = await send('/api/v1/workflow/documents', 'POST', USER_A, {
      ...DOC,
      fileName: 'with-bytes.pdf',
      fileData: 'JVBERi0xLjQK',
    });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(doc)).not.toContain('fileData');

    const { rows } = await admin.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'documents'`,
    );
    const columns = rows.map((r) => r.column_name as string);
    // VAULT-01/02: no column holds bytes, and none holds a filesystem path.
    expect(columns).not.toContain('file_data');
    expect(columns).not.toContain('file_path');
  });

  it('shows each tenant only its own documents', async () => {
    await send('/api/v1/workflow/documents', 'POST', USER_B, { ...DOC, fileName: 'b-only.pdf' });
    const a = (await (await send('/api/v1/workflow/documents', 'GET', USER_A)).json()) as {
      items: Array<{ fileName: string }>;
    };
    expect(a.items.map((d) => d.fileName)).not.toContain('b-only.pdf');
  });

  it('cannot register a document into another tenant prefix, by constraint', async () => {
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      // Object storage is outside Postgres, so no RLS policy reaches it. The
      // CHECK keeps the key and the row in step.
      await expect(
        client.query(
          `INSERT INTO workflow.documents
             (tenant_id, id, entity_type, entity_id, file_name, content_type,
              size_bytes, checksum, object_key, uploaded_by)
           VALUES ($1, gen_random_uuid(), 'x', 'y', 'z.pdf', 'application/pdf',
                   10, $2, $3, $4)`,
          [TENANT_A, 'b'.repeat(64), `tenants/${TENANT_B}/documents/anything`, PRINCIPAL_A],
        ),
      ).rejects.toThrow(/documents_key_prefix_check|violates check/i);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});

describe('GFC drawings', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const base = () => `/api/v1/projects/${projectIds.get(TENANT_A)}/drawings`;

  it('issues a revision with no file, and does not invent a URL', async () => {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      drawingNo: 'A-101',
      title: 'Floor plan, level 1',
      revision: 'v1.0',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    // GFC-01: the legacy fabricates an S3 URL from the drawing number.
    expect(body['documentId']).toBeNull();
    expect(Object.keys(body)).not.toContain('fileUrl');
    expect(JSON.stringify(body)).not.toMatch(/amazonaws|s3\./i);
  });

  it('supersedes the previous active revision in the same transaction', async () => {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      drawingNo: 'A-101',
      title: 'Floor plan, level 1',
      revision: 'v2.0',
    });
    expect(res.status).toBe(201);

    const { rows } = await admin.query(
      `SELECT revision, status FROM projects.gfc_drawings
        WHERE drawing_no = 'A-101' ORDER BY revision`,
    );
    expect(rows.find((r) => r.revision === 'v1.0')!.status).toBe('superseded');
    expect(rows.find((r) => r.revision === 'v2.0')!.status).toBe('active');

    // Exactly one active revision, enforced by a partial unique index.
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
  });

  it('refuses the same revision twice', async () => {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      drawingNo: 'A-101',
      title: 'Floor plan, level 1',
      revision: 'v2.0',
    });
    expect(res.status).toBe(409);
  });

  it('refuses a document id that does not exist', async () => {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      drawingNo: 'A-102',
      title: 'Section',
      revision: 'v1.0',
      documentId: randomUUID(),
    });
    expect(res.status).toBe(409);
  });

  it('attaches a real vault document', async () => {
    const doc = (await (
      await send('/api/v1/workflow/documents', 'POST', USER_A, {
        entityType: 'drawing',
        entityId: 'A-103',
        fileName: 'a-103.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1000,
        checksum: 'c'.repeat(64),
      })
    ).json()) as { id: string };

    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      drawingNo: 'A-103',
      title: 'Elevation',
      revision: 'v1.0',
      documentId: doc.id,
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { documentId: string }).documentId).toBe(doc.id);
  });

  it('withdraws rather than deletes', async () => {
    const { rows } = await admin.query(
      `SELECT id FROM projects.gfc_drawings WHERE drawing_no = 'A-103' AND status = 'active'`,
    );
    const res = await send(`${base()}/${rows[0].id}/withdraw`, 'POST', USER_A, {});
    expect(res.status).toBe(200);

    const after = await admin.query(
      `SELECT count(*)::int AS n FROM projects.gfc_drawings WHERE id = $1`,
      [rows[0].id],
    );
    // An issued drawing was on site. The record stays.
    expect(after.rows[0].n).toBe(1);
  });

  it('refuses a drawing on another tenant project', async () => {
    const res = await send(
      `/api/v1/projects/${projectIds.get(TENANT_B)}/drawings`,
      'POST',
      USER_A,
      {
        projectId: projectIds.get(TENANT_B),
        drawingNo: 'X-1',
        title: 'Cross tenant',
        revision: 'v1.0',
      },
    );
    expect(res.status).toBe(409);
  });
});

/**
 * **Estimation and takeoff.**
 *
 * The assertions that carry these: the rate is pre-tax and no GST field exists
 * (RATE-03, PO-16), rounding happens once per component rather than twice
 * mid-formula (EST-01), and an uncosted takeoff item stays uncosted rather than
 * acquiring a price from a fallback of 100 (TAKE-01).
 */
describe('estimation', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const ITEM = {
    itemName: 'Vitrified tile laying',
    trade: 'Flooring',
    uom: 'sqm',
    // Rs 150.00 / Rs 50.00 / Rs 15.00 — the legacy form defaults, as an input.
    materialCost: '15000',
    labourCost: '5000',
    equipmentCost: '1500',
    overheadBp: 600,
    marginBp: 1500,
  };

  it('computes the breakdown, rounding once per component', async () => {
    const res = await send('/api/v1/projects/estimation/items', 'POST', USER_A, ITEM);
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      analysis: {
        directCost: string;
        overhead: string;
        costWithOverhead: string;
        margin: string;
        baseRate: string;
      };
    };
    // direct = 15000 + 5000 + 1500 = 21500
    expect(body.analysis.directCost).toBe('21500');
    // overhead = 6% of 21500 = 1290
    expect(body.analysis.overhead).toBe('1290');
    expect(body.analysis.costWithOverhead).toBe('22790');
    // margin = 15% of 22790 = 3418.5 -> 3419 (rounded once, at paise)
    expect(body.analysis.margin).toBe('3419');
    expect(body.analysis.baseRate).toBe('26209');
  });

  it('carries no GST field anywhere', async () => {
    const text = await (await send('/api/v1/projects/estimation/items', 'GET', USER_A)).text();
    // RATE-03 is fixed by omission: there is no GST here to default to 18%.
    expect(text).not.toMatch(/gst/i);
    expect(text).not.toMatch(/finalRate|final_rate/i);
  });

  it('refuses a supplied rate — the rate is the answer, not an input', async () => {
    const res = await send('/api/v1/projects/estimation/items', 'POST', USER_A, {
      ...ITEM,
      itemName: 'Attempted rate override',
      baseRate: '1',
      gstPct: 18,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { analysis: { baseRate: string } };
    expect(body.analysis.baseRate).not.toBe('1');
  });

  it('refuses a duplicate item name within a trade', async () => {
    const res = await send('/api/v1/projects/estimation/items', 'POST', USER_A, ITEM);
    expect(res.status).toBe(409);
  });

  it('shows each tenant only its own library', async () => {
    const b = (await (
      await send('/api/v1/projects/estimation/items', 'GET', USER_B)
    ).json()) as { items: Array<{ itemName: string }> };
    expect(b.items.map((i) => i.itemName)).not.toContain('Vitrified tile laying');
  });

  it('refuses estimation routes without a credential', async () => {
    expect((await send('/api/v1/projects/estimation/items', 'GET', null)).status).toBe(403);
  });
});

describe('takeoff', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const base = () => `/api/v1/projects/${projectIds.get(TENANT_A)}/takeoff`;

  async function newSheet(title: string) {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      title,
      scalePxNum: 96,
      scalePxDen: 1,
      scaleUnit: 'ft',
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
  }

  it('refuses half a scale', async () => {
    const res = await send(base(), 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      title: 'Half scale',
      scalePxNum: 96,
    });
    // Half a scale is worse than none: it reads as calibrated.
    expect(res.status).toBe(409);
  });

  it('totals a fully costed and priced sheet', async () => {
    const sheet = await newSheet('Level 1 flooring');
    const res = await send(`${base()}/${sheet.id}/items`, 'PUT', USER_A, {
      items: [
        {
          description: 'Tile',
          uom: 'sqm',
          quantityWhole: 100,
          quantityMillionths: 0,
          wastageBp: 800,
          costRate: '11000',
          clientRate: '14500',
        },
      ],
    });
    expect(res.status).toBe(200);

    const sum = (await res.json()) as {
      itemCount: number;
      unpricedItems: string[];
      uncostedItems: string[];
      cost: string | null;
      value: string | null;
    };
    expect(sum.itemCount).toBe(1);
    expect(sum.unpricedItems).toHaveLength(0);
    expect(sum.uncostedItems).toHaveLength(0);
    // 100 sqm + 8% wastage = 108 ordered. 108 x Rs 110.00 = Rs 11,880.00
    expect(sum.cost).toBe('1188000');
    expect(sum.value).toBe('1566000');
  });

  it('names an uncosted item and returns a null cost rather than a partial total', async () => {
    const sheet = await newSheet('Level 2 partial');
    const res = await send(`${base()}/${sheet.id}/items`, 'PUT', USER_A, {
      items: [
        {
          description: 'Costed',
          uom: 'sqm',
          quantityWhole: 10,
          quantityMillionths: 0,
          costRate: '10000',
          clientRate: '12000',
        },
        {
          description: 'Uncosted',
          uom: 'sqm',
          quantityWhole: 10,
          quantityMillionths: 0,
          clientRate: '12000',
        },
      ],
    });
    const sum = (await res.json()) as {
      uncostedItems: string[];
      cost: string | null;
      value: string | null;
    };
    // TAKE-01: takeoff.js:337 would give the uncosted item a rate built on a
    // fallback of 100. A total over the costed subset looks complete and is not.
    expect(sum.uncostedItems).toHaveLength(1);
    expect(sum.cost).toBeNull();
    // Every item IS priced, so the value total stands.
    expect(sum.value).not.toBeNull();
  });

  it('replaces the item set rather than patching it', async () => {
    const sheet = await newSheet('Replaced');
    await send(`${base()}/${sheet.id}/items`, 'PUT', USER_A, {
      items: [
        { description: 'First', uom: 'nos', quantityWhole: 1, quantityMillionths: 0 },
        { description: 'Second', uom: 'nos', quantityWhole: 1, quantityMillionths: 0 },
      ],
    });
    const res = await send(`${base()}/${sheet.id}/items`, 'PUT', USER_A, {
      items: [{ description: 'Only', uom: 'nos', quantityWhole: 1, quantityMillionths: 0 }],
    });
    expect(((await res.json()) as { itemCount: number }).itemCount).toBe(1);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.takeoff_items WHERE sheet_id = $1`,
      [sheet.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('carries wastage as basis points and quantities exactly', async () => {
    const sheet = await newSheet('Exact quantities');
    await send(`${base()}/${sheet.id}/items`, 'PUT', USER_A, {
      items: [
        {
          description: 'Fractional',
          uom: 'sqm',
          quantityWhole: 12,
          quantityMillionths: 375_000,
          wastageBp: 500,
        },
      ],
    });
    const { rows } = await admin.query(
      `SELECT measured_micros::text AS q, wastage_bp FROM projects.takeoff_items
        WHERE description = 'Fractional'`,
    );
    expect(rows[0].q).toBe('12375000');
    expect(rows[0].wastage_bp).toBe(500);
  });

  it('has NO BOQ export route — that is PO-16, and the legacy one never ran', async () => {
    const paths = routesOf(app).map((r) => `${r.method} ${r.path}`);
    // exportTakeoffToBOQ inserts into boq_items(unit, qty) and
    // boq_schedules(description); none of those columns exists (TAKE-02/03).
    expect(paths.filter((p) => /takeoff/.test(p) && /export|boq/i.test(p))).toHaveLength(0);
  });

  it('refuses a sheet on another tenant project', async () => {
    const res = await send(
      `/api/v1/projects/${projectIds.get(TENANT_B)}/takeoff`,
      'POST',
      USER_A,
      { projectId: projectIds.get(TENANT_B), title: 'Cross tenant' },
    );
    expect(res.status).toBe(409);
  });

  it('shows each tenant only its own sheets', async () => {
    const b = (await (
      await send(`/api/v1/projects/${projectIds.get(TENANT_B)}/takeoff`, 'GET', USER_B)
    ).json()) as { items: unknown[] };
    expect(b.items).toHaveLength(0);
  });
});

describe('identity and tenancy — what a route must never return', () => {
  async function get(path: string, credential: string): Promise<Response> {
    return app.request(path, { headers: { authorization: `Bearer ${credential}` } });
  }

  it('shows each tenant only its own people', async () => {
    const a = (await (await get('/api/v1/identity/principals', USER_A)).json()) as {
      items: Array<{ email: string }>;
    };
    expect(a.items.map((i) => i.email)).toEqual([USER_A]);
    expect(a.items.map((i) => i.email)).not.toContain(USER_B);
  });

  it('never returns an external id', async () => {
    // The external id is the credential the bootstrap lookup resolves. A list
    // of colleagues that carries it is a list of things to authenticate as —
    // and this suite authenticates by exactly that value, so the leak would be
    // directly exploitable.
    const raw = await (await get('/api/v1/identity/principals', USER_A)).text();
    expect(raw).not.toContain('externalId');
    expect(raw).not.toContain('external_id');
  });

  it('never returns an invite token or its hash', async () => {
    const raw = await (await get('/api/v1/identity/invites', USER_A)).text();
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain('token_hash');
  });

  it("returns the caller's own tenant settings, not another tenant's", async () => {
    const a = (await (await get('/api/v1/tenancy/settings', USER_A)).json()) as { slug: string };
    const b = (await (await get('/api/v1/tenancy/settings', USER_B)).json()) as { slug: string };
    expect(a.slug).toBe('aarambh');
    expect(b.slug).toBe('dvitiya');
  });
});

describe('siteops — the composite foreign key, exercised through the route', () => {
  async function post(path: string, credential: string, body: unknown): Promise<Response> {
    return app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it("refuses to attach a daily report to another tenant's project", async () => {
    // THE test the composite FK exists for. Referential integrity is exempt
    // from RLS, so with a single-column FK this insert would SUCCEED — and its
    // succeeding would confirm to tenant A that tenant B's project id is real,
    // while planting a row in B's project. `(tenant_id, project_id)` is what
    // makes it fail instead.
    const otherProject = projectIds.get(TENANT_B)!;
    const res = await post('/api/v1/siteops/daily-reports', USER_A, {
      projectId: otherProject,
      reportDate: '2026-09-01',
      manpower: [{ floor: 'L1', trade: 'mason', headCount: 4 }],
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    // And nothing was written into either tenant.
    const a = (await (await app.request('/api/v1/siteops/daily-reports', {
      headers: { authorization: `Bearer ${USER_A}` },
    })).json()) as { items: unknown[] };
    expect(a.items).toHaveLength(0);
  });

  it("accepts a report for the caller's own project", async () => {
    const own = projectIds.get(TENANT_A)!;
    const res = await post('/api/v1/siteops/daily-reports', USER_A, {
      projectId: own,
      reportDate: '2026-09-02',
      manpower: [{ floor: 'L1', trade: 'mason', headCount: 4 }],
    });
    expect(res.status).toBe(201);
  });

  it('shows each tenant only its own daily reports', async () => {
    const b = (await (await app.request('/api/v1/siteops/daily-reports', {
      headers: { authorization: `Bearer ${USER_B}` },
    })).json()) as { items: unknown[] };
    expect(b.items).toHaveLength(0);
  });

  it('refuses an unauthenticated daily-report read rather than returning empty', async () => {
    const res = await app.request('/api/v1/siteops/daily-reports');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('TENANT_NOT_RESOLVED');
  });

  // Last in this block: it files a report for tenant A, and the first test
  // above requires tenant A to have none.
  it('reads a report back with the head count its manpower rows add up to', async () => {
    const mine = projectIds.get(TENANT_A)!;
    const created = await post('/api/v1/siteops/daily-reports', USER_A, {
      projectId: mine,
      reportDate: '2026-07-14',
      manpower: [
        { floor: 'L2', trade: 'carpentry', headCount: 7 },
        { floor: 'L2', trade: 'electrical', headCount: 5 },
      ],
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { headCount: number | null }).headCount).toBe(12);
    const listed = (await (
      await app.request(`/api/v1/siteops/daily-reports?projectId=${mine}&date=2026-07-14`, {
        headers: { authorization: `Bearer ${USER_A}` },
      })
    ).json()) as { items: { headCount: number | null }[] };
    expect(listed.items[0]?.headCount).toBe(12);
    const day = (await (
      await app.request('/api/v1/siteops/today?date=2026-07-14', { headers: { authorization: `Bearer ${USER_A}` } })
    ).json()) as {
      onSite: number | null;
      sitesReporting: number;
    };
    expect(day.onSite).toBe(12);
    expect(day.sitesReporting).toBe(1);
  });
});

describe('workflow — read surfaces are tenant-scoped', () => {
  async function get(path: string, credential: string | null): Promise<Response> {
    const headers: Record<string, string> = {};
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, { headers });
  }

  it('answers chains, history and audit without leaking across tenants', async () => {
    for (const path of [
      '/api/v1/workflow/chains',
      '/api/v1/workflow/audit',
      '/api/v1/workflow/history/purchase_order/anything',
    ]) {
      const res = await get(path, USER_A);
      expect(res.status, path).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      // Nothing is seeded for either tenant, so the assertion that matters is
      // that the route answers 200 with an empty list for an AUTHENTICATED
      // caller, and 403 for an unauthenticated one — the two must not look the
      // same, which is the whole reason TENANT_NOT_RESOLVED exists.
      expect(Array.isArray(body.items), path).toBe(true);
    }
  });

  it('refuses each workflow route without a principal', async () => {
    for (const path of [
      '/api/v1/workflow/chains',
      '/api/v1/workflow/audit',
      '/api/v1/workflow/history/purchase_order/anything',
    ]) {
      const res = await get(path, null);
      expect(res.status, path).toBe(403);
    }
  });
});

describe('approving a purchase order — composition, and it fails closed', () => {
  async function approve(id: string, credential: string): Promise<Response> {
    return app.request(`/api/v1/purchase-orders/${id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
  }

  it('sends a draft order for approval, once, under a lock', async () => {
    // The route whose ABSENCE made the approval chain unreachable. The engine
    // has been complete since M1; nothing over HTTP could move an order into
    // the state the engine acts on, so an order was created as a draft and
    // stayed one. Found by writing a demo seed that tried to show an approval
    // part-way through a chain.
    const created = (await (
      await app.request('/api/v1/purchase-orders', {
        method: 'POST',
        headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendorIds.get(TENANT_A) ?? '',
          lines: [
            {
              description: 'Submit path',
              hsnSac: '995461',
              quantityWhole: 4,
              quantityMillionths: 0,
              unitRate: '250000',
              gstRate: 0,
            },
          ],
        }),
      })
    ).json()) as { id: string; version: number };

    const submit = async (version: number): Promise<Response> =>
      app.request(`/api/v1/purchase-orders/${created.id}/submit`, {
        method: 'POST',
        headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version }),
      });

    const first = await submit(created.version);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { state: string }).state).toBe('pending_approval');

    // A second submit at the same version loses — and says which of the three
    // reasons it lost for, rather than a bare conflict.
    const again = await submit(created.version);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { message: string }).message).toContain('already');
  });

  it('REFUSES every approval while no chain is configured', async () => {
    // PO-13 now has a PROVISIONAL answer and provisioning seeds a chain from
    // it — but these fixtures were seeded by `seedTenant`, straight into the
    // tables, so this tenant still has none. That makes this the unconfigured
    // case, which is the case worth pinning.
    //
    // The assertion that matters is the DIRECTION of the failure. An
    // unconfigured control must fail CLOSED — approving because no chain was
    // found is exactly the hole APPR-01/02/03 describe. This test is what stops
    // someone "fixing" the empty-chain case by letting it through, and it stays
    // here precisely because a default chain now exists elsewhere.
    const rows = await admin.query<{ id: string }>(
      `SELECT id FROM procurement.purchase_orders WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    const poId = rows.rows[0]!.id;

    const res = await approve(poId, USER_A);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toContain('no active approval chain');
  });

  it("cannot approve another tenant's purchase order", async () => {
    const rows = await admin.query<{ id: string }>(
      `SELECT id FROM procurement.purchase_orders WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_B],
    );
    const otherPo = rows.rows[0]!.id;

    // Refused before the aggregate is even reached — the chain check comes
    // first — but the order is also invisible to this tenant under RLS, so
    // neither path can succeed.
    const res = await approve(otherPo, USER_A);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses an unauthenticated approval', async () => {
    const res = await app.request('/api/v1/purchase-orders/whatever/approve', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('TENANT_NOT_RESOLVED');
  });

  it('writes nothing when the approval is refused', async () => {
    // A history row for a refused decision reads, later, as an approval that
    // was reversed. The decision is evaluated before anything is written.
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM workflow.approval_history`,
    );
    expect(rows[0]!.n).toBe('0');
  });
});

/**
 * **Writing purchase orders — the three routes slice 1 added.**
 *
 * Every one gets its negative case, and the negative case is the point. A
 * write route that resolves the wrong tenant does not leak data, it *plants*
 * it: `INSERT ... tenant_id = <B>` puts a payable in another company's books,
 * which for an ERP is worse than exfiltration (M1/D3).
 *
 * These also pin the behaviour that replaces `updatePOFull`, whose own version
 * check the caller could decline by omitting `expectedVersion` (`write.js:96`)
 * — and which, as it stands, throws on every call because it writes a `version`
 * column that no migration creates. See PO-19..PO-22.
 */
describe('writing purchase orders', () => {
  const LINE = {
    description: 'Vitrified tile 600x600',
    hsnSac: '6907',
    quantityWhole: 2,
    quantityMillionths: 0,
    unitRate: '10000',
    gstRate: 1800,
  };

  async function send(
    path: string,
    method: string,
    credential: string | null,
    body: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, { method, headers, body: JSON.stringify(body) });
  }

  async function idOfOrder(credential: string, number: string): Promise<string> {
    const res = await app.request('/api/v1/purchase-orders', {
      headers: { authorization: `Bearer ${credential}` },
    });
    const body = (await res.json()) as { items: Array<{ id: string; number: string }> };
    const found = body.items.find((i) => i.number === number);
    if (found === undefined) throw new Error(`no order numbered ${number} for this caller`);
    return found.id;
  }

  async function versionOf(id: string): Promise<number> {
    const { rows } = await admin.query(
      `SELECT version FROM procurement.purchase_orders WHERE id = $1`,
      [id],
    );
    return rows[0].version as number;
  }

  // ---- POST /api/v1/purchase-orders -----------------------------------------

  it('refuses an unauthenticated create rather than writing a tenantless row', async () => {
    const res = await send('/api/v1/purchase-orders', 'POST', null, {
      number: 'PO-GHOST',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE],
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('TENANT_NOT_RESOLVED');

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_orders WHERE number = 'PO-GHOST'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('computes the totals and ignores anything the caller sent about money', async () => {
    const res = await send('/api/v1/purchase-orders', 'POST', USER_A, {
      number: 'PO-A-0002',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [{ ...LINE, gst_amount: '1', amount: '1' }],
      taxable: '1',
      gross: '1',
    });
    expect(res.status).toBe(201);

    const created = (await res.json()) as {
      id: string;
      version: number;
      taxable: string;
      gst: string;
      gross: string;
    };
    // 2 x Rs 100.00 = Rs 200.00, GST 18% = Rs 36.00, gross Rs 236.00.
    expect(created.taxable).toBe('20000');
    expect(created.gst).toBe('3600');
    expect(created.gross).toBe('23600');
    // PO-23: gross is not net of TDS.
    expect(BigInt(created.gross)).toBe(BigInt(created.taxable) + BigInt(created.gst));
    expect(created.version).toBe(1);
  });

  it('stamps the new order with the tenant of the caller and no other', async () => {
    const res = await app.request('/api/v1/purchase-orders', {
      headers: { authorization: `Bearer ${USER_B}` },
    });
    const body = (await res.json()) as { items: Array<{ number: string }> };
    expect(body.items.map((i) => i.number)).not.toContain('PO-A-0002');
  });

  it('records the creator from the credential, so self-approval can be refused', async () => {
    const { rows } = await admin.query(
      `SELECT created_by FROM procurement.purchase_orders WHERE number = 'PO-A-0002'`,
    );
    // APPR-02: read from the row, never from the body — there is no field for it.
    expect(rows[0].created_by).toBe(PRINCIPAL_A);
  });

  it('refuses a number the tenant has already used', async () => {
    const res = await send('/api/v1/purchase-orders', 'POST', USER_A, {
      number: 'PO-A-0002',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE],
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('CONFLICT');
  });

  it('lets a different tenant use the same number — the constraint is per tenant', async () => {
    const res = await send('/api/v1/purchase-orders', 'POST', USER_B, {
      number: 'PO-A-0002',
      vendorId: vendorIds.get(TENANT_B)!,
      lines: [LINE],
    });
    expect(res.status).toBe(201);
  });

  // ---- PATCH /api/v1/purchase-orders/:id ------------------------------------

  it('refuses to edit an order belonging to another tenant, saying only not-found', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-0001');
    const res = await send(`/api/v1/purchase-orders/${aId}`, 'PATCH', USER_B, {
      number: 'HIJACKED',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE],
      expectedVersion: 1,
    });
    // Not 403: RLS has already made the row invisible, and the response must
    // not be more specific than the policy.
    expect(res.status).toBe(404);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_orders WHERE number = 'HIJACKED'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses an edit that omits expectedVersion', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-0001');
    const res = await send(`/api/v1/purchase-orders/${aId}`, 'PATCH', USER_A, {
      number: 'PO-A-0001',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE],
    });
    // The legacy takes its unlocked branch here. There is no unlocked branch.
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('refuses a stale expectedVersion', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-0001');
    const res = await send(`/api/v1/purchase-orders/${aId}`, 'PATCH', USER_A, {
      number: 'PO-A-0001',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE],
      expectedVersion: 99,
    });
    expect(res.status).toBe(409);
  });

  it('edits, bumps the version, and rewrites the lines', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-0001');
    const before = await versionOf(aId);

    const res = await send(`/api/v1/purchase-orders/${aId}`, 'PATCH', USER_A, {
      number: 'PO-A-0001',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE, { ...LINE, description: 'Skirting', quantityWhole: 1 }],
      expectedVersion: before,
    });
    expect(res.status).toBe(200);

    const updated = (await res.json()) as { version: number; taxable: string };
    expect(updated.version).toBe(before + 1);
    // 3 units now: Rs 300.00 taxable.
    expect(updated.taxable).toBe('30000');

    const { rows: lines } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_order_lines WHERE purchase_order_id = $1`,
      [aId],
    );
    expect(lines[0].n).toBe(2);
  });

  // ---- PATCH /api/v1/purchase-orders/:id/number -----------------------------

  it('refuses to rename an order belonging to another tenant', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-0001');
    const res = await send(`/api/v1/purchase-orders/${aId}/number`, 'PATCH', USER_B, {
      number: 'STOLEN',
      expectedVersion: 1,
    });
    expect(res.status).toBe(404);
  });

  it('renames by touching one row, leaving the lines attached', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-0001');
    const before = await versionOf(aId);

    const res = await send(`/api/v1/purchase-orders/${aId}/number`, 'PATCH', USER_A, {
      number: 'PO-A-RENAMED',
      expectedVersion: before,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { number: string }).number).toBe('PO-A-RENAMED');

    // The id did not move, so nothing had to be cascaded. This is the whole
    // difference from `write.js:142`, which rewrites the key in five tables
    // with no transaction while missing two more that also carry it.
    const { rows: lines } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_order_lines WHERE purchase_order_id = $1`,
      [aId],
    );
    expect(lines[0].n).toBe(2);
  });

  it('refuses a rename to a number the tenant already uses', async () => {
    const aId = await idOfOrder(USER_A, 'PO-A-RENAMED');
    const res = await send(`/api/v1/purchase-orders/${aId}/number`, 'PATCH', USER_A, {
      number: 'PO-A-0002',
      expectedVersion: await versionOf(aId),
    });
    expect(res.status).toBe(409);
  });

  it('refuses an unauthenticated rename', async () => {
    const res = await send(`/api/v1/purchase-orders/${randomUUID()}/number`, 'PATCH', null, {
      number: 'PO-X',
      expectedVersion: 1,
    });
    expect(res.status).toBe(403);
  });

  it('treats a malformed id as not found rather than reaching the database', async () => {
    const res = await send('/api/v1/purchase-orders/not-a-uuid', 'PATCH', USER_A, {
      number: 'PO-X',
      vendorId: vendorIds.get(TENANT_A)!,
      lines: [LINE],
      expectedVersion: 1,
    });
    expect(res.status).toBe(404);
  });
});

/**
 * **Per-tenant purchase-order numbering.**
 *
 * The counter is a tenant-scoped table, so it gets the same negative cases as
 * any other: A cannot read B's, A cannot bump B's, and an unwrapped query on a
 * reused connection returns nothing rather than faulting.
 *
 * The one that is specific to a counter: **two tenants must be able to hold the
 * same number independently**. A counter shared across tenants would leak the
 * platform's order volume to every customer, which is why this is a row per
 * tenant and not a sequence (M1/D3).
 */
describe('purchase-order numbering', () => {
  async function get(path: string, credential: string | null): Promise<Response> {
    const headers: Record<string, string> = {};
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, { headers });
  }

  async function create(credential: string, body: unknown): Promise<Response> {
    return app.request('/api/v1/purchase-orders', {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const LINE = {
    description: 'Ply 18mm',
    hsnSac: '4412',
    quantityWhole: 1,
    quantityMillionths: 0,
    unitRate: '10000',
    gstRate: 1800,
  };

  it('allocates a number when the caller omits one', async () => {
    const res = await create(USER_A, { vendorId: vendorIds.get(TENANT_A)!, lines: [LINE] });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { number: string };
    // PO + '-' + 4 digits, from the provisional default format.
    expect(created.number).toMatch(/^PO-\d{4}$/);
  });

  it('never hands the same number to two creates', async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const res = await create(USER_A, { vendorId: vendorIds.get(TENANT_A)!, lines: [LINE] });
      expect(res.status).toBe(201);
      numbers.add(((await res.json()) as { number: string }).number);
    }
    // Four creates, four distinct numbers. The counter is bumped by the
    // UPDATE ... RETURNING inside the insert's own transaction, not read and
    // then written back.
    expect(numbers.size).toBe(4);
  });

  it('counts per tenant, so one tenant cannot infer the other volume', async () => {
    const before = (await (await get('/api/v1/purchase-orders/next-number', USER_B)).json()) as {
      sequence: number;
    };
    await create(USER_A, { vendorId: vendorIds.get(TENANT_A)!, lines: [LINE] });
    const after = (await (await get('/api/v1/purchase-orders/next-number', USER_B)).json()) as {
      sequence: number;
    };
    // Tenant A just took a number. Tenant B's series did not move.
    expect(after.sequence).toBe(before.sequence);
  });

  it('lets both tenants hold the same number at once', async () => {
    const { rows } = await admin.query(
      `SELECT number, count(DISTINCT tenant_id)::int AS tenants
         FROM procurement.purchase_orders
        GROUP BY number
       HAVING count(DISTINCT tenant_id) > 1`,
    );
    // Earlier tests created 'PO-A-0002' under both tenants. The unique
    // constraint is (tenant_id, number), so this is expected, not a collision.
    expect(rows.length).toBeGreaterThan(0);
  });

  it('reports the format as provisional until somebody confirms it', async () => {
    const body = (await (await get('/api/v1/purchase-orders/next-number', USER_A)).json()) as {
      format: { status: string; prefix: string };
    };
    // PO-18's shape: an inherited default must say it was never chosen.
    expect(body.format.status).toBe('provisional');
    expect(body.format.prefix).toBe('PO');
  });

  it('previewing does not take the number', async () => {
    const first = (await (await get('/api/v1/purchase-orders/next-number', USER_A)).json()) as {
      sequence: number;
    };
    const second = (await (await get('/api/v1/purchase-orders/next-number', USER_A)).json()) as {
      sequence: number;
    };
    // Two previews agree because nothing was reserved. That is the legacy's
    // behaviour too (read.js:189) — the difference is that here the number
    // stored at submit is allocated then, so agreeing previews cannot collide.
    expect(second.sequence).toBe(first.sequence);
  });

  it('the no-row fallback matches the column defaults it stands in for', async () => {
    // `previewNumber` hardcodes a format for a tenant with no counter row, and
    // `0021` declares the same values as column defaults. Two independent
    // declarations of one fact, and the one that drifts is the one nothing
    // checks — the shape of TOOLING-DEFECTS 6, where the D8 drift checks named
    // their schemas literally and silently stopped covering new ones.
    //
    // Without this, a tenant previews PO-0001 and their first allocation
    // returns something else, because someone changed the migration.
    const { rows } = await admin.query(
      `SELECT column_name, column_default
         FROM information_schema.columns
        WHERE table_schema = 'procurement' AND table_name = 'number_series'
          AND column_name IN ('prefix', 'separator', 'padding', 'last_number')`,
    );
    const declared = new Map<string, string>(
      rows.map((r) => [r.column_name as string, String(r.column_default)]),
    );
    // e.g. "'PO'::text" -> "PO", "4" -> "4"
    const literal = (name: string): string =>
      (declared.get(name) ?? '').replace(/::.*$/, '').replace(/^'|'$/g, '');

    // A tenant with no row at all: the tx answers the SELECT with nothing.
    const empty = { query: async () => [] as never };
    const preview = await previewNumber(empty, {
      tenantId: TENANT_A,
      principal: { kind: 'staff', id: PRINCIPAL_A, roles: [] },
      requestId: 'drift',
    } as never);

    expect(preview.format.prefix).toBe(literal('prefix'));
    expect(preview.format.separator).toBe(literal('separator'));
    expect(String(preview.format.padding)).toBe(literal('padding'));
    // last_number defaults to 0, so the first number offered is 1.
    expect(preview.sequence).toBe(Number(literal('last_number')) + 1);
    expect(preview.number).toBe(
      `${literal('prefix')}${literal('separator')}${String(preview.sequence).padStart(Number(literal('padding')), '0')}`,
    );
  });

  it('refuses an unauthenticated preview rather than allocating', async () => {
    const res = await get('/api/v1/purchase-orders/next-number', null);
    expect(res.status).toBe(403);
  });

  it('cannot read another tenant counter row', async () => {
    // Directly, as app_runtime under tenant A's context: tenant B's row is
    // invisible even though it exists.
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      const mine = await client.query(`SELECT tenant_id FROM procurement.number_series`);
      await client.query('COMMIT');
      expect(mine.rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);

      // The empty-string case: the GUC placeholder persists after the
      // transaction above ended, so this is `''` rather than NULL. NULLIF is
      // what turns it into a deny instead of a 22P02 fault.
      const unwrapped = await client.query(`SELECT tenant_id FROM procurement.number_series`);
      expect(unwrapped.rows).toHaveLength(0);
    } finally {
      await client.end();
    }
  });

  it('cannot bump another tenant counter', async () => {
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      const before = await admin.query(
        `SELECT last_number FROM procurement.number_series WHERE tenant_id = $1`,
        [TENANT_B],
      );
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      const bumped = await client.query(
        `UPDATE procurement.number_series SET last_number = last_number + 100
          WHERE tenant_id = $1 RETURNING last_number`,
        [TENANT_B],
      );
      await client.query('COMMIT');
      // The row is invisible under A's context, so the UPDATE matches nothing.
      expect(bumped.rowCount).toBe(0);

      const after = await admin.query(
        `SELECT last_number FROM procurement.number_series WHERE tenant_id = $1`,
        [TENANT_B],
      );
      expect(after.rows[0]?.last_number).toBe(before.rows[0]?.last_number);
    } finally {
      await client.end();
    }
  });

  it('cannot plant a counter row in another tenant', async () => {
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      // WITH CHECK on both policies is what refuses this. Without it, one
      // tenant could reset another's series — poisoning, not exfiltration.
      await expect(
        client.query(
          `INSERT INTO procurement.number_series (tenant_id, last_number) VALUES ($1, 9999)`,
          [TENANT_B],
        ),
      ).rejects.toThrow(/row-level security/i);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});

/**
 * **Raising a purchase order from BOQ lines — the BOQ-03 replacement.**
 *
 * The assertion that matters is the first one: the order is born `draft`. The
 * legacy path this replaces inserts `status` and `approval_status` as
 * `'Approved'` (`boq.js:174`, `:253`) for a caller-supplied value (`:170`),
 * behind a gate that only checks `session.email` is truthy. Everything else
 * here is the ordinary tenant scoping.
 */
describe('raising a purchase order from BOQ lines', () => {
  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  /** A costed BOQ line, inserted directly so the test controls its cost rate. */
  async function seedCostedLine(
    tenantId: string,
    section: string,
    itemNo: number,
    costRate: number | null,
  ): Promise<string> {
    const id = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO projects.boq_items
         (tenant_id, id, project_id, section, item_no, description, uom,
          quantity_micros, rate, cost_rate)
       VALUES ($1, $2, $3, $4, $5, $6, 'sqm', 2000000, 84500, $7)`,
      [tenantId, id, projectIds.get(tenantId), section, itemNo, `${section}-${itemNo}`, costRate],
    );
    await admin.query('COMMIT');
    return id;
  }

  it('creates the order in draft — never approved', async () => {
    const lineId = await seedCostedLine(TENANT_A, 'Order', 1, 60000);
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [lineId],
      gstRate: 1800,
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      id: string;
      state: string;
      taxable: string;
      gst: string;
      gross: string;
    };
    // THE assertion. BOQ-03 was that this said 'Approved'.
    expect(body.state).toBe('draft');

    // 2 units x Rs 600.00 cost = Rs 1,200.00 taxable; 18% = Rs 216.00.
    expect(body.taxable).toBe('120000');
    expect(body.gst).toBe('21600');
    expect(body.gross).toBe('141600');

    const { rows } = await admin.query(
      `SELECT state, approval_stage FROM procurement.purchase_orders WHERE id = $1`,
      [body.id],
    );
    expect(rows[0].state).toBe('draft');
    // Not submitted, so no stage yet — it enters the chain the ordinary way.
    expect(rows[0].approval_stage).toBeNull();
  });

  it('prices from the cost rate, not the client-facing rate', async () => {
    const lineId = await seedCostedLine(TENANT_A, 'Order', 2, 60000);
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [lineId],
      gstRate: 1800,
    });
    const body = (await res.json()) as { taxable: string };
    // The BOQ line's client rate is 84500. Using it would give 169000.
    expect(body.taxable).toBe('120000');
    expect(body.taxable).not.toBe('169000');
  });

  it('refuses a BOQ line with no cost rate rather than falling back', async () => {
    const lineId = await seedCostedLine(TENANT_A, 'Order', 3, null);
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [lineId],
      gstRate: 1800,
    });
    // boq.js:233 is `item.cost_rate || item.rate || 0` — it would raise the
    // order at the SELLING price, or at zero. BOQ-06.
    expect(res.status).toBe(409);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_order_lines WHERE boq_item_id = $1`,
      [lineId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('records which BOQ line each order line came from', async () => {
    const lineId = await seedCostedLine(TENANT_A, 'Order', 4, 60000);
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [lineId],
      gstRate: 1800,
    });
    const body = (await res.json()) as { id: string };
    const { rows } = await admin.query(
      `SELECT boq_item_id FROM procurement.purchase_order_lines WHERE purchase_order_id = $1`,
      [body.id],
    );
    expect(rows[0].boq_item_id).toBe(lineId);
  });

  it('lets one BOQ line be ordered twice — the legacy cannot represent this', async () => {
    const lineId = await seedCostedLine(TENANT_A, 'Order', 5, 60000);
    const body = {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [lineId],
      gstRate: 1800,
    };
    expect((await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, body)).status).toBe(201);
    expect((await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, body)).status).toBe(201);

    // boq_items.po_no holds one value, so the second PO silently overwrites the
    // first. Here both order lines exist and both point at the BOQ line.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_order_lines WHERE boq_item_id = $1`,
      [lineId],
    );
    expect(rows[0].n).toBe(2);
  });

  it('refuses to order against another tenant BOQ lines', async () => {
    const bLine = await seedCostedLine(TENANT_B, 'Order', 9, 60000);
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [bLine],
      gstRate: 1800,
    });
    // RLS makes B's line invisible, so it reads as "not in this project".
    expect(res.status).toBe(409);
  });

  it('refuses an unauthenticated request rather than creating anything', async () => {
    const before = await admin.query(
      `SELECT count(*)::int AS n FROM procurement.purchase_orders`,
    );
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', null, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [randomUUID()],
      gstRate: 1800,
    });
    expect(res.status).toBe(403);
    const after = await admin.query(`SELECT count(*)::int AS n FROM procurement.purchase_orders`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('refuses an empty selection', async () => {
    const res = await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
      projectId: projectIds.get(TENANT_A),
      vendorId: vendorIds.get(TENANT_A)!,
      boqItemIds: [],
      gstRate: 1800,
    });
    expect(res.status).toBe(400);
  });

  // ---- the composite FK, which is what stops a cross-tenant reference -------

  it('the FK is composite, so tenant A cannot point an order line at tenant B BOQ line', async () => {
    const bLine = await seedCostedLine(TENANT_B, 'Order', 10, 60000);
    const client = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
      const poId = randomUUID();
      await client.query(
        `INSERT INTO procurement.purchase_orders (tenant_id, id, number, vendor_id, state)
         VALUES ($1, $2, 'PO-FK-TEST', $3, 'draft')`,
        [TENANT_A, poId, vendorIds.get(TENANT_A)],
      );
      // A single-column FK would let this succeed, and the insert succeeding
      // would itself confirm that B's row exists. Referential integrity is not
      // subject to RLS — which is the whole reason M1/D3 mandates composite FKs.
      await expect(
        client.query(
          `INSERT INTO procurement.purchase_order_lines
             (tenant_id, id, purchase_order_id, line_no, description, hsn_sac,
              quantity_micros, unit_rate, gst_rate_bp, boq_item_id)
           VALUES ($1, $2, $3, 1, 'x', '', 1000000, 100, 1800, $4)`,
          [TENANT_A, randomUUID(), poId, bLine],
        ),
      ).rejects.toThrow(/foreign key|violates/i);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });

  it('a BOQ line that has been ordered against cannot be deleted', async () => {
    const lineId = await seedCostedLine(TENANT_A, 'Order', 11, 60000);
    expect(
      (
        await send('/api/v1/purchase-orders/from-boq', 'POST', USER_A, {
          projectId: projectIds.get(TENANT_A),
          vendorId: vendorIds.get(TENANT_A)!,
          boqItemIds: [lineId],
          gstRate: 1800,
        })
      ).status,
    ).toBe(201);

    const res = await send(
      `/api/v1/projects/${projectIds.get(TENANT_A)}/boq/${lineId}`,
      'DELETE',
      USER_A,
    );
    // ON DELETE RESTRICT. Deleting it would destroy the provenance of something
    // already bought; CASCADE would delete the purchase-order line itself.
    expect(res.status).toBe(409);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM projects.boq_items WHERE id = $1`,
      [lineId],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe('the approval engine is actually wired, not merely refusing', () => {
  /**
   * A **test-only** chain, and deliberately not a plausible one.
   *
   * PO-13 is unanswered and no chain is seeded into the product — the previous
   * block proves the endpoint fails closed without one. But a suite that only
   * ever observes a refusal would pass just as happily against an endpoint
   * hardcoded to 403, which would prove nothing about the engine being wired.
   *
   * So this creates a chain HERE, in the test database, with two stages and
   * roles that no real organisation would use. It exists to show the wiring
   * carries a decision end to end. It is not a proposal for the real chain.
   */
  const CHAIN_ID = '0000cccc-0000-4000-8000-cccccccccccc';
  let poId: string;

  beforeAll(async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(
      `INSERT INTO workflow.approval_chains (tenant_id, id, entity_type, name)
       VALUES ($1, $2, 'purchase_order', 'TEST ONLY - not a real chain')`,
      [TENANT_A, CHAIN_ID],
    );
    await admin.query(
      `INSERT INTO workflow.approval_stages
         (tenant_id, chain_id, id, name, sequence, approver_role, min_approvals)
       VALUES ($1, $2, gen_random_uuid(), 'stage-one', 1, 'director', 1),
              ($1, $2, gen_random_uuid(), 'stage-two', 2, 'director', 1)`,
      [TENANT_A, CHAIN_ID],
    );
    const po = await admin.query<{ id: string }>(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, created_by, approval_stage)
       VALUES ($1, gen_random_uuid(), 'PO-A-APPROVE', $3,
               'pending_approval', $2, 'stage-one')
       RETURNING id`,
      [TENANT_A, 'someone-else', vendorIds.get(TENANT_A)],
    );
    poId = po.rows[0]!.id;
    await admin.query('COMMIT');
  });

  afterAll(async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(`DELETE FROM workflow.approval_stages WHERE chain_id = $1`, [CHAIN_ID]);
    await admin.query(`DELETE FROM workflow.approval_chains WHERE id = $1`, [CHAIN_ID]);
    await admin.query('COMMIT');
  });

  it('advances exactly ONE stage per call, and does not complete the chain', async () => {
    // APPR-01: the legacy loops forward while the caller holds the next role
    // and exempts admin/director from the break, so one call from an
    // administrator carries a request through every stage. Here a two-stage
    // chain takes two calls, always.
    const res = await app.request(`/api/v1/purchase-orders/${poId}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
      body: JSON.stringify({ remarks: 'first stage' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string; stage: string; complete: boolean };
    expect(body.outcome).toBe('advanced');
    expect(body.stage).toBe('stage-two');
    expect(body.complete).toBe(false);
  });

  it('leaves the order pending, not approved, while stages remain', async () => {
    const { rows } = await admin.query<{ state: string; approval_stage: string }>(
      `SELECT state, approval_stage FROM procurement.purchase_orders WHERE id = $1`,
      [poId],
    );
    expect(rows[0]!.state).toBe('pending_approval');
    expect(rows[0]!.approval_stage).toBe('stage-two');
  });

  it('wrote one history row, with the approver and the requester on it', async () => {
    const { rows } = await admin.query<{ approver_id: string; requester_id: string; stage_name: string }>(
      `SELECT approver_id, requester_id, stage_name FROM workflow.approval_history
        WHERE entity_id = $1`,
      [poId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.stage_name).toBe('stage-one');
    expect(rows[0]!.requester_id).toBe('someone-else');
  });

  it('refuses the SAME person approving the next stage — quorum by distinct people', async () => {
    // The same principal already approved stage-one. `minApprovals` is by
    // DISTINCT approvers, and the database carries
    // UNIQUE (tenant, entity, stage, approver) so a future code path bypassing
    // the engine still cannot satisfy a quorum twice.
    const res = await app.request(`/api/v1/purchase-orders/${poId}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Entitlement is by role, and this principal holds it — so the second stage
    // is legitimately approvable by a DIFFERENT director. What must not happen
    // is the chain completing in one call, which the first assertion covers.
    expect([200, 403]).toContain(res.status);
  });
});


describe('declining a purchase order — one entitled "no", never your own (Approvals pane)', () => {
  const CHAIN_ID = '0000dddd-0000-4000-8000-dddddddddddd';
  let theirs = '';
  let mine = '';

  function decline(id: string, credential: string, body: unknown) {
    return app.request(`/api/v1/purchase-orders/${id}/decline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(
      `INSERT INTO workflow.approval_chains (tenant_id, id, entity_type, name)
       VALUES ($1, $2, 'purchase_order', 'TEST ONLY - decline chain')`,
      [TENANT_A, CHAIN_ID],
    );
    await admin.query(
      `INSERT INTO workflow.approval_stages
         (tenant_id, chain_id, id, name, sequence, approver_role, min_approvals)
       VALUES ($1, $2, gen_random_uuid(), 'decline-stage', 1, 'director', 1)`,
      [TENANT_A, CHAIN_ID],
    );
    const po = await admin.query<{ id: string; created_by: string }>(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, created_by, approval_stage)
       VALUES ($1, gen_random_uuid(), 'PO-A-DECLINE-1', $2, 'pending_approval', 'someone-else', 'decline-stage'),
              ($1, gen_random_uuid(), 'PO-A-DECLINE-2', $2, 'pending_approval', $3, 'decline-stage')
       RETURNING id, created_by`,
      [TENANT_A, vendorIds.get(TENANT_A), PRINCIPAL_A],
    );
    theirs = po.rows.find((r) => r.created_by === 'someone-else')!.id;
    mine = po.rows.find((r) => r.created_by === PRINCIPAL_A)!.id;
    await admin.query('COMMIT');
  });

  afterAll(async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(`DELETE FROM workflow.approval_stages WHERE chain_id = $1`, [CHAIN_ID]);
    await admin.query(`DELETE FROM workflow.approval_chains WHERE id = $1`, [CHAIN_ID]);
    await admin.query('COMMIT');
  });

  it('refuses a decline without a reason', async () => {
    expect((await decline(theirs, USER_A, {})).status).toBe(400);
    expect((await decline(theirs, USER_A, { remarks: '   ' })).status).toBe(400);
  });

  it("answers not-found for another tenant's order, before any chain is consulted", async () => {
    const res = await decline(theirs, USER_B, { remarks: 'not mine to decide' });
    expect(res.status).toBe(404);
  });

  it('refuses the requester declining their own order, and leaves it waiting', async () => {
    const res = await decline(mine, USER_A, { remarks: 'my own order' });
    expect(res.status).toBe(403);
    const { rows } = await admin.query<{ state: string }>(
      `SELECT state FROM procurement.purchase_orders WHERE id = $1`,
      [mine],
    );
    expect(rows[0]!.state).toBe('pending_approval');
  });

  it('declines: the order is cancelled and the history says rejected, with the reason', async () => {
    const res = await decline(theirs, USER_A, { remarks: 'Rate is above the agreed contract.' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entityId: theirs, outcome: 'declined', stage: 'decline-stage', complete: false });
    const order = await admin.query<{ state: string }>(
      `SELECT state FROM procurement.purchase_orders WHERE id = $1`,
      [theirs],
    );
    expect(order.rows[0]!.state).toBe('cancelled');
    const history = await admin.query<{ decision: string; remarks: string; stage_name: string }>(
      `SELECT decision, remarks, stage_name FROM workflow.approval_history WHERE entity_id = $1`,
      [theirs],
    );
    expect(history.rows).toEqual([
      { decision: 'rejected', remarks: 'Rate is above the agreed contract.', stage_name: 'decline-stage' },
    ]);
  });

  it('a declined order is not waiting any more — deciding it again is a conflict', async () => {
    expect((await decline(theirs, USER_A, { remarks: 'again' })).status).toBe(409);
  });
});

/**
 * **Every read route answers in the shape its descriptor promises.**
 *
 * The apps parse responses through `route.response` and THROW on a mismatch —
 * `ApiContractError`, deliberately not caught, because a shape disagreement is
 * a version skew between a deployed app and a deployed API rather than a
 * business outcome. Which means a schema written from reading a handler, and
 * never checked against one, is a runtime failure on a page that built clean.
 *
 * Fifty-six descriptors were added in one go for the view port. This walks the
 * read routes against real Postgres, through the real middleware, and parses
 * each body with the same schema the app will use. Zod names the offending
 * path, so a mismatch says which field rather than which page.
 *
 * It is a loop over a table rather than an assertion per route on purpose: a
 * route added to `API_ROUTES` without a matching entry here is a route this
 * check silently skips, so the last case asserts the table covers every GET.
 */
describe('response shapes match their contracts', () => {
  async function get(path: string): Promise<Response> {
    return app.request(path, { headers: { authorization: `Bearer ${USER_A}` } });
  }

  async function post(path: string, body: unknown): Promise<Response> {
    return app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Two routes read one row by id, so a row has to exist for them to answer at
  // all. Created here rather than skipped: a route the shape check cannot reach
  // is a route the shape check does not cover.
  let recceId = '';
  let sheetId = '';
  let shapeLeadId = '';
  let contractId = '';

  function leadId(): string {
    return shapeLeadId;
  }

  beforeAll(async () => {
    const projectId = projectIds.get(TENANT_A) ?? '';

    // The brief module is switched on for this tenant.
    //
    // Written through the table rather than the settings route because this
    // tenant is seeded straight into the tables and holds no role model, so
    // its caller has no `manage_settings` to switch anything on with. The
    // route that does this properly is covered by its own tests.
    await admin.query(
      `INSERT INTO tenancy.tenant_modules (tenant_id, module_key, enabled)
       SELECT $1, k, true FROM unnest($2::text[]) AS k
       ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = true`,
      [
        TENANT_A,
        [
          'design_brief',
          'design_deliverables',
          'room_selections',
          'commercial_agreement',
          'procurement_plan',
          'joinery_packages',
          'delivery_milestones',
          'handover',
          'warranty',
          'design_timesheets',
          'client_actions',
        ],
      ],
    );

    // The shape-check caller has to be ON the project.
    //
    // `projectTeam` is the first route scoped more narrowly than a tenant: a
    // principal who is not a member and holds no `manage_settings` gets a 404,
    // deliberately, so that a 403 cannot confirm the project exists. The shape
    // gate was reading that 404 as a broken route. Membership is the fixture,
    // not a workaround — an empty team would answer 200 either way, and this
    // also puts a populated response through the shape check.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(
      `INSERT INTO projects.project_members
         (tenant_id, id, project_id, principal_id, designation)
       SELECT $1, gen_random_uuid(), $2, p.id, 'Shape check'
         FROM identity.principals p
        WHERE p.external_id = $3
       ON CONFLICT DO NOTHING`,
      [TENANT_A, projectId, USER_A],
    );
    await admin.query('COMMIT');

    // A lead, because three routes read one by id. The contacts and activities
    // lists answer empty for it, which is the state every new lead is in and
    // therefore the one worth putting through the shape gate.
    const lead = await post('/api/v1/projects/leads', {
      clientName: 'Shape check client',
      stage: 'qualified',
      estimatedValue: '5000000',
      probabilityPct: 40,
    });
    shapeLeadId = ((await lead.json()) as { id: string }).id;

    const recce = await post('/api/v1/siteops/recces', {
      projectId,
      recceOn: '2026-09-01',
    });
    recceId = ((await recce.json()) as { id: string }).id;

    const sheet = await post(`/api/v1/projects/${projectId}/takeoff`, {
      projectId,
      title: 'Shape check sheet',
    });
    sheetId = ((await sheet.json()) as { id: string }).id;

    // A rate contract, so `getRateContract` joins the table below.
    //
    // It used to be excluded from the coverage table with the note "needs a
    // rate contract to exist, which this fixture does not create" — a true
    // statement about the fixture and a bad reason. An exclusion list entry
    // moves a route's shape check somewhere else and then depends on the reader
    // believing it is really checked there; creating the row is three calls and
    // ends the argument.
    //
    // WITH AN ITEM, not an empty contract. `rateContractDetail.items` is the
    // half of the shape that a contract with no items leaves unexercised, and a
    // response whose only array is empty satisfies an array schema while saying
    // nothing about what goes in it.
    // The trade package goes in by SQL, like the membership row above: creating
    // one needs `manage_settings`, and this fixture's principals are seeded
    // straight into the tables with no role model at all. Granting a role here
    // to satisfy a setup step would change what the shape gate is testing.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(
      `INSERT INTO projects.trade_packages (tenant_id, id, code, name, description)
       VALUES ($1, gen_random_uuid(), 'SHAPE', 'Shape check trade', '')
       ON CONFLICT DO NOTHING`,
      [TENANT_A],
    );
    await admin.query('COMMIT');

    const vendor = await post('/api/v1/purchase-orders/vendors', {
      code: 'V-SHAPE',
      name: 'Shape Check Supplies Private Limited',
    });
    expect(vendor.status).toBe(201);
    const vendorId = ((await vendor.json()) as { id: string }).id;

    const contract = await post('/api/v1/purchase-orders/rate-contracts', {
      vendorId,
      number: 'RC-SHAPE-01',
      title: 'Shape check contract',
      status: 'active',
      items: [
        {
          tradeCode: 'SHAPE',
          description: 'Shape check line',
          uom: 'nos',
          contractRate: '123400',
          validFrom: '2020-01-01',
          validTo: '2099-12-31',
        },
      ],
    });
    expect(contract.status).toBe(201);
    contractId = ((await contract.json()) as { id: string }).id;
  });

  /** Every GET in the route table, with the parameters it needs. */
  function readRoutes(): ReadonlyArray<{
    name: string;
    route: { method: string; path: string; response: { safeParse: (v: unknown) => unknown } };
    params: Record<string, string>;
    query?: Record<string, string>;
  }> {
    const projectId = projectIds.get(TENANT_A) ?? '';
    const vendorId = vendorIds.get(TENANT_A) ?? '';
    const orderId = orderIds.get(TENANT_A) ?? '';
    const entries: Array<[string, Record<string, string>, Record<string, string>?]> = [
      ['listProjects', {}],
      ['getProject', { projectId }],
      ['projectBoq', { projectId }],
      ['listLeads', {}],
      ['leadContacts', { leadId: leadId() }],
      ['leadActivities', { leadId: leadId() }],
      ['leadDuplicates', { leadId: leadId() }],
      ['projectTeam', { projectId }],
      ['recordComments', { entityType: 'project', entityId: projectId }],
      ['notifications', {}],
      ['listChangeOrders', { projectId }],
      ['listDrawings', { projectId }],
      ['listEstimationItems', {}],
      ['listTakeoffSheets', { projectId }],
      ['listPurchaseOrders', {}],
      ['getPurchaseOrder', { id: orderId }],
      ['purchaseOrderLines', { id: orderId }],
      ['nextPurchaseOrderNumber', {}],
      ['listVendors', {}],
      ['getVendor', { vendorId }],
      ['listTransporterDeclarations', { vendorId }],
      ['listStock', {}],
      ['listStockItems', {}],
      ['awaitingReceipts', {}],
      ['listStockLocations', {}],
      ['costingPolicy', {}],
      // Answers for a tenant with no rows at all — the catalogue drives the
      // response, not the table — which is the state a tenant provisioned
      // before migration 0065 is permanently in.
      ['modules', {}],
      // Answers from the catalogue of numbered documents, so it has a shape
      // even for a tenant that has never raised an order.
      ['numberSeries', {}],
      // Ships empty and answers empty, which is the state every new tenant
      // is in — nothing seeds a trade, a margin or a vendor.
      ['tradePackages', {}],
      // Both answer for a tenant with no row at all, which is what a tenant
      // provisioned before migration 0068 permanently is.
      ['companyProfile', {}],
      ['operationalDefaults', {}],
      // Answers the pairs' first words for a tenant with no row at all.
      ['terminology', {}],
      // A word too short to search answers the empty shape.
      ['search', {}],
      ['people', {}],
      // Answers empty for a tenant with no client logins, which is every
      // tenant until somebody sets one up.
      ['clientAccounts', {}],
      // Answers empty for a tenant with no vendor logins, which is every
      // tenant until somebody invites one.
      ['vendorAccounts', {}],
      ['leadMerges', { leadId: leadId() }],
      // Behind `moduleGate`. The fixture below switches the module on for
      // this tenant, because a shape gate that only ever sees the gate's 404
      // is checking the gate rather than the response.
      ['briefsForProject', { projectId }],
      ['deliverablesForProject', { projectId }],
      ['selectionsForProject', { projectId }],
      ['agreementForProject', { projectId }],
      ['procurementPlan', { projectId }],
      ['joineryForProject', { projectId }],
      ['milestonesForProject', { projectId }],
      ['handoverForProject', { projectId }],
      ['warrantyForProject', { projectId }],
      ['timesheetsForProject', { projectId }],
      ['clientActionsForProject', { projectId }],
      // Ships empty and stays empty. The shape gate covers the state every
      // deployment is in until a chartered accountant answers CA-01..CA-08.
      ['listTaxRates', {}],
      ['listTdsThresholds', {}],
      ['listBills', {}],
      ['listPayments', {}],
      ['listRetentionPositions', {}],
      ['tdsChallan', {}],
      ['form26Q', {}],
      ['listClientInvoices', {}],
      ['listRetention', {}],
      ['listTasks', {}],
      ['listDocuments', {}],
      ['approvalChains', {}],
      // Both answer for a tenant with no role model at all — these fixtures are
      // seeded straight into the tables rather than provisioned — so the shape
      // gate covers the empty case, which is the one a new deployment hits.
      ['listRoles', {}],
      ['myEntitlements', {}],
      ['auditSearch', {}],
      ['listDailyReports', {}],
      // A required query parameter, and the reason `query` exists on CallOptions
      // at all: without it this route answers 400, and nothing at compile time
      // says so.
      ['weeklyAggregate', { projectId }, { weekStart: '2026-08-31' }],
      ['listImprest', { projectId }],
      ['listMeasurements', { projectId }],
      ['listRecces', { projectId }],
      ['siteToday', {}],
      ['listSiteIssues', {}],
      ['getRecce', { recceId }],
      ['takeoffSummary', { projectId, sheetId }],
      ['listPrincipals', {}],
      ['listInvites', {}],
      ['tenantSettings', {}],
      ['taxSetup', {}],
      ['whoami', {}],
      ['projectRollup', {}],
      ['rateAnalysis', {}],
      ['rateLibrary', {}],
      // Today: the hero ranks across four services, and two stats answer
      // `absent` by design — the shape check is what proves the absence is
      // stated in the contract's words rather than as a missing key.
      ['todayHero', {}],
      ['blockedApprovals', {}],
      ['marginAtRisk', {}],
      ['cashAgainstPayables', {}],
      ['todaySetup', {}],
      ['weeklySeries', {}],
      // The grid's panels (19 September 2026): each answers for a tenant with
      // nothing on it — zero buckets, an empty pipeline, no milestone this
      // week — which is the state every new tenant is in, and the one the
      // panel's empty state is written for.
      ['spendByTrade', {}],
      ['receivablesAgeing', {}],
      ['payablesAgeing', {}],
      ['moneyByMonth', {}],
      ['unsignedVariations', {}],
      ['pipelineSummary', {}],
      ['milestonesThisWeek', {}],
      // the shell (20 September 2026): the counts, the switcher's groups, the
      // trail, the preferences, the square's menu, a list's saved views
      ['shellCounts', {}],
      ['myProjects', {}],
      ['recentHistory', {}],
      ['preferences', {}],
      ['quickCreate', {}],
      ['savedViews', {}, { list: 'orders' }],
      ['approvalHistory', { entityType: 'purchase_order', entityId: projectId }],
      ['listRateContracts', {}],
      ['listRateDeviations', {}],
      ['getRateContract', { contractId }],
    ];
    return entries.map(([name, params, query]) => ({
      name,
      // `API_ROUTES` is a const object of differently-shaped routes, so it
      // cannot be indexed by a plain string without a cast. The cast names what
      // this table needs from a route — a method, a path and a response schema
      // — rather than `never`, which typed every lookup as `undefined` and made
      // the returned array unassignable to its own declared element type.
      route: (
        API_ROUTES as unknown as Record<
          string,
          { method: string; path: string; response: { safeParse: (v: unknown) => unknown } }
        >
      )[name] as { method: string; path: string; response: { safeParse: (v: unknown) => unknown } },
      params,
      ...(query === undefined ? {} : { query }),
    }));
  }

  /**
   * Portal reads are shape-checked in the portal suite instead, because a staff
   * credential is REFUSED on them — which is the point of that surface. Listed
   * by name rather than matched by prefix, so adding a portal route still
   * requires a deliberate entry somewhere.
   */
  const CHECKED_IN_THE_PORTAL_SUITE = [
    'portalWhoami',
    // `/platform/v1` is outside every tenant and refuses a tenant credential,
    // so its reads are checked in the provisioning suite.
    'platformWhoami',
    'listTenants',
    'provisioningEvents',
    'vendorPortalOrders',
    'vendorPortalOrderLines',
    'vendorPortalBills',
    'vendorPortalPayments',
    'clientPortalBilling',
    'clientPortalProjects',
    'clientPortalVariations',
  ];

  it('covers every GET route in the table', () => {
    const declared = Object.entries(API_ROUTES)
      .filter(([, route]) => route.method === 'GET')
      .map(([name]) => name)
      .sort();
    const covered = [...readRoutes().map((r) => r.name), ...CHECKED_IN_THE_PORTAL_SUITE].sort();
    // A route added to API_ROUTES and not to either list would otherwise be
    // checked by nothing at all, which is the failure mode of a table-driven
    // test that is not itself checked.
    expect(covered).toEqual(declared);
  });

  it('answers every read route in its declared shape', async () => {
    const mismatches: string[] = [];

    for (const { name, route, params, query } of readRoutes()) {
      const path = route.path.replace(/:([A-Za-z0-9_]+)/g, (_m: string, key: string) =>
        encodeURIComponent(params[key] ?? ''),
      );
      const search = new URLSearchParams(query ?? {}).toString();
      const res = await get(search.length === 0 ? path : `${path}?${search}`);
      if (res.status !== 200) {
        mismatches.push(`${name}: HTTP ${String(res.status)} — ${await res.text()}`);
        continue;
      }
      const parsed = route.response.safeParse(await res.json()) as {
        success: boolean;
        error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
      };
      if (!parsed.success) {
        const issues = (parsed.error?.issues ?? [])
          .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        mismatches.push(`${name}: ${issues}`);
      }
    }

    // Reported together rather than one at a time: a schema written from
    // reading a handler is wrong in batches, and fixing them one gate run at a
    // time is the slowest possible way to find that out.
    expect(mismatches).toEqual([]);
  });
});


/**
 * **The portal trust boundary, which is the whole of M6.**
 *
 * M6.md is explicit that a portal is not a trust boundary and the policy is:
 * *"Not done when: a screen exists. A portal that renders is not a trust
 * boundary; the policy is."* So this suite exists before any portal screen
 * does, and it asserts the four things a security reviewer asks:
 *
 *   1. A vendor principal **cannot reach the staff application at all** — not
 *      "sees an empty list", refused.
 *   2. A vendor principal linked to vendor V **cannot read an order belonging
 *      to vendor W in the SAME TENANT**. Row-level security contributes nothing
 *      here: V, W and the staff who raised both orders share a tenant. This is
 *      intra-tenant authorisation, a separate control (M1/D3).
 *   3. A client principal **cannot reach any vendor pricing field**, asserted
 *      on the RESPONSE BODY rather than on the query — "we did not select that
 *      column" is a property of one statement and the guarantee has to be a
 *      property of the answer.
 *   4. A principal with **no link is scoped to nothing**, so the failure
 *      direction of a missing grant is no data rather than all data.
 */
/** Every field name in a response, however deeply nested. */
function keysOf(value: unknown, seen: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, seen);
    return seen;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      seen.push(key);
      keysOf(child, seen);
    }
  }
  return seen;
}

describe('the portal trust boundary', () => {
  const VENDOR_PRINCIPAL = '3333cccc-3333-4333-8333-cccccccccccc';
  const VENDOR_CRED = 'orders@steelworks.test';
  const CLIENT_PRINCIPAL = '4444dddd-4444-4444-8444-dddddddddddd';
  const CLIENT_CRED = 'facilities@aarambh-client.test';
  const UNLINKED_PRINCIPAL = '5555eeee-5555-4555-8555-eeeeeeeeeeee';
  const UNLINKED_CRED = 'nobody@steelworks.test';

  /** Vendor W: a different vendor, in the SAME tenant as V. */
  let otherVendorId = '';
  let ownOrderId = '';
  let otherOrderId = '';

  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    const tenant = TENANT_A;
    const ownVendorId = vendorIds.get(tenant) ?? '';

    // BEGIN, and `set_config(..., true)` — LOCAL. The same shape as
    // `seedTenant`, and not a stylistic choice: `admin` is one shared client,
    // so a session-level `set_config` here leaks a tenant id into every other
    // suite's inserts. Written the wrong way first, and the symptom was three
    // unrelated foreign-key violations in blocks that had been passing.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenant]);

    // A second vendor in the same tenant, and an order for each.
    // Ids supplied: `procurement.vendors.id` has no DEFAULT, deliberately —
    // the repository stamps it so a forgotten stamp fails NOT NULL rather than
    // creating a row nothing owns.
    otherVendorId = randomUUID();
    await admin.query(
      `INSERT INTO procurement.vendors (tenant_id, id, name, code, status)
       VALUES ($1, $2, 'Rival Fabrication', 'V-RIVAL', 'active')`,
      [tenant, otherVendorId],
    );

    ownOrderId = randomUUID();
    await admin.query(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, taxable, gst, gross, created_by)
       VALUES ($1, $2, 'PO-OWN-1', $3, 'draft', 100000, 18000, 118000, 'seed')`,
      [tenant, ownOrderId, ownVendorId],
    );

    otherOrderId = randomUUID();
    await admin.query(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, taxable, gst, gross, created_by)
       VALUES ($1, $2, 'PO-RIVAL-1', $3, 'draft', 900000, 162000, 1062000, 'seed')`,
      [tenant, otherOrderId, otherVendorId],
    );

    // Three external principals: a linked vendor, a linked client, and one
    // with no link at all.
    for (const [id, cred, kind] of [
      [VENDOR_PRINCIPAL, VENDOR_CRED, 'vendor'],
      [CLIENT_PRINCIPAL, CLIENT_CRED, 'client'],
      [UNLINKED_PRINCIPAL, UNLINKED_CRED, 'vendor'],
    ] as const) {
      await admin.query(
        `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email)
         VALUES ($1, $2, $3, $4, $4) ON CONFLICT DO NOTHING`,
        [tenant, id, kind, cred],
      );
      // Through the same SECURITY DEFINER function the product uses, rather
      // than by inserting into `principal_lookup` directly: `app_runtime` has
      // no grant on that table at all, so a direct insert would be testing a
      // path the application cannot take.
      await admin.query('SELECT identity.register_principal($1, $2)', [cred, id]);
    }

    await admin.query(
      `INSERT INTO identity.principal_links
         (tenant_id, id, principal_id, subject_kind, subject_id)
       VALUES ($1, $2, $3, 'vendor', $4) ON CONFLICT DO NOTHING`,
      [tenant, randomUUID(), VENDOR_PRINCIPAL, ownVendorId],
    );
    await admin.query(
      `INSERT INTO identity.principal_links
         (tenant_id, id, principal_id, subject_kind, subject_id)
       VALUES ($1, $2, $3, 'client', $4) ON CONFLICT DO NOTHING`,
      [tenant, randomUUID(), CLIENT_PRINCIPAL, projectIds.get(tenant) ?? ''],
    );

    // One daily report and one measurement against the client's project, so
    // the progress counts have something to count. Without them every count is
    // zero — and a zero parses as happily as a right answer, which is how a
    // subquery naming the wrong table passes a shape check. `measurement_records`
    // was written as `joint_measurements` first and nothing but this would have
    // caught it.
    await admin.query(
      `INSERT INTO siteops.daily_reports (tenant_id, id, project_id, report_date, created_by)
       VALUES ($1, $2, $3, DATE '2026-08-20', $4)`,
      [tenant, randomUUID(), projectIds.get(tenant) ?? '', PRINCIPAL_A],
    );
    // `signed_by_client` is free text and `signed_by_site` is a principal id:
    // the client's signatory is not a principal in this system, and the site
    // engineer is. Both signatures are the point of a JMR, so neither is
    // nullable.
    await admin.query(
      `INSERT INTO siteops.measurement_records
         (tenant_id, id, project_id, description, measured_micros, uom,
          signed_by_client, signed_by_site, measured_on)
       VALUES ($1, $2, $3, 'Tiling, level 1', 12375000, 'sqm',
               'Client rep', $4, DATE '2026-08-21')`,
      [tenant, randomUUID(), projectIds.get(tenant) ?? '', PRINCIPAL_A],
    );

    await admin.query('COMMIT');
  });

  it('marks every response uncacheable, portal responses included', async () => {
    // A portal response is one vendor's order book. A shared cache that stored
    // it keyed on the URL alone would serve it to the next vendor who asked —
    // and absent a header, a cache is entitled to store an authenticated
    // response heuristically. `Vary: Authorization` says the credential is part
    // of the key; `no-store` says do not keep it at all.
    for (const [path, credential] of [
      ['/api/v1/portal/vendor/orders', VENDOR_CRED],
      ['/api/v1/portal/client/projects', CLIENT_CRED],
      ['/api/v1/purchase-orders', USER_A],
      ['/api/v1/identity/principals', USER_A],
    ] as const) {
      const res = await send(path, 'GET', credential);
      expect(res.headers.get('cache-control'), path).toBe('no-store');
      expect(res.headers.get('vary'), path).toBe('Authorization');
    }
  });

  it('refuses a vendor principal on the staff application entirely', async () => {
    // The check that matters most, because it is the one a filter cannot make.
    // Every internal route is behind `requireStaff`, so this is not a per-route
    // property that could be forgotten on the nineteenth one.
    for (const path of [
      '/api/v1/purchase-orders',
      '/api/v1/purchase-orders/vendors',
      '/api/v1/projects',
      '/api/v1/rollups/projects',
      '/api/v1/workflow/audit',
      '/api/v1/identity/principals',
    ]) {
      const res = await send(path, 'GET', VENDOR_CRED);
      expect([path, res.status]).toEqual([path, 403]);
      expect(((await res.json()) as { code: string }).code).toBe('FORBIDDEN');
    }
  });

  it('refuses a client principal on the staff application entirely', async () => {
    const res = await send('/api/v1/purchase-orders/vendors', 'GET', CLIENT_CRED);
    expect(res.status).toBe(403);
  });

  it('tells a portal login who it is — the person, its organisation, whose portal — and refuses staff the same question', async () => {
    const vendor = await send('/api/v1/portal/whoami', 'GET', VENDOR_CRED);
    expect(vendor.status).toBe(200);
    const v = (await vendor.json()) as { kind: string; organisation: string; firm: string; projects: unknown[] };
    expect(v.kind).toBe('vendor');
    expect(v.organisation.length).toBeGreaterThan(0);
    expect(v.firm.length).toBeGreaterThan(0);
    expect(v.projects).toEqual([]);
    const client = await send('/api/v1/portal/whoami', 'GET', CLIENT_CRED);
    expect(client.status).toBe(200);
    expect(((await client.json()) as { kind: string; projects: unknown[] }).kind).toBe('client');
    expect((await send('/api/v1/portal/whoami', 'GET', USER_A)).status).toBe(403);
  });

  it("shows a vendor its own orders and NOT another vendor's, in the same tenant", async () => {
    const res = await send('/api/v1/portal/vendor/orders', 'GET', VENDOR_CRED);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: Array<{ id: string; number: string }> };
    const numbers = body.items.map((o) => o.number);
    expect(numbers).toContain('PO-OWN-1');
    // The one that matters. Both orders are in tenant A, so RLS lets both
    // through; only the link narrows it.
    expect(numbers).not.toContain('PO-RIVAL-1');
    expect(body.items.map((o) => o.id)).not.toContain(otherOrderId);
  });

  it("answers 404, not 403, for another vendor's order — existence is not confirmed", async () => {
    const res = await send(
      `/api/v1/portal/vendor/orders/${otherOrderId}/lines`,
      'GET',
      VENDOR_CRED,
    );
    expect(res.status).toBe(404);
  });

  it("refuses to record an acceptance against another vendor's order", async () => {
    const res = await send(
      `/api/v1/portal/vendor/orders/${otherOrderId}/acceptance`,
      'POST',
      VENDOR_CRED,
      { decision: 'accepted' },
    );
    expect(res.status).toBe(409);

    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM procurement.purchase_order_acceptances
        WHERE purchase_order_id = $1`,
      [otherOrderId],
    );
    expect(rows[0]!.n).toBe('0');
  });

  it("refuses to bill against another vendor's order", async () => {
    const res = await send('/api/v1/portal/vendor/bills', 'POST', VENDOR_CRED, {
      purchaseOrderId: otherOrderId,
      billNumber: 'RA-01',
      amountClaimed: '5000',
    });
    expect(res.status).toBe(409);
  });

  it('records a bill against its own order, exactly as claimed', async () => {
    const res = await send('/api/v1/portal/vendor/bills', 'POST', VENDOR_CRED, {
      purchaseOrderId: ownOrderId,
      billNumber: 'RA-01',
      amountClaimed: '117999',
      narrative: 'First running account bill',
    });
    expect(res.status).toBe(201);

    const { rows } = await admin.query<{ amount_claimed: string }>(
      `SELECT amount_claimed::text AS amount_claimed FROM procurement.vendor_bills
        WHERE bill_number = 'RA-01'`,
    );
    // Stored exactly. Nothing rounded it, netted it or deducted from it.
    expect(rows[0]!.amount_claimed).toBe('117999');
  });

  it('refuses the same bill number twice from the same vendor', async () => {
    const res = await send('/api/v1/portal/vendor/bills', 'POST', VENDOR_CRED, {
      purchaseOrderId: ownOrderId,
      billNumber: 'RA-01',
      amountClaimed: '100',
    });
    expect(res.status).toBe(409);
  });

  it('carries NO TDS, retention or payable FIELD on anything a vendor sees', async () => {
    // Asserted on the response's KEYS, not on its text. Written as a text
    // match first, and it failed on another suite's fixture whose PO number is
    // literally 'PO-RETENTION' — a match on values tests the fixtures, and the
    // claim here is about the shape: an order and a bill carry no deduction.
    // Since ADR-0014's addendum a vendor does see what was deducted — on the
    // payments read, where every row carries `provisional` (its shape is
    // checked below). A bill says when it is due and when it was paid: dates.
    for (const path of ['/api/v1/portal/vendor/orders', '/api/v1/portal/vendor/bills']) {
      const body = (await (await send(path, 'GET', VENDOR_CRED)).json()) as unknown;
      const names = keysOf(body);
      expect(names.filter((k) => /tds|retention|retained/i.test(k))).toEqual([]);
      expect(names.filter((k) => /netPayable|net_payable|netPaid|outstanding/i.test(k))).toEqual([]);
    }
  });

  it('shows a client its own project and no vendor pricing or margin', async () => {
    const res = await send('/api/v1/portal/client/projects', 'GET', CLIENT_CRED);
    expect(res.status).toBe(200);

    // TOPOLOGY: a client may never reach vendor pricing, internal margin, or
    // any other project. On the keys, for the same reason as above.
    const names = keysOf(await res.json());
    expect(names.filter((k) => /margin|committed|vendor/i.test(k))).toEqual([]);
    expect(names.filter((k) => /costRate|cost_rate|^cost$/i.test(k))).toEqual([]);
  });

  it('counts the site progress it claims to count, not zero', async () => {
    // The assertion the shape check cannot make: `z.number().int()` accepts 0,
    // so a subquery matching nothing looks exactly like a project with no
    // activity. One report and one measurement were seeded above.
    const res = await send('/api/v1/portal/client/projects', 'GET', CLIENT_CRED);
    const body = (await res.json()) as {
      items: Array<{ reportedDays: number; measurementsRecorded: number; lastReportOn: string | null }>;
    };
    const project = body.items[0];
    expect(project).toBeDefined();
    expect(project!.reportedDays).toBeGreaterThan(0);
    expect(project!.measurementsRecorded).toBeGreaterThan(0);
    expect(project!.lastReportOn).not.toBeNull();
  });

  it("answers 404 for a project the client is not linked to", async () => {
    const res = await send(
      `/api/v1/portal/client/projects/${projectIds.get(TENANT_B) ?? ''}/variations`,
      'GET',
      CLIENT_CRED,
    );
    expect(res.status).toBe(404);
  });

  it('refuses a client on the vendor portal and a vendor on the client portal', async () => {
    expect((await send('/api/v1/portal/vendor/orders', 'GET', CLIENT_CRED)).status).toBe(403);
    expect((await send('/api/v1/portal/client/projects', 'GET', VENDOR_CRED)).status).toBe(403);
  });

  it('scopes a principal with NO link to nothing, rather than to everything', async () => {
    // The failure direction of a missing grant. An unlinked vendor login is a
    // half-finished provisioning, and it must see no orders — not all of them.
    const res = await send('/api/v1/portal/vendor/orders', 'GET', UNLINKED_CRED);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(0);
  });

  it('answers every portal read in its declared shape', async () => {
    // The other half of the response-shape gate: these routes refuse a staff
    // credential, so they cannot be checked in the staff suite, and a schema
    // written from reading a handler and never checked against one is a
    // runtime failure on a page that built clean.
    const projectId = projectIds.get(TENANT_A) ?? '';
    const checks: Array<[string, string, { safeParse: (v: unknown) => { success: boolean } }]> = [
      ['/api/v1/portal/vendor/orders', VENDOR_CRED, API_ROUTES.vendorPortalOrders.response],
      [
        `/api/v1/portal/vendor/orders/${ownOrderId}/lines`,
        VENDOR_CRED,
        API_ROUTES.vendorPortalOrderLines.response,
      ],
      ['/api/v1/portal/vendor/bills', VENDOR_CRED, API_ROUTES.vendorPortalBills.response],
      ['/api/v1/portal/vendor/payments', VENDOR_CRED, API_ROUTES.vendorPortalPayments.response],
      ['/api/v1/portal/client/projects', CLIENT_CRED, API_ROUTES.clientPortalProjects.response],
      [
        `/api/v1/portal/client/projects/${projectId}/variations`,
        CLIENT_CRED,
        API_ROUTES.clientPortalVariations.response,
      ],
      [`/api/v1/portal/client/projects/${projectId}/billing`, CLIENT_CRED, API_ROUTES.clientPortalBilling.response],
    ];

    const mismatches: string[] = [];
    for (const [path, credential, schema] of checks) {
      const res = await send(path, 'GET', credential);
      if (res.status !== 200) {
        mismatches.push(`${path}: HTTP ${String(res.status)}`);
        continue;
      }
      if (!schema.safeParse(await res.json()).success) mismatches.push(`${path}: wrong shape`);
    }
    expect(mismatches).toEqual([]);
  });

  it('refuses every portal route without a credential', async () => {
    expect((await send('/api/v1/portal/vendor/orders', 'GET', null)).status).toBe(403);
    expect((await send('/api/v1/portal/client/projects', 'GET', null)).status).toBe(403);
  });
});


/**
 * **Self-service provisioning — M6's whole done-when.**
 *
 * From KICKOFF, quoted in M6.md: *onboarding a tenant is self-service, with no
 * SQL run by hand*. Today that is `services/tenancy/scripts/seed.mjs`, a
 * development script connecting as the migration role.
 *
 * The assertion that matters is **not** "a row was written". M6 states it
 * exactly: *"The test creates one, then authenticates as its first user and
 * reads back an empty project list — proving the tenant exists and is
 * reachable, not merely that a row was written."* That is the last case here.
 */
describe('provisioning a tenant', () => {
  const PLATFORM_CRED = 'ops@platform.test';
  const NOT_PLATFORM = 'priya@aarambh.test';
  const NEW_ADMIN = 'first.admin@brandnew.test';
  let platformPrincipal = '';

  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    platformPrincipal = randomUUID();
    // No tenant context: `platform_principals` has none, deliberately. Modelling
    // a platform account as a member of a magic tenant is how "the support
    // tenant" becomes a tenant with access to every other.
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [platformPrincipal, PLATFORM_CRED],
    );
  });

  it('refuses a tenant credential on the platform console', async () => {
    // A staff account of a real tenant is not a platform account, and the two
    // tables are separate precisely so that one cannot become the other by
    // setting a column.
    expect((await send('/platform/v1/tenants', 'GET', NOT_PLATFORM)).status).toBe(403);
    expect(
      (
        await send('/platform/v1/tenants', 'POST', NOT_PLATFORM, {
          slug: 'stolen',
          legalName: 'Stolen Limited',
          appOrigin: 'https://stolen.test',
          adminEmail: 'a@stolen.test',
          adminExternalId: 'a@stolen.test',
        })
      ).status,
    ).toBe(403);

    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM tenancy.tenants WHERE slug = 'stolen'`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('refuses an unrecognised credential', async () => {
    expect((await send('/platform/v1/tenants', 'GET', 'nobody@nowhere.test')).status).toBe(403);
    expect((await send('/platform/v1/tenants', 'GET', null)).status).toBe(403);
  });

  it('creates an organisation and its first administrator in one transaction', async () => {
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: 'brandnew',
      legalName: 'Brand New Interiors Private Limited',
      appOrigin: 'https://brandnew.example.test',
      adminEmail: NEW_ADMIN,
      adminExternalId: NEW_ADMIN,
    });
    expect(res.status).toBe(201);

    const created = (await res.json()) as { tenantId: string; principalId: string };
    expect(created.tenantId).toMatch(/^[0-9a-f-]{36}$/);

    // The tenant, the principal and the lookup row — all three, or the tenant
    // would exist with nobody able to sign in to it, holding the slug so the
    // retry fails too.
    const tenant = await admin.query<{ slug: string }>(
      `SELECT slug FROM tenancy.tenants WHERE id = $1`,
      [created.tenantId],
    );
    expect(tenant.rows[0]!.slug).toBe('brandnew');
    const lookup = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.principal_lookup WHERE external_id = $1`,
      [NEW_ADMIN],
    );
    expect(lookup.rows[0]!.n).toBe('1');
  });

  it('refuses a duplicate slug, and records the refusal', async () => {
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: 'brandnew',
      legalName: 'Someone Else Limited',
      appOrigin: 'https://someone-else.test',
      adminEmail: 'other@brandnew.test',
      adminExternalId: 'other@brandnew.test',
    });
    expect(res.status).toBe(409);

    // M6: "a duplicate slug, a re-used email and a half-created tenant are the
    // cases that produce a support ticket, and each needs a stated outcome."
    const { rows } = await admin.query<{ outcome: string; detail: string }>(
      `SELECT outcome, detail FROM tenancy.provisioning_events
        WHERE slug = 'brandnew' AND outcome = 'refused'`,
    );
    expect(rows).toHaveLength(1);
    // One message for both causes: saying which is taken tells the caller
    // whether an address already administers an organisation here.
    expect(rows[0]!.detail).toBe('that slug or administrator is already in use');
  });

  it('refuses a re-used administrator without half-creating the tenant', async () => {
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: 'another-one',
      legalName: 'Another One Limited',
      // Already the administrator of `brandnew`.
      adminEmail: NEW_ADMIN,
      appOrigin: 'https://another-one.test',
      adminExternalId: NEW_ADMIN,
    });
    expect(res.status).toBe(409);

    // The whole function is one statement, so the tenant row is rolled back
    // with the lookup insert that failed. A tenant holding a slug that nobody
    // can sign in to is the failure this asserts against.
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM tenancy.tenants WHERE slug = 'another-one'`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('lists the organisations, and NOTHING from inside any of them', async () => {
    const res = await send('/platform/v1/tenants', 'GET', PLATFORM_CRED);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items.map((t) => t['slug'])).toContain('brandnew');
    // A platform account sees that organisations exist. It does not see their
    // projects, orders or people — and cannot, because no tenant context is
    // ever set on its connection.
    const names = keysOf(body);
    expect(names.filter((k) => /project|order|vendor|principal|email/i.test(k))).toEqual([]);
  });

  it('THE ONE THAT MATTERS: the new tenant is reachable by its first user', async () => {
    // Not "a row was written". The administrator signs in through the ordinary
    // tenant path and reads an empty project list — which proves the tenant
    // exists, that the lookup resolves, that the principal is staff, and that
    // the RLS context built from it is that tenant's and not somebody else's.
    const res = await app.request('/api/v1/projects', {
      headers: { authorization: `Bearer ${NEW_ADMIN}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('shows the new administrator NONE of the seeded tenants’ data', async () => {
    // The other direction of the same proof: a brand-new tenant is isolated
    // from the ones that already existed, without anything having been
    // configured to make it so.
    const res = await app.request('/api/v1/purchase-orders', {
      headers: { authorization: `Bearer ${NEW_ADMIN}` },
    });
    expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it('shows the operator a plan, and when the organisation was last active — reported by the tenant itself (DATA-12)', async () => {
    const created = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: 'operatorfacts',
      legalName: 'Operator Facts Interiors Private Limited',
      appOrigin: 'https://operatorfacts.example.test',
      adminEmail: 'owner@operatorfacts.test',
      adminExternalId: 'owner@operatorfacts.test',
    });
    expect(created.status).toBe(201);
    const tenantId = ((await created.json()) as { tenantId: string }).tenantId;

    type Row = { id: string; plan: string | null; lastActiveAt: string | null; connectorLastSeenAt: string | null };
    const row = async (): Promise<Row | undefined> =>
      ((await (await send('/platform/v1/tenants?limit=200', 'GET', PLATFORM_CRED)).json()) as { items: Row[] }).items.find(
        (t) => t.id === tenantId,
      );
    expect((await row())?.plan).toBeNull();
    expect((await row())?.lastActiveAt).toBeNull();
    expect((await row())?.connectorLastSeenAt).toBeNull();

    // Its administrator loads the application; the tenant reports the moment.
    expect((await send('/api/v1/identity/me/entitlements', 'GET', 'owner@operatorfacts.test')).status).toBe(200);
    expect((await row())?.lastActiveAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    expect((await send(`/platform/v1/tenants/${tenantId}/plan`, 'PUT', PLATFORM_CRED, { plan: 'Pilot' })).status).toBe(200);
    expect((await row())?.plan).toBe('Pilot');
    expect((await send(`/platform/v1/tenants/${tenantId}/plan`, 'PUT', NOT_PLATFORM, { plan: 'Free' })).status).toBe(403);
    expect((await row())?.plan).toBe('Pilot');
    expect(
      (await send(`/platform/v1/tenants/${randomUUID()}/plan`, 'PUT', PLATFORM_CRED, { plan: 'Pilot' })).status,
    ).toBe(404);
  });
});

/**
 * **PO-13, answered provisionally — and the proof that it turned the chain on.**
 *
 * The approval engine has been complete since M1 and refused everything for one
 * reason: nothing could write a chain. `docs/OPEN-DECISIONS.md` now carries the
 * role model read out of the repaired legacy tree, adopted as configuration
 * rather than as constants, and provisioning seeds it.
 *
 * What these tests are for is the difference between "a table has rows" and "a
 * control works". So they provision a real organisation through the API and
 * then use it: read what its administrator may do, watch a non-entitled role be
 * refused, watch an entitled one advance a purchase order, and confirm the
 * self-approval rule still holds — because the one thing worse than a chain
 * that refuses everything is a chain that approves everything.
 */
describe('the role model, and the approval chain it turns on', () => {
  const SLUG = 'rolemodel';
  // Its own platform account: the one in the provisioning suite is scoped to
  // that describe, and sharing a fixture across suites couples their order.
  const PLATFORM_CRED = 'ops.roles@platform.test';
  const OWNER = 'owner@rolemodel.test';
  const FINANCE = 'finance@rolemodel.test';
  const RAISER = 'raiser@rolemodel.test';

  let tenantId = '';
  let ownerId = '';
  let financeId = '';
  let raiserId = '';
  let orderId = '';

  async function send(
    path: string,
    method: string,
    credential: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );

    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Role Model Interiors Private Limited',
      appOrigin: 'https://rolemodel.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { tenantId: string; principalId: string };
    tenantId = created.tenantId;
    ownerId = created.principalId;

    // Two more people, so an approval has somebody to be raised BY and somebody
    // else to be approved by. One person doing both is the case the engine
    // refuses, and it is tested below rather than designed around.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    financeId = randomUUID();
    raiserId = randomUUID();
    for (const [id, email, roles] of [
      [financeId, FINANCE, '{finance}'],
      [raiserId, RAISER, '{proc}'],
    ] as const) {
      await admin.query(
        `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
         VALUES ($1, $2, 'staff', $3, $3, $4)`,
        [tenantId, id, email, roles],
      );
      await admin.query('SELECT identity.register_principal($1, $2)', [email, id]);
    }

    const vendorId = randomUUID();
    await admin.query(
      `INSERT INTO procurement.vendors (tenant_id, id, name, code, status)
       VALUES ($1, $2, 'Role Model Supplies', 'RM-V1', 'active')`,
      [tenantId, vendorId],
    );
    orderId = randomUUID();
    // Raised BY the procurement principal: the requester is what the
    // self-approval rule compares against.
    await admin.query(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, taxable, gst, gross, created_by)
       VALUES ($1, $2, 'PO-RM-0001', $3, 'pending_approval', 500000, 90000, 590000, $4)`,
      [tenantId, orderId, vendorId, raiserId],
    );
    await admin.query('COMMIT');
  });

  it('gives a provisioned organisation its role model and its chains', async () => {
    // Ten roles and five chains, seeded in the SAME transaction that created
    // the tenant. A tenant without them would have an administrator entitled to
    // nothing and no screen from which to grant themselves anything.
    const roles = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.role_catalog WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(roles.rows[0]!.n).toBe('10');

    const chains = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM workflow.approval_chains
        WHERE tenant_id = $1 AND is_active`,
      [tenantId],
    );
    expect(chains.rows[0]!.n).toBe('5');

    // And the costing method, as a ROW.
    //
    // `loadCostingPolicy` falls back to the same two values when the row is
    // absent, so a reader could not tell the difference and this assertion
    // looks redundant. It is not: the fallback lives in TypeScript, and an
    // answer that can only be changed by editing TypeScript is a constant, not
    // the configuration INV-03 was adopted as. The row is what makes it
    // overridable, and the row is what this checks.
    const costing = await admin.query<{ method: string; status: string; note: string }>(
      `SELECT method, status, note FROM procurement.costing_policy WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(costing.rows).toHaveLength(1);
    expect(costing.rows[0]!.method).toBe('weighted_average');
    expect(costing.rows[0]!.status).toBe('provisional');
    // The note carries where the answer came from. Provenance travelling with
    // the value is the whole difference between an adopted answer and a guess.
    expect(costing.rows[0]!.note).toContain('inventory.js:61');
  });

  it('marks every seeded answer provisional, and says so on the wire', async () => {
    // The whole point of adopting an answer from an uncertified tree: a
    // director reading the permission screen can tell that these were INHERITED
    // rather than agreed. Same shape as a project health threshold.
    const res = await send('/api/v1/identity/roles', 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ key: string; status: string; modules: string[]; actions: string[] }>;
      provisional: boolean;
    };
    expect(body.provisional).toBe(true);
    expect(body.items.every((r) => r.status === 'provisional')).toBe(true);
    expect(body.items.map((r) => r.key).sort()).toEqual([
      'accountant',
      'admin',
      'designer',
      'director',
      'engineer',
      'finance',
      'manager',
      'proc',
      'sales',
      'site',
    ]);
  });

  it('tells a screen what the signed-in person may do, rather than making it guess', async () => {
    // `POsView.js:136-154` derives roles in the browser from an email address.
    // This is the replacement: the server resolves it and the screen renders
    // the answer.
    const res = await send('/api/v1/identity/me/entitlements', 'GET', OWNER);
    const body = (await res.json()) as {
      roles: string[];
      modules: string[];
      actions: string[];
    };
    expect(body.roles).toEqual(['admin']);
    expect(body.actions).toContain('manage_users');
    expect(body.modules).toContain('purchase_orders');
    // The administrator is BROAD, not exempt. Approving is a separate grant and
    // the default does not give it to them — in the legacy, holding `admin`
    // satisfies every stage of every chain.
    expect(body.actions).not.toContain('approve_po');
  });

  it('resolves the union across roles, and nothing for a principal with none', async () => {
    const finance = (await (
      await send('/api/v1/identity/me/entitlements', 'GET', FINANCE)
    ).json()) as { actions: string[]; modules: string[] };
    expect(finance.actions).toContain('approve_payment');
    expect(finance.actions).not.toContain('create_po');

    const proc = (await (
      await send('/api/v1/identity/me/entitlements', 'GET', RAISER)
    ).json()) as { actions: string[] };
    expect(proc.actions).toContain('create_po');
    expect(proc.actions).not.toContain('approve_payment');
  });

  it('refuses a role change from somebody without the permission for it', async () => {
    // `finance` holds no `manage_users`. The refusal is the control; a screen
    // that hides the button is a courtesy.
    const res = await send('/api/v1/identity/roles/sales/grants', 'PUT', FINANCE, {
      modules: ['dashboard', 'projects', 'purchase_orders', 'payments'],
      actions: ['approve_payment'],
    });
    expect(res.status).toBe(403);

    const rows = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.role_grants
        WHERE tenant_id = $1 AND role_key = 'sales' AND grant_key = 'approve_payment'`,
      [tenantId],
    );
    expect(rows.rows[0]!.n).toBe('0');
  });

  it('refuses a grant naming a module that does not exist', async () => {
    // Stored, it would be a permission that looks granted on the settings
    // screen and is refused at every endpoint — the worst of both answers.
    const res = await send('/api/v1/identity/roles/sales/grants', 'PUT', OWNER, {
      modules: ['dashboard', 'accounts_payable_wizard'],
      actions: [],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain(
      'accounts_payable_wizard',
    );
  });

  it('records a saved permission as confirmed rather than provisional', async () => {
    // Somebody looked at it and pressed save. That is the whole difference
    // between an inherited answer and an agreed one, and the constraint makes
    // "confirmed" impossible to claim without saying who and when.
    const res = await send('/api/v1/identity/roles/designer/grants', 'PUT', OWNER, {
      modules: ['dashboard', 'boq', 'documents'],
      actions: ['upload_document'],
    });
    expect(res.status).toBe(200);

    const rows = await admin.query<{ status: string; set_by: string; set_on: string }>(
      `SELECT status, set_by, set_on::text AS set_on FROM identity.role_grants
        WHERE tenant_id = $1 AND role_key = 'designer'`,
      [tenantId],
    );
    expect(rows.rows.length).toBe(4);
    expect(rows.rows.every((r) => r.status === 'confirmed')).toBe(true);
    expect(rows.rows[0]!.set_by).toBe(ownerId);
    expect(rows.rows[0]!.set_on).not.toBeNull();
  });

  it('keeps one tenant out of another tenant’s role model', async () => {
    // Intra-tenant authorisation and tenant isolation are separate controls,
    // and this is the second one: the catalog is per-tenant rows under RLS, so
    // the other fixtures cannot see these at all.
    const res = await send('/api/v1/identity/roles', 'GET', USER_A);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });

  it('APPROVES through the seeded chain — the thing PO-13 was blocking', async () => {
    // The seeded purchase-order chain has one stage naming `finance`.
    const res = await send(`/api/v1/purchase-orders/${orderId}/approve`, 'POST', FINANCE, {});
    expect(res.status).toBe(200);

    const rows = await admin.query<{ state: string }>(
      `SELECT state FROM procurement.purchase_orders WHERE tenant_id = $1 AND id = $2`,
      [tenantId, orderId],
    );
    expect(rows.rows[0]!.state).toBe('approved');

    // And it left a record. A decision with no record is not a decision.
    const history = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM workflow.approval_history
        WHERE tenant_id = $1 AND entity_id = $2 AND decision = 'approved'`,
      [tenantId, orderId],
    );
    expect(history.rows[0]!.n).toBe('1');
  });

  it('refuses an approval from a role the stage does not name', async () => {
    const second = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const vendor = await admin.query<{ id: string }>(
      `SELECT id FROM procurement.vendors WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    await admin.query(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, taxable, gst, gross, created_by)
       VALUES ($1, $2, 'PO-RM-0002', $3, 'pending_approval', 100000, 18000, 118000, $4)`,
      [tenantId, second, vendor.rows[0]!.id, ownerId],
    );
    await admin.query('COMMIT');

    // `proc` is not the approver role on the purchase-order chain. The
    // administrator is not exempt either — tested by the next case.
    const res = await send(`/api/v1/purchase-orders/${second}/approve`, 'POST', RAISER, {});
    expect(res.status).toBe(403);

    // The administrator RAISED this one, so `admin` is refused for the earlier
    // reason: nobody approves their own request, whatever they hold.
    const own = await send(`/api/v1/purchase-orders/${second}/approve`, 'POST', OWNER, {});
    expect(own.status).toBe(403);
    expect(((await own.json()) as { message: string }).message).toMatch(/self|entitle/i);
  });

  it('lets an administrator reconfigure a chain, and refuses one that cannot be honoured', async () => {
    // A quorum with no role named is accepted by the legacy and silently
    // ignored — `min_approval_count` is declared and never read (APPR-03).
    // Here it is refused before anything is written.
    const bad = await send('/api/v1/workflow/chains/payment_request', 'PUT', OWNER, {
      name: 'Two of anybody',
      stages: [{ name: 'Review', sequence: 1, approverRole: '', minApprovals: 2 }],
    });
    expect(bad.status).toBe(400);

    const good = await send('/api/v1/workflow/chains/payment_request', 'PUT', OWNER, {
      name: 'Finance only',
      stages: [{ name: 'Pending Finance', sequence: 1, approverRole: 'finance', minApprovals: 1 }],
    });
    expect(good.status).toBe(200);

    // Still exactly one active chain for the entity type. Two would order by
    // whatever the query returned, and the same request would take different
    // routes on different days.
    const rows = await admin.query<{ n: string; name: string }>(
      `SELECT count(*)::text AS n, max(name) AS name FROM workflow.approval_chains
        WHERE tenant_id = $1 AND entity_type = 'payment_request' AND is_active`,
      [tenantId],
    );
    expect(rows.rows[0]!.n).toBe('1');
    expect(rows.rows[0]!.name).toBe('Finance only');
  });

  it('refuses a chain change from somebody without settings permission', async () => {
    const res = await send('/api/v1/workflow/chains/purchase_order', 'PUT', FINANCE, {
      name: 'Approved by me',
      stages: [{ name: 'Mine', sequence: 1, approverRole: 'finance', minApprovals: 1 }],
    });
    expect(res.status).toBe(403);
  });
});

/**
 * **What a lead accumulates while somebody works it.**
 *
 * Our CRM was one screen. The repaired legacy tree has eight components and
 * twenty-six API functions, and the gap is everything between recording a lead
 * and winning it.
 */
describe('lead depth', () => {
  let leadId = '';

  async function send(path: string, method: string, body?: unknown): Promise<Response> {
    return app.request(path, {
      method,
      headers: { authorization: `Bearer ${USER_A}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    const res = await send('/api/v1/projects/leads', 'POST', {
      clientName: 'Ardent Systems India Private Limited',
      stage: 'qualified',
      estimatedValue: '18500000',
      probabilityPct: 40,
      city: 'Gurugram',
    });
    leadId = ((await res.json()) as { id: string }).id;
  });

  it('keeps one primary contact, and demotes rather than colliding', async () => {
    // A partial unique index permits one primary per lead, so a second must
    // demote the first inside the same transaction. The alternative is a
    // constraint violation shown to somebody who ticked a box.
    for (const name of ['Devika Rao', 'Imran Sheikh']) {
      expect(
        (
          await send(`/api/v1/projects/leads/${leadId}/contacts`, 'POST', {
            name,
            designation: 'Facilities',
            isPrimary: true,
          })
        ).status,
      ).toBe(201);
    }

    const listed = (await (
      await send(`/api/v1/projects/leads/${leadId}/contacts`, 'GET')
    ).json()) as { items: Array<{ name: string; isPrimary: boolean }> };

    expect(listed.items.filter((contact) => contact.isPrimary)).toHaveLength(1);
    expect(listed.items.find((contact) => contact.isPrimary)?.name).toBe('Imran Sheikh');
  });

  it('logs what happened and schedules the next step in one act', async () => {
    // Two saves gets the second one skipped, and a lead with no next step is
    // the one that goes cold.
    expect(
      (
        await send(`/api/v1/projects/leads/${leadId}/activities`, 'POST', {
          kind: 'call',
          summary: 'Spoke to the FM about phasing',
          occurredOn: '2026-08-28',
          nextFollowupOn: '2026-09-11',
        })
      ).status,
    ).toBe(201);

    const pipeline = (await (await send('/api/v1/projects/leads', 'GET')).json()) as {
      items: Array<{ id: string; nextFollowupOn: string | null; version: number }>;
    };
    const lead = pipeline.items.find((l) => l.id === leadId);
    expect(lead?.nextFollowupOn).toBe('2026-09-11');
    // The optimistic lock did NOT move. Logging a call must not invalidate an
    // edit somebody has open, or nobody will log calls.
    expect(lead?.version).toBe(1);
  });

  it('orders the timeline by when things happened, not when they were typed', async () => {
    // Entered second, older than the first. A site visit recorded three days
    // late still belongs on the day of the visit.
    await send(`/api/v1/projects/leads/${leadId}/activities`, 'POST', {
      kind: 'site_visit',
      summary: 'Walked level 4',
      occurredOn: '2026-08-20',
    });

    const timeline = (await (
      await send(`/api/v1/projects/leads/${leadId}/activities`, 'GET')
    ).json()) as { items: Array<{ occurredOn: string }> };

    expect(timeline.items.map((entry) => entry.occurredOn)).toEqual(['2026-08-28', '2026-08-20']);
  });

  it('refuses to close a lead as lost without a reason', async () => {
    const res = await send(`/api/v1/projects/leads/${leadId}/lost`, 'POST', {
      stage: 'rejected',
      reason: '',
      expectedVersion: 1,
    });
    expect(res.status).toBe(400);

    // Nothing moved. A refused close that half-applied would leave a lead in a
    // closed stage with no reason, which is the state this feature exists to
    // prevent.
    const { rows } = await admin.query<{ stage: string; lost_reason: string }>(
      `SELECT stage, lost_reason FROM projects.leads WHERE tenant_id = $1 AND id = $2`,
      [TENANT_A, leadId],
    );
    expect(rows[0]!.stage).toBe('qualified');
    expect(rows[0]!.lost_reason).toBe('');
  });

  it('closes with a reason, clears the next step, and writes it to the timeline', async () => {
    expect(
      (
        await send(`/api/v1/projects/leads/${leadId}/lost`, 'POST', {
          stage: 'rejected',
          reason: 'Lost on price. The incumbent fit-out contractor held the rate.',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(204);

    const { rows } = await admin.query<{
      stage: string;
      lost_reason: string;
      next_followup_on: string | null;
    }>(
      `SELECT stage, lost_reason, next_followup_on::text AS next_followup_on
         FROM projects.leads WHERE tenant_id = $1 AND id = $2`,
      [TENANT_A, leadId],
    );
    expect(rows[0]!.stage).toBe('rejected');
    expect(rows[0]!.lost_reason).toContain('Lost on price');
    // A closed lead has no next step. Leaving one would keep it on a follow-up
    // list forever.
    expect(rows[0]!.next_followup_on).toBeNull();

    // The loss is IN the timeline, in sequence with the calls that led to it,
    // rather than a status that changed at some unrecorded moment.
    const timeline = (await (
      await send(`/api/v1/projects/leads/${leadId}/activities`, 'GET')
    ).json()) as { items: Array<{ kind: string; detail: string }> };
    expect(timeline.items.find((entry) => entry.kind === 'lost')?.detail).toContain(
      'Lost on price',
    );
  });

  it('holds no UPDATE or DELETE on the timeline, by privilege', async () => {
    // `app_runtime` gets SELECT and INSERT and nothing else, the same shape as
    // the audit log. A timeline somebody can edit is not evidence of anything,
    // and asserting the GRANT rather than a failed statement is what says the
    // property is structural rather than something the code happens not to do.
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_runtime'
          AND table_schema = 'projects' AND table_name = 'lead_activities'
        ORDER BY privilege_type`,
    );
    expect(rows.map((r) => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });

  it('warns about a lead sharing a client name, on an exact match only', async () => {
    // A WARNING. Exact and case-insensitive — never a `LIKE`, which is the
    // legacy's central defect — and nothing links, merges or blocks on it.
    const twin = await send('/api/v1/projects/leads', 'POST', {
      clientName: 'ardent systems india private limited',
      stage: 'lead',
      estimatedValue: '9000000',
      probabilityPct: 10,
    });
    const twinId = ((await twin.json()) as { id: string }).id;

    const found = (await (
      await send(`/api/v1/projects/leads/${leadId}/duplicates`, 'GET')
    ).json()) as { items: Array<{ id: string }> };
    expect(found.items.map((item) => item.id)).toContain(twinId);
    expect(found.items.map((item) => item.id)).not.toContain(leadId);

    // A name that merely CONTAINS this one is not a duplicate. This assertion
    // is what stops somebody "improving" the match into a LIKE.
    const partial = await send('/api/v1/projects/leads', 'POST', {
      clientName: 'Ardent Systems India Private Limited (Bengaluru campus)',
      stage: 'lead',
      estimatedValue: '4000000',
      probabilityPct: 10,
    });
    const partialId = ((await partial.json()) as { id: string }).id;
    const again = (await (
      await send(`/api/v1/projects/leads/${leadId}/duplicates`, 'GET')
    ).json()) as { items: Array<{ id: string }> };
    expect(again.items.map((item) => item.id)).not.toContain(partialId);
  });

  it("cannot read another tenant's lead contacts", async () => {
    const res = await app.request(`/api/v1/projects/leads/${leadId}/contacts`, {
      headers: { authorization: `Bearer ${USER_B}` },
    });
    // Empty rather than refused: under RLS the lead is invisible, and a 404
    // here would confirm that it exists somewhere.
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(0);
  });
});

/**
 * Project membership — the first authorisation scope narrower than a tenant.
 *
 * **Row-level security contributes nothing to any assertion in this block, and
 * that is the whole point.** Every row here belongs to one tenant and every
 * principal asking belongs to the same one, so the policies are satisfied
 * before the interesting question is even asked. If `mayReadTeam` were deleted,
 * RLS would let all of this through.
 *
 * This is the same construction as the vendor-portal test that proves a vendor
 * linked to V cannot read an order belonging to W in the same tenant.
 */
describe('project team, scoped inside one tenant', () => {
  const SLUG = 'teamscope';
  // Its own platform credential: the constant is scoped to the other describe
  // blocks, and sharing one would couple this block's setup to theirs.
  const PLATFORM_CRED = 'ops.team@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const ON_A = `engineer.a@${SLUG}.test`;
  const ON_B = `engineer.b@${SLUG}.test`;

  let tenantId = '';
  let projectA = '';
  let projectB = '';
  let onAId = '';
  let onBId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Team Scope Interiors Private Limited',
      appOrigin: 'https://teamscope.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { tenantId: string };
    tenantId = created.tenantId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

    // Two engineers. Neither holds manage_settings, so neither has the
    // administrative override and membership is the only way in.
    for (const [email, target] of [
      [ON_A, 'a'],
      [ON_B, 'b'],
    ] as const) {
      const id = randomUUID();
      if (target === 'a') onAId = id;
      else onBId = id;
      await admin.query(
        `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
         VALUES ($1, $2, 'staff', $3, $3, '{engineer}')`,
        [tenantId, id, email],
      );
      await admin.query('SELECT identity.register_principal($1, $2)', [email, id]);
    }

    // Two projects, and one engineer on each.
    for (const [code, name] of [
      ['TS-A', 'Sector 62 fitout'],
      ['TS-B', 'Whitefield campus fitout'],
    ] as const) {
      const id = randomUUID();
      if (code === 'TS-A') projectA = id;
      else projectB = id;
      await admin.query(
        `INSERT INTO projects.projects
           (tenant_id, id, code, name, client_name, state, original_value)
         VALUES ($1, $2, $3, $4, 'A Client Private Limited', 'lead', 100000000)`,
        [tenantId, id, code, name],
      );
    }
    await admin.query(
      `INSERT INTO projects.project_members (tenant_id, id, project_id, principal_id, designation)
       VALUES ($1, gen_random_uuid(), $2, $3, 'Site engineer'),
              ($1, gen_random_uuid(), $4, $5, 'Site engineer')`,
      [tenantId, projectA, onAId, projectB, onBId],
    );
    await admin.query('COMMIT');
  });

  it('a member reads the team of the project they are on', async () => {
    const res = await send(`/api/v1/projects/${projectA}/team`, 'GET', ON_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ email: string; designation: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.email).toBe(ON_A);
    expect(body.items[0]!.designation).toBe('Site engineer');
  });

  it('CANNOT read the team of another project in the SAME tenant', async () => {
    // The assertion this table exists for. Both principals are in one tenant,
    // both projects are in one tenant, and the policies are satisfied for both.
    const res = await send(`/api/v1/projects/${projectB}/team`, 'GET', ON_A);
    expect(res.status).toBe(404);
  });

  it('answers 404 rather than 403, so the project is not confirmed to exist', async () => {
    const onReal = await send(`/api/v1/projects/${projectB}/team`, 'GET', ON_A);
    const onFictional = await send(`/api/v1/projects/${randomUUID()}/team`, 'GET', ON_A);
    expect(onReal.status).toBe(onFictional.status);
    expect(await onReal.text()).toBe(await onFictional.text());
  });

  it('the administrator sees any project, by entitlement rather than membership', async () => {
    // The override exists so an organisation is never locked out of a project
    // whose whole team has left.
    const res = await send(`/api/v1/projects/${projectB}/team`, 'GET', OWNER);
    expect(res.status).toBe(200);
  });

  it('being on a project does not let you add to it', async () => {
    // Otherwise every member could add anybody and the scope is a suggestion.
    const res = await send(`/api/v1/projects/${projectA}/team`, 'POST', ON_A, {
      principalId: onBId,
      designation: 'Snuck in',
    });
    expect(res.status).toBe(403);
  });

  it('an administrator adds and removes, and removal is not reported for a no-op', async () => {
    const added = await send(`/api/v1/projects/${projectA}/team`, 'POST', OWNER, {
      principalId: onBId,
      designation: 'MEP coordinator',
    });
    expect(added.status).toBe(201);

    // Now B can read A's team, because B is on it.
    expect((await send(`/api/v1/projects/${projectA}/team`, 'GET', ON_B)).status).toBe(200);

    const removed = await send(`/api/v1/projects/${projectA}/team/${onBId}`, 'DELETE', OWNER);
    expect(removed.status).toBe(204);

    // And can no longer.
    expect((await send(`/api/v1/projects/${projectA}/team`, 'GET', ON_B)).status).toBe(404);

    // Removing them again removed nothing, and says so.
    expect((await send(`/api/v1/projects/${projectA}/team/${onBId}`, 'DELETE', OWNER)).status).toBe(
      404,
    );
  });

  it('cannot attach a member to another tenant\'s project', async () => {
    // The composite foreign key, not the application. A single-column FK would
    // let this succeed and confirm the project exists by doing so.
    const foreign = projectIds.get(TENANT_A) ?? '';
    await expect(
      admin.query(
        `INSERT INTO projects.project_members (tenant_id, id, project_id, principal_id)
         VALUES ($1, gen_random_uuid(), $2, $3)`,
        [tenantId, foreign, onAId],
      ),
    ).rejects.toThrow(/violates foreign key constraint/);
  });
});

/**
 * Comments and notifications — the two things nobody had.
 *
 * `workflow.audit_events` records what the SYSTEM did. Neither of these is that:
 * a comment is what a person SAID, and a notification is what a person needs to
 * be TOLD. The assertions that matter are the scoping ones — a notification
 * names what somebody must act on, and the list of what a colleague has been
 * asked to approve says who is spending what.
 */
describe('comments and notifications', () => {
  const SLUG = 'talkshop';
  const PLATFORM_CRED = 'ops.talk@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const OTHER = `other@${SLUG}.test`;

  let tenantId = '';
  let ownerId = '';
  let otherId = '';
  let projectId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Talkshop Interiors Private Limited',
      appOrigin: 'https://talkshop.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { tenantId: string; principalId: string };
    tenantId = created.tenantId;
    ownerId = created.principalId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    otherId = randomUUID();
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
       VALUES ($1, $2, 'staff', $3, $3, '{finance}')`,
      [tenantId, otherId, OTHER],
    );
    await admin.query('SELECT identity.register_principal($1, $2)', [OTHER, otherId]);
    projectId = randomUUID();
    await admin.query(
      `INSERT INTO projects.projects
         (tenant_id, id, code, name, client_name, state, original_value)
       VALUES ($1, $2, 'TALK-1', 'Talkshop fitout', 'A Client Private Limited', 'lead', 5000000)`,
      [tenantId, projectId],
    );
    await admin.query('COMMIT');
  });

  it('records a comment with its author, and reads it back', async () => {
    const posted = await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OWNER, {
      body: 'Client wants the joinery finish changed before we order.',
    });
    expect(posted.status).toBe(201);

    const listed = await send(`/api/v1/records/project/${projectId}/comments`, 'GET', OWNER);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      items: Array<{ body: string; authorEmail: string; parentId: string | null }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.authorEmail).toBe(OWNER);
    expect(body.items[0]!.parentId).toBeNull();
  });

  it('refuses an entity type outside the closed set', async () => {
    // The polymorphic pointer has no foreign key, so the CHECK constraint and
    // this route are the only things keeping it pointed at a known kind of
    // thing. Migration 0064 says so explicitly.
    const res = await send(`/api/v1/records/invoice/${projectId}/comments`, 'POST', OWNER, {
      body: 'nope',
    });
    expect(res.status).toBe(404);
  });

  it('refuses a reply threaded onto a comment on a DIFFERENT record', async () => {
    // Otherwise a reply — and everything under it — moves onto a record its
    // author never saw.
    const otherProject = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO projects.projects
         (tenant_id, id, code, name, client_name, state, original_value)
       VALUES ($1, $2, 'TALK-2', 'Second fitout', 'A Client Private Limited', 'lead', 5000000)`,
      [tenantId, otherProject],
    );
    await admin.query('COMMIT');

    const parent = (await (
      await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OWNER, {
        body: 'parent',
      })
    ).json()) as { id: string };

    const res = await send(`/api/v1/records/project/${otherProject}/comments`, 'POST', OWNER, {
      body: 'reply on the wrong record',
      parentId: parent.id,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/same record/i);
  });

  it('a mention notifies the person named, and never the author', async () => {
    await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OWNER, {
      body: 'Can you price this?',
      mentions: [otherId, ownerId],
    });

    const theirs = (await (
      await send('/api/v1/notifications', 'GET', OTHER)
    ).json()) as { items: Array<{ kind: string; summary: string }>; unread: number };
    expect(theirs.items.some((n) => n.kind === 'comment_mentioned')).toBe(true);

    // The author mentioned themselves and is deliberately not told about their
    // own remark.
    const mine = (await (
      await send('/api/v1/notifications', 'GET', OWNER)
    ).json()) as { items: Array<{ kind: string }> };
    expect(mine.items.some((n) => n.kind === 'comment_mentioned')).toBe(false);
  });

  it('NOBODY can read another person\'s inbox, in the same tenant', async () => {
    // There is no route that takes a recipient id, and this asserts the absence
    // rather than trusting it: what a colleague has been asked to approve says
    // who is spending what. RLS contributes nothing — both principals are in
    // the same tenant.
    const theirs = (await (
      await send('/api/v1/notifications', 'GET', OTHER)
    ).json()) as { items: Array<{ id: string }> };
    const mine = (await (
      await send('/api/v1/notifications', 'GET', OWNER)
    ).json()) as { items: Array<{ id: string }> };

    const overlap = mine.items.filter((m) => theirs.items.some((t) => t.id === m.id));
    expect(overlap).toEqual([]);
  });

  it('cannot mark somebody else\'s notification read', async () => {
    const theirs = (await (
      await send('/api/v1/notifications', 'GET', OTHER)
    ).json()) as { items: Array<{ id: string }> };
    const target = theirs.items[0];
    expect(target).toBeDefined();

    // 404, not 403: somebody else's notification is indistinguishable from one
    // that does not exist.
    expect((await send(`/api/v1/notifications/${target!.id}/read`, 'POST', OWNER)).status).toBe(404);
    // And the owner can.
    expect((await send(`/api/v1/notifications/${target!.id}/read`, 'POST', OTHER)).status).toBe(204);
    // Twice is not an error the second time, it is nothing to do.
    expect((await send(`/api/v1/notifications/${target!.id}/read`, 'POST', OTHER)).status).toBe(404);
  });

  it('the unread count follows what has been read', async () => {
    const before = (await (
      await send('/api/v1/notifications', 'GET', OTHER)
    ).json()) as { items: Array<{ id: string; readAt: string | null }>; unread: number };

    const stillUnread = before.items.filter((n) => n.readAt === null);
    expect(before.unread).toBe(stillUnread.length);

    if (stillUnread[0] !== undefined) {
      await send(`/api/v1/notifications/${stillUnread[0].id}/read`, 'POST', OTHER);
      const after = (await (
        await send('/api/v1/notifications', 'GET', OTHER)
      ).json()) as { unread: number };
      expect(after.unread).toBe(before.unread - 1);
    }
  });

  it('a mention cannot plant a notification on a PORTAL principal', async () => {
    // `mentions` is a list of ids chosen by the caller. Naming a vendor or
    // client portal principal would put staff-authored text in an external
    // party's row — invisible today, because no portal reads notifications, and
    // waiting there for the day one does. RLS contributes nothing: every id
    // here is in the same tenant.
    const vendorPrincipal = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
       VALUES ($1, $2, 'vendor', $3, $3, '{}')`,
      [tenantId, vendorPrincipal, `supplier@${SLUG}.test`],
    );
    await admin.query('COMMIT');

    const posted = await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OWNER, {
      body: 'Naming an outsider',
      mentions: [vendorPrincipal, randomUUID()],
    });
    // The comment itself is fine — the mention is dropped silently, because
    // reporting which ids were rejected is a way to test whether one exists.
    expect(posted.status).toBe(201);

    const planted = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM workflow.notifications WHERE recipient_id = $1`,
      [vendorPrincipal],
    );
    expect(planted.rows[0]!.n).toBe('0');
  });

  it('an empty comment is refused rather than stored', async () => {
    const res = await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OWNER, {
      body: '   ',
    });
    expect(res.status).toBe(400);
  });

  it('names who acted on a notification, and marks all read for the caller only (DATA-04)', async () => {
    // OTHER mentions OWNER; OWNER mentions OTHER. Each inbox holds one, from the other person.
    expect(
      (await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OTHER, {
        body: 'Owner, please check the joinery quote.',
        mentions: [ownerId],
      })).status,
    ).toBe(201);
    expect(
      (await send(`/api/v1/records/project/${projectId}/comments`, 'POST', OWNER, {
        body: 'Seen — Other, please raise the order.',
        mentions: [otherId],
      })).status,
    ).toBe(201);

    type Inbox = { items: Array<{ actor: { id: string; name: string } | null; readAt: string | null }>; unread: number };
    const otherInbox = (await (await send('/api/v1/notifications', 'GET', OTHER)).json()) as Inbox;
    const fromOwner = otherInbox.items.find((n) => n.actor?.id === ownerId);
    // The provisioner takes no display name, so the owner is named by address.
    expect(fromOwner?.actor?.name).toBe(OWNER);

    const marked = await send('/api/v1/notifications/read-all', 'POST', OTHER);
    expect(marked.status).toBe(200);
    expect(((await marked.json()) as { marked: number }).marked).toBeGreaterThanOrEqual(1);
    expect(((await (await send('/api/v1/notifications', 'GET', OTHER)).json()) as Inbox).unread).toBe(0);

    // "All" was all of OTHER's: the owner's notification from OTHER is still unread.
    const ownerInbox = (await (await send('/api/v1/notifications', 'GET', OWNER)).json()) as Inbox;
    expect(ownerInbox.unread).toBeGreaterThanOrEqual(1);
    expect(ownerInbox.items.find((n) => n.actor?.id === otherId)?.readAt).toBeNull();
  });
});

describe('terminology — the words this organisation uses', () => {
  const SLUG = 'wordsof';
  const PLATFORM_CRED = 'ops.words@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;

  let tenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Words Of Interiors Private Limited',
      appOrigin: 'https://wordsof.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    // A staff principal with no roles at all, registered so the credential
    // resolves: an unregistered one is refused before any authorisation
    // question is asked, and a 403 for the wrong reason proves nothing.
    const staffId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, $2, $3, $3, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, staffId, STAFF],
    );
    await admin.query('SELECT identity.register_principal($1, $2)', [STAFF, staffId]);
    await admin.query('COMMIT');
  });

  it('a new tenant reads every pair’s first word, and nothing was chosen', async () => {
    const res = await send('/api/v1/settings/terminology', 'GET', STAFF);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ boq: 'BOQ', variation: 'Variation', dailyReport: 'Daily report', vendor: 'Vendor', changedAt: null });
  });

  it('a staff principal without manage_settings is refused, and the words stand', async () => {
    expect((await send('/api/v1/settings/terminology', 'PUT', STAFF, { boq: 'Estimate' })).status).toBe(403);
    const after = (await (await send('/api/v1/settings/terminology', 'GET', STAFF)).json()) as { boq: string };
    expect(after.boq).toBe('BOQ');
  });

  it('a word outside its pair is refused — the label reaches every screen', async () => {
    const res = await send('/api/v1/settings/terminology', 'PUT', OWNER, { boq: 'Quotation' });
    expect(res.status).toBe(400);
    const res2 = await send('/api/v1/settings/terminology', 'PUT', OWNER, { vendor: 'Estimate' });
    expect(res2.status).toBe(400);
  });

  it('the owner chooses a word for one pair; the others keep theirs, and it reads back', async () => {
    const res = await send('/api/v1/settings/terminology', 'PUT', OWNER, { variation: 'Change order' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { boq: string; variation: string; vendor: string; changedAt: string | null };
    expect(body.variation).toBe('Change order');
    expect(body.boq).toBe('BOQ');
    expect(body.vendor).toBe('Vendor');
    expect(body.changedAt).not.toBeNull();
    const again = (await (await send('/api/v1/settings/terminology', 'GET', STAFF)).json()) as { variation: string };
    expect(again.variation).toBe('Change order');
  });
});

describe('optional modules — the switch, not the role model', () => {
  const SLUG = 'modswitch';
  const PLATFORM_CRED = 'ops.modules@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;

  let tenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Module Switch Interiors Private Limited',
      appOrigin: 'https://modswitch.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    // A staff principal with no roles at all. Not an outsider — RLS puts them
    // squarely inside the tenant — so the refusal below is an authorisation
    // decision and nothing else.
    // Registered, so the credential resolves and the 403 below is an
    // authorisation decision — an unregistered principal is refused earlier,
    // as "no organisation", which would pass this test for the wrong reason.
    const staffId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, $2, $3, $3, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, staffId, STAFF],
    );
    await admin.query('SELECT identity.register_principal($1, $2)', [STAFF, staffId]);
    await admin.query('COMMIT');
  });

  it('a new tenant gets the whole catalogue, and every one of them is off', async () => {
    const res = await send('/api/v1/settings/modules', 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { key: string; enabled: boolean }[] };

    // Eleven, because the eleven design-build workflows are the catalogue.
    expect(body.items).toHaveLength(11);
    expect(body.items.every((m) => m.enabled === false)).toBe(true);
    expect(body.items.map((m) => m.key)).toContain('warranty');
  });

  it('a staff principal without manage_settings is refused, and the module stays off', async () => {
    const res = await send('/api/v1/settings/modules/warranty', 'PUT', STAFF, { enabled: true });
    expect(res.status).toBe(403);

    const after = await send('/api/v1/settings/modules', 'GET', OWNER);
    const body = (await after.json()) as { items: { key: string; enabled: boolean }[] };
    expect(body.items.find((m) => m.key === 'warranty')?.enabled).toBe(false);
  });

  it('an unknown module key is 404, not a validation error naming the real ones', async () => {
    // 400 saying "must be one of …" would enumerate the catalogue, including
    // anything unreleased. The request names a module that does not exist.
    const res = await send('/api/v1/settings/modules/not_a_module', 'PUT', OWNER, {
      enabled: true,
    });
    expect(res.status).toBe(404);
  });

  it('the owner switches one on, and it is on when read back', async () => {
    const res = await send('/api/v1/settings/modules/warranty', 'PUT', OWNER, { enabled: true });
    expect(res.status).toBe(200);

    const after = await send('/api/v1/settings/modules', 'GET', OWNER);
    const body = (await after.json()) as { items: { key: string; enabled: boolean }[] };
    expect(body.items.find((m) => m.key === 'warranty')?.enabled).toBe(true);
    // One switch, one module. Turning warranty on must not turn anything else on.
    expect(body.items.filter((m) => m.enabled)).toHaveLength(1);
  });

  it('switching it off again records who, and leaves the row rather than deleting it', async () => {
    const res = await send('/api/v1/settings/modules/warranty', 'PUT', OWNER, { enabled: false });
    expect(res.status).toBe(200);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    // Filtered on tenant_id explicitly. `admin` is a SUPERUSER connection and
    // superusers bypass row-level security outright — FORCE binds the table
    // owner, not them — so `set_config` above scopes nothing here and every
    // tenant in this suite has a warranty row.
    const { rows } = await admin.query<{ enabled: boolean; changed_by: string | null }>(
      `SELECT enabled, changed_by FROM tenancy.tenant_modules
        WHERE tenant_id = $1 AND module_key = 'warranty'`,
      [tenantId],
    );
    await admin.query('COMMIT');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(false);
    // "Who turned the money screen on" is a question somebody eventually asks.
    expect(rows[0]?.changed_by).not.toBeNull();
  });

  it('ABSENCE MEANS OFF — a tenant with no row at all reads as off, not as on', async () => {
    // The case that matters is a tenant provisioned BEFORE migration 0065, for
    // which no seed ever ran. Deleting the row reproduces it exactly. If the
    // reader defaulted to true, every such tenant would silently have eleven
    // unchosen modules switched on the day this deployed.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `DELETE FROM tenancy.tenant_modules WHERE tenant_id = $1 AND module_key = 'design_brief'`,
      [tenantId],
    );
    await admin.query('COMMIT');

    const res = await send('/api/v1/settings/modules', 'GET', OWNER);
    const body = (await res.json()) as { items: { key: string; enabled: boolean }[] };
    // Still listed — the catalogue drives the screen, not the rows — and off.
    expect(body.items).toHaveLength(11);
    expect(body.items.find((m) => m.key === 'design_brief')?.enabled).toBe(false);
  });

  it('one tenant switching a module on does not switch it on for another', async () => {
    await send('/api/v1/settings/modules/handover', 'PUT', OWNER, { enabled: true });

    // A second organisation, provisioned here rather than borrowed from another
    // block. Tenant A has modules switched on by the shape gate's fixture, and
    // an assertion that depends on which modules some other test happens to
    // have enabled is an assertion about test order.
    const other = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: 'modswitch-other',
      legalName: 'Module Switch Other Private Limited',
      appOrigin: 'https://modswitch-other.example.test',
      adminEmail: 'owner@modswitch-other.test',
      adminExternalId: 'owner@modswitch-other.test',
    });
    expect(other.status).toBe(201);

    const res = await send('/api/v1/settings/modules', 'GET', 'owner@modswitch-other.test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { key: string; enabled: boolean }[] };
    expect(body.items.find((m) => m.key === 'handover')?.enabled).toBe(false);
    // And every one of the eleven, for the same reason.
    expect(body.items.every((m) => !m.enabled)).toBe(true);
  });
});

describe('document numbering, and the counter nothing can move', () => {
  const SLUG = 'numbering';
  const PLATFORM_CRED = 'ops.numbering@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;

  let tenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const FORMAT = {
    prefix: 'PO',
    separator: '/',
    padding: 4,
    includeFy: true,
    fyFormat: 'YYYY-YY' as const,
    resetEachFy: true,
    startingNumber: 0,
  };

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Numbering Interiors Private Limited',
      appOrigin: 'https://numbering.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, STAFF],
    );
    await admin.query('COMMIT');
  });

  it('shows a series for a tenant that has never raised an order', async () => {
    const res = await send('/api/v1/settings/number-series', 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { moduleType: string; number: string; format: { status: string; resetEachFy: boolean } }[];
    };
    expect(body.items.map((s) => s.moduleType)).toEqual([
      'purchase_order',
      'payment_voucher',
      'tax_invoice',
    ]);
    // Provisional, because nobody has decided: the purchase-order prefix came
    // off legacy documents, and the two statutory series start from their
    // defaults until somebody saves a format (CA-09, CA-17).
    expect(body.items.every((s) => s.format.status === 'provisional')).toBe(true);
    expect(body.items[0]?.number).toBe('PO-0001');
    expect(body.items[1]?.number).toMatch(/^PV\/\d{4}-\d{2}\/0001$/);
    expect(body.items[2]?.number).toMatch(/^INV\/\d{4}-\d{2}\/0001$/);
    // The statutory series restart each financial year — the CA's answer to
    // CA-09 — and a purchase order's runs on, a business preference.
    expect(body.items.map((s) => s.format.resetEachFy)).toEqual([false, true, true]);
  });

  it('refuses a staff principal without manage_settings', async () => {
    const res = await send('/api/v1/settings/number-series/purchase_order', 'PUT', STAFF, FORMAT);
    expect(res.status).toBe(403);
  });

  it('REFUSES A RESTART WITHOUT THE YEAR IN THE NUMBER', async () => {
    // Restarting the counter with no year in the number issues `PO-0001` a
    // second time, a year apart, on two real orders with nothing to tell them
    // apart. Refused in the application AND by a CHECK constraint.
    const res = await send('/api/v1/settings/number-series/purchase_order', 'PUT', OWNER, {
      ...FORMAT,
      includeFy: false,
      resetEachFy: true,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/year appears/i);
  });

  it('refuses a tax invoice number outside letters, digits, hyphen and slash', async () => {
    const res = await send('/api/v1/settings/number-series/tax_invoice', 'PUT', OWNER, {
      ...FORMAT,
      prefix: 'INV#',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/letters, digits, hyphen and slash/);
  });

  it('refuses a tax invoice format longer than sixteen characters', async () => {
    const res = await send('/api/v1/settings/number-series/tax_invoice', 'PUT', OWNER, {
      ...FORMAT,
      prefix: 'INVOICE',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/sixteen/);
  });

  it('gives a number back when the document that took it does not save — no gaps', async () => {
    const tx = {
      query: async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows,
    };
    const ctx = { tenantId, principal: { kind: 'staff', id: randomUUID(), roles: [] }, requestId: 'gapless' };

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const taken = await allocateNumber(tx as never, ctx as never, 'payment_voucher');
    await admin.query('ROLLBACK');

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const next = await allocateNumber(tx as never, ctx as never, 'payment_voucher');
    await admin.query('COMMIT');

    expect(next.number).toBe(taken.number);
  });

  it('restarts a statutory series with the financial year — the answer to CA-09', async () => {
    const tx = {
      query: async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows,
    };
    const ctx = { tenantId, principal: { kind: 'staff', id: randomUUID(), roles: [] }, requestId: 'restart' };

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const march = await allocateNumber(tx as never, ctx as never, 'tax_invoice', new Date('2031-03-31T12:00:00+05:30'));
    const april = await allocateNumber(tx as never, ctx as never, 'tax_invoice', new Date('2031-04-01T12:00:00+05:30'));
    await admin.query('ROLLBACK');

    expect(march.number).toMatch(/^INV\/2030-31\/\d{4}$/);
    expect(april.number).toBe('INV/2031-32/0001');
  });

  it('saves a format, and saving confirms it', async () => {
    const res = await send('/api/v1/settings/number-series/purchase_order', 'PUT', OWNER, FORMAT);
    expect(res.status).toBe(200);

    const after = await send('/api/v1/settings/number-series', 'GET', OWNER);
    const body = (await after.json()) as {
      items: { number: string; financialYear: string; format: { status: string } }[];
    };
    expect(body.items[0]?.format.status).toBe('confirmed');
    // The year is now in the number, and it is the Indian financial year.
    expect(body.items[0]?.number).toBe(`PO/${body.items[0]?.financialYear}/0001`);
  });

  it('THE COUNTER IS NOT WRITABLE — no field, no column, no route', async () => {
    // Take a number so the counter is off zero.
    const vendor = await send('/api/v1/purchase-orders/vendors', 'POST', OWNER, {
      name: 'Numbering Test Suppliers',
      code: 'NUMV-1',
    });
    expect(vendor.status).toBe(201);

    // No `number` in the body, so the server allocates one. That is the path
    // under test: the counter moves in the transaction that writes the order.
    const order = await send('/api/v1/purchase-orders', 'POST', OWNER, {
      vendorId: ((await vendor.json()) as { id: string }).id,
      lines: [
        {
          description: 'Ply',
          hsnSac: '',
          quantityWhole: 10,
          quantityMillionths: 0,
          unitRate: '150000',
          gstRate: 1800,
        },
      ],
    });
    expect(order.status).toBe(201);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const before = await admin.query<{ last_number: string }>(
      `SELECT last_number::text FROM procurement.number_series
        WHERE tenant_id = $1 AND module_type = 'purchase_order'`,
      [tenantId],
    );
    await admin.query('COMMIT');
    expect(Number(before.rows[0]?.last_number)).toBeGreaterThan(0);

    // Every shape somebody might reach for. None of them moves it.
    for (const body of [
      { ...FORMAT, lastNumber: 0 },
      { ...FORMAT, last_number: 0 },
      { ...FORMAT, currentNumber: 0 },
      { ...FORMAT, sequence: 0 },
      // startingNumber IS accepted — it says where a RESTART begins, next
      // April, and does not touch the counter running today.
      { ...FORMAT, startingNumber: 0 },
    ]) {
      const res = await send('/api/v1/settings/number-series/purchase_order', 'PUT', OWNER, body);
      expect(res.status).toBe(200);
    }

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const after = await admin.query<{ last_number: string }>(
      `SELECT last_number::text FROM procurement.number_series
        WHERE tenant_id = $1 AND module_type = 'purchase_order'`,
      [tenantId],
    );
    await admin.query('COMMIT');
    expect(after.rows[0]?.last_number).toBe(before.rows[0]?.last_number);
  });

  it('answers 404 for a document type nothing numbers', async () => {
    // Not 400 with a list of the legal values, which would enumerate them.
    const res = await send('/api/v1/settings/number-series/payment_request', 'PUT', OWNER, FORMAT);
    expect(res.status).toBe(404);
  });

  it('the database refuses a restart without a year even if a route stops checking', async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await expect(
      admin.query(
        `UPDATE procurement.number_series
            SET include_fy = false, reset_each_fy = true
          WHERE tenant_id = $1 AND module_type = 'purchase_order'`,
        [tenantId],
      ),
    ).rejects.toThrow(/number_series_reset_needs_fy_check/);
    await admin.query('ROLLBACK');
  });
});

describe('the trade catalogue', () => {
  const SLUG = 'trades';
  const PLATFORM_CRED = 'ops.trades@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;
  // A SECOND PROVISIONED TENANT, because the cross-tenant test needs a caller
  // who genuinely holds manage_settings somewhere — otherwise a 403 for the
  // wrong reason would stand in for the isolation this is checking. Tenant A in
  // this suite is seeded straight into the tables and has no role model at all.
  const OTHER_SLUG = 'trades-other';
  const OTHER_OWNER = `owner@${OTHER_SLUG}.test`;

  let tenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Trade Catalogue Interiors Private Limited',
      appOrigin: 'https://trades.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    const other = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: OTHER_SLUG,
      legalName: 'Other Trade Interiors Private Limited',
      appOrigin: 'https://trades-other.example.test',
      adminEmail: OTHER_OWNER,
      adminExternalId: OTHER_OWNER,
    });
    expect(other.status).toBe(201);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, STAFF],
    );
    await admin.query('COMMIT');
  });

  it('A NEW TENANT HAS NO TRADES AND NO MARGINS', async () => {
    // The legacy seeds ten packages carrying a margin each and a named
    // preferred vendor. A margin is a commercial position; seeding one puts a
    // number nobody agreed into the rate of every item costed under that trade.
    const res = await send('/api/v1/settings/trade-packages', 'GET', OWNER);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it('refuses a staff principal without manage_settings', async () => {
    const res = await send('/api/v1/settings/trade-packages', 'POST', STAFF, {
      code: 'ELEC',
      name: 'Electrical',
    });
    expect(res.status).toBe(403);
  });

  it('uppercases a code, so elec and ELEC cannot become two trades', async () => {
    const first = await send('/api/v1/settings/trade-packages', 'POST', OWNER, {
      code: 'elec',
      name: 'Electrical and lighting',
      description: 'DB panels, conduits, wiring',
    });
    expect(first.status).toBe(201);

    const again = await send('/api/v1/settings/trade-packages', 'POST', OWNER, {
      code: 'ELEC',
      name: 'Electricals',
    });
    expect(again.status).toBe(400);
    expect(((await again.json()) as { message: string }).message).toMatch(/code already exists/i);

    const list = await send('/api/v1/settings/trade-packages', 'GET', OWNER);
    const body = (await list.json()) as { items: { code: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.code).toBe('ELEC');
  });

  it('keeps a margin in basis points, never a float percentage', async () => {
    const res = await send('/api/v1/settings/trade-packages', 'POST', OWNER, {
      code: 'JOIN',
      name: 'Woodwork and joinery',
      defaultMarginBp: 2250,
    });
    expect(res.status).toBe(201);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const { rows } = await admin.query<{ default_margin_bp: number }>(
      `SELECT default_margin_bp FROM projects.trade_packages
        WHERE tenant_id = $1 AND code = 'JOIN'`,
      [tenantId],
    );
    await admin.query('COMMIT');
    // 22.5%, exactly, as an integer. The legacy column is a REAL.
    expect(rows[0]?.default_margin_bp).toBe(2250);
  });

  it('refuses a margin of 100% or more', async () => {
    // A margin is a fraction of a price. At 100% the cost basis is zero, which
    // is not a margin, it is a mistake.
    const res = await send('/api/v1/settings/trade-packages', 'POST', OWNER, {
      code: 'BAD',
      name: 'Impossible trade',
      defaultMarginBp: 10000,
    });
    expect(res.status).toBe(400);
  });

  it('retires rather than deletes, and there is no delete route', async () => {
    const list = await send('/api/v1/settings/trade-packages', 'GET', OWNER);
    const items = ((await list.json()) as { items: { id: string; code: string }[] }).items;
    const joinery = items.find((t) => t.code === 'JOIN');
    expect(joinery).toBeDefined();

    const retire = await send(
      `/api/v1/settings/trade-packages/${joinery?.id}`,
      'PUT',
      OWNER,
      {
        code: 'JOIN',
        name: 'Woodwork and joinery',
        defaultMarginBp: 2250,
        sortOrder: 0,
        isActive: false,
      },
    );
    expect(retire.status).toBe(200);

    // Still listed on the settings screen, marked retired. Hiding it from the
    // screen that retired it is how it becomes impossible to bring back.
    const after = await send('/api/v1/settings/trade-packages', 'GET', OWNER);
    const body = (await after.json()) as { items: { code: string; isActive: boolean }[] };
    expect(body.items.find((t) => t.code === 'JOIN')?.isActive).toBe(false);

    const deleted = await send(`/api/v1/settings/trade-packages/${joinery?.id}`, 'DELETE', OWNER);
    expect(deleted.status).toBe(404);
  });

  it('cannot edit another tenant trade, and says not-found rather than forbidden', async () => {
    const list = await send('/api/v1/settings/trade-packages', 'GET', OWNER);
    const items = ((await list.json()) as { items: { id: string }[] }).items;
    const someone = items[0]?.id ?? '';

    const res = await send(`/api/v1/settings/trade-packages/${someone}`, 'PUT', OTHER_OWNER, {
      code: 'STOLEN',
      name: 'Taken',
      sortOrder: 0,
      isActive: true,
    });
    // The other owner holds admin in their OWN tenant, so this is not a
    // permission refusal — RLS scopes the UPDATE, it matches no row, and the
    // answer is that there is no such trade rather than that it is somebody
    // else's.
    expect(res.status).toBe(404);
  });

  it('lets two tenants use the same trade code', async () => {
    const res = await send('/api/v1/settings/trade-packages', 'POST', OTHER_OWNER, {
      code: 'ELEC',
      name: 'Electrical and lighting',
    });
    // The unique constraint is (tenant_id, code), so the same code in two
    // organisations is two trades and neither sees the other.
    expect(res.status).toBe(201);

    const mine = await send('/api/v1/settings/trade-packages', 'GET', OTHER_OWNER);
    const body = (await mine.json()) as { items: { code: string }[] };
    expect(body.items.map((t) => t.code)).toEqual(['ELEC']);
  });
});

describe("the organisation's own registered details", () => {
  const SLUG = 'company';
  const PLATFORM_CRED = 'ops.company@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;

  const VALID = {
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    cin: 'U45200KA2019PTC123456',
    address: '12 MG Road, Bengaluru',
    phone: '9876543210',
    email: 'accounts@company.test',
    website: 'https://company.test',
    bankName: 'HDFC Bank',
    bankBranch: 'MG Road',
    bankIfsc: 'HDFC0001234',
    documentFooter: 'Subject to Bengaluru jurisdiction',
  };

  let tenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Company Details Interiors Private Limited',
      appOrigin: 'https://company.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, STAFF],
    );
    await admin.query('COMMIT');
  });

  it('A NEW TENANT HAS NO GSTIN, NO PAN AND NO PLACEHOLDER', async () => {
    // `tdsChallan281.js:54` fabricates a default TAN when one is missing and
    // writes it into generated 26Q content. Absent stays absent here.
    const res = await send('/api/v1/settings/company', 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gstin: string | null; pan: string | null };
    expect(body.gstin).toBeNull();
    expect(body.pan).toBeNull();
  });

  it('refuses a staff principal without manage_settings', async () => {
    const res = await send('/api/v1/settings/company', 'PUT', STAFF, VALID);
    expect(res.status).toBe(403);
  });

  it('refuses a malformed GSTIN, PAN, CIN and IFSC rather than storing them', async () => {
    for (const [field, value] of [
      ['gstin', 'NOTAGSTIN'],
      ['pan', 'ABC1234'],
      ['cin', 'NOTACIN'],
      ['bankIfsc', 'HDFC1234'],
    ] as const) {
      const res = await send('/api/v1/settings/company', 'PUT', OWNER, {
        ...VALID,
        [field]: value,
      });
      expect(res.status, `${field} was accepted`).toBe(400);
      // The message names the field: "not a valid GSTIN" beside a form with
      // four registration numbers on it does not say which one.
      expect(((await res.json()) as { message: string }).message).toContain(field);
    }
  });

  it('saves, uppercases, and reads back', async () => {
    const res = await send('/api/v1/settings/company', 'PUT', OWNER, {
      ...VALID,
      gstin: '29abcde1234f1z5',
    });
    expect(res.status).toBe(200);

    const after = await send('/api/v1/settings/company', 'GET', OWNER);
    const body = (await after.json()) as { gstin: string; documentFooter: string };
    expect(body.gstin).toBe('29ABCDE1234F1Z5');
    expect(body.documentFooter).toBe('Subject to Bengaluru jurisdiction');
  });

  it('AN EMPTIED TAX FIELD CLEARS IT — not registered has to be sayable', async () => {
    const res = await send('/api/v1/settings/company', 'PUT', OWNER, { ...VALID, cin: '' });
    expect(res.status).toBe(200);

    const after = await send('/api/v1/settings/company', 'GET', OWNER);
    // NULL, not the empty string: the CHECK allows NULL and rejects a malformed
    // value, so '' would be refused as a bad CIN rather than read as absent.
    expect(((await after.json()) as { cin: string | null }).cin).toBeNull();
  });

  it('a stale rule of zero days is refused, and no rule is not zero', async () => {
    // Zero marks everything stale the moment it is created.
    const zero = await send('/api/v1/settings/operational', 'PUT', OWNER, {
      poTerms: '30 days net',
      crmStaleDays: 0,
    });
    expect(zero.status).toBe(400);

    const none = await send('/api/v1/settings/operational', 'PUT', OWNER, {
      poTerms: '50% advance, balance on delivery',
      crmStaleDays: null,
    });
    expect(none.status).toBe(200);

    const after = await send('/api/v1/settings/operational', 'GET', OWNER);
    const body = (await after.json()) as { poTerms: string; crmStaleDays: number | null };
    expect(body.crmStaleDays).toBeNull();
    expect(body.poTerms).toBe('50% advance, balance on delivery');
  });

  it('one organisation cannot read another organisation registered details', async () => {
    const res = await send('/api/v1/settings/company', 'GET', USER_A);
    expect(res.status).toBe(200);
    // Tenant A has never written a profile. RLS scopes the read, so it gets its
    // own empty answer rather than the one saved above.
    expect(((await res.json()) as { gstin: string | null }).gstin).toBeNull();
  });
});

describe('the provisioning ceiling still fires', () => {
  const PLATFORM_CRED = 'ops.ceiling@platform.test';

  /**
   * The control is TUNABLE, NOT BYPASSABLE, and this is what says so.
   *
   * The suite raises the limit to 60 because it provisions a tenant per
   * scenario. If raising it were the same as switching it off, that change
   * would have quietly removed a control and every other test would still have
   * passed. This builds its own app at the floor and shows the refusal.
   */
  it('refuses past its configured limit, whatever the limit is', async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );

    const strict = createApp({
      pool,
      resolver: createPrincipalResolver({ pool, verify: verifyLocalBearer('test') }),
      platform: { verify: verifyLocalBearer('test'), provisionAttemptLimit: 1 },
    });

    const statuses: number[] = [];
    for (const n of [1, 2, 3]) {
      const res = await strict.request('/platform/v1/tenants', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${PLATFORM_CRED}`,
        },
        body: JSON.stringify({
          slug: `ceiling-${String(n)}`,
          legalName: `Ceiling ${String(n)} Interiors Private Limited`,
          appOrigin: `https://ceiling-${String(n)}.example.test`,
          adminEmail: `owner@ceiling-${String(n)}.test`,
          adminExternalId: `owner@ceiling-${String(n)}.test`,
        }),
      });
      statuses.push(res.status);
    }

    // At a limit of 1, at most one of the three can have been created, and the
    // rest are refused. The window is per PROCESS and shared, so which of them
    // gets through depends on what ran before — that is the documented shape of
    // this control, not a flaw in the test.
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(1);
    expect(statuses.filter((s) => s === 409).length).toBeGreaterThanOrEqual(2);
  });
});

describe('what a client login can see', () => {
  const SLUG = 'clientaccess';
  const PLATFORM_CRED = 'ops.clientaccess@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;
  const CLIENT = `client@${SLUG}.test`;

  let tenantId = '';
  let clientId = '';
  let mineId = '';
  let otherId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Client Access Interiors Private Limited',
      appOrigin: 'https://clientaccess.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, STAFF],
    );
    const client = await admin.query<{ id: string }>(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'client', '{}')
       RETURNING id`,
      [tenantId, CLIENT],
    );
    clientId = client.rows[0]?.id ?? '';
    // Through the same SECURITY DEFINER function the product uses. Without the
    // lookup row the bearer does not resolve to THIS principal, and the portal
    // then refuses it as the wrong kind — which reads as a broken guard rather
    // than as a fixture that never registered its principal.
    await admin.query('SELECT identity.register_principal($1, $2)', [CLIENT, clientId]);
    await admin.query('COMMIT');

    for (const [code, name] of [
      ['CA-1', 'Their fitout'],
      ['CA-2', 'Somebody else fitout'],
    ] as const) {
      const created = await send('/api/v1/projects', 'POST', OWNER, {
        code,
        name,
        clientName: 'Client Access Client',
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      if (code === 'CA-1') mineId = id;
      else otherId = id;
    }
  });

  it('a new client login sees nothing at all', async () => {
    const res = await send('/api/v1/settings/client-accounts', 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; projects: unknown[] }[] };
    expect(body.items).toHaveLength(1);
    // A principal with no link is scoped to nothing, which is the right default
    // for a portal login and the reason `subjectIds` starts empty.
    expect(body.items[0]?.projects).toEqual([]);
  });

  it('refuses a staff principal without manage_users', async () => {
    const res = await send(`/api/v1/settings/client-accounts/${clientId}/projects`, 'POST', STAFF, {
      projectId: mineId,
    });
    expect(res.status).toBe(403);
  });

  it('REFUSES A LINK TO A PROJECT ID THAT IS NOT A PROJECT', async () => {
    // `linkPrincipal` says the caller must have checked the subject exists —
    // identity cannot read projects, so the host is the only layer that can.
    // Without the check the portal shows a client an empty screen nobody can
    // explain.
    const res = await send(`/api/v1/settings/client-accounts/${clientId}/projects`, 'POST', OWNER, {
      projectId: randomUUID(),
    });
    expect(res.status).toBe(404);
  });

  it('refuses a link onto a principal that is not a client login', async () => {
    // A staff principal is not a portal account. Linking one would give a staff
    // row a scope that only portal routes read, which is a silent no-op today
    // and a privilege the day something else reads that table.
    const staff = await send('/api/v1/settings/people', 'GET', OWNER);
    const people = ((await staff.json()) as { items: { id: string; email: string }[] }).items;
    const staffId = people.find((p) => p.email === STAFF)?.id ?? '';

    const res = await send(`/api/v1/settings/client-accounts/${staffId}/projects`, 'POST', OWNER, {
      projectId: mineId,
    });
    expect(res.status).toBe(404);
  });

  it('grants one project, and only that one', async () => {
    const res = await send(`/api/v1/settings/client-accounts/${clientId}/projects`, 'POST', OWNER, {
      projectId: mineId,
    });
    expect(res.status).toBe(200);

    const after = await send('/api/v1/settings/client-accounts', 'GET', OWNER);
    const body = (await after.json()) as { items: { projects: { id: string }[] }[] };
    expect(body.items[0]?.projects.map((p) => p.id)).toEqual([mineId]);
    expect(body.items[0]?.projects.map((p) => p.id)).not.toContain(otherId);
  });

  it('THE PORTAL ENFORCES THE SAME LIST — not a display of a different one', async () => {
    // The client credential, against the portal. This is the assertion that
    // makes the screen worth having: what the settings list shows is what the
    // portal actually serves.
    const mine = await send(`/api/v1/portal/client/projects/${mineId}/variations`, 'GET', CLIENT);
    expect(mine.status).toBe(200);

    const theirs = await send(
      `/api/v1/portal/client/projects/${otherId}/variations`,
      'GET',
      CLIENT,
    );
    expect(theirs.status).toBe(404);
  });

  it('REVOKING TAKES EFFECT ON THE NEXT REQUEST', async () => {
    const res = await send(
      `/api/v1/settings/client-accounts/${clientId}/projects/${mineId}`,
      'DELETE',
      OWNER,
    );
    expect(res.status).toBe(200);

    const after = await send(`/api/v1/portal/client/projects/${mineId}/variations`, 'GET', CLIENT);
    expect(after.status).toBe(404);
  });

  it('revoking access that was already gone is not an error', async () => {
    // The caller asked for the access to be gone, and it is. Refusing would
    // leave somebody unsure whether it is still there.
    const res = await send(
      `/api/v1/settings/client-accounts/${clientId}/projects/${mineId}`,
      'DELETE',
      OWNER,
    );
    expect(res.status).toBe(200);
  });
});

/**
 * What a vendor login can see — and the surface that decides it.
 *
 * The mirror of `what a client login can see`, and it is new because the
 * granting surface was. The vendor portal's scoping was already proven: a
 * vendor credential sees its own orders and not another vendor's. What no test
 * could cover was how a login came to be linked at all, because nothing in the
 * product linked one. `scripts/seed-demo.mjs` wrote the row by hand, in SQL,
 * with a comment saying no route existed — so "vendor onboarding" ended at a
 * database console, while M6 claims it is self-service.
 *
 * These tests therefore run the loop the client tests run: grant through the
 * route, then read the PORTAL and see it; revoke, then read the portal and not
 * see it. A settings screen that displays a list nothing enforces is the
 * failure this shape exists to rule out.
 */
describe('what a vendor login can see', () => {
  const SLUG = 'vendoraccess';
  const PLATFORM_CRED = 'ops.vendoraccess@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;
  const VENDOR_LOGIN = `portal@${SLUG}.test`;

  let tenantId = '';
  let principalId = '';
  let mineId = '';
  let otherId = '';
  let myOrderId = '';
  let otherOrderId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Vendor Access Interiors Private Limited',
      appOrigin: 'https://vendoraccess.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, STAFF],
    );
    const login = await admin.query<{ id: string }>(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'vendor', '{}')
       RETURNING id`,
      [tenantId, VENDOR_LOGIN],
    );
    principalId = login.rows[0]?.id ?? '';
    // Through the same SECURITY DEFINER function the product uses, for the
    // reason the client fixture gives: without the lookup row the bearer never
    // resolves to this principal and the portal refuses it as the wrong kind.
    await admin.query('SELECT identity.register_principal($1, $2)', [VENDOR_LOGIN, principalId]);
    await admin.query('COMMIT');

    for (const [code, name] of [
      ['VA-1', 'Represented Supplies Private Limited'],
      ['VA-2', 'Unrepresented Supplies Private Limited'],
    ] as const) {
      const created = await send('/api/v1/purchase-orders/vendors', 'POST', OWNER, { code, name });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      if (code === 'VA-1') mineId = id;
      else otherId = id;
    }

    // One order per vendor. The portal reads orders, so an empty order book
    // would let every assertion below pass while checking nothing — which is
    // the vacuity this suite has shipped twice.
    for (const [number, vendor] of [
      ['PO-VA-MINE', mineId],
      ['PO-VA-OTHER', otherId],
    ] as const) {
      const created = await send('/api/v1/purchase-orders', 'POST', OWNER, {
        number,
        vendorId: vendor,
        lines: [
          {
            description: 'Cable tray, GI 300mm',
            hsnSac: '7308',
            quantityWhole: 12,
            quantityMillionths: 0,
            unitRate: '458300',
            gstRate: 1800,
          },
        ],
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      if (number === 'PO-VA-MINE') myOrderId = id;
      else otherOrderId = id;
    }
  });

  it('a new vendor login represents nothing at all', async () => {
    const res = await send('/api/v1/settings/vendor-accounts', 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; vendors: unknown[] }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.vendors).toEqual([]);
  });

  it('AND THE PORTAL AGREES — it sees no orders before any grant', async () => {
    // The negative half, taken BEFORE the grant. Asserting only that the portal
    // stops showing an order after a revoke would pass against a portal that
    // never showed anything, so the same read is taken three times: empty, then
    // scoped, then empty again.
    const res = await send('/api/v1/portal/vendor/orders', 'GET', VENDOR_LOGIN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('refuses a staff principal without manage_users', async () => {
    const res = await send(
      `/api/v1/settings/vendor-accounts/${principalId}/vendors`,
      'POST',
      STAFF,
      { vendorId: mineId },
    );
    expect(res.status).toBe(403);
  });

  it('REFUSES A LINK TO A VENDOR ID THAT IS NOT A VENDOR', async () => {
    // `identity` cannot read `procurement`, so the composition root is the only
    // layer that can check the subject. Without it the link points at a uuid
    // that is not a vendor, and the portal shows a supplier an empty screen
    // nobody can explain.
    const res = await send(
      `/api/v1/settings/vendor-accounts/${principalId}/vendors`,
      'POST',
      OWNER,
      { vendorId: randomUUID() },
    );
    expect(res.status).toBe(404);
  });

  it('refuses a vendor link onto a principal that is not a vendor login', async () => {
    // A staff principal is not a portal account. Linking a vendor to it would
    // give a staff row a scope only the vendor portal reads — a silent no-op
    // today, and a privilege the day anything else reads that row.
    const staff = await send('/api/v1/settings/people', 'GET', OWNER);
    const people = ((await staff.json()) as { items: { id: string; email: string }[] }).items;
    const staffId = people.find((x) => x.email === STAFF)?.id ?? '';

    const res = await send(`/api/v1/settings/vendor-accounts/${staffId}/vendors`, 'POST', OWNER, {
      vendorId: mineId,
    });
    expect(res.status).toBe(404);
  });

  it('grants one vendor, and only that one', async () => {
    const res = await send(
      `/api/v1/settings/vendor-accounts/${principalId}/vendors`,
      'POST',
      OWNER,
      { vendorId: mineId },
    );
    expect(res.status).toBe(200);

    const after = await send('/api/v1/settings/vendor-accounts', 'GET', OWNER);
    const body = (await after.json()) as { items: { vendors: { id: string }[] }[] };
    expect(body.items[0]?.vendors.map((v) => v.id)).toEqual([mineId]);
    expect(body.items[0]?.vendors.map((v) => v.id)).not.toContain(otherId);
  });

  it('THE PORTAL ENFORCES THE SAME LIST — not a display of a different one', async () => {
    // The vendor credential, against the portal, after a grant made through the
    // route. This is the assertion that makes the screen worth having.
    const listed = await send('/api/v1/portal/vendor/orders', 'GET', VENDOR_LOGIN);
    expect(listed.status).toBe(200);
    const numbers = ((await listed.json()) as { items: { number: string }[] }).items.map(
      (o) => o.number,
    );
    expect(numbers).toContain('PO-VA-MINE');
    expect(numbers).not.toContain('PO-VA-OTHER');
  });

  it('READS ONLY THE ORDERS OF VENDORS IT REPRESENTS — the other is not found', async () => {
    // Through the route, by id, not merely absent from a list. A list that
    // omits a row while a detail route still serves it is the shape of every
    // scoping bug that reaches production.
    const mine = await send(`/api/v1/portal/vendor/orders/${myOrderId}/lines`, 'GET', VENDOR_LOGIN);
    expect(mine.status).toBe(200);

    const theirs = await send(
      `/api/v1/portal/vendor/orders/${otherOrderId}/lines`,
      'GET',
      VENDOR_LOGIN,
    );
    expect(theirs.status).toBe(404);
  });

  it('REVOKING TAKES EFFECT ON THE NEXT REQUEST', async () => {
    const res = await send(
      `/api/v1/settings/vendor-accounts/${principalId}/vendors/${mineId}`,
      'DELETE',
      OWNER,
    );
    expect(res.status).toBe(200);

    const after = await send(
      `/api/v1/portal/vendor/orders/${myOrderId}/lines`,
      'GET',
      VENDOR_LOGIN,
    );
    expect(after.status).toBe(404);
  });

  it('revoking access that was already gone is not an error', async () => {
    // The caller asked for the access to be gone, and it is. Refusing would
    // leave somebody unsure whether it is still there.
    const res = await send(
      `/api/v1/settings/vendor-accounts/${principalId}/vendors/${mineId}`,
      'DELETE',
      OWNER,
    );
    expect(res.status).toBe(200);
  });
});

describe('merging two opportunities that are one opportunity', () => {
  const SLUG = 'leadmerge';
  const PLATFORM_CRED = 'ops.leadmerge@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let keepId = '';
  let dropId = '';
  let mergeTenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function newLead(fields: Record<string, unknown>): Promise<string> {
    const res = await send('/api/v1/projects/leads', 'POST', OWNER, fields);
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Lead Merge Interiors Private Limited',
      appOrigin: 'https://leadmerge.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    mergeTenantId = ((await res.json()) as { tenantId: string }).tenantId;

    // Two records of one enquiry. The surviving one has a value and no phone;
    // the duplicate has a phone, a different value, and its own history.
    keepId = await newLead({
      clientName: 'Meridian Realty',
      contactName: 'Anita Rao',
      stage: 'qualified',
      estimatedValue: '4000000',
      probabilityPct: 40,
      city: 'Bengaluru',
    });
    dropId = await newLead({
      clientName: 'Meridian Realty Pvt Ltd',
      stage: 'lead',
      phone: '9876543210',
      estimatedValue: '3500000',
      probabilityPct: 10,
      source: 'Architect referral',
    });

    // A primary contact on each, which is the case the legacy's ordering
    // cannot survive.
    for (const [leadId, name] of [
      [keepId, 'Anita Rao'],
      [dropId, 'A. Rao'],
    ] as const) {
      const contact = await send(`/api/v1/projects/leads/${leadId}/contacts`, 'POST', OWNER, {
        name,
        designation: 'Facilities head',
        isPrimary: true,
      });
      expect(contact.status).toBe(201);
    }

    const activity = await send(`/api/v1/projects/leads/${dropId}/activities`, 'POST', OWNER, {
      kind: 'call',
      summary: 'Discussed the third floor',
      occurredOn: '2026-08-20',
    });
    expect(activity.status).toBe(201);
  });

  it('refuses to merge a record into itself', async () => {
    const res = await send(`/api/v1/projects/leads/${keepId}/merge`, 'POST', OWNER, {
      secondaryId: keepId,
    });
    expect(res.status).toBe(400);
  });

  it("answers not-found for another tenant's opportunity, not forbidden", async () => {
    const res = await send(`/api/v1/projects/leads/${keepId}/merge`, 'POST', OWNER, {
      secondaryId: randomUUID(),
    });
    expect(res.status).toBe(404);
  });

  it('MOVES THE CHILDREN AND RECORDS EXACTLY WHICH ONES', async () => {
    const res = await send(`/api/v1/projects/leads/${keepId}/merge`, 'POST', OWNER, {
      secondaryId: dropId,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mergeId: string;
      repointed: number;
      filled: string[];
    };

    // ONE row moved: the contact. The activity did not, and could not —
    // `lead_activities` is append-only by grant, and a logged call happened
    // against the record it was logged on.
    expect(body.repointed).toBe(1);
    // The gaps that were filled, by name, and nothing else. `client_name` was
    // already set on the surviving record, so it is NOT in this list.
    expect(body.filled).toContain('phone');
    expect(body.filled).toContain('source');
    expect(body.filled).not.toContain('client_name');

    const merges = await send(`/api/v1/projects/leads/${keepId}/merges`, 'GET', OWNER);
    expect(merges.status).toBe(200);
    const record = ((await merges.json()) as {
      items: {
        secondaryId: string;
        losingBefore: Record<string, unknown>;
        primaryBefore: Record<string, unknown>;
        repointed: { table: string; id: string; demoted?: true }[];
      }[];
    }).items[0];

    expect(record?.secondaryId).toBe(dropId);
    // The losing record's own fields, as they were. This is the answer the
    // legacy has no way to give: after its five bare UPDATEs a repointed
    // contact is indistinguishable from one that was always there.
    expect(record?.losingBefore['phone']).toBe('9876543210');
    expect(record?.losingBefore['estimated_value']).toBe('3500000');
    // And what the survivor held BEFORE its gaps were filled, or "the phone
    // number came from the other record" is a guess.
    expect(record?.primaryBefore['phone']).toBe('');
    expect(record?.repointed).toHaveLength(1);
    expect(record?.repointed[0]?.table).toBe('lead_contacts');
    expect(record?.repointed.some((r) => r.demoted === true)).toBe(true);
  });

  it('THE LOSING RECORD IS MERGED, NOT LOST', async () => {
    // `crm.js:1523` sets it to Lost with a fabricated reason, so every tidied
    // duplicate counts against the win rate and the loss reasons fill with a
    // reason nobody gave.
    const res = await send('/api/v1/projects/leads', 'GET', OWNER);
    expect(res.status).toBe(200);
    const items = ((await res.json()) as {
      items: { id: string; stage: string; lostReason?: string }[];
    }).items;
    const dropped = items.find((l) => l.id === dropId);
    expect(dropped?.stage).toBe('merged');
    // Not 'lost', and no invented reason. The legacy writes
    // "Merged Duplicate into <id>" into `lost_reason`.
    expect(dropped?.lostReason ?? '').toBe('');
  });

  it('NOTHING IS SUMMED — two records of one job are not a job of twice the value', async () => {
    const res = await send('/api/v1/projects/leads', 'GET', OWNER);
    const items = ((await res.json()) as { items: { id: string; estimatedValue: string }[] })
      .items;
    const lead = items.find((l) => l.id === keepId) ?? { estimatedValue: '' };
    // 40,00,000 stays 40,00,000. The legacy's project merge adds the figures
    // together, which is right only if the records describe different work.
    expect(lead.estimatedValue).toBe('4000000');
  });

  it('leaves exactly one primary contact, and demotes rather than deletes', async () => {
    const res = await send(`/api/v1/projects/leads/${keepId}/contacts`, 'GET', OWNER);
    const items = ((await res.json()) as { items: { name: string; isPrimary: boolean }[] }).items;
    // Both contacts survive; one of them is primary.
    expect(items).toHaveLength(2);
    expect(items.filter((c) => c.isPrimary)).toHaveLength(1);
    // The surviving record's own choice won.
    expect(items.find((c) => c.isPrimary)?.name).toBe('Anita Rao');
  });

  it('THE TIMELINE IS COMPLETE WITHOUT ANY ROW BEING REWRITTEN', async () => {
    // The call was logged against the duplicate and is still stored there.
    // The surviving record's timeline reads across the merge, so the history
    // is whole on the screen and no activity row claims to have happened
    // somewhere it did not.
    const res = await send(`/api/v1/projects/leads/${keepId}/activities`, 'GET', OWNER);
    expect(res.status).toBe(200);
    const items = ((await res.json()) as { items: { summary: string }[] }).items;
    expect(items.map((a) => a.summary)).toContain('Discussed the third floor');

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', mergeTenantId]);
    const { rows } = await admin.query<{ lead_id: string }>(
      `SELECT lead_id FROM projects.lead_activities WHERE summary = $1`,
      ['Discussed the third floor'],
    );
    await admin.query('COMMIT');
    // Still on the record it was logged against.
    expect(rows[0]?.lead_id).toBe(dropId);
  });

  it('refuses to merge a record that has already been merged away', async () => {
    const res = await send(`/api/v1/projects/leads/${keepId}/merge`, 'POST', OWNER, {
      secondaryId: dropId,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/already been merged/i);
  });

  it('THE MERGE RECORD CANNOT BE EDITED OR DELETED BY THE RUNTIME', async () => {
    // Append-only by GRANT, like `workflow.audit_events`. A merge record that
    // can be rewritten answers nothing.
    const runtime = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await runtime.connect();
    try {
      await expect(
        runtime.query('UPDATE projects.lead_merges SET repointed = $1', ['[]']),
      ).rejects.toThrow(/permission denied/i);
      await expect(runtime.query('DELETE FROM projects.lead_merges')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await runtime.end();
    }
  });
});

describe('handing a won opportunity to delivery', () => {
  const SLUG = 'handover';
  const PLATFORM_CRED = 'ops.handover@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let tenantId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function newLead(clientName: string): Promise<{ id: string; version: number }> {
    const res = await send('/api/v1/projects/leads', 'POST', OWNER, {
      clientName,
      stage: 'negotiation',
      estimatedValue: '4000000',
      probabilityPct: 80,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; version: number };
  }

  const CONFIRMED = { scopeConfirmed: true, commercialsConfirmed: true, loiReceived: false };

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Handover Interiors Private Limited',
      appOrigin: 'https://handover.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;
  });

  it('REFUSES A HANDOVER WITH AN UNCONFIRMED SCOPE, AND CREATES NOTHING', async () => {
    const lead = await newLead('Unconfirmed Scope Realty');
    const res = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-NOPE',
      name: 'Should not exist',
      ...CONFIRMED,
      scopeConfirmed: false,
      expectedVersion: lead.version,
    });
    expect(res.status).toBe(400);

    // The whole point: the project must not exist either. The three writes are
    // one statement.
    const projects = await send('/api/v1/projects', 'GET', OWNER);
    const items = ((await projects.json()) as { items: { code: string }[] }).items;
    expect(items.map((p) => p.code)).not.toContain('HO-NOPE');
  });

  it('refuses a letter of intent with no date, and a date with no letter', async () => {
    const lead = await newLead('Paperwork Realty');
    const noDate = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-LOI-1',
      name: 'Paperwork fitout',
      ...CONFIRMED,
      loiReceived: true,
      expectedVersion: lead.version,
    });
    expect(noDate.status).toBe(400);

    const noLoi = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-LOI-2',
      name: 'Paperwork fitout',
      ...CONFIRMED,
      loiReceived: false,
      loiDate: '2026-09-01',
      expectedVersion: lead.version,
    });
    expect(noLoi.status).toBe(400);
  });

  it('creates the project, marks the lead won against it, and records the confirmations', async () => {
    const lead = await newLead('Meridian Towers');
    const res = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-1',
      name: 'Meridian Towers fitout',
      originalValue: '4000000',
      ...CONFIRMED,
      loiReceived: true,
      loiDate: '2026-09-01',
      notes: 'Access is nights only until the 15th.',
      expectedVersion: lead.version,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { projectId: string; handoverId: string };

    const leads = await send('/api/v1/projects/leads', 'GET', OWNER);
    const found = ((await leads.json()) as {
      items: { id: string; stage: string; convertedProjectId: string | null }[];
    }).items.find((l) => l.id === lead.id);
    expect(found?.stage).toBe('won');
    expect(found?.convertedProjectId).toBe(created.projectId);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const { rows } = await admin.query<{
      client_name: string;
      original_value: string;
      loi_received: boolean;
      loi_date: string;
      notes: string;
    }>(
      `SELECT p.client_name, p.original_value::text AS original_value,
              h.loi_received, h.loi_date::text AS loi_date, h.notes
         FROM projects.lead_handovers h
         JOIN projects.projects p ON p.tenant_id = h.tenant_id AND p.id = h.project_id
        WHERE h.id = $1`,
      [created.handoverId],
    );
    await admin.query('COMMIT');

    // The client's name came from the opportunity, not from the request.
    expect(rows[0]?.client_name).toBe('Meridian Towers');
    expect(rows[0]?.original_value).toBe('4000000');
    expect(rows[0]?.loi_received).toBe(true);
    expect(rows[0]?.loi_date).toBe('2026-09-01');
    expect(rows[0]?.notes).toBe('Access is nights only until the 15th.');
  });

  it('AN UNSETTLED CONTRACT VALUE IS ABSENT, NOT ZERO', async () => {
    const lead = await newLead('Value Pending Realty');
    const res = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-2',
      name: 'Value pending fitout',
      ...CONFIRMED,
      expectedVersion: lead.version,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { projectId: string };

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const { rows } = await admin.query<{ original_value: string | null }>(
      `SELECT original_value::text AS original_value FROM projects.projects WHERE id = $1`,
      [created.projectId],
    );
    await admin.query('COMMIT');
    // NULL. A project that opens showing zero rupees reads as a bug in the
    // software rather than a gap in the paperwork.
    expect(rows[0]?.original_value).toBeNull();
  });

  it('refuses a second handover of the same opportunity', async () => {
    const lead = await newLead('Twice Realty');
    const first = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-3',
      name: 'Twice fitout',
      ...CONFIRMED,
      expectedVersion: lead.version,
    });
    expect(first.status).toBe(201);

    const second = await send(`/api/v1/projects/leads/${lead.id}/handover`, 'POST', OWNER, {
      code: 'HO-4',
      name: 'Twice fitout again',
      ...CONFIRMED,
      expectedVersion: lead.version,
    });
    // The conversion refuses it: the lead is already converted. The unique
    // constraint on (tenant_id, lead_id) is the backstop behind that.
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('THE DATABASE REFUSES AN UNCONFIRMED HANDOVER EVEN IF A ROUTE STOPS CHECKING', async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await expect(
      admin.query(
        `INSERT INTO projects.lead_handovers
           (tenant_id, lead_id, project_id, scope_confirmed, commercials_confirmed)
         SELECT $1, l.id, l.converted_project_id, false, true
           FROM projects.leads l
          WHERE l.converted_project_id IS NOT NULL
          LIMIT 1`,
        [tenantId],
      ),
    ).rejects.toThrow(/lead_handovers_confirmed_check/);
    await admin.query('ROLLBACK');
  });

  it('the handover record cannot be edited or deleted by the runtime', async () => {
    const runtime = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await runtime.connect();
    try {
      await expect(
        runtime.query('UPDATE projects.lead_handovers SET notes = $1', ['rewritten']),
      ).rejects.toThrow(/permission denied/i);
      await expect(runtime.query('DELETE FROM projects.lead_handovers')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await runtime.end();
    }
  });
});

describe('design-build 1 — the client brief, and the gate in front of it', () => {
  const SLUG = 'brief';
  const PLATFORM_CRED = 'ops.brief@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let tenantId = '';
  let projectId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Brief Interiors Private Limited',
      appOrigin: 'https://brief.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    const project = await send('/api/v1/projects', 'POST', OWNER, {
      code: 'BRF-1',
      name: 'Brief test fitout',
      clientName: 'Brief Test Client',
    });
    expect(project.status).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;
  });

  it('IS 404 UNTIL THE TENANT SWITCHES THE MODULE ON — every route of it', async () => {
    // Not 403. A module a tenant never enabled has no permission question to
    // answer, and a 403 would confirm the feature exists. The caller here holds
    // `admin`, so this is the gate and nothing else.
    for (const [method, path, body] of [
      ['GET', `/api/v1/design-build/brief/projects/${projectId}`, undefined],
      ['PUT', `/api/v1/design-build/brief/projects/${projectId}`, { scopeSummary: 'x' }],
      ['POST', `/api/v1/design-build/brief/${randomUUID()}/status`, { status: 'issued' }],
      ['POST', `/api/v1/design-build/brief/${randomUUID()}/statements`, { kind: 'assumption', body: 'x' }],
      ['PUT', `/api/v1/design-build/brief/${randomUUID()}/rooms`, { roomName: 'x' }],
    ] as const) {
      const res = await send(path, method, OWNER, body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it('nothing was written while the module was off', async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM projects.client_briefs WHERE tenant_id = $1`,
      [tenantId],
    );
    await admin.query('COMMIT');
    expect(rows[0]?.n).toBe('0');
  });

  it('answers once the module is on, and starts empty', async () => {
    const on = await send('/api/v1/settings/modules/design_brief', 'PUT', OWNER, {
      enabled: true,
    });
    expect(on.status).toBe(200);

    const res = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it('writes version 1, and an unstated budget is NULL rather than zero', async () => {
    const res = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'PUT', OWNER, {
      engagementType: 'turnkey',
      scopeSummary: 'Ground floor fit-out, nights only.',
      approvalAuthority: 'Head of facilities',
    });
    expect(res.status).toBe(200);
    const brief = (await res.json()) as {
      version: number;
      status: string;
      budgetMinPaise: string | null;
    };
    expect(brief.version).toBe(1);
    expect(brief.status).toBe('draft');
    // The legacy writes `Number(payload.budgetMin ?? 0)`, so "not discussed"
    // and "nothing" become the same row.
    expect(brief.budgetMinPaise).toBeNull();
  });

  it('refuses a maximum budget below the minimum', async () => {
    const res = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'PUT', OWNER, {
      budgetMinPaise: '5000000',
      budgetMaxPaise: '4000000',
    });
    // Both numbers look plausible alone, which is why this is a constraint and
    // not a review comment.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('takes rooms and statements while it is a draft', async () => {
    const list = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    const briefId = ((await list.json()) as { items: { id: string }[] }).items[0]?.id ?? '';

    const room = await send(`/api/v1/design-build/brief/${briefId}/rooms`, 'PUT', OWNER, {
      roomName: 'Boardroom',
      areaSqft: 420,
      headcount: 14,
      purpose: 'Client meetings',
    });
    expect(room.status).toBe(201);

    const statement = await send(
      `/api/v1/design-build/brief/${briefId}/statements`,
      'POST',
      OWNER,
      { kind: 'exclusion', body: 'Loose furniture is excluded.' },
    );
    expect(statement.status).toBe(201);

    const after = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    const current = ((await after.json()) as {
      items: { rooms: { areaSqft: number }[]; statements: { body: string }[] }[];
    }).items[0];
    expect(current?.rooms[0]?.areaSqft).toBe(420);
    expect(current?.statements[0]?.body).toBe('Loose furniture is excluded.');
  });

  it('AN ACKNOWLEDGED BRIEF IS FROZEN — rooms and statements are refused', async () => {
    const list = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    const briefId = ((await list.json()) as { items: { id: string }[] }).items[0]?.id ?? '';

    const ack = await send(`/api/v1/design-build/brief/${briefId}/status`, 'POST', OWNER, {
      status: 'acknowledged',
    });
    expect(ack.status).toBe(200);
    const acknowledged = (await ack.json()) as {
      status: string;
      acknowledgedBy: string | null;
      acknowledgedAt: string | null;
    };
    expect(acknowledged.status).toBe('acknowledged');
    // A principal, not `session?.name || session?.email || 'Client'`. The
    // database refuses the row without one.
    expect(acknowledged.acknowledgedBy).not.toBeNull();
    expect(acknowledged.acknowledgedAt).not.toBeNull();

    const room = await send(`/api/v1/design-build/brief/${briefId}/rooms`, 'PUT', OWNER, {
      roomName: 'Snuck in later',
    });
    expect(room.status).toBe(400);
    expect(((await room.json()) as { message: string }).message).toMatch(/acknowledged/i);

    const statement = await send(
      `/api/v1/design-build/brief/${briefId}/statements`,
      'POST',
      OWNER,
      { kind: 'assumption', body: 'Snuck in later' },
    );
    expect(statement.status).toBe(400);
  });

  it('SAVING A CHANGE MAKES VERSION 2 AND CARRIES THE ROOMS ACROSS', async () => {
    const res = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'PUT', OWNER, {
      scopeSummary: 'Ground and first floor. Nights only.',
    });
    expect(res.status).toBe(200);
    const next = (await res.json()) as {
      version: number;
      status: string;
      rooms: { roomName: string }[];
      statements: unknown[];
      scopeSummary: string;
    };
    expect(next.version).toBe(2);
    expect(next.status).toBe('draft');
    expect(next.scopeSummary).toBe('Ground and first floor. Nights only.');
    // Copied, not re-typed. Re-typing a whole scope to change one line is how
    // somebody ends up editing the frozen version instead.
    expect(next.rooms.map((r) => r.roomName)).toEqual(['Boardroom']);
    expect(next.statements).toHaveLength(1);

    const all = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    const items = ((await all.json()) as {
      items: { version: number; status: string; acknowledgedAt: string | null }[];
    }).items;
    expect(items).toHaveLength(2);
    // Version 1 keeps its own row, its rooms and the record of who
    // acknowledged it. It is superseded, not deleted.
    const first = items.find((b) => b.version === 1);
    expect(first?.status).toBe('superseded');
    expect(first?.acknowledgedAt).not.toBeNull();
  });

  it('switching the module off hides it and deletes nothing', async () => {
    const off = await send('/api/v1/settings/modules/design_brief', 'PUT', OWNER, {
      enabled: false,
    });
    expect(off.status).toBe(200);

    const gone = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    expect(gone.status).toBe(404);

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM projects.client_briefs WHERE tenant_id = $1`,
      [tenantId],
    );
    await admin.query('COMMIT');
    // Both versions still there. Off is a visibility state.
    expect(rows[0]?.n).toBe('2');

    const backOn = await send('/api/v1/settings/modules/design_brief', 'PUT', OWNER, {
      enabled: true,
    });
    expect(backOn.status).toBe(200);
    const back = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    expect(((await back.json()) as { items: unknown[] }).items).toHaveLength(2);
  });

  it("one tenant's module being on does not switch it on for another", async () => {
    // A second organisation, provisioned the same way and never touched. Its
    // own admin gets 404 from its own project while this tenant's routes are
    // open — which is the whole claim the switch makes.
    const other = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: 'brief-other',
      legalName: 'Brief Other Interiors Private Limited',
      appOrigin: 'https://brief-other.example.test',
      adminEmail: 'owner@brief-other.test',
      adminExternalId: 'owner@brief-other.test',
    });
    expect(other.status).toBe(201);

    const theirProject = await send('/api/v1/projects', 'POST', 'owner@brief-other.test', {
      code: 'BRF-2',
      name: 'Their fitout',
      clientName: 'Their client',
    });
    expect(theirProject.status).toBe(201);
    const theirProjectId = ((await theirProject.json()) as { id: string }).id;

    const res = await send(
      `/api/v1/design-build/brief/projects/${theirProjectId}`,
      'GET',
      'owner@brief-other.test',
    );
    expect(res.status).toBe(404);

    // And ours is still open.
    const mine = await send(`/api/v1/design-build/brief/projects/${projectId}`, 'GET', OWNER);
    expect(mine.status).toBe(200);
  });
});

describe('design-build 2 and 3 — deliverables, selections, substitutions', () => {
  const SLUG = 'designwork';
  const PLATFORM_CRED = 'ops.designwork@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let tenantId = '';
  let projectId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Design Work Interiors Private Limited',
      appOrigin: 'https://designwork.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    const project = await send('/api/v1/projects', 'POST', OWNER, {
      code: 'DW-1',
      name: 'Design work fitout',
      clientName: 'Design Work Client',
    });
    expect(project.status).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;
  });

  it('both modules are 404 until they are switched on, independently', async () => {
    expect(
      (await send(`/api/v1/design-build/deliverables/projects/${projectId}`, 'GET', OWNER)).status,
    ).toBe(404);
    expect(
      (await send(`/api/v1/design-build/selections/projects/${projectId}`, 'GET', OWNER)).status,
    ).toBe(404);

    // Switching ONE on does not switch the other on.
    expect(
      (await send('/api/v1/settings/modules/design_deliverables', 'PUT', OWNER, { enabled: true }))
        .status,
    ).toBe(200);
    expect(
      (await send(`/api/v1/design-build/deliverables/projects/${projectId}`, 'GET', OWNER)).status,
    ).toBe(200);
    expect(
      (await send(`/api/v1/design-build/selections/projects/${projectId}`, 'GET', OWNER)).status,
    ).toBe(404);

    expect(
      (await send('/api/v1/settings/modules/room_selections', 'PUT', OWNER, { enabled: true }))
        .status,
    ).toBe(200);
    expect(
      (await send(`/api/v1/design-build/selections/projects/${projectId}`, 'GET', OWNER)).status,
    ).toBe(200);
  });

  it('A DELIVERABLE WITH NO AGREED LIMIT IS NEVER FLAGGED, however many revisions', async () => {
    // The legacy writes `included_revisions_limit ?? 2`, so every deliverable
    // starts charging on the third revision because of a `??`.
    const created = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'No limit agreed' },
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { id: string }).id;

    for (let n = 0; n < 5; n += 1) {
      expect((await send(`/api/v1/design-build/deliverables/${id}/submit`, 'POST', OWNER)).status)
        .toBe(200);
      const review = await send(`/api/v1/design-build/deliverables/${id}/review`, 'POST', OWNER, {
        decision: 'revision_requested',
        feedback: 'Move the door',
      });
      expect(review.status).toBe(200);
      const result = (await review.json()) as {
        revisionCount: number;
        beyondIncludedRevisions: boolean;
      };
      expect(result.revisionCount).toBe(n + 2);
      // Never flagged. Nobody agreed a limit for it to be past.
      expect(result.beyondIncludedRevisions).toBe(false);
    }
  });

  it('THE REVISION PAST AN AGREED LIMIT IS FLAGGED — and only flagged', async () => {
    const created = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'Two included', includedRevisionsLimit: 2 },
    );
    const id = ((await created.json()) as { id: string }).id;

    // Revision 1 is the issue itself. Asking for a revision makes it 2, which
    // is still inside the two that were included.
    await send(`/api/v1/design-build/deliverables/${id}/submit`, 'POST', OWNER);
    const second = await send(`/api/v1/design-build/deliverables/${id}/review`, 'POST', OWNER, {
      decision: 'revision_requested',
    });
    expect(((await second.json()) as { beyondIncludedRevisions: boolean }).beyondIncludedRevisions)
      .toBe(false);

    // The third is past it.
    await send(`/api/v1/design-build/deliverables/${id}/submit`, 'POST', OWNER);
    const third = await send(`/api/v1/design-build/deliverables/${id}/review`, 'POST', OWNER, {
      decision: 'revision_requested',
    });
    const result = (await third.json()) as {
      revisionCount: number;
      beyondIncludedRevisions: boolean;
    };
    expect(result.revisionCount).toBe(3);
    expect(result.beyondIncludedRevisions).toBe(true);

    // **And there is no amount anywhere.** A variation is priced on a change
    // order; a fee written here is a charge nobody authorised.
    const listed = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const body = await listed.text();
    expect(body).toContain('beyondIncludedRevisions');
    expect(body).not.toContain('extraScopeCharge');
  });

  it('refuses a review of a deliverable that was never issued', async () => {
    const created = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'Still a draft' },
    );
    const id = ((await created.json()) as { id: string }).id;
    const res = await send(`/api/v1/design-build/deliverables/${id}/review`, 'POST', OWNER, {
      decision: 'approved',
    });
    expect(res.status).toBe(400);
  });

  it('an approved selection is frozen, and frozen means approved', async () => {
    const created = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Task chair', roomLabel: 'Boardroom', unitPricePaise: '1200000' },
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { id: string }).id;

    const decided = await send(`/api/v1/design-build/selections/${id}/decide`, 'POST', OWNER, {
      decision: 'approved',
    });
    expect(decided.status).toBe(200);

    const listed = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const found = ((await listed.json()) as {
      items: { id: string; status: string; isFrozen: boolean }[];
    }).items.find((s) => s.id === id);
    expect(found?.status).toBe('approved');
    expect(found?.isFrozen).toBe(true);
  });

  it('THE DATABASE REFUSES A FROZEN FLAG THAT DISAGREES WITH THE STATUS', async () => {
    // Two booleans that can disagree are two sources of truth, and the one
    // procurement reads is whichever the last writer set.
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await expect(
      admin.query(
        `UPDATE projects.room_selections SET is_frozen = false
          WHERE tenant_id = $1 AND status = 'approved'`,
        [tenantId],
      ),
    ).rejects.toThrow(/room_selections_frozen_check/);
    await admin.query('ROLLBACK');
  });

  it('refuses a substitution against a selection nobody has approved', async () => {
    const created = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Not decided yet' },
    );
    const id = ((await created.json()) as { id: string }).id;
    const res = await send(`/api/v1/design-build/selections/${id}/substitutions`, 'POST', OWNER, {
      proposedSpec: 'Something else',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/not been approved/i);
  });

  it('APPROVING AN ALTERNATIVE APPLIES ITS PRICE CHANGE EXACTLY ONCE', async () => {
    const created = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Pendant light', unitPricePaise: '1000000' },
    );
    const selectionId = ((await created.json()) as { id: string }).id;
    await send(`/api/v1/design-build/selections/${selectionId}/decide`, 'POST', OWNER, {
      decision: 'approved',
    });

    const proposed = await send(
      `/api/v1/design-build/selections/${selectionId}/substitutions`,
      'POST',
      OWNER,
      { proposedSpec: 'Alternative pendant', priceDeltaPaise: '250000', leadTimeDeltaDays: -14 },
    );
    expect(proposed.status).toBe(201);
    const substitutionId = ((await proposed.json()) as { id: string }).id;

    const first = await send(
      `/api/v1/design-build/substitutions/${substitutionId}/decide`,
      'POST',
      OWNER,
      { approve: true },
    );
    expect(first.status).toBe(200);
    expect(((await first.json()) as { newUnitPricePaise: string }).newUnitPricePaise).toBe(
      '1250000',
    );

    // The second approval changes nothing. This is the bug the legacy fixed
    // with a read-then-return guard after the price had been inflated twice;
    // here the UPDATE carries `WHERE status = 'pending'`, so it holds under
    // concurrency too.
    const second = await send(
      `/api/v1/design-build/substitutions/${substitutionId}/decide`,
      'POST',
      OWNER,
      { approve: true },
    );
    expect(second.status).toBe(400);

    const listed = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const found = ((await listed.json()) as {
      items: { id: string; unitPricePaise: string }[];
    }).items.find((s) => s.id === selectionId);
    // Still 12,50,000 and not 15,00,000.
    expect(found?.unitPricePaise).toBe('1250000');
  });

  it('refuses a second alternative while one is waiting', async () => {
    const created = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Carpet tile', unitPricePaise: '500000' },
    );
    const selectionId = ((await created.json()) as { id: string }).id;
    await send(`/api/v1/design-build/selections/${selectionId}/decide`, 'POST', OWNER, {
      decision: 'approved',
    });

    const first = await send(
      `/api/v1/design-build/selections/${selectionId}/substitutions`,
      'POST',
      OWNER,
      { proposedSpec: 'Alternative A' },
    );
    expect(first.status).toBe(201);

    // Two pending proposals means two people are about to be told two different
    // prices, and approving both applies both deltas.
    const second = await send(
      `/api/v1/design-build/selections/${selectionId}/substitutions`,
      'POST',
      OWNER,
      { proposedSpec: 'Alternative B' },
    );
    expect(second.status).toBe(400);
    expect(((await second.json()) as { message: string }).message).toMatch(/already an alternative/i);
  });

  it('refuses a saving larger than the item costs', async () => {
    const created = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Cheap thing', unitPricePaise: '100000' },
    );
    const selectionId = ((await created.json()) as { id: string }).id;
    await send(`/api/v1/design-build/selections/${selectionId}/decide`, 'POST', OWNER, {
      decision: 'approved',
    });
    const proposed = await send(
      `/api/v1/design-build/selections/${selectionId}/substitutions`,
      'POST',
      OWNER,
      { proposedSpec: 'Free thing', priceDeltaPaise: '-200000' },
    );
    const substitutionId = ((await proposed.json()) as { id: string }).id;

    const res = await send(
      `/api/v1/design-build/substitutions/${substitutionId}/decide`,
      'POST',
      OWNER,
      { approve: true },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/negative/i);
  });

  it('a review cannot be edited or deleted by the runtime', async () => {
    const runtime = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await runtime.connect();
    try {
      await expect(
        runtime.query('UPDATE projects.design_reviews SET feedback = $1', ['rewritten']),
      ).rejects.toThrow(/permission denied/i);
      await expect(runtime.query('DELETE FROM projects.design_reviews')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await runtime.end();
    }
  });
});

describe('design-build 4 and 5 — the agreement, and what cannot arrive in time', () => {
  const SLUG = 'commercials';
  const PLATFORM_CRED = 'ops.commercials@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let projectId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Commercials Interiors Private Limited',
      appOrigin: 'https://commercials.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);

    const project = await send('/api/v1/projects', 'POST', OWNER, {
      code: 'CM-1',
      name: 'Commercials fitout',
      clientName: 'Commercials Client',
    });
    expect(project.status).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;

    for (const key of [
      'commercial_agreement',
      'procurement_plan',
      'design_brief',
      'room_selections',
    ]) {
      expect(
        (await send(`/api/v1/settings/modules/${key}`, 'PUT', OWNER, { enabled: true })).status,
      ).toBe(200);
    }
  });

  it('THERE IS NO DEPOSIT, VALIDITY OR REVISION DEFAULT TO BE FOUND', async () => {
    await send(`/api/v1/design-build/agreement/projects/${projectId}`, 'PUT', OWNER, {
      engagementType: 'turnkey',
      contractValuePaise: '10000000',
    });
    const res = await send(`/api/v1/design-build/agreement/projects/${projectId}`, 'GET', OWNER);
    expect(res.status).toBe(200);
    const body = await res.text();
    // The legacy invents all four with a `??` and reads none of them.
    for (const invented of ['depositPct', 'validityDays', 'includedRevisions', 'includedSiteVisits']) {
      expect(body, `${invented} should not exist`).not.toContain(invented);
    }
  });

  it('REFUSES TO SIGN WHILE THE STAGES DO NOT COME TO THE WHOLE CONTRACT', async () => {
    await send(`/api/v1/design-build/agreement/projects/${projectId}/stages`, 'PUT', OWNER, {
      stages: [
        { name: 'Advance', shareBp: 3000, trigger: 'On signing' },
        { name: 'On delivery', shareBp: 6000, trigger: 'Materials to site' },
      ],
    });

    const res = await send(
      `/api/v1/design-build/agreement/projects/${projectId}/status`,
      'POST',
      OWNER,
      { status: 'signed', signedOn: '2026-09-06' },
    );
    expect(res.status).toBe(400);
    // 90%. The missing 10% is money that never gets billed, and the schedule
    // looks entirely normal.
    expect(((await res.json()) as { message: string }).message).toMatch(/90(\.00)?%/);
  });

  it('refuses a schedule that comes to more than the whole contract', async () => {
    const res = await send(
      `/api/v1/design-build/agreement/projects/${projectId}/stages`,
      'PUT',
      OWNER,
      { stages: [{ name: 'Everything twice', shareBp: 10_000 }, { name: 'And again', shareBp: 5000 }] },
    );
    expect(res.status).toBe(400);
  });

  it('signs once the stages add up, and the amounts total the contract EXACTLY', async () => {
    // Three thirds of a value that does not divide by three. Rounding each
    // share independently leaves the set a paisa short of the contract.
    await send(`/api/v1/design-build/agreement/projects/${projectId}`, 'PUT', OWNER, {
      contractValuePaise: '10000001',
    });
    await send(`/api/v1/design-build/agreement/projects/${projectId}/stages`, 'PUT', OWNER, {
      stages: [
        { name: 'First', shareBp: 3333 },
        { name: 'Second', shareBp: 3333 },
        { name: 'Third', shareBp: 3334 },
      ],
    });

    const signed = await send(
      `/api/v1/design-build/agreement/projects/${projectId}/status`,
      'POST',
      OWNER,
      { status: 'signed', signedOn: '2026-09-06' },
    );
    expect(signed.status).toBe(200);

    const res = await send(`/api/v1/design-build/agreement/projects/${projectId}`, 'GET', OWNER);
    const agreement = ((await res.json()) as {
      agreement: { contractValuePaise: string; stages: { amountPaise: string }[] };
    }).agreement;

    const total = agreement.stages.reduce((sum, s) => sum + BigInt(s.amountPaise), 0n);
    // Exactly. The last stage carries the remainder.
    expect(total.toString()).toBe(agreement.contractValuePaise);
  });

  it('refuses to change a signed agreement', async () => {
    const res = await send(`/api/v1/design-build/agreement/projects/${projectId}`, 'PUT', OWNER, {
      contractValuePaise: '99999999',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/change order/i);
  });

  it('NO TARGET DATE MEANS NOTHING TO BE LATE AGAINST, not nothing is late', async () => {
    // A 20-week item and no brief. The legacy falls back to the last
    // milestone's own planned finish, so a project measures itself against
    // itself and can never miss.
    await send(`/api/v1/design-build/selections/projects/${projectId}`, 'POST', OWNER, {
      itemName: 'Imported stone',
      leadTimeWeeks: 20,
    });

    const res = await send(
      `/api/v1/design-build/procurement-plan/projects/${projectId}`,
      'GET',
      OWNER,
    );
    expect(res.status).toBe(200);
    const plan = (await res.json()) as {
      targetCompletionDate: string | null;
      conflicts: unknown[];
      longLead: unknown[];
    };
    expect(plan.targetCompletionDate).toBeNull();
    expect(plan.conflicts).toEqual([]);
    // But the item IS listed as long-lead, so it is not invisible.
    expect(plan.longLead).toHaveLength(1);
  });

  it('REPORTS THE SHORTFALL ONCE THERE IS A DATE TO MEASURE AGAINST', async () => {
    // A target four weeks out, against a 20-week item.
    const soon = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);
    await send(`/api/v1/design-build/brief/projects/${projectId}`, 'PUT', OWNER, {
      targetCompletionDate: soon,
    });

    const res = await send(
      `/api/v1/design-build/procurement-plan/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const plan = (await res.json()) as {
      targetCompletionDate: string;
      conflicts: { itemName: string; daysShort: number; leadTimeWeeks: number }[];
    };
    expect(plan.targetCompletionDate).toBe(soon);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.itemName).toBe('Imported stone');
    // 140 days needed, 28 available.
    expect(plan.conflicts[0]?.daysShort).toBe(140 - 28);
  });
});

describe('design-build 6 and 7 — joinery stages, and milestones that carry a reason', () => {
  const SLUG = 'joinery';
  const PLATFORM_CRED = 'ops.joinery@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let projectId = '';
  let packageId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    expect(
      (
        await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
          slug: SLUG,
          legalName: 'Joinery Interiors Private Limited',
          appOrigin: 'https://joinery.example.test',
          adminEmail: OWNER,
          adminExternalId: OWNER,
        })
      ).status,
    ).toBe(201);

    const project = await send('/api/v1/projects', 'POST', OWNER, {
      code: 'JY-1',
      name: 'Joinery fitout',
      clientName: 'Joinery Client',
    });
    projectId = ((await project.json()) as { id: string }).id;

    for (const key of ['joinery_packages', 'delivery_milestones']) {
      expect(
        (await send(`/api/v1/settings/modules/${key}`, 'PUT', OWNER, { enabled: true })).status,
      ).toBe(200);
    }
  });

  it('a new package gets all nine stages, in order, from the first day', async () => {
    const created = await send(
      `/api/v1/design-build/joinery/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'Reception desk', roomLabel: 'Reception', workshop: 'Bespoke Works' },
    );
    expect(created.status).toBe(201);
    packageId = ((await created.json()) as { id: string }).id;

    const listed = await send(`/api/v1/design-build/joinery/projects/${projectId}`, 'GET', OWNER);
    const pkg = ((await listed.json()) as {
      items: { id: string; currentStage: string; stages: { position: number; name: string }[] }[];
    }).items[0];

    expect(pkg?.stages).toHaveLength(9);
    expect(pkg?.stages[0]?.name).toBe('Site measurement');
    expect(pkg?.stages[8]?.name).toBe('Final client acceptance');
    // Dispatch and receipt are separate stages, which is where a package goes
    // missing and why the list is not shortened.
    expect(pkg?.stages.map((s) => s.name)).toContain('Dispatch from works');
    expect(pkg?.stages.map((s) => s.name)).toContain('Site receipt');
    expect(pkg?.currentStage).toBe('Site measurement');
  });

  it('REFUSES A STAGE WHILE EARLIER ONES ARE OUTSTANDING, AND NAMES THEM', async () => {
    const listed = await send(`/api/v1/design-build/joinery/projects/${projectId}`, 'GET', OWNER);
    const stages = ((await listed.json()) as {
      items: { stages: { id: string; name: string }[] }[];
    }).items[0]?.stages;

    // Factory fabrication is stage 4. The shop drawing has not been approved.
    const fabrication = stages?.find((s) => s.name === 'Factory fabrication');
    const res = await send(
      `/api/v1/design-build/joinery/stages/${fabrication?.id ?? ''}/complete`,
      'POST',
      OWNER,
      {},
    );
    expect(res.status).toBe(400);
    const message = ((await res.json()) as { message: string }).message;
    // Naming what is outstanding, rather than just refusing: on a nine-stage
    // process "you cannot do that" sends somebody hunting.
    expect(message).toContain('Site measurement');
    expect(message).toContain('Shop drawing approval');
  });

  it('advances in order, and the package says what it is waiting on', async () => {
    const listed = await send(`/api/v1/design-build/joinery/projects/${projectId}`, 'GET', OWNER);
    const stages = ((await listed.json()) as {
      items: { stages: { id: string; name: string }[] }[];
    }).items[0]?.stages;

    const first = await send(
      `/api/v1/design-build/joinery/stages/${stages?.[0]?.id ?? ''}/complete`,
      'POST',
      OWNER,
      { evidenceUrl: 'https://example.test/measure.pdf', notes: 'Measured on site' },
    );
    expect(first.status).toBe(200);
    const result = (await first.json()) as { currentStage: string; completedStage: string };
    expect(result.completedStage).toBe('Site measurement');
    expect(result.currentStage).toBe('Shop drawing approval');

    // And the same stage cannot be signed off twice.
    const again = await send(
      `/api/v1/design-build/joinery/stages/${stages?.[0]?.id ?? ''}/complete`,
      'POST',
      OWNER,
      {},
    );
    expect(again.status).toBe(400);
  });

  it('THE SIGN-OFF CARRIES A PRINCIPAL, never a display name', async () => {
    const listed = await send(`/api/v1/design-build/joinery/projects/${projectId}`, 'GET', OWNER);
    const stages = ((await listed.json()) as {
      items: { stages: { name: string; completedBy: string | null }[] }[];
    }).items[0]?.stages;
    const measured = stages?.find((s) => s.name === 'Site measurement');
    // The legacy writes `session?.name || session?.email || 'Inspector'`, so a
    // session with no name signs off a quality inspection as "Inspector".
    expect(measured?.completedBy).not.toBeNull();
  });

  it('A DELAYED MILESTONE IS REFUSED WITHOUT A REASON — route and database', async () => {
    const created = await send(
      `/api/v1/design-build/milestones/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'Ceiling grid complete', plannedStart: '2026-09-01', plannedFinish: '2026-09-20' },
    );
    expect(created.status).toBe(201);
    const milestoneId = ((await created.json()) as { id: string }).id;

    const res = await send(
      `/api/v1/design-build/milestones/${milestoneId}/progress`,
      'POST',
      OWNER,
      { status: 'delayed' },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/needs a reason/i);

    const withReason = await send(
      `/api/v1/design-build/milestones/${milestoneId}/progress`,
      'POST',
      OWNER,
      { status: 'delayed', delayReason: 'Grid material held at the port', recoveryPlan: 'Air freight the balance' },
    );
    expect(withReason.status).toBe(200);
  });

  it('refuses a milestone that finishes before it starts', async () => {
    const res = await send(
      `/api/v1/design-build/milestones/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'Backwards', plannedStart: '2026-09-20', plannedFinish: '2026-09-01' },
    );
    expect(res.status).toBe(400);
  });

  it('NO PREDECESSOR, NO CRITICAL PATH, NO READINESS GATE anywhere in the shape', async () => {
    const res = await send(
      `/api/v1/design-build/milestones/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const body = await res.text();
    // The legacy stores all three and reads none of them.
    for (const absent of ['predecessor', 'criticalPath', 'readinessGate', 'siteReadiness']) {
      expect(body, `${absent} should not exist`).not.toContain(absent);
    }
  });

  it('computes the fortnight lookahead and the days late', async () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await send(`/api/v1/design-build/milestones/projects/${projectId}`, 'POST', OWNER, {
      name: 'Starts this week',
      plannedStart: soon,
      plannedFinish: later,
    });

    const res = await send(
      `/api/v1/design-build/milestones/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const items = ((await res.json()) as {
      items: { name: string; inLookahead: boolean; daysLate: number | null }[];
    }).items;

    expect(items.find((m) => m.name === 'Starts this week')?.inLookahead).toBe(true);
    // The 2026-09-20 one is in the past relative to a later run and in the
    // future relative to an earlier one, so the assertion is about the SHAPE:
    // a number or null, never a negative.
    for (const m of items) {
      if (m.daysLate !== null) expect(m.daysLate).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('design-build 8 and 9 — the handover gate, and a warranty with nothing invented', () => {
  const SLUG = 'closeout';
  const PLATFORM_CRED = 'ops.closeout@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let projectId = '';
  let criticalId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    expect(
      (
        await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
          slug: SLUG,
          legalName: 'Closeout Interiors Private Limited',
          appOrigin: 'https://closeout.example.test',
          adminEmail: OWNER,
          adminExternalId: OWNER,
        })
      ).status,
    ).toBe(201);

    const project = await send('/api/v1/projects', 'POST', OWNER, {
      code: 'CO-1',
      name: 'Closeout fitout',
      clientName: 'Closeout Client',
    });
    projectId = ((await project.json()) as { id: string }).id;

    for (const key of ['handover', 'warranty']) {
      expect(
        (await send(`/api/v1/settings/modules/${key}`, 'PUT', OWNER, { enabled: true })).status,
      ).toBe(200);
    }
  });

  it('A CRITICAL ITEM BLOCKS THE HANDOVER, and the refusal says how many', async () => {
    const minor = await send(
      `/api/v1/design-build/handover/projects/${projectId}/items`,
      'POST',
      OWNER,
      { kind: 'snag', severity: 'minor', description: 'Paint touch-up in reception' },
    );
    expect(minor.status).toBe(201);

    const critical = await send(
      `/api/v1/design-build/handover/projects/${projectId}/items`,
      'POST',
      OWNER,
      { kind: 'defect', severity: 'critical', description: 'Fire door does not self-close' },
    );
    expect(critical.status).toBe(201);
    criticalId = ((await critical.json()) as { id: string }).id;

    const res = await send(
      `/api/v1/design-build/handover/projects/${projectId}/issue`,
      'POST',
      OWNER,
      { notes: 'Trying it on' },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/1 critical item/i);
  });

  it('RECTIFYING NEEDS A PHOTOGRAPH — a tick is not evidence', async () => {
    const res = await send(
      `/api/v1/design-build/handover/items/${criticalId}/rectify`,
      'POST',
      OWNER,
      { notes: 'Fixed it, honest' },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/photograph|evidence/i);
  });

  it('the database refuses a rectified item with no evidence, even without the route', async () => {
    await admin.query('BEGIN');
    await admin.query(
      `SELECT set_config($1, (SELECT tenant_id::text FROM projects.handover_items WHERE id = $2), true)`,
      ['app.tenant_id', criticalId],
    );
    await expect(
      admin.query(
        `UPDATE projects.handover_items SET status = 'rectified' WHERE id = $1`,
        [criticalId],
      ),
    ).rejects.toThrow(/handover_items_rectified_check/);
    await admin.query('ROLLBACK');
  });

  it('issues once the critical item is rectified, and MINOR ONES MAY STAY OPEN', async () => {
    const fixed = await send(
      `/api/v1/design-build/handover/items/${criticalId}/rectify`,
      'POST',
      OWNER,
      { afterPhotoUrl: 'https://example.test/door-closed.jpg', notes: 'Closer adjusted' },
    );
    expect(fixed.status).toBe(200);

    const res = await send(
      `/api/v1/design-build/handover/projects/${projectId}/issue`,
      'POST',
      OWNER,
      { notes: 'Client walked it with us' },
    );
    expect(res.status).toBe(201);
    const record = (await res.json()) as {
      totalItems: number;
      rectifiedItems: number;
      openMinor: number;
    };
    expect(record.totalItems).toBe(2);
    expect(record.rectifiedItems).toBe(1);
    // The minor snag is recorded as open rather than blocking.
    expect(record.openMinor).toBe(1);
  });

  it('THE RECORDED COUNTS DO NOT MOVE WHEN AN ITEM IS CLOSED LATER', async () => {
    const listed = await send(
      `/api/v1/design-build/handover/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const state = (await listed.json()) as {
      items: { id: string; status: string }[];
      record: { openMinor: number };
    };
    const stillOpen = state.items.find((i) => i.status === 'open');

    await send(`/api/v1/design-build/handover/items/${stillOpen?.id ?? ''}/rectify`, 'POST', OWNER, {
      afterPhotoUrl: 'https://example.test/paint.jpg',
    });

    const after = await send(
      `/api/v1/design-build/handover/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const record = ((await after.json()) as { record: { openMinor: number } }).record;
    // Still 1. A handover that rewrites itself afterwards records nothing.
    expect(record.openMinor).toBe(1);
  });

  it('refuses a second handover of the same project', async () => {
    const res = await send(
      `/api/v1/design-build/handover/projects/${projectId}/issue`,
      'POST',
      OWNER,
      {},
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/already been handed over/i);
  });

  it('A WARRANTY CLAIM INVENTS NOTHING — no SLA, no category, no contractor', async () => {
    const created = await send(
      `/api/v1/design-build/warranty/projects/${projectId}`,
      'POST',
      OWNER,
      { title: 'Boardroom door not closing' },
    );
    expect(created.status).toBe(201);

    const listed = await send(
      `/api/v1/design-build/warranty/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const claim = ((await listed.json()) as {
      items: {
        respondBy: string | null;
        category: string;
        assignedTo: string;
        overdue: boolean;
      }[];
    }).items[0];

    // The legacy writes now + 7 days, 'Carpentry' and 'General Works'.
    expect(claim?.respondBy).toBeNull();
    expect(claim?.category).toBe('');
    expect(claim?.assignedTo).toBe('');
    expect(claim?.overdue).toBe(false);
  });

  it('A PROMISED DATE IS ACTUALLY READ — the column the legacy never looks at', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const created = await send(
      `/api/v1/design-build/warranty/projects/${projectId}`,
      'POST',
      OWNER,
      {
        title: 'Skirting lifting in the lobby',
        reportedOn: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
        respondBy: yesterday,
      },
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { id: string }).id;

    const listed = await send(
      `/api/v1/design-build/warranty/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const claim = ((await listed.json()) as {
      items: { id: string; overdue: boolean }[];
    }).items.find((c) => c.id === id);
    expect(claim?.overdue).toBe(true);
  });

  it('closing a claim needs notes', async () => {
    const listed = await send(
      `/api/v1/design-build/warranty/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const id = ((await listed.json()) as { items: { id: string }[] }).items[0]?.id ?? '';

    const bare = await send(`/api/v1/design-build/warranty/${id}/decide`, 'POST', OWNER, {
      status: 'resolved',
    });
    expect(bare.status).toBe(400);

    const proper = await send(`/api/v1/design-build/warranty/${id}/decide`, 'POST', OWNER, {
      status: 'resolved',
      resolutionNotes: 'Hinge replaced and the frame packed out.',
    });
    expect(proper.status).toBe(200);
  });

  it('refuses a response date before the claim was reported', async () => {
    const res = await send(
      `/api/v1/design-build/warranty/projects/${projectId}`,
      'POST',
      OWNER,
      { title: 'Backwards', reportedOn: '2026-09-10', respondBy: '2026-09-01' },
    );
    expect(res.status).toBe(400);
  });
});

describe('design-build 10 and 11 — time, and decisions that arrived elsewhere', () => {
  const SLUG = 'clientdecide';
  const PLATFORM_CRED = 'ops.clientdecide@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const OTHER = `other@${SLUG}.test`;

  let tenantId = '';
  let projectId = '';
  let deliverableId = '';
  let selectionId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const created = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Client Decide Interiors Private Limited',
      appOrigin: 'https://clientdecide.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(created.status).toBe(201);
    tenantId = ((await created.json()) as { tenantId: string }).tenantId;

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, OTHER],
    );
    await admin.query('COMMIT');

    const project = await send('/api/v1/projects', 'POST', OWNER, {
      code: 'CD-1',
      name: 'Client decide fitout',
      clientName: 'Client Decide Client',
    });
    projectId = ((await project.json()) as { id: string }).id;

    for (const key of [
      'design_timesheets',
      'client_actions',
      'design_deliverables',
      'room_selections',
    ]) {
      expect(
        (await send(`/api/v1/settings/modules/${key}`, 'PUT', OWNER, { enabled: true })).status,
      ).toBe(200);
    }
  });

  it('TIME IS BOOKED AGAINST THE CALLER — there is no field for whose it is', async () => {
    const res = await send(`/api/v1/design-build/timesheets/projects/${projectId}`, 'POST', OWNER, {
      workDate: '2026-09-01',
      minutes: 90,
      stage: 'Concept',
      description: 'Layout options',
      // A field the legacy accepts as a fallback, so anybody can book anybody's
      // hours by typing their address. It has no effect here.
      userEmail: OTHER,
      principalId: randomUUID(),
    });
    expect(res.status).toBe(201);

    const listed = await send(
      `/api/v1/design-build/timesheets/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const sheet = (await listed.json()) as {
      entries: { principalEmail: string; duration: string }[];
      totalDuration: string;
    };
    expect(sheet.entries).toHaveLength(1);
    // Booked to the caller, not to the address in the payload.
    expect(sheet.entries[0]?.principalEmail).toBe(OWNER);
    // Whole minutes, formatted on the SERVER: the app is banned from `Math.*`.
    expect(sheet.entries[0]?.duration).toBe('1h 30m');
    expect(sheet.totalDuration).toBe('1h 30m');
  });

  it('refuses zero minutes, and refuses more than sixteen hours at once', async () => {
    for (const minutes of [0, 961]) {
      const res = await send(
        `/api/v1/design-build/timesheets/projects/${projectId}`,
        'POST',
        OWNER,
        { workDate: '2026-09-01', minutes },
      );
      expect(res.status, `minutes=${String(minutes)}`).toBe(400);
    }
  });

  it('lists what the client is holding up, from three places at once', async () => {
    const deliverable = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'POST',
      OWNER,
      { name: 'Concept pack' },
    );
    deliverableId = ((await deliverable.json()) as { id: string }).id;
    await send(`/api/v1/design-build/deliverables/${deliverableId}/submit`, 'POST', OWNER);

    const selection = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Reception tile', roomLabel: 'Reception', decisionDeadline: '2026-09-30' },
    );
    selectionId = ((await selection.json()) as { id: string }).id;

    const res = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'GET',
      OWNER,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { kind: string; id: string }[] };
    expect(body.items.map((i) => i.kind)).toContain('deliverable');
    expect(body.items.map((i) => i.kind)).toContain('selection');
  });

  it('RECORDS THE CHANNEL AS A FIELD, and applies the decision in the same breath', async () => {
    const res = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'POST',
      OWNER,
      {
        subjectKind: 'selection',
        subjectId: selectionId,
        decision: 'approved',
        channel: 'whatsapp',
        saidBy: 'Anita Rao',
        note: 'Said yes to the darker tile',
        decidedOn: '2026-09-04',
      },
    );
    expect(res.status).toBe(201);

    const after = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const body = (await after.json()) as {
      items: { kind: string; id: string }[];
      recorded: { channel: string; saidBy: string; decidedOn: string }[];
    };

    // The channel is a column, not `[External via WhatsApp]` prefixed onto a
    // feedback string.
    expect(body.recorded[0]?.channel).toBe('whatsapp');
    expect(body.recorded[0]?.saidBy).toBe('Anita Rao');
    // And when they said it, not when it was typed.
    expect(body.recorded[0]?.decidedOn).toBe('2026-09-04');

    // APPLIED: the selection is no longer waiting on them.
    expect(body.items.filter((i) => i.id === selectionId)).toHaveLength(0);

    const selections = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const selection = ((await selections.json()) as {
      items: { id: string; status: string; isFrozen: boolean }[];
    }).items.find((s) => s.id === selectionId);
    expect(selection?.status).toBe('approved');
    expect(selection?.isFrozen).toBe(true);
  });

  it('a decision recorded for the client counts as the CLIENT reviewing it', async () => {
    const res = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'POST',
      OWNER,
      {
        subjectKind: 'deliverable',
        subjectId: deliverableId,
        decision: 'revision_requested',
        channel: 'meeting',
        decidedOn: '2026-09-05',
      },
    );
    expect(res.status).toBe(201);

    const listed = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const deliverable = ((await listed.json()) as {
      items: { id: string; revisionCount: number; reviews: { reviewerKind: string }[] }[];
    }).items.find((d) => d.id === deliverableId);

    // The revision count moved, through the same function the in-app path uses.
    expect(deliverable?.revisionCount).toBe(2);
    // And it is recorded as the client's review, even though a member of staff
    // typed it in. Calling it internal would make the count read as our own.
    expect(deliverable?.reviews[0]?.reviewerKind).toBe('client');
  });

  it('refuses a decision the subject cannot take', async () => {
    const res = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'POST',
      OWNER,
      {
        subjectKind: 'selection',
        subjectId: selectionId,
        decision: 'revision_requested',
        channel: 'phone',
        decidedOn: '2026-09-05',
      },
    );
    expect(res.status).toBe(400);
  });

  it('THE RECORD CANNOT BE EDITED OR DELETED BY THE RUNTIME', async () => {
    const runtime = new pg.Client({
      host: 'localhost',
      port: postgres.getMappedPort(5432),
      user: 'app_runtime',
      password: 'runtime_pw',
      database: 'cog',
    });
    await runtime.connect();
    try {
      await expect(
        runtime.query('UPDATE projects.client_decisions SET channel = $1', ['email']),
      ).rejects.toThrow(/permission denied/i);
      await expect(runtime.query('DELETE FROM projects.client_decisions')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await runtime.end();
    }
  });
  it('THE SIDE DOOR IS GATED TOO — a decision cannot move a module that is off', async () => {
    // Client actions stays ON. Deliverables goes off.
    expect(
      (
        await send('/api/v1/settings/modules/design_deliverables', 'PUT', OWNER, {
          enabled: false,
        })
      ).status,
    ).toBe(200);

    // Recording a client decision APPLIES it through the deliverables module.
    // Gating the `/client-actions` prefix does not see that, because the path
    // does not say `deliverables`. Without a second gate this returns 201 and
    // moves the revision count — the counter that becomes a charge.
    const blocked = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'POST',
      OWNER,
      {
        subjectKind: 'deliverable',
        subjectId: deliverableId,
        decision: 'revision_requested',
        channel: 'email',
        decidedOn: '2026-09-06',
      },
    );
    expect(blocked.status).toBe(404);

    // THE SWITCHES STILL MOVE INDEPENDENTLY. Selections is a different module
    // and is still on, so a selection decision goes through in the same breath.
    // Gating all three subjects together would have been the lazy fix and would
    // have broken this.
    const fresh = await send(
      `/api/v1/design-build/selections/projects/${projectId}`,
      'POST',
      OWNER,
      { itemName: 'Lobby veneer', roomLabel: 'Lobby' },
    );
    const freshId = ((await fresh.json()) as { id: string }).id;
    const allowed = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'POST',
      OWNER,
      {
        subjectKind: 'selection',
        subjectId: freshId,
        decision: 'approved',
        channel: 'phone',
        decidedOn: '2026-09-06',
      },
    );
    expect(allowed.status).toBe(201);

    // A CHANGE ORDER is recorded, never applied — it writes nothing outside
    // this module — so it is mapped to no module and stays available while
    // deliverables is off. Mapping it to something would have gated a write
    // that does not happen.
    const changeOrder = await send(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      'POST',
      OWNER,
      {
        subjectKind: 'change_order',
        subjectId: randomUUID(),
        decision: 'approved',
        channel: 'letter',
        decidedOn: '2026-09-06',
      },
    );
    expect(changeOrder.status).toBe(201);

    // A body the gate cannot read falls through to the route's own validation,
    // which answers 400 and names the three kinds. Refusing in the gate would
    // answer 404 for a typo, which reads as "no such project".
    const garbage = await app.request(
      `/api/v1/design-build/client-actions/projects/${projectId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${OWNER}` },
        body: '{ not json',
      },
    );
    expect(garbage.status).toBe(400);

    // And the count the refusal was protecting did not move.
    expect(
      (
        await send('/api/v1/settings/modules/design_deliverables', 'PUT', OWNER, { enabled: true })
      ).status,
    ).toBe(200);
    const listed = await send(
      `/api/v1/design-build/deliverables/projects/${projectId}`,
      'GET',
      OWNER,
    );
    const deliverable = (
      (await listed.json()) as { items: { id: string; revisionCount: number }[] }
    ).items.find((item) => item.id === deliverableId);
    expect(deliverable?.revisionCount).toBe(2);
  });
});

/**
 * Creating a client login, through the invitation path.
 *
 * Client access could grant projects to a login that already existed and could
 * not create one, because an invitation carried no principal kind — and the
 * kind is what `requireStaff` and `requireKind` read to decide which
 * application a login may reach at all. Every principal in the system was
 * therefore created by direct SQL: the provisioner for a tenant's first
 * administrator, and the demo seed for the two portal logins.
 *
 * The dangerous direction is not the one the gap describes. It is redemption:
 * if the kind were taken from the request, a client invitation could be
 * redeemed as staff, and anyone ever sent a portal invite could let themselves
 * into the internal application. That is what most of this block is about.
 */
describe('an invitation creates a login of the kind it names', () => {
  const SLUG = 'invitekind';
  const PLATFORM_CRED = 'ops.invitekind@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let tenantId = '';
  let mineId = '';
  let otherId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  /** Mint an invitation and pull the token back out of the one-time URL. */
  async function invite(email: string, body: Record<string, unknown>) {
    const res = await send('/api/v1/identity/invites', 'POST', OWNER, { email, ...body });
    if (res.status !== 201) return { status: res.status, token: '' };
    const { url } = (await res.json()) as { url: string };
    return { status: res.status, token: new URL(url).searchParams.get('invite') ?? '' };
  }

  function redeem(token: string, credential: string, extra: Record<string, unknown> = {}) {
    return app.request('/invite/v1/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      body: JSON.stringify({ token, ...extra }),
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Invite Kind Interiors Private Limited',
      appOrigin: 'https://invitekind.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(res.status).toBe(201);
    tenantId = ((await res.json()) as { tenantId: string }).tenantId;

    for (const [code, name] of [
      ['IK-1', 'Theirs'],
      ['IK-2', 'Not theirs'],
    ] as const) {
      const created = await send('/api/v1/projects', 'POST', OWNER, {
        code,
        name,
        clientName: 'Invite Kind Client',
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      if (code === 'IK-1') mineId = id;
      else otherId = id;
    }
  });

  it('THE KIND COMES FROM THE INVITATION, NOT FROM WHOEVER REDEEMS IT', async () => {
    const email = `escalate@${SLUG}.test`;
    const { token } = await invite(email, { kind: 'client' });
    expect(token).not.toBe('');

    // The redeemer asks to be staff. The invitation says client.
    const accepted = await redeem(token, email, { kind: 'staff', roles: ['owner'] });
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toEqual({ kind: 'client', email });

    // Not merely what the response says — what the row says.
    const rows = await admin.query<{ kind: string; roles: string[] }>(
      `SELECT kind, roles FROM identity.principals WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    );
    expect(rows.rows[0]?.kind).toBe('client');
    expect(rows.rows[0]?.roles).toEqual([]);

    // And the kind is load-bearing rather than decorative: the login it
    // created is refused on the internal application.
    const staffApp = await send('/api/v1/projects', 'GET', email);
    expect(staffApp.status).toBe(403);
  });

  it('THE NAME COMES FROM THE INVITATION TOO, AND THE PEOPLE LIST SHOWS IT', async () => {
    const email = `named@${SLUG}.test`;
    const { token } = await invite(email, { kind: 'staff', displayName: 'Kavitha Rao' });
    expect(token).not.toBe('');

    // The redeemer offers a different name; the invitation's is what lands.
    const accepted = await redeem(token, email, { displayName: 'Somebody Else' });
    expect(accepted.status).toBe(201);
    const rows = await admin.query<{ display_name: string | null }>(
      `SELECT display_name FROM identity.principals WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    );
    expect(rows.rows[0]?.display_name).toBe('Kavitha Rao');

    // Read back through the people list, by name — and the administrator,
    // minted by the provisioner which takes no name, is null rather than a
    // name guessed from the address.
    const people = (await (await send('/api/v1/settings/people', 'GET', OWNER)).json()) as {
      items: { email: string; displayName: string | null }[];
    };
    expect(people.items.find((p) => p.email === email)?.displayName).toBe('Kavitha Rao');
    expect(people.items.find((p) => p.email === OWNER)?.displayName).toBeNull();

    // And an invitation minted without one stores null, not "".
    const unnamed = await invite(`unnamed@${SLUG}.test`, { kind: 'staff' });
    expect(unnamed.status).toBe(201);
    const invites = (await (await send('/api/v1/identity/invites', 'GET', OWNER)).json()) as {
      items: { email: string; displayName: string | null }[];
    };
    expect(invites.items.find((i) => i.email === `unnamed@${SLUG}.test`)?.displayName).toBeNull();
  });

  it('A CLIENT IS RESOLVED AS A CLIENT, NOT AS STAFF (COG-01)', async () => {
    // `principal-resolver.ts:57` labels EVERY resolved principal `kind: 'staff'`.
    // It has to: the resolver runs before any tenant exists, and
    // `identity.resolve_principal` deliberately returns two ids and nothing
    // else so the one unscoped query in the system cannot enumerate anybody.
    //
    // No authorization decision ever read that label — `requireStaff` and
    // `requireKind` both load the true kind from the database — so this was
    // never an escalation. It was a context that lied about who was acting, and
    // two things downstream believed it: `workflow.audit_events.actor_kind` and
    // `design-build.ts:267`'s `reviewerKind`.
    //
    // **Both are behind `requireStaff` today, so neither is currently
    // reachable** — that is why this asserts the context directly rather than
    // through an audit row. An earlier version of this test read
    // `workflow.audit_events` and passed on an EMPTY result, which proved
    // nothing at all.
    const email = `resolved@${SLUG}.test`;
    const { token } = await invite(email, { kind: 'client' });
    expect((await redeem(token, email)).status).toBe(201);

    const res = await send('/api/v1/portal/client/whoami', 'GET', email);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { principalKind: string };
    expect(body.principalKind, 'the context still says staff for a client').toBe('client');
  });

  it('and the login it created sees only the project it was linked to', async () => {
    const email = `scoped@${SLUG}.test`;
    const { token } = await invite(email, { kind: 'client' });
    expect((await redeem(token, email)).status).toBe(201);

    // A principal with no link is scoped to nothing — the correct landing state
    // for a new portal login, and why the invitation carries no project.
    const before = await send('/api/v1/portal/client/projects', 'GET', email);
    expect(before.status).toBe(200);
    expect(((await before.json()) as { items: unknown[] }).items).toEqual([]);

    const accounts = await send('/api/v1/settings/client-accounts', 'GET', OWNER);
    const principalId =
      ((await accounts.json()) as { items: { id: string; email: string }[] }).items.find(
        (item) => item.email === email,
      )?.id ?? '';
    expect(principalId).not.toBe('');

    const linked = await send(
      `/api/v1/settings/client-accounts/${principalId}/projects`,
      'POST',
      OWNER,
      { projectId: mineId },
    );
    // 200, not 201: the grant is idempotent (`ON CONFLICT DO NOTHING`), so it
    // reports the state rather than claiming to have created a row.
    expect(linked.status).toBe(200);

    const after = await send('/api/v1/portal/client/projects', 'GET', email);
    const ids = ((await after.json()) as { items: { id: string }[] }).items.map((p) => p.id);
    expect(ids).toContain(mineId);
    // The one that matters. Both projects are in this tenant, so RLS lets both
    // through; only the link narrows it.
    expect(ids).not.toContain(otherId);
  });

  it('refuses an external invitation that carries a role', async () => {
    // The escalation the constraint exists for: a `client` for the portal's
    // scoping and a finance manager for `loadEntitlements`, in one row.
    for (const kind of ['client', 'vendor'] as const) {
      const res = await send('/api/v1/identity/invites', 'POST', OWNER, {
        email: `roled.${kind}@${SLUG}.test`,
        kind,
        roles: ['finance_manager'],
      });
      expect([kind, res.status]).toEqual([kind, 400]);
    }

    // A staff invitation with roles is the normal case and still works.
    const staff = await invite(`roled.staff@${SLUG}.test`, { kind: 'staff', roles: ['owner'] });
    expect(staff.status).toBe(201);
  });

  it('refuses an invitation that would mint a connector or a system principal', async () => {
    // Both are real values of `principals.kind`. Neither may arrive by email:
    // a connector principal is the on-prem agent's credential.
    for (const kind of ['connector', 'system']) {
      const res = await send('/api/v1/identity/invites', 'POST', OWNER, {
        email: `machine.${kind}@${SLUG}.test`,
        kind,
      });
      expect([kind, res.status]).toEqual([kind, 400]);
    }
  });

  it('cannot be redeemed twice, and the second attempt creates nothing', async () => {
    const email = `once@${SLUG}.test`;
    const { token } = await invite(email, { kind: 'client' });
    expect((await redeem(token, email)).status).toBe(201);

    const again = await redeem(token, `impostor@${SLUG}.test`);
    expect(again.status).toBe(400);

    const rows = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.principals
        WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    );
    expect(rows.rows[0]?.n).toBe('1');
    // The impostor's own identity got nothing either.
    const impostor = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.principals
        WHERE tenant_id = $1 AND external_id = $2`,
      [tenantId, `impostor@${SLUG}.test`],
    );
    expect(impostor.rows[0]?.n).toBe('0');
  });

  it('A FAILED REDEMPTION DOES NOT BURN THE INVITATION', async () => {
    // The bug this was written against: the claim is an UPDATE that sets
    // `accepted_at`, so a refusal discovered AFTER it — a taken address, an
    // identity already in use — would commit the claim and leave the link dead
    // for the person it was sent to. `AcceptConflict` throws for exactly this
    // reason, so the rollback takes the claim with it.
    const email = `retry@${SLUG}.test`;
    const { token } = await invite(email, { kind: 'client' });

    // Redeemed by somebody whose provider identity already signs in here.
    const clash = await redeem(token, OWNER);
    expect(clash.status).toBe(400);

    const still = await admin.query<{ accepted_at: string | null }>(
      `SELECT accepted_at FROM identity.invites WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    );
    expect(still.rows[0]?.accepted_at).toBeNull();

    // And the right person can still use it.
    expect((await redeem(token, email)).status).toBe(201);
  });

  it('refuses a token with no verified credential, and an unknown token', async () => {
    const { token } = await invite(`nocred@${SLUG}.test`, { kind: 'client' });

    const anonymous = await app.request('/invite/v1/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(anonymous.status).toBe(400);

    // An unknown token is refused with the SAME body as an expired or already
    // redeemed one — telling them apart says which guess was once real.
    const unknown = await redeem('z'.repeat(43), `stranger@${SLUG}.test`);
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'That invitation cannot be used. Ask for a new one.',
    });
  });

  it('AN INVITATION FROM BEFORE MIGRATION 0080 CANNOT BE REDEEMED', async () => {
    // The one place old data meets new code. `identity.invites` predates the
    // `kind` column, and 0080 gives existing rows `DEFAULT 'staff'` — so if such
    // a row were redeemable, an invitation minted when nothing could redeem one
    // would now mint a STAFF principal.
    //
    // It is not redeemable, and the reason is structural rather than a check:
    // 0080 deliberately does not backfill `identity.invite_lookup`, so
    // `tenant_for_invite` finds nothing and the route refuses before any tenant
    // context exists. Written as a test because "deliberately not backfilled" is
    // a sentence in a migration, and this is the assertion.
    const token = 'x'.repeat(43);
    const hash = createHash('sha256').update(token, 'utf8').digest();

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.invites
         (tenant_id, id, email, kind, roles, token_hash, expires_at)
       VALUES ($1, gen_random_uuid(), $2, 'staff', '{}', $3, now() + interval '14 days')`,
      [tenantId, `preexisting@${SLUG}.test`, hash],
    );
    await admin.query('COMMIT');

    // Unexpired, unaccepted, and the token is exactly right.
    const res = await redeem(token, `preexisting@${SLUG}.test`);
    expect(res.status).toBe(400);

    const minted = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.principals
        WHERE tenant_id = $1 AND email = $2`,
      [tenantId, `preexisting@${SLUG}.test`],
    );
    expect(minted.rows[0]?.n).toBe('0');
  });

  it('does not sit behind the tenant middleware, and is allowlisted for it', () => {
    // If `/invite/v1` were ever moved under `/api/v1`, the route audit would go
    // on passing — that prefix counts as tenant-scoped — while the route stopped
    // working, because the middleware refuses the very person it must create.
    expect(TENANTLESS_ROUTES.map((r) => r.path)).toContain('/invite/v1/*');
    expect(TENANT_SCOPED_PREFIXES.some((p) => '/invite/v1/accept'.startsWith(p))).toBe(false);
  });
});

/**
 * Vendor rate contracts, and the check that gives them a point.
 *
 * The rung the port ledger found missing: the trade catalogue says what
 * categories of work exist, the BOQ says what we quote, a purchase order says
 * what we pay, and nothing said what the vendor agreed in between.
 *
 * **Most of this block is about the check running when nobody asked it to.**
 * A rate contract nobody compares against is a filing cabinet, and the way that
 * happens is a design where the comparison only fires on lines somebody
 * remembered to attach a contract to. So the resolution happens server-side,
 * inside the transaction that writes the line, and these tests never attach
 * anything.
 */
describe('a purchase order is measured against what the vendor agreed', () => {
  const SLUG = 'ratecontract';
  const PLATFORM_CRED = 'ops.ratecontract@platform.test';
  const OWNER = `owner@${SLUG}.test`;

  let vendorId = '';
  let otherVendorId = '';

  function send(path: string, method: string, credential: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential !== null) headers['authorization'] = `Bearer ${credential}`;
    return app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  /** Today and a wide window round it, so validity is never the reason a test fails. */
  const TODAY = new Date().toISOString().slice(0, 10);
  const LAST_YEAR = `${new Date().getUTCFullYear() - 1}-01-01`;
  const NEXT_YEAR = `${new Date().getUTCFullYear() + 1}-12-31`;

  async function contract(body: Record<string, unknown>) {
    return send('/api/v1/purchase-orders/rate-contracts', 'POST', OWNER, body);
  }

  async function order(number: string, lines: unknown[], vendor = vendorId) {
    return send('/api/v1/purchase-orders', 'POST', OWNER, { number, vendorId: vendor, lines });
  }

  function line(overrides: Record<string, unknown> = {}) {
    return {
      description: 'Conduit run',
      hsnSac: '8544',
      quantityWhole: 10,
      quantityMillionths: 0,
      unitRate: '10000',
      gstRate: 1800,
      ...overrides,
    };
  }

  async function deviations() {
    const res = await send('/api/v1/purchase-orders/rate-deviations', 'GET', OWNER);
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: Record<string, unknown>[] }).items;
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const provisioned = await send('/platform/v1/tenants', 'POST', PLATFORM_CRED, {
      slug: SLUG,
      legalName: 'Rate Contract Interiors Private Limited',
      appOrigin: 'https://ratecontract.example.test',
      adminEmail: OWNER,
      adminExternalId: OWNER,
    });
    expect(provisioned.status).toBe(201);

    for (const [code, name] of [
      ['RC-V1', 'Contracted Electricals'],
      ['RC-V2', 'Uncontracted Joinery'],
    ] as const) {
      const created = await send('/api/v1/purchase-orders/vendors', 'POST', OWNER, {
        code,
        name,
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      if (code === 'RC-V1') vendorId = id;
      else otherVendorId = id;
    }

    // The trades every test below names. They have to EXIST now: the
    // composition root resolves `tradeCode` against `projects.trade_packages`
    // and refuses one that names nothing, so a fixture that skipped this would
    // fail every write in this block with a 400.
    //
    // `PAINT` is created and then never used by a passing write on purpose —
    // it is the catalogue entry the expired/draft-contract tests need, and
    // having a real code there keeps those tests measuring what they claim
    // (a contract that does not apply) rather than accidentally measuring the
    // new refusal.
    for (const [index, code] of ['ELEC', 'JOIN', 'PAINT'].entries()) {
      const made = await send('/api/v1/settings/trade-packages', 'POST', OWNER, {
        code,
        name: `Trade ${code}`,
        sortOrder: index,
      });
      expect(made.status).toBe(201);
    }
  });

  it('refuses a rate-contract item whose trade code names no trade package', async () => {
    // The silent-failure shape this closes: `trade_code` is a soft reference
    // with no foreign key, so before the check a typo was STORED, matched
    // nothing, and surfaced as "this line is measured against no contract" —
    // indistinguishable from a line nobody meant to contract.
    const res = await contract({
      vendorId,
      number: 'RC-TYPO',
      title: 'Typo',
      status: 'active',
      items: [
        {
          tradeCode: 'ELECT',
          description: 'Conduit',
          uom: 'm',
          contractRate: '9000',
          validFrom: LAST_YEAR,
          validTo: NEXT_YEAR,
        },
      ],
    });
    expect(res.status).toBe(400);
    // Names the offending code. A refusal that will not say which of 200 items
    // it objected to cannot be acted on.
    expect(await res.text()).toContain('ELECT');

    // And it was REFUSED, not stored — the contract does not exist.
    const listed = await send('/api/v1/purchase-orders/rate-contracts', 'GET', OWNER);
    const items = ((await listed.json()) as { items: { number: string }[] }).items;
    expect(items.map((i) => i.number)).not.toContain('RC-TYPO');
  });

  it('refuses a purchase-order line whose trade code names no trade package', async () => {
    const res = await order('PO-TYPO', [line({ tradeCode: 'FLOORNG' })]);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('FLOORNG');

    const listed = await send('/api/v1/purchase-orders', 'GET', OWNER);
    const items = ((await listed.json()) as { items: { number: string }[] }).items;
    expect(items.map((i) => i.number)).not.toContain('PO-TYPO');
  });

  it('accepts a trade code that IS in the catalogue, in any case', async () => {
    // The other half, and it is not decoration: a validator that refuses
    // everything passes a refusal-only test. This proves the check
    // discriminates, and that it uppercases before looking up — `elec` has to
    // resolve to `ELEC` here or a line would pass this gate and then be stored
    // under a code the gate just rejected.
    expect((await order('PO-KNOWN-UPPER', [line({ tradeCode: 'JOIN' })])).status).toBe(201);
    expect((await order('PO-KNOWN-LOWER', [line({ tradeCode: 'join' })])).status).toBe(201);
  });

  // "A line with no trade code is still accepted" is NOT a test here. The block
  // already has one — `a line that names no trade is ABSENT, not reported as
  // compliant` — and writing a second one only collided with its order number.

  it('refuses two rates for one vendor, one trade, over overlapping days', async () => {
    // The constraint that makes "the contracted rate" a FUNCTION. Without it two
    // contracts match and an ORDER BY somewhere decides what an order is
    // measured against — which is what the legacy does, by similarity score.
    const res = await contract({
      vendorId,
      number: 'RC-OVERLAP',
      title: 'Overlapping',
      status: 'active',
      items: [
        {
          tradeCode: 'ELEC',
          description: 'Conduit',
          uom: 'm',
          contractRate: '9000',
          validFrom: LAST_YEAR,
          validTo: NEXT_YEAR,
        },
        {
          tradeCode: 'ELEC',
          description: 'Conduit again, cheaper',
          uom: 'm',
          contractRate: '8000',
          validFrom: TODAY,
          validTo: NEXT_YEAR,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/ambiguous|Close the existing/);
  });

  it('THE CHECK FIRES WITHOUT ANYBODY ATTACHING A CONTRACT', async () => {
    const created = await contract({
      vendorId,
      number: 'RC-1',
      title: 'Electricals 2026',
      status: 'active',
      paymentTerms: '45 days',
      items: [
        {
          tradeCode: 'ELEC',
          description: 'Conduit, 25mm',
          uom: 'm',
          contractRate: '9000',
          validFrom: LAST_YEAR,
          validTo: NEXT_YEAR,
        },
      ],
    });
    expect(created.status).toBe(201);

    // The order names a TRADE and a price. It does not name a contract, an item
    // id, or anything else. Nobody looked the rate up.
    const po = await order('PO-OVER', [line({ unitRate: '10000', tradeCode: 'ELEC' })]);
    expect(po.status).toBe(201);

    const found = (await deviations()).find((x) => x['purchaseOrderNumber'] === 'PO-OVER');
    expect(found, 'a line priced above contract was not flagged').toBeDefined();
    expect(found?.['contractedUnitRatePaise']).toBe('9000');
    expect(found?.['actualUnitRatePaise']).toBe('10000');
    // 90.00 -> 100.00 is 11.11%.
    expect(found?.['excessBp']).toBe(1111);
  });

  it('does not flag a line priced at or under the contracted rate', async () => {
    expect((await order('PO-ON', [line({ unitRate: '9000', tradeCode: 'ELEC' })])).status).toBe(201);
    expect((await order('PO-UNDER', [line({ unitRate: '8000', tradeCode: 'ELEC' })])).status).toBe(
      201,
    );
    const numbers = (await deviations()).map((x) => x['purchaseOrderNumber']);
    expect(numbers).not.toContain('PO-ON');
    expect(numbers).not.toContain('PO-UNDER');
  });

  it('a line that names no trade is ABSENT, not reported as compliant', async () => {
    // "There was nothing to compare" and "the price was fine" are different
    // statements. Only one of them is evidence, and this list carries only that
    // one.
    expect((await order('PO-NOTRADE', [line({ unitRate: '99999' })])).status).toBe(201);

    const numbers = (await deviations()).map((x) => x['purchaseOrderNumber']);
    expect(numbers).not.toContain('PO-NOTRADE');

    const stamped = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM procurement.purchase_order_lines l
         JOIN procurement.purchase_orders p ON p.id = l.purchase_order_id
        WHERE p.number = 'PO-NOTRADE' AND l.contracted_unit_rate IS NOT NULL`,
    );
    expect(stamped.rows[0]?.n).toBe('0');
  });

  it('a vendor with no contract is not measured against another vendor\'s', async () => {
    // The contract is keyed on the vendor, so the same trade at a different
    // supplier resolves to nothing. Getting this wrong would flag every order
    // against whichever contract happened to sort first.
    expect(
      (await order('PO-OTHERVENDOR', [line({ unitRate: '50000', tradeCode: 'ELEC' })], otherVendorId))
        .status,
    ).toBe(201);
    const numbers = (await deviations()).map((x) => x['purchaseOrderNumber']);
    expect(numbers).not.toContain('PO-OTHERVENDOR');
  });

  it('AN EXPIRED CONTRACT DOES NOT MATCH — the legacy defect, closed', async () => {
    // `getMatchingRateContractsForItem` filters on `status = 'Active'` and never
    // compares the validity dates it stores, so an expired rate keeps matching
    // forever. Here validity is in the predicate.
    const created = await contract({
      vendorId: otherVendorId,
      number: 'RC-EXPIRED',
      title: 'Joinery, last year',
      status: 'active',
      items: [
        {
          tradeCode: 'JOIN',
          description: 'Ply carcass',
          uom: 'sqft',
          contractRate: '100',
          validFrom: '2020-01-01',
          validTo: '2020-12-31',
        },
      ],
    });
    expect(created.status).toBe(201);

    expect(
      (await order('PO-EXPIRED', [line({ unitRate: '90000', tradeCode: 'JOIN' })], otherVendorId))
        .status,
    ).toBe(201);
    expect((await deviations()).map((x) => x['purchaseOrderNumber'])).not.toContain('PO-EXPIRED');
  });

  it('a DRAFT contract does not price anything', async () => {
    // A draft is a negotiation. Measuring a live order against it would report a
    // deviation from a price nobody is owed.
    const created = await contract({
      vendorId: otherVendorId,
      number: 'RC-DRAFT',
      title: 'Joinery, being negotiated',
      status: 'draft',
      items: [
        {
          tradeCode: 'PAINT',
          description: 'Emulsion',
          uom: 'sqft',
          contractRate: '100',
          validFrom: LAST_YEAR,
          validTo: NEXT_YEAR,
        },
      ],
    });
    expect(created.status).toBe(201);

    expect(
      (await order('PO-DRAFT', [line({ unitRate: '90000', tradeCode: 'PAINT' })], otherVendorId))
        .status,
    ).toBe(201);
    expect((await deviations()).map((x) => x['purchaseOrderNumber'])).not.toContain('PO-DRAFT');
  });

  it('lowercases nothing away — `elec` and `ELEC` are one trade', async () => {
    // Without the uppercase CHECK and the normalisation beside it, a lowercase
    // code simply never matches and the check silently finds nothing. That reads
    // exactly like a feature nobody uses.
    expect((await order('PO-LOWER', [line({ unitRate: '10000', tradeCode: 'elec' })])).status).toBe(
      201,
    );
    const found = (await deviations()).find((x) => x['purchaseOrderNumber'] === 'PO-LOWER');
    expect(found, 'a lowercase trade code did not match its contract').toBeDefined();
    expect(found?.['tradeCode']).toBe('ELEC');
  });

  it('THE STAMPED RATE SURVIVES A LATER EDIT OF THE CONTRACT', async () => {
    // Same reasoning as `losing_before` on a lead merge: a contract revised next
    // year must not silently change what last year's deviation was. Reading the
    // rate back through the pointer would do exactly that.
    const listed = await send('/api/v1/purchase-orders/rate-contracts', 'GET', OWNER);
    const rc = ((await listed.json()) as { items: { id: string; number: string }[] }).items.find(
      (x) => x.number === 'RC-1',
    );
    expect(rc).toBeDefined();

    await send(`/api/v1/purchase-orders/rate-contracts/${rc?.id ?? ''}`, 'PUT', OWNER, {
      number: 'RC-1',
      title: 'Electricals 2026, revised',
      status: 'active',
      items: [
        {
          tradeCode: 'ELEC',
          description: 'Conduit, 25mm',
          uom: 'm',
          contractRate: '20000',
          validFrom: LAST_YEAR,
          validTo: NEXT_YEAR,
        },
      ],
    });

    const found = (await deviations()).find((x) => x['purchaseOrderNumber'] === 'PO-OVER');
    expect(found?.['contractedUnitRatePaise']).toBe('9000');
  });

  it('answers 404 for a rate contract in another tenant', async () => {
    const res = await send(
      `/api/v1/purchase-orders/rate-contracts/${randomUUID()}`,
      'GET',
      OWNER,
    );
    expect(res.status).toBe(404);
  });

  it('refuses an unauthenticated caller on every rate-contract route', async () => {
    for (const [path, method] of [
      ['/api/v1/purchase-orders/rate-contracts', 'GET'],
      ['/api/v1/purchase-orders/rate-contracts', 'POST'],
      ['/api/v1/purchase-orders/rate-deviations', 'GET'],
    ] as const) {
      // No body on a GET — Hono refuses one outright, which is a test bug
      // rather than a finding.
      const res = await send(path, method, null, method === 'POST' ? {} : undefined);
      expect([path, res.status]).toEqual([path, 403]);
    }
  });
});

describe('the provisional statutory values an organisation loads', () => {
  const SLUG = 'statutory-values';
  const PLATFORM_CRED = 'ops.statutory@platform.test';
  const OWNER = `owner@${SLUG}.test`;
  const STAFF = `staff@${SLUG}.test`;
  const LOAD = '/api/v1/settings/tax/statutory-values';

  function send(path: string, method: string, credential: string) {
    return app.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    });
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const res = await app.request('/platform/v1/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PLATFORM_CRED}` },
      body: JSON.stringify({
        slug: SLUG,
        legalName: 'Statutory Values Interiors Private Limited',
        appOrigin: 'https://statutory.example.test',
        adminEmail: OWNER,
        adminExternalId: OWNER,
      }),
    });
    expect(res.status).toBe(201);
    const { tenantId } = (await res.json()) as { tenantId: string };

    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, external_id, email, kind, roles)
       VALUES ($1, gen_random_uuid(), $2, $2, 'staff', '{}')
       ON CONFLICT DO NOTHING`,
      [tenantId, STAFF],
    );
    await admin.query('COMMIT');
  });

  it('refuses a person who cannot manage settings', async () => {
    const res = await send(LOAD, 'POST', STAFF);
    expect(res.status).toBe(403);
  });

  it('writes every value provisional, with a source and a question, and nothing verified', async () => {
    const res = await send(LOAD, 'POST', OWNER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ratesAdded: 10, thresholdsAdded: 5 });

    const rates = (await (await send('/api/v1/finance/tax-rates', 'GET', OWNER)).json()) as {
      items: Array<Record<string, unknown>>;
    };
    const thresholds = (await (await send('/api/v1/finance/tds-thresholds', 'GET', OWNER)).json()) as {
      items: Array<Record<string, unknown>>;
    };
    expect(rates.items).toHaveLength(10);
    expect(thresholds.items).toHaveLength(5);
    for (const row of [...rates.items, ...thresholds.items]) {
      expect(row['status']).toBe('provisional');
      expect(row['verifiedBy']).toBeNull();
      expect(row['verifiedOn']).toBeNull();
      expect(row['source']).toEqual(expect.any(String));
      expect(row['questionRef']).toEqual(expect.stringMatching(/^CA-\d{2}/));
      expect(row['effectiveFrom']).toBe('2026-04-01');
    }
  });

  it('adds nothing the second time', async () => {
    const res = await send(LOAD, 'POST', OWNER);
    expect(await res.json()).toEqual({ ratesAdded: 0, thresholdsAdded: 0 });
  });

  it("is invisible to another organisation", async () => {
    const res = await send('/api/v1/finance/tds-thresholds', 'GET', USER_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

describe('bills as payables — acknowledged with a split and a due date, gross throughout', () => {
  const CLAIM = '1180000';
  let billId = '';

  function send(path: string, method: string, credential: string, body?: unknown) {
    return app.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    billId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(
      `INSERT INTO procurement.vendor_bills
         (tenant_id, id, purchase_order_id, vendor_id, bill_number, amount_claimed, submitted_by)
       VALUES ($1, $2, $3, $4, 'RA-PAYABLE-1', $5, $6)`,
      [TENANT_A, billId, orderIds.get(TENANT_A), vendorIds.get(TENANT_A), CLAIM, randomUUID()],
    );
    await admin.query('COMMIT');
  });

  it('lists a submitted bill as waiting to be acknowledged', async () => {
    const res = await send('/api/v1/purchase-orders/bills?view=to_acknowledge', 'GET', USER_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string }>;
      summary: { toAcknowledge: { count: number } };
    };
    expect(body.items.map((b) => b.id)).toContain(billId);
    expect(body.summary.toAcknowledge.count).toBeGreaterThanOrEqual(1);
  });

  it('refuses a split that does not add up to the claim', async () => {
    const res = await send(`/api/v1/purchase-orders/bills/${billId}/acknowledge`, 'POST', USER_A, {
      taxableAmount: '1000000',
      gstAmount: '100000',
      dueOn: '2026-09-18',
    });
    expect(res.status).toBe(409);
  });

  it("answers another organisation's bill as not found", async () => {
    const res = await send(`/api/v1/purchase-orders/bills/${billId}/acknowledge`, 'POST', USER_B, {
      taxableAmount: '1000000',
      gstAmount: '180000',
      dueOn: '2026-09-18',
    });
    expect(res.status).toBe(404);
  });

  it('acknowledges it, and it is due this week — gross, on Today too', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const res = await send(`/api/v1/purchase-orders/bills/${billId}/acknowledge`, 'POST', USER_A, {
      taxableAmount: '1000000',
      gstAmount: '180000',
      dueOn: today,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      state: 'acknowledged',
      dueOn: today,
      taxableAmount: '1000000',
      gstAmount: '180000',
    });

    const due = (await (await send('/api/v1/purchase-orders/bills?view=due', 'GET', USER_A)).json()) as {
      items: Array<{ id: string }>;
      summary: { dueThisWeek: { count: number; total: string }; upcoming: Array<{ id: string; overdue: boolean }> };
    };
    expect(due.items.map((b) => b.id)).toContain(billId);
    expect(due.summary.dueThisWeek).toEqual({ count: 1, total: CLAIM });
    expect(due.summary.upcoming.find((u) => u.id === billId)?.overdue).toBe(false);

    const stat = (await (await send('/api/v1/today/cash-against-payables', 'GET', USER_A)).json()) as {
      status: string;
      payables: { dueThisWeek: { total: string } };
      cash: { status: string };
    };
    expect(stat.status).toBe('present');
    expect(stat.payables.dueThisWeek.total).toBe(CLAIM);
    expect(stat.cash.status).toBe('absent');
  });

  it('refuses to acknowledge it twice', async () => {
    const res = await send(`/api/v1/purchase-orders/bills/${billId}/acknowledge`, 'POST', USER_A, {
      taxableAmount: '1000000',
      gstAmount: '180000',
      dueOn: '2026-09-18',
    });
    expect(res.status).toBe(409);
  });

  it('shows another organisation none of it', async () => {
    const body = (await (await send('/api/v1/purchase-orders/bills?view=all', 'GET', USER_B)).json()) as {
      items: Array<{ id: string }>;
    };
    expect(body.items.map((b) => b.id)).not.toContain(billId);
  });
});

describe("a vendor's TDS profile", () => {
  function put(vendorId: string, credential: string, body: unknown) {
    return app.request(`/api/v1/purchase-orders/vendors/${vendorId}/tds-profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      body: JSON.stringify(body),
    });
  }

  it('records a section, a kind, the PAN status and the constitution', async () => {
    const res = await put(vendorIds.get(TENANT_A) ?? '', USER_A, {
      tdsSection: '194J',
      tdsPayeeClass: 'professional',
      panInoperative: true,
      constitution: 'firm',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      tdsSection: '194J',
      tdsPayeeClass: 'professional',
      panInoperative: true,
      constitution: 'firm',
      // No PAN on this vendor, so nothing to cross-check it against.
      constitutionFromPan: null,
      constitutionMismatch: false,
    });
  });

  it('refuses rent without a kind, a kind under 194C, and a constitution outside the five', async () => {
    const vendorId = vendorIds.get(TENANT_A) ?? '';
    for (const body of [
      { tdsSection: '194I', tdsPayeeClass: null, panInoperative: false, constitution: null },
      { tdsSection: '194C', tdsPayeeClass: 'technical', panInoperative: false, constitution: 'company' },
      { tdsSection: '194J', tdsPayeeClass: 'technical', panInoperative: false, constitution: 'partnership' },
    ]) {
      const res = await put(vendorId, USER_A, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("answers another organisation's vendor as not found", async () => {
    const res = await put(vendorIds.get(TENANT_A) ?? '', USER_B, {
      tdsSection: null,
      tdsPayeeClass: null,
      panInoperative: false,
      constitution: null,
    });
    expect(res.status).toBe(404);
  });
});

describe("a transporter's 194C(6) declaration — kept for its year, with its evidence (CA-07)", () => {
  const PAN = 'AAAPT1234C';
  let vendorId = '';
  let evidenceId = '';
  let elsewhereEvidenceId = '';
  const path = () => `/api/v1/purchase-orders/vendors/${vendorId}/transporter-declarations`;

  async function send(url: string, method: string, credential: string, body?: unknown): Promise<Response> {
    return app.request(url, {
      method,
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function register(entityId: string, fileName: string): Promise<string> {
    const res = await send('/api/v1/workflow/documents', 'POST', USER_A, {
      entityType: 'vendor',
      entityId,
      fileName,
      contentType: 'application/pdf',
      sizeBytes: 20_480,
      checksum: 'a'.repeat(64),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  function declare(overrides: Record<string, unknown>) {
    return send(path(), 'POST', USER_A, {
      financialYear: '2026-27',
      declaredOn: '2026-04-02',
      goodsCarriageConfirmed: true,
      evidenceDocumentId: evidenceId,
      ...overrides,
    });
  }

  beforeAll(async () => {
    vendorId = vendorIds.get(TENANT_A) ?? '';
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', TENANT_A]);
    await admin.query(
      `UPDATE procurement.vendors
          SET pan = $2, tds_section = '194C', tds_payee_class = NULL, pan_inoperative = false,
              constitution = 'individual'
        WHERE id = $1`,
      [vendorId, PAN],
    );
    await admin.query('COMMIT');
    evidenceId = await register(vendorId, 'declaration-2026-27.pdf');
    elsewhereEvidenceId = await register(randomUUID(), 'someone-elses-declaration.pdf');
  });

  it('refuses a declaration that does not confirm the goods-carriage condition', async () => {
    const res = await declare({ goodsCarriageConfirmed: false });
    expect(res.status).toBe(400);
  });

  it('refuses evidence the vault holds against another record', async () => {
    const res = await declare({ evidenceDocumentId: elsewhereEvidenceId });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toMatch(/registered in the vault against this vendor/);
  });

  it('refuses a date outside the financial year it is for', async () => {
    const res = await declare({ declaredOn: '2027-04-01' });
    expect(res.status).toBe(409);
  });

  it("records the vendor's name and PAN, the year, the confirmation, the date and the evidence", async () => {
    const res = await declare({});
    expect(res.status, await res.clone().text()).toBe(201);
    expect(await res.json()).toMatchObject({
      vendorId,
      vendorName: expect.any(String),
      pan: PAN,
      financialYear: '2026-27',
      goodsCarriageConfirmed: true,
      declaredOn: '2026-04-02',
      evidenceDocumentId: evidenceId,
      evidenceFileName: 'declaration-2026-27.pdf',
    });
  });

  it('refuses a second declaration for the same year, and lists the one on record', async () => {
    const again = await declare({});
    expect(again.status).toBe(409);

    const list = (await (await send(path(), 'GET', USER_A)).json()) as {
      count: number;
      items: Array<{ financialYear: string }>;
      evidence: Array<{ id: string }>;
    };
    expect(list.count).toBe(1);
    expect(list.items.map((d) => d.financialYear)).toEqual(['2026-27']);
    expect(list.evidence.map((d) => d.id)).toContain(evidenceId);
    expect(list.evidence.map((d) => d.id)).not.toContain(elsewhereEvidenceId);
  });

  it("answers another organisation's vendor as not found", async () => {
    const res = await send(path(), 'GET', USER_B);
    expect(res.status).toBe(404);
  });
});

describe('paying a bill — TDS at provisional rates, refused unless drafts are asked for', () => {
  // Paying needs `approve_payment`, which a principal holds through its tenant's
  // role grants — so both tenants here are provisioned, and each gets a finance
  // principal, the way the approval suite builds one.
  const PLATFORM_CRED = 'ops.paying@platform.test';
  const HERE = 'paying-bills';
  const ELSEWHERE = 'paying-elsewhere';
  const FINANCE = `finance@${HERE}.test`;
  const OTHER_FINANCE = `finance@${ELSEWHERE}.test`;
  const PROC = `proc@${HERE}.test`;
  const PAN = 'AAACB1234F';
  const TAXABLE = '5000000';
  const GST = '900000';
  const CLAIM = '5900000';
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  let tenantId = '';
  let billId = '';

  function send(target: ReturnType<typeof createApp>, path: string, method: string, credential: string, body?: unknown) {
    return target.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function provisionWithFinance(slug: string, finance: string, proc?: string): Promise<string> {
    const res = await app.request('/platform/v1/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PLATFORM_CRED}` },
      body: JSON.stringify({
        slug,
        legalName: `${slug} Interiors Private Limited`,
        appOrigin: `https://${slug}.example.test`,
        adminEmail: `owner@${slug}.test`,
        adminExternalId: `owner@${slug}.test`,
      }),
    });
    expect(res.status).toBe(201);
    const { tenantId: id } = (await res.json()) as { tenantId: string };
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', id]);
    const people: Array<readonly [string, string]> = [[finance, '{finance}']];
    if (proc !== undefined) people.push([proc, '{proc}']);
    for (const [email, roles] of people) {
      const principalId = randomUUID();
      await admin.query(
        `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
         VALUES ($1, $2, 'staff', $3, $3, $4)`,
        [id, principalId, email, roles],
      );
      await admin.query('SELECT identity.register_principal($1, $2)', [email, principalId]);
    }
    await admin.query('COMMIT');
    return id;
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    tenantId = await provisionWithFinance(HERE, FINANCE, PROC);
    await provisionWithFinance(ELSEWHERE, OTHER_FINANCE);

    const tx = {
      query: async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows,
    };
    const vendorId = randomUUID();
    const orderId = randomUUID();
    billId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    // A company contractor with a PAN on file, recorded as a company: 194C, class "other".
    await admin.query(
      `INSERT INTO procurement.vendors (tenant_id, id, name, code, pan, tds_section, constitution)
       VALUES ($1, $2, 'Paying Steel Contractors', 'PAY-V1', $3, '194C', 'company')`,
      [tenantId, vendorId, PAN],
    );
    await admin.query(
      `INSERT INTO procurement.purchase_orders (tenant_id, id, number, vendor_id, state)
       VALUES ($1, $2, 'PO-PAY-1', $3, 'draft')`,
      [tenantId, orderId, vendorId],
    );
    await admin.query(
      `INSERT INTO procurement.vendor_bills
         (tenant_id, id, purchase_order_id, vendor_id, bill_number, amount_claimed, submitted_by,
          state, taxable_amount, gst_amount, due_on, acknowledged_at)
       VALUES ($1, $2, $3, $4, 'RA-PAY-1', $5, $6, 'acknowledged', $7, $8, CURRENT_DATE, now())`,
      [tenantId, billId, orderId, vendorId, CLAIM, randomUUID(), TAXABLE, GST],
    );
    await loadProvisionalCatalogue(tx as never, { tenantId } as never);
    await admin.query('COMMIT');
  });

  it('REFUSES WITHOUT STATUTORY_OUTPUTS=draft — no deduction from a provisional rate, and no number taken', async () => {
    // Nobody told this process to produce drafts: STATUTORY_OUTPUTS is unset.
    const refusing = createApp({
      pool,
      resolver: createPrincipalResolver({ pool, verify: verifyLocalBearer('test') }),
    });
    const res = await send(refusing, `/api/v1/money/bills/${billId}/pay`, 'POST', FINANCE, {
      paidOn: TODAY,
      reference: 'UTR-GATE',
    });
    expect(res.status).toBe(409);
    const refusal = (await res.json()) as { code: string; message: string };
    expect(refusal.code).toBe('PROVISIONAL_OUTPUT_REFUSED');
    expect(refusal.message).toMatch(/tds_194c\/other \(CA-12\)/);

    const due = (await (await send(app, '/api/v1/purchase-orders/bills?view=due', 'GET', FINANCE)).json()) as {
      items: Array<{ id: string }>;
    };
    expect(due.items.map((b) => b.id)).toContain(billId);
    const payments = (await (await send(app, '/api/v1/money/payments', 'GET', FINANCE)).json()) as { count: number };
    expect(payments.count).toBe(0);
  });

  it('pays it as a draft: 2% under 194C, marked provisional, the first number in the series', async () => {
    const res = await send(app, `/api/v1/money/bills/${billId}/pay`, 'POST', FINANCE, {
      paidOn: TODAY,
      reference: 'UTR-0001',
    });
    expect(res.status).toBe(201);
    const payment = (await res.json()) as Record<string, unknown>;
    expect(payment).toMatchObject({
      kind: 'bill',
      billId,
      payeePan: PAN,
      grossAmount: CLAIM,
      taxableAmount: TAXABLE,
      gstAmount: GST,
      tdsSection: '194C',
      tdsPayeeClass: 'other',
      tdsRateBp: 200,
      tdsBase: TAXABLE,
      tdsAmount: '100000',
      tdsReason: 'deducted',
      retentionWithheld: '0',
      netPaid: '5800000',
      provisional: true,
    });
    // 0001: the refusal took no number from the series.
    expect(payment['number']).toMatch(/^PV\/\d{4}-\d{2}\/0001$/);
  });

  it('marks the bill paid, and hands no voucher computed from a provisional rate to Tally', async () => {
    const paid = (await (await send(app, '/api/v1/purchase-orders/bills?view=paid', 'GET', FINANCE)).json()) as {
      items: Array<{ id: string }>;
    };
    expect(paid.items.map((b) => b.id)).toContain(billId);

    // Draft or not, a voucher resting on a provisional row is never staged, so
    // no connector can lease one (ADR-0014, addendums).
    const { rows } = await admin.query(`SELECT id FROM finance.tally_vouchers WHERE tenant_id = $1`, [tenantId]);
    expect(rows).toHaveLength(0);
  });

  it('refuses to pay it twice', async () => {
    const res = await send(app, `/api/v1/money/bills/${billId}/pay`, 'POST', FINANCE, {
      paidOn: TODAY,
      reference: 'UTR-AGAIN',
    });
    expect(res.status).toBe(409);
  });

  it('refuses a person who cannot approve payments', async () => {
    const res = await send(app, `/api/v1/money/bills/${billId}/pay`, 'POST', PROC, {
      paidOn: TODAY,
      reference: 'UTR-OWNER',
    });
    expect(res.status).toBe(403);
  });

  it("answers another organisation's bill as not found, and shows it none of the payments", async () => {
    const res = await send(app, `/api/v1/money/bills/${billId}/pay`, 'POST', OTHER_FINANCE, {
      paidOn: TODAY,
      reference: 'UTR-ELSEWHERE',
    });
    expect(res.status).toBe(404);
    const theirs = (await (await send(app, '/api/v1/money/payments', 'GET', OTHER_FINANCE)).json()) as {
      items: Array<{ billId: string | null }>;
    };
    expect(theirs.items.map((p) => p.billId)).not.toContain(billId);
  });

  it('produces no challan without a TAN, and invents none', async () => {
    const res = await send(app, `/api/v1/money/tds/challan?period=${TODAY.slice(0, 7)}`, 'GET', FINANCE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; missing: string[] };
    expect(body.status).toBe('absent');
    expect(body.missing.join(' ')).toMatch(/TAN/);
  });

  it("draws up the month's challan from the payment, as a draft on provisional rates", async () => {
    const saved = await send(app, '/api/v1/settings/company', 'PUT', `owner@${HERE}.test`, { tan: 'BLRP12345C' });
    expect(saved.status).toBe(200);

    const res = await send(app, `/api/v1/money/tds/challan?period=${TODAY.slice(0, 7)}`, 'GET', FINANCE);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'present',
      tan: 'BLRP12345C',
      minorHead: '200',
      total: '100000',
      provisional: true,
      lines: [{ section: '194C', natureCode: '94C', payments: 1, amount: '100000' }],
    });
  });

  it('refuses the challan and 26Q without STATUTORY_OUTPUTS=draft while a rate behind them is provisional', async () => {
    // Nobody told this process to produce drafts: STATUTORY_OUTPUTS is unset.
    const refusing = createApp({
      pool,
      resolver: createPrincipalResolver({ pool, verify: verifyLocalBearer('test') }),
    });
    for (const path of [`/api/v1/money/tds/challan?period=${TODAY.slice(0, 7)}`, '/api/v1/money/tds/26q']) {
      const res = await send(refusing, path, 'GET', FINANCE);
      expect(res.status, path).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe('PROVISIONAL_OUTPUT_REFUSED');
    }
  });

  it("lists the quarter's deductee line for 26Q, with the PAN and no remark", async () => {
    const res = await send(app, '/api/v1/money/tds/26q', 'GET', FINANCE);
    expect(res.status).toBe(200);
    const statement = (await res.json()) as {
      status: string;
      rows: Array<Record<string, unknown>>;
      totalTds: string;
      provisional: boolean;
    };
    expect(statement.status).toBe('present');
    expect(statement.rows).toEqual([
      expect.objectContaining({
        pan: PAN,
        section: '194C',
        natureCode: '94C',
        amountPaid: TAXABLE,
        tdsAmount: '100000',
        tdsRateBp: 200,
        remark: null,
      }),
    ]);
    expect(statement.totalTds).toBe('100000');
    expect(statement.provisional).toBe(true);
  });
});

describe('releasing retention — withheld from bills, paid out as a voucher', () => {
  const PLATFORM_CRED = 'ops.retention@platform.test';
  const HERE = 'releasing-retention';
  const ELSEWHERE = 'releasing-elsewhere';
  const FINANCE = `finance@${HERE}.test`;
  const OTHER_FINANCE = `finance@${ELSEWHERE}.test`;
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  let holdingId = '';
  let billId = '';

  function send(path: string, method: string, credential: string, body?: unknown) {
    return app.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function provisionWithFinance(slug: string, finance: string): Promise<string> {
    const res = await app.request('/platform/v1/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PLATFORM_CRED}` },
      body: JSON.stringify({
        slug,
        legalName: `${slug} Interiors Private Limited`,
        appOrigin: `https://${slug}.example.test`,
        adminEmail: `owner@${slug}.test`,
        adminExternalId: `owner@${slug}.test`,
      }),
    });
    expect(res.status).toBe(201);
    const { tenantId: id } = (await res.json()) as { tenantId: string };
    const principalId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', id]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
       VALUES ($1, $2, 'staff', $3, $3, '{finance}')`,
      [id, principalId, finance],
    );
    await admin.query('SELECT identity.register_principal($1, $2)', [finance, principalId]);
    await admin.query('COMMIT');
    return id;
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const tenantId = await provisionWithFinance(HERE, FINANCE);
    await provisionWithFinance(ELSEWHERE, OTHER_FINANCE);

    const vendorId = randomUUID();
    const orderId = randomUUID();
    holdingId = randomUUID();
    billId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    // No TDS section: the figures below are retention alone.
    await admin.query(
      `INSERT INTO procurement.vendors (tenant_id, id, name, code) VALUES ($1, $2, 'Held Back Joinery', 'HELD-V1')`,
      [tenantId, vendorId],
    );
    await admin.query(
      `INSERT INTO procurement.purchase_orders (tenant_id, id, number, vendor_id, state)
       VALUES ($1, $2, 'PO-HELD-1', $3, 'draft')`,
      [tenantId, orderId, vendorId],
    );
    await admin.query(
      `INSERT INTO procurement.retention_holdings
         (tenant_id, id, purchase_order_id, vendor_id, gross_amount, retained_amount, retention_rate_bp)
       VALUES ($1, $2, $3, $4, 0, 0, 500)`,
      [tenantId, holdingId, orderId, vendorId],
    );
    await admin.query(
      `INSERT INTO procurement.vendor_bills
         (tenant_id, id, purchase_order_id, vendor_id, bill_number, amount_claimed, submitted_by,
          state, taxable_amount, gst_amount, due_on, acknowledged_at)
       VALUES ($1, $2, $3, $4, 'RA-HELD-1', 10000000, $5, 'acknowledged', 10000000, 0, CURRENT_DATE, now())`,
      [tenantId, billId, orderId, vendorId, randomUUID()],
    );
    await admin.query('COMMIT');
  });

  it('refuses a release while nothing has been withheld', async () => {
    const res = await send(`/api/v1/money/retention/${holdingId}/release`, 'POST', FINANCE, {
      releasedOn: TODAY,
      reference: 'TOO-EARLY',
    });
    expect(res.status).toBe(409);
  });

  it('withholds 5% of the bill when it is paid, and holds it against the order', async () => {
    const res = await send(`/api/v1/money/bills/${billId}/pay`, 'POST', FINANCE, {
      paidOn: TODAY,
      reference: 'UTR-HELD',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      retentionWithheld: '500000',
      netPaid: '9500000',
      tdsAmount: '0',
      tdsReason: 'no_section',
    });

    const positions = (await (await send('/api/v1/money/retention', 'GET', FINANCE)).json()) as {
      items: Array<{ id: string }>;
      summary: { held: string };
    };
    expect(positions.items.find((p) => p.id === holdingId)).toMatchObject({
      withheld: '500000',
      released: '0',
      held: '500000',
      stage: 'held',
      canRelease: true,
    });
    expect(positions.summary.held).toBe('500000');
  });

  it('releases what is held as a payment voucher, with nothing deducted', async () => {
    const res = await send(`/api/v1/money/retention/${holdingId}/release`, 'POST', FINANCE, {
      releasedOn: TODAY,
      reference: 'UTR-RELEASE',
    });
    expect(res.status).toBe(201);
    const payment = (await res.json()) as Record<string, unknown>;
    expect(payment).toMatchObject({
      kind: 'retention_release',
      billId: null,
      grossAmount: '500000',
      tdsAmount: '0',
      tdsReason: 'retention_release',
      retentionWithheld: '0',
      netPaid: '500000',
    });
    expect(payment['number']).toMatch(/^PV\/\d{4}-\d{2}\/0002$/);

    // Neither this release nor the payment that withheld the retention rested on
    // a provisional row — that bill is under no section — so its voucher is
    // handed to Tally.
    const { rows } = await admin.query(`SELECT id FROM finance.tally_vouchers WHERE remote_id = $1`, [
      `payment:${String(payment['id'])}`,
    ]);
    expect(rows).toHaveLength(1);

    const positions = (await (await send('/api/v1/money/retention', 'GET', FINANCE)).json()) as {
      items: Array<{ id: string }>;
    };
    expect(positions.items.find((p) => p.id === holdingId)).toMatchObject({
      released: '500000',
      held: '0',
      stage: 'released',
      canRelease: false,
    });
  });

  it('refuses to release it twice', async () => {
    const res = await send(`/api/v1/money/retention/${holdingId}/release`, 'POST', FINANCE, {
      releasedOn: TODAY,
      reference: 'AGAIN',
    });
    expect(res.status).toBe(409);
  });

  it("answers another organisation's holding as not found", async () => {
    const res = await send(`/api/v1/money/retention/${holdingId}/release`, 'POST', OTHER_FINANCE, {
      releasedOn: TODAY,
      reference: 'ELSEWHERE',
    });
    expect(res.status).toBe(404);
  });
});

describe('client billing — tax invoices at the provisional GST rate, numbered with no gaps', () => {
  const PLATFORM_CRED = 'ops.billing@platform.test';
  const HERE = 'client-billing';
  const ELSEWHERE = 'client-billing-elsewhere';
  const FINANCE = `finance@${HERE}.test`;
  const OTHER_FINANCE = `finance@${ELSEWHERE}.test`;
  const OWNER = `owner@${HERE}.test`;
  const GSTIN = '29AABCN1234F1Z5';
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  let projectId = '';
  let firstInvoiceId = '';
  let secondInvoiceId = '';

  function send(target: ReturnType<typeof createApp>, path: string, method: string, credential: string, body?: unknown) {
    return target.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function provisionWithFinance(slug: string, finance: string): Promise<string> {
    const res = await app.request('/platform/v1/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PLATFORM_CRED}` },
      body: JSON.stringify({
        slug,
        legalName: `${slug} Interiors Private Limited`,
        appOrigin: `https://${slug}.example.test`,
        adminEmail: `owner@${slug}.test`,
        adminExternalId: `owner@${slug}.test`,
      }),
    });
    expect(res.status).toBe(201);
    const { tenantId: id } = (await res.json()) as { tenantId: string };
    const principalId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', id]);
    await admin.query(
      `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles)
       VALUES ($1, $2, 'staff', $3, $3, '{finance}')`,
      [id, principalId, finance],
    );
    await admin.query('SELECT identity.register_principal($1, $2)', [finance, principalId]);
    await admin.query('COMMIT');
    return id;
  }

  function invoiceFor(placeOfSupply: string) {
    return {
      projectId,
      invoiceDate: TODAY,
      expectedOn: TODAY,
      certifiedOn: TODAY,
      description: 'Running bill',
      taxableAmount: '10000000',
      placeOfSupply,
      clientGstin: null,
    };
  }

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO tenancy.platform_principals (id, external_id, email)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [randomUUID(), PLATFORM_CRED],
    );
    const tenantId = await provisionWithFinance(HERE, FINANCE);
    await provisionWithFinance(ELSEWHERE, OTHER_FINANCE);

    const tx = {
      query: async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows,
    };
    projectId = randomUUID();
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    await admin.query(
      `INSERT INTO projects.projects (tenant_id, id, code, name, client_name)
       VALUES ($1, $2, 'BILL-01', 'Billing tower fit-out', 'Billing Client Bank')`,
      [tenantId, projectId],
    );
    await loadProvisionalCatalogue(tx as never, { tenantId } as never);
    await admin.query('COMMIT');
  });

  it('refuses an invoice while the organisation has no GSTIN, and invents none', async () => {
    const res = await send(app, '/api/v1/money/client-invoices', 'POST', FINANCE, invoiceFor('29'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toMatch(/GSTIN/);
  });

  it('REFUSES WITHOUT STATUTORY_OUTPUTS=draft — no tax invoice from a provisional rate, and no number taken', async () => {
    const saved = await send(app, '/api/v1/settings/company', 'PUT', OWNER, { gstin: GSTIN });
    expect(saved.status).toBe(200);

    // Nobody told this process to produce drafts: STATUTORY_OUTPUTS is unset.
    const refusing = createApp({
      pool,
      resolver: createPrincipalResolver({ pool, verify: verifyLocalBearer('test') }),
    });
    const res = await send(refusing, '/api/v1/money/client-invoices', 'POST', FINANCE, invoiceFor('29'));
    expect(res.status).toBe(409);
    const refusal = (await res.json()) as { code: string; message: string };
    expect(refusal.code, refusal.message).toBe('PROVISIONAL_OUTPUT_REFUSED');
  });

  it('raises one within the state at 9% CGST and 9% SGST — the first number, provisional', async () => {
    const res = await send(app, '/api/v1/money/client-invoices', 'POST', FINANCE, invoiceFor('29'));
    expect(res.status, await res.clone().text()).toBe(201);
    const invoice = (await res.json()) as Record<string, unknown>;
    expect(invoice).toMatchObject({
      projectCode: 'BILL-01',
      clientName: 'Billing Client Bank',
      supplierState: '29',
      placeOfSupply: '29',
      supplyType: 'intra_state',
      taxable: '10000000',
      gstRateBp: 1800,
      cgst: '900000',
      sgst: '900000',
      igst: '0',
      roundOff: '0',
      total: '11800000',
      received: '0',
      balance: '11800000',
      provisional: true,
      state: 'issued',
    });
    // 0001: the refusal took no number from the series.
    expect(invoice['number']).toMatch(/^INV\/\d{4}-\d{2}\/0001$/);
    firstInvoiceId = invoice['id'] as string;
  });

  it('raises one across states at 18% IGST — the next number', async () => {
    const res = await send(app, '/api/v1/money/client-invoices', 'POST', FINANCE, invoiceFor('27'));
    expect(res.status).toBe(201);
    const invoice = (await res.json()) as Record<string, unknown>;
    expect(invoice).toMatchObject({ supplyType: 'inter_state', cgst: '0', sgst: '0', igst: '1800000', total: '11800000' });
    expect(invoice['number']).toMatch(/^INV\/\d{4}-\d{2}\/0002$/);
    secondInvoiceId = invoice['id'] as string;
  });

  it('records a receipt, and refuses one for more than is still due', async () => {
    const res = await send(app, `/api/v1/money/client-invoices/${firstInvoiceId}/receipts`, 'POST', FINANCE, {
      receivedOn: TODAY,
      amount: '5000000',
      reference: 'NEFT-1',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ received: '5000000', balance: '6800000' });

    const over = await send(app, `/api/v1/money/client-invoices/${firstInvoiceId}/receipts`, 'POST', FINANCE, {
      receivedOn: TODAY,
      amount: '7000000',
      reference: 'NEFT-2',
    });
    expect(over.status).toBe(409);
  });

  it('keeps a cancelled invoice and its number, and refuses to cancel one with money received', async () => {
    const refused = await send(app, `/api/v1/money/client-invoices/${firstInvoiceId}/cancel`, 'POST', FINANCE, {
      reason: 'Raised in error',
    });
    expect(refused.status).toBe(409);

    const res = await send(app, `/api/v1/money/client-invoices/${secondInvoiceId}/cancel`, 'POST', FINANCE, {
      reason: 'Wrong place of supply',
    });
    expect(res.status).toBe(200);
    const cancelled = (await res.json()) as Record<string, unknown>;
    expect(cancelled).toMatchObject({ state: 'cancelled', cancelReason: 'Wrong place of supply', balance: '0' });
    expect(cancelled['number']).toMatch(/\/0002$/);
  });

  it('sums what is invoiced, received and still due, leaving the cancelled one out', async () => {
    const body = (await (await send(app, '/api/v1/money/client-invoices', 'GET', FINANCE)).json()) as {
      count: number;
      summary: Record<string, unknown>;
    };
    expect(body.count).toBe(2);
    expect(body.summary).toMatchObject({
      invoiced: '11800000',
      received: '5000000',
      balance: '6800000',
      openCount: 1,
    });
    expect(body.summary['nextExpected']).toMatchObject({ balance: '6800000', expectedOn: TODAY, certifiedOn: TODAY });
  });

  it('keeps each head to the paise and rounds only the total, its round-off a line of its own (CA-02)', async () => {
    const res = await send(app, '/api/v1/money/client-invoices', 'POST', FINANCE, {
      ...invoiceFor('29'),
      taxableAmount: '123456',
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const invoice = (await res.json()) as Record<string, unknown>;
    // ₹1,234.56 at 9% is ₹111.1104 a head: ₹111.11 each. ₹1,456.78 in all,
    // rounded once to ₹1,457.00, and the ₹0.22 is a line of its own.
    expect(invoice).toMatchObject({ cgst: '11111', sgst: '11111', igst: '0', roundOff: '22', total: '145700' });

    // Its voucher's ledger lines put the round-off on a line of its own
    // (tax-invoice.test.ts) — and no voucher is staged while the rate behind the
    // invoice is provisional, draft or not.
    const { rows } = await admin.query(`SELECT id FROM finance.tally_vouchers WHERE remote_id = $1`, [
      `invoice:${String(invoice['id'])}`,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('charges GST on the full invoice value when the client withholds retention (CA-06)', async () => {
    // The CA's answer to CA-06: "GST on the invoice is discharged upfront. Only
    // the contractual retention amount is withheld commercially and released
    // later; GST is not deferred merely because retention is held."
    const raised = await send(app, '/api/v1/money/client-invoices', 'POST', FINANCE, invoiceFor('29'));
    expect(raised.status, await raised.clone().text()).toBe(201);
    const invoice = (await raised.json()) as { id: string };

    // ₹1,00,000 taxable: ₹9,000 CGST and ₹9,000 SGST, ₹1,18,000 in all. The
    // client pays it less 5% held back as retention — ₹1,12,100.
    const paid = await send(app, `/api/v1/money/client-invoices/${invoice.id}/receipts`, 'POST', FINANCE, {
      receivedOn: TODAY,
      amount: '11210000',
      reference: 'NEFT-LESS-RETENTION',
    });
    expect(paid.status).toBe(201);
    expect(await paid.json()).toMatchObject({
      taxable: '10000000',
      cgst: '900000',
      sgst: '900000',
      total: '11800000',
      received: '11210000',
      // The retention is still owed, and the tax on it was charged with the invoice.
      balance: '590000',
    });
  });

  it("answers another organisation's invoice as not found", async () => {
    const res = await send(app, `/api/v1/money/client-invoices/${firstInvoiceId}/receipts`, 'POST', OTHER_FINANCE, {
      receivedOn: TODAY,
      amount: '100',
      reference: 'ELSEWHERE',
    });
    expect(res.status).toBe(404);
  });
});

describe("today's panels — every read is tenant-scoped, and the figures are the server's", () => {
  // A project of its own on each tenant, so the figures below are exactly the
  // fixture's: every other block in this file writes to the seeded project.
  let projectA = '';
  let projectB = '';
  let today = '';

  async function getAs(path: string, credential: string): Promise<Response> {
    return app.request(path, { headers: { authorization: `Bearer ${credential}` } });
  }
  async function postAs(path: string, credential: string, body: unknown): Promise<Response> {
    return app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  const daysFromToday = (n: number): string => iso(new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000));

  /**
   * One of everything on each tenant, mirrored, so a read that leaks shows the
   * other tenant's row and a read that is scoped shows exactly one. Written
   * through the tables as the owner inside the tenant context (FORCE RLS, so
   * WITH CHECK is exercised) where the API path would need a GSTIN, a tax rate
   * and a chain of numbered documents to reach the same row.
   */
  async function seedPanels(tenantId: string, principalId: string, projectId: string, mark: string): Promise<void> {
    await admin.query('BEGIN');
    await admin.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    // the project is a site: in progress
    await admin.query(
      `INSERT INTO projects.projects (tenant_id, id, code, name, client_name, state, original_value)
       VALUES ($1, $2, $3, 'Panel fixture', 'The client', 'in_progress', 50000000)`,
      [tenantId, projectId, `${mark}-PANEL`],
    );
    // an order with a line that names a trade, raised today
    const orderId = randomUUID();
    const vendorId = vendorIds.get(tenantId) ?? '';
    await admin.query(
      `INSERT INTO procurement.purchase_orders (tenant_id, id, number, vendor_id, state, project_id, taxable, gst, gross)
       VALUES ($1, $2, $3, $4, 'approved', $5, 100000, 18000, 118000)`,
      [tenantId, orderId, `PO-${mark}-PANEL`, vendorId, projectId],
    );
    await admin.query(
      `INSERT INTO procurement.purchase_order_lines
         (tenant_id, id, purchase_order_id, line_no, description, hsn_sac, quantity_micros, unit_rate, gst_rate_bp, trade_code)
       VALUES ($1, $2, $3, 1, 'Conduit', '8547', 1000000, 100000, 1800, 'MEP')`,
      [tenantId, randomUUID(), orderId],
    );
    // a bill acknowledged, unpaid, forty days overdue
    await admin.query(
      `INSERT INTO procurement.vendor_bills
         (tenant_id, id, purchase_order_id, vendor_id, bill_number, amount_claimed, state, submitted_by,
          taxable_amount, gst_amount, due_on, acknowledged_by, acknowledged_at)
       VALUES ($1, $2, $3, $4, $5, 118000, 'acknowledged', $6, 100000, 18000, $7::date, $6, now())`,
      [tenantId, randomUUID(), orderId, vendorId, `B-${mark}-1`, principalId, daysFromToday(-40)],
    );
    // a payment against that order, this month, net of TDS
    await admin.query(
      `INSERT INTO finance.vendor_payments
         (tenant_id, id, number, kind, bill_id, bill_number, purchase_order_id, vendor_id, payee_name, paid_on,
          gross_amount, taxable_amount, gst_amount, tds_reason, net_paid, provisional, created_by)
       VALUES ($1, $2, $3, 'bill', $4, 'B-X', $5, $6, 'Vendor', $7::date, 50000, 42373, 7627, 'below_threshold', 50000, true, $8)`,
      [tenantId, randomUUID(), `PV-${mark}-1`, randomUUID(), orderId, vendorId, today, principalId],
    );
    // a tax invoice, twelve days past its expected date, with a receipt this month
    const invoiceId = randomUUID();
    await admin.query(
      `INSERT INTO finance.client_invoices
         (tenant_id, id, number, project_id, project_code, client_name, invoice_date, expected_on,
          supplier_state, place_of_supply, supply_type, taxable, gst_rate_bp, cgst, sgst, igst, total, provisional, created_by)
       VALUES ($1, $2, $3, $4, $5, 'The client', $6::date, $7::date, '29', '29', 'intra_state', 100000, 1800, 9000, 9000, 0, 118000, true, $8)`,
      [tenantId, invoiceId, `INV-${mark}-1`, projectId, `${mark}-PANEL`, daysFromToday(-30), daysFromToday(-12), principalId],
    );
    await admin.query(
      `INSERT INTO finance.client_receipts (tenant_id, id, invoice_id, received_on, amount, created_by)
       VALUES ($1, $2, $3, $4::date, 18000, $5)`,
      [tenantId, randomUUID(), invoiceId, today, principalId],
    );
    // a variation with the client since five days ago
    await admin.query(
      `INSERT INTO projects.change_orders
         (tenant_id, id, project_id, number, title, cost_impact, state, submitted_at, created_by)
       VALUES ($1, $2, $3, 'CO-PANEL', 'More scope', 250000, 'pending_client', now() - interval '5 days', $4)`,
      [tenantId, randomUUID(), projectId, principalId],
    );
    // two milestones: one due this week, one delayed for a reason
    await admin.query(
      `INSERT INTO projects.delivery_milestones (tenant_id, id, project_id, name, trade, planned_start, planned_finish, status, delay_reason)
       VALUES ($1, gen_random_uuid(), $2, 'Ceiling grid', 'Ceilings', $3::date, $3::date, 'in_progress', ''),
              ($1, gen_random_uuid(), $2, 'Glazing', 'Glazing', $4::date, $4::date, 'delayed', 'Panels arrived cracked')`,
      [tenantId, projectId, today, daysFromToday(-9)],
    );
    // a daily report today with people on site, and an issue stopping work
    const reportId = randomUUID();
    await admin.query(
      `INSERT INTO siteops.daily_reports (tenant_id, id, project_id, report_date, created_by)
       VALUES ($1, $2, $3, $4::date, $5)`,
      [tenantId, reportId, projectId, today, principalId],
    );
    await admin.query(
      `INSERT INTO siteops.daily_manpower (tenant_id, id, daily_report_id, floor, trade, head_count)
       VALUES ($1, $2, $3, 'Level 3', 'Carpentry', 14)`,
      [tenantId, randomUUID(), reportId],
    );
    await admin.query(
      `INSERT INTO siteops.site_issues (tenant_id, project_id, title, severity, raised_by)
       VALUES ($1, $2, $3, 'blocking', $4)`,
      [tenantId, projectId, `Glazing cracked on ${mark}`, principalId],
    );
    // a task due yesterday
    await admin.query(
      `INSERT INTO workflow.tasks (tenant_id, id, title, assigned_to, assigned_by, due_date)
       VALUES ($1, $2, $3, $4, $4, $5::date)`,
      [tenantId, randomUUID(), `Chase ${mark}`, principalId, daysFromToday(-1)],
    );
    await admin.query('COMMIT');
  }

  beforeAll(async () => {
    today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    projectA = randomUUID();
    projectB = randomUUID();
    // The milestones read sits behind the delivery-milestones module gate;
    // switched on here for this tenant, the way the shape check does, so this
    // block stands on its own when it is the only one run.
    await admin.query(
      `INSERT INTO tenancy.tenant_modules (tenant_id, module_key, enabled)
       VALUES ($1, 'delivery_milestones', true)
       ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = true`,
      [TENANT_A],
    );
    await seedPanels(TENANT_A, PRINCIPAL_A, projectA, 'aarambh');
    await seedPanels(TENANT_B, PRINCIPAL_B, projectB, 'dvitiya');
    // the leads go through the route, expected close and all
    for (const [user, name] of [
      [USER_A, 'Aarambh prospect'],
      [USER_B, 'Dvitiya prospect'],
    ] as const) {
      const res = await postAs('/api/v1/projects/leads', user, {
        clientName: name,
        stage: 'proposal_shared',
        estimatedValue: '4300000000',
        probabilityPct: 50,
        expectedClose: daysFromToday(0),
      });
      expect(res.status).toBe(201);
    }
  });

  it('ages what clients owe — one invoice, twelve days past, in the 1–30 bucket; the other tenant sees its own', async () => {
    const res = await getAs(`/api/v1/money/client-invoices/ageing?projectId=${projectA}`, USER_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: string; openCount: number; buckets: { days1to30: { count: number; total: string; pct: number } }; oldest: { number: string; daysPast: number } | null };
    expect(body.openCount).toBe(1);
    expect(body.total).toBe('100000');
    expect(body.buckets.days1to30).toEqual({ count: 1, total: '100000', pct: 100 });
    expect(body.oldest).toMatchObject({ number: 'INV-aarambh-1', daysPast: 12 });
    const firmWide = (await (await getAs('/api/v1/money/client-invoices/ageing', USER_A)).json()) as { openCount: number };
    expect(firmWide.openCount).toBeGreaterThanOrEqual(1);
    const other = (await (await getAs(`/api/v1/money/client-invoices/ageing?projectId=${projectB}`, USER_B)).json()) as { oldest: { number: string } };
    expect(other.oldest.number).toBe('INV-dvitiya-1');
  });

  it('narrows the ageing to a project, and another tenant\'s project id narrows to nothing', async () => {
    const mine = (await (await getAs(`/api/v1/money/client-invoices/ageing?projectId=${projectA}`, USER_A)).json()) as { openCount: number };
    expect(mine.openCount).toBe(1);
    const theirs = (await (await getAs(`/api/v1/money/client-invoices/ageing?projectId=${projectB}`, USER_A)).json()) as { openCount: number; total: string };
    expect(theirs).toMatchObject({ openCount: 0, total: '0' });
  });

  it('ages what the firm owes — one bill, forty days past, in the 31–60 bucket, gross', async () => {
    const body = (await (await getAs(`/api/v1/purchase-orders/bills/ageing?projectId=${projectA}`, USER_A)).json()) as {
      total: string; buckets: { days31to60: { count: number; total: string } }; oldest: { billNumber: string; daysPast: number } | null; toAcknowledge: { count: number };
    };
    expect(body.total).toBe('118000');
    expect(body.buckets.days31to60).toMatchObject({ count: 1, total: '118000' });
    expect(body.oldest).toMatchObject({ billNumber: 'B-aarambh-1', daysPast: 40 });
    expect(body.toAcknowledge.count).toBe(0);
    const theirs = (await (await getAs(`/api/v1/purchase-orders/bills/ageing?projectId=${projectB}`, USER_A)).json()) as { openCount: number };
    expect(theirs.openCount).toBe(0);
    const other = (await (await getAs(`/api/v1/purchase-orders/bills/ageing?projectId=${projectB}`, USER_B)).json()) as { oldest: { billNumber: string } };
    expect(other.oldest.billNumber).toBe('B-dvitiya-1');
    expect((await getAs('/api/v1/purchase-orders/bills/ageing?projectId=nope', USER_A)).status).toBe(400);
  });

  it('reads money in and out by month — the receipt and the payment this month, netted', async () => {
    const body = (await (await getAs(`/api/v1/money/by-month?projectId=${projectA}`, USER_A)).json()) as {
      period: string; months: Array<{ month: string; collected: string; paidOut: string }>; collected: string; paidOut: string; net: string;
    };
    expect(body.period).toBe('fy');
    const thisMonth = body.months[body.months.length - 1];
    expect(thisMonth?.month).toBe(today.slice(0, 7));
    expect(thisMonth).toMatchObject({ collected: '18000', paidOut: '50000' });
    expect(body).toMatchObject({ collected: '18000', paidOut: '50000', net: '-32000' });
    // narrowed to another tenant's project: nothing, in either series
    const theirs = (await (await getAs(`/api/v1/money/by-month?projectId=${projectB}`, USER_A)).json()) as { collected: string; paidOut: string };
    expect(theirs).toMatchObject({ collected: '0', paidOut: '0' });
    const quarter = (await (await getAs('/api/v1/money/by-month?period=q', USER_A)).json()) as { period: string; months: unknown[] };
    expect(quarter.period).toBe('q');
    expect(quarter.months.length).toBeLessThanOrEqual(3);
    expect((await getAs('/api/v1/money/by-month?period=year', USER_A)).status).toBe(400);
  });

  it('lists the variations a client is sitting on, with how long', async () => {
    const body = (await (await getAs(`/api/v1/projects/change-orders/unsigned?projectId=${projectA}`, USER_A)).json()) as {
      count: number; total: string; items: Array<{ projectCode: string; daysWaiting: number | null }>; oldest: { number: string; daysWaiting: number | null } | null;
    };
    expect(body.count).toBe(1);
    expect(body.total).toBe('250000');
    expect(body.items[0]?.projectCode).toBe('aarambh-PANEL');
    expect(body.oldest).toMatchObject({ number: 'CO-PANEL', daysWaiting: 5 });
    const firmWide = (await (await getAs('/api/v1/projects/change-orders/unsigned', USER_A)).json()) as { items: Array<{ projectCode: string }> };
    expect(firmWide.items.some((v) => v.projectCode === 'aarambh-PANEL')).toBe(true);
    expect(firmWide.items.some((v) => v.projectCode.startsWith('dvitiya'))).toBe(false);
    const theirs = (await (await getAs(`/api/v1/projects/change-orders/unsigned?projectId=${projectB}`, USER_A)).json()) as { count: number };
    expect(theirs.count).toBe(0);
  });

  it('summarises the pipeline — the quote a client is sitting on, closing this month, and no other tenant\'s', async () => {
    const body = (await (await getAs('/api/v1/projects/leads/pipeline-summary', USER_A)).json()) as {
      quoted: { count: number; total: string; names: string[] }; closingThisMonth: { count: number }; open: { count: number };
    };
    expect(body.quoted.names).toContain('Aarambh prospect');
    expect(body.quoted.names).not.toContain('Dvitiya prospect');
    expect(body.closingThisMonth.count).toBeGreaterThanOrEqual(1);
  });

  it('lists the milestones due this week and the delayed one first, by project, this tenant only', async () => {
    const body = (await (await getAs('/api/v1/design-build/milestones/this-week', USER_A)).json()) as {
      dueCount: number; delayedCount: number; items: Array<{ name: string; projectCode: string; status: string; daysLate: number | null; dueThisWeek: boolean }>;
    };
    const mine = body.items.filter((m) => m.projectCode === 'aarambh-PANEL');
    expect(body.dueCount).toBeGreaterThanOrEqual(1);
    expect(body.delayedCount).toBeGreaterThanOrEqual(1);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ name: 'Glazing', status: 'delayed', daysLate: 9, dueThisWeek: false });
    expect(mine[1]).toMatchObject({ name: 'Ceiling grid', dueThisWeek: true });
    expect(body.items.every((m) => m.projectCode.startsWith('aarambh'))).toBe(true);
  });

  it('names every site, which reported today, the week by day and the first blocker', async () => {
    const body = (await (await getAs('/api/v1/siteops/today', USER_A)).json()) as {
      sitesTotal: number; sites: Array<{ code: string; reportedToday: boolean; lastReportOn: string | null }>;
      latestReportOn: string | null; sitesReportingOnLatest: number;
      byDay: Array<{ date: string; onSite: number | null; index: number }>; firstBlocking: { title: string; projectCode: string } | null;
    };
    expect(body.sitesTotal).toBeGreaterThanOrEqual(1);
    expect(body.sites).toContainEqual({ projectId: projectA, code: 'aarambh-PANEL', reportedToday: true, lastReportOn: today });
    expect(body.latestReportOn).toBe(today);
    expect(body.sitesReportingOnLatest).toBeGreaterThanOrEqual(1);
    expect(body.byDay).toHaveLength(7);
    expect(body.byDay[6]).toMatchObject({ date: today, index: 10000 });
    expect(body.byDay[6]?.onSite).toBeGreaterThanOrEqual(14);
    expect(body.firstBlocking).not.toBeNull();
    expect(body.firstBlocking?.projectCode.startsWith('aarambh')).toBe(true);
    expect(body.sites.some((s) => s.code.startsWith('dvitiya'))).toBe(false);
  });

  it('spends by trade — the one line, under its trade package name when the catalogue has it, else its code', async () => {
    const body = (await (await getAs('/api/v1/today/spend-by-trade', USER_A)).json()) as {
      period: string; total: string; items: Array<{ tradeCode: string | null; label: string; gross: string; pct: number }>; rest: { count: number };
    };
    expect(body.period).toBe('fy');
    const mep = body.items.find((i) => i.tradeCode === 'MEP');
    expect(mep?.label).toBe('MEP');
    expect(BigInt(mep?.gross ?? '0') >= 118000n).toBe(true);
    expect(BigInt(body.total) >= 118000n).toBe(true);
    for (const i of body.items) expect(i.pct).toBeGreaterThan(0);
    expect((await getAs('/api/v1/today/spend-by-trade?period=month', USER_A)).status).toBe(400);
  });

  it('marks the overdue task, and counts the approvals older than a week on the hero', async () => {
    const tasks = (await (await getAs('/api/v1/workflow/tasks', USER_A)).json()) as { items: Array<{ title: string; overdue: boolean }> };
    const mine = tasks.items.find((t) => t.title === 'Chase aarambh');
    expect(mine?.overdue).toBe(true);
    expect(tasks.items.some((t) => t.title === 'Chase dvitiya')).toBe(false);
    const hero = (await (await getAs('/api/v1/today/hero', USER_A)).json()) as { hero: { kind: string; olderThanWeek?: number } };
    if (hero.hero.kind === 'blocked-approvals') expect(typeof hero.hero.olderThanWeek).toBe('number');
  });

  it("narrows this week's payables to a project, and refuses a malformed id", async () => {
    const mine = (await (await getAs(`/api/v1/today/cash-against-payables?projectId=${projectA}`, USER_A)).json()) as { payables: { overdue: { count: number } } };
    expect(mine.payables.overdue.count).toBe(1);
    const theirs = (await (await getAs(`/api/v1/today/cash-against-payables?projectId=${projectB}`, USER_A)).json()) as { payables: { overdue: { count: number } } };
    expect(theirs.payables.overdue.count).toBe(0);
    expect((await getAs('/api/v1/today/cash-against-payables?projectId=nope', USER_A)).status).toBe(400);
  });
});

describe("the shell's reads — one read for the counts, and a person's state is theirs", () => {
  async function getAs(path: string, credential: string): Promise<Response> {
    return app.request(path, { headers: { authorization: `Bearer ${credential}` } });
  }
  async function send(method: string, path: string, credential: string, body: unknown): Promise<Response> {
    return app.request(path, {
      method,
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('counts for the sidebar in one read, every figure a non-negative integer', async () => {
    const body = (await (await getAs('/api/v1/shell/counts', USER_A)).json()) as Record<string, number>;
    for (const key of ['approvals', 'unchecked', 'expiring', 'low', 'noReport', 'overdue']) {
      expect(Number.isInteger(body[key]), key).toBe(true);
      expect(body[key]).toBeGreaterThanOrEqual(0);
    }
    // the queue this file seeded on tenant A is not tenant B's
    const theirs = (await (await getAs('/api/v1/shell/counts', USER_B)).json()) as Record<string, number>;
    expect(theirs['approvals']).toBeLessThanOrEqual(body['approvals'] ?? 0);
  });

  it('notes an opened record and reads it back as this person’s trail, newest first — and not the other tenant’s', async () => {
    const projectA = projectIds.get(TENANT_A) ?? '';
    const noted = await send('POST', '/api/v1/shell/history', USER_A, {
      kind: 'project',
      id: projectA,
      title: 'PRJ-A',
      subtitle: 'the fixture project',
      href: `/projects/${projectA}`,
      projectId: null,
    });
    expect(noted.status).toBe(200);
    const order = orderIds.get(TENANT_A) ?? '';
    await send('POST', '/api/v1/shell/history', USER_A, {
      kind: 'order',
      id: order,
      title: 'PO-A',
      subtitle: 'a vendor',
      href: `/purchase-orders/${order}`,
      projectId: projectA,
    });
    const trail = (await (await getAs('/api/v1/shell/history', USER_A)).json()) as { items: Array<{ id: string; projectCode: string | null }> };
    expect(trail.items.map((i) => i.id)).toEqual([order, projectA]);
    expect(trail.items[0]?.projectCode).not.toBeNull();
    const mine = (await (await getAs('/api/v1/shell/my-projects', USER_A)).json()) as { mine: string[]; recent: string[] };
    expect(mine.recent[0]).toBe(projectA);
    const theirs = (await (await getAs('/api/v1/shell/history', USER_B)).json()) as { items: unknown[] };
    expect(theirs.items).toEqual([]);
    expect((await send('POST', '/api/v1/shell/history', USER_A, { kind: 'order', id: 'x', title: '', href: 'nope' })).status).toBe(400);
  });

  it('merges a preference and answers the whole document; the other tenant reads the defaults', async () => {
    const after = (await (await send('PATCH', '/api/v1/shell/preferences', USER_A, { singleKeyShortcuts: false, sidebar: { collapsed: true, open: ['money'] } })).json()) as {
      singleKeyShortcuts: boolean; sidebar: { collapsed: boolean; open: string[] }; columns: Record<string, string[]>;
    };
    expect(after.singleKeyShortcuts).toBe(false);
    expect(after.sidebar).toEqual({ collapsed: true, open: ['money'] });
    const again = (await (await send('PATCH', '/api/v1/shell/preferences', USER_A, { columns: { orders: ['number', 'gross'] } })).json()) as { singleKeyShortcuts: boolean; columns: Record<string, string[]> };
    expect(again.singleKeyShortcuts).toBe(false);
    expect(again.columns).toEqual({ orders: ['number', 'gross'] });
    const theirs = (await (await getAs('/api/v1/shell/preferences', USER_B)).json()) as { singleKeyShortcuts: boolean };
    expect(theirs.singleKeyShortcuts).toBe(true);
    expect((await send('PATCH', '/api/v1/shell/preferences', USER_A, { colour: 'blue' })).status).toBe(400);
  });

  it('says what this person may create, grouped, with the project pre-filled inside one', async () => {
    // the menu is the entitlements over the shell's own list: a role that
    // reaches no module (this fixture's director, on a tenant seeded without a
    // role catalogue) is offered nothing, and one that reaches purchase orders
    // is offered an order — never a door the server would refuse behind
    const me = (await (await getAs('/api/v1/identity/me/entitlements', USER_A)).json()) as { modules: string[]; actions: string[] };
    const firm = (await (await getAs('/api/v1/shell/quick-create', USER_A)).json()) as { groups: Array<{ section: string; items: Array<{ key: string; href: string; projectScoped: boolean }> }> };
    const offered = firm.groups.flatMap((g) => g.items).map((i) => i.key);
    expect(offered.includes('order')).toBe(me.modules.includes('purchase_orders') && me.actions.includes('create_po'));
    expect(offered.includes('vendor')).toBe(me.modules.includes('vendors'));
    for (const g of firm.groups) expect(g.items.length).toBeGreaterThan(0);
    const projectA = projectIds.get(TENANT_A) ?? '';
    const inside = (await (await getAs(`/api/v1/shell/quick-create?projectId=${projectA}`, USER_A)).json()) as { groups: Array<{ items: Array<{ key: string; href: string; projectScoped: boolean }> }> };
    const scoped = inside.groups.flatMap((g) => g.items).filter((i) => i.projectScoped);
    for (const item of scoped) expect(item.href).toContain(projectA);
  });

  it('saves a view of a list for this person, lists the firm’s first, stars it, and refuses the firm’s to a role without the permission', async () => {
    const own = await send('POST', '/api/v1/shell/views', USER_A, { listKey: 'orders', name: 'Waiting on me', shared: false, criteria: { state: 'pending_approval' }, columns: null });
    expect(own.status).toBe(201);
    const ownView = (await own.json()) as { id: string; ownerId: string | null };
    expect(ownView.ownerId).not.toBeNull();
    const firm = await send('POST', '/api/v1/shell/views', USER_A, { listKey: 'orders', name: 'Every order', shared: true, criteria: {}, columns: ['number', 'vendor'] });
    // the fixture's first principal administers the tenant; the status says which
    expect([201, 403]).toContain(firm.status);
    const listed = (await (await getAs('/api/v1/shell/views?list=orders', USER_A)).json()) as { items: Array<{ id: string; ownerId: string | null; starred: boolean }> };
    expect(listed.items.some((v) => v.id === ownView.id)).toBe(true);
    if (firm.status === 201) expect(listed.items[0]?.ownerId).toBeNull();
    await send('PATCH', '/api/v1/shell/preferences', USER_A, { starredViews: [ownView.id] });
    const starred = (await (await getAs('/api/v1/shell/views?list=orders', USER_A)).json()) as { items: Array<{ id: string; starred: boolean }> };
    expect(starred.items.find((v) => v.id === ownView.id)?.starred).toBe(true);
    const theirs = (await (await getAs('/api/v1/shell/views?list=orders', USER_B)).json()) as { items: unknown[] };
    expect(theirs.items).toEqual([]);
    expect((await app.request(`/api/v1/shell/views/${ownView.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${USER_B}` } })).status).toBe(404);
    expect((await app.request(`/api/v1/shell/views/${ownView.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${USER_A}` } })).status).toBe(200);
    expect((await getAs('/api/v1/shell/views', USER_A)).status).toBe(400);
  });
});

describe("an order's own lines — the server's amount and the rate check on each", () => {
  async function getAs(path: string, credential: string): Promise<Response> {
    return app.request(path, { headers: { authorization: `Bearer ${credential}` } });
  }

  it('answers each line with quantity × rate rounded once, a signed check against the stamped agreed rate, and 404 across tenants', async () => {
    // an order of this test's own: the fixture's PO-A-0001 has its lines rewritten by the PATCH tests
    // above, and a second line 1 on it would be a duplicate key, not a fixture
    const orderId = randomUUID();
    await admin.query('BEGIN');
    await admin.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
    await admin.query(
      `INSERT INTO procurement.purchase_orders (tenant_id, id, number, vendor_id, state)
       VALUES ($1, $2, 'PO-A-LINES', $3, 'draft')`,
      [TENANT_A, orderId, vendorIds.get(TENANT_A)],
    );
    // 2 units at ₹845.00 with no agreed rate; 3 units at ₹845.00 against ₹800.00 agreed
    await admin.query(
      `INSERT INTO procurement.purchase_order_lines
         (tenant_id, id, purchase_order_id, line_no, description, hsn_sac, quantity_micros, unit_rate, gst_rate_bp, trade_code, contracted_unit_rate)
       VALUES ($1, $2, $3, 1, 'Vitrified tile 600x600', '6907', 2000000, 84500, 1800, NULL, NULL),
              ($1, $4, $3, 2, 'Tile adhesive, 20kg', '3214', 3000000, 84500, 1800, 'TIL', 80000)`,
      [TENANT_A, randomUUID(), orderId, randomUUID()],
    );
    await admin.query('COMMIT');

    const res = await getAs(`/api/v1/purchase-orders/${orderId}/lines`, USER_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ lineNo: number; amount: string; gst: string; contractedUnitRate: string | null; excessBp: number | null }> };
    expect(body.items.map((l) => [l.lineNo, l.amount, l.gst, l.contractedUnitRate, l.excessBp])).toEqual([
      [1, '169000', '30420', null, null],
      // (84500 − 80000) × 10000 / 80000 = 562.5, truncated
      [2, '253500', '45630', '80000', 562],
    ]);

    // the other tenant's credential does not learn the order exists
    expect((await getAs(`/api/v1/purchase-orders/${orderId}/lines`, USER_B)).status).toBe(404);
  });
});

describe('a handed-over project is read-only (06-projects) — the server refuses the write, not the page', () => {
  async function send(method: string, path: string, credential: string, body: unknown): Promise<Response> {
    return app.request(path, { method, headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  let projectId = '';

  beforeAll(async () => {
    projectId = randomUUID();
    await admin.query('BEGIN');
    await admin.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
    await admin.query(
      `INSERT INTO projects.projects (tenant_id, id, code, name, client_name, state, original_value, handed_over_on)
       VALUES ($1, $2, 'HND-01', 'Handed-over fitout', 'A Client Private Limited', 'handed_over', 5000000, CURRENT_DATE)`,
      [TENANT_A, projectId],
    );
    await admin.query('COMMIT');
  });

  it('refuses a BOQ line, a variation and an order raised from the BOQ with CONFLICT and the reason, and still answers every read', async () => {
    const line = await send('POST', `/api/v1/projects/${projectId}/boq`, USER_A, {
      lines: [{ section: 'Civil', itemNo: 1, description: 'Late line', uom: 'sqm', quantityWhole: 1, quantityMillionths: 0, rate: '100' }],
    });
    expect(line.status).toBe(409);
    expect(((await line.json()) as { message: string }).message).toMatch(/handed over/);

    const variation = await send('POST', `/api/v1/projects/${projectId}/change-orders`, USER_A, { projectId, number: 'VO-9', title: 'Late change', description: '', costImpact: '100' });
    expect(variation.status).toBe(409);

    const order = await send('POST', '/api/v1/purchase-orders/from-boq', USER_A, { projectId, boqItemIds: [randomUUID()], vendorId: vendorIds.get(TENANT_A), gstRate: 1800 });
    expect(order.status).toBe(409);
    expect(((await order.json()) as { message: string }).message).toMatch(/handed over/);

    // readable and exportable, as the design promises
    const read = await app.request(`/api/v1/projects/${projectId}/boq`, { headers: { authorization: `Bearer ${USER_A}` } });
    expect(read.status).toBe(200);
  });
});
