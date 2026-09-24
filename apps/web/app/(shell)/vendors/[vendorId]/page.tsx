import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { columnsIn, terms } from '../../../../lib/terms';
import { Notice, PageHeader, Pill, Section, answer, load } from '@cog/design-system';
import { DeleteVendorForm, EditVendorForm, TransporterDeclarationForm, VendorTdsProfileForm } from '../forms';

export const dynamic = 'force-dynamic';

/**
 * One vendor — `docs/design/07-buying.html`, Buying › Vendors, the record:
 * the header with the vendor's facts, then what the firm holds about them.
 */
export default async function VendorPage({ params }: { params: Promise<{ vendorId: string }> }): Promise<ReactNode> {
  const { vendorId } = await params;
  const client = await apiAsCaller();
  const t = await terms();
  const vendor = await load(client, API_ROUTES.getVendor, { params: { vendorId } });

  if (vendor.kind !== 'ok') return answer(vendor, { what: 'This vendor', backHref: '/vendors', backLabel: `Back to ${t.vendors}` });

  const v = vendor.data;
  const declarations = await load(client, API_ROUTES.listTransporterDeclarations, { params: { vendorId } });

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/purchase-orders', label: 'Buying' },
          { href: '/vendors', label: t.vendors },
        ]}
        title={v.name}
        status={<Pill tone={v.status === 'active' ? 'ok' : 'idle'}>{v.status === 'active' ? 'Active' : 'Inactive'}</Pill>}
        facts={[
          ['Code', <span key="c" className="nowrap">{v.code}</span>],
          ['GSTIN', v.gstin === null ? <span key="g" className="muted">Not on file</span> : <span key="g" className="nowrap">{v.gstin}</span>],
          ['PAN', v.pan === null ? <span key="p" className="muted">Not on file</span> : <span key="p" className="nowrap">{v.pan}</span>],
          ['Deducted under', v.tdsSection === null ? <span key="t" className="muted">Not set</span> : v.tdsSection],
        ]}
      />

      <Section title="Details">
        <div>
          {/* Editing a vendor has never worked in the legacy: VEND-01, the
              fourth instance of a write naming a column no migration creates. */}
          <EditVendorForm
            vendor={{
              id: v.id,
              code: v.code,
              name: v.name,
              status: v.status,
              gstin: v.gstin ?? '',
              pan: v.pan ?? '',
              email: v.email ?? '',
              phone: v.phone ?? '',
              address: v.address ?? '',
              version: String(v.version),
            }}
          />
        </div>
      </Section>

      <Section title="Tax deducted at source" sub="rates are provisional — Settings › Tax">
        <div>
          {v.constitutionMismatch ? (
            <Notice tone="warn" title="The PAN reads differently">
              The PAN&rsquo;s fourth character reads as {CONSTITUTION_LABELS[v.constitutionFromPan ?? 'other']}, and
              the vendor is recorded as {CONSTITUTION_LABELS[v.constitution ?? 'other']}. The recorded constitution
              decides the 194C rate — check which is right.
            </Notice>
          ) : null}
          <VendorTdsProfileForm
            vendorId={v.id}
            current={{
              tdsSection: v.tdsSection ?? 'none',
              tdsPayeeClass: v.tdsPayeeClass ?? 'none',
              panStatus: v.panInoperative ? 'inoperative' : 'operative',
              constitution: v.constitution ?? 'none',
            }}
          />
        </div>
      </Section>

      <Section title="194C(6) transporter declarations" sub="one a financial year, with its evidence — provisional">
        <div>
          {declarations.kind !== 'ok' ? (
            <p className="muted">The declarations could not be read.</p>
          ) : (
            <>
              <p className="showing">
                {declarations.data.count} declaration{declarations.data.count === 1 ? '' : 's'} on record
              </p>
              {declarations.data.count === 0 ? null : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Year</th>
                      <th scope="col">Dated</th>
                      <th scope="col">PAN</th>
                      <th scope="col">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declarations.data.items.map((d) => (
                      <tr key={d.id}>
                        <td>{d.financialYear}</td>
                        <td>{d.declaredOn}</td>
                        <td>{d.pan}</td>
                        <td>{d.evidenceFileName ?? 'no longer in the vault'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {v.tdsSection !== '194C' ? (
                <p className="muted">A declaration applies only to a vendor deducted under 194C.</p>
              ) : declarations.data.evidence.length === 0 ? (
                <p className="muted">
                  Register the signed declaration under <Link href="/documents">Documents</Link>, in the folder
                  vendor with this vendor&rsquo;s id, {v.id}, and it can be recorded here.
                </p>
              ) : (
                <TransporterDeclarationForm
                  vendorId={v.id}
                  financialYear={declarations.data.currentFinancialYear}
                  evidence={declarations.data.evidence}
                />
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Remove">
        <DeleteVendorForm vendorId={v.id} />
      </Section>
    </>
  );
}

const CONSTITUTION_LABELS: Record<string, string> = {
  individual: 'an individual',
  huf: 'a Hindu undivided family',
  firm: 'a firm',
  company: 'a company',
  other: 'something other than an individual, an HUF, a firm or a company',
};
