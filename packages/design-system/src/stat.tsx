import { isValidElement, type ReactNode } from "react";
import { Absent, Money, MoneyExact } from "./ui.js";
import { Disc, type DiscHue } from "./dashboard.js";
import type { DuotoneName } from "./drawings.js";

/**
 * A label, a large tabular figure, a delta that says whether the figure is
 * good news, and — usually — a sparkline. The single most-used new
 * component in the design; a figure with nothing to compare it against
 * cannot tell you whether it is good or bad, so `delta` is optional in the
 * type only.
 *
 * `value` is a node, not a string, so it can be `<Money>`, `<Absent
 * why="…" />`, a bare count, or (with `text`) a word that must never be
 * mistaken for a number — "After setup" opens a setup flow, and if it sat in
 * the same tabular, `--font-size-stat` face as a rupee figure a reader would try to
 * read it as one. `text` swaps to the text face for exactly that reason.
 *
 * `delta.figure` is a node for the same reason `value` is: the comparison
 * amount is as often money as the headline figure is. `direction` carries
 * the only colour this component spends on a delta — up is `--ok`, down is
 * `--bad`, and `watch` is neutral ink on purpose. Caution is never a colour
 * on small text next to a figure (amber cannot hold 4.5:1 contrast at a
 * lightness that still reads as amber); the caution signal is `next`, the
 * one place this component uses `--warn`, and it is a filled pill precisely
 * because a fill is the shape amber can hold.
 *
 * `spark` takes a rendered node (normally a `<Sparkline>`) rather than the
 * values themselves — this component does not know what a sparkline is, only
 * where one goes.
 */
/**
 * The disc every stat carries (`build/shell.mjs` discFor): the duotone by the
 * figure's job — the invoice with its arrow for money with a direction, the
 * voucher for money without one, the gauge for a share of a contract, the
 * in-tray for what waits — and the hue by what the label is about. A caller
 * that knows better passes `disc`; `null` draws none.
 */
const DISC_HUES: ReadonlyArray<readonly [RegExp, DiscHue]> = [
  [/overdue|at risk|above the agreed|below reorder|short|snag|issue|you owe|expiring|no agreed rate|statutory|not checked|carpet tile/, "yellow"],
  [/won|due from the client|client value|next expected|measured to date|received(?!.*not)/, "green"],
  [/^cost|paid|declined|withdrawn/, "red"],
  [/cash|imprest/, "teal"],
  [/waiting|held by|to acknowledge|open, all people|on site today|approval/, "purple"],
  [/order|contract|invoiced|pipeline|margin$|agreed rate|ceiling/, "blue"],
];
export function discFor(label: string, money: boolean): { hue: DiscHue; icon: DuotoneName } {
  const l = label.toLowerCase();
  const icon: DuotoneName = /margin/.test(l)
    ? "margin"
    : /ceiling|past its contract|over the contract/.test(l)
      ? "ceiling"
      : /contract|ordered against/.test(l)
        ? "contract"
        : /held by|approv|waiting|to acknowledge/.test(l)
          ? "tray"
          : /retention|held now|held back/.test(l)
            ? "held"
            : /order/.test(l)
              ? "orders"
              : /site|report|snag|visit|recce/.test(l)
                ? "site"
                : /people|client|vendor|person/.test(l)
                  ? "people"
                  : /due|today|date|day|expir|next/.test(l)
                    ? "due"
                    : /receiv|due from|won|client value|billed/.test(l) && money
                      ? "invoice-in"
                      : /^cost|paid|payable|declined|withdrawn|released/.test(l) && money
                        ? "invoice-out"
                        : money
                          ? "voucher"
                          : /rate|item|stock|tile|material/.test(l)
                            ? "stock"
                            : "count";
  const hue = DISC_HUES.find(([re]) => re.test(l))?.[1] ?? "gray";
  return { hue, icon };
}

function isMoney(value: ReactNode): boolean {
  return isValidElement(value) && (value.type === Money || value.type === MoneyExact);
}

export function Stat({
  label,
  value,
  disc,
  text,
  delta,
  spark,
  note,
  next,
  mini,
  lift,
}: {
  label: string;
  value: ReactNode;
  /** Renders `value` in the text face, so a word never impersonates a figure. */
  text?: boolean;
  delta?: StatDelta;
  /** A rendered sparkline (or nothing). This component does not compute one. */
  spark?: ReactNode;
  /** A caption under the hairline. Independent of `next` — a stat may carry both. */
  note?: ReactNode;
  /** The one caution signal this component has: an amber FILL pill, never small text. */
  next?: string;
  /** The disc: computed from the label and the figure unless given; `null` for none. */
  disc?: { hue: DiscHue; icon: DuotoneName } | null;
  /** The drawer variant: tighter padding, a smaller figure and sparkline. */
  mini?: boolean;
  /** Lifts on hover, for a stat that is also a link target. */
  lift?: boolean;
}): ReactNode {
  const className = [
    "stat",
    mini === true ? "mini" : null,
    lift === true ? "lift" : null,
  ]
    .filter((c): c is string => c !== null)
    .join(" ");
  // An absent figure states why, in the caption, unless the caller wrote a
  // better one: a dash with its reason hidden in a tooltip tells nobody
  // anything, and "—" alone reads as zero.
  const caption =
    note === undefined &&
    isValidElement<{ why: string }>(value) &&
    value.type === Absent
      ? value.props.why
      : note;

  const drawn = disc === undefined ? discFor(label, isMoney(value)) : disc;
  return (
    <div className={className}>
      {drawn === null ? null : <Disc hue={drawn.hue} icon={drawn.icon} />}
      <div className="l">{label}</div>
      <div className="vbox">
        <div className={text === true ? "v txt" : "v"}>{value}</div>
      </div>
      {delta === undefined ? null : (
        <div className={deltaClassName(delta.direction)}>
          <b>
            {arrowFor(delta.direction)}
            {delta.figure}
          </b>{" "}
          {delta.period}
        </div>
      )}
      {spark === undefined ? null : spark}
      {caption === undefined && next === undefined ? null : (
        <div className="n">
          {caption}
          {next === undefined ? null : <span className="next">{next}</span>}
        </div>
      )}
    </div>
  );
}

export type StatDirection = "up" | "down" | "flat" | "watch";

export interface StatDelta {
  readonly direction: StatDirection;
  /** The comparison amount — a node so it can be `<Money>`. */
  readonly figure: ReactNode;
  readonly period: string;
}

function deltaClassName(direction: StatDirection): string {
  return direction === "flat" ? "d" : `d ${direction}`;
}

/** The arrow is text, not an icon — it has to travel with the figure through a screen reader. */
function arrowFor(direction: StatDirection): string {
  if (direction === "up") return "↑ ";
  if (direction === "down") return "↓ ";
  return "";
}

/**
 * A row of Stats sharing subgrid row tracks, so labels, figures and deltas
 * align across the row whatever wraps in any one of them. `n` picks the
 * column count the design offers (2, 3 or 4); the default matches the
 * design's own default of three.
 */
export function StatRow({
  n,
  children,
}: {
  n?: 2 | 3 | 4;
  children: ReactNode;
}): ReactNode {
  const className = n === 2 ? "stats n2" : n === 4 ? "stats n4" : "stats";
  return <div className={className}>{children}</div>;
}
