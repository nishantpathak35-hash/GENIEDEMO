#!/usr/bin/env node
// Apply every service's migrations, in global order, once each.
//
// One database, one ordering, one run — so this is a root script invoked
// directly (`pnpm migrate`), not a turbo task fanned out per package. Turbo
// would run it once per workspace member that declared it, which is the wrong
// shape for an operation that is global by definition. `pnpm test:isolation`
// is driven the same way, for the same reason.
//
// Connects with MIGRATION_DATABASE_URL, which points DIRECTLY at Postgres and
// never at PgBouncer (M1/D3). Transaction-mode pooling breaks DDL that needs
// session state, and advisory locks do not survive connection reuse.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { discoverMigrations, planMigrations } from './migration-plan.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set. Refusing to guess.');
  process.exit(1);
}
if (process.env['MIGRATION_DATABASE_URL'] === undefined) {
  console.warn('warning: falling back to DATABASE_URL. Migrations must not run through PgBouncer.');
}

const migrations = planMigrations(discoverMigrations(join(REPO, 'services')));

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query('CREATE SCHEMA IF NOT EXISTS migrations');
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations.applied (
      id         text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query('SELECT id FROM migrations.applied');
  const done = new Set(rows.map((r) => r.id));

  let applied = 0;
  for (const { id: file, path } of migrations) {
    if (done.has(file)) continue;
    // Each migration is its own transaction: a failure leaves earlier ones
    // applied and recorded, so a re-run resumes rather than restarting.
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(path, 'utf8'));
      await client.query('INSERT INTO migrations.applied (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      applied += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`FAILED ${file}: ${(/** @type {Error} */ (error)).message}`);
      throw error;
    }
  }
  console.log(applied === 0 ? 'migrations: already up to date' : `migrations: applied ${applied}`);
} finally {
  await client.end();
}
