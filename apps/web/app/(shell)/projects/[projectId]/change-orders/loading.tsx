import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/**
 * The variation cards are not a table, so this is a best-effort stand-in
 * rather than the literal loading shape — there is no card-skeleton in the
 * kit (`packages/design-system` is off limits to this stage). Three columns
 * approximate what a card carries: the number and title, the state, the
 * amount.
 */
export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[{ label: 'Variation' }, { label: 'State' }, { label: 'Amount', numeric: true }]}
    />
  );
}
