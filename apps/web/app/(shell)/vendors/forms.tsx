'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import {
  createVendor,
  deleteVendor,
  recordTransporterDeclaration,
  setVendorTdsProfile,
  updateVendor,
} from './actions';

const GSTIN_HINT = 'Fifteen characters, e.g. 07AAAAA1111A1Z1. Checked by shape before it is sent.';
const PAN_HINT = 'Ten characters, e.g. AAAAA1111A.';

export function NewVendorForm(): ReactNode {
  return (
    <Form action={createVendor} submitLabel="Register vendor" pendingLabel="Registering…">
      <div className="row">
        <Field name="code" label="Vendor code" required />
        <Field name="name" label="Legal name" required hint="The name that goes on a purchase order." />
      </div>
      <div className="row">
        <Field name="gstin" label="GSTIN" hint={GSTIN_HINT} />
        <Field name="pan" label="PAN" hint={PAN_HINT} />
      </div>
      <div className="row">
        <Field name="email" label="Email" type="email" />
        <Field name="phone" label="Phone" />
      </div>
      <Notes name="address" label="Address" rows={2} />
    </Form>
  );
}

export interface VendorDefaults {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly gstin: string;
  readonly pan: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly version: string;
}

export function EditVendorForm({ vendor }: { vendor: VendorDefaults }): ReactNode {
  return (
    <Form
      action={updateVendor.bind(null, vendor.id)}
      submitLabel="Save vendor"
      pendingLabel="Saving…"
    >
      <input type="hidden" name="expectedVersion" defaultValue={vendor.version} />
      <div className="row">
        <Field name="code" label="Vendor code" required defaultValue={vendor.code} />
        <Field name="name" label="Legal name" required defaultValue={vendor.name} />
        <Choice
          name="status"
          label="Status"
          required
          defaultValue={vendor.status}
          options={[
            ['active', 'Active'],
            ['inactive', 'Inactive'],
          ]}
          hint="Deactivating keeps the history; deleting is refused once an order references it."
        />
      </div>
      <div className="row">
        <Field name="gstin" label="GSTIN" defaultValue={vendor.gstin} hint={GSTIN_HINT} />
        <Field name="pan" label="PAN" defaultValue={vendor.pan} hint={PAN_HINT} />
      </div>
      <div className="row">
        <Field name="email" label="Email" type="email" defaultValue={vendor.email} />
        <Field name="phone" label="Phone" defaultValue={vendor.phone} />
      </div>
      <Notes name="address" label="Address" rows={2} defaultValue={vendor.address} />
    </Form>
  );
}

export function DeleteVendorForm({ vendorId }: { vendorId: string }): ReactNode {
  return (
    <Form
      action={deleteVendor.bind(null, vendorId)}
      submitLabel="Delete this vendor"
      pendingLabel="Deleting…"
    >
      <p className="muted u-m0">
        Refused while any purchase order references this vendor. Deactivate instead — the orders
        stay attached to a name that still resolves.
      </p>
    </Form>
  );
}

/**
 * What a payment to this vendor is deducted under. The rule for which sections
 * take a kind is the server's; this draws the choices and sends what was chosen.
 */
export function VendorTdsProfileForm({
  vendorId,
  current,
}: {
  vendorId: string;
  current: { tdsSection: string; tdsPayeeClass: string; panStatus: string; constitution: string };
}): ReactNode {
  return (
    <Form
      action={setVendorTdsProfile.bind(null, vendorId)}
      submitLabel="Save tax details"
      pendingLabel="Saving…"
    >
      <div className="row">
        <Choice
          name="tdsSection"
          label="Section"
          defaultValue={current.tdsSection}
          options={[
            ['none', 'None — nothing is deducted'],
            ['194C', '194C — contractor'],
            ['194I', '194I — rent'],
            ['194J', '194J — professional or technical fees'],
            ['194Q', '194Q — purchase of goods'],
          ]}
          hint="Which section payments to this vendor are deducted under."
        />
        <Choice
          name="tdsPayeeClass"
          label="Kind — rent and fees only"
          defaultValue={current.tdsPayeeClass}
          options={[
            ['none', 'Not applicable'],
            ['plant_machinery', 'Rent — plant, machinery or equipment'],
            ['land_building', 'Rent — land, building, furniture'],
            ['technical', 'Fees — technical services'],
            ['professional', 'Fees — professional services'],
          ]}
        />
      </div>
      <div className="row">
        <Choice
          name="panStatus"
          label="PAN status"
          defaultValue={current.panStatus}
          options={[
            ['operative', 'Operative'],
            ['inoperative', 'Inoperative — treated as no PAN'],
          ]}
          hint="No PAN, or an inoperative one, is deducted at 20%, or 5% under 194Q (s.206AA, provisional)."
        />
        <Choice
          name="constitution"
          label="Constitution"
          defaultValue={current.constitution}
          options={[
            ['none', 'Not recorded'],
            ['individual', 'Individual'],
            ['huf', 'Hindu undivided family'],
            ['firm', 'Firm'],
            ['company', 'Company'],
            ['other', 'Other — a trust, a society, an AOP'],
          ]}
          hint="What the vendor is in law. Under 194C it decides 1% or 2%; the PAN only cross-checks it (provisional)."
        />
      </div>
    </Form>
  );
}

/**
 * A transporter's 194C(6) declaration for a financial year. The evidence is a
 * document already registered in the vault against this vendor; that, and the
 * rest of the rule, is the server's to check and to say back in words.
 */
export function TransporterDeclarationForm({
  vendorId,
  financialYear,
  evidence,
}: {
  vendorId: string;
  financialYear: string;
  evidence: ReadonlyArray<{ id: string; fileName: string }>;
}): ReactNode {
  return (
    <Form
      action={recordTransporterDeclaration.bind(null, vendorId)}
      submitLabel="Record declaration"
      pendingLabel="Recording…"
    >
      <div className="row">
        <Field name="financialYear" label="Financial year" defaultValue={financialYear} hint="As 2026-27." required />
        <Field name="declaredOn" label="Dated" type="date" hint="Within that financial year." required />
      </div>
      <Choice
        name="evidenceDocumentId"
        label="Evidence"
        options={evidence.map((d) => [d.id, d.fileName] as const)}
        hint="The signed declaration, registered under Documents against this vendor."
        required
      />
      <label>
        <input type="checkbox" name="goodsCarriageConfirmed" /> The declaration confirms the goods-carriage
        condition of s.194C(6)
      </label>
    </Form>
  );
}
