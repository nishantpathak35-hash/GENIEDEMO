import type { CSSProperties, ReactNode } from 'react';

/**
 * The one thing on the screen — an eyebrow, one figure, one sentence, one
 * primary action, and optionally an owners row or a bar. Exactly one per
 * screen; the design's own gate asserts that in the browser, which this
 * component cannot do from inside a render, so it is documented here
 * instead: `actions` is meant to carry one `.primary` button at most.
 *
 * `watch` widens the grid to include the bar row (`.hero.watch`) whether or
 * not `bar` is actually given — a hero can be a "watch this" hero with
 * nothing but the eyebrow tone to say so, on a screen that has no bar at
 * all (`12-states-roles.html`'s site-engineer and cash-in-hand heroes are
 * exactly this). `bar` is the thing `Meter` draws conceptually — a fill, an
 * optional threshold tick, an optional run past it — rendered with the
 * hero's own `.hbar` markup rather than `<Meter>` itself, because the
 * hero's threshold mark is a solid `--ink` tick (this figure is the one
 * thing on the page) where a list Meter's is a neutral dashed rule.
 */
export function Hero({
  eyebrow,
  value,
  sentence,
  side,
  actions,
  owners,
  bar,
  watch,
  ariaLabel,
}: {
  eyebrow: ReactNode;
  value: ReactNode;
  sentence: ReactNode;
  /** The delta/sparkline stack beside the figure. */
  side?: ReactNode;
  /** One primary action at most — not enforced here, see the doc comment. */
  actions: ReactNode;
  owners?: ReadonlyArray<HeroOwner>;
  bar?: HeroBar;
  watch?: boolean;
  ariaLabel: string;
}): ReactNode {
  // A hero showing a bar needs the `.hero.watch` grid — it is the only template with a 'b' row —
  // so `bar` implies the class whether or not the caller also set `watch`.
  const isWatch = watch === true || bar !== undefined;
  return (
    <section className={isWatch ? 'hero watch' : 'hero'} aria-label={ariaLabel}>
      <span className="eyebrow">{eyebrow}</span>
      <div className="v">{value}</div>
      <p className="p">{sentence}</p>
      {side === undefined ? null : <div className="hs">{side}</div>}
      {bar === undefined ? null : <HeroBarRow bar={bar} />}
      <div className="a">{actions}</div>
      {owners === undefined ? null : (
        <div className="foot">
          {owners.map((owner) => (
            <span className="who" key={owner.name}>
              <span className="avatar">{owner.initial}</span>
              <span>
                <b>{owner.name}</b> {owner.role}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export interface HeroOwner {
  readonly initial: string;
  readonly name: string;
  readonly role: string;
}

export interface HeroBar {
  /** Fill, already computed by the server as a percentage of `of`. */
  readonly pct: number;
  readonly thresholdPct: number;
  /** The run past 100%, as a percentage on the same scale. */
  readonly overPct?: number;
  readonly left: ReactNode;
  readonly right: ReactNode;
  readonly thresholdLabel: ReactNode;
}

/**
 * The hero's own bar markup (`.hbar > i / em / b`), not `<Meter>`'s
 * `.meter` markup — see the module doc comment for why. Every width is a
 * custom property set per element, never hoisted onto `.hbar` itself: the
 * overrun band and the threshold tick both read an `--x`, and they are not
 * usually at the same position.
 */
function HeroBarRow({ bar }: { bar: HeroBar }): ReactNode {
  const fillPct = Math.min(bar.pct, 100);
  return (
    <div className="hbarwrap">
      <div className="hbar">
        <i style={{ '--w': `${fillPct}%` } as CSSProperties} />
        {bar.overPct === undefined || bar.overPct <= 0 ? null : (
          <em style={{ '--x': `${fillPct}%`, '--o': `${bar.overPct}%` } as CSSProperties} />
        )}
        <b style={{ '--x': `${bar.thresholdPct}%` } as CSSProperties} />
      </div>
      <div className="hbar-l">
        <span>{bar.left}</span>
        <span className="thr">{bar.thresholdLabel}</span>
        <span>{bar.right}</span>
      </div>
    </div>
  );
}
