import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **No app computes money, and no app decides a permission.**
 *
 * ADR-0014's authority inversion, as a test rather than a review habit:
 *
 * > The server computes every monetary figure and every permission. Clients
 * > display.
 *
 * The legacy violates this in both directions — 42 of its 88 view files are
 * `'use client'`, TDS is computed in the browser (`POsView.js:50`), and roles
 * are derived there (`POsView.js:136`, `PaymentsView.js:118`). A faithful port
 * would carry both holes through a fully typed pipeline, which is exactly the
 * failure that looks like success.
 *
 * This check exists **before** the view port rather than after it, because the
 * cost of finding a violation is proportional to how many views already copied
 * the pattern.
 *
 * What an app may legitimately do with money: hand the `PaiseWire` string to
 * `formatIndianRupees` in `@cog/money`, which takes the wire string rather than
 * a `Paise` precisely so that reaching for a formatter never puts a money type
 * — and therefore a multipliable `bigint` — inside an app. That is a format,
 * not an arithmetic, and it is the only permitted use.
 *
 * The scan is deliberately over raw text, comments included. A formula quoted
 * in a comment is still a formula in the file, and the legacy's expressions are
 * exactly what a port is tempted to paste in beside the thing replacing them —
 * so they get described in words here, with a `file:line`, and not reproduced.
 */

const REPO = join(import.meta.dirname, '../../..');
const APPS = join(REPO, 'apps');

const MONEY_WORDS =
  'amount|rate|total|gst|tds|price|value|cost|margin|paise|rupee|taxable|gross|net|payable|retention';

/**
 * Arithmetic on something money-shaped, and rounding of any kind.
 *
 * `Math.round` and `toFixed` are banned outright rather than only near a money
 * word: rounding is a **statutory boundary** in this domain (Sec 170, Sec 288B)
 * and every one of them is a named function in `packages/money`. A rounding
 * decision taken in a browser is a rounding decision taken by nobody.
 */
/**
 * JSX tag syntax is excluded from the two division patterns, and only JSX.
 *
 * `<TaxRateForm />` read as a money-shaped name divided by something, and
 * `</TotalRow>` would have read the same way. Neither is arithmetic: `/>` and
 * `</` are tag syntax, and a division whose operator is followed by `>`, or
 * preceded by `<`, does not parse as JavaScript at all. So the two lookarounds
 * cost nothing in detection — `total / 2` and `2 / totalPaise` still fire, and
 * there is no spelling of a real division they let through.
 *
 * The alternative was to rename the component, which would have left the guard
 * quietly wrong about what it forbids: the next person to write `<RateCard />`
 * would hit the same false positive and reach for the same workaround.
 */
const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: new RegExp(`\\b\\w*(?:${MONEY_WORDS})\\w*\\s*(?:\\*|/(?!>))\\s*`, 'i'),
    why: 'multiplies or divides a money-shaped value; only packages/money may (ADR-0012)',
  },
  {
    pattern: new RegExp(`(?:\\*|(?<!<)/)\\s*\\w*(?:${MONEY_WORDS})\\w*\\b`, 'i'),
    why: 'multiplies or divides by a money-shaped value; only packages/money may (ADR-0012)',
  },
  {
    pattern: /\.toFixed\s*\(/,
    why: 'rounds. Every rounding boundary here is statutory and named in packages/money',
  },
  {
    pattern: /Math\.round\s*\(|Math\.floor\s*\(|Math\.ceil\s*\(/,
    why: 'rounds. Every rounding boundary here is statutory and named in packages/money',
  },
  {
    pattern: /parseFloat\s*\(/,
    why: 'parseFloat on a monetary string is how money becomes a float (ADR-0012)',
  },
  {
    pattern: /\b(?:isAdmin|isDirector|isFinance|isSuperAdmin|canApprove|canRemit|canCreate)\b/,
    why: 'derives a permission client-side; the server decides (ADR-0014)',
  },
  {
    pattern: /\brole\s*===|\broles\s*\.\s*includes\s*\(/,
    why: 'derives a permission client-side; the server decides (ADR-0014)',
  },
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', 'dist', '.turbo'].includes(entry.name)) continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments and string literals — a rule quoted in prose is not a violation. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('apps compute nothing', () => {
  const files = sourceFiles(APPS);

  it('finds app sources to check', () => {
    // A check that silently examines nothing is worse than no check — which is
    // the defect recorded as TOOLING-DEFECTS 6.
    expect(files.length).toBeGreaterThan(0);
  });

  /**
   * The guard's own patterns, tested.
   *
   * A check that has been loosened is worth exactly as much as the proof that
   * it still catches what it was loosened around. The JSX lookarounds went in
   * because `<TaxRateForm />` tripped the division rule; these cases assert
   * that real arithmetic on the same names still trips it.
   */
  it.each([
    ['totalPaise / 2', true],
    ['amount * qty', true],
    ['const gst = taxable* 18', true],
    ['2 / totalPaise', true],
    ['qty * ratePaise', true],
    ['<TaxRateForm />', false],
    ['<RateCard />', false],
    ['</TotalRow>', false],
    ['formatIndianRupees(order.totalPaise)', false],
  ])('the division patterns read %s as arithmetic: %s', (source, arithmetic) => {
    const hit = FORBIDDEN.slice(0, 2).some(({ pattern }) => pattern.test(source));
    expect(hit).toBe(arithmetic);
  });

  it.each(FORBIDDEN)('no app file $why', ({ pattern }) => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      const match = pattern.exec(code);
      if (match !== null) offenders.push(`${relative(REPO, file)}: ${match[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the check itself catches a violation', () => {
    // Seen to fail, or it is decoration. These are real lines from the legacy
    // tree, quoted here as the thing that must never appear under apps/.
    const gstInBrowser = 'const gst = Math.round(gross * gstRate / 100);';
    const roleInBrowser = 'const isDirector = session.roles.includes("director");';

    expect(FORBIDDEN.some((f) => f.pattern.test(codeOnly(gstInBrowser)))).toBe(true);
    expect(FORBIDDEN.some((f) => f.pattern.test(codeOnly(roleInBrowser)))).toBe(true);
  });

  it('permits formatting money for display', () => {
    // The one legitimate use. It must not be caught, or the check would push
    // people to bypass it.
    const formatting = 'const shown = toRupeeString(fromWire(data.gross));';
    expect(FORBIDDEN.some((f) => f.pattern.test(codeOnly(formatting)))).toBe(false);
  });
});

/** Kept honest: `apps/` must actually exist where this test thinks it does. */
describe('the path is right', () => {
  it('apps/ is a directory', () => {
    expect(statSync(APPS).isDirectory()).toBe(true);
  });
});
