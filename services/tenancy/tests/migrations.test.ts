import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static audit of the migration SQL.
 *
 * This runs without a database, so it is the check that fails in three seconds
 * on a pull request rather than after a container starts. It cannot prove
 * isolation — only the suite in `tests/isolation/` does that — but it catches
 * the shapes that are wrong on sight.
 */

const SERVICES_DIR = join(import.meta.dirname, '../..');
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

const collected = collectMigrations(SERVICES_DIR);
const files = collected.map((m) => m.id);
const sql = collected.map((m) => ({ file: m.id, text: readFileSync(m.path, 'utf8') }));

describe('migrations', () => {
  it('there are some', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('are numbered and ordered', () => {
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
  });
});

/**
 * Strip what is not SQL code: `--` comments AND single-quoted string literals.
 *
 * Without the second, a `COMMENT ON` that mentions the word "float" — while
 * explaining why money must never be one — fails the float check. A column type
 * never appears inside a quoted string, so removing them loses nothing and
 * stops the check crying wolf, which is how a check gets weakened or deleted.
 */
function sqlCodeOnly(text: string): string {
  return text.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
}

describe('money is never a float', () => {
  it.each(sql)('$file declares no real/double precision/float column', ({ text }) => {
    expect(sqlCodeOnly(text)).not.toMatch(/\b(real|double\s+precision|float\d*)\b/i);
  });

  it('the check itself catches a float column', () => {
    // A check nobody has seen fail is not a check.
    expect(sqlCodeOnly('CREATE TABLE t (amount real);')).toMatch(/\breal\b/i);
    expect(sqlCodeOnly("COMMENT ON TABLE t IS 'never a float';")).not.toMatch(/\bfloat\b/i);
  });
});

describe('row-level security', () => {
  const created = sql.flatMap(({ file, text }) =>
    [...text.matchAll(/CREATE TABLE (\w+\.\w+)/gi)].map((m) => ({ file, table: m[1] as string })),
  );

  it('discovers tables to check, and every name is schema-qualified', () => {
    // This used to assert an exact hand-maintained list, which was a tautology:
    // both sides came from the same regex over the same files, so the only
    // thing it proved was that somebody had updated the list. It was extended
    // by hand twice in one session.
    //
    // What is worth asserting statically is that discovery WORKS — a broken
    // regex or a wrong path would otherwise make every per-table check below
    // pass over an empty set. The independent claim, "the live database
    // contains exactly what the migrations declare", needs a database and lives
    // in `tests/isolation/tenant-isolation.test.ts`.
    expect(created.length).toBeGreaterThan(15);
    for (const { table, file } of created) {
      expect(table, `${file} declares an unqualified table name`).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
    // Every service that owns migrations is represented.
    const schemas = new Set(created.map((c) => c.table.split('.')[0]));
    expect(schemas.size).toBeGreaterThan(4);
  });

  /** Whitespace-tolerant: alignment is style, and a check should test meaning. */
  const hasStatement = (all: string, table: string, verb: 'ENABLE' | 'FORCE'): boolean =>
    new RegExp(`ALTER TABLE\\s+${table.replace('.', '\\.')}\\s+${verb}\\s+ROW LEVEL SECURITY`).test(
      all,
    );

  /**
   * Tables outside the tenant model, each an exception for a stated reason.
   *
   * A list of names is a hole; what makes this a boundary is what is asserted
   * about the members. Here: they must REVOKE from PUBLIC. Against a live
   * database, `tests/isolation/tenant-isolation.test.ts` adds the two that
   * matter — no tenant policy, and no grant to `app_runtime` — so an exception
   * cannot quietly become a readable, unprotected table.
   *
   * Only the three platform tables are here. `connector_keys` and
   * `principal_lookup` are bootstrap tables — read before a tenant context
   * exists — but they still ENABLE row-level security, so they pass the check
   * below unaided and listing them would weaken it for no reason.
   *
   * A platform account belongs to no tenant at all, so no tenant predicate
   * could be written for these three: modelling one as a member of a magic
   * tenant is how "the support tenant" becomes a tenant with access to every
   * other.
   */
  const OUTSIDE_THE_TENANT_MODEL = new Set([
    'tenancy.platform_principals',
    'tenancy.provisioning_events',
    'tenancy.tenant_directory',
  ]);

  it.each(created)('$table has RLS enabled', ({ table }) => {
    const all = sql.map((s) => s.text).join('\n');
    if (OUTSIDE_THE_TENANT_MODEL.has(table)) {
      // Asserted, not skipped: an exception still has to be unreachable by
      // default, and the live-database suite checks the rest.
      expect(all).toContain(`REVOKE ALL ON ${table} FROM PUBLIC`);
      return;
    }
    expect(hasStatement(all, table, 'ENABLE')).toBe(true);
  });

  it('every table with a tenant predicate is also FORCEd', () => {
    // Without FORCE the table owner bypasses its own policies, so a migration
    // or a SECURITY DEFINER function running as the owner sees every tenant.
    const all = sql.map((s) => s.text).join('\n');
    for (const { table } of created) {
      const hasPolicy = all.includes(`ON ${table} AS RESTRICTIVE`);
      const hasForce = hasStatement(all, table, 'FORCE');
      expect(
        hasPolicy === hasForce,
        `${table}: policy=${hasPolicy} force=${hasForce} — a table with a tenant policy must be FORCEd, and one without must not be`,
      ).toBe(true);
    }
  });

  it('every policy comes in a RESTRICTIVE + PERMISSIVE pair', () => {
    // Permissive policies are OR-ed, so a later `USING (true)` would open the
    // table while still satisfying "at least one policy exists". A RESTRICTIVE
    // policy is AND-ed with everything and caps whatever is added later.
    //
    // `\s+` rather than a single space between the policy name and `ON`.
    //
    // The check is about POLICY PAIRING, not about formatting, and it was
    // reporting a missing permissive policy for three tables that had one —
    // their `CREATE POLICY tenant_access    ON …` was column-aligned with the
    // RESTRICTIVE line above it, which the old single-space pattern did not
    // match. A whitespace difference reported as an absent security policy is
    // a false alarm on the check handed to a security reviewer, and the next
    // person's reasonable response to it is to stop trusting the check.
    const all = sql.map((s) => s.text).join('\n');
    const restrictive = [
      ...all.matchAll(/CREATE POLICY\s+tenant_isolation\s+ON\s+(\S+)\s+AS\s+RESTRICTIVE/g),
    ];
    const permissive = [
      ...all.matchAll(/CREATE POLICY\s+tenant_access\s+ON\s+(\S+)\s+AS\s+PERMISSIVE/g),
    ];
    expect(restrictive.map((m) => m[1]).sort()).toEqual(permissive.map((m) => m[1]).sort());
    expect(restrictive.length).toBeGreaterThan(0);
  });

  it('no policy is ever USING (true)', () => {
    const all = sql.map((s) => s.text).join('\n').replace(/--[^\n]*/g, '');
    expect(all).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('every policy has an explicit WITH CHECK', () => {
    // Omitting it is a WRITE attack, not a read one: `INSERT ... tenant_id =
    // <other>` plants a row in another tenant's books, and
    // `UPDATE ... SET tenant_id = <other>` pushes one across.
    const all = sql.map((s) => s.text).join('\n');
    const policies = [...all.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0]);
    for (const p of policies) {
      expect(p, `policy without WITH CHECK:\n${p}`).toMatch(/WITH CHECK/);
    }
  });

  it('no policy inlines current_setting — all go through one function', () => {
    // The NULLIF(...,'') in tenancy.current_tenant_id() is what makes a warm
    // connection deny rather than raise 22P02. A policy that inlines
    // current_setting bypasses that and 500s in production.
    const all = sql.map((s) => s.text).join('\n');
    const policies = [...all.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0]);
    for (const p of policies) {
      expect(p).not.toMatch(/current_setting/);
      expect(p).toMatch(/tenancy\.current_tenant_id\(\)/);
    }
  });

  it('the tenant predicate handles the empty-string state', () => {
    const all = sql.map((s) => s.text).join('\n');
    expect(all).toMatch(/NULLIF\(current_setting\('app\.tenant_id', true\), ''\)/);
  });
});

describe('privileges', () => {
  const all = sql.map((s) => s.text).join('\n').replace(/--[^\n]*/g, '');

  it('never grants TRUNCATE, which is not subject to RLS', () => {
    expect(all).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(all).not.toMatch(/GRANT\s+ALL/i);
  });

  it('revokes TEMPORARY — a temp table is not subject to RLS either', () => {
    expect(all).toMatch(/REVOKE TEMPORARY ON DATABASE/i);
  });

  it('creates no role with BYPASSRLS', () => {
    // The posture stated to an auditor is that no role the application uses can
    // bypass row-level security. That has to be literally true.
    expect(all).not.toMatch(/\bBYPASSRLS\b(?!\s)/);
    for (const role of ['app_migrator', 'app_runtime', 'app_auth']) {
      expect(all).toMatch(new RegExp(`CREATE ROLE ${role}[^;]*NOBYPASSRLS`));
    }
  });

  it('grants app_runtime nothing on the connector key table', () => {
    expect(all).not.toMatch(/GRANT[^;]*tenancy\.connector_keys[^;]*app_runtime/i);
  });

  it('grants app_runtime nothing on the principal lookup table', () => {
    // The bootstrap tables are reachable only through SECURITY DEFINER
    // functions. A direct grant would give the role that serves untrusted
    // requests an unscoped view of every identity in every tenant.
    expect(all).not.toMatch(/GRANT[^;]*identity\.principal_lookup[^;]*app_runtime/i);
  });

  it('pins search_path on every SECURITY DEFINER function', () => {
    // A definer function without a pinned search_path can be hijacked by a
    // caller-controlled schema shadowing a table or operator it references.
    const definers = [...all.matchAll(/CREATE FUNCTION[\s\S]*?AS \$\$/g)].map((m) => m[0]);
    for (const fn of definers.filter((f) => /SECURITY DEFINER/.test(f))) {
      expect(fn, `SECURITY DEFINER without SET search_path:
${fn.slice(0, 200)}`).toMatch(
        /SET search_path =/,
      );
    }
  });

  it('the audit log grants no UPDATE or DELETE — append-only by privilege', () => {
    // "Append-only" asserted in a comment is worth nothing to an auditor. The
    // question is what stops someone editing it, and the answer has to be a
    // GRANT that omits UPDATE and DELETE.
    const grant = /GRANT ([A-Z, ]+) ON workflow\.audit_events TO app_runtime/.exec(all);
    expect(grant, 'no grant found for workflow.audit_events').not.toBeNull();
    expect(grant?.[1]?.trim()).toBe('SELECT, INSERT');
  });

  it('approval history is append-only, like the audit log', () => {
    // The legacy po_approval_history is rewritten when a PO is renamed and
    // deleted with the PO, so the record of who approved what disappears with
    // the thing it was approving.
    const grant = /GRANT ([A-Z, ]+) ON workflow\.approval_history TO app_runtime/.exec(all);
    expect(grant?.[1]?.trim()).toBe('SELECT, INSERT');
  });

  it('one approver cannot satisfy one stage twice, enforced in the database', () => {
    // The engine enforces this too, but an engine can be bypassed by a future
    // code path and a constraint cannot.
    expect(all).toMatch(
      /UNIQUE \(tenant_id, entity_type, entity_id, stage_name, approver_id\)/,
    );
  });

  it('the rate table ships empty — no seeded statutory value', () => {
    // CA-05 records that legacy holds two disagreeing rate tables and that
    // every value in them is stale. A plausible-looking placeholder is the
    // thing that gets mistaken for a verified figure later.
    expect(all).not.toMatch(/INSERT INTO finance\.tax_rates/i);
  });

  it('a verified rate cannot exist without its evidence', () => {
    // Otherwise `status = 'verified'` is a claim rather than a record.
    expect(all).toMatch(/status <> 'verified'[\s\S]*verified_by IS NOT NULL/);
  });

  it('never drops FORCE once a table has a tenant policy', () => {
    // `NO FORCE` returns the bypass to the table owner, which quietly undoes
    // the guarantee for migrations and definer functions.
    expect(all).not.toMatch(/NO FORCE ROW LEVEL SECURITY/i);
  });
});
