// Discovering and ordering the migrations. No SQL, no database, no I/O beyond
// reading directory names — so the ordering rule can be tested without one.
//
// This lives at the repo root rather than inside a service. Every service owns
// its own migrations (TOPOLOGY), but they share ONE database and therefore one
// global ordering, so the thing that computes that ordering cannot belong to
// any single service. It previously lived in `services/tenancy/scripts/` while
// reading five other services' directories, which made tenancy the de facto
// schema owner for the whole system.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {object} Migration
 * @property {string} id       the filename, e.g. `0003_identity_principals.sql`
 * @property {string} service  the owning service directory name
 * @property {string} path     absolute path to the file
 */

export class MigrationPlanError extends Error {}

/**
 * Read every service's migration directory.
 *
 * @param {string} servicesDir absolute path to `services/`
 * @returns {Migration[]} in filesystem order — call `planMigrations` to order them
 */
export function discoverMigrations(servicesDir) {
  /** @type {Migration[]} */
  const found = [];
  for (const service of readdirSync(servicesDir)) {
    const dir = join(servicesDir, service, 'src/infrastructure/migrations');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.sql')) found.push({ id: file, service, path: join(dir, file) });
    }
  }
  return found;
}

/**
 * Order migrations globally by numeric prefix, and refuse an ambiguous plan.
 *
 * The prefix is global across services, not per service: `0004_` in finance
 * runs after `0003_` in tenancy because finance's tables reference tenancy's.
 * Sorting is on the zero-padded four-digit prefix, where lexicographic and
 * numeric order coincide — `0010` sorts after `0009`, which is the boundary
 * this repository is about to cross.
 *
 * A duplicate prefix throws rather than picking one. Two migrations claiming
 * the same slot would otherwise apply in filesystem order, which differs
 * between a developer's machine and CI — so the schema would depend on which
 * machine ran it.
 *
 * @param {Migration[]} found
 * @returns {Migration[]} ordered
 */
export function planMigrations(found) {
  const ordered = [...found].sort((a, b) => a.id.localeCompare(b.id));

  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const m of ordered) {
    const prefix = m.id.slice(0, 4);
    const previous = seen.get(prefix);
    if (previous !== undefined) {
      throw new MigrationPlanError(
        `two migrations claim prefix ${prefix}: ${previous} and ${m.service}/${m.id}`,
      );
    }
    seen.set(prefix, `${m.service}/${m.id}`);
  }
  return ordered;
}
