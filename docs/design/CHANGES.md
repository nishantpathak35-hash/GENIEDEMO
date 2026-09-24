# CHANGES

The design's own history: what changed in each pass, and what it superseded. Read this instead of
diffing the files in this folder. Newest first, one entry per pass.

| Pass | Entry |
|---|---|
| 19 September 2026, the grid | [One grid, one card, one form per fact](#19-september-2026-the-grid--one-grid-one-card-one-form-per-fact) — Today and Overview on twelve columns, one 48px header with the disc left of the title, three forms removed, the panels a director acts on, absent states in product words, the internal-text gate |
| 19 September 2026, the charts | [The charts, the family, two theme defects](#19-september-2026-the-charts--the-charts-the-family-two-theme-defects) — one chart grammar and six new panels, the duotone family and six drawings redrawn, the island badge and the amber fixed by rule, hue parity gated |
| 19 September 2026, last | [The clean-up](#19-september-2026-last--the-clean-up) — renumbered to reading order, the chart defects, the tiles, one drawing per subject, stale prose gated, the History section, the docs cut to a guide, the build named by purpose, the token licence |
| 19 September 2026, later | [The navigation](#19-september-2026-later--the-navigation) — two navigations under one navy bar, the mapping table, Overview, saved views, the Reports Center |
| 19 September 2026 | [The build, and the look measured](#19-september-2026--the-build-and-the-look-measured) — the generator as source, the shell to the reference's measurements |
| 18 September 2026 | [The look the buyers know](#18-september-2026--the-look-the-buyers-know) — the theme of the books the buyers keep |
| 17 September 2026 | [The elements](#17-september-2026--the-elements) — every element the published component, parts 1 and 2, the six drawings |
| 16 September 2026, later | [The retheme, and the sidebar in sections](#16-september-2026-later--the-retheme-and-the-sidebar-in-sections) |
| 16 September 2026 | [One project at a time, the patterns, and Money as shipped](#16-september-2026--one-project-at-a-time-the-patterns-and-money-as-shipped) |
| 13 September 2026 | [Applied](#13-september-2026--applied) |
| 12 September 2026 | [The split, the polish, the known gaps](#12-september-2026--the-split-the-polish-the-known-gaps) |
| Before | [The redesign and the colour correction](#before--the-redesign-and-the-colour-correction) |

---

## 19 September 2026, the grid — one grid, one card, one form per fact

Design files only, `docs/design/`. Two commits — `a45a9b4` the grid, the card, the panels, the gates and the docs,
and the one that closes this entry with what the full run found and its numbers. Findings were measured from the committed
`04-today.html` at `8ee56ae` before anything moved; every figure on the two screens is the seed's, derived by the
product's rules; where the seed cannot produce a panel's data the panel is drawn absent in the product's words and
the gap is recorded (VALUE-MAP, README item 19), never a number invented. No screenshot of the reference has ever
been seen; nothing of it is reused and it is not named in any committed file. The licence question stays flagged
(README, item 20).

### The grid and the card

- **Measured before, at the document's 1440 render**: the three tiles at 259·259·259 (16px gaps), then 461·329,
  395·395, 461·329, 395·395, and one 395 with a hole beside it — five card widths, and a lone card. Header strips
  at 80 (the tiles' fixed two-line strip), 57, 77 (*Spend by trade package* wrapped to two lines), 53. All three
  tile titles wrapped at the three-column width (`.ct` 44px tall: *Margin at risk*, *Payables this week*, *Past its
  contract ceiling*). The duotone disc sat in four places on one page: inside the body at the right of a tile's
  figure (`card-b @198,101`), at the far right of a money card's total row (`@400,78` / `@268,78`), inside the site
  panel's sub-card (`.stat @34,283`), and left of a settings hub title.
- **After**: twelve columns with a 24px gutter (`.grid`, `--grid-gutter`), the rows as drawn at 1400px — 12 the hero
  (1134) · 266·266·266·266 · 555·555 · 748·362 · 555·555 · 555·555 · 555·555 — every header 48 and one line, every
  disc first in its header (`card-h @17,11`) on the tiles and the money cards only, none on a chart or a list. Cards
  in a row share the row's height; no card sits alone; the last row is full. Under 1380px the tiles go two a row,
  under 1000px 8·4 becomes 12 and 12 (measured at 768: 654 · 315·315 ×2 · 315·315 · 654 · 654 · 315·315 ×3),
  under 760px one column. One figure scale: hero 48 (`--font-size-hero`, 56 until now), total 28
  (`--font-size-total`), tile 24 (`--font-size-tile`); the disc in a header 28 with the icon at 20.
- **The header holds one line at every width because its parts fold, not because the rule bends.** At three columns
  no laptop width holds a 24-character title, its help icon and a word of action on one line, so a tile's action
  stands at its foot; under 1000px a six-column card's action and period picker fold to their icons (a plus to add,
  an arrow to open, a calendar for the period), with the word as the accessible name; under 760px the header's
  padding tightens. Titles renamed to fit: *Overdue receivables*, *Unsigned variations*, *Ordered and billed*
  (Overview; *Contract, ordered, billed* was 25), *Projects to look at*.
- **The document draws both screens at a director's laptop width.** A 1400px frame (`--frame-desktop-width`,
  `shell(…, { desktop: true })`) that scrolls sideways in the document's column at 1440 and 1280 and is the window's
  width below; the four-tile row does not exist narrower than 1380, and the document's own column is 1076. The
  alignment gate measures what is inside against the frame's own edge — and learned that an element an ancestor
  clips (a banner's ellipsis) is cut, not overflowing.

### One form per fact

- The six rings under *Ordered against contract* drew the same six shares a second time — removed; the card is the
  meter list and shrinks to it.
- *Approvals ageing*, a column chart of 3 · 1 · 2 — removed; the hero's line gained *2 older than a week*
  (`PO-0003` and `PO-0018`, nine days each, of six waiting).
- *Past its contract ceiling* repeated KRA-01's 127% a third time — replaced by *Unsigned variations*: the
  over-contract figure is the problem, the unsigned variation is the action.
- *Site this week*'s *Open issues* sub-card is a line of text in the panel; on Overview *Waiting on the client*,
  *Open variations* and *Agreement stages* went — the pending variation is the tile, the stages are the milestones
  panel.

### Today, the panels in the order a director acts (`panels.mjs`, each with its value line)

- **Row 0** the hero, unchanged plus the older-than-a-week clause.
- **Row 1, four tiles**: *Margin at risk* ₹57,18,988.26 on KRA-01 and SAN-01, four budgets partial, the bar the cost
  budget against what is approved · *Payables this week* ₹6,04,667.40, one bill, ₹75,767.80 overdue and
  ₹1,46,768.40 to acknowledge beneath · *Overdue receivables* ₹45,39,130.00 with the strip 1–30 · 31–60 · 60+ and the
  buckets printed — on the seed one invoice, five days past, so one segment carries all of it · *Unsigned variations*
  ₹47,200.00, CO-03 on ANU-01 with Anuvanshik for signature — the seed records no sent date, so no *oldest*.
- **Row 2**: *Total receivables* ₹94,56,583.00 and *Total payables* ₹7,96,948.40, the bar in ageing buckets (current,
  then 1–30 · 31–60 · 60+ in the labelled-redundant amber with 2px gaps) and the buckets printed beneath — receivables
  ₹49,17,453.00 · ₹45,39,130.00 · ₹0.00 · ₹0.00; payables ₹7,21,180.60 · ₹75,767.80 · ₹0.00 · ₹0.00.
- **Row 3**: *Money in and out* — receipts recorded against invoices against payments recorded against bills, net of
  TDS and retention, by month of the financial year, a two-series line (collected in categorical 1, paid out in
  categorical 2, a legend, the crosshair on August), the summary at the right: collected ₹2,14,97,413.00 · paid out
  ₹11,88,404.57 · net ₹2,03,09,008.43. Titled exactly that, not *Cash flow*: the product has receipts and payments and
  no cash book (ARCH-CASH stays open), and the caption says so in product words. Beside it *Cash by account*, absent:
  *Cash position arrives from Tally once the connector is linked* · *Connect Tally*.
- **Row 4**: *Ordered against contract*, the meters only, each against its own contract · *Milestones this week*,
  absent: the seed's agreement stages carry no date — *No milestone dates yet. Give each project's agreement stages a
  date and the ones due or slipping this week show here.*
- **Row 5**: *Site today* — the brief's *4 of 6 sites reported today* is not derivable: no report is dated today, and
  of the four projects that report two are not live sites (ANU-02 handed over, NCB-01 won). The lead line is what the
  seed gives — *0 of 4 sites reported today · 2 of 4 yesterday* — with a row per in-progress site (ANU-01 and KRA-01
  reported yesterday; NCB-02 and SAN-01 not reported), the head count by day as the columns, and the open issues with
  the blocking one named. Beside it *Your day*, the two tasks dated in the past under the overdue lozenge.
- **Row 6**: *Spend by trade package*, as built · *Pipeline* — ₹7,75,00,000.00 in two quotes awaiting a client's
  decision, three leads with a next step this month at ₹9,26,00,000.00, the open pipeline ₹29,33,00,000.00 over
  seven; *closing this month* is not drawn — the seed records no expected close date — and the panel says what to add
  for it to appear.
- **Module rules**, drawn: Pipeline needs crm, Site today needs operations, Unsigned variations needs change_orders
  (`data-module`); a panel whose module is off is not drawn and its row re-flows — the sample *Today with Sales and
  Site switched off* shows Your day and Spend by trade package at twelve, ruled exempt in VALUE-MAP as Today in
  another state. The tenant on the seed has 11 of 11 modules on; the rule is drawn, not read.

### Overview, the same rules at project scope

The hero at 12; four tiles — *Ordered and billed* (72% ordered, 21% billed, the contract, ordered and billed
printed), *Margin at risk* on this project (₹0.00 — nothing approved past a cost budget, one budget partial),
*Unsigned variations* on this project (CO-03), *Payables this week* on this project; then *Milestones this week*
with the four agreement stages listed, none dated, and the absent copy, beside *Site this week* (*Not yet reported
today · last report yesterday*, the head count by day, the blocking issue named); then *Money in and out* for this
project at 8 (collected ₹82,24,065.00 · paid out ₹11,88,404.57 · net ₹70,35,660.43) beside *Team* at 4. On the seed
every bill is this project's, so its payables tile coincides with the firm's — the seed, not a repeat.

### No internal text in a product frame

*Cash by account* printed *HUMAN(ARCH-CASH) … the payment path is CA-gated and unbuilt* inside the demo — three
findings on Today and three more on the Tally-offline sample when the rule was run over the committed file. The
frame gate now reads every product frame's text for `HUMAN(`, `CA-gated`, `unbuilt`, `TODO` and the word `spec`
(word-bounded, so *Specification change at no commercial effect*, a variation's title, passes); the committed set
has none. An absent state speaks in the product's words with its one action; the markers live in VALUE-MAP and
the README.

### What the gates decided, and were amended to

- **Alignment, five new rules** (G8): every child of a `.grid` on a track (its left edge and width a whole number of
  columns, within 1px); every row's spans summing to twelve — no lone card, the last row full — and its cards one
  height; every dashboard card's header 48px and one line, its title at most 24 characters and not wrapped, at every
  width; a disc first in the header of a tile or a money card and nowhere else; a hover specimen inside its plot and
  never over the header row (a tall column's tooltip now sits over the column's top, inside the plot; a line's tooltip
  hangs from the point's side in the outer third). The row rule (B2) keys on the grid too.
- **Frame gate**: the internal-text rule above.
- **Consistency**: rows for the dashboard card's header (48px, 0 16 padding), the small disc (28×28) and its duotone
  (20×20), the tile figure and the total figure; the general rows for the disc and the duotone exclude the small
  one, the card-header row excludes the dashboard's; the tile's body pads like every card (20).
- **Polish**: a header row's title, following its disc and followed by the card's body, is not an orphan heading.
- **Money card component** (`oweCard`): takes `current` and three `buckets` instead of `overdue`; the Money page's
  two cards and the foundations specimen carry the buckets too.
- **`.two` and `.three` are untouched** — fourteen pages use them; only Today's and Overview's compositions (and the
  Tally-offline, projects-by-health, notifications and demo frames that compose Today's parts) moved to the grid.

### Found by the gates and fixed

- **The demo page scrolled horizontally at 400 and 768**: a 1400px desktop frame inside a narrower column with
  nothing containing it (`.dsx-main` scroll 416 against a 400 client). `.dsx-wide` took `container-type: inline-size`,
  so its size no longer follows the frame inside it, and below 760px the frame is the column — nothing scrolls
  sideways on a phone.
- **The grid specimen on 01-components had no container**, so its cards never re-flowed and a total at 28 overflowed
  a 109px box — wrapped in `.figbox`.
- **The grid diagram's cells** overflowed their tracks at 400 (`min-width: 0; overflow: hidden`), and its numbers sat at
  3.54:1 on the blue tint — 48 text elements below target over both themes — now ink.
- **At the rail width** a six-column card could not hold *Ordered against contract* and *Projects* on one line (334
  against 315): the header's action and picker fold to their icons under 1000px, with the word as the accessible name.
- **The planted cases**: a row summing to ten fails *row 3 spans 10 of 12 columns*; a 27-character title fails
  *title … is 27 characters (at most 24)* and overflows its box; the committed set fails neither.
- **The figure scale is 48 · 28 · 24 at the width the screens are drawn at.** `--font-size-hero` keeps its clamp
  (36px floor, 5.5cqw), so at 768 the hero renders at its floor while total and tile stay fixed; there the alignment
  gate's hero clause is met by the action, not the figure — as it was before the pass.

### Gates

Every gate, run on the built set from `docs/design/build/gates.mjs`, both themes, the reports folder cleared
first, after `measure.mjs` refreshed the printed tables; a rebuild from unchanged sources writes the same bytes
(checked by hash before the run):

- **Build**: token gate 473 checks, both themes, 0 problems, 40 gate-forced adjustments, none new; hue parity 0
  pairs apart; the literal gate reads the inline styles again and finds none; the stale-phrase gate, 25 phrases; one
  drawing per subject, 23; the sample gate, 69 names; value keys 87, each resolving once.
- **Contrast**: 32,922 text elements over 2 themes, 0 below target (66 inactive, exempt).
- **Non-text**: 146 painted pairs (108 obligated) over 2 themes, 0 failures; 16 labelled-redundant grants per theme,
  each with the value found in the mark's card — the ageing buckets' amber segments among them; the island read on
  every page with a top bar.
- **Colour vision**: 0 charts colour-only — the two-series money line in categorical 1 and 2 carries its legend.
  **India**: 0 flag pairs; chroma per audience, weighted by painted area — web 0.0445, operator 0.0446, client 0.0246,
  vendor 0.0397.
- **Alignment**: 256 renders over 16 files (4 widths × 2 themes × online and offline), 0 distinct faults — ALIGN
  GATE: PASS — including G8: every grid child on a track, every row's spans twelve and its cards one height, every
  dashboard header 48px and one line with a title of at most 24 characters, every disc first in a tile's or a money
  card's header, every hover specimen inside its plot; the desktop frames measured against their own edge.
- FRAME GATE: PASS — 90 app frames, each led by the product's mark, with the switcher second in the staff app's
  bar and none in the vendor's; 25 inside a project and saying so in the address; 82 page headers on one edge
  and one row; 33 toolbars in one order, a project filter only at the firm level; 28 lists each stating a count —
  both themes; 0 frames with internal text (six findings on the committed file before the pass, on Today and the
  Tally-offline sample).
- CONSISTENCY GATE: PASS — every metric takes exactly one value in every file that has it (six rows added: the
  dashboard card's header height and padding, the small disc and its duotone, the tile figure and the total figure)
- MONEY GATE: PASS — 1287 rupee figures across 16 files, every one in Indian grouping with two decimals; 16
  Provisional marks, each beside a rate or a tax head; 5 draft notices, each on a statutory document
- STATES GATE: PASS — 76 drawn states match the real state they stand for, both themes
- MOTION GATE: PASS
- POLISH GATE: PASS — 0 orphan headings (a header row's title is not one)
- names gate: 99 frames read, 0 naming a borrowed system
- READABLE GATE: PASS — 19 files, 60,560 lines, none over 120 characters, no page inlines a style or a script,
  one block element a line inside every frame
- STANDALONE GATE: PASS — the folder opens from disk with no server: every page, offline, in both themes, with
  its three shared files

## 19 September 2026, the charts — the charts, the family, two theme defects

Design files only, `docs/design/`. Six commits — `daf30ff` the two theme defects and their rules, `be3b664` the
chart grammar and the panels, `c25dfad` the drawings and the duotone family, `bc3dc0d` the gates reading what the
charts paint with the docs, `6d5997a` the crosshair and the two-series channel, and the one that names them —
every finding measured from the committed files, every decision logged here. No screenshot of the
reference has ever been seen; nothing of it is reused and it is not named in any committed file. The licence
question stays flagged (README, item 20).

### Two theme defects, fixed by a rule

- **The bell's badge.** Before: `rgb(93, 31, 26)` under `rgb(255, 213, 210)` in *both* themes — the dark island
  takes the dark set's subtlest red whichever theme the page is in, and the light theme painted it too, a
  maroon count nobody could read. After: `rgb(201, 55, 44)` under `rgb(255, 255, 255)` in both — read from the
  painting property. The mechanism is a token alias, not a patch: `island-important` is
  `color.background.danger.bold@light` and `island-important-ink` is `color.text.inverse@light`, a `name@light`
  pointer that resolves to the light set's value in every semantic block (`--<name>-light`), so the island's
  semantic elements wear the light set's bold and inverse pair. The rule: every semantic element on a dark island
  — badge, chip, count, dot — resolves to a bold fill with the light set's inverse ink; the token gate holds
  `island-important-ink` on `island-important` at 5.16:1 and the badge against the bar at 2.76:1 raised; the
  non-text gate reads the top bar's `.badge, .chip, .count, .dot, .lozenge, .pill, .tag` in both themes and fails
  any fill that matches a subtlest-family value.
- **The overdue amber.** Before: `#946F00` light, `#DDB30E` dark — a yellow darkened to 3:1 on white is olive,
  and that is physics, not a bad step. The distinction: a mark whose value is printed beside it (the owed bar's
  overdue part with its figure beneath, the meter's overrun band with *₹… over*, the stacked bar's at-risk
  segment with its count in the legend) is **labelled-redundant** and takes the fixed status amber,
  `color.background.warning.bold` — Orange300 `#FBC828` in both sets, chroma 0.16 — with a 2px surface gap
  between it and its neighbour; a mark that is the only carrier of its value stays obligated at 3:1. The class is
  granted by a **lookup**, not a comment: the non-text gate searches the mark's card (its stat, hero, figure or
  money card; the chart only when it stands alone) for the value text and records what it found — *₹57,18,988.26
  in Margin at risk* for the owed bar, *₹13,17,120.00 over in Ordered against contract* for the band, *Past the
  contract* for the band's legend swatch, *At risk 3* for the stacked bar's segment. A mark it finds no value for
  is held to 3:1 and fails. `owed-overdue`, `chart-band`, `chart-amber` and `chart-caution` all point at the one
  token; the token gate records them as redundant rows (1.57 on the panel in light, 10.50 in dark) and asserts the
  lightness band it had only recorded.
- **Hue parity, gated.** `hueParity()` in `tokens.mjs` sweeps every token used as a fill on a mark, badge, disc or
  lozenge — the `PARITY` list, by role: marks at chroma ≥ 0.10, bold fills ≥ 0.08, tints ≥ 0.015, icons ≥ 0.10 —
  and fails a pair whose light and dark resolved colours sit more than 20° of hue apart or under the floor. The
  sweep, every pair found: **`chart-caution`** Orange700 (hue 52°) light against Orange300 (89°) dark, 37° —
  re-pointed at the fixed amber, labelled-redundant by the legend's count; **`warn-soft`** Yellow100 (100°) light
  against Orange1000 (64°) dark, 36° — dark re-stepped to Yellow1000 (95°, Δ 5.3°), the fortieth gate-forced
  adjustment; `money-in` and `money-out` are text and left the sweep (the contrast gate holds them);
  `tenant-accent` at chroma 0.094/0.093 set the bold floor at 0.08 (the letter on it is 4.7:1 and identifies it);
  the disc, soft and info tints at 0.019–0.026 set the tint floor at 0.015 (a subtlest step's hue is still
  determinate; the ink on it carries identity); `badge-primary-ink`, `badge-important-ink` are inks and left;
  `unread` is not a token. Every pair passes after; nothing was lowered.

### One chart grammar

- **What the set drew before.** The brief counted ten class systems; five of the ten were not charts (`.bar` is the
  frame's chrome dots, `.bar-div` the top bar's divider, `.history-wrap` the recent-history button, `.cols-pop`
  the Columns popover, `.hist` a History item). The five that were: `.spark`, `.owe-bar`, `.meter`,
  `.chart.stack/.bars/.cash-chart`, and `.progress/.prog/.progress-bar/.rate-bar`, plus the hero's own `.hbar`.
- **The grammar** — `css-charts.mjs` (the rules) and `charts.mjs` (the builders), a page on 01-components. One
  root, `.chart`, with its kind: `spark`, `owe`, `meters` (+ `meter-one`, the hero's bar), `bars` (grouped by a
  second `<i>`; emphasis by `.emph` with one `.emph-on`), `stack`, `parts`, `line`, `ring`, `progress`. The
  anatomy: a card header with the title, its help and a period picker or one action; the plot; the x labels; a
  legend for two or more series and none for one; a table view behind a `details` toggle; the published Tooltip
  on the mark under the pointer, its hit target the whole column, lifted to the card's edge on the first and last
  column; on a line or an area, a crosshair through the point under the pointer with the tooltip at it (below the
  point when the point is near the top). The marks: a bar at most 24px with a 4px rounded data-end and a square baseline; a 2px line with round
  joins; a marker 8px or more with a 2px surface ring; the area under a line in the lightest step of the series'
  ramp (`chart-area`, `color.background.accent.blue.subtlest` — the brief said ~10%, and the token layer has no
  alpha step; a fill at 10% would be a literal); a hairline gridline one
  step off the surface; a 2px surface gap between stacked segments and touching bars; never a border around a
  mark. Colour by job: sequential by default; emphasis one series in the brand and the rest `chart-neutral`;
  categorical in the fixed order 1–8, never cycled (`series-4` … `series-8` added); status colours reserved; text
  in text tokens; money direction green in, orange out. One y-axis; ticks in compact rupees (₹40L, ₹2.4Cr — the
  money gate admits the compact form inside a chart's grid, x labels, legend and ring list only) with the full
  figure in the tooltip and the table. Loading (a skeleton that keeps the plot's shape), empty (the reason, never
  a fake) and reduced motion are drawn once on the grammar page.
- **Dark selected, not flipped.** The dataviz validator was run on the categorical eight against both surfaces:
  light `#357DE8 #6A9A23 #BF63F3 #E06C00 #1558BC #AE4787 #2898BD #BD5B00` on `#FFFFFF` — lightness band 0.43–0.77
  all eight, chroma ≥ 0.1, worst adjacent CVD pair `#2898BD`↔`#AE4787` ΔE 9.0 (deutan), normal-vision floor 23.2,
  contrast ≥ 3:1 — ALL CHECKS PASS; dark `#4688EC #6A9A23 #BF63F3 #E06C00 #1868DB #AE4787 #2898BD #BD5B00` on
  `#1F1F21` — band 0.48–0.67, CVD 9.0, normal 23.7, contrast ≥ 3:1 — ALL CHECKS PASS. No re-step was wanted; the
  earlier gate-forced steps (Lime600, Orange600, Teal600 in light; Lime600, Purple500 in dark) are what passes.
- **Rebuilt on it — every chart in the set.** Counted as rendered instances across the sixteen pages (the
  components page draws each specimen twice, in a light and a dark pane): **157 charts in ten kinds** — 39
  progress bars, 39 owed bars, 27 column charts, 18 rings, 15 sparklines, 6 meter lists, 4 part-to-whole bars, 4
  lines with their area, 3 stacked status bars, 2 hero meters — plus the four ring lists that hold the rings. The cash-flow card, the owed bars, the tile bars, the meter list, the sparklines,
  the histograms, the audit history bars, the Money statement charts and the site head-count columns are one
  class system; `pages/charts.mjs` is gone.
- **The hero's meter is the list's meter.** Past the contract, the track is the list's four fifths and the overrun
  runs past it as the amber band with the diamond on the contract line — a diamond hanging half off the end of a
  full-width track was the 6px overflow the alignment gate found on the grammar page.

### Six panels, in the language of the dashboards the buyers know

Each on the grammar, each with its value line under its help icon (`VALUE` in `panels.mjs`, VALUE-MAP):
**Billed against collected** by month — grouped columns, billed in the brand and collected in categorical 3, the
legend with the totals beneath, an FY / quarter picker — *a good billing month is not mistaken for a good cash
month*; **Spend by trade package** — one horizontal stacked part-to-whole bar, the top five and Other, the values
in the legend; never a pie for close values, and these are close; **Ordered against contract** — the meter list
kept, a ring per project beneath it, the fill in the brand and the track a lighter step of the same ramp
(`ring-track`), past the contract the ring in the status amber and the overrun printed; **Approvals ageing** —
0–3 · 4–7 · 8+ days, the emphasis on 8+; **Site this week** — head count by day as columns, open issues as a
stat beside; **Cash by account** — absent, drawn as the empty state with its reason: the product holds no cash
position (HUMAN(ARCH-CASH)), nothing is estimated. Overview carries the project's own billed-against-collected
and site-this-week. Every figure is the seed's (the four tax invoices and their receipts by month, the orders
by trade, the six shares, the six approvals' ages, the twenty daily reports).

### The drawings and the family

- **Six drawings redrawn in the same hand**, at 2× in both themes: *today* — the half sun on a clean horizon at
  the left, the board on two posts standing on the horizon at the right, nothing overlapping (the sun had sat
  behind the board with the horizon through it); *notifications* — a bell with a crown, shoulder, waist, flare and
  lip, the clapper under it, a small tick beside it, and no count on it (a count is the badge's job); *approvals*
  — an empty in-tray with a small tick on its floor (the floating stamp handle is gone); the *client portal* has
  its own drawing, a cup of chai on its saucer with the steam rising (`client` → `chai`; it shared approvals'
  stamp); *recce* — the lens centred on the body, the viewfinder centred, the strap looped from one lug to the
  other; *vendors* — the awning's stripes are blocks registered to the awning by construction, a valance, a door
  with a knob, a window on its sill, the sign standing on the facade (it had floated a unit over the awning).
- **All twenty-three at 2×, both themes, the other faults found and fixed**: *money* — a yellow tab floated two
  units off the slip's right edge, and the paid mark's tick was a V → the tab is the total box on the slip, the
  tick has a short and a long arm; *operator* — the three buildings' bases sat two to four units above the ground
  line → on it. No fault found in the other fifteen (tasks, sales, projects, boq, rates, orders, stock, daily,
  measure, documents, search, not-found, unreachable, error, signed-out).
- **The duotone family** — `duotone.mjs`, 19 icons on a 24px grid: a 2px line with round caps and joins in the
  disc's icon colour, one flat block under it in the disc's own ramp one step up (`--duo-<hue>`,
  `color.background.accent.<hue>.subtler`, a token in both themes, so the dark variant is the token's). Where each
  lands: `margin` (a BOQ sheet with a notch) on Margin at risk, Today and Overview; `bill` (a bill with the rupee
  stamped on it) on Payables this week; `ceiling` (the gauge, the needle past the tick) on Past its contract
  ceiling and `contract` (the needle short of it) on Contract, ordered, billed; `site` (a cone and a pin) on Site
  this week and This week on site; `tray` (an in-tray) on approvals and what waits; `voucher` on cash and any
  rupee figure with no direction; `invoice-in` and `invoice-out` (an invoice with its arrow) on Total receivables
  and Total payables; `orders`, `due`, `stock`, `count`, `people`, `held` for the stats every other page draws —
  `discFor()` chooses by the figure's job; and the settings hub's five, one tinted disc per category: `firm`
  (blue), `people` (purple), `flow` (teal), `record` (neutral), `yours` (green). The figure and money cards wear
  a disc at the top right of the body; a stat's disc wears the family everywhere.
- **The rule, as a gate**: monoline in navigation and controls; duotone on a stat's disc and a hub card; a spot
  illustration in an empty state — never a fourth. The alignment gate reads every `svg` on every page (210 on
  the components page) and fails a monoline on a disc, a duotone off one, a drawing outside an empty state, or
  an svg that is none of the three and not a chart, a spinner or the sprite; the planted case (a monoline on a
  disc) fails with its reason. The family and the mapping are on 01-components.

### What the gates decided, and were amended to

- **Alignment G6 counted colours, not series**: a sparkline's dashed threshold, a meter's limit marker and an
  emphasis chart's neutral each read as a second series wanting a legend. It counts the categorical series
  colours now, a nested chart measured once as itself — the rule the grammar states, not a lower one.
- **Alignment overflow saw a chart's tooltip as an overflow** (the published Tooltip is a popup anchored in the
  column). Rather than excuse the whole chart the way a popup excuses its anchor, the gate lifts `.chart
  .tooltip` out, measures, and puts it back — a chart is still measured.
- **The meters stack on their own width** (`container-type: inline-size` on `.chart.meters`, rows stacked under
  520px) rather than on the frame's breakpoint, which a specimen pane does not have; the parts legend's column
  fits a name and a full figure (200px); the emphasis demo on the grammar page is 300px wide because its x
  labels need it.
- **The non-text lookup's scope**: the chart kind `.owe` matched the money card's class, so the owed bar's scope
  was the bar alone and it found no value — the card first, the chart only when the mark stands alone; the stacked bar's segment is labelled by the legend's bare count, so its lookup asks for that
  shape (`at risk 3`); a figure on the grammar page is the mark's scope before the chart is.
- **The colour-vision gate read what was not painted.** With every progress bar and owed bar now a `.chart`, the
  gate met them for the first time and failed three: it read a 7% translucent track as its own rgb (matching a
  neutral fill at ΔE 1), counted every html element's default black `fill`, listed the table view behind its
  closed toggle, and compared the 2px surface gap to the track beside it. Amended to read what a chart paints: a
  translucent fill composited over its ground, `fill` and `stroke` on svg only, nothing without a box, and the
  gap token (read on the chart, so a specimen pane in the other theme resolves its own) left out as the
  grammar's spacer. The part-to-whole bar's channels are named — the values in the legend in the marks' order,
  and the 2px gaps — since its tightest pair under protanopia is ΔE 2.1 (light) and 2.4 (dark) among the
  categorical six, the same pair the validator reports; it carries its meaning in the legend, as the grammar
  says, and is recorded OK* like the grouped columns beside it. The grouped columns had been passing under the
  wrong reason — *one colour, labelled axis*, a single-series channel — so a two-series chart now names its own:
  *a legend naming each series, the marks in its order within each group*; billed and collected converge under
  protanopia (ΔE 2.1 light, 2.4 dark — the brief pinned the pair, brand and categorical 3) and are told apart by
  the legend and the fixed order within each month's pair, not by colour.
- **The three-up row at 1280** put the ageing chart's x labels in 42px columns and the site chart's day labels
  in 22px — 17 overflow faults at 1440 the four-width run found. The row is `repeat(auto-fit, minmax(360px,
  1fr))`: three panels when each can have 360px, two otherwise with the third wrapping; the site panel's one
  stat is a column. A one-series column's tooltip no longer repeats the series name the title gives (*Sun · 83
  on site*).
- **The settings hub's discs are per category**, as the brief says — *one tinted disc per category with a duotone
  icon, accent per category* — so the six cards under *The firm* share the building and the four under *People
  and access* the two people; the card's title names the page. The per-page monoline map (home, rupee, sort,
  grid, layers, pen, users, shield, lock, check-sq, site, clock, monitor) went with it.
- **The decisions page**: *no highlighter* gains its charts clause — a chart mark is the third place the caution
  fill may go, on the labelled-redundant condition, and the olive amber is gone from every mark.
- **`repaint.mjs` read an empty component block** since the layer's selector gained `.page-theme`, so
  TOKEN-DIFF counted *1 new component token* and *0 kept by name* for a pass. It finds the block by its start
  now: 43 kept by name, 6 removed, 141 new component tokens.
- **Found by the gates and fixed**: a heredoc turned `\n` into a newline inside two `join()` calls (a syntax
  error the build caught) and `\b` into a backspace byte in a regex a fourth time (the lookup found no value
  until it was stripped); the money gate read compact ticks as malformed rupees until the chart's axes and
  legends were admitted; the readable gate found the grid's ticks on one 120-character line; the motion gate's
  progress selector followed the class; the prose gate's inline-data set gained `--top` and `--mark`; the
  billed/collected tooltip overflowed its card at 400 until it sized to its words; *Open all 6* wrapped the
  ageing card's header (one word now); the site panel's two mini stats were cramped (one).

### Gates

Every gate, run on the built set from `docs/design/build/gates.mjs`, both themes, the reports folder cleared
first, after `measure.mjs` refreshed the printed tables; re-run per file — colour vision on every page, non-text and
the four-width alignment on the components page — and the whole-set gates again after the crosshair joined the
grammar page and the grant's label learned to name the card. Committed as the docs commit that closes this entry:

- **Build**: token gate 473 checks, both themes, 0 problems, 40 gate-forced adjustments, one new (the dark warning
  fill to Yellow1000, hue parity); hue parity over every mark, bold, tint and icon token in the `PARITY` list, 0
  pairs apart; the island rows (`island-important-ink` on `island-important` 5.16:1; the badge against the bar
  2.76:1 raised); the redundant rows recorded (1.57 / 1.48 light, 10.50 / 11.23 dark); the literal gate reads
  the inline styles again and finds none; the stale-phrase gate, 25 phrases; one drawing per subject, 23; the
  sample gate, 69 names. A rebuild from unchanged sources writes the same bytes (checked by hash).
- **Contrast**: 32,208 text elements over 2 themes, 0 below target (66 inactive, exempt).
- **Non-text**: 146 painted pairs (108 obligated) over 2 themes, 0 failures. The new rules, counted: 16
  labelled-redundant grants per theme, each with the value the gate found in the mark's card — the owed bars
  (*₹57,18,988.26 in Margin at risk*, *₹7,96,948.40 in Total payables* …), the overrun bands (*₹13,17,120.00
  over*, *₹6,91,200.00 over*), the band swatches (*Past the contract*), the at-risk segments and swatches (*At
  risk 3*), the sparklines' bands (*104%*, *100 bags*) — and no mark obligated for want of one; the island read
  on every page that draws the top bar, 11 pages × 2 themes: the badge *3* fills rgb(201, 55, 44) under
  rgb(255, 255, 255), bold, in both; 0 subtlest-family fills on the island.
- **Colour vision**: 0 charts colour-only, reading what each chart paints (a translucent fill composited over its
  ground, the gap left out); the part-to-whole and the grouped columns carry their channels. **India**: 0 flag
  pairs; chroma per audience, weighted by painted area — web 0.0455, operator 0.0446, client 0.0246, vendor
  0.0397.
- **Alignment**: 256 renders over 16 files (4 widths × 2 themes × online and offline), 0 distinct faults — ALIGN
  GATE: PASS — including the three new rules: every `svg` one of three styles (a planted monoline on a disc
  fails with its reason), a legend wherever two or more series are painted, overflow measured with a chart's
  tooltip lifted out.
- FRAME GATE: PASS — 89 app frames, each led by the product's mark, with the switcher second in the staff
  app's bar and none in the vendor's; 25 inside a project and saying so in the address; 81 page headers on
  one edge and one row; 33 toolbars in one order, a project filter only at the firm level; 28 lists each
  stating a count — both themes
- CONSISTENCY GATE: PASS — every metric takes exactly one value in every file that has it (two rows added:
  the duotone's size, 24×24; the disc's, 40×40)
- MONEY GATE: PASS — 1259 rupee figures across 16 files, every one in Indian grouping with two decimals; 16
  Provisional marks, each beside a rate or a tax head; 5 draft notices, each on a statutory document
- STATES GATE: PASS — 76 drawn states match the real state they stand for, both themes
- MOTION GATE: PASS
- names gate: 98 frames read, 0 naming a borrowed system
- READABLE GATE: PASS — 19 files, 59,339 lines, none over 120 characters, no page inlines a style or a
  script, one block element a line inside every frame
- STANDALONE GATE: PASS — the folder opens from disk with no server: every page, offline, in both themes,
  with its three shared files

## 19 September 2026, last — the clean-up

The set in order, the dead weight out, the chart defects and the tile alignment fixed, one drawing per
subject, the docs cut to a guide, the generator named by purpose, and — the owner's decision, taken — the
sample switched from an invented firm to the product's own demo seed, every figure re-derived. Every
finding in the brief was verified against the committed file before it was acted on; where the file
disagreed with the brief, the file won and the disagreement is written here. No screenshot of the
reference has ever been seen; nothing of it is reused and it is not named in any committed file.

### The renumber, alone

`4b690eb`, 37 files. The parts are numbered in the order they are read: 00 foundations · 01 components ·
02 motion · 03 navigation · 04 today · 05 sales · 06 projects · 07 buying · 08 site · 09 approvals-money ·
10 portals · 11 settings · 12 states-roles · 13 decisions · 14 demo. Titles unchanged. `git mv`, every
cross-link through `hrefFor()`, every section id and `aria-labelledby`, the README, CHANGES, COMPONENT-MAP,
VALUE-MAP and TOKEN-DIFF rewritten in one simultaneous pass over the old→new map. Proof of content
identity: both sets were normalised (numbers, ids, filenames, titles, the pager, whitespace) and diffed —
the residue was numbers, names, order and line wrap, nothing else. Two gates hard-coded old filenames
(`gates/motion.mjs`, `gates/states.mjs`) and the alignment gate keyed its value-line exemption on the old
states section id in two places, the second of which was missed on the first pass and failed the suite with
seven faults on part 9 — fixed. The product cites the old filenames in **70 comments across 59 files**
(the brief said 63/54): comments only, nothing resolves them; a product delta, in the README.

### What it supersedes

- **The overrun band was invisible.** *Past the contract* painted `color.background.warning` over the
  warning surface: 1.09:1 light, 1.22:1 dark — the failure the eye reported and the non-text gate had not,
  because it read the token and not the painted pixel. The band is `--chart-band` on
  `color.background.accent.yellow.bolder`, the same yellow as an overdue owed bar: **4.63:1 light, 8.25:1
  dark**, read from the property that paints it, alpha-composited over its ground.
- **The watch-line legend lied.** The mark is a 2px dashed rule on `--chart-threshold` (3.24 / 4.22); its
  swatch was a solid block on a different token (14.34 / 10.56). The swatch is now the mark — same token,
  same dashed rendering, 3.24 / 4.22 — and the gate holds every legend swatch to its mark's colour and
  treatment. The brief's claim that the meter's track carried no ring was wrong: track and swatch both carry
  it, and the ring measures 3.90 / 4.22 (the fill beneath it 1.13 / 1.17); both are exempt as backdrops, by
  name, and the legend block still holds the swatch to the track it names.
- **The meters scaled by the largest contract**, so the 85% line sat somewhere different on every row.
  Each meter is its own contract now: the track is 0–100% at a fixed width, the watch line at 85% of it,
  an overrun drawn past the track's end, the amount at the right, rows sorted by ordered share, a project
  with no contract value on a dashed track with its amount and *no contract value yet*.
- **The three tiles did not align.** Header strips measured 76 and 77px across the row with one title on
  three lines; the figures sat on three baselines; Margin at risk had no bar. The strip is a fixed two-line
  height (`calc(var(--control-height-compact) * 2 + var(--space-200) * 2)`), the title's last word and its
  help icon wrap as one, the action sits at the strip's right, centred, one word — and every tile carries a
  bar (Margin at risk: the cost budget against what is approved, the short part the overrun). The
  alignment gate now measures across a row: sibling figure cards share a header height and a figure
  baseline within 0.5px.
- **Six drawings served twenty-two states, offset by `translate(4 3)`.** Twenty-two drawings now, one per
  subject, none translated (shapes enlarged where the offset had carried colour); a drawing may not serve
  two states with different subjects, and the build refuses a name with no drawing. The *Filtered by* tag's
  leaked whitespace is a `column-gap`, not a `&nbsp;`.
- **Stale prose.** Fourteen phrases described what the drawing no longer showed — *three stats … with a
  sparkline*, *Money in its setup state*, `?project=` as the mechanism, *12-project-scope*, *scope table*,
  *dark-neutral-0 as the bar*, and eight more. Each sentence was rewritten (the Today note, the firm-lozenge
  sentence on components, *foot of the sidebar* and *thirteen pages* on settings, *firm-wide* on approvals,
  two on foundations' drawings, the tokens licence text, the index description) and the list fails the
  build: **the stale-phrase gate**, phrases and not words, with a superseded span and the History section
  stripped before the check. The old sample's names joined the list in this pass — 25 phrases now.
- **Superseded decisions were inline.** 23 superseded elements (21 spans and paragraphs, two *was* blocks,
  one holding nested amendments) were lifted into a dated **History** section at the end of part 13, oldest
  first, 17 items. Nothing deleted; the live text reads as current.
- **The docs.** The README was 54,622 bytes of history; it is a 14,999-byte guide — what is here, the
  renumber table, opening, building, the gates, the can't-build list, an index of decisions. CHANGES keeps
  the history and gained a table of contents, one row per pass. COMPONENT-MAP, VALUE-MAP and TOKEN-DIFF
  carry a dated preface each and the rows this pass adds.
- **`build/` named by purpose.** Every script is reachable from `build.mjs`, `gates.mjs` or `measure.mjs`
  — the brief's *unreachable* list (`census7`, `ink6`, `rename6`, `repaint6`, `tokdiff6`, `inventory7.json`)
  was wrong on every name: `measure.mjs` runs the census, the ink and the repaint, `token-renames` is
  imported by the repaint and the diff, and `inventory.json` is read by the components page. Nothing was
  deleted but two byte-identical copies of the token themes (`ads/tokens-light.js`, `ads/tokens-dark.js`)
  and `.ruff_cache/`, now ignored. Renamed: `files4`→`files`, `tokens6`→`tokens`, `tokens4`→
  `tokens-candidates`, `rename6`→`token-renames`, `repaint6`→`repaint`, `tokdiff6`→`token-diff`,
  `census7`→`census`, `ink6`→`ink`, `inventory7`→`inventory`, `icons7`→`icons`, `illo7`→`illustrations`,
  `css4/5/7/8`→`css-base/patterns/components/shell`, `lib/lib2/lib4/lib5/lib8`→`data/vocabulary/shell/
  patterns/cards`, the page modules into `pages/` (`today-to-buying`, `site-to-demo`,
  `navigation-screens`, `money`, `patterns`, `foundations`, `components`, `components-in-place`, `motion`,
  `navigation`, `overview`, `charts`) and the gates into `gates/` (`contrast`, `alignment`, `consistency`,
  `colour-vision`, `frame`, `india`, `money`, `motion`, `names`, `non-text`, `polish`, `readable`,
  `standalone`, `states`); the measured JSON to `non-text`, `ink`, `inventory`, `repaint`. One README in
  `build/`. The rename went as two commits — the pure renames, then the imports, comments, docs and tables
  that followed them.
- **The token sources carry their licence.** The npm registry's metadata for `@atlaskit/tokens@17.0.0`
  declares `"license": "Apache-2.0"` and the package ships a 558-byte `LICENSE` (Copyright 2019 Atlassian
  Pty Ltd, the Apache notice), now copied to `build/ads/LICENSE`; `build/ads/NOTICE.md` names the package,
  the version, the licence text and the origin of each of the four package files. Two files —
  `primitives.json` and `semantic.json` — were read from the documentation site, not the package; the same
  names, values and descriptions ship in the package's `tokens-raw` artifacts, and regenerating both from
  the package at build time is recorded as the open option. **The licence question stays flagged**: the
  site licence's scope, and those two files, are for the owner's legal advice.
- **The search box names its scope.** Today: *Search everything ( / )*; a module page: *Search in Orders*;
  inside a project: *Search in Orders · ANU-01*. `searchScope()` derives it from the frame's label.

### The sample is the seed

The owner's decision was taken as written: the block was not struck, so the sample switched from Northwind
Interiors and its six invented projects (709 mentions of the firm, its projects, vendors and people across 18
generator files, counted at `1ecb050`; the brief said about 800 in 13) to the organisation
`scripts/seed-demo.mjs` writes — **Bhitarang Interiors Private Limited**, at seed commit **`c6ef045`**, with
`scripts/demo-principals.mjs` for the people. A re-derivation, not a rename:

- **`build/seed.mjs`** copies the seed's pure parts verbatim — `mulberry32`, `streamFor`, the identifier
  generators, `orderShape`, the trades, vendors, clients, projects and money fixtures (the seed itself runs
  on import, against a live stack, so it cannot be imported) — and then computes what the product computes,
  by the product's own rules, each cited: a line's GST at the provisional 18% rounded to the paise;
  `committedByProject` as Σ gross over every non-cancelled order and `approvedCommitmentsByProject` over the
  approved ones; the BOQ cost budget and margin at risk from `margin.ts` (approved past the derived budget,
  partial while a line is unpriced); health at 85%; retention at 5% of an order's gross; TDS on each paid
  bill from the provisional catalogue (194C at 2% for a company, 20% under 206AA for the painter with no
  PAN, nil for the transporter with a 194C(6) declaration, 194I plant hire and 194J technical fees at 2%,
  each above its threshold); a tax invoice's heads to the paise and its total to the rupee under Sec 170,
  the challan to ten rupees under Sec 288B; and the numbers the product's series give — `PO-0001` to
  `PO-0018`, `PV/2026-27/0001` to `0006`, `INV/2026-27/0001` to `0004`. The seed's day is fixed as Monday 14
  September 2026 and every relative date resolves against it.
- **The sample gate** reads the two seed scripts as text on every build and refuses any project code, name,
  client, vendor, prospect, stock item, task, order number, bill number or person the design carries that
  the seed does not spell the same way — 69 names. A name the owner changes in the seed cannot survive
  here unnoticed.
- **What changed on Today, as the product computes it.** The hero is ₹1,94,45,914.55 held by six approvals,
  all with Farhan Qadri at the default chain's one stage, the oldest nine days (`backdateForDemo`); margin
  at risk ₹57,18,988.26 on SAN-01 and KRA-01, the two fully priced BOQs, four budgets partial with 23 lines
  unpriced; payables this week ₹6,04,667.40 with ₹75,767.80 overdue, and the cash side absent, which is the
  product's own answer; receivables ₹94,56,583.00 of which ₹45,39,130.00 overdue; and the chart with two
  projects past their contract — KRA-01 at 127%, SAN-01 at 104%.
- **The 88% gap, reported and not bent.** `orderShape` sizes SAN-01's orders to 88% of the contract before
  GST; the product sums orders gross, so SAN-01 stands at 103.84% and no project sits at the watch line.
  The third tile is therefore *Past its contract ceiling* — the project furthest past, KRA-01 — and the demo's
  first stop says two projects have run past their contract, not that one turned amber. The seed's own
  comment expects the amber; the product does not produce it.
- **The demo spine, performable on the seeded product with its logins.** Today as Shalini Kamath → ANU-01, the
  project the client login is linked to → Build › BOQ, the three MEP lines → an order to Prakashvahini,
  which copies the cost rate and takes the next number the series gives, `PO-0019` → Bidisha Sen accepts it
  on her phone → Elizabeth Kuriakose signs off `CO-03`, ₹47,200.00, on her tablet → the measurement sheet.
  The one order above an agreed rate on the seed is `PO-RC-OVER-01`, 11.24% over the conduit rate agreed
  with Prakashvahini, in draft.
- **Where the seed does not reach**, the page says so: imprest, the measurement sheet and the recce are the
  design's demonstration on the seed's names (tagged on part 8 and in the README); every sparkline's
  history is drawn to end at the seeded present; the cash-flow card is not drawn on Today, since the product
  holds no cash position and the seed writes none. The seed has three staff logins and no site engineer,
  quantity surveyor, designer or salesperson, so those screens are played by procurement or the admin, and
  part 12's three roles are the three that exist; no closed project, so the closed state is specified and
  not drawn. Three seed quirks are recorded rather than hidden: its stream orders carry unit rates shaped to
  a share of the contract (a task chair at ₹64,800.00), so rate analysis on the shipped product shows
  deviations of hundreds of percent on them; it raises orders on a handed-over project (PO-0003 waits on
  ANU-02); its design-build agreement value is not the project's contract. The product's tests, stories and
  comments still fixture the old sample — 69 occurrences in 15 files, `today.ts:9` quoting *88% of the
  Kestrel contract* — a product delta in the README.

### What the gates decided

- **Non-text gate, three rules.** A legend swatch must equal its mark in colour (ΔE < 1) and treatment
  (dashed, solid, ringed) in both themes. Every non-text mark is OBLIGATED — band, threshold, series fill,
  marker, legend swatch — and the backdrops are EXEMPT by name with the reason: the track, the legend's track
  swatch, the area fill, a gridline. The gate reads the property that paints each element (fill or stroke
  with its opacity folded in, a border, an inset ring), alpha-composited over its ground — never the token.
- **Alignment gate, one rule.** Sibling cards in one row that carry a header strip and a figure share a
  header height and a figure baseline (spread ≤ 0.5px); the hero clause now accepts the largest card at a
  quarter of the page as well as a figure 1.6× the surrounding text.
- **Build-time.** The stale-phrase gate (25 phrases); one drawing per subject, `ILLO_FOR` injective, every
  drawing present; the sample gate (69 names read from the seed).
- **Money gate amended, not lowered**: a statutory document is recognised by the product's own numbering
  (`INV/…`, `PV/…`) as well as its title; the old `TI-` pattern went with the invented sample.

### Gates

Every gate, run on the committed files (`1d2f20a`) from `docs/design/build/gates.mjs`, both themes, the
reports folder cleared first, after `measure.mjs` refreshed the printed tables on the seeded set (the census
moved with the sample; the marker's legend swatch left the non-text table with the legend rework):

- **Build**: token gate 392 checks, both themes, 0 problems, 39 gate-forced adjustments, none new; the literal
  gate reads the inline styles again and finds none; the stale-phrase gate, 25 phrases; one drawing per
  subject, 22; the sample gate, 69 names. A rebuild from unchanged sources writes the same bytes.
- **Contrast**: 29,762 text elements over 2 themes, 0 below target (66 inactive, exempt).
- **Non-text**: 146 painted pairs (108 obligated) over 2 themes, 0 failures. The new rules, counted: every
  chart mark obligated — on the meter chart the overrun band, the watch line, the series fill, the crossing
  marker and its three legend swatches; the sparklines' band, threshold, series stroke and marker; the stacked
  bar's segments and swatches; the bars — 222 obligated chart rows over both themes; 52 rows exempt as
  backdrops by name and reason (the meter track 8, its legend swatch 8, the filled area under a single-series
  line 28, a gridline 8); 28 legend swatch–mark pairs over both themes, every one the same colour and the same
  treatment, 0 mismatches.
- **Colour vision**: 0 charts colour-only. **India**: 0 flag pairs; chroma per audience, weighted by painted
  area — web 0.0409, operator 0.0415, client 0.0221, vendor 0.0332.
- **Alignment**: 256 renders over 16 files (4 widths × 2 themes × online and offline), 0 distinct faults —
  ALIGN GATE: PASS — including the new check, sibling figure cards sharing a header height and a figure
  baseline within 0.5px wherever a row holds two or more.
- FRAME GATE: PASS — 89 app frames, each led by the product’s mark, with the switcher second in the
  staff app’s bar and none in the vendor’s; 25 inside a project and saying so in the address; 81 page
  headers on one edge and one row; 33 toolbars in one order, a project filter only at the firm level; 28
  lists each stating a count — both themes
- CONSISTENCY GATE: PASS — every metric takes exactly one value in every file that has it
- MONEY GATE: PASS — 858 rupee figures across 16 files, every one in Indian grouping with two decimals;
  16 Provisional marks, each beside a rate or a tax head; 5 draft notices, each on a statutory document
- STATES GATE: PASS — 68 drawn states match the real state they stand for, both themes
- MOTION GATE: PASS
- names gate: 98 frames read, 0 naming a borrowed system
- READABLE GATE: PASS — 19 files, 53,784 lines, none over 120 characters, no page inlines a style or a
  script, one block element a line inside every frame
- STANDALONE GATE: PASS — the folder opens from disk with no server: every page, offline, in both
  themes, with its three shared files

### Found by the gates and fixed

- **A third regex with a backspace byte where `\b` was meant**, in `gates/frame.mjs`, from a patch typed into
  the shell in this pass — the same fault the previous entry records twice. Fixed the same day; patches with
  a backslash are written as files, and `build/README.md` says so.
- The legend rule on its first run: the band's mark carried an inset ring its swatch lacked (the swatch has
  it now); the stacked bar's swatches carried a ring their segments lack (removed); a cross-page grab
  matched the wrong `legend-fill` (grabs are scoped to the chart that owns the legend); symbol parts have no
  box and are allowed none.
- The tile row: `min-height` gave 76/77px strips and a three-line title — an exact height, the last word and
  its help icon wrapped as one, and one-word actions.
- The History lift over-captured a nested *was* block and never closed (a heap exhausted once) — depth-aware
  now, over the whole page before the heading split, with a guard on an unclosed block. One stale phrase
  matched live text that stated the chips were gone — the phrase was replaced by one that only the old
  sentence contains.
- The seeded sample: the 26Q cells carried a Provisional pill with no rate beside it (the rate is in the
  cell now, and a transporter's nil deduction says *declaration on file* with no pill); the sidebar's
  approvals badge said 3 while the hero said 6 (the badge and the section counts read the seed); the
  vendor portal listed an order still awaiting approval (approved orders only); the value-line rulings named
  a site engineer who does not exist (procurement).
- The full suite on the seeded set: with three bills due instead of nine, Money › Bills' list was no longer
  the largest thing on the page at 768 and 1280 (23–25%, the hero clause wants a quarter) — the hero of Bills
  is the payables position, the two cards and the list that makes them up, as one block; and the rate
  analysis toolbar at 400px overflowed by 7px on a vendor's full short name in the filter (the first word,
  as the old sample's filter had shown). 6 faults, 0 after.

---

## 19 September 2026, later — the navigation

Two navigations, one shell. The top bar is the same on every screen of all four apps; picking a project in
its switcher **changes the sidebar**, from the firm's functions to that project's lifecycle, and every list,
search and quick-create inside follows. The pass opened with a checkpoint — a rebuild with no design change,
byte-identical, every gate green — so that every count that moved afterwards moved for a reason that is
written down. The reference reached this pass as measurements in the brief, not as images; no screenshot of
it has been seen.

### The checkpoint

The brief asked for 380 token checks, 256 renders, 94 non-text pairs and 26,876 text pairs. Those are the
18 September figures. The set at the start of this pass measured **387 · 256 · 102 (64 obligated) · 28,568
(68 inactive, exempt)**, and every delta is the previous pass's: +7 token checks are the bar's pairs and the
sidebar's pill, +8 non-text pairs are four new painted pairs in two themes (the bar's search boundary and
icon, the pill and its ink), +1,692 text elements are the full-width lists, the panes and Settings. Nothing
went down. The rebuild from unchanged sources wrote the same bytes (`diff -rq` against a second build), so
there was nothing to commit for the checkpoint; the numbers are recorded here instead.

### What it supersedes

1. **One project at a time as a parameter on the address.** The project is a level, not a filter: inside one,
   the sidebar is the project's lifecycle, the address is `/projects/[id]/…`, and `?project=` survives only as
   a saved-view filter on the firm's lists. `12-project-scope.html` is `03-navigation.html`.
2. **The switcher's ×.** The way out is the sidebar's ◂ All projects. The state pill for a finished project
   moved from the switcher to the sidebar's project block.
3. **The firm's pages marked *firm* inside a project.** The tree says it: Vendors and Agreed rates are not
   in a project's sidebar, so nothing needs a chip.
4. **Settings at the foot of the sidebar; Settings as a category list and a grouped table.** The gear opens a
   hub of cards; *Configure features* at the sidebar's foot opens Modules. The category-list-and-grouped-table
   layout went to the Reports Center, which is new.
5. **Rate analysis under Projects.** Under Sales: pricing happens before award.
6. **No Project filter on any toolbar** (the frame gate, 16 September). A Project column and filter belong on
   every firm-level list and on no project-level list; the gate measures both.
7. **The + New word button, Blue700.** A 32px square on Blue500 — the dark set's `color.chart.brand` — under
   the light set's inverse ink as its plus, 3.50:1; the word is gone, so nothing fails 4.5:1.
8. **The search on Blue900; the open section on the grey accent's subtlest fill; money-out on the red text
   accent.** The lifted field is `color.background.neutral` read in the dark set, an alpha neutral lighter than
   the bar; the open section is Blue100; money-out is the orange text accent, taken as the owner's decision.
9. **Today inside a project.** It is Overview, in Today's card language.
10. **The project pages' phases strip and tab row.** The sidebar is the lifecycle; each page carries its
    section as a crumb.
11. **The frame gate's scope.** It measured only frames with an `.app`; it measures every frame with a top bar
    now, per app — web and operator: the mark then the switcher; vendor: no switcher, square or gear; client:
    no square or gear, a switcher only with more than one project.

### What it adds

- **`03-navigation.html`** — the shell at the web, as a rail and on a phone; the two trees standalone and the
  operator's; the switcher open, typing, empty and on a phone; the quick-create menu; recent history; the edge
  states — handed over (read-only), closed, a project you are not on, one that is not there, a module that is
  off (*not found*, never *refused*), the server unreachable; and the **mapping table**: 65 routes — the 56 in
  `apps/web/lib/routes.ts`, sign-in, export and 7 new — each with its level (firm 18 · project 23 · both 1 ·
  neither 23), the module key from `packages/contracts/src/authz.ts`, the action key, how it is drawn and
  what a link to it draws when hidden. The nav is generated from enabled modules × role permissions.
- **`build/nav.mjs`** — both trees and the table, one source; `build/s12.mjs` the page; `build/overview.mjs`
  the project's Overview, the module-off state and the Getting-started tab.
- **The top bar, measured**: 48px; a 200px brand column with a line-drawn mark and the name at 17px medium,
  ending in a divider darker than the bar; the switcher and a 300×34 search on the lifted fill, the search's
  placeholder the page's — *Search in Orders ( / )*, inside a project *Search in Orders · KEST-01 ( / )*;
  recent history; a *Demo organisation* notice in the caution ink; the tenant, a chevron only with more than
  one; the square, *New · C*; the bell; the gear; a 28px avatar on the tenant's accent. Icons stay 16px on a
  40px pitch. In all four apps.
- **The sidebar, measured**: 200px, 38px rows, an icon on every entry, ▸ on every section, the open section
  Blue100 with its pages indented, the current page a pill with a `+` for its module's quick-create; inside a
  project ◂ All projects and the block — code, name, state, client, contract — then Overview, Design, Build,
  Commercial, People, Close; Approvals pinned at the foot, then Configure features and Collapse; a 48px rail
  under 1000px, behind the menu under 640px.
- **The switcher's menu**: search, All projects, Recent, Mine, All active, Finished folded with its count;
  code, name and client per row; *All projects* · *New project* in the footer. A project the server would
  not resolve is its words on a dashed edge.
- **Overview** (part 4): the project's hero, three figure cards — contract against ordered against billed
  with a ratio bar, margin at risk, this week on site — then waiting on the client, open variations, next
  milestones, the team. **Getting started**: a tab beside Today with seven steps until they are done.
- **Lists**: the saved-views menu under the title — the firm's views, then yours, a star per favourite,
  *+ New view* with criteria, columns and favourite; the kebab's menu — sort, import, export, refresh,
  columns; a document toolbar — PDF, Send, then the decision or the money action — on the order page and at
  the top of the bill, invoice and voucher panes.
- **Reports Center** (part 11, net-new and marked so): Favourites first in the category list, fifteen reports
  in five groups with a count badge each and a star per row. **The settings hub**: fourteen pages as cards.
  **Terminology**: BOQ or Estimate, Variation or Change order, Daily report or Site diary, Vendor or Supplier.
- **The keyboard**: `/` scoped to the page, `Shift+?`, `N` the primary, `C` then a key to create, `P` the
  switcher — every single key under the one off switch.
- **Portals**: the same navy bar, fewer controls; on a phone the mark, the search as its icon, the bell and
  the person.
- **Demo** (part 14): the walkthrough crosses the two levels once, on the demo organisation.
- **Tokens**: `--topbar-lift`, `--topbar-lift-hover`, `--topbar-div`, `--new-sq`, `--new-sq-hover`,
  `--tenant-accent`, `--star` in the component layer, each at a published token; `--nav-open` and
  `--owed-current` re-pointed; `--money-out` re-pointed and declared apart from `--money-in`; `--side-width`
  200, `--side-width-rail` and `--topbar-height` 48, `--bar-control-height` 34, `--search-width` 300,
  `--brand-size` 17, `--avatar-size-bar` 28 as geometry. No new primitive; 39 adjustments stand.
- **A `.page-theme` rule in `tokens.css`**: a menu opened from the dark bar resolves the page's theme, not
  the bar's, because a custom property resolves where it is declared and the popup inherited the island's.

### What the gates decided

- **The search's hairline**: the published border on the lifted fill measured 1.69:1 against the bar and
  failed 1.4.11 as a control boundary; the search's boundary is `color.border.input`, 3.65:1 — the same token
  every input's boundary is.
- **The plus on the square**: the dark set's inverse ink is near-black (4.70:1 on Blue500, the published
  dark-mode anatomy for a bold fill); the reference's white plus wins, as the light set's inverse ink, 3.50:1.
- **The lifted field**: the token gate holds that it is lighter than the bar; `color.background.neutral`
  read in the dark set paints `#29374D`, 1.7 from the measured `#333850`.
- **The product's name**: 18px does not fit the seventeen-character name in the 200px column beside a 16px
  mark; 17px is the largest that does.
- **Icons**: the consistency gate holds one icon size in the set; the reference's ~18 stays 16.
- **Money-out on the orange text accent**: the India layer, re-run on the token table with the two swatches
  declared apart, finds 0 flag pairs on every file in both themes.
- **Chroma per audience, measured after the bar reached the portals**: staff 0.0406, operator
  0.0423, client 0.0307, vendor 0.0340 (OKLCH chroma weighted by painted area). Both portals
  stay below the staff app, which is what the rule promises, so it ships as written and nothing in 13 · Decisions
  is superseded on it. Two things are recorded rather than acted on: the client's screens are now the quietest,
  not the vendor's (last pass vendor 0.0244, client 0.0274 — the navy bar is a larger share of a phone frame than
  of a tablet's); and the operator console, one frame of 30 painted areas against the staff app's 7,534, edges
  above the staff app on the strength of three plan lozenges in a small table. The operator console is ours,
  not a portal, and the rule's subject is the portals; the other branch — no portal screen carries a
  status-coloured element — was not taken, because the portals' lozenges are the one status colour they carry
  and the inversion is not theirs.
- **Rows needing this person**: already the lightest published purple; there is no lighter step to take.

### Gates

Every gate, run on the committed files from `docs/design/build/gates.mjs`, both themes:

- **Build**: token gate 392 checks, both themes, 0 problems, 39 gate-forced adjustments, none new; the literal
  gate reads the inline styles again and finds none. A rebuild from unchanged sources writes the same bytes.
- **Contrast**: 33,082 text elements over 2 themes, 0 below target (68 inactive, exempt).
- **Non-text**: 110 painted pairs (72 obligated) over 2 themes, 0 failures.
- **Colour vision**: 0 charts colour-only. **India**: 0 flag pairs; chroma per audience, weighted by painted
  area — web 0.0406, operator 0.0423, client 0.0307, vendor 0.0340.
- **Alignment**: 256 renders over 16 files (4 widths × 2 themes × online and offline), 0 distinct faults —
  ALIGN GATE: PASS.
- FRAME GATE: PASS — 90 app frames, each led by the product’s mark, with the switcher second in the staff
  app’s bar and none in the vendor’s; 26 inside a project and saying so in the address; 82 page headers on one
  edge and one row; 33 toolbars in one order, a project filter only at the firm level; 28 lists each stating a
  count — both themes
- CONSISTENCY GATE: PASS — every metric takes exactly one value in every file that has it
- MONEY GATE: PASS — 846 rupee figures across 16 files, every one in Indian grouping with two decimals; 18
  Provisional marks, each beside a rate or a tax head; 5 draft notices, each on a statutory document
- STATES GATE: PASS — 68 drawn states match the real state they stand for, both themes
- MOTION GATE: PASS
- names gate: 99 frames read, 0 naming a borrowed system
- READABLE GATE: PASS — 19 files, 54,670 lines, none over 120 characters, no page inlines a style or a script,
  one block element a line inside every frame
- STANDALONE GATE: PASS — the folder opens from disk with no server: every page, offline, in both themes, with
  its three shared files

### Found by the gates and fixed

- **Two regexes in the generator carried a backspace byte where `\b` was meant** — `build.mjs`'s inline-style
  scan, which therefore matched nothing, and a money-direction rule in `lib4.mjs`. Both fixed; the revived
  scan finds no literal in any inline style. A shell once turned the two characters into one, which is why
  patches with a backslash are written as files and never typed.
- The chevron in the icon rail (a section's ▸ stayed visible at 48px); the history panel positioned against
  the frame instead of its button; the switcher shrinking under the operator's tenant name; a long entry
  widening every sidebar row (the grid's track is `minmax(0, 1fr)` now, and a long label ellipsizes).
- The full suite's alignment gate, on the first run of the final set: the settings hub's cards measured as a
  `Card` with a body's padding (they are their own composition now, a link with a border); the terminology
  radios sat off their labels' x-height (the input in a strut, as every radio in the set); the *new* pill in a
  card's title off the text baseline (in the title's flow, not a flex row); the demo notice's icon painted
  amber on a stroke (the notice is text alone); the person on a phone's portal bar shorter than the bell
  (the button is the touch height, the disc stays 28); and Tax deducted's hero no longer the largest card at
  1440 once the sidebar narrowed — the screen has a hero now, the month's deposit and its due date, which it
  should have had. 73 faults, 0 after.

---

## 19 September 2026 — the build, and the look measured

Two things in one pass. **The build is source**: the generator that wrote every page, and every gate that
proved it, moved from a session scratchpad into `docs/design/build/`, where one command rebuilds the whole
set from a clean clone with nothing but what the workspace already has, and one runs every gate. Every page
now links one shared `design.css` and `design.js` instead of inlining them, and is laid out one element a line
with no line over 120 characters — the pages rendered before and after the layout were compared element by
element, box, colour and rendered text, and nothing moved. **The look was measured**: the owner measured the
books the buyers keep, screen by screen, and the shell, the tiles, the lists, the panes and Settings were
redrawn to those measurements, each value taken to the nearest published step and put through the gates.

The reference reached this pass as measurements in the brief, not as images.

### What it supersedes

1. **The generator stays in the scratchpad; only the built set is committed.** README item 10 is decided the
   other way: the generator is source, in `docs/design/build/`, and the set is its output.
2. **Every file stands alone with its stylesheet inlined.** The standalone gate is redefined: the *folder* opens
   from disk with no server — every page loads `tokens.css`, `design.css` and `design.js` beside it, and the
   gate proves all three arrived.
3. **The switcher leads the top bar.** The product's mark leads, over the sidebar column; the switcher is
   second. The frame gate measures the new order.
4. **The top bar as the dark neutral surface; the sidebar on the default surface.** The bar is navy — the
   brand's subtlest surface in the dark set, which the bar resolves in both themes — and spans the whole
   window; the sidebar is the sunken cool grey, with 38px rows.
5. **Caution is a fill carrying an ink, and never bare text.** The owner's rule of 19 September: no highlighter.
   The caution fill is for a lozenge or a section message only; a figure, a label or a sentence never sits on a
   coloured fill; amber as text is allowed and the contrast gate holds it (5.93:1 light, 8.36:1 dark). The
   alignment gate's rule was rewritten to that — it fails a highlighter and still fails amber on a stroke or a
   border. Marked in `13-decisions.html`.
6. **Today's three stats.** They are the money card now: header strip, figure, one line of meaning, a
   proportion bar where there is a ratio, the figures beneath. The sparklines are gone; the advice a tile
   highlighted is its header's action.
7. **A list with a record open beside it leads its section, and priority 2 folds beside a record.** Every list
   leads with its full-width state; the record beside the list is the second state, opened by clicking a row,
   and it keeps number, status and amount as columns. `COMPONENT-MAP.md` §4 is superseded in part.
8. **The pager's numbered pages.** The footer reads the total, the page size and the range, with previous and
   next.

### What it adds

- **`docs/design/build/`** — the generator (`build.mjs`, its modules, the token sources it read), the layout
  (`tidy.mjs`), every gate, the runner (`gates.mjs`), the re-measure (`measure.mjs`) and a new gate,
  **readable** (`readable.mjs`): no line over 120 characters in any `.html`, `.css` or `.js` in the set, no
  page inlining a style or a script, one block element a line inside every frame.
- **`design.css` and `design.js`** beside `tokens.css`, shared by every page. The set fell from 4,741.9 KB to
  1,999.5 KB by the split, and stands at 2,640.1 KB laid out for reading, with every element, sprite and
  sentence still there.
- **The shell, measured.** The top bar across the window: the product's mark at the far left over the
  sidebar column, the switcher, the search with its `/` hint; the tenant's name, **+ New**, the bell, settings,
  the person. Navy (`--topbar`, Blue1000) with the search one step lighter (`--topbar-search`, Blue900). The
  sidebar on the sunken surface (`--side`): 38px rows (`--nav-item-height`) with a 14px label and an icon, a
  small triangle on every section, the open section tinted (`--nav-open`) with its pages indented — Today is
  drawn with Projects open — the current page the Blue700 pill, a collapse control at the foot.
- **Today's three tiles on the money card** (`FigureCard`): *Margin at risk* with its two projects beneath and
  *Raise a variation* as its action; *Cash against this week's payables* with a shortfall bar — in hand over
  due, the short part on the yellow ramp — and *Bills due*; *Closest to its contract ceiling* with a ratio bar
  and *Open KEST-01*.
- **Lists in the reference's columns**: date, number as a link, vendor, project, a status lozenge, the amount
  right-aligned, an attachment clip — on Orders, Bills, Payments, Client billing; Retention and Approvals in
  their own order with the step as a lozenge. The head row on the sunken surface with small-capital heads;
  *View by:* then *Status: All* · *Period: All*; the footer *Total 41 orders · 12 per page · 1–12 ‹ ›*. Each
  list first at full width, then with a row clicked.
- **One rule for a pane's action row**: docked at the foot, the primary at the far right, a secondary beside
  it, the destructive action as a subtle button at the far left. Orders and Approvals follow it.
- **Settings — thirteen pages in one place**: a category list on the left, one grouped table on the right with
  a count badge on each group and a star to favourite a row.
- **No highlighter**: overdue is an amber small-capitals label over an ink figure; a page-level warning is
  amber text with its icon; a due-today mark is amber text.
- **Tokens**: `--topbar`, `--topbar-search`, `--side`, `--nav-open` in the component layer, each pointing at a
  published token; `--side-width`, `--side-width-rail`, `--topbar-height`, `--nav-item-height` as geometry.
  No adjustment was needed: 39 stand.
- **`TOKEN-DIFF.md` §6 — the reference's values, mapped**: every measured value, the nearest step on the ramp
  the brief named, the gate's verdict, the token used.

### What the gates decided

- **+ New at the reference's blue (Blue500)**: white on it holds 3.50:1 — a plus passes 3:1, the word fails
  4.5:1 — and no background token in either set resolves to Blue500, so the button is the published primary,
  Blue700, 5.20:1 with its word, drawn as the light set's primary inside the dark bar.
- **Dividers at the reference's grey (Neutral200)**: 1.13:1 on the card, under the 1.4:1 floor the non-text gate
  raises for dense tables; the published border stays, 1.96:1.
- **Money in at Green500**: 2.47:1; Green700 passes on the card and fails on the sunken surface; the green text
  accent (Green800) stays, 6.17:1.
- **Money out at the orange ramp**: Orange600 (the nearest step) and Orange700 fail AA; the orange text
  accent, Orange800, passes at 6.02:1 on the card and 5.67:1 on the sunken surface, and the India layer
  found no pair with green money-in on any product screen — the cash-flow card, the ledger, Client billing —
  but two pairs 18px apart in the component-token table on part 0, where the money-in and money-out swatches
  are neighbours. The gate is the authority, so the red text accent stays; taking the orange means accepting
  that one adjacency on the foundations page, which is the owner's call.
- **Rows needing this person, lighter**: the purple in use is the lightest step the palette publishes.
- **The open section's tint**: Blue100 is the nearest step but blue is never a state; the grey accent's subtlest
  fill is used.

### Gates

Every gate, run on the committed files from `docs/design/build/gates.mjs`, both themes:

- **Build**: token gate 387 checks (380 before), 0 problems, 39 gate-forced adjustments, none new; 150 primitives,
  316 semantic and 176 component tokens; 1,506 values declared in `tokens.css` and none anywhere else in 16
  files; 83 value-line keys, each resolving once; 18 of 18 links rendered; 652 token names in the prose, every
  one real; a rebuild from unchanged sources writes the same bytes. Nothing names the borrowed system or the
  reference.
- **Readable** (new): 19 files, 49,703 lines, none over 120 characters, no page inlining a style or a script, one
  block element a line inside every frame.
- **Alignment**: 256 renders (400, 768, 1280, 1440 · light, dark · online, offline), **0 faults**.
- **Contrast**: 28,568 text pairs, 0 below AA, body ink AAA, 68 in inactive controls counted and exempt;
  **non-text** 102 pairs, 64 obligated, 0 failures — the pill 4.89:1 against the sidebar in light and 6.42:1 in
  dark, the bar's search boundary 3.65:1 and an icon on the bar 6.20:1, the + New fill 2.74:1 against the bar
  recorded as exempt because its word identifies it; **colour vision** 0 charts whose meaning survives only in
  full colour; **money** 778 figures in Indian grouping, 18 Provisional marks, 5 draft notices, 0 violations.
- **India**: 0 flag adjacencies (the orange money-out that would have made two on part 0 was not taken); red
  on loss, refusal, failure and money going out, each with its sign or its words; mean background chroma —
  vendor 0.0244, client 0.0274, operator 0.0336, staff 0.0391 (before: 0.0245, 0.0277, 0.0283, 0.0357 — the
  staff shell gained the navy bar, and the operator console wears that shell).
- **Motion**: 12 specimens, 45 motions, nothing moves under reduced motion in any of the 16 files. **States**:
  68 drawn states, both themes, no difference.
- **Consistency, standalone, polish, frame, names**: pass — 35 metrics one value each; 16 files opening from
  disk with their three shared files; 80 app frames led by the product's mark with the switcher second, 25 in a
  project, 78 page headers, 30 toolbars, 25 counted lists; 96 frames naming no borrowed system.

### Found by the gates and fixed

- The layout's CSS pass emitted a stray semicolon between two rules inside a container block, which dropped the
  rule after it — the menu item's description lost its column layout. Caught by the element-by-element render
  comparison; comments between rules now keep a line of their own.
- A tab-under-tag key (`div>small`) claimed every `<small>` under a `<div>` as a block container, so a stat's
  unit gained a space before it. Caught by the same comparison; a tag-under-tag key now holds only with no
  further context.
- The contrast gate's own `URL` constant shadowed the global once the gates moved; renamed.
- At a tablet's width the switcher shrank to nothing beside the new bar; it keeps a floor and the tenant's
  name goes. On a phone the mark goes and the hamburger leads.
- The pane state's detail line hung under the first column, which is the date now; it hangs under the identity
  column wherever it sits.
- Settings' category list scrolled past the viewport on a phone; it wraps as chips.

---

## 18 September 2026 — the look the buyers know

The theme is now the one our buyers run their books in. They already keep it and Tally open all day, so the app
is drawn to feel like that tool — and nothing of it is reused: no logo, icon, asset or wording. Every shape is
a published component or a composition that says so, and every colour is an accent token this system already
published and the plain retheme left unused: `color.background.accent.*.subtlest` under `color.icon.accent.*`
on a stat's disc, `color.text.accent.green` and `.red` on money direction, `color.background.accent.yellow.bolder`
and `.gray.bolder` on the owed bar, `color.background.selected.bold` under `color.text.inverse` on the current
page's pill, `color.background.accent.blue.subtlest` under a single-series line, `color.background.accent.purple.subtlest`
on a row waiting on this person. No new primitive. The token structure, the components, the drawings, the motion
page, the scope, the sidebar's sections and the value lines stand; every gate stays the authority and still
passes, and no value moved for one.

The reference reached this pass as a written description, not as images; the screens were drawn to the
description, and the report says so.

### What it supersedes

Kept and marked superseded in place, with the date and the reason, wherever it is part of the decisions record.

1. **Navigation's selected state — the selected fill, selected ink and a 2px bar.** The current page is a solid
   pill: the bold selected fill under the inverse ink, 5.20:1 in light and 6.00:1 in dark; in the icon rail the
   section holding the current page takes the pill. The finding that a grey fill alone fails 3:1 stands.
   Marked in `13-decisions.html` and `COMPONENT-MAP.md`.
2. **Sentence case everywhere.** A table's head, and the small label over a figure (*Total*, *Current*,
   *Overdue*), are set in small capitals with a medium letter-spacing, as the books the buyers keep set them.
   Sentence case stands everywhere else. Marked on `00-foundations.html`.
3. **The quiet chrome — the brand as the only hue in the shell.** The accents now carry meaning beside the
   chrome: a disc behind a stat's icon, green and red on money in and out, the yellow ramp on what is overdue,
   the purple tint on a row waiting on you. None of it is blue, so *the brand out-saturates every piece of
   chrome* and *blue is action, link, focus and selection, never a state* both still hold. Marked in
   `13-decisions.html`.
4. **Red confined to money going the wrong way, a refusal or a failure.** Red also marks money going *out* —
   a payment, a ledger's out column, the cash-flow card's outgoing total — always with its minus sign, as a
   direction and not a judgement; the India gate lists every such figure with its text. Marked in
   `13-decisions.html`.
5. **The Money card removed from Today (16 September).** It returns in a new shape: *Total receivables* and
   *Total payables* as owed cards, and a cash-flow card, all from figures the Money screens already compute.
   Marked in `VALUE-MAP.md`.

### What it adds

- **The top bar as a dark island.** It carries `data-theme="dark"`, so the dark neutral surface, input and brand
  tokens resolve inside it in both themes, and holds the product mark, the project switcher (still first among
  the controls, as the frame gate measures), the search with its `/` hint, one solid blue **+ New**, the bell,
  settings and the person. Under 640px the search is an icon, New is an icon, and the mark, settings and the
  person leave the bar.
- **The + New menu**, drawn open on part 4: everything this person may create, grouped by area — Sales, Projects,
  Buying, Site, Money — each item saying whether it is the firm's or belongs to a project, and inside a project
  which one; outside a project an item that needs one says *asks which project*.
- **The sidebar**: an icon on every item, a chevron on every section, a section's pages indented, the current
  page a solid pill with its count inverted, a collapse control at the foot. The product mark moved from the
  sidebar to the top bar.
- **Cards under a header strip** on the sunken surface, with the title, a help icon (an icon button whose label
  is the help text) and at most one action; a card that would only repeat the list's view name has no header.
- **Every stat carries a disc** — its icon on an accent's subtlest fill under that accent's icon colour, one
  accent per tile, each pair 3:1 or better: green money in, red money out, yellow what needs watching, teal
  cash, blue orders and contracts, purple what waits on a person, magenta the site, grey a plain count. The
  compact stat in a drawer carries none.
- **Owed cards** — *Total receivables* and *Total payables* on Today, Bills and Client billing: the total, a
  proportion bar (the overdue part on the yellow ramp, 4.63:1 on the card in light; the not-yet-due part grey;
  a hairline of the surface between), the split beneath as *Current* and *Overdue*, and a note. The bar is
  `role="img"` with the percentage as its label.
- **A cash-flow card** on Today: six months to today as a single-series line on a light fill with a marker per
  point, and cash at the start, incoming, outgoing and cash today beside it; the figures balance and the build
  asserts it. The source is what is recorded here, not Tally.
- **Money direction as coloured text with its sign**: incoming `+₹…` on the green text accent, outgoing `-₹…`
  on the red one, overdue as the caution ink on the caution fill, a total or a not-yet-due figure plain. Drawn
  where a screen holds both directions — the cash-flow card, Client billing's received column, Payments' and
  Retention's tiles, the site cash ledger's in and out columns — and not on a list where every row runs one
  way. Coloured plain text is for money direction only.
- **Lists**: the title is the view's name with a chevron — *All orders*, *All vendors*, *Bills due*, *Waiting
  on you*, *All invoices*, *All holdings* and so on, 21 lists; a kebab before the one primary; *View by* before
  the filters; small-capital heads; names as links; money right-aligned; two-line cells; a row waiting on this
  person tinted with the waiting lozenge's colour (Approvals' two orders at the finance check, Tasks' open
  items on Rahul); a page-level warning beside the title as a chip on the caution fill (*GSTIN missing for 2
  vendors*). A section page with tabs — Sales, Site — keeps its section title.
- **Twenty-five component tokens** through the component layer: `--nav-current`, `--nav-current-ink`,
  `--card-head`, `--disc-<hue>` and `--disc-<hue>-icon` for eight hues, `--money-in`, `--money-out`,
  `--owed-overdue`, `--owed-current`, `--chart-area`, `--row-mine` — each pointing at a published accent or
  surface token (`TOKEN-DIFF.md` §4).
- **On 00 · Foundations**, a sample of colour where it carries meaning — the eight discs, the three directions,
  an owed card, the pill — with the token behind each; the non-text table gains the pill, the bar and the discs.
- **On 1 · Components**, the inventory grows by the top bar (published) and eight compositions — the + New
  menu, the disc, the owed card, the cash-flow card, money direction, the view switch, the warning chip, the
  row waiting on this person — 6,312 elements in the product frames.

### Deviations from the reference, and the gate or rule behind each

- **Overdue is the caution ink on the caution fill, not bare amber text.** Caution is never bare text (the
  alignment gate), and the orange text accent sits at 52°, inside the saffron window the India layer keeps
  clear of green.
- **A page-level warning is ink on the caution fill with its icon in ink**, not amber text with an amber icon —
  the same rule.
- **A row needing this person's action is tinted purple, not green.** Green is money coming in; the waiting
  lozenge's family says *on your desk*.
- **The switcher stays first in the top bar, before the search** — the frame gate measures it there.
- **The kebab sits before the primary** — the frame gate keeps the primary last.
- **No project or person filter in the View-by bar.** The switcher is the one project filter (the frame gate
  forbids another); a person filter is a decision this document does not take.
- **Status in a table is a lozenge**, never coloured plain text — the published lozenge, and *coloured plain
  text is for money direction only*.
- **Sub-pages are indented without an icon**, as the reference's are; sections and flat pages carry one.
- **The portals keep the quiet drawing** — neutral discs, no direction colour — because the India gate's
  chroma per audience keeps the supplier and the client below the staff app, and it does: vendor 0.0245,
  client 0.0277, staff 0.0357.
- **Blue is never a state.** No blue disc, tint or text stands for a condition.

### Gates

Every gate, run on the committed files, both themes:

- **Build**: token gate 380 checks (340 before), 0 problems, 39 gate-forced adjustments, none new; 150 primitives,
  316 semantic and 168 component tokens; 1,498 values declared in `tokens.css` and none anywhere else in 16 files;
  76 value-line keys, each resolving once; 18 of 18 links rendered; 677 token names in the prose, every one real;
  no file names the borrowed system or the reference.
- **Alignment**: 256 renders (400, 768, 1280, 1440 · light, dark · online, offline), **0 faults**.
- **Contrast**: 26,876 text pairs, 0 below AA, body ink AAA, 68 in inactive controls counted and exempt;
  **non-text** 94 pairs (64 before) across every file, 0 obligated or raised failures — the pill 5.20 light and
  6.00 dark, the owed bar's overdue part 4.63 and 8.25, the tightest disc 3.06 (yellow, light); **colour vision**
  0 charts whose meaning survives only in full colour; **money** 705 figures in Indian grouping, 18 Provisional
  marks, 5 draft notices, 0 violations.
- **India**: 0 flag adjacencies; red on loss, refusal, failure and money going out, each with its sign or its
  words; mean background chroma — vendor 0.0245, client 0.0277, operator 0.0283, staff 0.0357 (before: vendor
  0.0245, operator 0.0267, staff 0.0307, client 0.0315 — the staff app gained the colour and both portals are
  below it again).
- **Motion**: 12 specimens each playing exactly the tokens it names, 45 motions compared, nothing moves under
  reduced motion in any of the 16 files. **States**: 68 drawn states, both themes, no difference.
- **Consistency, standalone, polish, frame, names**: pass — 35 metrics one value each; 16 files offline and
  alone; 73 app frames, 25 in a project, 71 page headers, 24 toolbars, 19 counted lists; 89 frames naming no
  borrowed system.

### Found by the gates and fixed

- The top bar's search collapsed to nothing beside the switcher, the mark and New at a phone's width; the bar
  now gives the search first claim on space and, under 640px, folds New to an icon and drops the mark, settings
  and the person.
- The New menu overflowed its frame at 1000px and under; it anchors to the bar's right edge there.
- A stat on part 3, outside any frame, kept three columns at 400px and its label lost its width to the disc;
  a sample's bare stats now reflow with the sample's width, as they would inside a frame.
- A card title with a help icon could not wrap; a view-switch title sat 4px outside its heading.
- The colour-vision gate counted the cash-flow card's sparkline as a chart of its own and asked for a legend;
  a sparkline inside a chart is that chart's line.
- The rail's section icon took the pill only under a viewport media query, so a frame narrower than 1000px in
  a wide window showed the old square; it is a container query now, as the rail itself is.
- A token name inside a caption on part 0 measured 4.25:1 on its chip; it takes the body ink.

---

## 17 September 2026 — the elements

The theme was on a published enterprise design system; now the components, states, charts, illustrations and
motion are too. Every element the set draws was inventoried, mapped to the published component it is, and
redrawn to that component's anatomy, sizes, appearances and states as read from its package on 17 September —
where the system publishes nothing (a rupee field, a BOQ quantity, a chart, a record beside its list) the
element is composed from published primitives and says so. Two parts are new: **1 · Components** and **14 ·
Motion**. The gates stay the authority; every value they adjusted before stays adjusted, and the pass added
five adjustments of its own.

### What it supersedes

Kept and marked superseded in place, with the date and the reason, wherever it is part of the decisions
record.

1. **The grey in-progress lozenge with a dot.** It was a taste — the reasoning that a blue lozenge beside blue
   links would read as something to press — and the owner dropped it. *In progress* is the published
   information lozenge. Marked in `00-foundations.html` and `13-decisions.html`.
2. **The fourteen illustrations and their drawing system** — the 96-unit canvas, two planes, one accent, one
   ground bar, and the salience rank that held the accent first in both themes. Withdrawn for six drawings
   from the trade in the owner's described style (below), on a 160-unit canvas, decorative. The nontext
   table's salience ranking is withdrawn with them.
3. **"Every empty state has one illustration, one sentence, at most one action."** The published anatomy is an
   image, a heading, a description, a secondary action before the primary, and a link; the gate now checks
   that, and that the heading and description are present because the image says nothing on its own.
4. **The focus ring on every control.** A button or a link keeps the 2px ring set 2px out; a text field, a
   select and a text area take the published field's focused state — the border in the focus colour, 2px in
   all, no outer ring. The polish gate reads that state on a real focused field.
5. **The illustration planes and accent held to 3:1.** The owner's call of 17 September: a decorative image is
   exempt under WCAG 1.4.11, so the fills are exempt and the line alone is held to 3:1. The reason is written
   where the gate is defined (`tokens6.mjs verify()`, `nontext2.mjs`), not in a lowered floor.
6. **The searchable picker as a search field over a select.** One control now, the published select's
   anatomy.
7. **The notice as the shape of a whole-page answer.** Unreachable, not found, gone wrong, signed out and a
   project you cannot open are empty states with one primary action, as the published empty state is used
   for; a refusal inside a screen stays a section message, whose actions are links.
8. **The table's 16px edge cells and the open row's bar.** Cells are 4px by 8px with the first and last flush
   and the table inset by its card, as published; a highlighted row is the selected fill alone.
9. **The reduced-motion rule that stopped everything.** It was `animation: none; transition: none` on every
   element. Now every motion token is redefined under reduced motion so an entrance or exit crossfades, a
   transform cuts, and a colour changing in place is unchanged — nothing travels, turns or scales.
10. **The 14px small icon.** A chevron or a small mark is 12px, as the iconography page specifies.

### What it adds

- **1 · Components.** The inventory — 37 published components, 21 compositions, 1 piece of the document's own
  furniture, with the count of each in the product frames (5,474 elements) — then every element in every
  state, default, hover, pressed, focused, selected, disabled and loading, in light and dark side by side:
  button in five appearances, spinner, skeleton, progress bar and tracker, lozenge, tag and badge kept apart,
  avatar and group, section message, inline message, banner, flag, tooltip, popup, dropdown menu, modal,
  drawer, tabs, breadcrumbs, pagination, the table, the charts, the empty state in both sizes with the six
  drawings, text field, select, checkbox, radio, toggle, date picker and inline edit. Every state is written
  once as a selector list (`:hover, .is-hover`), so the specimen and the real state are the same rule.
- **The three kinds of wait, where the product waits** (part 12): a skeleton holding the orders list's shape
  the first time; a spinner in the record pane beside its list and in the *Approve* button being saved; a
  progress bar in the export flag, 1,240 of 4,000 orders, because the amount done is known.
- **The published components drawn in the screens that use them** (parts 4, 3, 4, 6): the warning banner
  across the whole app while the Tally connector is offline; a BOQ quantity edited in place and the team as an
  avatar group; the delivery date's date picker open in the raise-order drawer; an order's *More* menu open
  and its cancel modal; the flag after an approval; the inline message behind *Provisional*.
- **Six drawings from the trade** — a BOQ sheet, a site cone, a tape measure, a drawing roll, a delivery
  crate, a stamped voucher — flat blocks of the accent colours under one hand-drawn line in the icon colour,
  two or three sparkles off the object, edges that bow a unit, a dark variant by construction. Decorative:
  `aria-hidden` on every reference. The licence finding: every published drawing is routed through galleries
  marked for the system's own products and the site licence forbids derivative works, so none was used or
  viewed as a model; the icon and logo packages are Apache-2.0 but the icons are this product's own by the
  standing instruction and the logos are trademarks; the tokens and anatomy are followed as published values
  and measurements, and whether the site licence's scope reaches that use is flagged for legal advice, not
  settled here.
- **Charts on the data-visualisation guidance.** Title in the text colour, tick labels subtle, gridlines the
  border colour, axis the bold border, one mark colour — the brand chart colour — unless the data is a
  status, a hairline of the surface between adjacent chart colours, no text on a chart colour, the data in
  words under every chart. Projects by health is the status series in the owner's order (off track, at risk,
  on track, paused) in the bold status chart colours, off track hatched and paused stippled; ordered by month
  is bars on axes with the hovered bar's tooltip; sparklines take the brand chart colour.
- **2 · Motion.** Twelve specimens, each playing its published token with a replay button: hover and press,
  spinner, skeleton, popup, flag, modal with its blanket, drawer, the record pane's content, a section
  expanding, a tag, the toggle's knob, a progress bar's fill. A switch shows the page under reduced motion,
  and the page says when the device already asks for it. Every motion token as published and as reduced.
  `tokens.css` carries the 56 published motion tokens and 22 keyframes, the spinner's, skeleton's, tooltip's
  and toggle's own, and three composed from the published durations and curves (a section expanding, a
  chevron, a progress fill).
- **Five gate-forced adjustments** (39 now): the light caution lozenge's fill, hover, pressed, border and ink
  moved from the orange ramp to the yellow one, because the published pale orange under an orange ink beside
  the done lozenge drew the flag — eight pairs on part 0, two on part 9 — and the dark caution already took
  yellow, so caution is one colour in both themes.

### Deviations kept, and the gate behind each

- **Navigation's selected state is the brand fill, not the neutral one** — the neutral state fails 3:1
  (the non-text gate).
- **The status chart series is the bold step** — the base success and warning chart colours measure 2.44:1
  and 2.47:1 on the light card, under the 3:1 the non-text gate holds every chart mark to, so the whole series
  takes the bold step and stays one family.
- **The 39 token adjustments** — each names its gate in `TOKEN-DIFF.md`.
- **A caution notice's icon is in ink, not the caution colour** — caution is never a stroke (the alignment
  gate's caution rule).
- **Touch heights on a phone or tablet** — 44px controls (the portal rule, the consistency gate's declared
  variant).
- **A hero's one action is a 40px button** — the alignment gate's hero clause names it.
- **The reduced set crossfades where the published system cuts** — the owner's rule of 17 September, held by
  the motion gate.

### Gates

Every gate, run on the committed files, both themes:

- **Build**: token gate 340 checks, 0 problems, 39 gate-forced adjustments; 150 primitives, 316 semantic and 143
  component tokens; 1,473 values declared in `tokens.css` and none anywhere else in 16 files; 74 value-line keys,
  each resolving once; 18 of 18 links rendered; 652 token names in the prose, every one real.
- **Alignment**: 256 renders (400, 768, 1280, 1440 · light, dark · online, offline), **0 faults**.
- **Contrast**: 25,748 text pairs, 0 below AA, body ink AAA, 68 in inactive controls counted and exempt;
  **non-text** 64 pairs measured across every file, 0 obligated or raised failures, the illustration's line
  10.56:1 dark and 14.34:1 light; **colour vision** 0 charts whose meaning survives only in full colour;
  **money** 654 figures in Indian grouping, 18 Provisional marks, 5 draft notices, 0 violations.
- **India**: 0 flag adjacencies after the caution adjustment; red only on loss, refusal and failure; mean
  background chroma — vendor 0.0245, operator 0.0267, staff 0.0307, client 0.0315.
- **Motion** (new): 12 specimens each playing exactly the tokens it names; the page's switch and the device
  setting compute the same 45 motions; under reduced motion nothing moves in any of the 16 files.
- **States** (new): every element drawn in a state on the components page against the same control at rest
  put into the real state — 68 drawn states, both themes, no difference in what the page computes.
- **Consistency, standalone, polish, frame, names**: pass — 35 metrics one value each; 16 files offline and
  alone; 72 app frames, 24 in a project, 70 page headers, 24 toolbars, 19 counted lists; 87 frames naming no
  borrowed system.

### Found by the gates and fixed

- The published pale-orange caution lozenge sat beside the done lozenge in every status row and drew the
  flag — eight pairs on part 0, two on part 9; the light caution fill, hover, pressed, border and ink moved to
  the yellow ramp the dark caution already took.
- The hamburger button shared its class with the dropdown menu and took the menu's minimum width, which
  squeezed the switcher out of a phone's top bar; renamed. An icon button could shrink in a flex row; it cannot.
- A section message's *Try again* was a button drawn as a link, so the whole-page unreachable state lost its
  one primary action and its hero clause; the whole-page answers are empty states now.
- The document's note on a sample title was rendered as a product tag, which cannot wrap, and overflowed a
  phone; it is the document's own furniture again.
- The old overflow gate counted a popup's width against the element it was anchored to, so every inline
  message failed at every width; the popup is now checked against the viewport, where at 400px it did overflow
  — under 640px it runs across the foot of the screen, and under 1000px it anchors to its trigger's right edge.
- A menu item's title could wrap under its icon; a title and a description truncate, as the published menu
  item's do by default.
- The polish gate read a field's border in the first frame after focus, before its published transition had
  moved it; it waits.
- The states gate, once it existed, found the text field's hover and focus specimens and the select's focus
  specimen losing to the base field rule's specificity — a specimen drawn at rest while the real state was
  right — and a menu item disabled by its `disabled` attribute drawn as enabled because only `aria-disabled`
  was styled. All four fixed.
- The non-text gate read its probes from whichever pane came first — a light specimen in the dark run — and the
  empty state's transparent surface as the page; it reads the theme being measured and a surface that paints.
- The size of the repaint (`TOKEN-DIFF.md`) was reading the component layer as removed because it now sits on
  `:root, [data-theme]`; its parser reads both blocks.
- The earlier claim in this file that the client's red *Decline* "made the paying client's screen louder than
  the staff app" was not what the India gate had measured: the means were client 0.0336 and staff 0.0348. The
  neutral client *Decline* stands on its own reasoning — a client declining a variation is their decision, not
  a danger — and the sentence is corrected here rather than in the entry it was written in.

---

## 16 September 2026, later — the retheme, and the sidebar in sections

The owner withdrew *take their conventions, not their look*. The product is now drawn on a published
enterprise design system's colour, elevation, spacing, radius, type scale and dark mode. The structural
patterns taken earlier stay; every screen's information design and value line survive; every gate
survives, and where a published value failed one, the value moved, not the gate. Sources and the read date
are in `00-foundations.html`.

### What it supersedes

Kept and marked superseded in place, with the date and the reason, wherever it is part of the decisions
record.

1. **The rule that the look stays ours** — *conventions, not a look; the palette, the semantic colours and
   the reasoning in 13 · Decisions are unchanged* (the previous pass). Withdrawn by the owner. Marked in
   `00-foundations.html` under the patterns and in the table of what was taken from whom.
2. **The Verdigris palette** — the brand teal at OKLCH 196°, the sea-glass neutrals, marigold, and the
   semantic hues at 150°, 52°, 305° and 10°. Replaced by the published colour tokens. The whole colour
   record in `13-decisions.html` is kept in a superseded block.
3. **The rules that built that palette** — one contrast held across the semantic hues, chroma bounded by
   perceived weight, the brand out-saturating the chrome, the declared hue matching the painted one. They
   described how to generate a palette, and there is no longer a generated palette. They were never
   accessibility gates; every accessibility gate is still run.
4. **The earlier chart work** — the chart hues at 196°, 254° and 94° and their dark steps. Replaced by the
   published categorical sequence, with seven of its eight colours moved by our gates in at least one theme (`TOKEN-DIFF.md`).
5. **Newsreader** as the display face. Inter, under the SIL Open Font License, is the only family.
6. **The focus glow.** Focus is a 2px ring set 2px outside the control, and nothing else.
7. **The tab strips under Buying, Money and Projects.** Their pages are now sidebar sections.
8. **Marigold as the illustration accent.** The containment rule stands; the accent is magenta.
9. **"No statutory blue — verdigris carries it."** Blue is now the brand, so the question no longer arises.
10. **`00-foundations.html` as it was**, rewritten; and in `README.md`, the not-verified item about perceived
    weight, and the five decisions that described the old palette.

### What it adds

- **`tokens.css` in three layers**: 150 primitives, 189 semantic tokens in light and dark, 82 component
  tokens that keep this product's names. 19 published values moved by a gate, each recorded with the
  published value, the one used, the measurement and the reason.
- **`00-foundations.html`, rewritten**: sources and the read date, the three layers, the ramps, every
  semantic colour in both themes, the component layer, the six states and what blue is for, the
  adjustments, the token gate's measurements, the chart palette as a protanope and a deuteranope see it
  in both themes, type, spacing, radius, elevation, focus and motion.
- **All fourteen files restyled**: flat bordered cards with one raised surface per screen, the neutral
  default button and the danger fill, lozenges, inputs on the input surface, the selected state for
  navigation, the published type scale in Inter at weight 653 for headings.
- **The sidebar in sections** (`12-project-scope.html`): Projects, Buying and Money; Today and Approvals
  pinned; Sales, Site and Settings flat. Every state drawn — folded, opened, opened by a link, closed on its
  own page, inside a project — the rail with a section open beside it, the phone menu, what each person's
  sections remember, and the keyboard and screen-reader behaviour of a disclosure.
- **Your preferences › Keyboard** (`11-settings.html`): single-key shortcuts on by default and each person's
  to turn off, for WCAG 2.1.4.
- **`13-decisions.html`**: the retheme's decisions — one system owns colour, blue is the brand and every
  affordance, what carries *in progress* and *information*, red still reads as loss for an Indian finance
  reader, the flag re-measured, the two owner answers, and the two shipped contradictions.
- **`TOKEN-DIFF.md`** rewritten as the size of the product's repaint; **`COMPONENT-MAP.md`**,
  **`VALUE-MAP.md`** and **`README.md`** brought in step.

### Product changes recorded here, not made

1. **Today says *Money is not showing figures yet*** (`apps/web/app/(shell)/page.tsx:184`). ADR-0014's
   addendums of 15 September made every Money screen compute; the sentence should go.
2. **The vendor portal shows *Provisional* in the caution colour** (Payments). The vendor audience is
   shown no caution; a provisional rate there takes the neutral pill.
3. **The repaint itself**, as `TOKEN-DIFF.md` sizes it: replace the token block, rename 70 tokens at 906
   references, remove 4 at 16, drop the Newsreader face, restyle the shapes in `COMPONENT-MAP.md` §2.

### Gates

Every gate from the previous pass, run on the rethemed set, both themes:

- **Build**: token gate 294 checks, 0 problems; no colour outside the token block; 663 values declared in
  `tokens.css` and none anywhere else in 14 files; 60 value-line keys, each resolving once; 18 of 18 links
  rendered; every token named in the prose real.
- **Alignment**: 224 renders (400, 768, 1280, 1440 · light, dark · online, offline), **0 faults**.
- **Contrast**: 19,736 text pairs, 0 below AA, body ink AAA; **non-text** 0 obligated or raised failures;
  **colour vision** 0 charts whose meaning survives only in full colour; **money** 573 figures in Indian
  grouping, 17 Provisional marks, 5 draft notices, 0 violations.
- **India**: 0 flag adjacencies; red only on loss, refusal and failure; mean background chroma — vendor
  0.0204, client 0.0268, operator 0.0336, staff 0.0348 — so the two outside audiences keep the two quietest
  screens.
- **Consistency, standalone, polish, frame**: pass. **New — names**: 75 product frames read, none naming the
  system the product borrows from.

### Found by the gates and fixed

- The published hairline measured 1.35:1 light and 1.39:1 dark, under the 1.4:1 floor tables are held to;
  moved one alpha step on the same ramp.
- The published subtle accent backgrounds measured 1.3–2.7:1 as illustration planes, which are held to 3:1
  because a drawing on an empty state says what is missing; the planes take the blue icon family. The
  orange accent would have been a chart colour and sat ΔE 4.1 from saffron in dark; it is magenta.
- A caution notice's icon was painted in the caution ink — a stroke; back to ink.
- The compact button's small radius gave buttons two radii; one radius per component holds.
- A variation's amount at 24px left the client portal's hero under 1.6× everything else; 20px.
- The client's *Decline* as a red fill made the paying client's screen louder than the staff app; a client
  declining a variation is their decision, so it is a neutral button. Staff *Decline* keeps the danger fill.
- Rail rules written as selector lists leaked their centring into the full sidebar; the rail's panel
  widened the sidebar it opened from. Both scoped.
- Every sidebar count was announced as *waiting*, which three of them are not. Each now says what it
  counts, to a screen reader and as its tooltip: *received and not checked*, *ending within 30 days*, *below
  their reorder level*, *past their due date*, *sites with no report today*, *waiting on you*; a folded
  section's total *needs attention*. No gate reads accessible names, which is how it got through.

And in the gates themselves, each change made so a gate cannot pass having measured nothing:

- **Non-text** dropped the alpha channel, so a translucent hairline measured as opaque; it composites now.
  Its control-border probe had been reading a radio button's text colour; it reads a text input. It reads
  several files, so every component is measured.
- **Consistency** read two focus tokens that no longer exist and would have passed on two empty strings; it
  reads the new names and fails on an empty one.
- **Polish** checked for the glow; it checks the ring's width, offset and colour against the focus token.
- **India** built its set of reds from a token that no longer exists; it uses the danger fill.
- **Standalone** checked old token names had arrived; it checks the new ones.
- **Alignment**'s accent containment exempts a palette swatch, as it already exempted the old swatch classes.
- **The foundations page's measured tables** — non-text contrast and ink coverage — are written only when
  asked (`--json`), so a gate run can no longer overwrite what the page renders from. Both were re-measured
  against the committed files, and a second read matched the first.

---

## 16 September 2026 — one project at a time, the patterns, and Money as shipped

Two changes, and the design brought back in step with a product that had moved past it.

### What it supersedes

Every superseded statement is either replaced where it stood or, where it is part of the decisions
record, **kept and marked superseded in place** so the change can be read against it.

1. **The money rule — "no figure on TDS, payments, billing or retention".** Superseded by ADR-0014's two
   addendums of 15 September, which moved the chartered-accountant gate from the build to the statutory
   output. The rule that replaces it: every Money screen computes; a rate on screen says *Provisional*; a
   generated statutory document — a payment voucher, a challan, a 26Q statement, a tax invoice — says
   *Draft: provisional rates*; an individual figure carries no banner; an output resting on a provisional
   row is refused unless the deployment was told to produce drafts, and never reaches Tally.
   - `13-decisions.html` — *The money rule* and *What the file holds to*: kept, marked superseded.
   - `13-decisions.html` — the nav ruling's Retention row: kept, marked superseded.
   - `09-approvals-money.html` — the one Money setup card and its four *After setup* tiles: **replaced**
     by the five shipped screens.
   - `04-today.html` — the notice *Money is not showing figures yet*: **removed**. The shipped Today
     (`apps/web/app/(shell)/page.tsx:184`) still shows it, and it now contradicts the shipped Money screens.
   - `11-settings.html` — Settings › Tax said the rates were *checked by our chartered accountants* and
     offered *Done — open Money*: replaced with the shipped state — every rate *Provisional*, the caution
     notice first, three questions, *Mark the review done*.
   - `12-states-roles.html` — the accountant's Today said no net figure is printed anywhere: replaced.
   - `00-foundations.html` — the money cell's *Not set up yet* row and the *After setup* text stat:
     replaced by a *Provisional* row and a *Not filed* text stat.
   - `07-buying.html` — the order page's *To pay — after setup*: replaced.
   - `14-demo.html` — why Payments is not in the demo: reason rewritten.
   - `money.mjs` — the gate's second rule, rewritten to the new rule and mutation-tested (below).
   - `VALUE-MAP.md` — the Money entry; `README.md` — decision 5.
2. **The portals never show a deduction figure.** Superseded by the shipped vendor Payments, which shows
   the tax deducted with its section and rate — the one figure a vendor reconciles against Form 26AS.
   The portals' lede in `10-portals.html` is rewritten; vendor Payments and client Billing are drawn with
   figures, as shipped. *The vendor's Provisional pill is drawn neutral*, because the vendor audience is
   shown no caution tone (13 · Decisions, *Four audiences*) — the shipped page uses caution. See the report.
3. **A list row opens its record in an overlay drawer.** Buying › Orders drew PO-0041 in a drawer with a
   scrim. Replaced by the record **pane beside the list**. The drawer is kept for a step in a flow —
   raising an order from BOQ lines, handing a lead over.
4. **Every screen's own header and toolbar.** Thirty-three `page-head` headers and four labelled-select
   toolbars are rewritten at build time into the one page header and the one list toolbar; Buying › Orders
   and Tasks were redrawn in the list pattern outright; Sales › Leads and the Projects list, which had a
   table and no toolbar, gained one. Seven Export buttons moved from a header to their list; one project
   filter was dropped.
5. **Three names for a project filter** — `?site=` on Daily reports, `?project=` on Orders, `?projectId=`
   on Measurements and imprest. Replaced by one scope parameter, `?project=` carrying the project's id.
   `?site=` on Stock is untouched: there it means a store.
6. **Labels that drifted from `apps/web/lib/routes.ts`.** Buying › *Rates* is *Agreed rates*; the frames
   draw the shipped Money tabs; Tasks is under Approvals in the route table.
7. **Two statements of fact in `13-decisions.html`.** *A design system already ships, and this document
   disagrees with all of it* and *None of it has been applied*: the heading now says it was applied on
   13 September, and the old list is kept, marked as the state found on 12 September. The route table
   grows from 61 to **67** — the four Money routes that had not been built, and the vendor portal's
   Payments and Documents.
8. **The Today row of the hero table** still described the 88%-of-contract hero that the polish pass
   replaced. It now describes the blocked-approvals hero.
9. **`VALUE-MAP.md`** — screens ruled on 27 → **32**; compliance screens 2 → **3** (Money › Tax deducted
   joins Settings › Tax and Money › Retention).
10. **`COMPONENT-MAP.md` and `TOKEN-DIFF.md`** stop being proposals. COMPONENT-MAP maps the design to the
    kit that shipped and lists this pass's extensions and seven new components; TOKEN-DIFF opens with the
    current state measured by script — the same token set, `--radius` kept as a shipped alias — and says
    **this pass adds no token**. `tokens.css` is byte-for-byte unchanged.

### What it adds

- **`12-project-scope.html`** — one project at a time. The switcher in the frame, open, filtered and
  empty; on a phone as a sheet; by keyboard. The address rules. All 58 routes sorted scoped (21),
  tenant-wide (25) or both (12), each with why and what the server does with a project today. All
  projects, a scoped screen asking which project, a tenant-wide screen carrying the scope. Today across
  all projects, in a project that needs you, in a quiet one, handed over, closed, refused, not found and
  unreachable. What happens when a project changes under you.
- **`00-foundations.html` › The patterns** — the page header, the list with every control on, the six
  states of a list, the form on its own page, density and rhythm, and what was taken from Salesforce
  Lightning, Atlassian and Ant Design and what was refused.
- **`09-approvals-money.html`** — the Approvals queue with the decision open beside it; Tasks in the one
  list; Money › Bills (due, and one to acknowledge that fails validation), Payments with a voucher open,
  Tax deducted (drafts on, before the TAN, and refused), Client billing with an invoice open, Retention
  with a holding open. Every fixture total is checked by the generator — the bills due this week, the
  voucher nets, the challan against the month's tax, retention held against its release voucher.
- **`10-portals.html`** — vendor Payments and client Billing as shipped.
- **Every frame** carries the switcher first in its top bar, and screens drawn inside a project carry
  that project in the switcher, the crumbs and the address bar.

### Gates

- **New — `frame.mjs`.** The switcher is first in every app frame's top bar; a frame's address and its
  switcher agree; no old header remains; every page header's title sits on the page edge and its actions
  on the other edge, centred on the title's row, primary last; every list toolbar runs search, filters,
  Columns, Export; no toolbar holds a project filter; every list with a table states its count.
- **Rewritten — the money gate's second rule**, to ADR-0014: a *Provisional* pill sits beside a rate or a
  tax head; a statutory document holding one carries *Draft: provisional rates*; the draft notice appears
  on nothing else; a refused output shows no figure. Proved able to fail: a copy with the voucher's draft
  notice removed and a *Provisional* pill on a bare figure fails with exactly those two violations.
- **Extended — identifiers never break across lines.** `PV-2026-27-0047` broke after `27`, and
  `BRT/26-27/0391` at its hyphen: the pattern now takes any number of numeric groups, a vendor's slashed
  invoice number, and an ISO date.
- **Adjusted** — the alignment gate skips a frame whose phone sheet is open, as it skips an open drawer;
  the colour-vision gate no longer assumes every file has a section-1 frame to photograph.

### Found by the gates and fixed

- The phone sheet's class, `.sheet`, also matched the measurement sheet's table (`tbl sheet`) in two files
  and turned it into a flex column — 28 table-column faults.
- The switcher's popover, positioned inside the switcher, counted as overflow of a 300px box.
- A scoped hero leading with ₹1,58,72,300.00 truncated to an ellipsis. It leads with 88% and states the
  figures in its sentence.
- With a record open, the list at laptop width was too narrow for its columns: priority-2 columns now
  fold into the detail line, the toolbar's buttons become icons, and the sidebar folds to its rail.
- Date inputs in a two-column form inside the 340px pane overflowed their fields.
- Settings › Tax's value column became narrower than ₹1,00,000.00 once *Provisional* replaced *Verified*.

---

## 13 September 2026 — applied

`TOKEN-DIFF.md` and `COMPONENT-MAP.md` were applied to `packages/design-system` and the four apps, stage
by stage — tokens, components, shell, Today, the seven areas, the states sweep, the gates, the seed — by the
product session. The README gained its *Applied* banner. What the data model could not hold is in
`../BACKLOG.md` under *HUMAN(DATA)*.

## 12 September 2026 — the split, the polish, the known gaps

The single `DESIGN-SAMPLES.html` split at the generator into `tokens.css`, twelve parts and a contents
page, each opening alone and offline. Spacing, type and radius reduced to scales derived from what the
design used; every value moved into `tokens.css`, with a gate that fails on a literal anywhere else.
Focus, the loading skeleton's footprint, table checkboxes and control heights fixed by measurement.
Notifications rebuilt; Site › Measurement ruled *Keep* and added to the demo; the threshold-less
sparklines given a real line or removed; cross-file consistency and standalone gates added.

## Before — the redesign and the colour correction

The redesign that produced verdigris, the eighteen-link table, the value map and the four audiences; then
the correction to constant contrast rather than constant chroma, caution as a fill carrying an ink, a
chart token set separate from the status set, and colour-vision simulation on every chart.
