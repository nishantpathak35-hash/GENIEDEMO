import type { CSSProperties, ReactNode } from 'react';
import { Duotone, Icon, type DuotoneName } from './sprite.js';

/**
 * The dashboard — Today and Overview on one grid, one card, one form per fact
 * (`docs/design/04-today.html`, 19 September 2026).
 *
 * `DashGrid` is twelve columns on a 24px gutter; a card names its span (3, 4,
 * 6, 8, or 12) and a row's spans add to twelve — the browser gate in
 * `e2e/design-gates.spec.ts` measures every row. Every card wears one 48px
 * one-line header: the duotone disc first (a tile or a money card only), the
 * title — at most 24 characters, never wrapped — with its help icon carrying
 * the panel's value line, and at the right one action or a period picker.
 *
 * Nothing here computes: a bar's width, a bucket's share, a figure's place on
 * a scale all arrive as the server's numbers, and money arrives as the wire
 * string a screen formats through `Money`. A panel whose read answered empty
 * renders `AbsentPanel` — the reason in product words and one action — never
 * a zero, and never a marker meant for us.
 */

export type DashSpan = 3 | 4 | 6 | 8 | 12;
export type DiscHue = 'blue' | 'teal' | 'green' | 'purple' | 'magenta' | 'red' | 'yellow' | 'gray';

export function DashGrid({ children }: { children: ReactNode }): ReactNode {
  return <div className="dash-grid">{children}</div>;
}

/**
 * The tinted disc under a duotone icon — one hue per figure, the icon its job
 * (`docs/design/build/duotone.mjs`), left of a tile's or a money card's title
 * and nowhere else on a card. The small disc, 28px with the icon at 20.
 */
export function Disc({ hue, icon, sm = false }: { hue: DiscHue; icon: DuotoneName; sm?: boolean }): ReactNode {
  return (
    <span className={`disc${sm ? ' sm' : ''} ${hue}`} aria-hidden="true">
      <Duotone name={icon} />
    </span>
  );
}

/**
 * The header's one action: a word, and on the rail (under 1000px) its icon in
 * the word's place — a plus to add, an arrow to open — so a six-column card's
 * header stays one line at every width.
 */
export function CardAction({ href, children }: { href: string; children: string }): ReactNode {
  const adds = /^New /.test(children);
  return (
    <a className="btn sm act" href={href} aria-label={children}>
      <Icon name={adds ? 'plus' : 'right'} size="sm" />
      <span>{children}</span>
    </a>
  );
}

/**
 * The period picker: a real control on the address, not markup. Two links —
 * `?period=fy`, `?period=q` — behind a disclosure, so it works rendered on the
 * server with no script; on a phone the label folds to its icon.
 */
export function PeriodPicker({
  value,
  label,
  hrefFor,
}: {
  value: 'fy' | 'q';
  /** The window's name as the server printed it — "FY 2026-27". */
  label: string;
  /** The address for a period, built by the page from its own address. */
  hrefFor: (period: 'fy' | 'q') => string;
}): ReactNode {
  return (
    <details className="period">
      <summary aria-label={`Period: ${label}`}>
        <span className="cal">
          <Icon name="clock" size="sm" />
        </span>
        <span>{label}</span>
        <Icon name="chevron" size="sm" />
      </summary>
      <ul className="menu">
        <li>
          <a href={hrefFor('fy')} {...(value === 'fy' ? { 'aria-current': 'true' as const } : {})}>
            Financial year to date
          </a>
        </li>
        <li>
          <a href={hrefFor('q')} {...(value === 'q' ? { 'aria-current': 'true' as const } : {})}>
            This quarter to date
          </a>
        </li>
      </ul>
    </details>
  );
}

export interface CardProps {
  /** At most 24 characters; the header never wraps. */
  title: string;
  /** The panel's value line — what a director does after looking at it — read by the help icon. */
  help: string;
  span: DashSpan;
  /** One action or one period picker at the header's right; never both. */
  action?: ReactNode;
  /** The disc, on a tile or a money card only. */
  disc?: { hue: DiscHue; icon: DuotoneName };
  /** The entitlement module the panel needs, for the browser gate to read. */
  module?: string;
  kind?: 'tile' | 'owe';
  children: ReactNode;
}

/** One card on the grid: the 48px header, then the body. */
export function Card({ title, help, span, action, disc, module, kind, children }: CardProps): ReactNode {
  const className = ['card', `c${String(span)}`, kind].filter((c): c is string => c !== undefined).join(' ');
  return (
    <section className={className} {...(module === undefined ? {} : { 'data-module': module })}>
      <div className="card-h">
        {disc === undefined ? null : <Disc hue={disc.hue} icon={disc.icon} sm />}
        <h2 className="ct">
          {title}
          <button type="button" className="btn icon ghost sm help" aria-label={help} title={help}>
            <svg className="i" aria-hidden="true">
              <use href="#i-info" />
            </svg>
          </button>
        </h2>
        {action}
      </div>
      <div className="card-b">{children}</div>
    </section>
  );
}

/** A bar of segments on one track: a ratio (the covered part over a track), a shortfall (the covered part, then the short part in amber), or ageing buckets. */
export type BarSegment = { readonly kind: 'cur' | 'over' | 'rest'; readonly pct?: number };

/**
 * The owed bar. Every width is the server's percentage, set as a custom
 * property; a segment without a width takes what the others leave. The bar
 * is an image — `label` says what it shows, and the figures print beneath it.
 */
export function OweBar({ segments, label }: { segments: ReadonlyArray<BarSegment>; label: string }): ReactNode {
  return (
    <div className="chart owe">
      <div className="owe-bar" role="img" aria-label={label}>
        {segments.map((s, i) =>
          s.pct === undefined ? (
            <i key={i} className={s.kind} />
          ) : (
            <i key={i} className={s.kind} style={{ '--w': `${String(s.pct)}%` } as CSSProperties} />
          ),
        )}
      </div>
    </div>
  );
}

/** A ratio bar: `pct` covered over a track. */
export function RatioBar({ pct, label }: { pct: number; label: string }): ReactNode {
  return <OweBar segments={[{ kind: 'cur', pct }, { kind: 'rest' }]} label={label} />;
}

/** A shortfall bar: `coveredPct` neutral, the rest in the status amber. */
export function ShortfallBar({ coveredPct, label }: { coveredPct: number; label: string }): ReactNode {
  return <OweBar segments={[{ kind: 'cur', pct: coveredPct }, { kind: 'over' }]} label={label} />;
}

export interface AgeingBucketView {
  readonly total: string;
  readonly pct: number;
}

/**
 * The ageing bar: current first, then each overdue bucket in the amber — a
 * bucket with nothing in it draws no segment. `buckets` are the server's
 * shares of the whole owed.
 */
export function AgeBar({
  current,
  overdue,
  label,
}: {
  current: AgeingBucketView;
  overdue: ReadonlyArray<AgeingBucketView>;
  label: string;
}): ReactNode {
  const segments: BarSegment[] = [];
  if (current.pct > 0) segments.push({ kind: 'cur', pct: current.pct });
  for (const b of overdue) if (b.pct > 0) segments.push({ kind: 'over', pct: b.pct });
  return <OweBar segments={segments.length === 0 ? [{ kind: 'rest' }] : segments} label={label} />;
}

/**
 * The overdue tile's strip: the three overdue buckets alone, each as its
 * share of the overdue part. The server gave each bucket's share of
 * everything owed; on a strip of the overdue part alone the three keep their
 * ratio, so each is drawn as its share of their sum — a proportion between
 * three shares the server computed, never money, and the figures print
 * beneath it. Nothing overdue draws an empty track.
 */
export function OverdueStrip({ buckets, label }: { buckets: ReadonlyArray<AgeingBucketView>; label: string }): ReactNode {
  const sum = buckets.reduce((s, b) => s + b.pct, 0);
  if (sum <= 0) return <OweBar segments={[{ kind: 'rest' }]} label={label} />;
  return (
    <OweBar
      segments={buckets.filter((b) => b.pct > 0).map((b) => ({ kind: 'over' as const, pct: (b.pct / sum) * 100 }))}
      label={label}
    />
  );
}

/** A small-capitals label over a figure — the split beneath a bar. `overdue` puts the label in the caution ink. */
export function Split({
  items,
  ageing,
}: {
  items: ReadonlyArray<{ readonly label: string; readonly value: ReactNode; readonly overdue?: boolean }>;
  ageing?: boolean;
}): ReactNode {
  return (
    <dl className={ageing === true ? 'owe-split age' : 'owe-split'}>
      {items.map((it) => (
        <div key={it.label} {...(it.overdue === true ? { className: 'overdue' } : {})}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A tile: the disc left of the title, the figure at 24, one line of meaning,
 * a bar where there is a ratio or a strip of buckets, the split beneath, the
 * one action at the foot.
 */
export function Tile({
  title,
  help,
  span,
  disc,
  module,
  figure,
  meaning,
  bar,
  split,
  ageing,
  action,
}: {
  title: string;
  help: string;
  span: DashSpan;
  disc: { hue: DiscHue; icon: DuotoneName };
  module?: string;
  figure: ReactNode;
  meaning?: ReactNode;
  bar?: ReactNode;
  split?: ReadonlyArray<{ readonly label: string; readonly value: ReactNode; readonly overdue?: boolean }>;
  ageing?: boolean;
  /** The one action, at the foot. */
  action?: ReactNode;
}): ReactNode {
  return (
    <Card title={title} help={help} span={span} disc={disc} kind="tile" {...(module === undefined ? {} : { module })}>
      <b className="fig">{figure}</b>
      {meaning === undefined ? null : <p className="meaning">{meaning}</p>}
      {bar}
      {split === undefined ? null : <Split items={split} {...(ageing === true ? { ageing: true } : {})} />}
      {action === undefined ? null : <div className="foot">{action}</div>}
    </Card>
  );
}

/**
 * A money card: the total at 28, the bar in ageing buckets — current, then
 * 1–30 · 31–60 · 60+ days overdue — the buckets printed beneath, the overdue
 * ones under the amber label, a note at the foot.
 */
export function OweCard({
  title,
  help,
  span,
  disc,
  action,
  total,
  current,
  buckets,
  overduePct,
  note,
}: {
  title: string;
  help: string;
  span: DashSpan;
  disc: { hue: DiscHue; icon: DuotoneName };
  action?: ReactNode;
  /** Formatted by the page through `Money`. */
  total: ReactNode;
  current: { readonly value: ReactNode; readonly pct: number };
  /** In order: 1–30, 31–60, over 60 days. */
  buckets: ReadonlyArray<{ readonly label: string; readonly value: ReactNode; readonly pct: number }>;
  /** The overdue share of the whole as the server printed it — "28.39" — for the bar's label. */
  overduePct: string;
  note?: ReactNode;
}): ReactNode {
  return (
    <Card title={title} help={help} span={span} disc={disc} kind="owe" {...(action === undefined ? {} : { action })}>
      <div className="owe-total">
        <span className="caps">Total</span>
        <b className="fig">{total}</b>
      </div>
      <AgeBar
        current={{ total: '', pct: current.pct }}
        overdue={buckets.map((b) => ({ total: '', pct: b.pct }))}
        label={`${overduePct}% overdue — current, then overdue by 1 to 30, 31 to 60 and over 60 days`}
      />
      <Split
        ageing
        items={[
          { label: 'Current', value: current.value },
          ...buckets.map((b) => ({ label: b.label, value: b.value, overdue: true })),
        ]}
      />
      {note === undefined ? null : <p className="hint">{note}</p>}
    </Card>
  );
}

/** A panel with nothing to show yet: the reason in product words, one action. Never a zero. */
export function AbsentPanel({ action, children }: { action?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="absent">
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Money with its direction — in, out — as a colour of text, never a negative number. */
export function MoneyIn({ children }: { children: ReactNode }): ReactNode {
  return <span className="money in">+{children}</span>;
}
export function MoneyOut({ children }: { children: ReactNode }): ReactNode {
  return <span className="money out">−{children}</span>;
}
