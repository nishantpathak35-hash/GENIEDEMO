// css-shell.mjs — colour where it carries meaning (18 September 2026): the dark top bar, the sidebar's pill, the
// card's header strip, the tinted discs, the money cards and direction, the filled line, the view bar, the tinted
// row. Every colour is a component token pointing at a published accent token.
export const ZOHO = `
/* ---- The top bar (19 September 2026, measured): 48px, across the whole window, a dark island. It carries
   data-theme="dark", so every token inside it resolves to the dark set in both themes — navy from the brand's
   subtlest dark surface, the lifted fill an alpha neutral over it (never a grey, never darker than the bar). A
   200px brand column over the sidebar with a line-icon mark and the product's name; the switcher and the search
   on the lifted fill; at the right the demo notice, the tenant, a divider, the quick-create square in the brand's
   mark colour, the bell, the gear, a 28px avatar. Icons on the published 16px grid, muted, at a 40px pitch. ---- */
.topbar { background: var(--topbar); color: var(--ink); container-type: inline-size; gap: var(--space-100); padding: 0 var(--space-200) 0 0; min-height: var(--topbar-height); height: var(--topbar-height); }
.topbar .brand-bar { display: inline-flex; align-items: center; gap: var(--space-100); flex: none; width: var(--side-width); height: 100%; padding-left: var(--space-200); margin-right: var(--space-100); color: var(--ink); font: var(--font-weight-medium) var(--brand-size)/1 var(--font-family-heading); white-space: nowrap; text-decoration: none; border-right: var(--border-width) solid var(--topbar-div); }
.topbar .brand-bar:hover { color: var(--ink); text-decoration: none; }
.topbar .brand-bar .mark { display: inline-flex; color: var(--ink); flex: none; }
.topbar .brand-bar .mark svg.i { width: var(--space-200); height: var(--space-200); }
.topbar .brand-bar .brand-t { overflow: hidden; text-overflow: ellipsis; }
.topbar .btn.ghost { color: var(--ink-soft); width: var(--control-height); height: var(--control-height); }
.topbar .btn.ghost:hover { color: var(--ink); background: var(--topbar-lift); }
.page-theme { color: var(--ink); }   /* a menu opened from the dark bar: its ink is the page's, not the bar's inherited one */
.topbar .scope { flex: 0 0 auto; min-width: 0; max-width: var(--search-width); }   /* whole at the web; gives way under 1000px */   /* never wider than the search beside it */
.topbar .scope-btn .sc { flex: none; overflow: visible; }   /* the code is never cut; the name gives way */
.topbar .scope-btn { height: var(--bar-control-height); border: 0; background: var(--topbar-lift); color: var(--ink); }
.topbar .scope-btn:hover { background: var(--topbar-lift-hover); border-color: transparent; }
.topbar .scope.on .scope-btn { background: var(--topbar-lift); border-color: transparent; }
.topbar .scope.held .scope-btn { background: transparent; border: var(--border-width) dashed var(--line-strong); }   /* a project the server would not resolve: words on a dashed edge, no lifted fill */
.topbar .scope-btn > .ico, .topbar .scope-btn .sn { color: var(--ink-soft); }
.topbar .search { flex: 0 1 var(--search-width); width: var(--search-width); min-width: 140px; max-width: var(--search-width); }
.topbar .search input[type="search"] { height: var(--bar-control-height); background: var(--topbar-lift); border: var(--border-width) solid var(--line-strong); color: var(--ink); padding-right: var(--space-400); text-overflow: ellipsis; }
.topbar .search input[type="search"]::placeholder { color: var(--ink-soft); }
.topbar .search .ico { color: var(--ink-soft); }
.topbar .search .search-scope { position: absolute; right: var(--space-050); top: 50%; transform: translateY(-50%); width: var(--space-300); height: var(--space-300); display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--ink-soft); border-radius: var(--radius-small); cursor: pointer; }
.topbar .search .search-scope:hover { color: var(--ink); background: var(--topbar-lift-hover); }
.topbar .search-btn { display: none; }
.topbar .demo-note { display: inline-flex; align-items: center; gap: var(--space-050); color: var(--warn); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-medium); white-space: nowrap; }
.topbar .tenant { color: var(--ink-soft); font-size: var(--font-size-body); font-weight: var(--font-weight-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.topbar .tenant-btn { display: inline-flex; align-items: center; gap: var(--space-050); height: var(--control-height); padding: 0 var(--space-100); border: 0; border-radius: var(--radius-medium); background: transparent; font: inherit; cursor: pointer; }
.topbar .tenant-btn:hover { background: var(--topbar-lift); color: var(--ink); }
.topbar .bar-div { width: var(--border-width); height: var(--space-300); background: var(--topbar-div); flex: none; }
/* the quick-create square: the brand's mark colour read in the dark set — Blue500 — with a white plus at 3.50:1 */
.topbar .new-wrap { position: relative; }
.topbar .new-sq { display: inline-flex; align-items: center; justify-content: center; width: var(--control-height); height: var(--control-height); padding: 0; border: 0; border-radius: var(--radius-small); background: var(--new-sq); color: var(--on-accent); font: inherit; cursor: pointer; transition: var(--transition-control); }
.topbar .new-sq:hover { background: var(--new-sq-hover); }
.topbar .new-sq .ico { color: var(--on-accent); }   /* the plus is a light island: the dark set has no white, its inverse ink is near-black */
.topbar .new-menu { position: absolute; top: calc(100% + var(--space-100)); right: 0; width: 300px; max-height: 70vh; overflow: auto; z-index: 12; }
.topbar .history-wrap { position: relative; display: inline-flex; flex: none; }
.topbar .history-pop { position: absolute; top: calc(100% + var(--space-100)); left: 0; width: 320px; z-index: 12; }
.history-pop .menu-t { padding: var(--space-150) var(--space-200) var(--space-050); font: var(--font-weight-bold) var(--font-size-heading-xxsmall)/var(--line-height-heading-xxsmall) var(--font-family-heading); color: var(--ink-faint); text-transform: uppercase; letter-spacing: var(--letter-spacing-caps); margin: 0; }
.history-pop .menu-i { min-height: var(--control-height); padding: var(--space-050) var(--space-200); }
.history-pop .menu-i small { color: var(--ink-faint); }
.topbar .me { display: inline-flex; align-items: center; justify-content: center; width: var(--control-height); height: var(--control-height); padding: 0; border: 0; border-radius: var(--radius-full); background: transparent; cursor: pointer; }
.topbar .me:hover { background: var(--topbar-lift); }
.topbar .me .avatar { width: var(--avatar-size-bar); height: var(--avatar-size-bar); font-size: var(--font-size-body-small); background: var(--tenant-accent); color: var(--on-accent); }
@container (max-width: 1000px) { .topbar .new-menu { width: min(300px, 100vw - var(--space-400)); } }
@container (max-width: 999px) { .topbar .brand-bar { width: var(--side-width-rail); padding-left: 0; justify-content: center; margin-right: 0; } .topbar .brand-bar .brand-t { display: none; } .topbar .tenant, .topbar .demo-note, .topbar .bar-div { display: none; } .topbar .scope { flex: 0 1 auto; min-width: 128px; } .topbar .search { flex: 1 1 140px; min-width: 120px; } .topbar .history-wrap { display: none; } }   /* a tablet: the tenant, the notice and the history go; the switcher keeps its width */
@container (max-width: 640px) { .topbar { gap: var(--space-075); padding-inline: var(--space-200); } .topbar .brand-bar { display: none; } .topbar .search { display: none; } .topbar .search-btn { display: inline-flex; } .topbar .settings-link { display: none; } .topbar .scope { flex: 1 1 auto; min-width: 0; } .topbar .scope-btn { max-width: 100%; } .topbar .me { display: none; } .topbar .spacer { flex: 0 0 0; } .topbar .scope { margin-right: auto; } }   /* on a phone the person is in the sheet the hamburger opens */
.new-menu .menu { column-gap: 0; }
.new-menu .menu-t { padding: var(--space-150) var(--space-200) var(--space-050); font: var(--font-weight-bold) var(--font-size-heading-xxsmall)/var(--line-height-heading-xxsmall) var(--font-family-heading); color: var(--ink-faint); text-transform: uppercase; letter-spacing: var(--letter-spacing-caps); }
.new-menu .menu-i { min-height: var(--control-height); padding: var(--space-050) var(--space-200); }
.new-menu .menu-i small { color: var(--ink-faint); }

/* ---- The sidebar: 200px on the sunken surface, 38px rows with an icon on every entry and a small triangle on
   every section, the open section tinted with its pages indented under it, the current page a solid pill with a
   "+" for that module's quick-create, the foot holding Configure features and the collapse control. Inside a
   project the tree sits under the project's own block, with the way back above it. ---- */
.side-nav a, .side-nav .nav-h { color: var(--ink); font-weight: var(--font-weight-regular); }
.side-nav a .ico, .side-nav .nav-h .ico { color: var(--icon-soft); }
.side-nav .nav-sec { border-radius: var(--radius-medium); }
.side-nav .nav-sec.open { background: var(--nav-open); }
.side-nav .nav-sec.open > .nav-h { font-weight: var(--font-weight-medium); }
.side-nav .nav-h .nav-chev { color: var(--icon-faint); }
.side-nav .nav-pages a { padding-left: calc(var(--space-100) + var(--space-200) + var(--space-100)); min-height: var(--nav-item-height); }
.side-nav .nav-cur { display: flex; align-items: center; border-radius: var(--radius-medium); background: var(--nav-current); color: var(--nav-current-ink); }
.side-nav .nav-cur > a { flex: 1 1 auto; min-width: 0; }
.side-nav a[aria-current] { background: var(--nav-current); color: var(--nav-current-ink); font-weight: var(--font-weight-medium); }
.side-nav a[aria-current] .ico { color: var(--nav-current-ink); }
.side-nav a[aria-current]::before { display: none; }
.side-nav a[aria-current] .badge { background: var(--nav-current-ink); color: var(--nav-current); }
.side-nav a[aria-current]:hover { background: var(--nav-current); color: var(--nav-current-ink); }
.side-nav .nav-plus { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--space-300); height: var(--space-300); margin-right: var(--space-075); border: var(--border-width) solid var(--nav-current-ink); border-radius: var(--radius-small); background: transparent; color: var(--nav-current-ink); cursor: pointer; }
.side-nav .nav-plus:hover { background: var(--nav-current-ink); color: var(--nav-current); }
.side-nav .nav-h.has-current { color: var(--ink); }
.side-nav .nav-h.has-current .ico { color: var(--icon-soft); }
.side-nav .nav-back { color: var(--ink-soft); min-height: var(--control-height); }
.side-nav .nav-back .ico { color: var(--icon-faint); }
.nav-proj { display: grid; gap: var(--space-025); padding: var(--space-100) var(--space-100) var(--space-150); margin-bottom: var(--space-050); border-bottom: var(--border-width) solid var(--line); }
.nav-proj .code { font: var(--font-weight-bold) var(--font-size-heading-small)/var(--line-height-heading-small) var(--font-family-heading); }
.nav-proj .name { color: var(--ink); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.nav-proj .pill { justify-self: start; margin-top: var(--space-025); }
.nav-proj small { color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-variant-numeric: tabular-nums; }
/* in the rail the section's icon stands for the current page inside it, so it takes the pill */
@container (max-width: 999px) { .side .side-nav .nav-h.has-current { background: var(--nav-current); color: var(--nav-current-ink); } .side .side-nav .nav-h.has-current .ico { color: var(--nav-current-ink); } .side-nav .nav-sec.open { background: transparent; } .side .nav-plus, .side .nav-proj, .side .nav-back .nav-t, .side .nav-foot .nav-t, .side .side-nav .nav-h .nav-chev { display: none; } .side .nav-cur { justify-content: center; } }
.app:has(.lv.with-pane) .side .side-nav .nav-h.has-current { background: var(--nav-current); color: var(--nav-current-ink); }
.app:has(.lv.with-pane) .side .side-nav .nav-h.has-current .ico { color: var(--nav-current-ink); }
.app:has(.lv.with-pane) :is(.side .nav-plus, .side .nav-proj, .side .nav-back .nav-t, .side .nav-foot .nav-t) { display: none; }
.app:has(.lv.with-pane) .side .nav-cur { justify-content: center; }
.owe-row { align-items: stretch; }
.owe > .card-b { display: flex; flex-direction: column; }
.owe > .card-b > .hint { margin-top: auto; padding-top: var(--space-150); }
.side .foot { margin-top: auto; padding-top: var(--space-100); border-top: var(--border-width) solid var(--line); display: grid; gap: var(--space-025); }
.side .foot .side-nav a { color: var(--ink-soft); }
.nav-foot, .nav-collapse { display: flex; align-items: center; gap: var(--space-100); width: 100%; min-height: var(--nav-item-height); padding: var(--space-050) var(--space-100); border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink-faint); font: inherit; text-decoration: none; cursor: pointer; transition: var(--motion-listitem-hovered); }
.nav-foot:hover, .nav-collapse:hover { background: var(--subtle-hover); color: var(--ink); text-decoration: none; }
.nav-foot .ico, .nav-collapse .ico { color: var(--icon-faint); }

/* ---- A portal's bar (19 September): the same bar; on a phone the mark alone, the search as its icon ---- */
.dsx-frame.phone .topbar, .dsx-frame.tablet .topbar { flex: none; }
.dsx-frame.phone .topbar .brand-bar { display: inline-flex; width: auto; padding-left: var(--space-150); margin-right: 0; border-right: 0; }   /* a portal has no menu button, so the mark stays */
.dsx-frame.phone .topbar .me { display: inline-flex; width: var(--control-height-touch); height: var(--control-height-touch); }
.dsx-frame.tablet .topbar .me { width: var(--control-height-touch); height: var(--control-height-touch); }
.dsx-frame.phone .topbar .spacer { flex: 1 1 auto; }   /* no switcher to take the room: the bell and the person keep the right edge */
.dsx-frame.phone .topbar .brand-bar .brand-t { display: none; }
.dsx-frame.phone .topbar .search, .dsx-frame.phone .topbar .tenant, .dsx-frame.phone .topbar .bar-div, .dsx-frame.phone .topbar .demo-note { display: none; }
.dsx-frame.phone .topbar .search-btn { display: inline-flex; }
.dsx-frame.tablet .topbar .brand-bar { width: auto; padding-left: var(--space-200); border-right: 0; }
/* ---- Lists (19 September): the saved-views menu under the title, the kebab's menu, a document's toolbar ---- */
.pgh-t { position: relative; }
.pgh-t .view-menu { position: absolute; top: calc(100% + var(--space-050)); left: 0; width: 320px; z-index: 12; font-size: var(--font-size-body); line-height: var(--line-height-body); font-weight: var(--font-weight-regular); }
.menu.views li[role="option"] { display: flex; align-items: center; gap: var(--space-100); padding: var(--space-075) var(--space-150); }
.menu.views li[role="option"][aria-selected="true"] { background: var(--nav-open); }
.menu.views .vname { display: inline-flex; align-items: center; gap: var(--space-100); flex: 1 1 auto; min-width: 0; }
.menu.views .ico.sp { width: var(--space-150); height: var(--space-150); }
.menu.views .star { display: inline-flex; align-items: center; justify-content: center; width: var(--space-300); height: var(--space-300); border: 0; border-radius: var(--radius-small); background: transparent; color: var(--icon-faint); cursor: pointer; }
.menu.views .star.on { color: var(--star); }
.menu.views .star:hover { background: var(--subtle-hover); color: var(--ink); }
.menu-f { border-top: var(--border-width) solid var(--line); padding: var(--space-075) var(--space-150); }
.menu-f a { display: flex; align-items: center; gap: var(--space-100); color: var(--link); text-decoration: none; font-weight: var(--font-weight-medium); }
.menu-f a small { margin-left: auto; color: var(--ink-soft); font-weight: var(--font-weight-regular); }
.doc-tb { display: flex; gap: var(--space-100); margin-bottom: var(--space-200); }
.kebab-wrap { position: relative; display: inline-flex; }
.kebab-wrap .kebab-menu { position: absolute; top: calc(100% + var(--space-050)); right: 0; width: 200px; z-index: 12; }
.kebab-menu .menu-i .spacer { flex: 1 1 auto; }
/* ---- The settings hub (19 September): groups of cards, an icon and one line each ---- */
.hub-group + .hub-group { margin-top: var(--space-300); }
.hub-h { display: flex; align-items: center; gap: var(--space-100); margin: 0 0 var(--space-150); font: var(--font-weight-semibold) var(--font-size-heading-xsmall)/var(--line-height-heading-xsmall) var(--font-text); color: var(--ink); }
.hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-200); }
/* the hub card is its own composition — a link on the default surface with a border; not a Card, whose padding is a body's */
.hub-card { display: flex; gap: var(--space-150); align-items: flex-start; margin: 0; padding: var(--space-200); border: var(--border-width) solid var(--line); border-radius: var(--radius-large); background: var(--panel); color: var(--ink); text-decoration: none; }
.hub-card:hover { background: var(--subtle-hover); text-decoration: none; }
.hub-card > .disc { flex: none; }   /* the category's tinted disc, its duotone icon */
.hub-card .hub-body { min-width: 0; }
.hub-card b { display: block; font-weight: var(--font-weight-medium); }
.hub-card b .pill { margin-left: var(--space-050); }
.hub-card small { display: block; margin-top: var(--space-025); color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.term-row { border-top: var(--border-width) solid var(--line); padding: var(--space-200) 0; }
.term-row:first-child { border-top: 0; padding-top: 0; }
.term-row .term-l { font-weight: var(--font-weight-medium); margin: 0 0 var(--space-100); }
.term-opts { display: flex; gap: var(--space-300); flex-wrap: wrap; }
.cat-list a .ico { margin-right: var(--space-050); }
/* ---- Settings: a category list on the left, one grouped table on the right ---- */
.settings-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--space-300); align-items: start; }
.cat-list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-025); }
.cat-list a { display: flex; align-items: center; gap: var(--space-100); min-height: var(--nav-item-height); padding: var(--space-050) var(--space-150); border-radius: var(--radius-medium); color: var(--ink); text-decoration: none; }
.cat-list a:hover { background: var(--subtle-hover); text-decoration: none; }
.cat-list a[aria-current] { background: var(--nav-open); font-weight: var(--font-weight-medium); }
.cat-list .badge { margin-left: auto; }
.settings-tbl tr.grp th { background: var(--card-head); text-transform: none; letter-spacing: 0; font: var(--font-weight-bold) var(--font-size-heading-xsmall)/var(--line-height-heading-xsmall) var(--font-family-heading); color: var(--ink); padding-top: var(--space-150); padding-bottom: var(--space-100); }
.settings-tbl tr.grp th .badge { margin-left: var(--space-100); vertical-align: middle; }
.settings-tbl td .sub { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.settings-tbl .star-c { width: var(--space-500); text-align: right; }
.settings-tbl .star .ico { color: var(--icon-faint); }
.settings-tbl .star[aria-pressed="true"] .ico { color: var(--disc-yellow-icon); }   /* the yellow accent’s icon, not the caution ink */
.settings-tbl .star[aria-pressed="true"] svg { fill: currentColor; }
.settings-tbl .star[aria-pressed="true"], .settings-tbl .star[aria-pressed="true"]:hover { background: transparent; border-color: transparent; box-shadow: none; }   /* the filled star is the state; no selected fill */
@container (max-width: 760px) { .settings-grid { grid-template-columns: minmax(0, 1fr); } .cat-list ul { display: flex; flex-wrap: wrap; gap: var(--space-050); } .cat-list a { min-height: var(--control-height); } }   /* narrow: the categories wrap as a row of chips above the table */

/* ---- Cards: a header strip in the sunken surface, the title with a help icon, one action at right ---- */
.card > .card-h { background: var(--card-head); border-radius: var(--radius-large) var(--radius-large) 0 0; }
.card-h .help { color: var(--icon-faint); margin-left: var(--space-025); vertical-align: middle; }
.card-h .ct { display: block; }
.card-h .ct .help { display: inline-flex; vertical-align: middle; margin-left: var(--space-050); }
.card-h .fbtn { height: var(--control-height-compact); padding: var(--space-025) var(--space-075) var(--space-025) var(--space-100); }

/* ---- Stat tiles: a tinted disc behind the icon, the figure beside it ---- */
.stat:has(> .disc) { grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-150); }
.stat > .disc { grid-row: 1 / span 2; grid-column: 1; align-self: start; }
.stat:has(> .disc) > .l, .stat:has(> .disc) > .vbox { grid-column: 2; }
.disc { display: inline-flex; align-items: center; justify-content: center; width: var(--disc-size); height: var(--disc-size); border-radius: var(--radius-full); flex: none; }
.disc.sm { width: var(--disc-size-small); height: var(--disc-size-small); }   /* the dashboard card's header disc */
.disc.sm svg.duo { width: var(--duo-size-small); height: var(--duo-size-small); }
/* the disc wears the duotone family (duotone.mjs): a 24px line-and-block icon, the block in the disc's own subtler step */
.disc svg.duo { width: var(--duo-size); height: var(--duo-size); }
.duo-art .l { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.duo-art .k { fill: var(--duo-block); }
.disc.blue { background: var(--disc-blue); color: var(--disc-blue-icon); --duo-block: var(--duo-blue); }
.disc.teal { background: var(--disc-teal); color: var(--disc-teal-icon); --duo-block: var(--duo-teal); }
.disc.green { background: var(--disc-green); color: var(--disc-green-icon); --duo-block: var(--duo-green); }
.disc.purple { background: var(--disc-purple); color: var(--disc-purple-icon); --duo-block: var(--duo-purple); }
.disc.magenta { background: var(--disc-magenta); color: var(--disc-magenta-icon); --duo-block: var(--duo-magenta); }
.disc.red { background: var(--disc-red); color: var(--disc-red-icon); --duo-block: var(--duo-red); }
.disc.yellow { background: var(--disc-yellow); color: var(--disc-yellow-icon); --duo-block: var(--duo-yellow); }
.disc.gray { background: var(--disc-gray); color: var(--disc-gray-icon); --duo-block: var(--duo-gray); }
/* the portals stay quieter than the staff app: a disc there is neutral, whatever it would be inside */
.dsx-frame[data-app="vendor"] .disc, .dsx-frame[data-app="client"] .disc { background: var(--disc-gray); color: var(--disc-gray-icon); --duo-block: var(--duo-gray); }

/* ---- Small uppercase labels, and the table head set the same way ---- */
.caps { display: inline-block; font: var(--font-weight-medium) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); letter-spacing: var(--letter-spacing-caps); text-transform: uppercase; color: var(--ink-faint); }
table.tbl thead th { font-weight: var(--font-weight-medium); text-transform: uppercase; letter-spacing: var(--letter-spacing-caps); color: var(--ink-faint); }
table.tbl thead th { background: var(--card-head); }             /* the head row on the sunken surface, as the list the buyers know */
table.tbl th.clipc, table.tbl td.clipc { width: var(--space-300); text-align: center; padding-left: var(--space-050); padding-right: var(--space-050); }
table.tbl th.clipc .ico, .clip { color: var(--icon-faint); }
.clip { display: inline-flex; vertical-align: middle; }
table.tbl th[aria-sort] { color: var(--ink-soft); }

/* ---- Money: direction as coloured text with its sign; the owed card and its proportion bar ---- */
.money.in { color: var(--money-in); font-variant-numeric: tabular-nums; }
.money.out { color: var(--money-out); font-variant-numeric: tabular-nums; }
.money.overdue { font-variant-numeric: tabular-nums; }                 /* the figure stays in ink; its label carries the amber */
.owe-split .overdue dt, .caps.overdue { color: var(--warn); }
.dsx-showcase small code { color: var(--ink); }
.dsx-flow { container-type: inline-size; min-width: 0; }
.stats.col { grid-template-columns: minmax(0, 1fr); gap: var(--space-150); margin: 0; }
.stats.fig-row > .card { margin-bottom: 0; }
.stats.fig-row > .owe > .card-b { display: flex; flex-direction: column; }
.stats.fig-row > .owe > .card-b > .owe-split { margin-top: auto; padding-top: var(--space-150); }
.owe-row > .owe { margin-bottom: 0; }
.owe .owe-total { display: flex; flex-direction: column; gap: var(--space-025); container-type: inline-size; }   /* the figure sizes itself to the card */
.owe .owe-total .fig { font: var(--font-weight-bold) var(--font-size-total)/var(--line-height-heading-large) var(--font-family-heading); font-variant-numeric: tabular-nums; white-space: nowrap; }
.owe.fig .meaning { margin: var(--space-100) 0 0; color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body); }
/* (the two-line figure-card strip of 19 September went with the dashboard grid: one 48px header, below) */
.owe-split { display: flex; flex-wrap: wrap; gap: var(--space-100) var(--space-400); margin: 0; }
.owe-split > div { display: flex; flex-direction: column; gap: var(--space-025); }
.owe-split dt { margin: 0; }
.owe-split dd { margin: 0; font: var(--font-weight-semibold) var(--font-size-heading-small)/var(--line-height-heading-small) var(--font-family-heading); font-variant-numeric: tabular-nums; color: var(--ink); }
.owe .hint { margin: var(--space-150) 0 0; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }

/* ---- Cash flow: a filled line with a marker per point, the figures beside ---- */
.cash-b { display: grid; grid-template-columns: minmax(0, 3fr) minmax(200px, 1fr); gap: var(--space-300); align-items: start; }
.cash-figs { display: grid; gap: var(--space-150); margin: 0; padding-left: var(--space-300); border-left: var(--border-width) solid var(--line); }
.cash-figs dt { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.cash-figs dd { margin: var(--space-025) 0 0; font: var(--font-weight-semibold) var(--font-size-body)/var(--line-height-body) var(--font-family-body); font-variant-numeric: tabular-nums; color: var(--ink); }
.cash-figs .closing dd { font: var(--font-weight-bold) var(--font-size-heading-small)/var(--line-height-heading-small) var(--font-family-heading); }

/* ---- Lists: the view's name as the title, a warning as ink on its caution fill, the view bar, the tinted row ---- */
.view-switch { display: inline-flex; align-items: center; gap: var(--space-050); margin: 0; padding: 0 var(--space-050); border: 0; border-radius: var(--radius-medium); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.view-switch:hover { background: var(--subtle-hover); }
.view-switch .ico { color: var(--icon-soft); }
.warn-chip { display: inline-flex; align-items: center; gap: var(--space-050); color: var(--warn); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-medium); white-space: nowrap; }   /* a warning is amber text with its icon, on no fill */
.warn-chip .ico { color: var(--ink); }
.pgh-t .warn-chip { margin-left: var(--space-100); }
.viewby { align-self: center; font: var(--font-weight-medium) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); color: var(--ink-faint); text-transform: uppercase; letter-spacing: var(--letter-spacing-caps); white-space: nowrap; }
.lv-tb .fbtn + .fbtn::before { content: ''; position: absolute; left: calc(var(--space-050) * -1); top: var(--space-100); bottom: var(--space-100); width: var(--border-width); background: var(--line); }
table.tbl tbody tr.mine { background: var(--row-mine); }
table.tbl tbody tr.mine:hover { background: var(--subtle-hover); }

@container (max-width: 900px) { .cash-b { grid-template-columns: minmax(0, 1fr); } .cash-figs { padding-left: 0; border-left: 0; } }

/* ================================================================
   THE DASHBOARD (19 September 2026, the grid) — Today and Overview: twelve columns with a 24px gutter; one card
   anatomy — a 48px one-line header holding [disc] title · help · one action or a period picker; one figure scale.
   A card spans its columns (.c3 .c4 .c6 .c8, else 12); cards in a row share the row's height; under 1400px the
   four tiles go two a row, under 1000px (the rail) 8·4 becomes 12 and 12, under 760px everything is one column.
   ================================================================ */
.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--grid-gutter); align-items: stretch; margin-bottom: var(--grid-gutter); }
.grid > * { min-width: 0; margin: 0; grid-column: span 12; }
.grid > .c3 { grid-column: span 3; } .grid > .c4 { grid-column: span 4; } .grid > .c6 { grid-column: span 6; } .grid > .c8 { grid-column: span 8; }
.grid > .card { display: flex; flex-direction: column; }
.grid > .card > .card-b { flex: 1 1 auto; display: flex; flex-direction: column; }
/* the header: one line, 48px; the disc left of the title on a figure card and a money card only; the one action or the
   period picker at the right; the title never wraps — it is at most 24 characters */
.grid > .card > .card-h { box-sizing: border-box; height: var(--card-head-height); flex-wrap: nowrap; align-items: center; gap: var(--space-100); padding: 0 var(--space-200); }
.grid > .card > .card-h > .disc { flex: none; }
.grid > .card > .card-h > .ct { flex: 1 1 auto; white-space: nowrap; min-width: 0; }
.grid > .card > .card-h > .btn, .grid > .card > .card-h > .fbtn, .grid > .card > .card-h > .u-sm { flex: none; margin-left: auto; }
.fbtn.period > .ico:has(.cal), .grid .act > .ico:has(.fold) { display: none; }
/* a tile: the figure at 24, one line of meaning, a bar where there is a ratio, the one action at the foot */
.tile .fig { font: var(--font-weight-bold) var(--font-size-tile)/var(--line-height-heading-large) var(--font-family-heading); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tile .meaning { margin: var(--space-050) 0 0; color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.tile .chart.owe .owe-bar { margin: var(--space-150) 0 var(--space-100); }
.tile .owe-split { gap: var(--space-050) var(--space-250); }
.tile .owe-split dt { font-size: var(--font-size-body-small); }
.tile .foot { margin-top: auto; padding-top: var(--space-150); display: flex; justify-content: flex-end; }
/* a money card's split: the ageing buckets beneath the bar, the overdue ones with the amber label over an ink figure */
.owe .owe-split.age { gap: var(--space-100) var(--space-300); }
/* a panel's lead line — “2 of 4 sites reported yesterday” — and a stat printed in the body as text, not a sub-card */
.lead-line { margin: 0 0 var(--space-150); font: var(--font-weight-semibold) var(--font-size-body)/var(--line-height-body) var(--font-family-body); }
.lead-line b { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-tile); line-height: var(--line-height-heading-large); font-variant-numeric: tabular-nums; margin-right: var(--space-050); }
.site-rows { list-style: none; margin: var(--space-150) 0 0; padding: 0; display: grid; gap: var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.site-rows li { display: flex; justify-content: space-between; gap: var(--space-100); }
.site-rows li b { font-weight: var(--font-weight-semibold); }
.site-rows li .no { color: var(--warn); font-weight: var(--font-weight-medium); }
.issues-line { margin: var(--space-150) 0 0; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.issues-line b { color: var(--ink); }
/* the summary beside a money line: collected · paid out · net */
.chart-with-figs { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-300); align-items: start; }
.chart-with-figs .cash-figs { min-width: 150px; }
/* an absent panel: the reason in product words, the one action under it */
.absent { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-150); flex: 1 1 auto; justify-content: center; padding: var(--space-100) 0; }
.absent p { margin: 0; color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body); max-width: var(--measure-tight); }
/* the document draws Today and Overview at a director's laptop width: the frame runs to 1400px and scrolls sideways in the column */
.dsx-wide { overflow-x: auto; overflow-y: hidden; container-type: inline-size; }   /* a scroll container whose size does not depend on the frame inside it */
.dsx-frame.web.desktop { width: min(var(--frame-desktop-width), 100vw); max-width: none; }
@media (max-width: 759px) { .dsx-frame.web.desktop { width: 100%; } }   /* on a phone the frame is the column: nothing scrolls sideways */
@container (max-width: 1379px) {
  .grid > .c3 { grid-column: span 6; }
}
@container (max-width: 999px) {
  .grid > .c8, .grid > .c4 { grid-column: span 12; }
  /* on the rail the header's action and its period picker fold to their icons, so a six-column card's line holds */
  .grid > .card > .card-h > .act > .ico:has(.fold), .grid > .card > .card-h > .fbtn.period > .ico:has(.cal) { display: inline-flex; }
  .grid > .card > .card-h > .act > span, .grid > .card > .card-h > .fbtn.period > span { display: none; }
  .chart-with-figs { grid-template-columns: minmax(0, 1fr); }
  .chart-with-figs .cash-figs { border-left: 0; padding-left: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (max-width: 759px) {
  .grid > .c3, .grid > .c6 { grid-column: span 12; }
  .grid > .card > .card-h { padding: 0 var(--space-150); gap: var(--space-075); }
  .chart-with-figs .cash-figs { grid-template-columns: minmax(0, 1fr); }
}
`;
