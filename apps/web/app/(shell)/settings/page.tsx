import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { Disc, PageHeader, Pill, UnreachableState, load, type DiscHue, type DuotoneName } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { terms } from '../../../lib/terms';

export const metadata = { title: 'Settings · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Settings — the hub the gear opens (`docs/design/11-settings.html`): every
 * page as a card, grouped the way the design groups them, one line each,
 * and each card wearing its group's tinted disc with the group's duotone.
 * Fourteen pages: the firm's, and the one that is yours.
 *
 * **Every card is drawn.** The server refuses what it refuses and the page
 * says why; a card that vanished because a browser derived a role would be
 * the legacy's `isSuperAdmin(user?.email) || roles.includes('director')`
 * (`SettingsView.js:141`) again. Platform tools are not here — provisioning,
 * impersonation, flags are `apps/admin`, behind a platform principal.
 */
interface HubPage {
  readonly name: string;
  readonly href: string;
  readonly what: string;
  readonly mark?: 'new';
}
interface HubGroup {
  readonly name: string;
  readonly hue: DiscHue;
  readonly icon: DuotoneName;
  readonly pages: readonly HubPage[];
}

function groups(t: { vendorAccess: string; boq: string; vendorsLower: string }): readonly HubGroup[] {
  return [
    {
      name: 'The firm',
      hue: 'blue',
      icon: 'firm',
      pages: [
        { name: 'Company', href: '/settings/company', what: 'The firm’s legal identity — name, address, PAN, the signatory.' },
        { name: 'Tax', href: '/settings/tax', what: 'GSTIN, TAN and the two-minute review of the rates that apply.' },
        { name: 'Numbering', href: '/settings/number-series', what: 'One gapless series per document — orders, bills, vouchers, invoices.' },
        { name: 'Modules', href: '/settings/modules', what: 'What the firm has switched on.' },
        { name: 'Trade packages', href: '/settings/trade-packages', what: `The trades the ${t.boq}, rates and ${t.vendorsLower} are grouped by.` },
        { name: 'Terminology', href: '/settings/terminology', what: 'BOQ or Estimate, Variation or Change order — the words every label uses.', mark: 'new' },
      ],
    },
    {
      name: 'People and access',
      hue: 'purple',
      icon: 'people',
      pages: [
        { name: 'People', href: '/settings/people', what: 'Everyone in the firm; a project’s people are its Team tab.' },
        { name: 'Roles', href: '/settings/roles', what: 'What each role may do, firm-wide.' },
        { name: t.vendorAccess, href: '/settings/vendor-access', what: `Who outside the firm can sign in as a ${t.vendorsLower.replace(/s$/, '')}.` },
        { name: 'Client access', href: '/settings/client-access', what: 'Which clients may open which projects.' },
      ],
    },
    {
      name: 'How work moves',
      hue: 'teal',
      icon: 'flow',
      pages: [
        { name: 'Approval steps', href: '/settings/approvals', what: 'One chain of steps for the firm’s orders.' },
        { name: 'Stock locations', href: '/settings/inventory', what: 'The stores — a site’s or the firm’s.' },
      ],
    },
    { name: 'The record', hue: 'gray', icon: 'record', pages: [{ name: 'Activity log', href: '/settings/audit', what: 'Every change, by whom, when.' }] },
    { name: 'Yours', hue: 'green', icon: 'yours', pages: [{ name: 'Keyboard', href: '/preferences', what: 'Single-key shortcuts, on by default and yours to turn off.' }] },
  ];
}

export default async function SettingsPage(): Promise<ReactNode> {
  const [tenant, t] = await Promise.all([load(await apiAsCaller(), API_ROUTES.tenantSettings, {}), terms()]);
  // the cards are a catalogue, but every one of them opens a read: with the API away the hub says so
  // rather than drawing fourteen doors that would each say it a click later (12-states-roles)
  if (tenant.kind === 'unreachable') return <UnreachableState />;
  const all = groups(t);
  const total = all.reduce((n, g) => n + g.pages.length, 0);
  return (
    <>
      <PageHeader
        title="Settings"
        sub={`${String(total)} pages — the firm’s, and yours · opened from the gear${tenant.kind === 'ok' ? ` · ${tenant.data.legalName}` : ''}`}
      />
      <div data-hero>
        {all.map((g) => (
          <section className="hub-group" aria-label={g.name} key={g.name}>
            <h2 className="hub-h">
              {g.name}
              <span className="badge">{g.pages.length}</span>
            </h2>
            <div className="hub-grid">
              {g.pages.map((p) => (
                <Link className="hub-card" href={p.href} key={p.href}>
                  <Disc hue={g.hue} icon={g.icon} />
                  <span className="hub-body">
                    <b>
                      {p.name}
                      {p.mark === 'new' ? <Pill tone="active">new</Pill> : null}
                    </b>
                    <small>{p.what}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
