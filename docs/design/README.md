# design-docs

The design specification for Construct-O-Genie: fifteen HTML parts, generated from `build/`, checked by
gates on every build. **This is not a pitch artifact.** It is the document the product is built from, and the
built product is what we demo — so anything left unspecified here gets invented ad hoc by whoever picks up the
ticket. What each pass changed, and what it superseded, is in **`CHANGES.md`**; this file is the current guide.

## What is in here

| File | What it is |
|---|---|
| **`index.html`** | The contents page: the fifteen parts in reading order, what is in each, and where to start. |
| **`00-foundations.html`** | The palette and how it was chosen, type, spacing, icons, the drawing system, every token with the number behind it, the measured ink table, and *Provenance*. |
| **`01-components.html`** · **`02-motion.html`** | Every element the set draws, the published component it is, and each in every state, both themes — the chart grammar (every kind, colour by job, the states) and the three drawing styles with the duotone family; every motion the product makes, played, and the same page under reduced motion. |
| **`03-navigation.html`** | Two navigations, one shell: the bar and the sidebar at every width, the firm's tree and a project's, the switcher, the edge states, and the mapping table — 65 routes with level, module key, action key and what a hidden link draws. |
| **`04-today.html`** … **`11-settings.html`** | The product, one part per area: Today and Overview — on one twelve-column grid with one card, drawn at a director's laptop width (1400px, the frame scrolls sideways in the column) — Sales, Projects, Buying, Site, Approvals and Money, the portals, Reports and Settings and the operator. |
| **`12-states-roles.html`** | Every state a screen can be in — twenty-three empty states with a drawing each, loading, refused, unreachable, not found, error — and the same screens as three roles. |
| **`13-decisions.html`** | The current decisions, the 18-link table with a rendered sample for every row, the hero of every screen, the money rule; superseded decisions in a dated History at the end. |
| **`14-demo.html`** | The five-minute walkthrough, on the demo organisation with the seed's own logins, with what to say at each stop. |
| **`tokens.css`** · **`design.css`** · **`design.js`** | Every value in the system (primitives → semantic in light and dark → this product's component layer); the component rules; the page script. Shared by every page; nothing is inlined. |
| **`build/`** | The generator and the gates — source. Its own `README.md` says what each script is. |
| **`CHANGES.md`** | What each pass changed and what it superseded, newest first, with a table of contents. |
| **`VALUE-MAP.md`** · **`COMPONENT-MAP.md`** · **`TOKEN-DIFF.md`** | Every screen against one test (who opens it, what they do next, the value line); every drawn part mapped to the shipped component it is, extends or adds; every token against the shipped stylesheet. |

All data is the product's own demo seed. Since 19 September the sample is Bhitarang Interiors Private Limited — the
organisation `scripts/seed-demo.mjs` (commit `c6ef045`) writes, with its six projects, twelve vendors, four clients,
three staff logins and two portal logins — and every figure is what the seeded product computes from it, derived in
`build/seed.mjs` by the product's own rules and checked by the sample gate on every build. The seed's day is fixed as Monday
14 September 2026. Nothing here comes from `_private/`.

### Renumbered 19 September 2026, to reading order

The parts were numbered in the order they were written; they are numbered in the order they are read now. Every
cross-link, section id and heading was rewritten and nothing else in any page changed (the two sets were
normalised and compared). The product's own code cites the old names in **70 comments across 59 files** —
comments only, nothing resolves them, nothing breaks; updating them is a product delta.

| Was | Is |
|---|---|
| `13-components.html` · `14-motion.html` · `12-navigation.html` (once `12-project-scope.html`) | `01-components.html` · `02-motion.html` · `03-navigation.html` |
| `01-today.html` · `02-sales.html` · `03-projects.html` · `04-buying.html` | `04-today.html` · `05-sales.html` · `06-projects.html` · `07-buying.html` |
| `05-site.html` · `06-approvals-money.html` · `07-portals.html` · `08-settings.html` | `08-site.html` · `09-approvals-money.html` · `10-portals.html` · `11-settings.html` |
| `09-states-roles.html` · `10-decisions.html` · `11-demo.html` | `12-states-roles.html` · `13-decisions.html` · `14-demo.html` |

## Opening it

Double-click `index.html`, or any numbered file. No server, no build step, no network: each page links
`tokens.css`, `design.css` and `design.js` beside it and carries its own copy of the icon sprite and the
drawings it uses. One external reference exists — a Google Fonts stylesheet for Inter — and every page renders
without it (Segoe UI takes over); verified offline on every build. The theme switch is in memory and resets on
reload, on purpose; nothing is stored in the browser. Responsive to 400px.

## Building it

```
node docs/design/build/build.mjs      # rebuilds the set — about ten seconds, the same bytes from the same sources
node docs/design/build/gates.mjs      # every gate, both themes — about twenty-five minutes; --quick for the whole-set gates only
node docs/design/build/measure.mjs    # re-measures the printed tables, then rebuilds — after a token change or a change to what a frame draws
```

The generator is source (README item 10, decided 19 September); the pages are its output and are never edited
by hand. Details, the layout of `build/` and the rules that hold are in `build/README.md`.

## The gates

Nothing here is hand-verified. Every gate runs on the committed files, in light and dark; the counts of the last
green run are in `CHANGES.md`. Build-time: the **token gate** (every component token points at a semantic token,
every pair it paints passes its floor, 40 adjustments recorded; **hue parity** — every token painted as a mark,
a bold fill, a tint or an icon resolves within 20° of hue between light and dark and above a chroma floor for
its role, so a status colour cannot change family between themes; a labelled-redundant mark's fixed amber
recorded as such); **no value outside `tokens.css`** (rules and
inline styles); **the prose gate** (no token named that the build does not emit); **value-line keys** resolve
once each; **the 18-link gate**; **one drawing per subject**; **the stale-phrase gate** (a list of phrases that
describe what a drawing no longer shows, and the sample the design was drawn on before the seed); **the sample
gate** (every project, client, vendor, prospect, order number, bill number and person the design prints is read
from the seed's two scripts and must be spelled as they spell it). In the browser: **contrast** (AA, AAA for body ink); **non-text**
(WCAG 1.4.11 on every control boundary, focus ring, chart mark and legend swatch, read from the property that
paints each; the track, the area fill and a gridline named exempt as backdrops; every legend swatch held to its
mark's colour and treatment; **the island rule** — a badge, chip, count or dot on the dark top bar paints a
bold fill with the light set's inverse ink in both themes, never a subtlest-family tint; **labelled-redundant** —
a chart mark whose value the gate finds printed in its card takes the fixed status amber, and one it finds
no value for is held to 3:1); **colour vision** (deuteranopia and protanopia on every chart, reading what it paints — a translucent fill composited over its ground, the 2px gap left out — with the non-colour channel each chart carries named); **India** (no
saffron beside green; chroma per audience); **alignment** (256 renders: button groups, tile rows, tables,
forms, pills, icons on the x-height, overflow, one hero a screen, every empty state on the published anatomy,
every drawing on the drawing system, sibling figure cards sharing a header height and a figure baseline, no
highlighter; **three styles** — monoline in navigation and controls, duotone on a disc, a drawing in an empty
state, and every `svg` one of them or a chart; a legend wherever two or more series are painted, a series being
a categorical colour and not a threshold, a marker or an emphasis chart's neutral; overflow measured with a
chart's tooltip lifted out; **the dashboard grid** — every child of a grid on a twelve-column track, every row's spans
summing to twelve so no card sits alone and the last row is full, every row's cards one height, every card's header
48px and one line with a title of at most 24 characters, the duotone disc first in a tile's or a money card's header
and nowhere else, a hover specimen inside its plot); **frame** also fails **internal text** inside a product frame —
`HUMAN(`, `CA-gated`, `unbuilt`, `TODO`, the word `spec` (an absent state speaks in the product's words; the markers
live here and in VALUE-MAP); **consistency** (37 metrics take one value across the set); **frame** (the shell per app, the
page header, the toolbar order, a project filter at the firm level only); **money** (Indian grouping, two
decimals, every provisional mark beside a rate); **states**, **motion**, **names** (nothing names the borrowed
system), **readable** (no line over 120 characters, one element a line), **standalone** (offline, from disk).

## What a developer still cannot build from these files

Recorded, not guessed. Each is a product delta with a place to go.

1. **The project-level twins** — a project's Orders, Stock, Documents, Bills, Client billing and Reports under `/projects/[id]/…`, and Settings › Terminology — marked *new* on the mapping table; Documents is blocked (`workflow.documents` has no project column). The plan-as-a-tab on a project's Orders is recorded, not drawn.
2. **The nav generated from enabled modules × role permissions**; today the sidebar is a static list and the modules table is read nowhere but Settings.
3. **A Project column and filter** on Bills, Stock, Documents, Client billing and Daily reports.
4. **Reads that do not exist**: the projects a person is on (*Mine*), the projects opened last (*Recent*), recent history, the sidebar's counts, the GSTIN-missing count, which records carry a file, the cash at the start of a period.
5. **A per-person preference store** — the column choice, the sidebar's collapse and folds, the last project opened, starred views and reports, the single-key switch — and a *Your preferences* route.
6. **Saved views**, their criteria (where `?project=` now lives), columns and favourites; a page-size control.
7. **The quick-create square's permission read** as one call, and the square built as two islands (the dark set's Blue500 under the light set's white plus).
8. **Search scoped to the page and the project**; one endpoint that takes a scope.
9. **Reports Center data**: the module key exists, nothing runs. **Terminology** per tenant. **Getting-started** state.
10. **Every record page resolving its own project** (a bill, a voucher and a holding reach it through their order); sign-in keeping the address; refused and not-found as two states only if the API tells them apart; what a handed-over or closed project still allows.
11. **The list pattern on every list**, its six states per screen, staff screens at phone width, the notifications panel's inline actions, the chart's hover (the tooltip is drawn on one mark and the crosshair on one point; the table view behind its toggle and the period picker on a panel are markup with nothing behind them), the stacked bar's fourth segment.
12. **Two shipped screens contradict this document** and need the product changed (Today, and the money screens' setup state).
13. **The product's own gate** measures token contrast against the shipped set; the reduced-motion tokens the package does not ship; three published values that were behind feature flags when read.
14. **Motion** is tokens and shown, not built; the spinner's resting arc and the two composed fields are compositions the package does not publish.
15. **The ten empty-state names** the shipped `Empty` component does not take: `today`, `boq`, `rates`, `vendors`, `not-found`, `unreachable`, `error`, `signed-out`, `operator`, `client` (the map from each drawing to its name is in `build/illustrations.mjs`).
16. **The 70 comments in 59 product files** that cite the old part filenames.
17. **The sample the seed does not reach.** The seed writes no imprest, no measurement sheet, no recce, no cash position and no history: those screens are drawn on the seed's names with the design's own figures and are tagged so on the page (`08-site.html`), and every sparkline's history is drawn to end at the seeded present. The seed has no site engineer, quantity surveyor, designer or salesperson — three staff logins exist — so those screens are played by procurement or the admin; no closed project, so the closed state is specified and not drawn; and it shapes SAN-01's orders to 88% of the contract before GST while the product sums orders gross, so no project sits at the 85% watch line and two are past their contract. Three seed quirks to know: its orders carry unit rates shaped to a share of the contract, so rate analysis shows deviations of hundreds of percent on them; it raises orders on a handed-over project; its design-build agreement value is not the project's.
18. **Product tests, stories and comments that fixture the old sample** — 69 occurrences in 15 files under `apps/`, `packages/design-system`, `services/` and `scripts/` name Northwind, Kestrel or KEST-01 (`today.ts:9` quotes *88% of the Kestrel contract*; the rest are test fixtures and stories). None resolves to the design; updating them is a product delta.
19. **The reads behind Today's and Overview's panels** (19 September, the grid): receipts and payments by month for a financial year or a quarter (*Money in and out* — the product has receipts and payments and no cash book, so it is not *Cash flow*; ARCH-CASH is open), receivables and payables in ageing buckets, orders by trade package, every project's ordered share, the daily reports per site and per day with which sites reported today, the variations awaiting a signature with **a sent date the seed does not record** (so no *oldest*), the leads with **an expected close date the seed does not record** (so no *closing this month*), and **milestone dates the agreement stages do not carry** — none is an endpoint today; the figures here are the seed's, computed in `build/panels.mjs`; the absent panels say so in product words. **Cash by account** is drawn absent with *Connect Tally* and stays so until the connector delivers a cash position (HUMAN(ARCH-CASH)). The module rules — Pipeline needs crm, Site today needs operations, Unsigned variations needs change_orders — are drawn (the re-flowed sample) and not read from anywhere.
20. **The licence question is flagged, not settled.** The system's site licence grants use in connection with add-ons to its owner's products and forbids derivative works; its component packages declare Apache-2.0 (`build/ads/NOTICE.md` names the package, the version and the licence text, verified 19 September). This document uses the tokens and the anatomy as published values and measurements and none of the system's drawings, icons, logos or typeface. Whether the site licence's scope reaches this use — and the two token tables read from the documentation site rather than the package — is for the owner's legal advice (`00-foundations.html`, *Provenance*).

## An index of decisions

Each is recorded in full on `13-decisions.html`; superseded ones sit in its History, dated.

- **One system owns colour**; a published value that fails a gate moves to the nearest step on its own ramp (`TOKEN-DIFF.md`); a gate never moves to admit a colour.
- **Blue is the brand and every affordance, never a status.**
- **Money is `BIGINT` paise, Indian grouping, two decimals**; direction as coloured text with its sign — green in, orange out (19 September; red until then); overdue an amber label over an ink figure.
- **No highlighter**: the caution fill is for a lozenge or a section message only; amber as text is allowed at AA and is never a stroke or a border. **Amended 19 September (charts)**: a chart mark whose value is printed beside it is labelled-redundant and takes the fixed status amber, the same in both themes — the gate grants it by finding the value; a mark that is the only carrier stays at 3:1.
- **One chart grammar** (19 September): every chart is `.chart` with its kind; the anatomy, the marks, colour by job, one axis, compact ticks with the full figure in the tooltip and the table, the dark set selected and validated against both surfaces.
- **Three drawing styles, never a fourth**: monoline in navigation and controls, duotone on a stat's disc and a hub card, the spot illustration in an empty state.
- **A semantic element on the dark island** paints the light set's bold fill and inverse ink in both themes.
- **One grid, one card, one form per fact** (19 September, the grid): Today and Overview on twelve columns with a 24px gutter, in the rows a director acts in; one 48px one-line header with the duotone disc left of the title on a tile or a money card only; one figure scale, hero 48 · total 28 · tile 24; no fact drawn twice; no internal text in a product frame — an absent state speaks in the product's words.
- **The generator is source**; the pages are output.
- **Two navigations, one shell** (19 September): the firm's functions, or a project's lifecycle; Settings behind the gear; Rate analysis under Sales; no × on the switcher; sign-in lands at All projects.
- **The shell is the reference's, measured**: a 48px navy bar, a 200px brand column, 34px controls on a lifted alpha neutral, a 300px search, a Blue500 square under a white plus, a 28px avatar; a 200px sidebar with 38px rows, Blue100 open sections, a Blue700 pill with a + on it. Nothing of the reference is reused.
- **A list leads with its full width in the reference's columns; a record beside it is the second state.** One rule for a pane's action row.
- **Every chart mark is held to 3:1 from the property that paints it, and a legend swatch is its mark** (19 September); the track, the area fill and a gridline are backdrops, exempt by name.
- **Sibling figure cards share a header height and a figure baseline** (19 September); every tile carries its bar.
- **One drawing per subject** (19 September), registered under the line; the neutral set for the common states.
- **The sample is the seed** (19 September, last): every name and figure the design prints is the demo organisation's, as the seeded product computes it; where the seed does not reach, the page says so.
- **Portals keep the quiet drawing** — no discs, no direction colour — under the same bar; measured chroma keeps both below the staff app.
- **Approvals is firm-wide, pinned at both levels.** A scope narrows what you browse, never what you owe.
- **The CA gate moved from the build to the statutory output** (ADR-0014, 15 September): every Money screen computes; a provisional rate says so; a statutory document built on one is a draft.
