import { defineConfig, devices } from '@playwright/test';

/**
 * Browser coverage for 39 screens that had never rendered.
 *
 * Every screen in this repo typechecks, lints, and has its server actions
 * exercised through the API. Not one had been shown to *render* — which leaves
 * a class of defect that nothing else here can see. The one that matters most
 * is money: `lint` and `tsc` both pass on a cell that prints `1233912` where it
 * means ₹12,339.12, because a `PaiseWire` is a string and printing a string is
 * type-correct. Only a browser catches it.
 *
 * **Smoke, not journeys.** One test per screen: it renders, it does not throw,
 * and something on it proves the DATA arrived rather than just the shell.
 * Depth comes later; coverage comes now.
 *
 * The apps run on four origins because they are four deployables (ADR: a staff
 * session and a vendor session must not be one cookie apart). `baseURL` is left
 * unset for that reason — each test names its own origin.
 */

const CI = process.env['CI'] === 'true';
const SHARD = process.env['E2E_SHARD'];

export default defineConfig({
  testDir: './e2e',
  // The suite is deliberately serial-ish: it runs against ONE seeded database,
  // and the seed is the fixture. Parallel workers would still be read-only —
  // every assertion below is a GET — but four browsers against one dev-mode
  // Next.js server mostly queue on compilation anyway.
  workers: CI ? 2 : 4,
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  // A cold Next.js dev server compiles each route on first request, and that is
  // genuinely slow — 9s was observed for `/`. This timeout is for compilation,
  // not for the application.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // `scripts/e2e.mjs` runs the suite one shard per process and names each with
  // E2E_SHARD, so every shard keeps its own HTML report and writes the JSON
  // report the runner reads its counts from.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `e2e/report${SHARD === undefined ? '' : `/shard-${SHARD}`}` }],
    ['json', { outputFile: `e2e/results/shard-${SHARD ?? '1'}.json` }],
  ],
  outputDir: 'e2e/results',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    // Deterministic seed, deterministic screenshots.
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
