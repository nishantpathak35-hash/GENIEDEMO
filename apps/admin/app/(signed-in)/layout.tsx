import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PortalBar } from '@cog/design-system';
import { signOut } from '../actions/session';
import { currentCredential } from '../../lib/session';

/**
 * The back office — the operator console (`docs/design/11-settings.html`,
 * "Operator console"): the same dark bar as the product, with what the
 * operator has and nothing more — the mark, whose console this is, the
 * person; no search, no bell, no switcher, no gear. It is ours and never
 * pitched.
 *
 * A platform account belongs to no tenant. Everything reachable from here is on
 * `/platform/v1`, which is mounted outside `tenantMiddleware` — so this console
 * cannot read a tenant's data even by accident, because the mechanism that
 * would let it (a tenant id on the connection) is never set.
 */
export default async function SignedInLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const credential = await currentCredential();
  if (credential === null) redirect('/sign-in');

  return (
    <div className="portal">
      <PortalBar
        app="operator"
        who={credential}
        firm="Operator console"
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
      <main className="p-body" id="content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
