#!/usr/bin/env node
// A content digest of a seeded database, for checking the seed is deterministic.
//
// **Content, not identity.** `scripts/seed-demo.mjs` says it plainly: row ids
// are uuids the server generates, so they differ between fresh databases, and
// that is correct — an id is not content. Timestamps are the same. So this
// hashes what the seed CHOSE: names, codes, amounts, states, roles, links.
//
// What it is for: proving that two runs, and two databases built from scratch,
// contain the same demo. A screenshot taken from one has to be reproducible
// from the other, and a fixture the browser suite asserts on has to be the same
// value every time or the suite is measuring luck.
//
// **THE TABLE LIST IS DISCOVERED, NOT TYPED.** It used to be ten hand-written
// pairs — "what the seed decides", decided by whoever last edited this file.
// That is defect 6's shape and it fired immediately: the commit that made the
// seed populate `projects.trade_packages` did not touch this script, so a whole
// seeded table stayed outside the digest and two runs that differed in it would
// have hashed the same. A list maintained by remembering is a list that is
// wrong the first time somebody does not.
//
// So every base table in the service schemas is discovered from the catalogue
// and every table WITH ROWS is projected. A new seeded table joins on its own.
//
// Usage:  node scripts/seed-digest.mjs [database] [--body <path>]
//         (reads through `docker compose exec postgres`, as the superuser, so
//          RLS does not hide half the rows from the digest)

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const database = args[0] ?? process.env['POSTGRES_DB'] ?? 'cog_e2e';

/**
 * Where to write the digest INPUT, if anywhere.
 *
 * `--body <path>` exists because a hash tells you that two databases differ
 * and nothing else. Comparing the two bodies names the table and the row in
 * one `diff`, which is the difference between a diagnosis and a guessing
 * game — and reporting a difference somebody then has to find is this
 * script's whole job.
 */
const bodyPath = (() => {
  const at = process.argv.indexOf('--body');
  return at === -1 ? null : (process.argv[at + 1] ?? null);
})();

/**
 * Schemas that are not the demo.
 *
 * `migrations` holds `applied`, which records filenames and a timestamp —
 * bookkeeping about the schema, not content the seed chose. Everything else is
 * a service schema and is in scope by default, which is the direction that
 * fails safe: a new service's tables are included until somebody says why not.
 */
const NOT_CONTENT_SCHEMAS = ['migrations'];

/**
 * Columns that are identity or time, dropped from every derived projection.
 *
 * A `uuid` is never content — it is generated per database and comparing two
 * of them says nothing about the seed. Timestamps are the same. `tenant_id` is
 * a uuid anyway and named here because it is the one people expect to see.
 *
 * This is why a HAND projection still beats a derived one in a few places: a
 * derived projection can only drop `purchase_order_id` or keep it, and dropping
 * it loses which order a line belongs to. `QUERIES` below replaces that uuid
 * with a join to the order's NUMBER, which is stable and means something. The
 * rule is: derive by default, hand-write where a join carries information a
 * dropped column would have.
 */
/**
 * @typedef {{ name: string, type: string }} Column
 * @typedef {{ table: string, name: string }} QualifiedColumn
 */

/**
 * @param {Column} column
 * @param {string} table
 * @param {Set<string>} idShaped  `table.column` names holding uuid-shaped text.
 * @returns {boolean}
 */
function isContentColumn(column, table, idShaped) {
  if (column.name === 'id' || column.name === 'tenant_id') return false;
  if (column.type === 'uuid') return false;
  // **A `text` column can hold a uuid, and several here do.** `created_by`,
  // `moved_by`, `approver_id`, `actor_id`, `entity_id` are all declared `text`
  // and all hold a generated id, so a filter that judges by DECLARED TYPE lets
  // every one of them into the digest — and each is a different value in every
  // database. That is not a hypothetical: it is what made two seeds of the same
  // demo hash differently, across six tables, until the check below existed.
  // Which columns those are is discovered by looking at the values, not listed.
  if (idShaped.has(`${table}.${column.name}`)) return false;
  // **`bytea` is a hash, and a hash of a random secret is not a choice.**
  // `identity.invites.token_hash` and `identity.invite_lookup.token_hash` hold
  // the digest of a token generated freshly on every seed run, and
  // `tenancy.connector_keys.key_hash` the same. Projecting them would make this
  // script report two identical demos as different — which is the one answer it
  // must never give, because it would be indistinguishable from a real drift.
  // The row COUNT of those tables is still recorded, so an invitation that
  // stops being created still shows.
  if (column.type === 'bytea') return false;
  return !column.type.startsWith('timestamp');
}

/**
 * The projections worth writing by hand.
 *
 * Each one replaces a uuid with something readable and stable. A table not
 * named here is projected automatically — that is the point of the rewrite, and
 * adding an entry here is an improvement to the digest, never a requirement
 * for a table to be in it.
 */
const QUERIES = new Map([
  [
    'identity.principal_links',
    `SELECT p.email, l.subject_kind FROM identity.principal_links l
       JOIN identity.principals p ON p.id = l.principal_id
      ORDER BY p.email, l.subject_kind`,
  ],
  [
    'procurement.purchase_order_lines',
    `SELECT p.number, l.line_no, l.description, l.unit_rate, l.gst_rate_bp,
            coalesce(l.trade_code, ''), coalesce(l.contracted_unit_rate::text, '')
       FROM procurement.purchase_order_lines l
       JOIN procurement.purchase_orders p ON p.id = l.purchase_order_id
      ORDER BY p.number, l.line_no`,
  ],
  [
    'procurement.rate_contract_items',
    `SELECT c.number, i.trade_code, i.description, i.uom, i.contract_rate,
            i.valid_from::text, i.valid_to::text
       FROM procurement.rate_contract_items i
       JOIN procurement.rate_contracts c ON c.id = i.contract_id
      ORDER BY c.number, i.trade_code, i.valid_from`,
  ],
]);

/**
 * The superuser's name, resolved ONCE and then passed literally.
 *
 * `psql -U "$POSTGRES_USER"` looks right and does not survive the trip: with
 * `shell: true` on Windows the command goes through cmd.exe before it reaches
 * `sh -c` in the container, the `$` never expands, and psql falls back to the
 * OS user — `FATAL: role "root" does not exist`. Asking the container what it
 * is, once, avoids guessing and avoids the quoting.
 */
const superuser = (() => {
  const found = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'],
    { encoding: 'utf8', shell: true },
  );
  const name = (found.stdout ?? '').trim();
  if (name === '') {
    process.stderr.write('\n  could not read POSTGRES_USER from the container\n');
    process.exit(1);
  }
  return name;
})();

/**
 * @param {string} sql
 * @returns {string}  stdout, trimmed.
 */
function psql(sql) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      // No `-F '|'`: psql's unaligned mode already separates with `|`, and a
      // single-quoted flag through `shell: true` on Windows becomes
      // `''' is not recognized as an internal or external command`.
      `psql -U ${superuser} -d ${database} -At -c "${sql.replace(/"/g, '\\"').replace(/\n\s*/g, ' ')}"`,
    ],
    // NO `shell: true`. With it, cmd.exe concatenates the argv and eats the
    // quoting around the `sh -c` payload, so psql ran with no arguments at all
    // and reported `FATAL: role "root" does not exist` — a message about the
    // OS user, which reads as a permissions problem rather than a quoting one.
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(`\n  query failed against ${database}:\n${result.stderr ?? ''}\n`);
    process.exit(1);
  }
  return (result.stdout ?? '').trim();
}

/** @type {(out: string) => string[]} */
const rowsOf = (out) => (out === '' ? [] : out.split('\n'));

// ---------------------------------------------------------------------------
// 1. Discover every table, and every column of every table. Two queries.
// ---------------------------------------------------------------------------

const excluded = NOT_CONTENT_SCHEMAS.map((s) => `'${s}'`).join(', ');

const tables = rowsOf(
  psql(
    `SELECT table_schema || '.' || table_name
       FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema', ${excluded})
      ORDER BY 1`,
  ),
);

if (tables.length === 0) {
  process.stderr.write(`\n  no tables at all in ${database} — is it migrated?\n`);
  process.exit(1);
}

const columns = new Map();
for (const row of rowsOf(
  psql(
    `SELECT table_schema || '.' || table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', ${excluded})
      ORDER BY table_schema, table_name, ordinal_position`,
  ),
)) {
  const [table, name, type] = row.split('|');
  if (table === undefined || name === undefined || type === undefined) continue;
  const list = columns.get(table) ?? [];
  list.push({ name, type });
  columns.set(table, list);
}

// ---------------------------------------------------------------------------
// 2. Count every table in ONE round trip.
//
// One `docker compose exec` per table costs about a second on Windows, and
// there are seventy-eight of them — a minute of gate time to learn that sixty
// are empty. A single UNION ALL answers it once.
// ---------------------------------------------------------------------------

const counts = new Map();
for (const row of rowsOf(
  psql(
    tables
      .map((/** @type {string} */ t) => `SELECT '${t}' AS t, count(*) AS n FROM ${t}`)
      .join(' UNION ALL '),
  ),
)) {
  const [table, n] = row.split('|');
  if (table !== undefined && n !== undefined) counts.set(table, Number(n));
}

// ---------------------------------------------------------------------------
// 2b. Which `text` columns actually hold ids.
//
// Asked of the DATA, in one more round trip, because the schema does not know.
// `bool_and(… ~* '<uuid>')` over the non-null values answers "is every value in
// this column a uuid" — and a column for which that is true is identity however
// it was declared. An all-NULL column answers NULL, which `coalesce` turns into
// "keep it": it contributes nothing to the digest either way.
// ---------------------------------------------------------------------------

const UUID_RE = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const populated = tables.filter((/** @type {string} */ t) => (counts.get(t) ?? 0) > 0);
const textColumns = populated.flatMap((/** @type {string} */ table) =>
  (columns.get(table) ?? [])
    .filter((/** @type {Column} */ c) => c.type === 'text' || c.type === 'character varying')
    .map((/** @type {Column} */ c) => ({ table, name: c.name })),
);

const idShaped = new Set();

// In batches. There are two hundred-odd text columns, and one UNION ALL over
// all of them is a ~30KB command line — inside Windows' 32KB limit by a margin
// too thin to rely on, and it failed with an empty stderr, which is what
// exceeding it looks like from here.
const PROBE_BATCH = 30;
for (let at = 0; at < textColumns.length; at += PROBE_BATCH) {
  const batch = textColumns.slice(at, at + PROBE_BATCH);
  const probe = batch
    .map(
      (/** @type {QualifiedColumn} */ { table, name }) =>
        `SELECT '${table}.${name}' AS k, ` +
        `coalesce(bool_and("${name}" ~* '${UUID_RE}'), false) AS v ` +
        `FROM ${table} WHERE "${name}" IS NOT NULL`,
    )
    .join(' UNION ALL ');
  for (const row of rowsOf(psql(probe))) {
    const [key, value] = row.split('|');
    if (key !== undefined && value === 't') idShaped.add(key);
  }
}

if (idShaped.size > 0) {
  process.stderr.write(
    `  ${String(idShaped.size)} text columns hold ids and are excluded: ` +
      `${[...idShaped].sort().join(', ')}\n\n`,
  );
}

// ---------------------------------------------------------------------------
// 3. Project every table that has content.
// ---------------------------------------------------------------------------

/** Ordered by content, never by id — an id-ordered digest would differ between
 *  databases for a reason that says nothing about the seed. */
/**
 * @param {string} table
 * @returns {string | null}
 */
function derive(table) {
  const content = (columns.get(table) ?? []).filter((/** @type {Column} */ c) =>
    isContentColumn(c, table, idShaped),
  );
  // A table whose every column is an id or a timestamp has no content to
  // compare. Its row COUNT is still recorded below, which is the part of it
  // that can change.
  if (content.length === 0) return null;
  const projection = content
    .map((/** @type {Column} */ c) => `"${c.name}"::text`)
    .join(', ');
  return `SELECT ${projection} FROM ${table} ORDER BY ${content
    .map((/** @type {Column} */ c) => `"${c.name}"`)
    .join(', ')}`;
}

const parts = [];
let rows = 0;
let derived = 0;

for (const table of tables) {
  const count = counts.get(table) ?? 0;

  // **An empty table is recorded as 0, not skipped.** If it were skipped, the
  // day the seed starts writing it the digest would gain a section and every
  // stored hash would change for a reason nobody could locate. Recorded, the
  // same event shows as one line moving from 0 to n.
  if (count === 0) {
    parts.push(`## ${table} (0)`);
    continue;
  }

  const hand = QUERIES.get(table);
  const sql = hand ?? derive(table);
  if (hand === undefined) derived += 1;

  if (sql === null) {
    // Content-free but populated: the count is the only thing to compare.
    parts.push(`## ${table} (${String(count)}) count-only`);
    rows += count;
    process.stderr.write(`  ${table}: ${String(count)} (count only)\n`);
    continue;
  }

  const out = psql(sql);
  const projected = out === '' ? 0 : out.split('\n').length;
  rows += projected;
  parts.push(`## ${table} (${String(projected)})\n${out}`);
  process.stderr.write(`  ${table}: ${String(projected)}${hand === undefined ? '' : ' (hand)'}\n`);
}

// A digest over an empty database is a perfectly stable digest, and comparing
// two of those proves nothing at all.
if (rows < 50) {
  process.stderr.write(
    `\n  only ${String(rows)} rows in ${database} — that is not a seeded database, and\n` +
      '  comparing digests of it would prove nothing.\n',
  );
  process.exit(1);
}

const body = parts.join('\n\n');
if (bodyPath !== null) {
  writeFileSync(bodyPath, body, 'utf8');
  process.stderr.write(`  body written to ${bodyPath}
`);
}
process.stderr.write(
  `\n  ${String(rows)} content rows from ${database}` +
    ` · ${String(tables.length)} tables discovered, ${String(derived)} projected automatically\n`,
);
process.stdout.write(`${createHash('md5').update(body, 'utf8').digest('hex')}\n`);
