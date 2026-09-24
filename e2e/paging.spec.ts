import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { COOKIE, DEMO, ORIGIN } from "./routes.js";

/**
 * A list with more rows than a window reaches its last row, and says so.
 *
 * Every list used to answer `LIMIT 200` with `nextCursor: null`: a tenant with
 * 201 orders saw 200 and a pager that read "All 200". This test raises the
 * second tenant's projects to 250, walks the projects screen through its
 * windows by the pager's own links, and requires that the union of the
 * windows is every project and that the count printed on every window is 250.
 *
 * The second tenant, so the first tenant's demo shape is not buried under
 * two hundred and fifty synthetic projects. The rows are created through the
 * API, once — a re-run finds them there and creates none.
 */

const API = process.env["E2E_API_URL"] ?? "http://localhost:4000";
const ADMIN_B = DEMO.adminB;
const TARGET = 250;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ADMIN_B}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`,
    );
  return (await res.json()) as T;
}

interface Listed<T> {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  count: number;
}

test.beforeAll(async () => {
  test.setTimeout(600_000);
  const first = await api<Listed<{ id: string }>>("/api/v1/projects?limit=1");
  for (let n = first.count; n < TARGET; n += 1) {
    await api("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        code: `PG-${String(n).padStart(3, "0")}`,
        name: `Paging fixture ${String(n)}`,
        clientName: "Paging Fixture Client Private Limited",
        originalValue: "100000000",
      }),
    });
  }
});

async function signIn(context: BrowserContext): Promise<void> {
  const { hostname } = new URL(ORIGIN.web);
  await context.addCookies([
    {
      name: COOKIE.web,
      value: ADMIN_B,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function settled(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 90_000 });
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "detached", timeout: 90_000 })
    .catch(() => undefined);
}

test("the projects list reaches its 250th row through the pager, and every window says 250", async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  await signIn(context);

  const everything = await api<Listed<{ id: string; code: string }>>(
    "/api/v1/projects?limit=200",
  );
  const expected = everything.count;
  expect(
    expected,
    "the fixture holds at least 250 projects",
  ).toBeGreaterThanOrEqual(TARGET);

  const seen = new Set<string>();
  let url = `${ORIGIN.web}/projects`;
  let windows = 0;
  let lastRange = "";
  for (;;) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await settled(page);
    windows += 1;
    const count = await page.locator(".pager .count").first().innerText();
    // the count line on the pattern: "Total 250 projects · 50 per page · 1–50"
    expect(count, `window ${String(windows)} states the whole count`).toContain(
      `Total ${String(expected)} projects`,
    );
    lastRange = count;
    for (const code of await page
      .locator('table.tbl tbody td a[href^="/projects/"]')
      .allInnerTexts())
      seen.add(code.trim());
    const next = page.getByRole("link", { name: "Next page" });
    if ((await next.count()) === 0) break;
    const href = await next.getAttribute("href");
    expect(href).not.toBeNull();
    url = `${ORIGIN.web}${href ?? ""}`;
    expect(windows, "the walk terminates").toBeLessThan(20);
  }

  expect(
    seen.size,
    "every project was reached exactly once across the windows",
  ).toBe(expected);
  expect(lastRange, "the last window ends on the last row").toMatch(
    new RegExp(`–${String(expected)}$`),
  );
  expect(windows).toBeGreaterThan(1);

  // and back: the previous link from the last window lands on the window before it
  const prev = page.getByRole("link", { name: "Previous page" });
  expect(await prev.count()).toBe(1);
  await page.goto(`${ORIGIN.web}${(await prev.getAttribute("href")) ?? ""}`, {
    waitUntil: "domcontentloaded",
  });
  await settled(page);
  expect(await page.locator(".pager .count").first().innerText()).not.toBe(
    lastRange,
  );
});
