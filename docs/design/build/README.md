# build/ — the generator and the gates

The design set in `docs/design/` is written by the scripts here. Nothing in the set is edited by hand: change a
source, rebuild, run the gates, commit the set with the build. From the repository root:

```
node docs/design/build/build.mjs      # rebuilds every page, tokens.css, design.css and design.js — about ten seconds
node docs/design/build/gates.mjs      # every gate, both themes — about twenty-five minutes; --quick runs the whole-set gates only
node docs/design/build/measure.mjs    # re-measures the tables the pages print (non-text pairs, ink, the census, the token diff), then rebuilds
```

A rebuild from unchanged sources writes the same bytes: the build reads no clock, no environment and no network,
and its four measured inputs (`non-text.json`, `ink.json`, `inventory.json`, `repaint.json`) are committed beside
it. The gates resolve Playwright through the workspace's own `@playwright/test`; on Git Bash a comma-joined list of
paths must be Windows-style and run under `MSYS_NO_PATHCONV=1`.

## What is where

| File | Purpose |
|---|---|
| `build.mjs` | The entry point: assembles every page from `pages/`, lays it out (`tidy.mjs`), runs the build-time gates — the token gate, the literal gate, the prose gate, the value-line keys, the 18-link gate, the stale-phrase gate, one drawing per subject, the sample gate — and writes the set |
| `gates.mjs` · `measure.mjs` | The two runners: every browser gate over the set; the re-measure that refreshes the committed JSON and `TOKEN-DIFF.md` |
| `tidy.mjs` | Readable output: one element a line, no line over 120 characters, nothing that changes what renders |
| `files.mjs` | The fifteen parts in reading order, their filenames and titles; `hrefFor()` is the one way a cross-link is written |
| `tokens.mjs` | The token system: primitives → semantic (light and dark) → this product's component layer, and `verify()`, the token gate. Reads `ads/` |
| `tokens-candidates.mjs` | The earlier palette generator, kept for its helpers and for the record the foundations page prints |
| `adjust.mjs` | Every published value a gate made us change, and what replaced it |
| `token-renames.mjs` · `repaint.mjs` · `token-diff.mjs` | The shipped stylesheet's names mapped to the new ones; the size of the product's repaint (`repaint.json`); `TOKEN-DIFF.md` written from it |
| `css-base.mjs` · `css-patterns.mjs` · `css-components.mjs` · `css-shell.mjs` | The component rules, in the order they were added: the layer, the list and pane patterns, the published components, the shell and the lists as the buyers know them. `css-base.mjs` exports the whole of `design.css` |
| `seed.mjs` | The sample: the pure parts of `scripts/seed-demo.mjs` (commit `c6ef045`) and `scripts/demo-principals.mjs` copied verbatim, and every figure the product computes from them by its own rules, each cited; `SEED_DAY` fixes the seed's day |
| `data.mjs` · `vocabulary.mjs` | Money formatting and the contract's state tables; the sample's shapes the pages consume, read from `seed.mjs`; the customer-facing vocabulary |
| `shell.mjs` · `patterns.mjs` · `cards.mjs` | The page helpers: the top bar, the two sidebars and the frame; the page header, the list, the pane and the switcher; the money cards, the list menus and the document toolbar |
| `nav.mjs` | Both navigation trees and the 65-row route map (level, module, action) that part 3 prints |
| `icons.mjs` · `duotone.mjs` · `illustrations.mjs` | The three drawing styles, this product's own: the monoline icon set on the published grid; the duotone family a disc wears (a 24px line and one flat block, 19 icons, with where each lands and the hub's five); the twenty-three drawings, one per empty-state subject |
| `css-charts.mjs` · `charts.mjs` · `panels.mjs` | The chart grammar: its rules (one root `.chart` and its kinds, the parts, the marks, the states); the builders every chart is drawn with; the panels Today and Overview carry on the dashboard grid — the tiles, the money cards, the chart panels, the absent states in product words — each with its value line |
| `inventory.mjs` · `census.mjs` | Every element the set draws and the published component it is; the census that counts each across the product frames (`inventory.json`) |
| `ink.mjs` | The ink coverage of every drawing (`ink.json`), for the foundations page |
| `design.js` | The page script shared by every page: the theme switch and the motion page's replays |
| `pages/` | One module per page or group of pages, named for what it draws: `foundations`, `components`, `components-in-place`, `motion`, `navigation` (+ `navigation-screens`), `today-to-buying` (parts 4–7), `site-to-demo` (parts 8, 10–14), `money` (part 9), `patterns`, `overview`, `charts` |
| `gates/` | One gate per file: `contrast`, `non-text`, `colour-vision`, `india`, `alignment`, `consistency`, `frame`, `money`, `motion`, `names`, `polish`, `readable`, `standalone`, `states`. What each proves is in `../README.md` under *What is checked on every build* |
| `ads/` | The published token values the build reads, with the package `LICENSE` and a `NOTICE.md` naming package, version and each file's origin |

## Rules that hold

- No value outside `tokens.css`: no colour, spacing or radius literal anywhere else, in a rule or an inline style. The literal gate reads both.
- Every cross-link goes through `hrefFor()`; every section id and filename comes from `files.mjs`.
- Every name and figure in the sample comes from the seed through `seed.mjs`; the sample gate reads the two seed scripts as text on every build and refuses a name they do not spell. Where the seed does not reach (imprest, measurement, recce, history), the fixture's comment and the page say so.
- A patch to a script with a backslash in it is written as a file and run, never typed into a shell: a shell once turned `\b` into a backspace byte in two regexes here — and, in the charts pass, `\\n` into a newline inside a `join()` and `\b` into a backspace a fourth time. The gates caught each one; the rule stands.
- Every chart is drawn with `charts.mjs` on the `.chart` grammar; a page never composes a bar, a track or a band of its own.
- Today and Overview are drawn on the dashboard grid (`css-shell.mjs`, `.grid`) with `panels.mjs`; a product frame carries no internal text — a marker, a gate's name or a note to ourselves lives in VALUE-MAP and the README, and the frame gate reads every frame for `HUMAN(`, `CA-gated`, `unbuilt`, `TODO` and `spec`.
- `shell(…, { desktop: true })` draws a frame at 1400px, scrolling sideways in the document's column: the four-tile row needs it, and the alignment gate measures what is inside against the frame's own edge.
- Every `svg` a page carries is one of three styles — a monoline icon (`icons.mjs`), a duotone on a disc (`duotone.mjs`), a drawing in an empty state (`illustrations.mjs`) — or a chart. The alignment gate reads every one.
- Never `git add -A`: another session is usually mid-edit in this repository. Stage the set and the scripts by name.
