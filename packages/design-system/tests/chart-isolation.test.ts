import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * A chart mark is never coloured by condition — a series carries identity in
 * `--series-1/2/3`, and the allowed exception set is `--chart-point-bad`,
 * `--chart-threshold`, `--chart-band`, `--track`, `--panel`, `--ink*`,
 * `--line*`. This is the gate that keeps `chart.tsx` and the chart rules in `styles.css` from
 * quietly growing a `--ok`/`--warn`/`--bad`/`--waiting`/`--accent` reference
 * or an unlisted `-soft` fill, the way `.stat`/`.hero` legitimately do a few
 * lines away in the same stylesheet.
 *
 * `chart.tsx` has no CSS of its own — a whole-file scan is enough, because
 * nothing in it has a legitimate reason to hold one of these names. The
 * stylesheet is different: `.stat .d.up b { color: var(--ok); }` sits in the
 * same file on purpose (Stat's own status colour, not a chart mark), so the
 * check on `styles.css` isolates only the rules whose selector touches
 * `.spark`, `.meter` or `.chart` before it looks for a forbidden token —
 * scanning the whole file would fail on Stat's own correct CSS.
 */

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(TESTS_DIR, '../src/styles.css');
const CHART_TSX_PATH = join(TESTS_DIR, '../src/chart.tsx');
const GRAMMAR_TSX_PATH = join(TESTS_DIR, '../src/chart-grammar.tsx');

// A double-dash prefix, so `--chart-point-bad`, `--chart-band` and
// `--on-accent` (single dashes past the first pair) are not mistaken for
// `--bad` / `--band` / `--accent`.
const FORBIDDEN_NAME = /--(ok|warn|bad|waiting|accent)\b/;
// Any OTHER `-soft` fill — `--ink-soft` is the one explicitly allowed
// (`--ink*` is in the chart allowlist), so it is excluded here rather than
// left to slip through a check that only looked for the five names above.
const FORBIDDEN_SOFT = /--(?!ink-soft\b)[a-z][\w-]*-soft\b/;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

interface CssRule {
  readonly selector: string;
  readonly body: string;
}

/** Flattens `@media { … }` (and any other at-rule) into its inner rules. */
function extractRules(css: string, out: CssRule[] = []): CssRule[] {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const selector = css.slice(i, open).trim();
    let depth = 0;
    let close = open;
    for (; close < css.length; close += 1) {
      if (css[close] === '{') depth += 1;
      else if (css[close] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = css.slice(open + 1, close);
    if (selector.startsWith('@')) {
      extractRules(body, out);
    } else if (selector !== '') {
      out.push({ selector, body });
    }
    i = close + 1;
  }
  return out;
}

function chartMarkRules(css: string): CssRule[] {
  return extractRules(stripComments(css)).filter((rule) => /\.spark\b|\.meter\b|\.chart\b/.test(rule.selector));
}

describe('a chart mark carries identity in --series-*, never a status colour', () => {
  it('the extractor actually finds the chart/meter/spark rules (a check with nothing to look for proves nothing)', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    const rules = chartMarkRules(css);
    expect(rules.length).toBeGreaterThan(0);
    // And it is really reading the marks, not just matching an empty selector.
    expect(rules.some((r) => r.body.includes('--series-1'))).toBe(true);
  });

  it('none of those rules reference --ok, --warn, --bad, --waiting or --accent', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    const offenders = chartMarkRules(css).filter((r) => FORBIDDEN_NAME.test(r.body));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it('none of those rules reference an -soft fill other than --ink-soft', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    const offenders = chartMarkRules(css).filter((r) => FORBIDDEN_SOFT.test(r.body));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it('chart.tsx sets no inline colour from a status token — it has no legitimate reason to', () => {
    // Comments stripped first: the doc comments in this very file NAME the forbidden tokens
    // to explain the rule, which would otherwise trip a naive whole-file scan on its own prose.
    const src = stripComments(readFileSync(CHART_TSX_PATH, 'utf8'));
    expect(FORBIDDEN_NAME.test(src)).toBe(false);
    expect(FORBIDDEN_SOFT.test(src)).toBe(false);
  });

  it('chart-grammar.tsx — columns, parts and lines — is held to the same set', () => {
    const src = stripComments(readFileSync(GRAMMAR_TSX_PATH, 'utf8'));
    expect(src.length).toBeGreaterThan(0);
    expect(FORBIDDEN_NAME.test(src)).toBe(false);
    expect(FORBIDDEN_SOFT.test(src)).toBe(false);
  });
});
