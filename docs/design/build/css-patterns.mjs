// css-patterns.mjs — the rules for what lib5 draws: the scope switcher and its phone sheet, the page header, the
// list with its pane, the column control, the form surface, and the scope table. Inserted into RULES
// before the focus block, which stays last in the sheet on purpose. Every value is a token reference;
// the literal gate reads this file with the rest.
export const EXTRA = `
/* ================================================================ the frame: an address, and a phone width */
.dsx-frame.phone-w { max-width: 390px; }
.dsx-frame > .bar .meta.url { font-family: var(--font-family-code); color: var(--ink-soft); }
.dsx-frame > .bar .meta.url code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; background: none; border: 0; padding: 0; }

/* ================================================================ the scope switcher */
.topbar { position: relative; }
.scope { display: flex; align-items: center; gap: var(--space-050); flex: 0 1 auto; min-width: 0; max-width: 360px; }
.scope-btn { display: inline-flex; align-items: center; gap: var(--space-050); height: var(--control-height); min-width: 0; max-width: 100%; padding: 0 var(--space-100) 0 var(--space-150); border: 1px solid var(--line-strong); border-radius: var(--radius-medium); background: var(--input); color: var(--ink); font-size: var(--font-size-body); line-height: var(--line-height-body); cursor: pointer; transition: var(--transition-control); }
.scope-btn:hover { background: var(--input-hover); border-color: var(--line-strong); }
.scope-btn > .ico { color: var(--ink-faint); flex: none; }
.scope-btn .sc { font-weight: var(--font-weight-semibold); white-space: nowrap; font-variant-numeric: tabular-nums; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }   /* the code gives way last, after the name */
.scope-btn .sn { flex: 1 1 auto; }
.scope-btn .sn { color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.scope-btn .pill { flex: none; }
.scope.on .scope-btn { background: var(--accent-soft); border-color: var(--selected-line); }
.scope.on .scope-btn:hover { background: var(--select); }
.scope.on .scope-btn > .ico:first-child { color: var(--selected-ink); }
.scope.on .scope-btn .sn { color: var(--ink); }
.scope.held .scope-btn { background: var(--panel); border-style: dashed; }
.scope.held .scope-btn > .ico:first-child { color: var(--ink-faint); }
.scope-x { flex: none; }
.scope-pop { position: absolute; top: calc(100% - var(--space-075)); left: var(--space-400); width: 420px; max-width: calc(100cqw - var(--space-400)); background: var(--elevated); border: 1px solid var(--line); border-radius: var(--radius-xlarge); box-shadow: var(--shadow-3); z-index: 9; overflow: hidden; text-align: left; }
.scope-pop.static { position: static; width: auto; max-width: 420px; box-shadow: var(--shadow-2); }
.scope-q, .psheet-q { padding: var(--space-150); border-bottom: 1px solid var(--line); }
.scope-q .search, .psheet-q .search { max-width: none; width: 100%; }
.scope-list { max-height: 420px; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-050) 0 var(--space-075); }
.scope-list .og { padding: var(--space-150) var(--space-200) var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-faint); }
.scope-list .opt { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-150); min-height: var(--control-height-large); padding: var(--space-100) var(--space-200); cursor: pointer; }
.scope-list .opt:hover { background: var(--sunk); }
.scope-list .opt.active { background: var(--select); }
.scope-list .opt .oc { font-weight: var(--font-weight-semibold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.scope-list .opt .oc .ico { color: var(--ink-faint); }
.scope-list .opt .on { min-width: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.scope-list .opt .on small { display: block; color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scope-list .opt > .ico { color: var(--selected-ink); }
.scope-list mark { background: var(--accent-soft); color: var(--ink); border-radius: var(--radius-small); }
.scope-more { padding: var(--space-100) var(--space-200); border-top: 1px solid var(--line); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.scope-none { padding: var(--space-250) var(--space-200); font-size: var(--font-size-body); line-height: var(--line-height-body); color: var(--ink); }
.scope-none small { display: block; margin-top: var(--space-050); color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); max-width: var(--measure-tight); }
.scope-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-100) var(--space-150); padding: var(--space-100) var(--space-200); border-top: 1px solid var(--line); background: var(--panel); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.scope-foot a { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
kbd { font-family: var(--font-family-body); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); padding: 0 var(--space-050); margin-right: var(--space-025); border: 1px solid var(--line-strong); border-radius: var(--radius-small); background: var(--panel); color: var(--ink); white-space: nowrap; }

/* on a phone: the code in the bar, and a sheet the height of the screen */
.dsx-frame:has(> .psheet) { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
.dsx-frame:has(> .psheet) > .bar { grid-area: 1 / 1; }
.dsx-frame:has(> .psheet) > .app { display: none; }
.dsx-frame:has(> .psheet) > .psheet { grid-area: 2 / 1; }
.psheet { background: var(--elevated); display: flex; flex-direction: column; min-height: 640px; }
.psheet-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-150); padding: var(--space-075) var(--space-100) var(--space-075) var(--space-200); border-bottom: 1px solid var(--line); }
.psheet-h b { font-family: var(--font-family-heading); font-size: var(--font-size-heading-medium); line-height: var(--line-height-heading-medium); font-weight: var(--font-weight-bold); }
.psheet-h .btn.icon { width: var(--control-height-touch); height: var(--control-height-touch); }
.psheet-q input[type="search"] { height: var(--control-height-touch); font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); }
.psheet .scope-list { max-height: none; flex: 1; }
.psheet .scope-list .opt { padding-top: var(--space-100); padding-bottom: var(--space-100); min-height: var(--control-height-touch); }
.psheet-f { border-top: 1px solid var(--line); }
.psheet-f .scope-more { border-top: 0; display: flex; align-items: center; min-height: var(--control-height-touch); }

.topbar .search-btn { display: none; }
@container (max-width: 1100px) { .scope { max-width: 300px; } }
@container (max-width: 760px) { .scope-btn .sn { display: none; } .scope-pop { left: var(--space-200); } }
@container (max-width: 520px) { .scope-btn .pill { display: none; } .scope-btn .sc.t { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; } }
@container (max-width: 640px) {
  .topbar { gap: var(--space-075); }
  .topbar .search { display: none; }
  .topbar .search-btn { display: inline-flex; }
  .topbar .spacer { flex: 1 1 0; }
  .scope-pop { display: none; }
}

/* ================================================================ the page header */
.pgh { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-250); align-items: center; margin-bottom: var(--space-250); }
.pgh > * { grid-column: 1 / -1; min-width: 0; }
.pgh > .pgh-t { grid-column: 1; min-height: var(--control-height); }
.pgh > .pgh-a { grid-column: 2; }
.pgh-t { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-075) var(--space-150); }
.pgh-t .pill { flex: none; }
.pgh-a { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-100); }
.pgh > .ps { margin-top: var(--space-075); }
.pgh-f { display: flex; flex-wrap: wrap; gap: var(--space-150) var(--space-400); margin: var(--space-200) 0 0; padding-top: var(--space-150); border-top: 1px solid var(--line); }
.pgh-f > div { min-width: 0; }
.pgh-f dt { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.pgh-f dd { margin: var(--space-025) 0 0; font-size: var(--font-size-body); line-height: var(--line-height-body); font-weight: var(--font-weight-medium); color: var(--ink); font-variant-numeric: tabular-nums; }
.pgh > .tabs, .pgh > .subtabs { margin-top: var(--space-200); margin-bottom: 0; }
@container (max-width: 640px) {
  .pgh { grid-template-columns: minmax(0, 1fr); }
  .pgh > .pgh-a { grid-column: 1; order: 1; justify-content: flex-start; margin-top: var(--space-150); }
  .pgh > .pgh-f, .pgh > .tabs, .pgh > .subtabs { order: 2; }
}

/* ================================================================ the list, and the record beside it */
.lv { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-200); align-items: start; margin-bottom: var(--space-250); }
.lv.with-pane { grid-template-columns: minmax(0, 1fr) minmax(0, 340px); }
/* A record open beside a list folds the sidebar to its rail. On a 1366px laptop that is the difference
   between a list of 674px and one of 862px, and every destination is still one click away by its icon. */
.app:has(.lv.with-pane) .side { width: 64px; padding: var(--space-150) var(--space-100) var(--space-150); }
.app:has(.lv.with-pane) .side .brand { padding: 0 0 var(--space-150); justify-content: center; }
.app:has(.lv.with-pane) :is(.side .brand > div, .side .nav-t, .side .nav-chev, .side .nav-pages, .side .firm, .side .nav-sep, .side .me > div, .side .me > .ico) { display: none; }
.app:has(.lv.with-pane) :is(.side .side-nav a, .side .side-nav .nav-h) { justify-content: center; padding: var(--space-100) 0; }
.app:has(.lv.with-pane) .side .side-nav a[aria-current]::before { display: none; }
.app:has(.lv.with-pane) .side .side-nav .nav-sec.open > .nav-h .nav-sum { display: block; }
.app:has(.lv.with-pane) .side .side-nav .nav-h.has-current { background: var(--accent-soft); }
.app:has(.lv.with-pane) .side .side-nav .badge { position: absolute; top: 2px; right: 2px; margin: 0; min-width: var(--space-200); height: var(--space-200); line-height: var(--space-200); font-size: var(--font-size-body-small); padding: 0 var(--space-025); }
.app:has(.lv.with-pane) .side .side-nav .nav-h[aria-expanded="true"] { background: var(--subtle-hover); color: var(--ink); }
.app:has(.lv.with-pane) .side .nav-fly .nav-pages { display: grid; }
.app:has(.lv.with-pane) :is(.side .nav-fly .nav-t, .side .nav-fly .firm) { display: block; }
.app:has(.lv.with-pane) .side .side-nav .nav-fly a { justify-content: flex-start; padding: var(--space-050) var(--space-100); }
.app:has(.lv.with-pane) .side .side-nav .nav-fly .badge { position: static; margin-left: auto; min-width: var(--space-250); height: var(--space-250); line-height: var(--space-250); padding: 0 var(--space-075); }
.app:has(.lv.with-pane) .side .me { justify-content: center; padding: var(--space-100) 0; }
.lv > .card { margin-bottom: 0; }
.lv-list { display: flex; flex-direction: column; min-width: 0; }
.lv-list > .lv-tb, .lv-list > .chips { order: -2; }
.lv-list > .bulkbar { order: -1; }
.lv-list > .pager { order: 1; }
.toolbar.lv-tb { align-items: center; gap: var(--space-100); padding: var(--space-150) var(--space-200); }
.lv-tb .search { flex: 1 1 180px; min-width: 160px; }
.colwrap { position: relative; }
.cols-pop { position: absolute; top: calc(100% + var(--space-075)); right: 0; width: 290px; background: var(--elevated); border: 1px solid var(--line); border-radius: var(--radius-large); box-shadow: var(--shadow-3); z-index: 8; }
.cols-h { padding: var(--space-150) var(--space-200) var(--space-075); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-faint); }
.cols-pop ul { list-style: none; margin: 0; padding: 0 0 var(--space-075); }
.cols-pop label { display: flex; align-items: baseline; gap: var(--space-100); padding: var(--space-075) var(--space-200); font-size: var(--font-size-body); line-height: var(--line-height-body); cursor: pointer; }
.cols-pop label.lock { color: var(--ink-soft); cursor: default; }
.cols-pop label small { margin-left: auto; color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.cols-pop label .ico { color: var(--ink-faint); }
.cols-pop label input { width: var(--checkbox-size); height: var(--checkbox-size); margin: 0; vertical-align: middle; accent-color: var(--accent); }
.cols-f { padding: var(--space-100) var(--space-200); border-top: 1px solid var(--line); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
table.tbl tbody tr.open { background: var(--select); }
table.tbl td .sub.alt { display: none; }
/* a reference column folds into the row's detail line when the list is narrow — on a laptop-width frame, and always
   when a record is open beside the list */
.lv.with-pane table.lv-t .p3 { display: none; }   /* beside a record the list keeps its number, status and amount as columns (19 September); reference folds */
.lv.with-pane table.lv-t td .sub.alt { display: block; }
table.lv-t td .sub.alt-pane { display: none; }
.lv.with-pane table.lv-t td:has(.alt-pane) .sub.alt { display: none; }
.lv.with-pane table.lv-t td .sub.alt-pane { display: block; }
.u-strong { font-weight: var(--font-weight-semibold); margin: var(--space-100) 0 calc(var(--space-100) * -1); }
@container (max-width: 1100px) { table.lv-t .p3 { display: none; } table.lv-t td .sub.alt { display: block; } }
.pane { background: var(--elevated); border: 1px solid var(--line); border-radius: var(--radius-large); box-shadow: var(--shadow-2); display: flex; flex-direction: column; min-width: 0; position: sticky; top: var(--space-200); }
.pane-h { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--space-050); padding: var(--space-150) var(--space-100) var(--space-150) var(--space-250); border-bottom: 1px solid var(--line); }
.pane-h > div { flex: 1 1 0; min-width: 0; }
.pane-t { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-050) var(--space-100); font-family: var(--font-family-heading); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); font-weight: var(--font-weight-bold); }
.pane-t .pill { font-family: var(--font-family-body); letter-spacing: 0; }
.pane-h small { display: block; margin-top: var(--space-025); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.pane-back { display: none; flex: 1 0 100%; align-items: center; gap: var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); margin-bottom: var(--space-100); }
.pane-b { padding: var(--space-200) var(--space-250); display: grid; gap: var(--space-200); min-width: 0; flex: 1 1 auto; align-content: start; }   /* the body takes the height, so the action row docks at the foot */
.pane-b > .notice { margin: 0; }
.pane-f { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-100); padding: var(--space-150) var(--space-250); border-top: 1px solid var(--line); }
.pane-f .spacer { flex: 1; }
@container (max-width: 760px) {
  .lv.with-pane { grid-template-columns: minmax(0, 1fr); }
  .lv.with-pane > .lv-list { display: none; }
  .pane { position: static; }
  .pane-back { display: inline-flex; }
}

/* ================================================================ the form */
.flegend { margin: 0 0 var(--space-150); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.flegend span { margin-right: var(--space-025); }
.fsec { border: 0; margin: 0 0 var(--space-200); padding: 0; min-width: 0; }
.fsec + .fsec { padding-top: var(--space-200); border-top: 1px solid var(--line); }
.fsec-h { padding: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); font-weight: var(--font-weight-semibold); color: var(--ink); }
.fsec-t { margin: var(--space-025) 0 var(--space-150); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); max-width: var(--measure); }
.fgrid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 var(--space-200); }
.fgrid.c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.pane .fgrid.c2 { grid-template-columns: minmax(0, 1fr); }
.ffoot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-100); }
.ffoot > .spacer { flex: 1 1 auto; }   /* the destructive action stays at the far left, the rest at the right */
.ffoot .spacer { flex: 1; }
.ffoot-n { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.fsurface { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); margin-bottom: var(--space-250); }
.fsurface > .fs-b { padding: var(--space-250); }
.fsurface > .ffoot, .pane > .ffoot { position: sticky; bottom: 0; padding: var(--space-150) var(--space-250); border-top: 1px solid var(--line); background: inherit; border-radius: 0 0 var(--radius-large) var(--radius-large); }
@container (max-width: 640px) { .fgrid.c2 { grid-template-columns: minmax(0, 1fr); } }
@container (max-width: 520px) {
  .ffoot { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ffoot > .spacer { display: none; }
  .ffoot > .ffoot-n { grid-column: 1 / -1; }
  .ffoot > .btn { width: 100%; }
  .ffoot > .btn.danger { grid-column: 1 / -1; order: 2; }
  .ffoot:not(:has(> .btn:not(.primary):not(.danger))) > .btn.primary { grid-column: 1 / -1; }
}

/* ================================================================ the patterns, as the document shows them */
.dsx-h3 { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); margin: var(--space-600) 0 var(--space-100); scroll-margin-top: var(--space-300); }
.dsx-p { max-width: var(--measure); color: var(--ink-soft); font-size: var(--font-size-body-large); line-height: var(--line-height-body-large); margin: 0 0 var(--space-250); }
.dsx-frame.pattern + .dsx-frame.pattern { margin-top: var(--space-200); }
.dsx-frame.pattern > .pat { padding: var(--space-250) var(--space-300); }
.dsx-frame.pattern > .pat > .fsurface, .dsx-frame.pattern > .pat > .lv, .dsx-frame.pattern > .pat > .pgh { margin-bottom: 0; }
@container (max-width: 640px) { .dsx-frame.pattern > .pat { padding: var(--space-200); } }

/* ================================================================ the scope table, and the pieces of section 3 */
.sv { display: inline-flex; align-items: baseline; gap: var(--space-050); white-space: nowrap; font-weight: var(--font-weight-medium); }
.svw { display: block; margin-top: var(--space-025); color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); min-width: 220px; }
table.tbl.scope-t td { vertical-align: top; }
table.tbl.scope-t td:first-child code { white-space: nowrap; }
table.tbl.scope-t td.why { min-width: 260px; max-width: var(--measure-tight); }
.owed { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-100) var(--space-200); padding: var(--space-150) var(--space-200); margin-bottom: var(--space-250); border: 1px solid var(--line); border-radius: var(--radius-large); background: var(--panel); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.owed > .ico { color: var(--ink-soft); align-self: flex-start; line-height: var(--line-height-body); }
.owed > span:not(.ico) { flex: 1 1 260px; min-width: 0; }
.dsx-kv { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); gap: var(--space-100) var(--space-250); margin: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.dsx-kv dt { font-weight: var(--font-weight-semibold); }
.dsx-kv dd { margin: 0; color: var(--ink-soft); }
.dsx-kv code { white-space: normal; overflow-wrap: anywhere; }
.superseded { display: block; margin-top: var(--space-075); padding-left: var(--space-100); border-left: 2px solid var(--line-strong); color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.dsx-states.pairs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 760px) { .dsx-states.pairs { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) { .dsx-kv { grid-template-columns: minmax(0, 1fr); gap: var(--space-025) 0; } .dsx-kv dt { margin-top: var(--space-100); } }

/* ================================================================ the foundations page */
.sw { display: inline-block; width: var(--space-200); height: var(--space-200); border-radius: var(--radius-xsmall); box-shadow: inset 0 0 0 var(--border-width) var(--line); vertical-align: middle; margin-right: var(--space-075); flex: none; }
.sw + .sw { margin-left: calc(var(--space-050) * -1); }
.sw.alpha { position: relative; overflow: hidden; background-color: var(--panel); background-image: linear-gradient(45deg, var(--line-strong) 25%, transparent 25%, transparent 75%, var(--line-strong) 75%), linear-gradient(45deg, var(--line-strong) 25%, transparent 25%, transparent 75%, var(--line-strong) 75%); background-size: var(--space-100) var(--space-100); background-position: 0 0, var(--space-050) var(--space-050); }
.sw.alpha > i { position: absolute; inset: 0; }
.dsx-ramp { margin-bottom: var(--space-250); }
.dsx-ramp h4 small { font-weight: var(--font-weight-regular); color: var(--ink-faint); margin-left: var(--space-075); }
.dsx-ramp ol { list-style: none; margin: 0 0 var(--space-100); padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--space-050); }
.dsx-ramp li { display: grid; grid-template-rows: var(--space-500) auto; border: 1px solid var(--line); border-radius: var(--radius-medium); overflow: hidden; background: var(--panel); }
.dsx-ramp li > .sw { width: 100%; height: 100%; margin: 0; border-radius: 0; box-shadow: none; }
.dsx-ramp li > span:not(.sw) { padding: var(--space-050) var(--space-075); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); font-variant-numeric: tabular-nums; }
.dsx-ramp li small { display: block; font-weight: var(--font-weight-regular); color: var(--ink-soft); font-family: var(--font-family-code); }
.dsx-t td b + small, .dsx-t th small { display: block; font-weight: var(--font-weight-regular); color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
table.dsx-cvd td { vertical-align: middle; }
table.dsx-cvd td > .sw { width: 100%; min-width: var(--space-400); height: var(--space-300); margin: 0; border-radius: var(--radius-small); }
.dsx-radius { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-200); }
.dsx-radius > div { display: grid; gap: var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.dsx-radius i { display: block; height: var(--space-600); background: var(--sunk); border: var(--border-width-selected) solid var(--line-strong); }
.dsx-surfaces.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.dsx-surfaces .s-raised { background: var(--raised); box-shadow: var(--shadow-2); }
.dsx-focus .is-focus { outline: var(--focus-ring-width) solid var(--focus); outline-offset: var(--focus-ring-offset); }
.dsx-space > div small { display: block; }
@media (max-width: 1100px) { .dsx-surfaces.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .dsx-surfaces.four { grid-template-columns: minmax(0, 1fr); } }

/* ================================================================ the sidebar specimens */
.nav-specs { display: grid; grid-template-columns: repeat(auto-fill, minmax(252px, 1fr)); gap: var(--space-200); align-items: start; }
.nav-specs .side.nav-spec { width: auto; border: 1px solid var(--line); border-radius: var(--radius-large); padding: var(--space-100); margin-bottom: var(--space-100); }
.nav-specs .ps { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); margin: 0; }
.nav-railbox { max-width: 960px; }

/* ================================================================ preferences, and the superseded record */
.pref-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-300); padding-bottom: var(--space-200); margin-bottom: var(--space-200); border-bottom: 1px solid var(--line); }
.pref-row .pref-l { display: block; font-weight: var(--font-weight-semibold); }
.pref-row .ps { max-width: var(--measure-tight); }
.dsx-history { margin-top: var(--space-800); padding-top: var(--space-400); border-top: var(--border-width) solid var(--line); }
.dsx-history .hist { margin: var(--space-300) 0; }
.dsx-history .hist > p, .dsx-history .hist .was-block { color: var(--ink-soft); }
.was-block { margin: var(--space-400) 0; padding: var(--space-050) 0 var(--space-050) var(--space-250); border-left: var(--border-width-selected) solid var(--line-strong); color: var(--ink-soft); }
.was-block .was-h { max-width: var(--measure); margin: 0 0 var(--space-200); padding: var(--space-150) var(--space-200); background: var(--idle-soft); border-radius: var(--radius-large); color: var(--ink); }
`;
