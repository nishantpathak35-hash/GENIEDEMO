import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { PortalBar, PortalHead, Refusal, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';
import { signOut } from '../actions/session';
import { currentCredential } from '../../lib/session';
import { PortalNav } from './portal-nav';

/**
 * The vendor portal's chrome — `docs/design/10-portals.html`, "both on the
 * quiet drawing under the same bar": the product's bar with what a portal
 * has (the mark, a search over its own screens, whose portal this is, the
 * bell, the person), then `.p-head` with the vendor's name and what the
 * screen is, `.p-body`, and the bottom `.p-nav`.
 *
 * **Narrow on purpose.** A vendor sees orders issued to them, the bills they
 * have submitted and the payments against those bills, and nothing else:
 * `/api/v1/portal/vendor/*` is the whole of what a vendor credential can
 * reach, and every internal route refuses it. In the legacy a vendor
 * authenticates into the same deployable that serves director-level P&L,
 * scoped by a `vendorId` the client passes (`VendorPortalView.js:22-27`);
 * separating the deployable is what makes that finding not apply.
 *
 * **The layout asks the API who this is, before any screen** (`portal/whoami`):
 * a staff login is refused there, and an unreachable API is said. The magic
 * link sign-in the design proposes is recorded, not built (it is proposed,
 * not settled); the portal's search is drawn and recorded the same way.
 */
export default async function SignedInLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  if ((await currentCredential()) === null) redirect('/sign-in');
  const me = await load(await apiAsCaller(), API_ROUTES.portalWhoami, {});
  const content = me.kind === 'unreachable' ? <UnreachableState /> : me.kind === 'refused' ? <Refusal error={me.error} /> : children;
  const who = me.kind === 'ok' ? me.data.name : 'Vendor';
  const firm = me.kind === 'ok' ? me.data.firm : 'Construct-O-Genie';
  const organisation = me.kind === 'ok' ? me.data.organisation : 'Vendor portal';

  return (
    <div className="portal">
      <PortalBar
        app="vendor"
        who={who}
        firm={firm}
        searchLabel="Search in Orders"
        unread={0}
        menu={
          <div className="menu-foot">
            <form action={signOut}>
              <button type="submit" className="btn sm">
                Sign out
              </button>
            </form>
          </div>
        }
      />
      <PortalHead organisation={organisation} sub={`Orders from ${firm}`} />
      <div className="p-body">{content}</div>
      <PortalNav
        links={[
          { href: '/', label: 'Orders', icon: 'inbox' },
          { href: '/bills', label: 'Bills', icon: 'bill' },
          { href: '/payments', label: 'Payments', icon: 'rupee' },
          { href: '/documents', label: 'Documents', icon: 'doc' },
        ]}
      />
    </div>
  );
}
