/**
 * Build one valid row for every tenant-scoped table, from the catalogue.
 *
 * **Why this exists.** Four services own 57 tenant tables between them and had
 * no isolation suite. Asserting "tenant A cannot read tenant B's row" needs a
 * row of tenant B's to exist in every one of those tables — and 28 of them are
 * written by no route, no seed and no test, so there is nothing to copy.
 *
 * **Why it lives in `scripts/`.** `tenant-isolation.test.ts` states the rule it
 * is following: no shared test helper that reaches across *service*
 * directories, because that is the coupling the boundary rule exists to
 * prevent. `scripts/` is not a service directory — it is repo-level
 * infrastructure, and `services/host/tests/isolation/tenant-routes.test.ts`
 * already imports `migration-plan.mjs` from here for the same reason. The FK
 * graph is global (a `projects` row references `identity.principals`), so every
 * suite needs the whole graph regardless of which schema it asserts on.
 *
 * **It never skips.** A table whose row cannot be built is returned in
 * `failures` and the caller turns it into a *named failing test*. A builder
 * that quietly omitted a table it could not satisfy would report green over
 * exactly the tables least covered elsewhere — this repo's recurring failure,
 * one layer down.
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} Queryable
 *   Anything that can run SQL — a `pg.Client`, or a wrapper that opens a
 *   transaction around each statement. Deliberately structural: the isolation
 *   suites pass a function that sets a tenant context first.
 * @typedef {Record<string, any>} Row  A row as `pg` returns it.
 * @typedef {{ s: string, t: string, col: string, udt: string, nullable: boolean,
 *             has_default: boolean, identity: boolean }} ColumnMeta
 * @typedef {{ refTable: string, refCol: string }} FkTarget
 * @typedef {{ byTable: Map<string, ColumnMeta[]>, fkCol: Map<string, FkTarget>,
 *             checksOf: Map<string, string[]>, ordered: string[],
 *             tenantTables: string[] }} Catalogue
 * @typedef {(ctx: { insertExtra: (table: string) => Promise<Row>, tenantId: string,
 *            made: Map<string, Row> }) => string | Promise<string>} Override
 *   Produces a SQL literal for one column. Async only when it needs a row.
 */

/** @type {Map<string, string>} */
const documentIds = new Map();
/**
 * One id per tenant, reused by both `documents.id` and `documents.object_key`.
 * @param {string} tenantId
 * @returns {string}
 */
function documentId(tenantId) {
  const existing = documentIds.get(tenantId);
  if (existing) return existing;
  const minted = randomUUID();
  documentIds.set(tenantId, minted);
  return minted;
}

/** Schemas that own tenant tables. Ordered for readability only; FK order is computed. */
export const TENANT_SCHEMAS = [
  'tenancy',
  'identity',
  'projects',
  'procurement',
  'siteops',
  'finance',
  'workflow',
];

/**
 * Values the catalogue cannot infer, each with the constraint that forces it.
 *
 * Every entry is a single named column — never a pattern — so a table added
 * later cannot inherit an exemption by being shaped a certain way. Most are
 * anchored regexes; `assertOverridesAreLive` fails if any entry names a column
 * that no longer exists, so a dropped constraint cannot leave a stale value
 * behind masking a later change.
 *
 * @type {Record<string, Override>}
 */
export const OVERRIDES = {
  // CHECK (role_key ~ '^[a-z][a-z0-9_]{1,30}$')
  'identity.role_catalog.role_key': () => `'probe_role'`,
  // CHECK (grant_key ~ '^[a-z][a-z0-9_]{1,40}$')
  'identity.role_grants.grant_key': () => `'probe_grant'`,
  // CHECK (ifsc ~ '^[A-Z]{4}0[0-9A-Z]{6}$') — synthetic, not a real branch code.
  'procurement.vendor_bank_accounts.ifsc': () => `'ZZZZ0000000'`,
  // CHECK (account_number ~ '^[0-9A-Za-z]{5,34}$')
  'procurement.vendor_bank_accounts.account_number': () => `'000000'`,
  // CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$') — synthetic, nobody's PAN.
  'procurement.transporter_declarations.pan': () => `'ZZZZZ0000Z'`,
  // CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'), and a CHECK that casts its
  // first four characters to a year, so 'X' is an error rather than a refusal.
  'procurement.transporter_declarations.financial_year': () => `'2026-27'`,
  // CHECK that declared_on falls inside that financial year.
  'procurement.transporter_declarations.declared_on': () => `'2026-04-01'`,
  // CHECK (module_key ~ '^[a-z][a-z0-9_]{2,39}$')
  'tenancy.tenant_modules.module_key': () => `'probe_module'`,
  // CHECK (checksum ~ '^[0-9a-f]{64}$') — sha256 of nothing in particular.
  'workflow.documents.checksum': () => `'${'0'.repeat(64)}'`,
  // CHECK (object_key = 'tenants/' || tenant_id || '/documents/' || id) — the
  // one place two columns have to be minted together, so `id` is pinned rather
  // than left to its default. Overrides are applied before the has-default
  // skip, which is what makes pinning a defaulted column possible at all.
  'workflow.documents.id': ({ tenantId }) => `'${documentId(tenantId)}'::uuid`,
  'workflow.documents.object_key': ({ tenantId }) =>
    `'tenants/${tenantId}/documents/${documentId(tenantId)}'`,
  // CHECK (primary_id <> secondary_id) — the one override that needs a row
  // rather than a literal: a merge joins two DIFFERENT leads, so the generic
  // "reuse the parent we just made" rule cannot satisfy it.
  'projects.lead_merges.secondary_id': async ({ insertExtra }) => {
    const extra = await insertExtra('projects.leads');
    return `'${String(extra['id'])}'::uuid`;
  },
};

/**
 * @param {string} schema
 * @param {string} table
 * @returns {string}
 */
const key = (schema, table) => `${schema}.${table}`;

/**
 * Read the shape of every tenant table: columns, FK edges, CHECK definitions.
 * Taken from `pg_constraint` rather than `information_schema` because the
 * latter reports a composite FK one row per column with a mangled reference set,
 * and every FK here is composite `(tenant_id, x)` by design.
 *
 * @param {Queryable} admin  A superuser connection — this reads the catalogue.
 * @param {string[]} [schemas]
 * @returns {Promise<Catalogue>}
 */
export async function readCatalogue(admin, schemas = TENANT_SCHEMAS) {
  /** @type {{ rows: ColumnMeta[] }} */
  const { rows: cols } = await admin.query(
    `SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS col,
            c.udt_name AS udt, c.is_nullable = 'YES' AS nullable,
            c.column_default IS NOT NULL AS has_default,
            c.is_identity = 'YES' AS identity
       FROM information_schema.columns c
       JOIN information_schema.tables tb
         ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        AND tb.table_type = 'BASE TABLE'
      WHERE c.table_schema = ANY($1)
      ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
    [schemas],
  );

  /** @type {{ rows: { s: string, t: string, attnum: number, attname: string }[] }} */
  const { rows: attnums } = await admin.query(
    `SELECT ns.nspname AS s, cl.relname AS t, a.attnum, a.attname
       FROM pg_attribute a
       JOIN pg_class cl ON cl.oid = a.attrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = ANY($1) AND a.attnum > 0 AND NOT a.attisdropped`,
    [schemas],
  );

  /**
   * @type {{ rows: { s: string, t: string, fs: string, ft: string,
   *                  conkey: number[], confkey: number[] }[] }}
   */
  const { rows: fks } = await admin.query(
    `SELECT ns.nspname AS s, cl.relname AS t, fns.nspname AS fs, fcl.relname AS ft,
            con.conkey, con.confkey
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
       JOIN pg_class fcl ON fcl.oid = con.confrelid
       JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
      WHERE con.contype = 'f' AND ns.nspname = ANY($1)`,
    [schemas],
  );

  /** @type {{ rows: { s: string, t: string, def: string }[] }} */
  const { rows: checks } = await admin.query(
    `SELECT ns.nspname AS s, cl.relname AS t, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE con.contype = 'c' AND ns.nspname = ANY($1)`,
    [schemas],
  );

  /** @type {Map<string, string>} */
  const attname = new Map();
  for (const a of attnums) attname.set(`${a.s}.${a.t}.${a.attnum}`, a.attname);

  /** @type {Map<string, ColumnMeta[]>} */
  const byTable = new Map();
  for (const r of cols) {
    const k = key(r.s, r.t);
    const list = byTable.get(k);
    if (list) list.push(r);
    else byTable.set(k, [r]);
  }

  /** @type {Map<string, FkTarget>} */
  const fkCol = new Map();
  /** @type {Map<string, Set<string>>} */
  const deps = new Map([...byTable.keys()].map((k) => [k, new Set()]));
  for (const f of fks) {
    const k = key(f.s, f.t);
    const rk = key(f.fs, f.ft);
    if (rk !== k) deps.get(k)?.add(rk);
    f.conkey.forEach((an, i) => {
      const local = attname.get(`${f.s}.${f.t}.${an}`);
      const remote = attname.get(`${f.fs}.${f.ft}.${f.confkey[i]}`);
      if (local && remote) fkCol.set(`${k}.${local}`, { refTable: rk, refCol: remote });
    });
  }

  /** @type {Map<string, string[]>} */
  const checksOf = new Map();
  for (const ch of checks) {
    const k = key(ch.s, ch.t);
    const list = checksOf.get(k);
    if (list) list.push(ch.def);
    else checksOf.set(k, [ch.def]);
  }

  // Depth-first FK order, so a parent is always built before its children.
  /** @type {string[]} */
  const ordered = [];
  /** @type {Set<string>} */
  const done = new Set();
  /**
   * @param {string} k
   * @param {Set<string>} [stack]
   * @returns {void}
   */
  const visit = (k, stack = new Set()) => {
    if (done.has(k) || stack.has(k)) return;
    stack.add(k);
    for (const d of deps.get(k) ?? []) visit(d, stack);
    done.add(k);
    ordered.push(k);
  };
  for (const k of byTable.keys()) visit(k);

  const tenantTables = ordered.filter((k) =>
    (byTable.get(k) ?? []).some((c) => c.col === 'tenant_id'),
  );

  return { byTable, fkCol, checksOf, ordered, tenantTables };
}

/**
 * A value the column's own CHECK constraints will accept, or undefined.
 * @param {Map<string, string[]>} checksOf
 * @param {string} k
 * @param {string} col
 * @param {string} udt
 * @returns {string | undefined}
 */
function fromCheck(checksOf, k, col, udt) {
  for (const def of checksOf.get(k) ?? []) {
    const anyOf = new RegExp(`\\b${col}\\b[^)]*?= ANY \\(ARRAY\\[([^\\]]+)\\]`).exec(def);
    const labels = anyOf?.[1];
    if (labels) {
      const first = /'((?:[^']|'')*)'/.exec(labels);
      if (first) return `'${first[1]}'`;
    }
    const eq = new RegExp(`\\b${col}\\b = '((?:[^']|'')*)'`).exec(def);
    if (eq) return `'${eq[1]}'`;
    // A boolean the table requires to be true, e.g. `(scope_confirmed AND …)`.
    if (udt === 'bool' && new RegExp(`\\b${col}\\b`).test(def) && !/\bNOT\b/.test(def)) {
      return 'true';
    }
  }
  return undefined;
}

/**
 * @param {Map<string, string[]>} checksOf
 * @param {string} k
 * @param {string} col
 * @param {string} udt
 * @returns {string}
 */
function literalFor(checksOf, k, col, udt) {
  const checked = fromCheck(checksOf, k, col, udt);
  if (checked) return checked;
  if (udt === 'uuid') return 'gen_random_uuid()';
  if (udt === 'bool') return 'false';
  if (['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(udt)) return '1';
  if (udt === 'date') return `'2026-01-01'`;
  if (udt.startsWith('timestamp')) return 'now()';
  if (udt === 'json' || udt === 'jsonb') return `'{}'::${udt}`;
  if (udt === 'daterange') return `'[2026-01-01,2026-12-31)'::daterange`;
  if (udt.startsWith('_')) return `'{}'::${udt.slice(1)}[]`;
  // 'X' satisfies the common text CHECKs here: uppercase-only codes,
  // `code = upper(code)` and `length BETWEEN 1 AND n`.
  return `'X'`;
}

/**
 * Every OVERRIDES key must still name a real column.
 *
 * A stale entry is worse than a missing one: it keeps supplying a value for a
 * constraint that has since changed, so the builder goes on passing while the
 * thing the override was compensating for has moved.
 *
 * @param {Catalogue} catalogue
 * @returns {string[]}  Override keys naming a column that no longer exists.
 */
export function assertOverridesAreLive(catalogue) {
  /** @type {string[]} */
  const stale = [];
  for (const entry of Object.keys(OVERRIDES)) {
    const parts = entry.split('.');
    const col = parts.pop();
    const tableKey = parts.join('.');
    const cols = catalogue.byTable.get(tableKey);
    if (!cols || !cols.some((c) => c.col === col)) stale.push(entry);
  }
  return stale;
}

/**
 * Compose the INSERT for one table, as a single string with inlined literals.
 *
 * The string is returned as well as run, because the isolation suites replay
 * the *identical* statement under the wrong tenant context: a row shape that
 * differs between the positive and the negative would let a fixture bug pass
 * for a policy result.
 *
 * @param {Catalogue} catalogue
 * @param {string} k
 * @param {string} tenantId
 * @param {Map<string, Row>} made
 * @param {(table: string) => Promise<Row>} insertExtra
 * @returns {Promise<string>}
 */
async function composeInsert(catalogue, k, tenantId, made, insertExtra) {
  const [schema, table] = k.split('.');
  /** @type {string[]} */
  const names = [];
  /** @type {string[]} */
  const values = [];
  for (const col of catalogue.byTable.get(k) ?? []) {
    if (col.identity) continue; // GENERATED ALWAYS — a value is an error, not a default
    if (col.col === 'tenant_id') {
      names.push('tenant_id');
      values.push(`'${tenantId}'::uuid`);
      continue;
    }
    const override = OVERRIDES[`${k}.${col.col}`];
    if (override) {
      names.push(`"${col.col}"`);
      values.push(await override({ insertExtra, tenantId, made }));
      continue;
    }
    const fk = catalogue.fkCol.get(`${k}.${col.col}`);
    if (fk) {
      // Leave a nullable FK NULL: it needs no parent, and it satisfies the
      // `x IS NULL OR …` conditional checks several of these tables carry.
      if (col.nullable) continue;
      const parent = made.get(fk.refTable);
      names.push(`"${col.col}"`);
      values.push(
        parent && parent[fk.refCol] !== undefined
          ? `'${String(parent[fk.refCol])}'::${col.udt}`
          : literalFor(catalogue.checksOf, k, col.col, col.udt),
      );
      continue;
    }
    if (col.nullable || col.has_default) continue;
    names.push(`"${col.col}"`);
    values.push(literalFor(catalogue.checksOf, k, col.col, col.udt));
  }
  return `INSERT INTO ${schema}.${table} (${names.join(', ')}) VALUES (${values.join(', ')}) RETURNING *`;
}

/**
 * Build one row per table for `tenantId`, in FK order, running `exec` for each.
 *
 * `exec(sql, tableKey)` is supplied by the caller so the same builder can run
 * the inserts as the superuser (setting up parents) or as `app_runtime` inside a
 * tenant context (which is what proves WITH CHECK accepts a correct write). The
 * table key is passed so a caller can take the NEGATIVE for that table — the
 * identical statement under the wrong tenant — before the positive creates the
 * row. Taken in that order a unique-constraint collision cannot masquerade as
 * the RLS refusal, because there is nothing yet to collide with.
 *
 * @param {Catalogue} catalogue
 * @param {{ tenantId: string,
 *           exec: (sql: string, tableKey: string) => Promise<{ rows: Row[] }>,
 *           only?: string,
 *           seeded?: Map<string, Row> }} options
 * @returns {Promise<{ made: Map<string, Row>, sqlUsed: Map<string, string>,
 *                     failures: Map<string, string> }>}
 */
export async function buildRows(catalogue, { tenantId, exec, only, seeded }) {
  // `tenancy.tenants` is the root of the FK graph and the caller owns it: every
  // `tenant_id` references it, so a row the builder invented with a random id
  // would fail every child FK. Anything pre-seeded is used, never rebuilt.
  /** @type {Map<string, Row>} */
  const made = new Map(seeded ?? []);
  /** @type {Map<string, string>} */
  const sqlUsed = new Map();
  /** @type {Map<string, string>} */
  const failures = new Map();

  /** @type {(table: string) => Promise<Row>} */
  const insertExtra = async (k) => {
    const sql = await composeInsert(catalogue, k, tenantId, made, insertExtra);
    const res = await exec(sql, k);
    const row = res.rows[0];
    // `RETURNING *` on a successful single-row INSERT always yields a row, so
    // this cannot fire in practice — but an override that silently received
    // `undefined` would go on to interpolate the string "undefined" into a
    // fixture, which is exactly the kind of quiet fixture bug that reads as a
    // policy result later.
    if (!row) throw new Error(`no row returned inserting ${k}`);
    return row;
  };

  for (const k of catalogue.ordered) {
    if (made.has(k)) continue;
    const cols = catalogue.byTable.get(k) ?? [];
    // Every table is built, because a `projects` row can need an `identity`
    // parent. `only` narrows what is REPORTED, never what is built.
    const isTenantTable = cols.some((c) => c.col === 'tenant_id');
    const reportable = isTenantTable && (!only || k.startsWith(`${only}.`));
    try {
      const sql = await composeInsert(catalogue, k, tenantId, made, insertExtra);
      const res = await exec(sql, k);
      const row = res.rows[0];
      if (!row) throw new Error(`no row returned inserting ${k}`);
      made.set(k, row);
      sqlUsed.set(k, sql);
    } catch (e) {
      if (reportable) {
        const message = String((/** @type {Error} */ (e)).message);
        failures.set(k, message.split('\n')[0] ?? message);
      }
    }
  }
  return { made, sqlUsed, failures };
}
