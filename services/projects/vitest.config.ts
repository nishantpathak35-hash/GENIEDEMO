import { defineConfig } from 'vitest/config';

// Two projects, because they have very different costs.
//
//   unit      — domain calculations. No database. Seconds.
//   isolation — every tenant table proved isolated against real Postgres
//               behind PgBouncer via Testcontainers. Never skipped.
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
          hookTimeout: 600_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
