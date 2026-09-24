import { describe, expect, it } from 'vitest';
import type { Paise } from '@cog/contracts';
import { indexSeries } from '../src/domain/weekly-index.js';
import { agreedAgainstBoq } from '../src/domain/agreed-against-boq.js';

const p = (n: bigint): Paise => n as Paise;

describe('indexSeries', () => {
  it('states each week as basis points of the largest week', () => {
    expect(indexSeries(['0', '250000', '500000', '1000000'])).toEqual([0, 2500, 5000, 10000]);
  });

  it('is flat zeros when nothing happened', () => {
    expect(indexSeries(['0', '0', '0'])).toEqual([0, 0, 0]);
  });
});

describe('agreedAgainstBoq', () => {
  it('compares agreed rates to BOQ cost rates over the same linked lines', () => {
    const result = agreedAgainstBoq(
      [
        { boqItemId: 'a', contractedUnitRate: p(11_000n) },
        { boqItemId: 'b', contractedUnitRate: p(9_000n) },
        { boqItemId: 'c', contractedUnitRate: p(5_000n) },
      ],
      new Map<string, Paise | null>([
        ['a', p(10_000n)],
        ['b', p(10_000n)],
        ['c', null],
      ]),
    );
    // (11,000 + 9,000) / (10,000 + 10,000) = 100.00%; line c's BOQ has no cost rate.
    expect(result).toEqual({ linkedLines: 3, comparedLines: 2, unpricedBoqLines: 1, agreedBpOfBoqCost: 10000 });
  });

  it('says nothing compares rather than inventing a figure', () => {
    expect(agreedAgainstBoq([], new Map()).agreedBpOfBoqCost).toBeNull();
    expect(
      agreedAgainstBoq([{ boqItemId: 'x', contractedUnitRate: p(1n) }], new Map([['x', null]])).agreedBpOfBoqCost,
    ).toBeNull();
  });
});
