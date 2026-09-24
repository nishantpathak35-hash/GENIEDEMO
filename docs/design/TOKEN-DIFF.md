# TOKEN-DIFF

`tokens.css` against the shipped `packages/design-system/src/styles.css` — read by script from both files on
16 September 2026, every token resolved through its `var()` chain in each theme, and every `var()` reference counted
across `apps/` and `packages/` (354 source files; never `node_modules`, a build or a cache).

Until today the two files held the same values (the record of that reconciliation, 12 and 13 September, is in
this file's git history and in `CHANGES.md`). On 16 September the owner rethemed the product on a published
design system, so this file now states **the size of the product's repaint**. On 17 September the elements were
redrawn to the system's own components, which added the lozenge, tag, badge, control, chart and motion names below;
the counts are re-measured from that build.

## The size of the repaint

| | Shipped | Rebuilt |
|---|---|---|
| Tokens declared | 119 | 746 |
| Overridden for dark | 42 | 241 |

| What happens to a shipped token | Tokens | Change value | `var()` references to edit |
|---|---|---|---|
| **Kept by name** — this product's component names | 43 | 40 | none — the name stays; the value moves under it (469 references pick it up) |
| **Renamed** — space, radius, type, control and motion names onto the system's scale | 70 | 42 | **906** |
| **Removed** | 6 | — | **18** |
| **New** | 644 — 150 primitives, 346 semantic, 148 component | — | none; nothing references them yet |

**Every colour the product paints with changes.** Of the 39 colour and shadow tokens kept by name,
39 take a new value in light or dark or both; the 4 kept tokens that do not change are container dimensions
(`--measure`, `--measure-tight`, `--illo-lg`, `--illo-sm`). No shipped hex survives.

**The markup barely moves.** Because the component names survive, the colour change on its own is a replacement of the
token block. The token edits are the 906 references to renamed tokens and the 18 to removed ones,
in 3 files — almost all of them `styles.css` itself.

**What the repaint is, in order:**

1. Replace the token block in `styles.css` with `tokens.css` — primitives, semantic tokens in light and dark, component names.
2. Rename the 70 geometry, type and motion tokens at their 906 references (the table in §2; a mechanical rename, the old name → the new one).
3. Remove `--illo`, `--illo-deep`, `--glow`, `--radius`, `--ls-display`, `--ls-heading` at their 18 references (§3).
4. Drop the Newsreader `@font-face` and its vendored file. Inter is already self-hosted and becomes the only family.
5. Restyle the rules whose shape changed, not only their colour — listed in §5. `COMPONENT-MAP.md` says which components they are.
6. Run `pnpm verify`: `scripts/design-gates.mjs` checks token contrast in both themes against the token block, so it re-measures the new values.

## Gate-forced adjustments

A published value that failed one of our gates moved to the nearest step on the same ramp; no gate moved. 40 values, both themes:

| Token | Theme | Published | Used | Gate | Before → after | Why |
|---|---|---|---|---|---|---|
| `--color-text-warning` | light | Orange800 | **Yellow800** | status hues 40° apart, painted | caution 23.5° from loss (Orange800 hue 52°, Red800 hue 29°) → caution 56° from loss, 44° from done | In light, every step of the orange ramp paints within 25° of the danger red, so caution and loss read as two strengths of one colour. The yellow ramp is the nearest family that clears the floor on both sides. |
| `--color-background-warning` | light | Orange100 | **Yellow100** | caution is a fill carrying its own ink | an orange fill under a yellow ink → Yellow800 on Yellow100 | The fill follows its ink, so caution stays one colour. |
| `--color-background-warning` | dark | Orange1000 | **Yellow1000** | hue parity — a fill resolves to the same family in both themes | Yellow100 in light (hue 100°) over Orange1000 in dark (hue 64°): 36° apart → Yellow1000 (hue 95°): 5° apart | The light surface was moved to the yellow ramp on 16 September so that caution stayed one colour; the dark surface was left as published and the fill changed family with the theme. The fill follows its ink in both. |
| `--color-text-warning` | dark | Orange300 | **Orange400** | status hues 40° apart, painted | caution 38.5° from done (Orange300 hue 89°, Lime300 hue 127°) → caution 54° from done, 49° from loss | In dark the published warning ink is nearly yellow and sits under the floor from the lime success ink. One step down the same ramp is amber again. |
| `--color-border` | light | Neutral300A | **Neutral400A** | a table or card hairline is 1.4:1 on the card and the page, and under 3:1 | 1.35:1 on the card and on the page → 1.96:1 and 1.95:1 | Dense tables are read by scanning across them, and a rule under 1.4:1 disappears at arm’s length. The next alpha step on the same ramp is the smallest move that clears it, and it stays well under 3:1 so a grid of rules never out-shouts the figures inside it. |
| `--color-border` | dark | DarkNeutral300A | **DarkNeutral350A** | a table or card hairline is 1.4:1 on the card and the page, and under 3:1 | 1.39:1 on the card, 1.37:1 on the page → 1.69:1 and 1.67:1 | As in light; the dark ramp publishes a half step, and it is enough. |
| `--color-border-input` | light | Neutral500 | **Neutral600** | a control boundary is 3:1 on every surface it can sit on (WCAG 1.4.11) | 2.86:1 on the hovered surface → 3.45:1 hovered, 3.90:1 on the card, 3.68:1 on the page | An input inside a hovered row or a sunken panel lost its edge. Neutral600 is the published color.border.bold, one step darker. |
| `--color-chart-categorical-2` | light | Lime500 | **Lime600** | a chart mark is 3:1 on the surface (WCAG 1.4.11) | 2.44:1 on white → 3.35:1 | The published guidance says chart colours meet 3:1 on every surface; measured on white, this one does not. |
| `--color-chart-categorical-4` | light | Orange500 | **Orange600** | a chart mark is 3:1 on the surface (WCAG 1.4.11) | 2.47:1 on white → 3.33:1 | As above — the published value measures under 3:1 on white. |
| `--color-chart-categorical-7` | light | Teal500 | **Teal600** | a chart mark is 3:1 on the surface (WCAG 1.4.11) | 2.45:1 on white → 3.32:1 | As above — the published value measures under 3:1 on white. |
| `--color-chart-categorical-2` | dark | Lime400 | **Lime600** | the dark chart lightness band, 0.48–0.67 | L 0.769 → L 0.629 | On a dark surface a mark that light glows against its neighbours and outweighs them; the band keeps the set at one weight. |
| `--color-chart-categorical-3` | dark | Purple400 | **Purple500** | the dark chart lightness band, 0.48–0.67 | L 0.714 → L 0.668 | As above; one step down the same ramp. |
| `--color-chart-categorical-4` | dark | Orange400 | **Orange600** | the dark chart lightness band, 0.48–0.67 | L 0.793 → L 0.658 | As above. |
| `--color-chart-categorical-5` | dark | Blue800 | **Blue700** | a chart mark is 3:1 on the surface (WCAG 1.4.11) | 2.47:1 on the dark surface → 3.17:1 on the card, 3.39:1 on the page | The published dark value is the light one, and on a dark surface it disappears. |
| `--color-chart-categorical-7` | dark | Teal500 | **Teal600** | the dark chart lightness band, 0.48–0.67 | L 0.716 → L 0.635 | As above. |
| `--color-chart-categorical-8` | dark | Orange600 | **Orange700** | no two categorical values the same | categorical 4 moved to Orange600, which categorical 8 already used → Orange700, 3.65:1 | Moving categorical 4 made it identical to 8; 8 takes the next step so the sequence keeps eight distinct colours. |
| `--color-chart-categorical-6` | light | Purple700 | **Magenta700** | adjacent categorical colours distinct to a dichromat, ΔE 8 | ΔE 3.7 from categorical 5 (blue) and 6.8 from categorical 7 (teal) under protanopia or deuteranopia → ΔE 10.9 and 9.0 | The published sequence promises each colour is distinct from its neighbours across colour deficiencies. Measured, purple and blue collapse for a protanope or deuteranope at every step of the purple ramp. Magenta is the nearest hue that holds apart from both neighbours. |
| `--color-chart-categorical-6` | dark | Purple700 | **Magenta700** | adjacent categorical colours distinct to a dichromat, ΔE 8 | ΔE 4.2 from categorical 5 and 6.8 from categorical 7 → ΔE 13.4 and 9.0 | As in light; one value serves both themes, as the published sequence does for this slot. |
| `--color-chart-danger-bold` | light | Red850 | **Red700** | the light chart lightness band, 0.43–0.77 | L 0.423 → L 0.557 | The failure marker must hold the same weight as the line it marks. |
| `--color-chart-danger-bold` | dark | Red250 | **Red500** | the dark chart lightness band, and the chroma floor of 0.10 | L 0.847, C 0.083 — a pale pink → L 0.666, C 0.187 | The published dark marker is washed out; it reads as a highlight, not a failure. |
| `--color-background-success-subtler` | light | Lime200 | **Green200** | status hues 40° apart, painted — on the lozenge fills | done 36.9° from caution (Lime200 hue 126°, Orange200 hue 89°) → done 78° from caution, 92° from in progress | In light the lime and the pale amber fills read as two tints of one yellow-green. The green accent ramp is the nearest published family that clears the floor on both sides, and it is the accent the system already pairs with success. |
| `--color-background-success-subtler-hovered` | light | Lime250 | **Green250** | follows its fill | the lime ramp → the green ramp | A hovered lozenge stays the colour it was. |
| `--color-background-success-subtler-pressed` | light | Lime300 | **Green300** | follows its fill | the lime ramp → the green ramp | As above. |
| `--color-text-success-bolder` | light | Lime900 | **Green900** | the ink follows its fill | a lime ink on a green fill → Green900 on Green200 | Done stays one colour. |
| `--color-border-success-subtle` | light | Lime300 | **Green300** | follows its fill | a lime edge → a green edge | As above. |
| `--color-background-success-subtler` | dark | Lime900 | **Green900** | follows the light theme | lime in dark, green in light → green in both | A status is one family in both themes, so a person switching theme does not see done change colour. |
| `--color-background-success-subtler-hovered` | dark | Lime850 | **Green850** | follows its fill | the lime ramp → the green ramp | As above. |
| `--color-background-success-subtler-pressed` | dark | Lime800 | **Green800** | follows its fill | the lime ramp → the green ramp | As above. |
| `--color-text-success-bolder` | dark | Lime200 | **Green200** | the ink follows its fill | a lime ink on a green fill → Green200 on Green900 | As above. |
| `--color-border-success-subtle` | dark | Lime800 | **Green800** | follows its fill | a lime edge → a green edge | As above. |
| `--color-background-warning-subtler` | dark | Orange900 | **Yellow900** | status hues 40° apart, painted — on the lozenge fills | caution 26.4° from loss (Orange900 hue 54°, Red900 hue 28°) → caution 59° from loss, 40° or more from done | In dark the deep orange fill sits beside the deep red one as two browns. The yellow ramp is the nearest family that clears the floor from loss without closing on done, and it is the family the dark caution ink already takes. |
| `--color-background-warning-subtler-hovered` | dark | Orange850 | **Yellow850** | follows its fill | the orange ramp → the yellow ramp | A hovered lozenge stays the colour it was. |
| `--color-background-warning-subtler-pressed` | dark | Orange800 | **Yellow800** | follows its fill | the orange ramp → the yellow ramp | As above. |
| `--color-text-warning-bolder` | dark | Orange200 | **Yellow200** | the ink follows its fill | an orange ink on a yellow fill → Yellow200 on Yellow900 | Caution stays one colour. |
| `--color-border-warning-subtle` | dark | Orange800 | **Yellow800** | follows its fill | an orange edge → a yellow edge | As above. |
| `--color-background-warning-subtler` | light | Orange200 | **Yellow200** | the India layer — saffron and India green are never adjacent | Orange200 at 54°, inside the saffron window, 8px from the done lozenge (green): 8 flag pairs on 00, 2 on 06 → Yellow200 outside the window: 0 pairs | A caution lozenge sits beside a done lozenge in every status row, and the published pale orange beside the pale green on a white card draws the flag. The yellow ramp is the nearest family outside the saffron window, and it is the family the dark caution already takes, so caution is one colour in both themes. |
| `--color-background-warning-subtler-hovered` | light | Orange250 | **Yellow250** | follows its fill | the orange ramp → the yellow ramp | A hovered lozenge stays the colour it was. |
| `--color-background-warning-subtler-pressed` | light | Orange300 | **Yellow300** | follows its fill | the orange ramp → the yellow ramp | As above. |
| `--color-border-warning-subtle` | light | Orange300 | **Yellow300** | follows its fill | an orange edge → a yellow edge | As above. |
| `--color-text-warning-bolder` | light | Orange900 | **Yellow900** | the India layer — saffron and India green are never adjacent | Orange900 at 54°, inside the saffron window, as the caution lozenge’s ink beside the done lozenge: 8 flag pairs on 00, 2 on 06 → Yellow900 at 87°: 0 pairs; 8.12:1 on Yellow200 | The India layer reads every painted hue, the ink as much as the fill. Yellow900 is the same ramp as the fill and the same ink the dark caution takes, so caution is one colour in both themes. |

## 1. Kept by name — the value under each name

| Token | Now points at | Light: shipped → rebuilt | Dark: shipped → rebuilt | References |
|---|---|---|---|---|
| `--ground` | `--elevation-surface-sunken` | #f0f3f3 → **#f8f8f8** | #141717 → **#18191a** | 7 |
| `--panel` | `--elevation-surface` | #fcfdfd → **#ffffff** | #1e2121 → **#1f1f21** | 24 |
| `--elevated` | `--elevation-surface-overlay` | #ffffff → same | #292c2c → **#2b2c2f** | 9 |
| `--sunk` | `--elevation-surface-hovered` | #f4f6f6 → **#f0f1f2** | #181c1c → **#242528** | 21 |
| `--select` | `--color-background-selected` | #dcf6f6 → **#e9f2fe** | #113030 → **#1c2b42** | 5 |
| `--ink` | `--color-text` | #0d2525 → **#292a2e** | #dae3e3 → **#cecfd2** | 38 |
| `--ink-soft` | `--color-text-subtle` | #465f5f → **#505258** | #a1b0b0 → **#a9abaf** | 42 |
| `--ink-faint` | `--color-text-subtlest` | #526868 → **#6b6e76** | #92a0a0 → **#96999e** | 66 |
| `--line` | `--color-border` | #c7cecd → **#080f21 at 29%** | #3c3f3f → **#e8edfd at 18%** | 58 |
| `--line-strong` | `--color-border-input` | #758989 → **#7d818a** | #708585 → **#7e8188** | 15 |
| `--accent` | `--color-background-brand-bold` | #037879 → **#1868db** | #06bcbd → **#669df1** | 42 |
| `--accent-soft` | `--color-background-selected` | #cbf7f7 → **#e9f2fe** | #003c3d → **#1c2b42** | 14 |
| `--accent-hover` | `--color-background-brand-bold-hovered` | #016566 → **#1558bc** | #36cfd1 → **#8fb8f6** | 2 |
| `--on-accent` | `--color-text-inverse` | #ffffff → same | #141717 → **#1f1f21** | 7 |
| `--focus` | `--color-border-focused` | #037879 → **#4688ec** | #06bcbd → **#8fb8f6** | 2 |
| `--ok` | `--color-text-success` | #007232 → **#4c6b1f** | #5fca7b → **#b3df72** | 18 |
| `--ok-soft` | `--color-background-success` | #def8e2 → **#efffd6** | #1b3521 → **#28311b** | 1 |
| `--on-ok` | `--color-text-inverse` | #ffffff → same | #141717 → **#1f1f21** | 5 |
| `--warn` | `--color-text-warning` | #9d4b00 → **#7f5f01** | #ff9c5c → **#fca700** | 3 |
| `--warn-soft` | `--color-background-warning` | #ffead7 → **#fef7c8** | #412717 → **#332e1b** | 7 |
| `--waiting` | `--color-text-discovery` | #7b4baa → **#803fa5** | #cea2ff → **#d8a0f7** | 1 |
| `--waiting-soft` | `--color-background-discovery` | #f6eaff → **#f8eefe** | #342842 → **#35243f** | 1 |
| `--bad` | `--color-text-danger` | #ab3954 → **#ae2e24** | #ff96a7 → **#fd9891** | 10 |
| `--bad-soft` | `--color-background-danger` | #ffe7eb → **#ffeceb** | #432429 → **#42221f** | 6 |
| `--idle-soft` | `--color-background-neutral` | #ecefef → **#051524 at 6%** | #2b2d2d → **#ceced9 at 7%** | 3 |
| `--series-1` | `--color-chart-categorical-1` | #009495 → **#357de8** | #00aaab → **#4688ec** | 6 |
| `--series-2` | `--color-chart-categorical-2` | #007dec → **#6a9a23** | #007dec → **#6a9a23** | 0 |
| `--series-3` | `--color-chart-categorical-3` | #a18500 → **#bf63f3** | #b09200 → **#bf63f3** | 0 |
| `--chart-point-bad` | `--color-chart-danger-bold` | #ab0043 → **#c9372c** | #d33a62 → **#f15b50** | 5 |
| `--chart-threshold` | `--color-chart-neutral` | #7a8282 → **#8c8f97** | #7a8282 → **#7e8188** | 2 |
| `--chart-band` | `--color-background-warning-bold` | #ee7a1f at 22% → **#fbc828** | #ee7a1f at 26% → **#fbc828** | 4 |
| `--track` | `--color-background-neutral` | #c9f0f0 → **#051524 at 6%** | #113e3f → **#ceced9 at 7%** | 5 |
| `--illo-accent` | `--color-background-accent-magenta-subtle` | #c68102 → **#e774bb** | #eea743 → **#943d73** | 2 |
| `--skeleton` | `--color-skeleton` | #e4e7e7 → **#051524 at 6%** | #2c2e2e → **#ceced9 at 7%** | 2 |
| `--skeleton-hi` | `--color-skeleton-subtle` | #f0f2f2 → **#171717 at 3%** | #363838 → **#bdbdbd at 4%** | 1 |
| `--shadow-1` | `none` | 0 1px 2px rgba(0, 60, 61, .06), 0 1px 3px rgb… → **none** | 0 1px 2px rgba(0, 0, 0, .40), 0 1px 3px rgba(… → **none** | 13 |
| `--shadow-2` | `--elevation-shadow-raised` | 0 6px 16px rgba(0, 60, 61, .10), 0 1px 3px rg… → **0px 1px 1px rgba(30, 31, 33, 0.25), 0px 0px 1…** | 0 6px 16px rgba(0, 0, 0, .50), 0 1px 3px rgba… → **0px 0px 0px rgba(0, 0, 0, 0), 0px 1px 1px rgb…** | 4 |
| `--shadow-3` | `--elevation-shadow-overlay` | 0 24px 56px rgba(0, 60, 61, .18), 0 6px 16px … → **0px 8px 12px rgba(30, 31, 33, 0.15), 0px 0px …** | 0 24px 56px rgba(0, 0, 0, .60), 0 6px 16px rg… → **0px 0px 0px rgba(189, 189, 189, 0.12), 0px 8p…** | 5 |
| `--scrim` | `--color-blanket` | #003c3d at 42% → **#050c1f at 46%** | #000000 at 62% → **#101214 at 60%** | 3 |
| `--measure` | a dimension | 72ch → same | 72ch → same | 0 |
| `--measure-tight` | a dimension | 48ch → same | 48ch → same | 2 |
| `--illo-lg` | a dimension | 168px → **160px** | 168px → **160px** | 4 |
| `--illo-sm` | a dimension | 120px → same | 120px → same | 4 |

## 2. Renamed — onto the system's scale

The old names described an old scale (a 10px step, a 15px body, an 8px control corner) that the system does not have. Where the old step had no equal it takes the nearest one, and the value column says so.

| Shipped | Rebuilt | Value | References |
|---|---|---|---|
| `--s-1` | `--space-025` | 2px | 20 |
| `--s-2` | `--space-050` | 4px | 31 |
| `--s-3` | `--space-075` | 6px | 27 |
| `--s-4` | `--space-100` | 8px | 55 |
| `--s-5` | `--space-100` | 10px → 8px | 53 |
| `--s-6` | `--space-150` | 12px | 58 |
| `--s-7` | `--space-150` | 14px → 12px | 35 |
| `--s-8` | `--space-200` | 16px | 44 |
| `--s-9` | `--space-250` | 20px | 57 |
| `--s-10` | `--space-300` | 24px | 10 |
| `--s-11` | `--space-400` | 32px | 6 |
| `--s-12` | `--space-500` | 40px | 5 |
| `--s-13` | `--space-600` | 56px → 48px | 3 |
| `--s-14` | `--space-1000` | 80px | 2 |
| `--s-15` | `--space-1000` | 120px → 80px | 0 |
| `--r-xs` | `--radius-small` | 4px — lozenges, labels, chips | 12 |
| `--r-sm` | `--radius-medium` | 6px — tab items, small interactive | 17 |
| `--r-ctl` | `--radius-medium` | 8px → 6px — buttons, inputs, selects, navigation items | 14 |
| `--r-card` | `--radius-large` | 12px → 8px — cards, in-page containers, popovers | 18 |
| `--r-lg` | `--radius-xlarge` | 16px → 12px — page containers, tables, modals | 3 |
| `--r-pill` | `--radius-full` | 999px | 7 |
| `--r-round` | `--radius-full` | 50% → 9999px | 7 |
| `--ring` | `--mark-ring` | 2px | 3 |
| `--ease` | `--motion-easing-out-practical` | cubic-bezier(.2, 0, 0, 1) → cubic-bezier(0.4, 1, 0.6, 1) | 27 |
| `--t-fast` | `--motion-duration-short` | 150ms | 20 |
| `--t-base` | `--motion-duration-medium` | 200ms | 6 |
| `--t-slow` | `--motion-duration-long` | 250ms | 1 |
| `--fs-micro` | `--font-size-body-small` | 11px → 12px | 10 |
| `--lh-micro` | `--line-height-body-small` | 16px | 9 |
| `--fs-meta` | `--font-size-body-small` | 12.5px → 12px | 51 |
| `--lh-meta` | `--line-height-body-small` | 17px → 16px | 49 |
| `--fs-label` | `--font-size-body-small` | 13px → 12px | 40 |
| `--lh-label` | `--line-height-body-small` | 18px → 16px | 40 |
| `--fs-body` | `--font-size-body` | 14px | 27 |
| `--lh-body` | `--line-height-body` | 20px | 28 |
| `--fs-read` | `--font-size-body-large` | 15px → 16px | 3 |
| `--lh-read` | `--line-height-body-large` | 22px → 24px | 3 |
| `--fs-lead` | `--font-size-heading-small` | 16px | 5 |
| `--lh-lead` | `--line-height-heading-small` | 24px → 20px | 5 |
| `--fs-quote` | `--font-size-heading-medium` | 18px → 20px | 0 |
| `--lh-quote` | `--line-height-heading-medium` | 26px → 24px | 0 |
| `--fs-h3` | `--font-size-heading-medium` | 20px | 2 |
| `--lh-h3` | `--line-height-heading-medium` | 28px → 24px | 4 |
| `--fs-h2` | `--font-size-heading-large` | 22px → 24px | 7 |
| `--lh-h2` | `--line-height-heading-large` | 30px → 28px | 7 |
| `--fs-h1` | `--font-size-heading-xlarge` | 30px → 28px | 0 |
| `--lh-h1` | `--line-height-heading-xlarge` | 36px → 32px | 0 |
| `--fs-display` | `--font-size-heading-xxlarge` | 40px → 32px | 0 |
| `--lh-display` | `--line-height-heading-xxlarge` | 44px → 36px | 0 |
| `--fs-hero` | `--font-size-hero` | clamp(36px, 5.5cqw, 62px) → clamp(36px, 5.5cqw, 56px) | 1 |
| `--fs-fig` | `--font-size-figure` | clamp(26, 13cqw, 48) → clamp(24, 13cqw, 32) | 1 |
| `--fs-stat` | `--font-size-stat` | clamp(20, 11.5cqw, 30) → clamp(16, 11.5cqw, 24) | 2 |
| `--fs-stat-sm` | `--font-size-stat-compact` | clamp(18, 11cqw, 24) → clamp(16, 11cqw, 20) | 2 |
| `--fs-title` | `--font-size-title` | clamp(21, 2.9cqw, 30) → clamp(20, 2.9cqw, 24) | 1 |
| `--ls-caps` | `--letter-spacing-caps` | 0.07em → 0.04em | 2 |
| `--h-ctl` | `--control-height` | 40px → 32px | 6 |
| `--h-ctl-sm` | `--control-height-compact` | 30px → 24px | 2 |
| `--h-ctl-lg` | `--control-height-large` | 46px → 40px | 2 |
| `--h-box` | `--checkbox-size` | 18px → 16px | 10 |
| `--avatar` | `--avatar-size` | 26px → 24px | 5 |
| `--avatar-lg` | `--avatar-size-large` | 32px | 2 |
| `--lh-fluid` | `--line-height-fluid` | 1.12 | 5 |
| `--tr-ctl` | `--transition-control` | background 150ms cubic-bezier(.2, 0, 0, 1), b… → background 150ms cubic-bezier(0.4, 1, 0.6, 1)… | 4 |
| `--tr-card` | `--transition-card` | box-shadow 200ms cubic-bezier(.2, 0, 0, 1), t… → box-shadow 200ms cubic-bezier(0.4, 1, 0.6, 1)… | 1 |
| `--focus-ring` | `--focus-ring-width` | 2px | 2 |
| `--focus-offset` | `--focus-ring-offset` | 2px | 2 |
| `--o-disabled` | `--opacity-disabled` | 0.5 → 0.4 | 3 |
| `--font-text` | `--font-family-body` | Inter | 4 |
| `--font-display` | `--font-family-heading` | Newsreader → Inter | 14 |
| `--font-mono` | `--font-family-code` | unchanged | 4 |

## 3. Removed

| Shipped | References | Why |
|---|---|---|
| `--illo` | 1 |  |
| `--illo-deep` | 1 |  |
| `--glow` | 3 | The focus specification is a 2px ring set 2px outside the control and nothing else. |
| `--radius` | 0 | The one-release alias of the control radius; the release has passed. |
| `--ls-display` | 5 | Headings are set at normal tracking in one family. |
| `--ls-heading` | 8 | As above. |

## 4. New

- **150 primitives** — the published palette, one ramp per family: Neutral 18 · Dark Neutral 24 · Blue 12 · Teal 12 · Green 12 · Lime 12 · Yellow 12 · Orange 12 · Red 12 · Magenta 12 · Purple 12. Nothing in a component references one.
- **346 semantic tokens** — colour and elevation in light and dark, and the space, radius, border, opacity, motion and type scales. Their names are the system's: `color.text.subtle` is `--color-text-subtle`.
- **148 component tokens** this product did not have:

| Token | Points at | What it is for |
|---|---|---|
| `--raised` | `--elevation-surface-raised` | the one raised surface on a screen: the hero, an open record |
| `--selected-ink` | `--color-text-selected` | text and icons on a selected thing |
| `--selected-line` | `--color-border-selected` | the bar or underline that marks a selected thing — 3:1 |
| `--input` | `--color-background-input` | the inside of a text field, a select, a text area |
| `--input-hover` | `--color-background-input-hovered` | the same, hovered |
| `--neutral` | `--color-background-neutral` | a default button |
| `--neutral-hover` | `--color-background-neutral-hovered` | a default button, hovered |
| `--neutral-pressed` | `--color-background-neutral-pressed` | a default button, pressed |
| `--subtle-hover` | `--color-background-neutral-subtle-hovered` | a subtle button or a navigation item, hovered |
| `--link` | `--color-link` | a link |
| `--bad-bold` | `--color-background-danger-bold` | an action that refuses or destroys: Decline, Cancel the order |
| `--bad-bold-hover` | `--color-background-danger-bold-hovered` | the same, hovered |
| `--info` | `--color-text-information` | information — ink, inside an information notice only |
| `--info-soft` | `--color-background-information` | information — the notice surface |
| `--nav-current` | `--color-background-selected-bold` | the current page in the sidebar — a solid pill |
| `--topbar` | `--color-background-brand-subtlest` | the top bar — read in the dark set: navy, the brand’s subtlest surface |
| `--topbar-lift` | `--color-background-neutral` | the lifted fill on the top bar — read in the dark set: an alpha neutral, white at 7%, over the navy; the search and the switcher sit on it |
| `--topbar-lift-hover` | `--color-background-neutral-hovered` | the lifted fill, hovered |
| `--topbar-div` | `--elevation-surface-sunken` | the 1px divider on the top bar — read in the dark set: the darkest surface, darker than the bar |
| `--new-sq` | `--color-chart-brand` | the quick-create square — read in the dark set: the brand’s mark colour, Blue500, under a white plus |
| `--new-sq-hover` | `--color-chart-brand-hovered` | the square, hovered |
| `--tenant-accent` | `--color-background-accent-teal-bolder` | the tenant’s accent — the avatar’s fill; a tenant setting one day |
| `--side` | `--elevation-surface-sunken` | the sidebar — the cool grey the page sits on |
| `--nav-open` | `--color-background-accent-blue-subtlest` | an open section’s tint in the sidebar — the reference’s, blue-100 |
| `--nav-current-ink` | `--color-text-inverse` | text, icon and count on the current page’s pill |
| `--card-head` | `--elevation-surface-sunken` | a card’s header strip |
| `--disc-blue` | `--color-background-accent-blue-subtlest` | the tinted disc behind a stat’s icon — blue |
| `--disc-blue-icon` | `--color-icon-accent-blue` | the icon on the blue disc |
| `--disc-teal` | `--color-background-accent-teal-subtlest` | the disc — teal |
| `--disc-teal-icon` | `--color-icon-accent-teal` | the icon on the teal disc |
| `--disc-green` | `--color-background-accent-green-subtlest` | the disc — green: money coming in |
| `--disc-green-icon` | `--color-icon-accent-green` | the icon on the green disc |
| `--disc-purple` | `--color-background-accent-purple-subtlest` | the disc — purple |
| `--disc-purple-icon` | `--color-icon-accent-purple` | the icon on the purple disc |
| `--disc-magenta` | `--color-background-accent-magenta-subtlest` | the disc — magenta |
| `--disc-magenta-icon` | `--color-icon-accent-magenta` | the icon on the magenta disc |
| `--disc-red` | `--color-background-accent-red-subtlest` | the disc — red: money going out |
| `--disc-red-icon` | `--color-icon-accent-red` | the icon on the red disc |
| `--disc-yellow` | `--color-background-accent-yellow-subtlest` | the disc — yellow: what needs watching |
| `--disc-yellow-icon` | `--color-icon-accent-yellow` | the icon on the yellow disc |
| `--disc-gray` | `--color-background-accent-gray-subtlest` | the disc — grey: a plain count |
| `--disc-gray-icon` | `--color-icon-accent-gray` | the icon on the grey disc |
| `--duo-blue` | `--color-background-accent-blue-subtler` | the block of a duotone icon on the blue disc |
| `--duo-teal` | `--color-background-accent-teal-subtler` | the block — teal disc |
| `--duo-green` | `--color-background-accent-green-subtler` | the block — green disc |
| `--duo-purple` | `--color-background-accent-purple-subtler` | the block — purple disc |
| `--duo-magenta` | `--color-background-accent-magenta-subtler` | the block — magenta disc |
| `--duo-red` | `--color-background-accent-red-subtler` | the block — red disc |
| `--duo-yellow` | `--color-background-accent-yellow-subtler` | the block — yellow disc |
| `--duo-gray` | `--color-background-accent-gray-subtler` | the block — grey disc |
| `--money-in` | `--color-text-accent-green` | money coming in, as text with its sign |
| `--owed-overdue` | `--color-background-warning-bold` | the overdue part of an owed bar — the fixed status amber; labelled-redundant |
| `--chart-amber` | `--color-background-warning-bold` | the status amber on any labelled-redundant mark: a ring past its contract, a tile bar’s overrun |
| `--owed-current` | `--color-chart-brand` | the part of an owed bar not yet due, and the covered part of a ratio bar — the brand’s mark colour, as the reference draws its bars |
| `--chart-area` | `--color-background-accent-blue-subtlest` | the fill under a single-series line |
| `--row-mine` | `--color-background-accent-purple-subtlest` | a row waiting on this person — the lightest published purple; there is no lighter step to take |
| `--star` | `--color-icon-accent-yellow` | a favourite’s star, in the Reports Center and the saved-views menu |
| `--chart-brand` | `--color-chart-brand` | the mark, when one colour is enough — a sparkline, a bar |
| `--chart-brand-hover` | `--color-chart-brand-hovered` | the mark under the pointer |
| `--chart-gap` | `--color-border-inverse` | the space between two adjacent chart colours — a stacked bar |
| `--money-out` | `--color-text-accent-orange` | money going out, as text with its sign — the reference’s orange-red, taken as the nearest orange text step that passes AA |
| `--series-4` | `--color-chart-categorical-4` | the fourth chart series |
| `--series-5` | `--color-chart-categorical-5` | the fifth chart series |
| `--series-6` | `--color-chart-categorical-6` | the sixth chart series |
| `--series-7` | `--color-chart-categorical-7` | the seventh chart series |
| `--series-8` | `--color-chart-categorical-8` | the eighth chart series |
| `--chart-neutral` | `--color-chart-neutral` | a series that is not the story, and the Other slice of a part-to-whole |
| `--ring-track` | `--color-background-accent-blue-subtler` | the unfilled part of a ring — a lighter step of the brand’s own ramp |
| `--progress` | `--color-background-neutral-bold` | the filled part of a progress bar — progress is not a status and not the brand |
| `--illo-line` | `--color-icon` | an illustration’s hand-drawn line — black in light, near-white in dark, 3:1 on the card |
| `--illo-a` | `--color-background-accent-blue-subtler` | an illustration’s first block |
| `--illo-b` | `--color-background-accent-yellow-subtle` | an illustration’s second block |
| `--illo-c` | `--color-background-accent-teal-subtler` | an illustration’s third block |
| `--illo-n` | `--color-background-accent-gray-subtlest` | an illustration’s paper and shadow |
| `--subtle-pressed` | `--color-background-neutral-subtle-pressed` | a default or subtle button, pressed |
| `--accent-pressed` | `--color-background-brand-bold-pressed` | the primary button, pressed |
| `--bad-bold-pressed` | `--color-background-danger-bold-pressed` | a danger button, pressed |
| `--warn-bold` | `--color-background-warning-bold` | a warning button |
| `--warn-bold-hover` | `--color-background-warning-bold-hovered` | a warning button, hovered |
| `--warn-bold-pressed` | `--color-background-warning-bold-pressed` | a warning button, pressed |
| `--on-warn-bold` | `--color-text-warning-inverse` | text on a warning button or a warning banner |
| `--select-hover` | `--color-background-selected-hovered` | a selected thing, hovered |
| `--select-pressed` | `--color-background-selected-pressed` | a selected thing, pressed |
| `--disabled-fill` | `--color-background-disabled` | a disabled control |
| `--disabled-ink` | `--color-text-disabled` | text on a disabled control |
| `--disabled-line` | `--color-border-disabled` | the edge of a disabled control |
| `--input-pressed` | `--color-background-input-pressed` | a text field while it has focus |
| `--link-pressed` | `--color-link-pressed` | a link, pressed |
| `--icon-soft` | `--color-icon-subtle` | an icon beside secondary text |
| `--icon-faint` | `--color-icon-subtlest` | a decorative icon: a chevron, a crumb separator |
| `--inverse-fill` | `--color-background-neutral-bold` | a tooltip |
| `--on-inverse` | `--color-text-inverse` | text in a tooltip |
| `--lozenge-done` | `--color-background-success-subtler` | lozenge · done |
| `--lozenge-done-ink` | `--color-text-success-bolder` | lozenge · done, its text |
| `--lozenge-active` | `--color-background-information-subtler` | lozenge · in progress |
| `--lozenge-active-ink` | `--color-text-information-bolder` | lozenge · in progress, its text |
| `--lozenge-waiting` | `--color-background-discovery-subtler` | lozenge · waiting on someone |
| `--lozenge-waiting-ink` | `--color-text-discovery-bolder` | lozenge · waiting, its text |
| `--lozenge-caution` | `--color-background-warning-subtler` | lozenge · caution |
| `--lozenge-caution-ink` | `--color-text-warning-bolder` | lozenge · caution, its text |
| `--lozenge-bad` | `--color-background-danger-subtler` | lozenge · refused, failed, money the wrong way |
| `--lozenge-bad-ink` | `--color-text-danger-bolder` | lozenge · bad, its text |
| `--lozenge-idle` | `--color-background-neutral` | lozenge · draft, closed, nothing owed |
| `--lozenge-idle-ink` | `--color-text` | lozenge · idle, its text |
| `--tag-fill` | `--color-background-accent-gray-subtlest` | a tag — a label someone applied, or a removable filter |
| `--tag-ink` | `--color-text-accent-gray-bolder` | a tag, its text |
| `--badge-fill` | `--color-background-accent-gray-subtler` | a badge — a count |
| `--badge-ink` | `--color-text` | a badge, its number |
| `--badge-important` | `--color-background-danger-subtler` | a badge counting something that has gone wrong — on a card or the sidebar |
| `--badge-important-ink` | `--color-text-danger-bolder` | its number |
| `--island-important` | `--color-background-danger-bold-light` | a badge on the dark island — the light set’s bold red, in both themes |
| `--island-important-ink` | `--color-text-inverse-light` | its number — the light set’s white, in both themes |
| `--badge-primary` | `--color-background-information-subtler` | a badge on a selected thing |
| `--badge-primary-ink` | `--color-text-information-bolder` | its number |
| `--chart-done` | `--color-chart-success-bold` | a status series — on track |
| `--chart-caution` | `--color-background-warning-bold` | a status series — at risk: the fixed status amber, labelled-redundant (its count is in the legend) |
| `--chart-bad` | `--color-chart-danger-bold` | a status series — off track |
| `--chart-paused` | `--color-chart-gray-bold` | a status series — paused |
| `--chart-grid` | `--color-border` | a gridline |
| `--check-on` | `--color-background-selected-bold` | a checked checkbox or radio |
| `--check-on-hover` | `--color-background-selected-bold-hovered` | the same, hovered |
| `--check-on-pressed` | `--color-background-selected-bold-pressed` | the same, pressed |
| `--toggle-off` | `--color-background-neutral-bold` | a toggle, off |
| `--toggle-off-hover` | `--color-background-neutral-bold-hovered` | a toggle, off, hovered |
| `--toggle-on` | `--color-background-success-bold` | a toggle, on |
| `--toggle-on-hover` | `--color-background-success-bold-hovered` | a toggle, on, hovered |
| `--knob` | `--color-icon-inverse` | the knob of a toggle, the tick of a checkbox, the dot of a radio |
| `--icon-disabled` | `--color-icon-disabled` | an icon on a disabled control |
| `--danger-line` | `--color-border-danger` | the edge of a field that did not validate |
| `--chart-axis` | `--color-border-bold` | an axis line |
| `--control-height-touch` | `var(--space-600)` | a control in a portal, on a phone — 44px or more |
| `--side-width` | `200px` | the sidebar, and the top bar’s brand column over it — the reference’s; no published step |
| `--side-width-rail` | `var(--space-600)` | the sidebar as an icon rail |
| `--topbar-height` | `var(--space-600)` | the top bar |
| `--bar-control-height` | `34px` | the switcher and the search on the top bar — the reference’s; the published control is 32 |
| `--search-width` | `300px` | the search on the top bar |
| `--brand-size` | `17px` | the product’s name on the top bar — the reference’s 18 does not fit the seventeen-character name in the 200px column; 17 is the largest that does |
| `--avatar-size-bar` | `28px` | the person on the top bar — the reference’s; between the published 24 and 32 |
| `--nav-item-height` | `38px` | a sidebar item — the reference’s row; the published scale has no 38 |
| `--field-height` | `calc(var(--line-height-body) + var(--space-075) * 2 + var(--border-width) * 4)` | a text field, a select, a date picker — 36px, as published |
| `--font-size-total` | `28px` | the total on a money card — the dashboard scale |
| `--font-size-tile` | `24px` | a tile’s figure — the dashboard scale |
| `--card-head-height` | `var(--space-600)` | a dashboard card’s header: one line, 48px, the disc left of the title |
| `--disc-size` | `var(--space-500)` | a stat’s disc |
| `--disc-size-small` | `28px` | the disc in a dashboard card’s header |
| `--duo-size` | `var(--space-300)` | the duotone on a stat’s disc |
| `--duo-size-small` | `var(--space-250)` | the duotone on the header’s small disc |
| `--grid-gutter` | `var(--space-300)` | the dashboard grid’s gutter, 24px |
| `--frame-desktop-width` | `1400px` | the width the document draws Today and Overview at — a director’s laptop; the four-tile row needs it |

## 5. What is not a token but comes with it

- **Buttons** are the published button: a transparent fill inside a 1px border (default), the brand fill (primary), the danger fill (Decline, Cancel the order), the warning fill (Send anyway), or no border (subtle). Heights 32px, compact 24px with the small corner, large 40px for a hero's one action; 48px on a phone or tablet. Radius medium; compact small.
- **Cards** are flat with a border, under a header strip on the sunken surface (`--card-head`) holding the title, a help icon and one action. Raised — `--raised` and `--shadow-2` — is spent once per screen, on the hero or the record beside a list. `--shadow-1` is `none`.
- **Lozenges** are the published lozenge: 20px, small radius, sentence case, bold at 12/16, the subtler status fill under its bolder ink. *In progress* is the information lozenge (blue); information as a sentence is a section message, never a lozenge. A **tag** is a label someone applied or a removable filter; a **badge** is a count.
- **Inputs** sit on `--input` with a `--line-strong` border and a small corner; hover changes the fill, not the border; focus is the published focused border, 2px in the focus colour, with no outer ring.
- **Navigation** (19 September). The top bar spans the window on `--topbar` — navy, the brand’s subtlest surface read in the dark set, because the bar carries `data-theme="dark"` and resolves the dark set in both themes; 48px tall (`--topbar-height`). The product’s mark and its name (`--brand-size`) fill a `--side-width` brand column ending in a `--topbar-div` divider; then the switcher and the search on `--topbar-lift`, a neutral alpha over the navy, 34px tall (`--bar-control-height`), the search `--search-width` wide with a `--line-strong` hairline; recent history; and at the right a *Demo organisation* notice in `--warn` when the tenant is one, the tenant’s name, the quick-create square on `--new-sq` (Blue500) under the light set’s inverse ink, the bell, the gear and the person on `--tenant-accent` at `--avatar-size-bar`. The sidebar sits on `--side`, the sunken surface, `--side-width` wide, with `--nav-item-height` rows and a 14px label; an open section is tinted `--nav-open`, blue-100, with its pages indented; the current page is a solid pill — `--nav-current` under `--nav-current-ink`, 5.20:1 in light and 6.00:1 in dark, 4.89:1 and 6.42:1 against the sidebar — carrying a `+` in the same ink; inside a project the sidebar is the project’s lifecycle under ◂ All projects and the project’s block. The four apps share the bar; a portal’s bar has fewer controls, never different colours.
- **Colour where it carries meaning** (18 September) comes from the accent tokens through the component layer, and none of it is blue: a stat’s disc is `--disc-<hue>` under `--disc-<hue>-icon`, one accent per tile, each pair 3:1 or better; money direction is `--money-in` (the green text accent, with a plus) and `--money-out` (the red text accent, with a minus; the orange one was measured on 19 September and the India layer flagged it beside green in the token table on part 0), and overdue is the caution ink on the caution fill; an owed card’s bar is `--owed-overdue` (the yellow ramp, 4.63:1 on the card in light) beside `--owed-current` (the grey ramp) with a hairline of the surface between; a single-series chart fills under its line with `--chart-area` and marks every point; a row waiting on this person is `--row-mine`, the tint of the waiting lozenge. Coloured plain text is for money direction only; blue stays action, link, focus and selection and is never a state. Since 19 September there is no highlighter: the caution fill is under a lozenge or a section message only, and overdue is an amber small-capitals label (`--warn` as text) over an ink figure.
- **Focus** on a button or a link is `outline: 2px solid var(--focus); outline-offset: 2px`, last in the stylesheet, with no box-shadow; on a field it is the focused border above.
- **Type** is Inter in every family; headings at weight 653.
- **Charts** paint one colour, the brand chart colour, unless the data is a status, which takes the bold status chart colours in the owner's order — off track, at risk, on track, paused — with a hairline of the surface between segments; the categorical sequence in order where series must be told apart; the failure point and the threshold keep their own tokens. The overrun band is `--chart-band` on `color.background.accent.yellow.bolder` — the same yellow as an overdue owed bar — since 19 September: on the warning surface it measured 1.09:1 light and 1.22:1 dark, invisible, and the non-text gate now reads every mark from the property that paints it and holds a legend swatch to its mark.
- **Illustrations** are six drawings from the trade: flat blocks of the accent colours under one hand-drawn line in the icon colour. The line alone is held to 3:1; the drawing is decorative and the text beside it carries the meaning.
- **Motion** is the published motion tokens, plus the spinner's, skeleton's, tooltip's and toggle's own and three composed from the published durations and curves; under reduced motion every token is redefined so nothing travels, turns or scales.

## 6. The reference’s values, mapped — 19 September 2026

The look is the books the buyers keep. Each value was measured on the reference by the owner, taken to the nearest
step on the ramp the brief named (OKLab ΔE), and then put through the gates; where a step failed, the nearest passing
step is used and the failure is written down. Nothing of the reference is reused — these are colour values, not assets.

| Reference | Nearest step (ΔE) | Gate | Used |
|---|---|---|---|
| Top bar `#21263c` | Blue1000 `#1C2B42` (1.8) | ink on it 9.15:1 | `color.background.brand.subtlest`, read in the dark set — the bar is a dark island in both themes |
| Lifted field on the bar `#333850` (the search, the switcher) | `color.background.neutral` read in the dark set — white at 7% over the navy, `#29374D` painted (1.7); Blue900 `#123263` (4.9) was the step until later on 19 September | placeholder 5.49:1; the search’s boundary is `color.border.input`, 3.65:1 against the bar — the published border on the lifted fill measured 1.69:1 and failed 1.4.11 | `--topbar-lift`, lighter than the bar (the token gate holds the order), hover `color.background.neutral.hovered` |
| Quick-create square `#408dfb` | Blue500 `#4688EC` (2.4) — `color.chart.brand` read in the dark set | white on it 3.50:1: a plus passes 3:1; the dark set’s inverse ink is near-black, so the plus is the *light* set’s inverse ink, an island inside the island; the square against the bar 4.07:1 | `--new-sq` under `--on-accent` resolved on a `data-theme="light"` span; until later on 19 September the published primary, Blue700, under a word |
| Sidebar `#f7f7fe` | Neutral100 `#F8F8F8` (0.9) | — | `elevation.surface.sunken` |
| Open section tint `#ededf7` | Blue100 `#E9F2FE` (1.3) | a tint, not a boundary — the token gate holds it at 1:1 against the sidebar | `color.background.accent.blue.subtlest` (`--nav-open`), taken later on 19 September; the grey accent’s subtlest fill until then, because blue was never a state — an open section is a place, not a state |
| Current page | Blue700 `#1868DB` | 5.20:1 with white; the reference’s lighter blue fails | `color.background.selected.bold`, kept |
| Sidebar rows 38px, label 14px | no published step at 38 | — | `--nav-item-height: 38px` in the component layer; `font.size.body` is 14px |
| List head row `#f9f9fb` | Neutral100 `#F8F8F8` (0.4) | — | `elevation.surface.sunken` (`--card-head`) |
| Head text `#6c7184` | Neutral700 `#6B6E76` (2.1) | 5.10:1 on the card, 4.80:1 on the head row | `color.text.subtlest` |
| Dividers `#ebeaf2` | Neutral200 `#F0F1F2` (2.0) | 1.13:1 on the card — under the 1.4:1 hairline floor the non-text gate raises for dense tables; Neutral300 1.35:1 also | `color.border`, 1.96:1, kept |
| Row needing this person `#ebf3e2` (green) | Green100 `#DCFFF1` (3.3) | green is money coming in here | `color.background.accent.purple.subtlest` Purple100 `#F8EEFE`, kept — the lightest purple the palette publishes |
| Money in `#28b47e` | Green500 `#2ABB7F` (2.1) | 2.47:1 fails AA; Green600 3.33:1; Green700 `#1F845A` 4.66:1 on the card but 4.38:1 on the sunken surface | `color.text.accent.green` Green800 `#216E4E`, 6.17:1 and 5.81:1, kept |
| Money out `#f76831` | Orange600 `#E06C00` (5.0) on the ramp the brief named; Red500 `#F15B50` (4.6) nearer | Orange600 2.51:1 and Orange700 4.51:1 on the card but 4.24:1 on the sunken surface fail AA; Orange800 `color.text.accent.orange` 6.02:1 and 5.67:1 passes; the India layer found no pair with green money-in on any product screen, and the two swatches 18px apart in the token table on part 0 are declared apart now | `color.text.accent.orange` Orange800 `#9E4C00` (`#FBC828` dark), taken later on 19 September as the owner’s decision; the red text accent until then |
| Top bar 48px | `space.600` | — | `--topbar-height: var(--space-600)`; 56px until later on 19 September |
| Brand column 200px, ending in a 1px darker divider | no published step | the divider `elevation.surface.sunken` read in the dark set, `#18191A`, darker than the bar | `--side-width: 200px` (252 until then), `--topbar-div` |
| Product name 18px medium | `font.size.heading.small` is 16, `font.size.heading.medium` 20 | the reference’s 18 does not fit the seventeen-character name in the 200px column beside a 16px mark | `--brand-size: 17px`, the largest that fits |
| Bar controls 34px (the switcher, the search) | the published control is 32 | — | `--bar-control-height: 34px`; the consistency gate holds it as its own row |
| Search 300px wide | no published step | — | `--search-width: 300px`; the switcher never wider |
| Square 32px, radius 4 | `space.400`, `radius.small` | — | `--control-height`, `radius.small` |
| Avatar 28px | no published step between 24 and 32 | — | `--avatar-size-bar: 28px` |
| Icons ~18px | the published grid is 16 | one icon size in the set — the consistency gate holds 16×16 everywhere | 16px on a 40px pitch, kept |
| Tenant’s accent (the avatar) | `color.background.accent.teal.bolder` | the letter on it 4.5:1 in both sets; the disc against the bar 7.14:1 | `--tenant-accent` — a tenant setting one day |
| Overdue label, amber text | the caution ink | 5.93:1 light, 8.36:1 dark, as text | `color.text.warning` (`--warn`), as a label over an ink figure — never a fill |

## 7. What the diff does not ask for

- No component renames and no new props. The component names in `COMPONENT-MAP.md` stand.
- No change to any figure, rounding or formatting. Money is unchanged.
- No second palette: nothing from any other system's colours, and no hand-mixed value. Every colour is a published token, or one of the adjustments above.
