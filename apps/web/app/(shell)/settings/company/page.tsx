import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, PageHeader, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { CompanyProfileForm, OperationalDefaultsForm } from '../forms';

export const metadata = { title: 'Company · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Company — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Company" sub="The firm’s legal identity — name, address, PAN, the signatory." />;

/**
 * Who this organisation is.
 *
 * **This screen exists because a real GSTIN and a real PAN are compiled into
 * the previous app** — `app/po/[poNo]/page.js` and `SettingsService.ts` carry
 * them as literals. In a single-tenant app that is untidy. In a multi-tenant
 * one it prints one customer's tax registration on another customer's purchase
 * order, which is a filing somebody signs.
 */
export default async function CompanyPage(): Promise<ReactNode> {
  const caller = await apiAsCaller();
  const [profile, defaults, tenant] = await Promise.all([
    load(caller, API_ROUTES.companyProfile, {}),
    load(caller, API_ROUTES.operationalDefaults, {}),
    load(caller, API_ROUTES.tenantSettings, {}),
  ]);

  if (profile.kind === 'unreachable') return <UnreachableState />;
  if (profile.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Company">
          <Refusal error={profile.error} />
        </Section>
      </>
    );
  }

  const registered = [profile.data.gstin, profile.data.pan, profile.data.tan, profile.data.cin].filter(
    (v) => v !== null,
  ).length;

  return (
    <>
      {HEADER}
      <Section bare title="This organisation">
        <div className="card-b">
          <dl className="kv">
            <dt>Legal name</dt>
            <dd>{tenant.kind === 'ok' ? tenant.data.legalName : <span className="muted">not read</span>}</dd>
            <dt>Slug</dt>
            <dd>
              {tenant.kind === 'ok' ? <code>{tenant.data.slug}</code> : <span className="muted">not read</span>}
            </dd>
            <dt>App origin</dt>
            <dd>
              {tenant.kind !== 'ok' || tenant.data.appOrigin === null ? (
                <span className="muted">not set</span>
              ) : (
                <code>{tenant.data.appOrigin}</code>
              )}
            </dd>
          </dl>
          <p className="muted u-mb0">
            The app origin is where an invitation link points. It is per-tenant
            precisely so that no invite URL is ever a constant again — the
            legacy hardcodes one demo domain at <code>auth.js:253</code> and
            sends every tenant&rsquo;s invitations to it.
          </p>
        </div>
      </Section>

      <Section bare title="Registered details">
        <div className="card-b">
          <p className="muted">
            <Pill tone={registered === 4 ? 'ok' : 'warn'}>{registered} of 4 supplied</Pill> These
            are printed on purchase orders and on anything filed. Leave one empty and nothing is
            printed in its place — <strong>there is no placeholder</strong>. The previous system
            invents a default TAN when one is missing and writes it into generated 26Q content,
            which is the failure this refuses to repeat.
          </p>
          <CompanyProfileForm
            gstin={profile.data.gstin ?? ''}
            pan={profile.data.pan ?? ''}
            cin={profile.data.cin ?? ''}
            tan={profile.data.tan ?? ''}
            address={profile.data.address}
            phone={profile.data.phone}
            email={profile.data.email}
            website={profile.data.website}
            bankName={profile.data.bankName}
            bankBranch={profile.data.bankBranch}
            bankIfsc={profile.data.bankIfsc ?? ''}
            documentFooter={profile.data.documentFooter}
          />
        </div>
      </Section>

      <Section bare title="Operational defaults">
        <div className="card-b">
          {defaults.kind === 'ok' ? (
            <OperationalDefaultsForm
              poTerms={defaults.data.poTerms}
              crmStaleDays={defaults.data.crmStaleDays}
            />
          ) : (
            // The two reads are independent, so one failing does not take the
            // other's panel with it. A registered-details form that disappears
            // because a defaults endpoint is down is a worse screen than one
            // panel saying what happened.
            <Empty illustration="projects" title="The operational defaults could not be read">
              The registered details above are unaffected — reload to try again.
            </Empty>
          )}
        </div>
      </Section>

      <AbsentNotice title="No logo upload">
        The previous system stores a logo as a base64 string inside a settings row, capped at 2 MB,
        which puts an image into every read of the organisation&rsquo;s own details. A logo is a
        file and there is no asset store here yet, so there is no field for one rather than a field
        that works badly.
      </AbsentNotice>

      <AbsentNotice title="Bank details are printed, not used">
        Nothing in this system moves money. These appear on a document so a vendor knows where a
        payment came from; no transfer is initiated from them, and the same reasoning is why a
        vendor&rsquo;s own bank account is excluded from every vendor read.
      </AbsentNotice>
    </>
  );
}
