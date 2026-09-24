import type { Paise } from '@cog/contracts';
import { ZERO, fromWire, shareBasisPoints } from '@cog/money';

/**
 * A money series as a sparkline can draw it — an index, never money.
 *
 * `Sparkline` takes plain numbers and is forbidden money: it would be a second
 * place a rupee figure is formatted. So each week's figure is stated as basis
 * points of the series' own largest week, through `shareBasisPoints`, the one
 * exact division of money into a share. The shape survives; the amounts stay
 * on the wire beside it for anybody who needs the figure.
 *
 * A series whose largest week is zero is all zeros — flat, and honestly so.
 */
export function indexSeries(wires: readonly string[]): number[] {
  const values = wires.map((w) => fromWire(w));
  const peak = values.reduce<Paise>((max, v) => (v > max ? v : max), ZERO);
  if (peak === ZERO) return values.map(() => 0);
  return values.map((v) => (v < ZERO ? 0 : shareBasisPoints(v, peak)));
}
