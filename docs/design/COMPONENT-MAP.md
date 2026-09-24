# COMPONENT-MAP

Everything drawn across the fifteen parts of the set, mapped to the component it **is**, **extends**
or **adds** in `construct-o-genie/packages/design-system/src/` — and, since 17 September, to the published
component each one is drawn to (§7).

> **Applied 13 September 2026, and redrawn 16 September.** The first version of this file was a
> proposal against a sixteen-export kit; it was applied stage by stage, and the shipped kit now carries
> almost everything it proposed. This version maps the design to *that* kit. What it said before is in
> git history and summarised in `CHANGES.md`.

> **Rethemed later on 16 September.** The product is now drawn on a published design system's colour,
> elevation, spacing, radius and type. No component is renamed and no prop is removed: the retheme is the
> token block in `TOKEN-DIFF.md` plus the shape changes in §2, and two parts are new in §3 — the sidebar's
> sections and the per-person keyboard preference.

> **The elements, 17 September.** Every element the set draws was inventoried and redrawn to the published
> component's anatomy, sizes, appearances and states — 37 published components, 21 compositions from their
> primitives, 1 piece of the document's own furniture (§7, with the count of each in the product frames).
> The shipped kit's names stand; what changes under them is in §2 under *elements*: a section message's
> actions are links, a lozenge is a lozenge and never a tag or a badge, the searchable picker is one control,
> a whole-page error is an empty state, the charts follow the data-visualisation guidance, and every motion
> is a token. The six drawings are new (§7) and the fourteen they replace are withdrawn.

> **The familiar look, 18 September.** The theme is now the one our buyers run their books in — a dark top
> bar, a light sidebar with a solid blue pill on the current page, cards under a grey header strip, stat tiles
> with a tinted disc, money cards with a proportion bar, lists titled by their view — drawn from the same
> published components and the accent tokens this system already had. Nothing of the reference is reused.
> One published component is newly inventoried, the top bar (§7), and eight compositions are added (§3): the
> `+ New` menu, the stat's disc, the owed card, the cash-flow card, money direction, the view switch, the
> warning beside a title, and the collapse control at the sidebar's foot; the row waiting on this person is
> inventoried in §7. Every shipped name stands; what changes under
> `Stat`, `Panel`, `Toolbar`, `PageHeader` and the shell's navigation is in §2 under *familiar*.

> **The build and the look, 19 September.** The generator is source now: `docs/design/build/` rebuilds the
> whole set with one command (`README.md`), every page shares `design.css` and `design.js`, and the pages are
> laid out one element a line. The shell was redrawn to the reference's measurements — the top bar across the
> window, navy, the product's mark over the sidebar column; the sidebar cool grey with 38px rows, the open section
> tinted; every list led by its full-width state in the reference's columns; Today's tiles on the money card;
> no highlighter anywhere; one rule for a pane's action row; Settings as thirteen pages in one place. Four
> compositions are added (§3): the figure card, the attachment clip, the category list and the grouped table.
> What changes under `ListFrame`, `Stat`, `Panel`, `Pager` and the shell is in §2 under *measured*; §4 is
> superseded in part.

> **The clean-up, 19 September, last.** No shipped name changes. The sample is the product's demo seed: every figure a
> component shows here is what the seeded product computes (README). Three rules are added to the gates and to §2: every chart
> mark is held to 3:1 from the property that paints it and a legend swatch is its mark, in colour and treatment;
> sibling figure cards in a row share a header height and a figure baseline, and every one carries its bar; one
> drawing per empty-state subject, with the map to the shipped `Empty` names in §7. The meters on Today scale to
> their own contract. The parts were renumbered to reading order (README); the generator's files are named by
> purpose (`build/README.md`).

> **The navigation, 19 September, later.** Two navigations, one shell. `SideNav` takes a level: at the firm it
> is the firm's functions; inside a project, that project's lifecycle under ◂ All projects and the project's
> block, with Approvals pinned at the foot. The top bar is one component in all four apps, each stating its
> controls. Ten compositions are added (§3): the project block, the current page's pill with its `+`, the
> quick-create square (which replaces the `+ New` word button), recent history, the demo notice, the saved-views
> menu, the kebab's menu, the document toolbar, the settings hub, and Overview's tiles as `FigureCard`. The
> category list and the grouped table move from Settings to the Reports Center. What changes under `SideNav`,
> the top bar, `Toolbar`, `PageHeader`, `RecordPane`, `Tabs` and `Money` is in §2 under *navigation*; §4 is
> unchanged.

The shipped kit today, by file:

| File | Exports |
|---|---|
| `ui.tsx` | `Panel` `Notice` `Refusal` `reasonSentence` `Unreachable` `Money` `MoneyExact` `Pill` `Absent` `AbsentNotice` |
| `form.tsx` | `Form` `Field` `Choice` `Notes` `MoneyField` `useFieldError` `describedByIds` |
| `list.tsx` | `Toolbar` `Spacer` `FilterChips` `Pager` `BulkBar` `SortableHeader` `Skeleton` `ListFrame` |
| `stat.tsx` · `hero.tsx` | `Stat` `StatRow` · `Hero` |
| `chart.tsx` | `Line` `Area` `Threshold` `Band` `PointMarker` `Annotation` `Sparkline` `Meter` `MeterList` |
| `drawer.tsx` · `stepper.tsx` · `tabs.tsx` · `picker.tsx` · `empty.tsx` | `Drawer` · `Stepper` · `Tabs` · `Picker` · `Empty` |
| `notifications.tsx` · `sprite.tsx` | `NotificationPanel` `NotificationBell` · `Sprite` `Icon` `Illustration` |
| `row-selection.ts` · `action-state.ts` · `vocabulary.ts` | `useRowSelection` · form action states · the closed label sets |

| | |
|---|---|
| Kinds of drawn part that are a shipped component as it stands — §1 | **20** |
| Shipped components extended — same component, new props, a fixed order or a new shape — §2 | **9** |
| New, with no shipped equivalent — §3 | **32** |

---

## 1. Is — shipped, and drawn exactly as shipped

| Drawn as | Shipped component |
|---|---|
| Every card | `Panel` |
| Every rupee figure | `Money` / `MoneyExact` — the wire string through one formatter; `null` is a dash, never zero. **Do not touch.** |
| Every status, including *Provisional* and *Verified* | `Pill` — drawn as the published lozenge (§7) |
| The dash with a reason; the notice that says a figure is not computed | `Absent` / `AbsentNotice` |
| Every notice, including *Draft: provisional rates* | `Notice` |
| A refusal, with *Copy details for support* | `Refusal` + `reasonSentence` |
| The server did not answer | `Unreachable` — since the elements pass an empty state with *Try again* as its primary action and *Copy details for support* as its link, not a notice |
| The empty state — an image, a heading, one or two sentences, the secondary action before the primary, a link under them; wide or narrow | `Empty` + `Illustration` — the published anatomy since the elements pass; `Empty` gains `secondaryAction`, `tertiaryAction` and `size` |
| The hero, and the stats under it | `Hero`, `Stat`, `StatRow` |
| Every chart mark, band and threshold | the `chart.tsx` primitives — a single series in `--chart-brand`; two forms are new, `StackedBar` and `Bars` (§3) |
| An approval chain | `Stepper` |
| The bell and the feed | `NotificationBell`, `NotificationPanel` |
| A search-and-choose control | `Picker` — since the elements pass one control, the published select's anatomy: a combobox with a chevron whose typing filters the list, not a search field over a select |
| Row selection and the bulk bar | `useRowSelection`, `BulkBar` |
| Applied filters | `FilterChips` |
| The count and the pages | `Pager` |
| A sortable column | `SortableHeader` |
| Loading | `Skeleton` — the table itself, with its header; `Spinner` inside a component or a button for a short wait; `ProgressBar` only when the amount done is known (part 12 draws each where the product waits) |
| A step in a flow — raising an order from BOQ lines, a lead's handover | `Drawer` |
| Destination tabs — Sales, Site, Approvals — and record tabs | `Tabs` |

---

## 2. Extends — shipped components this pass changes

| Component | What changes | Why |
|---|---|---|
| **`Toolbar`** | One order, always: search, the filters, `Spacer`, the column control, Export. A filter is a **filter button** that names its field and, when on, its value — not a labelled `<select>`. **No Project filter** on any toolbar. | The shipped toolbars differ screen to screen, and three name a project filter three different ways (`?site=`, `?project=`, `?projectId=`). The switcher in the frame is now the only project filter. See `12-project-scope.html`. |
| **`ListFrame`** | Takes an optional `pane`. With one, the list and the record sit side by side; priority-2 and -3 columns fold into the row's detail line; the toolbar's Columns and Export become icons; the sidebar folds to its rail. Below 760px the pane takes the screen with *Back to the list*. | `money/bills/page.tsx` already puts a `BillPane` beside the list in a `.two` grid, driven by `?bill=`. This names that as the pattern for every list whose row opens a record, and keeps `Drawer` for a step in a flow. |
| **`Form`** | The footer is docked to the bottom of the surface: the destructive action alone on the left; Cancel then the primary on the right; the primary labelled with its verb. **Inside a pane there is no Cancel** — the pane's × is the way out. Sections take a heading and at most one sentence. A form legend says once what the asterisk means. | One place for save and cancel however long the form is. |
| **`Field`** | The asterisk stays in ink, never red. An optional field says *Optional.* in its hint. The error takes the hint's place and says what to type. | Already true of `useFieldError`; stated here so it holds on every form. |
| **`Pill`** | *Provisional* is `warn` for staff and the client, and **`idle` in the vendor portal**. | 13 · Decisions shows the vendor audience no caution tone. The shipped vendor Payments uses `warn`. |
| **`Panel`** | The two body variants from the polish pass — `density` and `continued` — are used by the Money screens. **Retheme:** flat on the default surface with a border and no shadow; radius large. A `raised` variant — the raised surface and its shadow — is used once per screen, by `Hero` and by the record pane. | The published elevation guidance: a border groups, a shadow is spent on one focal point. |
| **`Pill`** — retheme | Drawn as a lozenge: small radius, sentence case, bold at 12/16, 2px by 4px padding. `active` is the neutral fill with a dot. **`info` is never used** — information is a `Notice`. | Blue is the brand and every affordance, so a blue status would read as something to press. |
| **`Notice`** — retheme | `info` sits on the information surface with the information icon colour, not on the brand's selected fill. `warn` shows its icon in the caution ink, which now holds contrast on its fill. | The six states in `00-foundations.html`. |
| **`Tabs`** — retheme | Not rendered on a page that lives inside a sidebar section — Buying's four pages, Money's five, Projects' three. Sales, Site and Approvals keep theirs. The selected tab takes the selected ink and a 2px selected underline. | The section is the navigation; the same links twice is two places to look for one thing. |
| **`Notice`** — elements | Its actions are **links**, separated by a middle dot, as the published section message's are — whatever a caller passes is rendered as a link. A *Try again* that must be a button belongs to an empty state, not a notice. | The published anatomy. |
| **`Pill`** — elements | The published lozenge exactly: 20px, 2px by 4px inside a transparent 1px border, small radius, body-small bold, the subtler status fill under the bolder status ink. `active` is the **information** lozenge — blue — as published; the grey-with-a-dot in-progress is withdrawn. Never a count and never an applied label: those are `Badge` and `Tag` (§3). | The owner dropped the taste deviation on 17 September. |
| **`Field`** — elements | Focus is the published field's: the border in the focus colour, 2px in all, no outer ring. A composed field — the rupee prefix, a quantity's unit, the search icon, the chevron — pads its input for the mark it carries. | The published text field. |
| **`Empty`** — elements | The published anatomy and both sizes; its button group stays in a row at every width; the image is decorative (`aria-hidden`) and the heading and description carry the meaning. Also the shape of every whole-page answer — unreachable, not found, gone wrong, signed out, a project you cannot open. | The published empty state. |
| **`Drawer`, `Modal`, `Popup`, `Flag`, `Toggle`, `Tabs`, `Pager`, `SortableHeader`** — elements | Each enters and leaves on its published motion token, and under reduced motion crossfades or cuts; see part 14. The dynamic table's cells are 4px by 8px with the first and last flush, and the table takes its inset from its card. | Parts 1 and 14. |
| **The app shell's navigation** (`apps/web/app/_components/nav.tsx`) | Destinations become sections: see `SideNav` in §3. The current page takes the selected fill, selected ink and a 2px selected bar; a record opened from a list marks that list with `aria-current="true"`. | Drawn in `12-project-scope.html` under *The sidebar, in sections*. |
| **The app shell's navigation** — familiar | The top bar is a dark island — it carries `data-theme="dark"` so the dark neutral surface tokens resolve inside it in both themes — holding the product mark, the project switcher first, the search with its `/` hint, one primary **+ New**, the bell, settings and the person; under 640px the search is an icon, New is an icon and the mark, settings and the person leave. The sidebar is light in light: an icon on every item, a chevron on every section, a section's pages indented, **the current page a solid pill** — the bold selected fill under the inverse ink, 5.20:1 light and 6.00:1 dark — and in the icon rail the section holding the current page takes the pill; a collapse control at its foot. | The look the buyers know. The selected bar of the line above is superseded; the finding that a grey fill alone fails 3:1 stands. |
| **`Stat`** — familiar | Every stat carries a **disc**: its icon on an accent's subtlest fill under that accent's icon colour, one accent per tile — green money coming in, red money going out, yellow what needs watching, teal cash, blue orders and contracts, purple what waits on a person, magenta the site, grey a plain count. The disc sits left of the label and figure. The compact stat in a drawer carries none. | Each pair measures 3:1 or better (the non-text gate, 16 pairs). |
| **`Panel`** — familiar | A card's header is a strip on the sunken surface holding the title, an optional help icon (an icon button whose label is the help text) and at most one action. A card whose title would only repeat the list's view name has no header. | The reference's card. |
| **`Toolbar`** — familiar | A small *View by* label precedes the filters. | |
| **`PageHeader`** — familiar | On a list page the title is the **view's name with a chevron** — *All orders*, *All vendors*, *Bills due*, *Waiting on you* — a subtle button that will open the saved views; a **kebab** (*More actions*) sits before the one primary; a page-level warning sits beside the title as a chip on the caution fill. A section page with tabs (Sales, Site) keeps its section title. | The frame gate keeps the primary last and the switcher first, so the kebab precedes the primary and the switcher precedes the search. |
| **`Money`** — familiar | Unchanged as a formatter. Where a figure has a direction it is wrapped: money coming in on the green text accent with a plus, money going out on the red text accent with a minus, an overdue figure as the caution ink on the caution fill; the not-yet-due figure and every total stay plain. | Coloured plain text is for money direction only; caution is never bare text. |
| **Table heads** — familiar | Small capitals with a medium letter-spacing, superseding sentence case in a table's head; sentence case stands everywhere else. | Recorded on `00-foundations.html`. |
| **The app shell** — measured (19 September) | The top bar spans the whole window: the product's mark at the far left over the sidebar column (the frame gate measures it first, the switcher second), then the switcher, then the search with its `/` hint; at the right the tenant's name, the one primary **+ New**, the bell, settings, the person. Navy in both themes — the bar is a dark island resolving the dark set, so its surface is the brand's subtlest dark surface (Blue1000) and its search one step lighter (Blue900). The sidebar sits on the sunken surface: 38px rows with a 14px label, an icon on every item, a small triangle on every section, the open section tinted with its pages indented under it, the current page the Blue700 pill, a collapse control at the foot. Under 1000px the bar's mark is the rail's width and the tenant's name goes; under 640px the mark goes and the hamburger leads. | The reference's measurements, each recorded in `TOKEN-DIFF.md` §6 with the step it took. |
| **`Stat`** — measured | Today's three tiles are no longer stats: they are the money card (`OwedCard`'s anatomy as `FigureCard`, §3) — a header strip with the title, a help icon and one action, the figure, one line of meaning, a proportion bar where there is a ratio (ordered against contract; due against in hand), the two figures the ratio is made of beneath. The sparklines are gone; the advice the tile highlighted is the header's action. `Stat` with its disc stands everywhere else. | |
| **`ListFrame`** — measured | Every list leads with its full-width state, in the reference's columns: date, number as a link, vendor, project, a status lozenge, the amount right-aligned, an attachment clip. The head row is on the sunken surface with small-capital heads in the subtlest ink; the dividers stay the published border (the lighter grey the reference uses fails the hairline floor). The record beside the list is the second state, opened by clicking a row, and **it keeps number, status and amount as columns**; only reference folds into the detail line, which hangs under the number wherever that column sits. | Supersedes the fold rule in §4. |
| **`Toolbar`** — measured | *View by:* then every filter as its field and value together — *Status: All*, *Period: All* — with a divider between. | |
| **`Pager`** — measured | The footer reads *Total 41 orders · 12 per page · 1–12* with previous and next; the numbered pages are gone. | The reference's footer. |
| **`RecordPane`** — measured | One rule for the action row: docked at the foot, the primary at the far right, a secondary beside it, the destructive action as a subtle button at the far left with a label that says what it does. Orders (*Cancel the order…* · *Open the full order*) and Approvals (*Decline…* · *Approve*) follow it. | |
| **The app shell** — navigation (19 September, later) | Two trees, one shell. `SideNav` takes a level: at the firm — Today, Approvals with its count, then Sales (Pipeline, Leads, Rate analysis), Projects (All projects, Documents), Buying (Orders, Vendors, Agreed rates, Stock), Site (Daily reports, Measurements & imprest), Money (Bills, Payments, Tax deducted, Client billing, Retention), Reports; inside a project — ◂ All projects, the project's block, Overview, then Design (Brief, Design, Drawings, Selections, Joinery), Build (BOQ, Takeoff, Orders, Site, Recce, Milestones, Stock), Commercial (Commercials, Variations, Client actions, Bills, Client billing), People (Team, Timesheets), Close (Handover, Warranty); Approvals pinned at the foot of both, then Configure features and Collapse. The open section is tinted blue-100; the current page is a pill with a `+` for its module's quick-create. The tree is generated from enabled modules × role permissions (part 3's mapping table); Settings has left it for the gear; Rate analysis has moved to Sales; the *firm* chips are gone. The top bar: a 48px bar, the mark and the name in a 200px brand column ending in a divider darker than the bar, the switcher and the 300×34 search on a lifted alpha neutral, recent history, a *Demo organisation* notice, the tenant, a 32px square that creates, the bell, the gear, a 28px avatar. A vendor's bar has no switcher, square or gear; a client's a switcher only with more than one project; the operator's a tenant switcher. | The frame gate measures the order per app; the consistency gate holds the bar's heights and the square's size. |
| **`ScopeSwitcher`** — navigation | No ×: the way out is the sidebar's ◂ All projects. The button reads *All projects* or the code and the name's first clause; the menu is a search, then All projects, Recent, Mine, All active, Finished folded with its count, and a footer of *All projects* · *New project*. A project the server would not resolve — refused, missing, unreachable — is the server's words on a dashed edge. | The state pill for a finished project moved to the sidebar's block. |
| **`Toolbar`** — navigation | A Project filter belongs on every firm-level list and on no project-level list. | The frame gate measures both; the old rule — no Project filter anywhere — is superseded. |
| **`PageHeader`** — navigation | The view switch opens the saved-views menu (§3); the kebab opens its menu (§3). A document's page — an order — carries the document toolbar (§3) in the actions slot with the decision as the primary. | |
| **`RecordPane`** — navigation | A bill, an invoice and a voucher open with PDF and Send at the top of the pane; the money action stays docked at the foot. | |
| **`Tabs`** — navigation | Not rendered on any project page: the sidebar is the lifecycle, and the page carries its section as a crumb. The phases strip is gone. Today carries one tab row — *Today* · *Getting started* — until the setup steps are done. | |
| **`Money`** — navigation | Money going out is the orange text accent (Orange800), the reference's; taken as the owner's decision, with the two swatches declared apart in the token table so the India layer finds no adjacency. | Until then the red text accent. |
| **`MeterList`** — clean-up (19 September, last) | Each meter is its own contract: the track is 0–100% of that contract at a fixed width, so the 85% watch line sits at the same place on every row; an overrun is drawn past the track's end on `--chart-band`, now a bold yellow; rows sort by ordered share; no contract value draws a dashed track with the amount and *no contract value yet*. The legend renders what the marks render — the watch line dashed in its own token. | The non-text gate reads every mark from the property that paints it, obligates the band, the threshold, the series fill, the marker and every legend swatch, exempts the track, the area fill and a gridline by name, and holds each swatch to its mark. |
| **`FigureCard`** — clean-up | In a row: the header strip is a fixed two-line height on every card, the action at its right and centred, no truncation, so the figures sit on one baseline; every card carries its bar (Margin at risk: budget against committed, the overrun the short part). The actions are one word. | The alignment gate measures across a row: sibling cards share a header height and a figure baseline. |
| **`Pill`**, **`Notice`** — no highlighter | The caution fill is under a lozenge or a section message only. A figure, a label or a sentence never sits on a coloured fill: overdue is an amber small-capitals label over an ink figure; a warning is amber text with its icon; the advice a tile used to highlight is its header's action; a due-today mark is amber text. The alignment gate's caution rule was rewritten to this. | The owner's rule of 19 September. |

---

## 3. New in this pass

| Name | What it is | Notes |
|---|---|---|
| **`ScopeSwitcher`** | The project switcher: a button first in the top bar showing *All projects* or the project's code and name, an × beside it that leaves the project, and a dialog holding a combobox and a grouped listbox — *All projects*, *On your team*, *Everything else you can see*, and *Handed over and closed* folded. | Reads and writes `?project=<id>` — the id, never the code. A filled edge when the scope applies to the page; a dashed edge (`held`) when the page is tenant-wide and the scope is only carried through. Keyboard: Tab, Enter/Space, type to filter, ↑↓ Home End, Enter chooses as a history entry, Esc closes without change and returns focus. No single-key shortcut. |
| **`ScopeSheet`** | The same list as a full-height sheet under 640px | Touch-height rows, a 16px search, closes by choosing, by ×, or by the back gesture. |
| **`PageHeader`** | Crumbs; title and status on one row with the actions right-aligned and centred on it — secondary, *More*, then the one primary last; one line under the title, or up to five record facts; then tabs. | Replaces every `page-head` div. The first crumb is the project when there is a scope. The frame gate measures the title's edge, the actions' edge and row, and that the primary is last. |
| **`FilterButton`** | A toolbar button naming its field, and its value when on | The popover it opens is the existing filter control. |
| **`ColumnControl`** | *Columns* in the toolbar: a checklist of the table's columns with identity and decision locked, and *Back to the default columns* | Kept per person on the server — the one piece of list state not in the address, because it changes what a person sees of the records and never which records a link opens. |
| **`RecordPane`** | The record beside the list: identity and status, ⤢ to the full page, ×, its facts and body, and its actions docked at the foot | Its address is the list's plus the record's key (`?order=`, `?bill=`, `?payment=`, `?invoice=`, `?holding=` — the names already shipped). ↑↓ in the list move the open record. |
| **`SideNav`**, **`NavSection`** | The sidebar in sections. Today and Approvals pinned and never folded; Sales, Site and Settings flat; Projects (3 pages), Buying (4) and Money (5) as sections. A section is a disclosure — a `<button aria-expanded aria-controls>` over a list of links — never a menu or a tree. A folded section shows the total waiting inside it; the section holding the current page opens on arrival; inside a project, the firm's pages say *firm*. | **Keyboard:** Tab through what is visible; Enter or Space opens and folds; ↑↓ move between visible entries and stop at the ends; Home and End; ← → do nothing. Remembered per person on the server — there is no store yet. |
| **`NavFlyout`** | In the icon rail, a section's pages in a panel beside the rail, over the page | Opens from the section icon with focus on its first link; Esc or tabbing out closes it and returns focus to the icon. |
| **`Switch`**, **Your preferences › Keyboard** | A `role="switch"` control, and the per-person page holding *Use single-key shortcuts* with the list of shortcuts and whether each is on | WCAG 2.1.4. Only `/` and `?` are single characters; Esc, arrows in a table and Ctrl or Alt chords are unaffected. Reached from the account menu. Needs a per-person preference store. |
| **`Badge`** | A count: the sidebar's, the bell's, a tab's. Neutral, or `important` for the bell, `primary` where the count is the current place's | The published badge. Never a status. |
| **`Tag`** | A label someone applied, or a removable filter with its × | The published tag. `FilterChips` renders these. |
| **`Spinner`**, **`ProgressBar`**, **`ProgressTracker`** | The three waits: a short wait inside a component or a button; a known amount done; the steps of an approval | Published components; `Stepper` draws the tracker. |
| **`Banner`**, **`InlineMessage`**, **`Tooltip`**, **`Breadcrumbs`**, **`InlineEdit`**, **`DatePicker`** | Drawn where the product uses them — parts 4, 3, 4, 6 — and in every state in part 1 | Published components. |
| **`StackedBar`**, **`Bars`** | A status series stacked (off track, at risk, on track, paused — the bold status chart colours, a hairline of the surface between segments, off track hatched and paused stippled, a legend with counts); bars on axes in one colour with gridlines, tick labels and the hovered bar's tooltip | The data-visualisation guidance; the data in words under each. |
| **`ListStates`** | The six states a list can be in, drawn with the list's own card, toolbar and header: loading, empty, no result after filtering, error, refused, unreachable | Not a component so much as a contract on `ListFrame`: which parts each state keeps. Specified in `00-foundations.html` under *The patterns*. |
| **`NewMenu`** — familiar | The **+ New** button in the top bar and its dropdown menu: everything this person may create, grouped by area — Sales, Projects, Buying, Site, Money — each item saying whether it is the firm's or belongs to a project, and inside a project which one | Drawn open on `04-today.html`. Needs a permission read (what this person may create) and the scope; neither exists as one call. |
| **`Disc`** — familiar | The stat's disc: an icon on `--disc-<hue>` under `--disc-<hue>-icon` | Eight hues; `Stat` chooses from its label unless told. |
| **`OwedCard`** — familiar | A money card: the title with a help icon, the total, a proportion bar (the overdue part on the yellow ramp, the not-yet-due part grey, a hairline of the surface between), the split beneath as *Current* and *Overdue* in small capitals, a note | Total receivables and Total payables on Today, Bills and Client billing; the bar is `role="img"` with the percentage as its label. |
| **`CashFlowCard`** — familiar | A period picker in the header, a single-series line on a light fill with a marker per point and month labels, and four figures — cash at the start, incoming, outgoing, cash today | On Today. The source is the payments and receipts recorded here, not Tally; the opening figure needs a read that does not exist. |
| **`MoneyDirection`** — familiar | `Money` wrapped for direction: in, out, overdue | See `Money` in §2. |
| **`ViewSwitch`** — familiar | The list's title as a subtle button with a chevron naming the current view | Opens a listbox of saved views; there is no saved-view store, so it lists nothing yet. |
| **`WarnChip`** — familiar | A page-level warning in the header row: an icon and text on the caution fill | *GSTIN missing for 2 vendors* on Buying › Vendors; the count needs a vendor read. |
| **`NavCollapse`** — familiar | The control at the sidebar's foot that folds it to the icon rail | Its state is a person's, and needs the preference store (README item 5). |
| **`FigureCard`** — measured | `OwedCard` for any headline figure: title, help, one action; the figure; one line of meaning; a bar as a plain ratio (the covered part neutral over the track) or as a shortfall (the covered part neutral, the short part on the yellow ramp); the two figures beneath in small capitals | Today's three tiles. |
| **`AttachmentClip`** — measured | A paperclip in a list's last column, named for a reader, where the record has a file; a dash where it has none | Orders (the vendor's acceptance), bills (the vendor's bill), payments (the bank's advice), invoices (the tax invoice). Which records carry a file is a read that does not exist yet. |
| **`CategoryList`** — measured | A vertical list of categories with a count each, inside a page — side navigation's shape on the page's surface; a row of chips under 760px | Settings. |
| **`GroupedTable`** — measured | One table with a group row per category — the group's name and a count badge — and a star on every row to favourite it | The Reports Center since later on 19 September (Settings until then): fifteen reports in five groups. A favourite is a person's and needs the preference store. |
| **`ProjectBlock`** — navigation | At the head of a project's sidebar under ◂ All projects: code, name, its state as a lozenge, the client and the contract | The scope said in words. |
| **`NavCurrent`** — navigation | The current page's pill with a `+` on it that raises that module's new thing | The square's menu, one click nearer; the same permission read. |
| **`NewSquare`** — navigation | The quick-create square: 32×32 on the dark set's `color.chart.brand` (Blue500) with the light set's inverse ink as its plus (the dark set has no white), radius 4, *New · C* on hover, the menu on click grouped by section with the project pre-filled inside one | Replaces `NewMenu`'s word button; the menu stands. Two islands — see README item 7. |
| **`RecentHistory`** — navigation | A clock in the bar opening the last records this person opened, newest first, with the project each is on | Needs a store (README item 4). |
| **`DemoNotice`** — navigation | *Demo organisation* in the caution ink with its icon, on the bar, when the tenant is a demo | The one caution-coloured word on the bar. |
| **`ViewsMenu`** — navigation | Under a list's title: the firm's views, then yours, a star per favourite, *+ New view* with criteria, columns and favourite | Needs the saved-view store (README item 6). |
| **`KebabMenu`** — navigation | The list's kebab, open: sort, import, export, refresh, columns | What is about the list, not a row. |
| **`DocToolbar`** — navigation | A document opens with PDF and Send, then the decision or the money action its state allows; on a page the primary is the decision, in a pane the money action stays at the foot | Orders, bills, invoices, vouchers. |
| **`SettingsHub`** — navigation | What the gear opens: every settings page as a card with an icon and one line, grouped | Fourteen pages; Terminology is new. |
| **`Overview`** — navigation | A project's Today: the hero, three `FigureCard`s — contract against ordered against billed, margin at risk, this week on site — then waiting on the client, open variations, next milestones, the team | Part 1. |

---

## 4. The column priority, which every table now declares

Every column is **1** (identity or the decision — never drops), **2** (money and status) or **3**
(reference). A priority-3 column folds into the row's detail line when the list is narrow. A row therefore
carries its detail line twice in the markup — once for the narrow list, once for the list with a pane — and
CSS chooses. In React that is one `detail` render prop per row and a `pane` flag on `ListFrame`.

> **Superseded in part, 19 September.** This section used to say that while a record is open beside the list,
> priority 2 folds as well. It does not any more: beside a record the list keeps its number, status and amount
> as columns — the owner's rule — and only priority 3 folds. The detail line hangs under the identity column,
> wherever that column sits, now that a date leads the reference's column order.

---

## 5. One place where this document bends to the code

`tabs.tsx` says it plainly:

> Every tab is always shown. The legacy hides tabs and buttons by deriving a role in the browser; a
> hidden tab is not an access control, because the URL still resolves.

The scope model follows it. Nothing in the navigation is hidden by the scope: a tenant-wide screen stays
in the sidebar inside a project and says it is not narrowed; a scoped screen stays reachable in All
projects and asks which project. And the three shapes of *no* stay apart — **refused**, said out loud
with the reason; **absent**, a control that is not part of your job and is not drawn; **never sent**, data
the server does not return to your role, with no gap where it would have been.

---

## 6. What I would not do

- **Do not make a section a menu.** `role="menu"` takes the arrow keys and Tab and announces *menu item* instead of *link*; nobody could open a page in a new tab.
- **Do not store the sidebar's open sections, or the shortcut setting, in the browser.** They are a person's, and follow them to another computer.
- **Do not extract `ScopeSwitcher` into the kit before the shell uses it.** It has one consumer — the
  frame — and `index.ts` extracts a pattern at its third consumer. `PageHeader`, `FilterButton` and
  `RecordPane` pass that bar on the day they land: every list screen uses them.
- **Do not add a density setting to `ListFrame`.** One density is what makes a screenshot in a support
  ticket mean the same thing to everybody.
- **Do not touch `Money`.**

---

## 7. Every element, and the published component it is

Inventoried on 17 September 2026 from the built set, extended on 18 and 19 September with the familiar look's
parts, and counted by script (`build/census.mjs`) in the product frames of every part
except the components page and the motion page (`01-components.html` prints this list with the same counts).
**Published** means drawn to the component's anatomy, sizes, appearances and states as read from its package;
**composed** means the system publishes nothing for it, so it is built only from its tokens and its published
components; **custom** belongs to this document, not to the product.

| | Kinds | Elements in product frames |
|---|---|---|
| Published component | **38** | **5,524** |
| Composed from primitives | **33** | **1,652** |
| Custom — the document's own furniture | **1** | **89** |

| Element | Selector | Published component | Kind | In frames | Note |
|---|---|---|---|---|---|
| Button | `.btn` | Button | published | 838 | Default, primary, subtle, danger and warning; compact; icon; selected, disabled and loading. |
| Filter button | `.fbtn` | Button, as a dropdown trigger | published | 52 | The default appearance with a chevron; applied, the selected appearance. |
| Link in a message or a toolbar | `.link-btn` | Button, link appearance | published | 16 |  |
| Pagination | `.pages` | Pagination | published | 38 | Subtle buttons; the current page selected. |
| Spinner | `.spinner` | Spinner | published | 2 |  |
| Skeleton | `.skeleton` | Skeleton | published | 21 |  |
| Progress bar | `.progress-bar, .progress, .setup .prog` | Progress bar | published | 25 | Only where the amount done is known. |
| Progress tracker | `.tracker` | Progress tracker | published | 1 |  |
| Lozenge | `.pill` | Lozenge | published | 227 | A status. Six appearances, one per state. |
| Tag | `.tag, .dsx-tag, .scls` | Tag | published | 195 | A label someone applied, or a removable filter — and the sidebar’s firm mark, a route’s fixed scope. |
| Badge | `.badge` | Badge | published | 738 | A count. |
| Avatar | `.avatar` | Avatar | published | 129 | Round for a person, a small corner for a project. |
| Avatar group | `.avatar-group` | Avatar group | published | 2 |  |
| Section message | `.notice` | Section message | published | 22 |  |
| Inline message | `.inline-msg` | Inline message | published | 1 |  |
| Banner | `.banner` | Banner | published | 1 |  |
| Flag | `.flag` | Flag | published | 2 |  |
| Tooltip | `.tooltip` | Tooltip | published | 1 |  |
| Popup | `.popup, .popover, .scope-pop, .cols-pop, .inline-msg-pop` | Popup | published | 7 |  |
| Dropdown menu | `.menu` | Dropdown menu | published | 2 |  |
| Modal dialog | `.modal` | Modal dialog | published | 1 |  |
| Drawer | `.drawer` | Drawer | published | 4 |  |
| Blanket | `.blanket, .scrim` | Blanket | published | 5 |  |
| Tabs | `.tabs, .subtabs` | Tabs | published | 20 |  |
| Breadcrumbs | `.pgh-c, .crumb` | Breadcrumbs | published | 50 |  |
| Page header | `.pgh` | Page header | published | 84 | Crumbs, the title with its actions on the same row, then tabs. |
| Table | `table.tbl` | Dynamic table | published | 54 |  |
| Empty state | `.empty` | Empty state | published | 6 | Image, heading, description, secondary and primary action; wide and narrow. |
| Toggle | `.toggle` | Toggle | published | 1 |  |
| Checkbox | `input[type="checkbox"]` | Checkbox | published | 128 |  |
| Radio | `input[type="radio"]` | Radio | published | 6 |  |
| Select | `select` | Select | published | 3 |  |
| Text field and text area | `input[type="text"], input[type="search"], input[type="email"], input:not([type]), textarea` | Text field, Text area | published | 141 |  |
| Date picker | `.datepick, input[type="date"]` | Date picker | published | 13 |  |
| Inline edit | `.inline-edit` | Inline edit | published | 8 |  |
| Side navigation | `.side-nav` | Navigation system — side navigation | published | 84 | On the sunken surface: 38px rows, an icon on every item, a triangle on every section, the open section tinted with its pages indented, the current page a solid pill, the collapse control at its foot. |
| Top bar | `.topbar` | Navigation system — top navigation, navy in both themes | published | 80 | Across the window: the product’s mark over the sidebar column, the project switcher, search with its / hint; the tenant’s name, + New, notifications, settings, the person. |
| Icon | `svg.i` | Icon — the published grid, stroke and size, drawn as our own | published | 2516 | The system’s own icons are not used; the drawings are this product’s. |
| Money field | `.money-in` | Text field, with a ₹ prefix and right-aligned tabular figures | composed | 6 | The system publishes no currency field. |
| Money cell | `td.num` | Text, tabular figures, one formatter | composed | 714 | Indian grouping and two decimals are this product’s rule, not a component. |
| BOQ quantity | `.inline-edit.qty` | Inline edit, with a numeric field and the unit | composed | 8 | A quantity with a unit is not a published field. |
| Stat | `.stat` | Heading, metric text and a sparkline on the default surface, behind a disc | composed | 84 | No published stat tile. |
| Stat disc | `.disc` | Icon on an accent subtlest fill under its accent icon colour | composed | 83 | One accent per tile; the hue names what the figure is about, grey for a plain count. |
| Owed card | `.owe` | Card, heading with a help icon, a proportion bar, labelled figures | composed | 32 | Total, the overdue part on the yellow ramp, the not-yet-due part neutral, the split beneath; overdue an amber label over an ink figure. |
| Figure card | `.owe.fig` | The owed card for any headline figure: a line of meaning and a ratio bar | composed | 24 | Today’s three tiles, on the same card as Total receivables. |
| Attachment clip | `.clip` | Icon, named for a reader | composed | 79 | A list row with a file attached. |
| Category list | `.cat-list` | Side navigation inside a page | composed | 1 | Settings: the categories beside the grouped table. |
| Grouped table | `.settings-tbl` | Dynamic table with a group row and a count badge per group, a star to favourite a row | composed | 1 | Settings: thirteen pages in one place. |
| Cash-flow card | `.cash` | Card, a filled single-series line with a marker per point, four figures | composed | 2 | Opening, incoming, outgoing, closing — the chart from the data-visualisation tokens. |
| Money direction | `.money.in, .money.out, .money.overdue` | Text on the accent green and red text tokens with its sign; overdue as caution ink on its fill | composed | 40 | Coloured plain text is for money direction only. |
| Row waiting on this person | `tr.mine` | A table row on the purple subtlest fill | composed | 5 | The tint of the waiting lozenge; the lozenge in the row says why. |
| Hero | `.hero` | The raised surface, metric text, a button | composed | 23 | No published hero. |
| Card | `.card` | The default surface with a border; a sunken header strip holding the title, a help icon and one action | composed | 139 | No published card; the elevation guidance draws it. |
| Chart — one grammar | `.chart` with its kind: `.spark`, `.owe`, `.meters` (+ `.meter-one`), `.bars` (grouped, emphasis), `.stack`, `.parts`, `.line`, `.ring`, `.progress`; `.plot`, `.x`, `.legend`, `.tooltip`, `details.chart-table` | The data-visualisation tokens and guidance; the tooltip is the published Tooltip | composed | 32 | The system publishes chart colours and guidance, not a chart component. One class system since 19 September (charts): `.spark`, `.owe-bar`, `.meter`, `.chart.stack/.bars/.cash-chart`, `.progress/.prog/.progress-bar/.rate-bar` and the hero's `.hbar` were five. |
| Dashboard grid | `.grid` with `.c3 .c4 .c6 .c8` | Grid (a layout, not a component) | composed | 8 | Twelve columns, a 24px gutter, one card anatomy on it (19 September, the grid): Today and Overview. |
| Tile | `.card.tile` — header with `.disc.sm`, `.fig`, `.meaning`, a bar or an ageing strip, `.owe-split`, `.foot` | Card (composed) | composed | 12 | A figure card on the grid: the figure at 24, one line of meaning, the one action at the foot. |
| Money card | `.card.owe` — header with `.disc.sm`, `.owe-total`, `.chart.owe.age`, `.owe-split.age` | Card (composed) | composed | 8 | The total at 28, the bar in ageing buckets (current · 1–30 · 31–60 · 60+), the buckets beneath. |
| Duotone icon on a disc | `.disc > svg.duo` | Icon (the tinted disc is a composition) | composed | — | The middle of three styles: a 24px line and one flat block, on a stat's disc, a figure or money card's, a settings hub card's. `build/duotone.mjs`, 19 icons. |
| Record pane | `.pane` | The overlay surface with a page header and a docked footer | composed | 9 | A drawer is modal; a record beside its list is not. |
| Project switcher | `.scope` | Button, popup, text field and menu | composed | 80 | No published project switcher. |
| + New | `.new-wrap` | Button, primary, opening a dropdown menu grouped by area | composed | 80 | Everything this person may create, narrowed by the project in scope. |
| View switch | `.view-switch` | Button, subtle, as the list’s title with a chevron | composed | 27 | The list is the page; its title is the view’s name. |
| Warning beside a title | `.warn-chip` | Icon and text on the caution fill | composed | 1 | A page-level warning in the header row, never bare amber text. |
| Toolbar and bulk bar | `.toolbar, .bulkbar` | Text field, buttons, a button group | composed | 36 | A list’s filters follow a small “View by” label. |
| Board | `.kanban` | Columns with the extra-large corner, cards on the default surface | composed | 2 | No published board in the core set. |
| Key facts | `dl.kv, .pgh-f` | Text | composed | 19 |  |
| Notifications panel | `.popover .notifs` | Popup, avatar and menu items | composed | 1 |  |
| Setup checklist | `.setup` | Progress bar and a list | composed | 2 |  |
| Portal tab bar | `.p-nav` | Tabs, as a bar across the foot of a phone | composed | 5 | No published mobile navigation. |
| Illustration | `svg.illo` | Our own drawings, in the owner’s described style | composed | 6 | No published illustration may be used outside the system’s own products. |
| Simple list | `.list, .steps, .checks, .docs, .mstones` | Menu items and text, on the default surface | composed | 21 | A card’s rows — your day, an activity feed, a checklist, documents, milestones — with the list item’s hover; no published list of this kind. |
| Phone sheet | `.psheet` | Modal dialog, as a full-height sheet under 640px | composed | 2 | The published modal has no sheet variant; the scope switcher and a phone form rise as one. |
| Section flyout | `.nav-fly` | Popup, holding a navigation section’s pages beside the icon rail | composed | 1 |  |
| Portal phases and record blocks | `.phases, .recce, .variation, .taxrow, .daysum, .photos, .owed, .pref-row, .rate-bar` | Text, lozenges and buttons on the default surface | composed | 44 | Record layouts of their own screens — a portal’s phase strip, a recce, a variation, a tax row, a day’s summary, a photo strip, what is owed, a preference row, a rate bar. |
| Tick and keyboard hint | `.tick, kbd` | Icon in a circle; a key cap | composed | 43 | A setup step’s done mark; the / and ? hints in the search field. |
| The document’s own furniture | `.dsx-nav, .dsx-note, .dsx-h3-note, .vline, .dsx-frame > .bar` | none | custom | 89 | The design document, not the product: its navigation, notes, value lines and frame chrome. |

The twenty-three drawings — one per empty-state subject since 19 September (six until then; six redrawn and a cup of chai added for the client portal later the same day): sunrise over a site board, a checklist, a bell, a lead card, a floor plan, a BOQ sheet, a calculator, an order form, a delivery crate, a shop front, an empty in-tray, a site cone, a tape measure, a camera, a cup of chai, a drawing roll, a paid voucher, and the neutral set — a magnifier, a signpost, an unplugged cable, a warning triangle, a key — and a row of buildings for the operator — are this product's own, in the style the owner described (flat blocks of the accent colours registered under one hand-drawn line, sparkles off the object, slightly imperfect geometry), on a 160-unit canvas, with a dark variant by construction. The map from each drawing to the shipped `Empty` component's name is `ILLO_FOR` in `build/illustrations.mjs`; ten names are new to the product (README). They are decorative: `aria-hidden` on every reference, the meaning in the heading and
text beside them. The licence finding that keeps every published icon, illustration, logo and typeface out of
the product is in `00-foundations.html` under *Provenance*.
