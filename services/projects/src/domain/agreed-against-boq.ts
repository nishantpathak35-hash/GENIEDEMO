import type { Paise } from '@cog/contracts';
import { ZERO, shareBasisPoints, sum } from '@cog/money';

/**
 * Agreed rates against the BOQ — what the vendor's rate contract says we pay,
 * against what the BOQ budgeted the same work to cost.
 *
 * **The key is an id, not a description.** An order line raised from the BOQ
 * carries `boq_item_id` (procurement 0031), and a line priced under a rate
 * contract carries `contracted_unit_rate` (0081). A line with both is the
 * comparison; nothing is matched by text, which is the legacy's `LIKE`
 * identity defect.
 *
 * Measured over the lines whose BOQ line has a cost rate; lines whose BOQ line
 * has none are counted, never costed at zero. The answer is the agreed total
 * as basis points of the BOQ cost total over the SAME lines — above 10000
 * means vendors were agreed above budget. `null` when nothing compares.
 */
export interface AgreedAgainstBoq {
  readonly linkedLines: number;
  readonly comparedLines: number;
  readonly unpricedBoqLines: number;
  readonly agreedBpOfBoqCost: number | null;
}

export function agreedAgainstBoq(
  linked: ReadonlyArray<{ readonly boqItemId: string; readonly contractedUnitRate: Paise }>,
  boqCostRates: ReadonlyMap<string, Paise | null>,
): AgreedAgainstBoq {
  const compared = linked.filter((l) => {
    const cost = boqCostRates.get(l.boqItemId);
    return cost !== undefined && cost !== null;
  });
  const unpriced = linked.length - compared.length;
  if (compared.length === 0) {
    return { linkedLines: linked.length, comparedLines: 0, unpricedBoqLines: unpriced, agreedBpOfBoqCost: null };
  }
  const agreed = sum(compared.map((l) => l.contractedUnitRate));
  const budget = sum(compared.map((l) => boqCostRates.get(l.boqItemId) ?? ZERO));
  return {
    linkedLines: linked.length,
    comparedLines: compared.length,
    unpricedBoqLines: unpriced,
    agreedBpOfBoqCost: budget === ZERO ? null : shareBasisPoints(agreed, budget),
  };
}
