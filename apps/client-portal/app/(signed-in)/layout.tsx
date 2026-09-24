import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { PortalBar, Refusal, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';
import { signOut } from '../actions/session';
import { currentCredential } from '../../lib/session';

/**
 * The client portal's chrome — `docs/design/10-portals.html`, "both on the
 * quiet drawing under the same bar": the product's bar with what a portal
 * has (the mark, a search over its own screens, whose portal this is, the
 * bell, the person), then a project's own `.p-head` with its tabs where the
 * screen is inside one. A client sees their projects' progress, variations,
 * documents and billing: `/api/v1/portal/client/*` is the whole of what a
 * client credential can reach. The layout asks the API who this is first
 * (`portal/whoami`); the magic-link sign-in the design proposes is recorded,
 * not built.
 */
export default async function SignedInLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  if ((await currentCredential()) === null) redirect('/sign-in');
  const me = await load(await apiAsCaller(), API_ROUTES.portalWhoami, {});
  const content = me.kind === 'unreachable' ? <UnreachableState /> : me.kind === 'refused' ? <Refusal error={me.error} /> : children;
  const who = me.kind === 'ok' ? me.data.name : 'Client';
  const firm = me.kind === 'ok' ? me.data.firm : 'Construct-O-Genie';

  return (
    <div className="portal">
      <PortalBar
        app="client"
        who={who}
        firm={firm}
        searchLabel="Search in your projects"
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
      {content}
    </div>
  );
}
