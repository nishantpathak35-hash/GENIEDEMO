import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs script outside every tsconfig `include`, so
// tsc has no declarations for it. STILL NECESSARY after tests were brought
// into typecheck (defect 17): the typecheck config covers src/ and tests/,
// and `scripts/` is neither. Vitest resolves it at runtime.
import { discoverMigrations, planMigrations, MigrationPlanError } from '../../../scripts/migration-plan.mjs';

/**
 * **Migrations are ordered globally, across services, and an ambiguous plan is
 * refused.**
 *
 * The runner has had this behaviour since M1 and nothing proved it. That
 * mattered less while one service owned every migration; it stops being
 * academic now, because the schema work ahead adds a dozen migrations across
 * five services and the ordering between them is what makes a foreign key
 * resolvable.
 *
 * The ordering test lives here rather than in a service because the property is
 * global: no single service can assert something about all the others without
 * becoming their owner, which is the defect that moved this runner to the repo
 * root in the first place.
 */

const REPO = join(import.meta.dirname, '../../..');

interface Migration {
  id: string;
  service: string;
  path: string;
}

const synthetic = (id: string, service: string): Migration => ({ id, service, path: `/${service}/${id}` });

describe('global ordering', () => {
  it('orders by numeric prefix across different services', () => {
    const plan = planMigrations([
      synthetic('0004_tally.sql', 'finance'),
      synthetic('0001_roles.sql', 'tenancy'),
      synthetic('0006_audit.sql', 'workflow'),
      synthetic('0002_tenants.sql', 'tenancy'),
    ]) as Migration[];

    expect(plan.map((m) => m.id)).toEqual([
      '0001_roles.sql',
      '0002_tenants.sql',
      '0004_tally.sql',
      '0006_audit.sql',
    ]);
  });

  it('sorts 0010 after 0009, not before it', () => {
    // The boundary where a naive numeric-looking sort breaks. Zero padding is
    // what keeps lexicographic and numeric order the same, so this asserts the
    // padding convention as much as the sort.
    const plan = planMigrations([
      synthetic('0010_later.sql', 'projects'),
      synthetic('0009_earlier.sql', 'procurement'),
      synthetic('0002_first.sql', 'tenancy'),
    ]) as Migration[];

    expect(plan.map((m) => m.id)).toEqual([
      '0002_first.sql',
      '0009_earlier.sql',
      '0010_later.sql',
    ]);
  });

  it('does not depend on the order the filesystem returned', () => {
    const forwards = [synthetic('0001_a.sql', 'x'), synthetic('0002_b.sql', 'y')];
    const backwards = [...forwards].reverse();
    expect((planMigrations(backwards) as Migration[]).map((m) => m.id)).toEqual(
      (planMigrations(forwards) as Migration[]).map((m) => m.id),
    );
  });
});

describe('a duplicate prefix is refused', () => {
  it('throws rather than picking one', () => {
    // Two migrations claiming one slot would otherwise apply in filesystem
    // order, so the resulting schema would differ between a developer's
    // machine and CI.
    expect(() =>
      planMigrations([
        synthetic('0004_tally.sql', 'finance'),
        synthetic('0004_projects.sql', 'projects'),
      ]),
    ).toThrow(MigrationPlanError);
  });

  it('names both offenders, because the point is to fix it', () => {
    try {
      planMigrations([
        synthetic('0004_tally.sql', 'finance'),
        synthetic('0004_projects.sql', 'projects'),
      ]);
      expect.unreachable('should have thrown');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('0004');
      expect(message).toContain('finance/0004_tally.sql');
      expect(message).toContain('projects/0004_projects.sql');
    }
  });
});

describe('the real repository', () => {
  const real = planMigrations(discoverMigrations(join(REPO, 'services'))) as Migration[];

  it('discovers migrations from more than one service', () => {
    // Guards the discovery walk itself: a wrong `services/` path would return
    // an empty list and every assertion below would pass vacuously.
    expect(real.length).toBeGreaterThan(0);
    expect(new Set(real.map((m) => m.service)).size).toBeGreaterThan(1);
  });

  it('has a strictly increasing prefix sequence with no gaps in ownership', () => {
    const prefixes = real.map((m) => Number(m.id.slice(0, 4)));
    for (let i = 1; i < prefixes.length; i += 1) {
      expect(prefixes[i]!).toBeGreaterThan(prefixes[i - 1]!);
    }
  });

  it('names every file with a four-digit prefix', () => {
    // The runner slices the first four characters whatever they are, so a file
    // named `add_foo.sql` would silently claim the prefix `add_`.
    const badly = real.filter((m) => !/^\d{4}_/.test(m.id)).map((m) => `${m.service}/${m.id}`);
    expect(badly).toEqual([]);
  });
});
