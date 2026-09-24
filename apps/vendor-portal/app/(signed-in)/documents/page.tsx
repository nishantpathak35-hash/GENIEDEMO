import type { ReactNode } from 'react';
import { Empty } from '@cog/design-system';

export const metadata = { title: 'Documents · Vendor portal' };

/**
 * Documents — a fourth portal tab the design names but no data model backs.
 *
 * **HUMAN(DATA-vendor-portal-documents):** there is no route under
 * `/api/v1/portal/vendor/*` that returns a document list for a vendor —
 * `10-portals.html`'s bottom nav shows the tab, but nothing in
 * `packages/contracts` describes what a vendor-visible document even is (a
 * signed PO copy? a GST certificate the tenant uploaded?). Built here as the
 * surface the nav promises, wired to nothing, because there is nothing yet to
 * wire it to.
 */
export default function VendorDocumentsPage(): ReactNode {
  return (
    <>
      <div className="pgh">
        <h1 className="pt">Documents</h1>
        <p className="ps">what your contact has shared with you</p>
      </div>

      <Empty illustration="documents" title="Documents are not shared here yet">
        This portal has no way yet to list or download documents for you — a signed order copy,
        a certificate, anything else your contact sends you still comes the way it does today.
      </Empty>
    </>
  );
}
