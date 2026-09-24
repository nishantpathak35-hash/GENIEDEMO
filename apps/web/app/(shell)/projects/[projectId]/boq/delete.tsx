'use client';

import type { ReactNode } from 'react';
import { deleteBoqLine } from './actions';

/**
 * Remove one line.
 *
 * A form rather than an `onClick`, so it is a POST the server authorises rather
 * than a fetch the browser decides to make. The endpoint answers 404 when the
 * line is not visible — `deleteBOQItem` (`boq.js:339`) returns `{ ok: true }`
 * whatever happened, so deleting nothing and deleting another tenant's line
 * were indistinguishable to the caller.
 */
export function DeleteLineButton({
  projectId,
  itemId,
}: {
  projectId: string;
  itemId: string;
}): ReactNode {
  return (
    <form action={deleteBoqLine.bind(null, projectId, itemId)} className="inline">
      <button type="submit" className="btn ghost sm">
        Delete
      </button>
    </form>
  );
}
