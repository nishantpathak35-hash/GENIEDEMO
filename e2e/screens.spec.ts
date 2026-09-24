import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { COOKIE, CREDENTIAL, DEMO, ORIGIN, SCREENS, SCREEN_COUNT, type AppName, type Screen } from './routes.js';

/**
 * One smoke test per screen. 59 of them today; the first 39 had never rendered
 * at all when this suite was written. Plus two guards on the suite itself, so
 * `pnpm test:e2e` is 61 tests.
 *
 * What each asserts:
 *
 *   1. the response is 200 — not a redirect to sign-in, not a 500
 *   2. no uncaught console error and no page error
 *   3. no Next.js error overlay / React error boundary
 *   4. something proving the DATA arrived — a row, a seeded value, or an
 *      explicit empty state — rather than just the shell
 *   5. **no raw paise anywhere on the page**
 *   5b. **nor in an editable field**, which assertion 5 cannot see — an
 *      `<input value>` is not `innerText`, and that gap hid a live ×100 defect
 *   6. CA-gated surfaces render their gated state and no figure
 *
 * (5) is the one that needs a browser. `1233912` where ₹12,339.12 is meant
 * passes `tsc` and passes `eslint`: a `PaiseWire` is a string and printing a
 * string is type-correct. The money rule has no other enforcement at the point
 * of display.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const ADMIN = DEMO.admin;

// ── the seeded fixture, resolved once ──────────────────────────────────────

interface Fixture {
  projectId: string;
  boqItemId: string;
  purchaseOrderId: string;
  vendorId: string;
  leadId: string;
  clientProjectId: string;
  /** Paise integers that appear in the seeded data, as bare digit strings. */
  rawPaise: string[];
  /**
   * The subset of those that only the design-build screens render.
   *
   * Counted separately and asserted separately. `rawPaise` clears its
   * non-vacuity bar on project values and purchase-order totals alone, so if
   * the design-build seed silently stopped producing money, assertion 5 would
   * go on passing while checking nothing on eleven screens — the same shape as
   * defect 6, one layer further in.
   */
  designBuildPaise: string[];
}

let fixture: Fixture;

async function api<T>(path: string, credential = ADMIN): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${credential}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

test.beforeAll(async () => {
  type List<T> = { items: T[] };
  const projects = await api<List<{ id: string; originalValue: string | null }>>('/api/v1/projects');
  const project = projects.items[0];
  if (project === undefined) throw new Error('no seeded projects — run the seed first');

  const boq = await api<List<{ id: string }>>(`/api/v1/projects/${project.id}/boq`);
  const orders = await api<List<{ id: string; gross: string }>>('/api/v1/purchase-orders');
  const vendors = await api<List<{ id: string }>>('/api/v1/purchase-orders/vendors');
  const leads = await api<List<{ id: string }>>('/api/v1/projects/leads');
  const clientProjects = await api<List<{ id: string }>>(
    '/api/v1/portal/client/projects',
    CREDENTIAL['client-portal'],
  );

  // Design-build money. These come from the project the screens are resolved
  // against, not from an arbitrary one, because that is the project whose
  // brief, agreement and selections will actually be rendered.
  const briefs = await api<List<{ budgetMinPaise: string | null; budgetMaxPaise: string | null }>>(
    `/api/v1/design-build/brief/projects/${project.id}`,
  );
  const agreement = await api<{
    agreement: {
      contractValuePaise: string | null;
      stages: { amountPaise: string | null }[];
    } | null;
  }>(`/api/v1/design-build/agreement/projects/${project.id}`);
  const selections = await api<List<{ unitPricePaise: string | null }>>(
    `/api/v1/design-build/selections/projects/${project.id}`,
  );

  const isWire = (value: unknown): value is string =>
    typeof value === 'string' && /^-?\d{5,}$/.test(value);

  // Rate-contract money. The contracts screen renders a contracted rate, an
  // ordered rate and a deviation; without these in `rawPaise` both money guards
  // pass on it while checking nothing.
  const contracts = await api<List<{ id: string }>>('/api/v1/purchase-orders/rate-contracts');
  const deviations = await api<
    List<{ contractedUnitRatePaise: string; actualUnitRatePaise: string }>
  >('/api/v1/purchase-orders/rate-deviations');
  const ratePaise = [
    ...deviations.items.flatMap((d) => [d.contractedUnitRatePaise, d.actualUnitRatePaise]),
  ];
  void contracts;

  const designBuildPaise = [
    ...briefs.items.flatMap((b) => [b.budgetMinPaise, b.budgetMaxPaise]),
    agreement.agreement?.contractValuePaise ?? null,
    ...(agreement.agreement?.stages ?? []).map((s) => s.amountPaise),
    ...selections.items.map((s) => s.unitPricePaise),
  ].filter(isWire);

  const require1 = <T>(list: T[], what: string): T => {
    const first = list[0];
    if (first === undefined) throw new Error(`the seed produced no ${what}`);
    return first;
  };

  fixture = {
    projectId: project.id,
    boqItemId: require1(boq.items, 'BOQ items').id,
    purchaseOrderId: require1(orders.items, 'purchase orders').id,
    vendorId: require1(vendors.items, 'vendors').id,
    leadId: require1(leads.items, 'leads').id,
    clientProjectId: require1(clientProjects.items, 'client-visible projects').id,
    // Every money figure the API returns for these, as the wire string. If one
    // of these appears verbatim in rendered text, a component printed the wire
    // form instead of formatting it.
    rawPaise: [
      ...projects.items.map((p) => p.originalValue),
      ...orders.items.map((o) => o.gross),
      ...designBuildPaise,
      ...ratePaise,
    ].filter(isWire),
    designBuildPaise,
  };
});

function resolve(pattern: string): string {
  return pattern
    .replace('[projectId]', fixture.projectId)
    .replace('[itemId]', fixture.boqItemId)
    .replace('[id]', fixture.purchaseOrderId)
    .replace('[vendorId]', fixture.vendorId)
    .replace('[leadId]', fixture.leadId);
}

/** The client portal's `[projectId]` is a different id space — its own link. */
function resolveFor(screen: Screen): string {
  if (screen.app === 'client-portal') {
    return screen.pattern.replace('[projectId]', fixture.clientProjectId);
  }
  return resolve(screen.pattern);
}

/**
 * The streamed content has arrived: no request in flight for half a second —
 * or thirty seconds of the network never going idle, which a dev server's
 * open socket or a busy host can produce (the admin sign-in page did, fully
 * rendered, on 2026-09-20) — and then no `aria-busy` skeleton on the page.
 * What follows asserts the content, so a page that never went idle is judged
 * on what it rendered, not failed on the wait.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 90_000 }).catch(() => undefined);
}

async function signIn(context: BrowserContext, app: AppName): Promise<void> {
  const { hostname } = new URL(ORIGIN[app]);
  await context.addCookies([
    {
      name: COOKIE[app],
      value: CREDENTIAL[app],
      domain: hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/** Console errors and uncaught exceptions, collected for the whole navigation. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Next.js dev emits a benign preload warning and telemetry noise; neither
    // is an application error. Everything else counts.
    if (/favicon|Download the React DevTools|preloaded using link preload/i.test(text)) return;
    problems.push(`console.error: ${text}`);
  });
  page.on('pageerror', (error) => {
    // React's dev-only performance tracks throw on a container clock ahead of
    // the browser's — TOOLING-DEFECTS 23, not a page's fault
    if (!/'measure' on 'Performance'.*negative time stamp/.test(error.message)) problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

// ── the guard on the guard ─────────────────────────────────────────────────

test('covers every screen in the repo', () => {
  expect(
    SCREENS.length,
    `Found ${SCREENS.length} page.tsx files, expected ${SCREEN_COUNT}. ` +
      'A screen was added or removed: cover it here and update SCREEN_COUNT, ' +
      'or this suite silently stops being a full sweep.',
  ).toBe(SCREEN_COUNT);

  // The raw-paise check must have something to look for.
  //
  // If `rawPaise` is empty — a renamed API field, an unseeded database — then
  // assertion 5 passes on every screen while checking nothing, and the suite
  // reports 59 green having verified the one thing it exists for zero times.
  // That is defect 6 exactly, so it is asserted rather than assumed.
  expect(
    fixture.rawPaise.length,
    'no seeded money values were resolved, so the raw-paise assertion is vacuous',
  ).toBeGreaterThan(10);
  expect(fixture.rawPaise.every((v) => /^-?\d{5,}$/.test(v))).toBe(true);

  // And the same question again for the money only the design-build screens
  // render. The brief's budget, the contract value, its four stage amounts and
  // three selection prices are the figures those eleven screens print, and
  // none of them is reachable from a project value or an order total — so
  // without their own count they would be covered by an assertion that had
  // nothing of theirs to look for.
  expect(
    fixture.designBuildPaise.length,
    'the design-build seed produced no money, so the raw-paise assertion is ' +
      'vacuous on the brief, commercials and selections screens',
  ).toBeGreaterThan(5);

  // Every dynamic segment must have a concrete id, or its screen is "covered"
  // by a URL containing a literal "[projectId]" that 404s.
  const known = ['[projectId]', '[itemId]', '[id]', '[vendorId]', '[leadId]'];
  const unresolved = SCREENS.flatMap((s) => s.pattern.match(/\[[^\]]+\]/g) ?? []).filter(
    (p) => !known.includes(p),
  );
  expect(unresolved, 'a dynamic segment has no seeded id in resolveParams').toEqual([]);
});

/**
 * The positive half of the money assertion.
 *
 * Every per-screen test asserts money is NOT rendered raw, which a page with no
 * money on it satisfies for free. This one asserts a specific seeded figure IS
 * rendered, correctly grouped, on a specific screen — so "no raw paise" is
 * backed by a screen that demonstrably shows money and shows it properly.
 *
 * ₹61,00,00,000.00 rather than ₹610,000,000.00: Indian grouping puts the first
 * separator after three digits and every later one after two.
 */
test('the projects screen renders a seeded value as grouped rupees', async ({ page, context }) => {
  await signIn(context, 'web');
  // the Contract column is reference (p3) and folds under an 1100px container: a desktop width keeps it drawn
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN.web}/projects`, { waitUntil: 'domcontentloaded' });
  await settled(page);
  const body = await page.locator('body').innerText();

  const projects = await api<{ items: { name: string; originalValue: string | null }[] }>(
    '/api/v1/projects',
  );
  // A project with no contract value yet has no figure to look for.
  const shown = projects.items.find((p) => p.originalValue !== null && body.includes(p.name));
  expect(shown, 'no seeded project name appeared on the projects screen').toBeDefined();

  const paise = BigInt(shown!.originalValue!);
  const rupees = paise / 100n;
  const grouped = `${rupees}`.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,');
  expect(body, `expected the formatted value for ${shown!.name}`).toContain(
    `₹${grouped}.${`${paise % 100n}`.padStart(2, '0')}`,
  );
  expect(body).not.toContain(shown!.originalValue!);
});

/**
 * The vendor picker displays a NAME and submits an ID.
 *
 * This is the one assertion that cannot be made from the type system. A picker
 * that submitted the typed text would compile, render identically, and key a
 * rate contract by a vendor name — the `LIKE '%…%'` identity model this rebuild
 * removed, reintroduced by the component written to remove it.
 *
 * So: the field that carries `vendorId` is a `<select>` (its value can only be
 * one of its own options), every option value is a uuid, at least one option
 * shows a seeded vendor's name, and the search box beside it has NO `name` —
 * it is a filter, and a named filter would put a typed string in the payload
 * next to the id where the two can disagree.
 */
test('the vendor picker submits an id and never a name', async ({ page, context }) => {
  await signIn(context, 'web');
  // the form is behind the list's primary action (`?new=1`), on the pattern
  await page.goto(`${ORIGIN.web}/vendors/rate-contracts?new=1`, { waitUntil: 'domcontentloaded' });
  await settled(page);

  const field = page.locator('select[name="vendorId"]');
  await expect(field).toHaveCount(1);

  const values = (await field.locator('option').evaluateAll((els) =>
    els.map((el) => (el as HTMLOptionElement).value),
  )).filter((v) => v !== '');
  expect(values.length, 'the picker offered no vendors').toBeGreaterThan(0);

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const value of values) {
    expect(value, `option value "${value}" is not an id`).toMatch(UUID);
  }

  // The names are shown, so this is a picker and not a list of uuids.
  const labels = await field.locator('option').allInnerTexts();
  const vendors = await api<{ items: { id: string; name: string }[] }>(
    '/api/v1/purchase-orders/vendors',
  );
  const seeded = vendors.items[0];
  expect(seeded, 'no seeded vendor to check the picker against').toBeDefined();
  expect(labels.some((l) => l.includes(seeded!.name))).toBe(true);
  // ...and no option is LABELLED with the id, which would defeat the point.
  expect(labels.some((l) => l.includes(seeded!.id))).toBe(false);

  // Nothing but the select is submitted for this field.
  await expect(page.locator('input[name="vendorId"]')).toHaveCount(0);
  await expect(page.locator('input[type="search"][name]')).toHaveCount(0);
});

// ── one test per screen ────────────────────────────────────────────────────

for (const screen of SCREENS) {
  test(`${screen.app} ${screen.pattern} renders`, async ({ page, context }) => {
    const isSignIn = screen.pattern === '/sign-in';
    if (!isSignIn) await signIn(context, screen.app);

    const problems = watch(page);
    const url = `${ORIGIN[screen.app]}${resolveFor(screen)}`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

    // 1. it answered, and answered 200.
    expect(response, `no response from ${url}`).not.toBeNull();
    expect(response!.status(), `${screen.file} → HTTP ${response!.status()}`).toBe(200);

    // 1b. and the DATA arrived, not the placeholder for it. Every list route
    //     streams a `loading.tsx` skeleton first; reading the body at
    //     DOMContentLoaded reads that skeleton — a table with rows, no money on
    //     it — and every assertion below passes against nothing. So wait for
    //     the stream to settle and require that no skeleton is left standing.
    await settled(page);
    await expect(
      page.locator('[aria-busy="true"]'),
      `${screen.file} is still showing a loading skeleton after the stream settled`,
    ).toHaveCount(0);

    // A signed-in screen that redirected to /sign-in rendered, but rendered the
    // wrong thing — and would pass every other assertion here.
    if (!isSignIn) {
      expect(new URL(page.url()).pathname, `${screen.file} redirected to sign-in`).not.toBe(
        '/sign-in',
      );
    }

    // 2 & 3. no error boundary, no error overlay.
    //
    // NOT `expect(locator('nextjs-portal')).toHaveCount(0)`. That element is
    // the dev-tools button and is on every page in development, so the
    // assertion was really a race: it passed on screens that rendered before
    // the indicator mounted and failed on the six slowest. Six red screens that
    // were all rendering correctly, including the CA-gated retention notice.
    //
    // The overlay is identified by what it SAYS instead, which does not depend
    // on the internals of a dev-tools element that changes between versions.
    const portal = page.locator('nextjs-portal');
    if ((await portal.count()) > 0) {
      const overlay = await portal.first().innerText();
      expect(overlay, `${screen.file} has a Next.js error overlay: ${overlay}`).not.toMatch(
        /issue|error|exception|failed to compile/i,
      );
    }
    const body = await page.locator('body').innerText();
    expect(body, `${screen.file} rendered a Next.js error page`).not.toMatch(
      /Application error: a server-side exception|Unhandled Runtime Error|This page could not be found/i,
    );

    // 3b. THE SCREEN IS NOT AN ERROR STATE DRESSED AS A PAGE.
    //
    // This assertion is here because its absence made the whole suite
    // worthless once already. Running in containers, every app resolved the API
    // at `localhost:4000` — which inside a container is the container — so all
    // 39 screens rendered "The API is not reachable": HTTP 200, a heading, a
    // paragraph, no console error, and no raw money on them BECAUSE THERE WAS
    // NO DATA AT ALL. Every other assertion below passed. The suite reported 39
    // green having rendered 39 error notices.
    //
    // A degraded state is a legitimate thing for the app to show a human. It is
    // never a legitimate thing for this suite to accept.
    expect(body, `${screen.file} rendered a degraded state, not the screen`).not.toMatch(
      /The API is not reachable|Nothing was read and nothing was written|could not be loaded/i,
    );

    // 4. the data arrived. A shell with nothing in it is the failure mode a
    //    200 does not catch, so require either real content or a stated
    //    absence — `AbsentNotice` renders `.notice.absent`, and an explicit
    //    empty state is a legitimate answer for a screen whose table is empty.
    //    A list's rows (`.list li`) and a hub's cards (`.hub-card`) are content too — the activity log is a
    //    list, and the settings hub is nothing but cards.
    const substantive =
      (await page.locator('table tbody tr, .notice.absent, .empty, form, article, .kcard, .list li, .hub-card').count()) > 0;
    expect(substantive, `${screen.file} rendered a shell with no content`).toBe(true);
    expect(body.trim().length, `${screen.file} rendered almost nothing`).toBeGreaterThan(40);

    // 5. NO RAW PAISE. The assertion this whole suite is worth writing for.
    for (const raw of fixture.rawPaise) {
      expect(
        body.includes(raw),
        `${screen.file} printed the raw paise string ${raw} — money must be formatted ` +
          'at display (ADR-0012). Use formatIndianRupees on the wire value.',
      ).toBe(false);
    }

    // 5b. NOR IN A FIELD SOMEBODY CAN EDIT.
    //
    // Assertion 5 reads `innerText`, and an `<input value>` is not innerText.
    // That blind spot hid a live defect: two design-build forms handed
    // `MoneyField` — labelled *rupees, up to two decimals* — the `PaiseWire`
    // straight from the API. A digit string either way, so it typechecked, it
    // linted, it rendered as a plausible number, and saving it re-read those
    // digits as rupees and multiplied the amount by a hundred. Per round trip.
    //
    // It only surfaced because the seed started putting real money on those
    // screens. Reading the values closes the hole rather than relying on that
    // happening again.
    //
    // `input, textarea, select` rather than `input`: no money renders in a
    // textarea or a select today, and that is an OBSERVATION about the screens
    // that exist rather than a property of the system. A note field that
    // prefills a figure, or a select whose option values are amounts, would sit
    // in exactly the blind spot this assertion was written to close.
    const fieldValues = await page
      .locator('input, textarea, select')
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value,
        ),
      );
    for (const raw of fixture.rawPaise) {
      const found = fieldValues.find((value) => value === raw);
      expect(
        found,
        `${screen.file} put the raw paise string ${raw} in an editable field ` +
          '(input, textarea or select) — a money field holds RUPEES. ' +
          'Use formatRupeesOrEmpty on the wire value.',
      ).toBeUndefined();
    }

    // 6. where money IS shown, it is shown as rupees.
    if (/₹/.test(body)) {
      expect(body, `${screen.file} shows ₹ but not in Indian grouping`).toMatch(
        /₹\s?-?[\d,]+\.\d{2}/,
      );
    }

    expect(problems, `${screen.file} logged errors:\n${problems.join('\n')}`).toEqual([]);
  });
}
