import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { GrantVendorForm, RevokeVendorButton } from '../forms';
import { pageLinks, pageState } from '../../../../lib/paging';

export const metadata = { title: 'Vendor access · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Vendor access — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Vendor access" sub="Who outside the firm can sign in as a vendor." />;

/**
 * What each vendor login can see.
 *
 * The exact counterpart of Client access, on the same table, and it did not
 * exist until now. That gap was not cosmetic: `services/host` could mint a
 * vendor LOGIN through the invite path, and then nothing in the product could
 * attach that login to a vendor. The only writer of a
 * <code>subject_kind = &lsquo;vendor&rsquo;</code> link was the demo seed,
 * issuing SQL directly, with a comment at the call site saying no route
 * existed. Onboarding a supplier therefore ended at a database console.
 *
 * **This list is the one that is enforced.** A vendor credential is narrowed to
 * the suppliers linked to it and every portal route answers not-found for
 * anything else — the same rows, read by the same table. There is no second
 * list here that a screen shows and nothing checks.
 *
 * As on the client side, revoking is the half that matters. Granting is a
 * convenience; taking a supplier away is what somebody reaches for when a
 * contract ends, and it takes effect on that login&rsquo;s next request.
 */
export default async function VendorAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const caller = await apiAsCaller();
  const [accounts, vendors] = await Promise.all([
    load(caller, API_ROUTES.vendorAccounts, { query: paging.query }),
    // a lookup: the widest window the endpoint allows
    load(caller, API_ROUTES.listVendors, { query: { limit: '200' } }),
  ]);

  if (accounts.kind === 'unreachable') return <UnreachableState />;
  if (accounts.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Vendor access">
          <Refusal error={accounts.error} />
        </Section>
      </>
    );
  }

  // Name and code together: two suppliers can trade under near-identical names,
  // and the code is what tells them apart on a screen. The id is still what
  // the form submits — the label is for the reader.
  const options =
    vendors.kind === 'ok'
      ? vendors.data.items.map((v) => ({ id: v.id, name: `${v.name} · ${v.code}` }))
      : [];

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/settings/vendor-access' : `/settings/vendor-access?${qs}`;
  }
  const links = pageLinks(paging, accounts.data, hrefFor);

  return (
    <>
      {HEADER}
      <Section bare title={`Vendor logins — ${accounts.data.count}`}>
        <div className="card-b">
          {accounts.data.count === 0 ? (
            <Empty illustration="projects" title="No vendor logins">
              A vendor account is a principal of kind <code>vendor</code>, and there is no create
              button here on purpose — see below.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Login · State · Represents · Give access to — identity
                    never drops; active/disabled is the decision column;
                    what the login can already see and the grant control are
                    reference and drop first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Login</th>
                      <th data-p="2">State</th>
                      <th data-p="3">Represents</th>
                      <th data-p="4">Give access to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.data.items.map((account) => (
                      <tr key={account.id}>
                        <td data-p="1">{account.email}</td>
                        <td data-p="2">
                          <Pill tone={account.disabled ? 'bad' : 'ok'}>
                            {account.disabled ? 'Disabled' : 'Active'}
                          </Pill>
                        </td>
                        <td data-p="3" data-label="Represents">
                          {account.vendors.length === 0 ? (
                            <span className="muted">Nothing — a login scoped to no vendor</span>
                          ) : (
                            account.vendors.map((vendor) => (
                              <div key={vendor.id}>
                                {vendor.name}{' '}
                                <RevokeVendorButton
                                  principalId={account.id}
                                  vendorId={vendor.id}
                                  vendorName={vendor.name}
                                />
                              </div>
                            ))
                          )}
                        </td>
                        <td data-p="4" data-label="Give access to">
                          <GrantVendorForm principalId={account.id} vendors={options} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={links.shown}
                of={accounts.data.count}
                unit={accounts.data.count === 1 ? 'vendor login' : 'vendor logins'}
                next={links.next}
                prev={links.prev}
              />
            </>
          )}
        </div>
      </Section>

      <AbsentNotice title="No password is generated here, and none is shown">
        A vendor login is created by inviting one on Settings. The invitation records that it is a{' '}
        <em>vendor</em> invitation, and that kind is read back from the stored row when the link is
        redeemed — so whoever accepts it cannot accept it as staff. This surface then decides which
        suppliers that login represents: a new vendor login is scoped to nothing until one is
        granted above.
      </AbsentNotice>

      <AbsentNotice title="A link to a vendor that no longer exists shows its id">
        It is not quietly dropped. A row that vanishes from an access list looks like access that
        was revoked, and it was not.
      </AbsentNotice>
    </>
  );
}
