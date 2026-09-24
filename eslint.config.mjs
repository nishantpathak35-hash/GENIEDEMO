// Boundary enforcement. This is what replaces the version-bump ceremony of a
// multi-repo split: the dependency rule is checked by CI, in seconds, on every
// commit.
//
//   apps      -> may import packages/*        (never services/* internals)
//   services  -> may import packages/*        (never apps/*, never each other)
//   packages  -> may import packages/*        (never apps/*, never services/*)
//
// See docs/TOPOLOGY.md.

import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

// The seven domain services. `services/host` is DELIBERATELY ABSENT: it is the
// composition root and the one place permitted to import every service
// (docs/plans/M1.md D5).
//
// Leaving it out of this array is the mechanism, so it is stated rather than
// left to be inferred — a future edit that "completes" this list by adding
// 'host' would break the API host with a message about going through
// packages/contracts, which would be baffling.
const SERVICES = [
  'identity', 'tenancy', 'projects', 'procurement',
  'finance', 'siteops', 'workflow',
];

// Every service is off-limits to every other service.
const crossServiceZones = SERVICES.flatMap((target) =>
  SERVICES.filter((from) => from !== target).map((from) => ({
    target: `./services/${target}`,
    from: `./services/${from}`,
    message:
      `services/${target} must not import services/${from} directly. ` +
      `Go through packages/contracts.`,
  })),
);

// The identifier-name pattern that marks a value as money. Hoisted so the
// services block and the apps block share ONE definition: `no-restricted-syntax`
// is replaced by name in flat config rather than merged, so the apps block has
// to restate the arithmetic selectors, and two copies of a regex this long drift.
const MONEY_NAME =
  '(?:^|[a-z])(?:[Aa]mount|[Rr]ate|[Tt]otal|[Gg]st|[Tt]ds|[Pp]rice|[Vv]alue|[Cc]ost|[Pp]aise|[Bb]udget|[Cc]ommitted|[Tt]axable|[Gg]ross)';

// The exemption: a product handed DIRECTLY to a named rounding boundary.
const BOUNDARY =
  '^(?:roundToPaise|roundGstPerInvoicePerHead|roundTdsSec288B|roundChallanWholeRupees|mulRatio|mulRate)$';

// **DESCENDANT, NOT DIRECT CHILD, and that is the whole rule.**
//
// These selectors ended in `> Identifier[...]` — a direct child of the binary
// expression. That reads correctly and is blind to one parenthesis. Measured in
// `project-financials-legacy.ts`, two float divisions of money four lines apart:
//
//   142  row.plannedGMPct = projectValue ? (projectValue - bcs) / projectValue : 0;   caught
//   144  row.actualGMPct  = inflow ? (inflow - outflow - tds) / inflow : 0;           SILENT
//
// The second is not a different kind of expression. `/`'s direct children are
// the parenthesised subtraction and `inflow`; `tds` — a statutory head — sits
// one level down, so a direct-child selector never sees it, and `inflow` is not
// a money-shaped name. Line 142 was caught only because `projectValue` happens
// to be the right-hand operand.
//
// So the arithmetic families now match ANY descendant identifier. Measured
// across the whole repo before the change: zero new violations, so this costs
// nothing today and closes a hole that any parenthesis would have reopened.
const MONEY_ARITHMETIC = [
  {
    selector:
      `BinaryExpression[operator='*']:not(CallExpression[callee.name=/${BOUNDARY}/] > BinaryExpression) Identifier[name=/${MONEY_NAME}/]`,
    message:
      'Money is multiplied only in packages/money, where the rounding boundary is a required, named argument (ADR-0012, M1/D1).',
  },
  {
    selector:
      `BinaryExpression[operator='/']:not(CallExpression[callee.name=/${BOUNDARY}/] > BinaryExpression) Identifier[name=/${MONEY_NAME}/]`,
    message:
      'Money is divided only in packages/money — use ratioOf, which is exact and returns a Ratio (ADR-0012, M1/D1).',
  },
];

// Annotated because the inferred type names paths inside `.pnpm/`, which
// TypeScript rejects as non-portable (TS2742). Naming the flat-config type
// keeps this file checkable without widening the config.
/** @type {import('eslint').Linter.Config[]} */
const config = [
  // Generated output. Flat config ignores only node_modules and .git by
  // default, so without this `pnpm lint` is red locally on emitted .d.ts files
  // while CI — which lints a fresh checkout before building — is green. A
  // local/CI divergence in both directions at once. `.e2e/` is the no-API
  // copies' warm Turbopack output (scripts/e2e.mjs 3b, since 2026-09-20): one
  // gate later, lint walked its chunks and failed on rules they name.
  {
    ignores: ['**/dist/**', '**/.next/**', '**/.e2e/**', '**/.turbo/**', '**/coverage/**'],
  },

  // WITHOUT THIS PARSER THE BOUNDARY RULE BELOW NEVER FIRES.
  //
  // ESLint's default parser cannot read a type annotation, so every .ts file
  // containing one failed with "Parsing error: Unexpected token :" and its
  // imports were never examined. TOPOLOGY.md, the package READMEs and CI's own
  // comment all described the one-way rule as enforced; it was not, for any
  // file with a type on it. See docs/TOOLING-DEFECTS.md defect 1.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    plugins: { import: importPlugin },
    // The zones below compare RESOLVED paths, so the resolver has to understand
    // both import forms `module: NodeNext` produces — './x.js' pointing at
    // x.ts, and extensionless './x'. Without it an import resolves to nothing
    // and the zone silently does not match.
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: ['./*/*/tsconfig.json'] },
        node: { extensions: ['.js', '.ts', '.tsx', '.mjs'] },
      },
    },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './services',
            from: './apps',
            message: 'Services must never import from apps. Dependencies point one way.',
          },
          {
            target: './apps',
            from: './services',
            message:
              'Apps must not import service code. Go through the generated client ' +
              'in packages/contracts — services are reached over HTTP, not linked.',
          },
          {
            target: './packages',
            from: './apps',
            message: 'Packages must never import from apps.',
          },
          {
            target: './packages',
            from: './services',
            message: 'Packages must never import from services.',
          },
          ...crossServiceZones,
        ],
      }],
    },
  },

  // MONEY IS MULTIPLIED AND DIVIDED IN EXACTLY ONE PLACE.
  //
  // M1/D1 specified this backstop and it was never written. Branding `Paise` as
  // a `bigint` is the primary mechanism — `bigint * number` fails to compile —
  // but it does not stop `bigint * bigint`, which type-checks happily and
  // returns an unbranded `bigint`. That is precisely the mistake this rule was
  // added after making: a health threshold written as
  // `committed * 100n > budget * 85n` — exact arithmetic, wrong place.
  //
  // TWO EXEMPTIONS, both structural rather than by suppression:
  //
  //  1. A product handed DIRECTLY to a named boundary — `roundToPaise(rate *
  //     qty, SCALE)` — is the sanctioned idiom for a scaled rational: the
  //     multiplication is the numerator and the rounding decision is still
  //     named. Four existing call sites use it.
  //  2. TWO NAMED FILES — not a glob. This was `'**/*-legacy.ts'`, which is a
  //     rule about a FILENAME: any file added later became exempt by being
  //     called the right thing, and four files were covered by it. Measured
  //     with the exemption removed, only two of the four contain money
  //     arithmetic at all; the other two were exempt for no reason and are now
  //     under the guard, with a line at each file head saying so.
  //
  //     Two rather than one because two files record arithmetic defects, and
  //     both are cited by comparison tests:
  //
  //       rate-analysis-legacy.ts       4 violations, lines 87-95 — the CPWD
  //                                     engine's mid-formula `Math.round` and
  //                                     its `directCost * (overheadPct / 100)`.
  //                                     Those ARE defects 1-4 of the port note.
  //       project-financials-legacy.ts  3 violations, lines 142-144 — the float
  //                                     gross-margin percentages the legacy
  //                                     computes on `REAL` columns.
  //
  //     Routing either through `packages/money` would change the numbers that
  //     `*-legacy.test.ts` asserts, which is ADR-0014 decision 5 exactly: once a
  //     ported figure differs from the legacy figure there is no way to tell
  //     whether the port was wrong or the fix was right. These files are the
  //     oracle, and an oracle that has been corrected is not one.
  //
  //     `services/host/tests/money-guard.test.ts` asserts this list is exactly
  //     these two paths, so a third cannot be added quietly.
  {
    files: [
      'services/*/src/domain/**/*.ts',
      'services/*/src/application/**/*.ts',
      'services/*/src/api/**/*.ts',
    ],
    ignores: [
      'services/projects/src/domain/rate-analysis-legacy.ts',
      'services/projects/src/domain/project-financials-legacy.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...MONEY_ARITHMETIC],
    },
  },

  // IN AN APP THE TYPE SYSTEM IS NOT WATCHING.
  //
  // In a service money is a branded `Paise` and the compiler stops the
  // arithmetic. Across the wire it is a `PaiseWire` — a digit-only STRING of
  // paise — which has no brand, no guard, and `Number("1233912") / 100` one
  // keystroke away, looking entirely reasonable in a table cell. That is how
  // the legacy ended up with 17 client components computing GST and TDS.
  //
  // So under `apps/` the ban is wider than the money-name pattern: no numeric
  // coercion at all, no `Math`, no `toFixed`, and no rupee symbol — because
  // `₹${amount}` is not arithmetic and still displays paise as rupees, a 100x
  // error no arithmetic rule catches. Money reaches a screen through
  // `formatIndianRupees` and leaves it through `parseRupeesToWire`, both in
  // `packages/money`, and there is nothing else an app may do with it.
  //
  // MONEY_ARITHMETIC is spread in rather than restated. `no-restricted-syntax`
  // is REPLACED by name in flat config, not merged, so an apps-only block that
  // listed only the new selectors would silently switch OFF the multiply and
  // divide rules for exactly the tree that needs them most. Four planted
  // violations were used to confirm all four families fire here.
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        ...MONEY_ARITHMETIC,
        {
          // Both spellings. `Number.parseInt(x, 10)` is the same coercion with
          // a namespace in front of it, and it is what a careful person reaches
          // for when the bare form is banned — written here once, in this file,
          // before the rule went in.
          selector:
            "CallExpression[callee.name=/^(?:Number|parseInt|parseFloat)$/], " +
            "CallExpression[callee.object.name='Number'], " +
            "MemberExpression[object.name='Number'][property.name=/^(?:parseInt|parseFloat)$/]",
          message:
            'An app never converts a wire value to a number. Display money with ' +
            'formatIndianRupees and read a typed value with parseRupeesToWire / ' +
            'parseQuantityToParts / parseWholeNumber, all in packages/money.',
        },
        {
          selector: "MemberExpression[object.name='Math']",
          message:
            'Math.round in a browser is how the legacy computed TDS (POsView.js:153). ' +
            'The server computes every monetary figure; the app displays it (ADR-0014).',
        },
        {
          selector: "CallExpression[callee.property.name=/^(?:toFixed|toPrecision|toLocaleString)$/]",
          message:
            'These take or produce a float. Indian digit grouping is formatIndianRupees ' +
            'in packages/money, which works on the digit string and cannot lose a paise.',
        },
        {
          selector: "UnaryExpression[operator='+'][argument.type!='Literal']",
          message:
            'Unary + is numeric coercion with nothing to distinguish it from a typo. ' +
            'Use the named parser in packages/money.',
        },
        {
          selector: `BinaryExpression[operator=/^[+\-]$/] Identifier[name=/${MONEY_NAME}/]`,
          message:
            'A screen never sums a column. If a total is displayed, the endpoint returns ' +
            'it — a subtotal computed in a browser is a second source of truth and it ' +
            'will disagree (ADR-0014).',
        },
        {
          selector: "Literal[value=/\u20B9/], TemplateElement[value.raw=/\u20B9/]",
          message:
            'The rupee symbol comes from formatIndianRupees. Writing it beside a value ' +
            'an app holds is how a paise figure gets displayed as rupees.',
        },
      ],
    },
  },
];

export default config;
