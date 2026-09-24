import type { ReactNode } from 'react';
import { Empty } from '@cog/design-system';

/**
 * Documents — a fourth project tab the design names but no data model backs.
 *
 * **HUMAN(DATA-client-portal-documents):** `10-portals.html` lists a signed
 * agreement, a GFC drawing set, approved material selections and a weekly
 * progress report, each downloadable. No route under
 * `/api/v1/portal/client/*` returns anything like a document list for a
 * project, and `packages/contracts` has no shape for "a document a client may
 * see" at all. Built here as the surface the tab promises, wired to nothing,
 * because there is nothing yet to wire it to.
 */
export default function ClientDocumentsPage(): ReactNode {
  return (
    <>
      <div className="pgh">
        <h1 className="pt">Documents</h1>
      </div>

      <Empty illustration="documents" title="Documents are not shared here yet">
        The signed agreement, drawings and reports for this project still reach you the way they
        do today — this portal has no way yet to list or send them to you.
      </Empty>
    </>
  );
}
