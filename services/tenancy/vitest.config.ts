import { defineConfig } from 'vitest/config';

// Two projects, because they have very different costs and one of them is the
// artifact handed to a security reviewer.
//
//   unit      — static audit of the migration SQL. No database. Seconds.
//   isolation — real Postgres behind PgBouncer via Testcontainers. Never skipped.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/*.test.ts'],
        },
      },
      {
        test: {
          name: 'isolation',
          include: ['tests/isolation/*.test.ts'],
          testTimeout: 180_000,
          hookTimeout: 300_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
