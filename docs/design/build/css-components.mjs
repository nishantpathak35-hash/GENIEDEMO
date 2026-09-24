// css-components.mjs — the components, rebuilt to the published anatomy of each (17 September 2026).
//
// Every size, spacing, radius, colour and motion below is the one the published @atlaskit package paints with,
// read from its compiled styles (ads2/anat-*.txt), expressed through this set's own tokens. A component this
// product needs and the system does not publish is composed from the same primitives and says so in COMPONENT-MAP.
//
// STATES ARE WRITTEN ONCE. Every interactive state is a selector list — `.btn:hover, .btn.is-hover` — so the specimen
// that draws a hovered button on the components page paints with exactly the rule a real hover paints with. There
// is no second copy to drift, and the states gate hovers a real control and compares the two.
export const COMPONENTS = `
/* ================================================================
   COMPONENTS — as published. One rule per state, shared with its specimen.
   ================================================================ */

/* ---- Button ------------------------------------------------------------------------------------------
   32px, 12px either side, a 4px gap (6px beside an icon), medium corner, medium weight. The default appearance
   is a transparent fill inside a 1px border; subtle drops the border; primary, danger and warning are fills.
   Compact is 24px with a small corner. An icon button is square. Loading hides the label and centres a spinner. */
.btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-050); box-sizing: border-box; height: var(--control-height); max-width: 100%; padding: var(--space-075) var(--space-150); border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink-soft); font: var(--font-weight-medium) var(--font-size-body)/var(--line-height-body) var(--font-family-body); text-align: center; text-decoration: none; white-space: nowrap; vertical-align: middle; cursor: pointer; transition: var(--motion-button-hovered); }
.btn::after { content: ''; position: absolute; inset: 0; border: var(--border-width) solid var(--line); border-radius: inherit; pointer-events: none; }
.btn:has(> .ico) { gap: var(--space-075); }
.btn:hover, .btn.is-hover { background: var(--subtle-hover); color: var(--ink-soft); text-decoration: none; }
.btn:active, .btn.is-pressed { background: var(--subtle-pressed); transition: var(--motion-button-pressed); }
.btn.ghost::after, .btn.primary::after, .btn.danger::after, .btn.warning::after { border-color: transparent; }
.btn.primary { background: var(--accent); color: var(--on-accent); }
.btn.primary:hover, .btn.primary.is-hover { background: var(--accent-hover); color: var(--on-accent); }
.btn.primary:active, .btn.primary.is-pressed { background: var(--accent-pressed); }
.btn.danger { background: var(--bad-bold); color: var(--on-accent); }
.btn.danger:hover, .btn.danger.is-hover { background: var(--bad-bold-hover); color: var(--on-accent); }
.btn.danger:active, .btn.danger.is-pressed { background: var(--bad-bold-pressed); }
.btn.warning { background: var(--warn-bold); color: var(--on-warn-bold); }
.btn.warning:hover, .btn.warning.is-hover { background: var(--warn-bold-hover); color: var(--on-warn-bold); }
.btn.warning:active, .btn.warning.is-pressed { background: var(--warn-bold-pressed); }
.btn[aria-pressed="true"], .btn.is-selected { background: var(--accent-soft); color: var(--selected-ink); }
.btn[aria-pressed="true"]::after, .btn.is-selected::after { border-color: var(--selected-line); }
.btn[aria-pressed="true"]:hover, .btn.is-selected:hover, .btn.is-selected.is-hover { background: var(--select-hover); color: var(--selected-ink); }
.btn:disabled, .btn[aria-disabled="true"], .btn.is-disabled { background: var(--disabled-fill); color: var(--disabled-ink); cursor: not-allowed; }
.btn.ghost:disabled, .btn.ghost.is-disabled { background: transparent; }
.btn:disabled::after, .btn[aria-disabled="true"]::after, .btn.is-disabled::after { border-color: var(--disabled-line); }
.btn.sm { height: var(--control-height-compact); padding: var(--space-025) var(--space-150); border-radius: var(--radius-small); }
.btn.icon { flex: none; width: var(--control-height); padding: 0; }
.btn.sm.icon { width: var(--control-height-compact); }
.btn.icon .ico { display: flex; }
.btn > .ico > svg.i { vertical-align: middle; }
.btn[aria-busy="true"], .btn.is-loading { cursor: progress; }
.btn[aria-busy="true"] > :not(.spinner-slot), .btn.is-loading > :not(.spinner-slot) { opacity: 0; }
.btn .spinner-slot { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.link-btn { background: none; border: 0; padding: 0; color: var(--link); cursor: pointer; font: inherit; font-weight: var(--font-weight-medium); border-radius: var(--radius-xsmall); }
.link-btn:hover, .link-btn.is-hover { text-decoration: underline; }
.link-btn:active, .link-btn.is-pressed { color: var(--link-pressed); }
.btn-group { display: inline-flex; flex-wrap: wrap; gap: var(--space-100); }

/* ---- Spinner -----------------------------------------------------------------------------------------
   A 1.5px arc, 12, 16, 24 or 48px, turning every 0.86s on the published curve. Inherits its colour, so it takes
   the ink of whatever it sits in — the inverse ink inside a primary button. */
.spinner { display: inline-block; flex: none; vertical-align: middle; color: currentColor; animation: var(--motion-spinner-load-in); }
.spinner svg { display: block; width: 100%; height: 100%; animation: var(--motion-spinner-rotate); transform-origin: center; }
.spinner circle { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: 60; stroke-dashoffset: 50; }
.spinner.xs { width: var(--space-150); height: var(--space-150); } .spinner.s { width: var(--space-200); height: var(--space-200); }
.spinner.m { width: var(--space-300); height: var(--space-300); } .spinner.l { width: var(--space-600); height: var(--space-600); }

/* ---- Skeleton ----------------------------------------------------------------------------------------
   The shape of what is loading, in the skeleton colour, breathing to the subtler one and back every 1.5s. */
.skeleton { display: block; height: var(--space-150); border-radius: var(--radius-small); background: var(--skeleton); animation: var(--motion-skeleton-shimmer); }
.skeleton.circle { border-radius: var(--radius-full); }

/* ---- Progress bar ------------------------------------------------------------------------------------
   6px, fully round, the neutral fill as the track and the bold neutral as the bar; success when it is done.
   Only where the amount done is known; an unknown amount is a spinner. */

/* ---- Progress tracker --------------------------------------------------------------------------------
   Stages on one line: a 12px marker and a 4px bar between; the current stage in the brand colour and bold,
   the visited ones in ink and bold, the ones ahead subtlest and regular. */
.tracker { list-style: none; margin: 0 0 var(--space-250); padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.tracker li { position: relative; display: grid; justify-items: center; gap: var(--space-100); padding-top: 0; text-align: center; font-size: var(--font-size-body); line-height: var(--line-height-body); color: var(--ink-faint); font-weight: var(--font-weight-regular); }
.tracker li::before { content: ''; position: relative; z-index: 1; width: var(--space-150); height: var(--space-150); border-radius: var(--radius-full); background: var(--progress); }
.tracker li::after { content: ''; position: absolute; top: var(--space-050); left: -50%; width: 100%; height: var(--space-050); background: var(--track); }
.tracker li:first-child::after { display: none; }
.tracker li.done::before, .tracker li[aria-current="step"]::before { background: var(--accent); }
.tracker li.done::after, .tracker li[aria-current="step"]::after { background: var(--accent); }
.tracker li.done { color: var(--ink); font-weight: var(--font-weight-bold); }
.tracker li[aria-current="step"] { color: var(--selected-ink); font-weight: var(--font-weight-bold); }
.tracker li small { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-regular); color: var(--ink-faint); }

/* ---- Lozenge -----------------------------------------------------------------------------------------
   A status. 20px, 4px either side, a small corner, 12/16, sentence case; a subtler fill carrying a bolder ink.
   Six appearances, one per state this product speaks in. Nothing else is a lozenge. */
.pill { display: inline-flex; align-items: center; gap: var(--space-050); box-sizing: border-box; height: var(--space-250); max-width: 100%; padding: var(--space-025) var(--space-050); border: var(--border-width) solid transparent; border-radius: var(--radius-small); background: var(--lozenge-idle); color: var(--lozenge-idle-ink); font: var(--font-weight-regular) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: baseline; transition: background-color var(--motion-duration-medium) var(--motion-easing-inout-bold); }
.pill.ok { background: var(--lozenge-done); color: var(--lozenge-done-ink); }
.pill.active { background: var(--lozenge-active); color: var(--lozenge-active-ink); }
.pill.waiting { background: var(--lozenge-waiting); color: var(--lozenge-waiting-ink); }
.pill.warn { background: var(--lozenge-caution); color: var(--lozenge-caution-ink); }
.pill.bad { background: var(--lozenge-bad); color: var(--lozenge-bad-ink); }
.pill .ico { margin: 0; }
.pill .ico > svg.i { width: var(--space-150); height: var(--space-150); }

/* ---- Badge -------------------------------------------------------------------------------------------
   A count. At least 24px wide, 4px either side, the smallest corner, 12/16. Default is neutral; important is
   something gone wrong; primary sits on a selected thing. Nothing else is a badge. */
.badge { display: inline-flex; justify-content: center; align-items: center; box-sizing: border-box; min-width: var(--space-300); height: var(--space-200); padding: 0 var(--space-050); border-radius: var(--radius-xsmall); background: var(--badge-fill); color: var(--badge-ink); font: var(--font-weight-regular) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.badge.important { background: var(--badge-important); color: var(--badge-important-ink); }
.badge.primary { background: var(--badge-primary); color: var(--badge-primary-ink); }

/* ---- Tag ---------------------------------------------------------------------------------------------
   A label someone applied, or a filter that can be removed. 20px, a small corner, a 1px edge, 12/16; a removable
   tag carries a 16px remove button. Adding and removing it scales and fades on the label motion tokens. */
.tag { display: inline-flex; align-items: center; gap: var(--space-025); box-sizing: border-box; height: var(--space-250); padding: 0 var(--space-050); border: var(--border-width) solid var(--line); border-radius: var(--radius-small); background: var(--tag-fill); color: var(--tag-ink); font: var(--font-weight-regular) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); white-space: nowrap; vertical-align: baseline; }
.tag b { font-weight: var(--font-weight-medium); }
.tag.removable { padding-inline-end: 0; column-gap: var(--space-050); cursor: default; animation: var(--motion-label-enter); }   /* the field and its value are two flex items: the gap spaces them, no nbsp to leak a second space (19 September) */
.tag .tag-x { display: inline-flex; align-items: center; justify-content: center; width: var(--space-200); height: var(--space-200); margin: 0; padding: 0; border: 0; border-radius: var(--radius-xsmall); background: transparent; color: var(--icon-soft); cursor: pointer; transition: var(--motion-button-hovered); }
.tag .tag-x:hover, .tag .tag-x.is-hover { background: var(--subtle-hover); color: var(--ink); }
.tag .tag-x:active, .tag .tag-x.is-pressed { background: var(--subtle-pressed); }
.tag .tag-x svg.i { width: var(--space-150); height: var(--space-150); }

/* ---- Avatar and avatar group -------------------------------------------------------------------------
   24 or 32px, round for a person and a small corner for a project; in a group each carries a 2px ring in the
   surface colour and overlaps the next; the rest collapse into a +n indicator the same size. */
.avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; width: var(--avatar-size-large); height: var(--avatar-size-large); border-radius: var(--radius-full); background: var(--badge-fill); color: var(--ink); font: var(--font-weight-medium) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); }
.avatar.sm { width: var(--avatar-size); height: var(--avatar-size); }
.avatar.rec { border-radius: var(--radius-small); }
.avatar-group { display: inline-flex; align-items: center; padding-inline-start: var(--space-050); }
.avatar-group > .avatar { margin-inline-start: calc(var(--space-050) * -1); box-shadow: 0 0 0 var(--border-width-selected) var(--panel); }
.avatar-group > .avatar.more { background: var(--idle-soft); color: var(--ink-soft); }

/* ---- Section message ---------------------------------------------------------------------------------
   An information, warning, error, success or discovery message in the page: 16px inside, a large corner, the
   semantic background, the matching icon, a title, the body and its actions as links. */
.notice { display: flex; gap: var(--space-150); padding: var(--space-200); border: 0; border-radius: var(--radius-large); background: var(--idle-soft); margin-bottom: var(--space-250); align-items: flex-start; word-break: break-word; }
.notice > .ico { color: var(--icon-soft); line-height: var(--line-height-body); }
.notice > div { min-width: 0; flex: 1; }
.notice .t { display: block; font: var(--font-weight-bold) var(--font-size-heading-xsmall)/var(--line-height-heading-xsmall) var(--font-family-heading); color: var(--ink); }
.notice p { color: var(--ink); font-size: var(--font-size-body); line-height: var(--line-height-body); margin-top: var(--space-050); }
.notice > div > p:first-child { margin-top: 0; }   /* a message with no title starts on the icon's line */
.notice .actions { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-100); margin-top: var(--space-100); }
.notice .actions .link-btn svg.i { display: none; }
.notice .actions > * + * { position: relative; margin-inline-start: calc(var(--space-100) + 0.5em); }
.notice .actions > * + *::before { content: '·'; position: absolute; right: calc(100% + var(--space-100)); color: var(--ink); text-decoration: none; }
.notice.info { background: var(--info-soft); } .notice.info > .ico { color: var(--info); }
.notice.warn { background: var(--warn-soft); } .notice.warn > .ico { color: var(--ink); }
.notice.bad { background: var(--bad-soft); } .notice.bad > .ico { color: var(--bad); }
.notice.ok { background: var(--ok-soft); } .notice.ok > .ico { color: var(--ok); }
.card > .card-b > .notice:last-child { margin-bottom: 0; }

/* ---- Inline message ----------------------------------------------------------------------------------
   An icon and a short text that opens a popup with the detail. The trigger is subtle and underlines on hover. */
.inline-msg { position: relative; display: inline-flex; align-items: baseline; gap: var(--space-050); padding: 0; border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink-soft); font: inherit; cursor: pointer; }
.inline-msg:hover span, .inline-msg.is-hover span { text-decoration: underline; }
.inline-msg > .ico { color: var(--info); }
.inline-msg.warn > .ico { color: var(--ink); }
.inline-msg-pop { position: absolute; z-index: 9; top: calc(100% + var(--space-100)); left: 0; width: max-content; max-width: 448px; padding: var(--space-200) var(--space-300); background: var(--elevated); border-radius: var(--radius-large); box-shadow: var(--shadow-3); color: var(--ink); font-size: var(--font-size-body); line-height: var(--line-height-body); text-align: left; white-space: normal; animation: var(--motion-popup-enter-bottom); }

/* ---- Banner ------------------------------------------------------------------------------------------
   Across the top of the whole page, 48px, one line, bold: warning in the warning fill, error in the danger fill,
   an announcement in the bold neutral. For something affecting everyone in the organisation, never a record. */
.banner { display: flex; align-items: center; justify-content: center; gap: var(--space-100); height: var(--space-600); padding: 0 var(--space-200); font: var(--font-weight-medium) var(--font-size-body)/var(--line-height-body) var(--font-family-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.banner > span:not(.ico) { overflow: hidden; text-overflow: ellipsis; }
.banner.warning { background: var(--warn-bold); color: var(--on-warn-bold); }
.banner.error { background: var(--bad-bold); color: var(--on-accent); }
.banner.announcement { background: var(--inverse-fill); color: var(--on-inverse); }
.banner a { color: inherit; text-decoration: underline; }

/* ---- Flag --------------------------------------------------------------------------------------------
   A confirmation that arrives and leaves: bottom left, 400px, a large corner, the overlay surface and shadow; an
   icon in its semantic colour, a title, a line, actions, and a close button. It slides in half its width. */
.flag-group { position: absolute; left: var(--space-300); bottom: var(--space-300); z-index: 9; display: grid; gap: var(--space-200); width: min(400px, calc(100% - var(--space-600))); }
.flag { display: grid; grid-template-columns: var(--space-300) minmax(0, 1fr) auto; gap: var(--space-050) var(--space-200); padding: var(--space-200); border-radius: var(--radius-large); background: var(--elevated); box-shadow: var(--shadow-3); color: var(--ink); overflow-wrap: anywhere; animation: var(--motion-flag-enter); }
.flag > .ico { color: var(--icon-soft); line-height: var(--line-height-body); }
.flag.ok > .ico { color: var(--ok); } .flag.bad > .ico { color: var(--bad); } .flag.info > .ico { color: var(--info); }
.flag .t { font: var(--font-weight-bold) var(--font-size-heading-xsmall)/var(--line-height-heading-xsmall) var(--font-family-heading); }
.flag p { grid-column: 2; color: var(--ink-soft); }
.flag .flag-acts { grid-column: 2; display: flex; gap: var(--space-200); margin-top: var(--space-050); }
.flag.leaving { animation: var(--motion-flag-exit); }

/* ---- Tooltip -----------------------------------------------------------------------------------------
   The bold neutral, inverse ink, 12/16, 4 by 6px inside, a small corner, at most 240px. For the name of an icon
   button and the whole of a truncated value — never the only place something is said. */
.tooltip { position: absolute; z-index: 10; max-width: 240px; padding: var(--space-050) var(--space-075); border-radius: var(--radius-small); background: var(--inverse-fill); color: var(--on-inverse); font: var(--font-weight-regular) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); overflow-wrap: break-word; pointer-events: none; animation: var(--motion-tooltip-enter); }
.tooltip kbd { display: inline-flex; align-items: center; height: var(--space-250); margin-inline-start: var(--space-050); padding: 0 var(--space-075); border: var(--border-width) solid var(--line-strong); border-radius: var(--radius-xsmall); background: none; color: inherit; font: inherit; }
.has-tip { position: relative; display: inline-flex; }
@media (max-width: 1000px) { .inline-msg-pop { left: auto; right: 0; } }
@media (max-width: 640px) { .inline-msg-pop { position: fixed; top: auto; left: var(--space-200); right: var(--space-200); bottom: var(--space-200); width: auto; max-width: none; } }

/* ---- Popup and dropdown menu -------------------------------------------------------------------------
   The overlay surface with a large corner and the overlay shadow. A menu item is 40px, 8 by 16px inside; its
   group title is heading xxsmall; a selected item takes the selected fill and a 2px bar. */
.popup { background: var(--elevated); border-radius: var(--radius-large); box-shadow: var(--shadow-3); color: var(--ink); z-index: 9; animation: var(--motion-popup-enter-bottom); }
.menu { list-style: none; margin: 0; padding: var(--space-075) 0; min-width: 160px; }
.menu .menu-t { padding: var(--space-150) var(--space-200) var(--space-050); font: var(--font-weight-bold) var(--font-size-heading-xxsmall)/var(--line-height-heading-xxsmall) var(--font-family-heading); color: var(--ink-soft); }
.menu .menu-i { position: relative; display: flex; align-items: center; gap: var(--space-100); width: 100%; min-height: var(--control-height-large); padding: var(--space-100) var(--space-200); border: 0; background: transparent; color: var(--ink); font: var(--font-weight-regular) var(--font-size-body)/var(--line-height-body) var(--font-family-body); text-align: left; cursor: pointer; transition: var(--motion-listitem-hovered); }
.menu .menu-i:hover, .menu .menu-i.is-hover { background: var(--subtle-hover); text-decoration: none; }
.menu .menu-i:active, .menu .menu-i.is-pressed { background: var(--subtle-pressed); transition: var(--motion-listitem-pressed); }
.menu .menu-i[aria-checked="true"], .menu .menu-i.is-selected { background: var(--accent-soft); color: var(--selected-ink); }
.menu .menu-i[aria-checked="true"]::before, .menu .menu-i.is-selected::before { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--border-width-selected); background: var(--selected-line); }
.menu .menu-i[aria-disabled="true"], .menu .menu-i:disabled, .menu .menu-i.is-disabled { color: var(--disabled-ink); cursor: not-allowed; background: transparent; }
.menu .menu-i:has(> .menu-c) { align-items: flex-start; }   /* with a description, the icon sits on the first line */
.menu .menu-i { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }   /* a title and a description truncate, as published */
.menu .menu-c { display: flex; flex-direction: column; min-width: 0; }
.menu .menu-c > * { overflow: hidden; text-overflow: ellipsis; }
.menu .menu-i small { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.menu .menu-i.danger { color: var(--bad); }
.menu hr { height: var(--border-width); margin: var(--space-075) 0; border: 0; background: var(--line); }

/* ---- Modal dialog ------------------------------------------------------------------------------------
   400, 600, 800 or 968px; the overlay surface with an extra-large corner and the overlay shadow, 60px from the top
   over the blanket. Header 24 by 24 by 16, title heading medium; body 24 either side; footer 16 by 24 by 24 with the
   actions right-aligned, the primary last. It scales in from 95% as it arrives. */
.blanket { position: absolute; inset: 0; z-index: 8; background: var(--scrim); animation: var(--motion-blanket-enter); }
.modal { position: absolute; z-index: 9; top: var(--space-600); left: 50%; width: min(400px, calc(100% - var(--space-400))); margin-left: calc(min(400px, calc(100% - var(--space-400))) / -2); display: flex; flex-direction: column; border-radius: var(--radius-xlarge); background: var(--elevated); box-shadow: var(--shadow-3); color: var(--ink); animation: var(--motion-modal-enter); }
.modal.medium { width: min(600px, calc(100% - var(--space-400))); margin-left: calc(min(600px, calc(100% - var(--space-400))) / -2); }
.modal-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-100); padding: var(--space-300) var(--space-300) var(--space-200); }
.modal-h h5, .modal-h .modal-t { font: var(--font-weight-bold) var(--font-size-heading-medium)/var(--line-height-heading-medium) var(--font-family-heading); }
.modal-b { padding: var(--space-025) var(--space-300); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.modal-b p + p { margin-top: var(--space-100); }
.modal-f { display: flex; justify-content: flex-end; gap: var(--space-100); padding: var(--space-200) var(--space-300) var(--space-300); }

/* ---- Drawer ------------------------------------------------------------------------------------------
   A full-height panel on the overlay surface, 480px, over the blanket; it slides its whole width in. */
.drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(480px, 100%); background: var(--elevated); box-shadow: var(--shadow-3); display: flex; flex-direction: column; z-index: 8; animation: var(--motion-panel-enter); }
.drawer-h { padding: var(--space-300) var(--space-300) var(--space-200); display: flex; align-items: flex-start; gap: var(--space-150); }
.drawer-h > div { flex: 1; min-width: 0; }
.drawer-h .ct { font: var(--font-weight-bold) var(--font-size-heading-medium)/var(--line-height-heading-medium) var(--font-family-heading); }
.drawer-b { padding: 0 var(--space-300) var(--space-300); overflow: auto; flex: 1; }
.drawer-f { padding: var(--space-200) var(--space-300) var(--space-300); display: flex; gap: var(--space-100); align-items: center; justify-content: flex-end; }
.scrim { position: absolute; inset: 0; background: var(--scrim); z-index: 7; animation: var(--motion-blanket-enter); }

/* ---- Tabs --------------------------------------------------------------------------------------------
   8px either side, 6px under the label, the subtle ink, a medium corner; a 2px rule under the whole list; hover
   draws a 2px neutral line under the tab and selection a 2px selected line with the selected ink. */
.tabs, .subtabs { position: relative; display: flex; gap: 0; margin-bottom: var(--space-250); overflow-x: auto; width: auto; max-width: 100%; padding: 0; border: 0; background: none; border-radius: 0; }
.tabs::before, .subtabs::before { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: var(--border-width-selected); background: var(--line); border-radius: var(--radius-xsmall); }
.tabs a, .subtabs a { position: relative; padding: var(--space-050) var(--space-100) var(--space-075); border-radius: var(--radius-medium); color: var(--ink-soft); font: var(--font-weight-medium) var(--font-size-body)/var(--line-height-body) var(--font-family-body); white-space: nowrap; background: none; box-shadow: none; transition: var(--motion-listitem-hovered); }
.tabs a:hover, .subtabs a:hover, .tabs a.is-hover, .subtabs a.is-hover { color: var(--ink-soft); text-decoration: none; }
.tabs a::after, .subtabs a::after { content: ''; position: absolute; left: var(--space-100); right: var(--space-100); bottom: 0; height: var(--border-width-selected); background: transparent; z-index: 1; }
.tabs a:hover::after, .subtabs a:hover::after, .tabs a.is-hover::after, .subtabs a.is-hover::after { background: var(--line-strong); }
.tabs a[aria-current="page"], .subtabs a[aria-current="page"] { color: var(--selected-ink); background: none; box-shadow: none; }
.tabs a[aria-current="page"]::after, .subtabs a[aria-current="page"]::after { background: var(--selected-line); }

/* ---- Breadcrumbs -------------------------------------------------------------------------------------
   24px items in the subtlest ink with a "/" between, 8px either side of it; the current page in ink. */
.pgh-c ol, .crumb { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 0; margin: 0 0 var(--space-100); padding: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); color: var(--ink-faint); }
.pgh-c li { display: inline-flex; align-items: center; height: var(--space-300); }
.pgh-c li + li::before { content: '/'; padding: 0 var(--space-100); color: var(--ink-faint); }
.pgh-c a, .crumb a { color: var(--ink-faint); text-decoration: underline transparent; transition: var(--motion-listitem-hovered); }
.pgh-c a:hover, .crumb a:hover { color: var(--ink-faint); text-decoration-color: currentColor; }
.pgh-c li:last-child, .pgh-c [aria-current] { color: var(--ink); }

/* ---- Pagination --------------------------------------------------------------------------------------
   Subtle buttons: the pages and the previous and next arrows; the current page takes the selected appearance. */
.pages { display: flex; align-items: center; gap: var(--space-025); }
.pages .gap { padding: 0 var(--space-075); color: var(--ink-faint); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.pg { display: inline-flex; align-items: center; justify-content: center; min-width: var(--control-height); height: var(--control-height); padding: 0 var(--space-075); border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink-soft); font: var(--font-weight-medium) var(--font-size-body)/var(--line-height-body) var(--font-family-body); font-variant-numeric: tabular-nums; cursor: pointer; transition: var(--motion-button-hovered); position: relative; }
.pg:hover:not(:disabled), .pg.is-hover { background: var(--subtle-hover); }
.pg:active:not(:disabled), .pg.is-pressed { background: var(--subtle-pressed); }
.pg.on { background: var(--accent-soft); color: var(--selected-ink); }
.pg.on::after { content: ''; position: absolute; inset: 0; border: var(--border-width) solid var(--selected-line); border-radius: inherit; }
.pg:disabled, .pg.is-disabled { color: var(--disabled-ink); cursor: not-allowed; background: transparent; }
.pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-150); padding: var(--space-150) var(--space-200); border-top: var(--border-width) solid var(--line); }
.pager .count { margin: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.pager .count b { color: var(--ink); font-weight: var(--font-weight-semibold); }
.pager .of { color: var(--ink-faint); }

/* ---- Dynamic table -----------------------------------------------------------------------------------
   The head in 12/16 bold subtle ink over a 2px neutral rule; cells 4px above and below, 8px either side, the first
   and the last flush with the table's edge — the table takes its inset from its card, as the published one takes
   it from its page; rows take the subtle hover and the selected fill. */
table.tbl { width: 100%; border-collapse: collapse; border-spacing: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); }
table.tbl th, table.tbl td { padding: var(--space-050) var(--space-100); text-align: left; vertical-align: middle; border-bottom: var(--border-width) solid var(--line); }
table.tbl th:first-of-type, table.tbl td:first-of-type { padding-inline-start: 0; }
table.tbl th:last-child, table.tbl td:last-child { padding-inline-end: 0; }
table.tbl thead th { position: sticky; top: 0; height: var(--space-500); background: var(--panel); border-bottom: var(--border-width-selected) solid var(--line); font: var(--font-weight-bold) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); color: var(--ink-soft); white-space: nowrap; }
table.tbl tbody td { height: var(--space-500); }
table.tbl th[aria-sort] { color: var(--ink); }
table.tbl th.num, table.tbl td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.tbl tbody tr { transition: var(--motion-listitem-hovered); }
table.tbl tbody tr:hover, table.tbl tbody tr.is-hover { background: var(--subtle-hover); }
table.tbl tbody tr[aria-selected="true"], table.tbl tbody tr.picked { background: var(--accent-soft); }
table.tbl tbody tr[aria-selected="true"]:hover { background: var(--select-hover); }
table.tbl tbody tr:last-child td { border-bottom: 0; }
table.tbl td.check, table.tbl th.check { width: var(--space-500); padding-inline-end: 0; }
table.tbl tr.group td { background: var(--sunk); font: var(--font-weight-bold) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); color: var(--ink-soft); }
table.tbl td:has(> .sub) { min-width: 200px; }
table.tbl td .sub { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); margin-top: var(--space-025); }
table.tbl td .sub .ico { margin-right: var(--space-050); color: var(--icon-faint); }
table.tbl tfoot td { font-weight: var(--font-weight-semibold); border-top: var(--border-width-selected) solid var(--line); border-bottom: 0; background: var(--panel); }
table.tbl tfoot td.num { font-weight: var(--font-weight-regular); }
table.tbl td.absent { color: var(--ink-faint); font-style: italic; }
table.tbl td a { font-weight: var(--font-weight-medium); }
table.tbl .pill { vertical-align: baseline; }
.tbl th .sort { display: inline-flex; align-items: center; gap: var(--space-025); background: none; border: 0; padding: 0; margin: 0; font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; cursor: pointer; border-radius: var(--radius-xsmall); }
.tbl th.num .sort { flex-direction: row-reverse; }
.tbl th .sort .i.off { opacity: 0; }
.tbl th .sort:hover .i.off, .tbl th .sort:focus-visible .i.off { opacity: 1; }
.tbl.skel td > .skeleton { height: var(--space-150); margin-block: calc((var(--line-height-body) - var(--space-150)) / 2); width: 70%; }
.tbl.skel td.num > .skeleton { width: 55%; margin-left: auto; }
.tbl.skel td:first-child > .skeleton { width: 60%; }

/* ---- Charts ------------------------------------------------------------------------------------------
   The published guidance: the title in the text colour, tick labels subtle, gridlines the border colour, the axis
   the bold border, one mark colour (the brand chart colour) unless the data is a status, and a gap in the inverse
   border colour between adjacent chart colours; a figure never sits on a chart colour. */
figure.chart { margin: 0; }
figure.chart > figcaption { display: flex; justify-content: space-between; gap: var(--space-100); font: var(--font-weight-semibold) var(--font-size-body)/var(--line-height-body) var(--font-family-body); color: var(--ink); }
figure.chart > figcaption > span { font-weight: var(--font-weight-regular); color: var(--ink-soft); }

/* ---- Text field, select, text area -------------------------------------------------------------------
   A 1px input border, a small corner, the input surface; 6px above and below the text, which is 14/20 on a wide
   screen and 16/24 on a narrow one; hover lightens the surface, focus draws the focused colour as a 2px edge. */
.field { display: grid; gap: var(--space-050); margin-bottom: var(--space-200); }
.field label { font: var(--font-weight-medium) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); color: var(--ink-soft); }
.field label .req { color: var(--bad); margin-left: var(--space-025); }
.field input:not([type="checkbox"]):not([type="radio"]), .field select, .field textarea, .search input[type="search"], .datepick input { box-sizing: border-box; width: 100%; height: var(--field-height); padding: var(--space-075) var(--space-075); border: var(--border-width) solid var(--line-strong); border-radius: var(--radius-small); background: var(--input); color: var(--ink); font: var(--font-weight-regular) var(--font-size-body)/var(--line-height-body) var(--font-family-body); box-shadow: none; transition: var(--motion-button-hovered); }
.field textarea { height: auto; min-height: calc(var(--line-height-body) * 3 + var(--space-150)); resize: vertical; }
.field input:not([type="checkbox"]):not([type="radio"]):hover, .field select:hover, .field textarea:hover, .search input[type="search"]:hover, .field input.is-hover:not([type="checkbox"]):not([type="radio"]), .field select.is-hover, .field textarea.is-hover, .search input.is-hover { background: var(--input-hover); }
.field input:not([type="checkbox"]):not([type="radio"]):focus, .field select:focus, .field textarea:focus, .search input[type="search"]:focus, .field input.is-focus:not([type="checkbox"]):not([type="radio"]), .field select.is-focus, .field textarea.is-focus, .search input.is-focus { background: var(--input-pressed); border-color: var(--focus); box-shadow: inset 0 0 0 var(--border-width) var(--focus); outline: none; }
.field input:disabled, .field select:disabled, .field input.is-disabled:not([type="checkbox"]):not([type="radio"]), .field select.is-disabled { background: var(--disabled-fill); border-color: var(--disabled-fill); color: var(--disabled-ink); cursor: not-allowed; }
.field input::placeholder, .field textarea::placeholder, .search input::placeholder { color: var(--ink-faint); }
.field .hint { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.field.invalid input:not([type="search"]), .field.invalid select { border-color: var(--danger-line); box-shadow: inset 0 0 0 var(--border-width) var(--danger-line); }
.field .err { display: flex; gap: var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--bad); }
.field > .search { max-width: none; }
.field .money-in { position: relative; }
.field .money-in::before { content: '₹'; position: absolute; left: var(--space-100); top: 0; height: var(--field-height); line-height: var(--field-height); color: var(--ink-faint); }
.field .money-in input { padding-left: var(--space-300); text-align: right; font-variant-numeric: tabular-nums; }
.field input[type="search"] + select { margin-top: var(--space-075); }
.search { flex: 1; max-width: 520px; position: relative; display: flex; align-items: center; }
.search > .ico { position: absolute; left: var(--space-100); top: 0; display: flex; align-items: center; height: var(--field-height); color: var(--icon-faint); pointer-events: none; }
.search input[type="search"], .field > .search > input[type="search"] { padding-inline: var(--space-400) var(--space-500); }
.search .kbd { position: absolute; right: var(--space-100); top: 50%; transform: translateY(-50%); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); padding: 0 var(--space-075); border: var(--border-width) solid var(--line-strong); border-radius: var(--radius-xsmall); color: var(--ink-faint); background: none; font-family: var(--font-family-code); }
.field select, .field .select-wrap > input { appearance: none; padding-inline-end: var(--space-400); background-image: none; }
.field .select-wrap > input::-webkit-calendar-picker-indicator { display: none; }
.select-wrap { position: relative; }
.select-wrap::after { content: ''; position: absolute; right: var(--space-150); top: 50%; width: var(--space-075); height: var(--space-075); margin-top: calc(var(--space-050) * -1); border-right: var(--border-width-selected) solid var(--icon-soft); border-bottom: var(--border-width-selected) solid var(--icon-soft); transform: rotate(45deg); pointer-events: none; }

/* ---- Checkbox, radio, toggle -------------------------------------------------------------------------
   A 16px box with a small corner or a 16px circle, the input border, the input surface; checked is the bold
   selected fill with an inverse tick or dot. A toggle is 32 by 16, the bold neutral when off and the bold success
   when on, a 12px inverse knob that travels 16px. */
input[type="checkbox"], input[type="radio"] { appearance: none; box-sizing: border-box; flex: none; width: var(--checkbox-size); height: var(--checkbox-size); margin: 0; border: var(--border-width) solid var(--line-strong); background: var(--input); display: inline-grid; place-content: center; vertical-align: middle; cursor: pointer; transition: var(--motion-button-hovered); }
input[type="checkbox"] { border-radius: var(--radius-small); }
input[type="radio"] { border-radius: var(--radius-full); }
input[type="checkbox"]:hover, input[type="radio"]:hover, input.is-hover { background: var(--input-hover); }
input[type="checkbox"]:checked, input[type="radio"]:checked, input[type="checkbox"]:indeterminate, input.is-checked { background: var(--check-on); border-color: var(--check-on); }
input[type="checkbox"]:checked:hover, input[type="radio"]:checked:hover, input.is-checked.is-hover { background: var(--check-on-hover); border-color: var(--check-on-hover); }
input[type="checkbox"]:checked::before, input[type="checkbox"].is-checked::before { content: ''; width: var(--space-075); height: var(--space-100); margin-top: calc(var(--space-025) * -1); border-right: var(--border-width-selected) solid var(--knob); border-bottom: var(--border-width-selected) solid var(--knob); transform: rotate(45deg); }
input[type="checkbox"]:indeterminate::before { content: ''; width: var(--space-100); height: var(--border-width-selected); background: var(--knob); }
input[type="radio"]:checked::before, input[type="radio"].is-checked::before { content: ''; width: var(--space-075); height: var(--space-075); border-radius: var(--radius-full); background: var(--knob); }
input[type="checkbox"]:disabled, input[type="radio"]:disabled, input.is-disabled { background: var(--disabled-fill); border-color: var(--disabled-fill); cursor: not-allowed; }
.toggle { flex: none; position: relative; box-sizing: border-box; width: var(--space-400); height: var(--space-200); padding: 0; border: 0; border-radius: var(--radius-full); background: var(--toggle-off); cursor: pointer; transition: var(--motion-toggle-track); }
.toggle .knob { position: absolute; top: var(--space-025); left: var(--space-025); width: var(--space-150); height: var(--space-150); border-radius: var(--radius-full); background: var(--knob); transition: var(--motion-toggle-knob); }
.toggle:hover, .toggle.is-hover { background: var(--toggle-off-hover); }
.toggle[aria-checked="true"] { background: var(--toggle-on); }
.toggle[aria-checked="true"]:hover, .toggle[aria-checked="true"].is-hover { background: var(--toggle-on-hover); }
.toggle[aria-checked="true"] .knob { transform: translateX(var(--space-200)); }
.toggle:disabled, .toggle.is-disabled { background: var(--disabled-fill); cursor: not-allowed; }
.toggle:disabled .knob, .toggle.is-disabled .knob { background: var(--icon-disabled); }
.check-row, .radio { display: flex; gap: var(--space-100); align-items: flex-start; padding: var(--space-050) 0; margin: 0 0 var(--space-050); border: 0; border-radius: 0; background: none; cursor: pointer; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.check-row > .ico, .radio > .ico { display: inline-block; line-height: var(--line-height-body); }

/* ---- Date picker -------------------------------------------------------------------------------------
   A text field with a calendar button; the calendar in a popup: the month, the weekday initials, and the days as
   subtle buttons; today in the selected ink, the chosen day on the bold selected fill. */
.datepick { position: relative; }
.datepick .dp-control { position: relative; }
.datepick .dp-btn { position: absolute; right: var(--space-050); top: calc((var(--field-height) - var(--control-height-compact)) / 2); }
.calendar { padding: var(--space-200); width: max-content; }
.calendar .cal-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-100); font: var(--font-weight-bold) var(--font-size-heading-xsmall)/var(--line-height-heading-xsmall) var(--font-family-heading); }
.calendar table { border-collapse: collapse; }
.calendar th { width: var(--control-height); height: var(--control-height-compact); font: var(--font-weight-bold) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); color: var(--ink-faint); text-align: center; }
.calendar td { padding: 0; text-align: center; }
.calendar td button { width: var(--control-height); height: var(--control-height); border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink); font: var(--font-weight-regular) var(--font-size-body)/var(--line-height-body) var(--font-family-body); font-variant-numeric: tabular-nums; cursor: pointer; transition: var(--motion-button-hovered); }
.calendar td button:hover, .calendar td button.is-hover { background: var(--subtle-hover); }
.calendar td button.today { color: var(--selected-ink); font-weight: var(--font-weight-bold); }
.calendar td button[aria-pressed="true"] { background: var(--check-on); color: var(--knob); }
.calendar td button.out, .calendar td button:disabled { color: var(--disabled-ink); cursor: not-allowed; background: transparent; }

/* ---- Inline edit -------------------------------------------------------------------------------------
   The value as read, 8 by 6px inside, a small corner that the subtle hover fills; editing swaps in a text field
   with a confirm and a cancel button below it, on the overlay shadow. */
.inline-edit { position: relative; display: block; }
.inline-edit .ie-read { display: flex; max-width: 100%; padding: var(--space-100) var(--space-075); border: 0; border-radius: var(--radius-small); background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: text; transition: var(--motion-button-hovered); }
td.num .inline-edit .ie-read { margin-left: auto; }
.inline-edit .ie-read:hover, .inline-edit .ie-read.is-hover { background: var(--subtle-hover); }
.inline-edit.qty { max-width: 160px; margin-left: auto; }
.inline-edit .ie-field { position: relative; }
.inline-edit .ie-unit { position: absolute; right: var(--space-100); top: 0; height: var(--field-height); line-height: var(--field-height); color: var(--ink-faint); pointer-events: none; }
.inline-edit .ie-field input { padding-right: calc(var(--space-100) + 4ch); }
.inline-edit input { box-sizing: border-box; width: 100%; height: var(--field-height); padding: var(--space-075); border: var(--border-width) solid var(--focus); border-radius: var(--radius-small); background: var(--input-pressed); box-shadow: inset 0 0 0 var(--border-width) var(--focus); color: var(--ink); font: inherit; text-align: right; font-variant-numeric: tabular-nums; outline: none; }
.inline-edit .ie-acts { position: absolute; right: 0; top: calc(100% + var(--space-050)); z-index: 2; display: flex; gap: var(--space-050); }
.inline-edit .ie-acts .btn { background: var(--elevated); box-shadow: var(--shadow-3); }

/* ---- Empty state -------------------------------------------------------------------------------------
   Centred, 48px above and below; an image at most 160px, 24px over the heading; the heading in heading medium with
   16px under it; the description; then the actions, secondary before primary. Wide is 464px, narrow 304px. */
.empty { display: block; box-sizing: content-box; max-width: 464px; margin: var(--space-600) auto; padding: 0 var(--space-200); text-align: center; color: var(--ink); background: none; border: 0; box-shadow: none; border-radius: 0; }
.empty.narrow { max-width: 304px; }
.empty > .illo { display: block; width: var(--illo-lg); height: var(--illo-lg); max-width: 100%; margin: 0 auto var(--space-300); }
.empty > .es-t { margin: var(--space-100) 0 0; }
.empty > b, .empty > h4, .empty > .es-h { display: block; padding-bottom: var(--space-200); font: var(--font-weight-bold) var(--font-size-heading-medium)/var(--line-height-heading-medium) var(--font-family-heading); color: var(--ink); }
.empty > p { margin: 0 auto; font-size: var(--font-size-body); line-height: var(--line-height-body); color: var(--ink); }
.empty > .actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: var(--space-100); margin: var(--space-300) 0 var(--space-100); }
.card > .empty, .card > .gate { margin: var(--space-600) auto; border: 0; box-shadow: none; }

/* ---- Illustration: flat accent blocks under a hand-drawn line, with sparkles ----------------------------------
   Decorative: every drawing is aria-hidden and the heading says what it means. The line holds 3:1 on the card in
   both themes; the fills are exempt, as a decorative image's are (WCAG 1.4.11). */
.illo-art .l { fill: none; stroke: var(--illo-line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.illo-art .sp { fill: none; stroke: var(--illo-line); stroke-width: 1.5; stroke-linecap: round; }
.illo-art .fa { fill: var(--illo-a); } .illo-art .fb { fill: var(--illo-b); } .illo-art .fc { fill: var(--illo-c); } .illo-art .fn { fill: var(--illo-n); }
.illo-art .a { fill: var(--illo-accent); }

/* ---- The pieces of this product built from the components above ---------------------------------------- */
.popover { position: absolute; top: 58px; right: var(--space-300); width: 420px; max-width: calc(100% - var(--space-400)); overflow: hidden; background: var(--elevated); border-radius: var(--radius-large); box-shadow: var(--shadow-3); z-index: 9; animation: var(--motion-popup-enter-bottom); }
/* a filter button is a default button naming its field; applied, it takes the selected appearance */
.fbtn { position: relative; display: inline-flex; align-items: center; gap: var(--space-075); height: var(--control-height); padding: var(--space-075) var(--space-100) var(--space-075) var(--space-150); border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink-soft); font: var(--font-weight-medium) var(--font-size-body)/var(--line-height-body) var(--font-family-body); white-space: nowrap; cursor: pointer; transition: var(--motion-button-hovered); }
.fbtn::after { content: ''; position: absolute; inset: 0; border: var(--border-width) solid var(--line); border-radius: inherit; pointer-events: none; }
.fbtn:hover, .fbtn.is-hover { background: var(--subtle-hover); }
.fbtn:active, .fbtn.is-pressed { background: var(--subtle-pressed); }
.fbtn b { font-weight: var(--font-weight-medium); }
.fbtn.on { background: var(--accent-soft); color: var(--selected-ink); }
.fbtn.on::after { border-color: var(--selected-line); }
.fbtn > .ico { color: currentColor; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-100); padding: var(--space-100) var(--space-200); border-bottom: var(--border-width) solid var(--line); }
.chips-l { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.scls, .dsx-tag { display: inline-flex; align-items: center; box-sizing: border-box; height: var(--space-250); padding: 0 var(--space-050); border: var(--border-width) solid var(--line); border-radius: var(--radius-small); background: var(--tag-fill); color: var(--tag-ink); font: var(--font-weight-regular) var(--font-size-body-small)/var(--line-height-body-small) var(--font-family-body); white-space: nowrap; vertical-align: baseline; }
.side-nav .badge { margin-left: auto; }
.side-nav .firm { margin-left: auto; }
.side-nav .badge + .firm { margin-left: var(--space-050); }
.bell { position: relative; }
.bell .badge { position: absolute; top: 0; right: 0; min-width: var(--space-200); padding: 0 var(--space-025); }
/* (19 September, charts) a semantic element on the dark island resolves to a bold fill with the light set's inverse ink —
   the dark set's subtlest red on the navy read as a maroon smudge in the light theme */
.topbar .badge.important { background: var(--island-important); color: var(--island-important-ink); }
.gate { display: flex; gap: var(--space-250); align-items: flex-start; padding: var(--space-250) var(--space-300); background: var(--panel); border: var(--border-width) solid var(--line); border-radius: var(--radius-large); margin-bottom: var(--space-250); }
.gate > .illo { width: var(--illo-sm); height: var(--illo-sm); flex: none; }
.gate > div { min-width: 0; flex: 1; }
.gate b { display: block; font: var(--font-weight-bold) var(--font-size-heading-medium)/var(--line-height-heading-medium) var(--font-family-heading); }
.gate p { color: var(--ink); margin-top: var(--space-050); }
.gate ul { margin: var(--space-100) 0 0; padding-left: var(--space-250); color: var(--ink); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.gate .actions { margin-top: var(--space-300); }

/* ---- The components page: one specimen in each theme, side by side ---------------------------------------- */
.spec .stat { min-width: 240px; }
/* ---- the motion page: a grid of specimens, each with a stage that plays --------------------------------- */
.mo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(400px, 100%), 1fr)); gap: var(--space-250); margin-bottom: var(--space-400); }
.mo { display: flex; flex-direction: column; border: var(--border-width) solid var(--line); border-radius: var(--radius-large); background: var(--panel); }
.mo-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-150); padding: var(--space-150) var(--space-200); border-bottom: var(--border-width) solid var(--line); }
.mo-h h4 { font: var(--font-weight-bold) var(--font-size-heading-xsmall)/var(--line-height-heading-xsmall) var(--font-family-heading); }
.mo-stage { position: relative; height: 128px; padding: var(--space-200); background: var(--ground); overflow: hidden; }
.mo-stage.tall { height: 288px; }
.mo-dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-075) var(--space-150); margin: 0; padding: var(--space-150) var(--space-200) var(--space-200); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.mo-dl dt { color: var(--ink-faint); } .mo-dl dd { margin: 0; color: var(--ink-soft); } .mo-dl code { color: var(--ink); } .mo-dl dd span { color: var(--ink-faint); }
.mo-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-200); }
.mo-skel { display: grid; gap: var(--space-150); width: 60%; }
.mo-el.mo-in { animation: var(--mo-enter); }
.mo-el.mo-out { animation: var(--mo-exit); }
.mo-menu .menu-i { border-radius: var(--radius-small); }
.mo-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-200); }
.mo-controls .check-row { padding: 0; }
.mo-os { margin: 0; color: var(--ink-soft); }
.mo-nav .mo-body { display: grid; grid-template-rows: 1fr; transition: var(--motion-section-expand); }
.mo-nav .nav-h[aria-expanded="false"] + .mo-body { grid-template-rows: 0fr; }
.mo-nav .mo-list { list-style: none; margin: 0; padding: 0 0 0 var(--space-400); min-height: 0; overflow: hidden; }
.mo-nav .mo-list.mo-in { animation: var(--motion-panel-content-enter); }
.mo-nav .mo-list a { display: flex; align-items: center; justify-content: space-between; gap: var(--space-100); height: var(--control-height); padding: 0 var(--space-150); border-radius: var(--radius-medium); color: var(--ink-soft); text-decoration: none; }
.mo-nav .mo-list a:hover { background: var(--subtle-hover); color: var(--ink); }
.mo-nav .nav-h { width: 100%; }
/* the grid diagram on the components page: twelve numbered columns, then the rows Today is drawn in */
.spec-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--grid-gutter); margin: 0 0 var(--space-150); }
.spec-grid span { display: block; min-width: 0; overflow: hidden; height: var(--space-400); border-radius: var(--radius-small); background: var(--disc-blue); color: var(--ink); font-size: var(--font-size-body-small); line-height: var(--space-400); text-align: center; font-variant-numeric: tabular-nums; }
.spec-rows { display: grid; gap: var(--space-100); }
.spec-row-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--grid-gutter); }
.spec-row-grid span { display: block; min-width: 0; overflow: hidden; height: var(--space-300); border: var(--border-width) solid var(--line-strong); border-radius: var(--radius-small); background: var(--panel); font-size: var(--font-size-body-small); line-height: var(--space-300); text-align: center; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.spec-row-grid .c3 { grid-column: span 3; } .spec-row-grid .c4 { grid-column: span 4; } .spec-row-grid .c6 { grid-column: span 6; } .spec-row-grid .c8 { grid-column: span 8; } .spec-row-grid .c12 { grid-column: span 12; }
.spec-duo { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-150) var(--space-200); }
.spec-duo figure { display: flex; gap: var(--space-150); align-items: flex-start; margin: 0; }
.spec-duo figcaption { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); min-width: 0; }
.spec-duo figcaption code { display: block; width: max-content; color: var(--ink); }
.spec-illos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--space-200); }
.spec-illos figure { margin: 0; text-align: center; }
.spec-illos .illo { display: block; width: 120px; height: 120px; margin: 0 auto var(--space-100); }
.spec-illos figcaption small { display: block; color: var(--ink-faint); font-family: var(--font-mono); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.spec-illos figcaption { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.spec { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-200); }
.spec.wide { grid-template-columns: minmax(0, 1fr); }
.spec-pane { position: relative; min-width: 0; padding: var(--space-400) var(--space-250) var(--space-250); border: var(--border-width) solid var(--line); border-radius: var(--radius-large); background: var(--panel); color: var(--ink); }
.spec-theme { position: absolute; top: var(--space-100); right: var(--space-150); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.spec-h { margin: var(--space-250) 0 var(--space-100); font: var(--font-weight-bold) var(--font-size-heading-xxsmall)/var(--line-height-heading-xxsmall) var(--font-family-heading); color: var(--ink-soft); }
.spec-pane > .spec-h:first-of-type { margin-top: 0; }
.spec-row { display: flex; flex-wrap: wrap; gap: var(--space-200) var(--space-250); align-items: flex-end; }
.spec-st { display: grid; gap: var(--space-075); justify-items: start; min-width: 0; }
.spec-st > small, .spec-cap { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.spec-skel { display: flex; gap: var(--space-150); align-items: center; }
.spec-stage { position: relative; min-height: 240px; overflow: hidden; border-radius: var(--radius-medium); background: var(--ground); padding: var(--space-200); }
.spec-stage.short { min-height: 140px; }
.spec-stage.tall { min-height: 420px; }
.spec-stage .flag-group { left: var(--space-200); bottom: var(--space-200); }
.spec-stage .modal { top: var(--space-500); }
@media (max-width: 1100px) { .spec { grid-template-columns: minmax(0, 1fr); } }
`;
