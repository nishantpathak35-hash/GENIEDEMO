/**
 * `packages/design-system` — the kit four apps share.
 *
 * **Extracted at the third and fourth consumers, not before.** While there was
 * one app, every piece here lived in `apps/web` where its only user could see
 * it; a component library designed against no use is the kind that gets
 * bypassed. `apps/admin`, `apps/vendor-portal` and `apps/client-portal` are
 * three more consumers of the same five things, and triplicating them is how
 * the rupee formatter ends up with three behaviours.
 *
 * What is here is what all four need and none may re-implement:
 *
 *   - `load` — the ok / refused / unreachable split. Under RLS a refusal and an
 *     empty list are the same response unless something keeps them apart.
 *   - `Money` — takes the WIRE STRING and calls `formatIndianRupees`. There is
 *     no variant taking a number, because no app can be holding one.
 *   - `Refusal`, `Unreachable`, `AbsentNotice` — a refused read, an unreachable
 *     API and a figure that is absent rather than zero are three different
 *     screens, and the legacy renders all three as an empty table.
 *   - The form kit, which never disables a control because of a role: a screen
 *     renders what the server said, and the server refuses what it refuses.
 *   - One stylesheet, so a table of money looks the same to staff, a vendor and
 *     a client.
 *
 * The boundary that applies: this package may import `packages/contracts` and
 * `packages/money`, and nothing from `services/` or `apps/`.
 */

export {
  load,
  firstFailure,
  itemsOf,
  type Loaded,
} from './data.js';

export {
  IDLE,
  PRICED_IDLE,
  failed,
  succeeded,
  messageFor,
  text,
  optionalText,
  checked,
  type ActionState,
  type PricedState,
} from './action-state.js';

export {
  Notice,
  Refusal,
  Money,
  MoneyExact,
  Pill,
  Absent,
  AbsentNotice,
  reasonSentence,
  type PillTone,
  type NoticeTone,
} from './ui.js';

export { Form, Field, Choice, Notes, MoneyField } from './form.js';
export { Picker } from './picker.js';
export { Tabs, Subtabs } from './tabs.js';

// --- the design system, applied 2026-09-13 ---------------------------------
//
// Fourteen components with no shipped equivalent, from
// `docs/design/COMPONENT-MAP.md` §4. Every one is inline SVG or plain markup
// over the one stylesheet; a chart references the chart token set only, and
// `tests/chart-isolation.test.ts` reads the source to prove it.

export {
  Sprite,
  Icon,
  Duotone,
  duotoneFor,
  Illustration,
  ICON_NAMES,
  DUOTONE_NAMES,
  ILLUSTRATION_NAMES,
  ILLUSTRATION_SUBJECTS,
  ILLUSTRATION_FOR,
  ILLUSTRATION_CAPTION,
  type IconName,
  type DuotoneName,
  type IllustrationName,
  type IllustrationSubject,
} from './sprite.js';
export { Empty } from './empty.js';
export { NotificationPanel, NotificationBell, type NotificationItem } from './notifications.js';

export { Stat, StatRow, type StatDelta, type StatDirection } from './stat.js';
export { Hero, type HeroBar, type HeroOwner } from './hero.js';
export {
  Line,
  Area,
  Threshold,
  Band,
  PointMarker,
  Annotation,
  Sparkline,
  Meter,
  MeterList,
  type ChartPoint,
  type MeterRow,
  type MeterLegendKey,
} from './chart.js';

// --- the dashboard, 2026-09-19 ---------------------------------------------
//
// Today and Overview on one grid, one card, one chart grammar
// (`docs/design/04-today.html`, COMPONENT-MAP §3). The chart grammar lives in
// its own file, held to the chart token set by `tests/chart-isolation.test.ts`
// the same as `chart.tsx`.

export { ChartTable, Columns, Parts, Lines, type ColumnSeries, type LineSeries , Progress,
} from './chart-grammar.js';
export {
  DashGrid,
  Card,
  CardAction,
  PeriodPicker,
  Disc,
  Tile,
  OweCard,
  OweBar,
  RatioBar,
  ShortfallBar,
  AgeBar,
  OverdueStrip,
  Split,
  AbsentPanel,
  MoneyIn,
  MoneyOut,
  type DashSpan,
  type DiscHue,
  type CardProps,
  type BarSegment,
  type AgeingBucketView,
} from './dashboard.js';

export {
  Toolbar,
  FilterChips,
  Pager,
  BulkBar,
  SortableHeader,
  Skeleton,
  ListFrame,
  type FilterChip,
  type SortDir,
  type SkeletonColumn,
} from './list.js';
export { useRowSelection, type RowSelection } from './row-selection.js';
export { Stepper, Steps, type Step } from './stepper.js';
export { Drawer } from './drawer.js';

export {
  LEAD_STAGES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  DRAWING_CATEGORIES,
  SITE_CONDITIONS,
  labelOf,
  type Options,
} from './vocabulary.js';

export {
  WORDS,
  TERM_PAIRS,
  DEFAULT_TERMINOLOGY,
  termsFor,
  relabel,
  type TermKey,
  type TermPair,
  type Terminology,
  type Terms,
} from './words.js';

// --- the patterns, 2026-09-20 -----------------------------------------------
//
// One header on every screen, one list on every list, the published elements
// the kit lacked, and the whole-page answers as empty states
// (`docs/design/00-foundations.html` "The patterns", COMPONENT-MAP §3).

export { PageHeader, crumbsFor, type Crumb } from './page-header.js';
export { Section } from './section.js';
export { PortalBar, PortalHead } from './portal.js';
export {
  ListToolbar,
  AppliedFilters,
  ListTable,
  ListCard,
  ListPager,
  RecordPane,
  type Column,
  type ColumnPriority,
  type Row,
  type ToolbarFilter,
} from './list-view.js';
export {
  Badge,
  Tag,
  Tooltip,
  Banner,
  InlineMessage,
  Switch,
  Spinner,
  ProgressBar,
  Menu,
  MenuItem,
  KebabMenu,
  ColumnControl,
  ViewSwitch,
  DocToolbar,
  AttachmentClip,
} from './elements.js';
export { UnreachableState, NotFoundState, ErrorState, SignedOutState, answer } from './page-state.js';
