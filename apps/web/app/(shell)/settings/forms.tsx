'use client';

import { formatBasisPoints, formatRupeesOrEmpty } from '@cog/money';

import type { ReactNode } from 'react';
import { ACTIONS, MODULES } from '@cog/contracts';
import { Choice, Field, Form, Notes, Picker, Pill } from '@cog/design-system';
import {
  addRole,
  createInvite,
  recordTaxRate,
  saveChain,
  saveRoleGrants,
  saveNumberSeries,
  saveTradePackage,
  addTradePackage,
  saveCompanyProfile,
  saveOperationalDefaults,
  grantClientProject,
  revokeClientProject,
  grantVendor,
  revokeVendor,
  setModule,
  saveTaxSetup,
  completeTaxReview,
  loadStatutoryValues,
} from './actions';

export function InviteForm(): ReactNode {
  return (
    <Form action={createInvite} submitLabel="Send invitation" pendingLabel="Minting…">
      <Field
        name="email"
        label="Email address"
        type="email"
        required
        hint="The invitation link is shown once and cannot be retrieved afterwards — only its hash is stored."
      />
      <Field
        name="displayName"
        label="Name"
        hint="What colleagues call this person. It is what the Today screen and the approvals queue show; leave it blank and the address is shown instead."
      />
      <Choice
        name="kind"
        label="What kind of login is this"
        defaultValue="staff"
        options={[
          ['staff', 'Staff — the internal application'],
          ['client', 'Client — the client portal, one project at a time'],
          ['vendor', 'Vendor — the vendor portal, its own orders'],
        ]}
        hint="This decides which application the login may reach at all, and it cannot be changed by whoever accepts the invitation."
      />
      <p className="hint u-m0">
        Staff roles are granted after the invitation is accepted, on the Roles tab. A client or
        vendor login holds no role: what it may see comes from the project or vendor it is linked
        to, on Client access.
      </p>
    </Form>
  );
}

/**
 * One role's permissions, as two grids of checkboxes.
 *
 * **Modules and named permissions are shown separately, and that separation is
 * the point.** The legacy stores both in a single flat array, and the
 * consequence is that only the first kind is ever enforced — a method resolves
 * to a module, never to an action, so `approve_po` is granted on a screen and
 * checked almost nowhere. Here "may reach the purchase-orders screen" and "may
 * approve a purchase order" are different questions with different answers.
 *
 * Every box is rendered whether or not the viewer may save. A hidden control is
 * not an access control — the URL still resolves — so the server refuses and
 * says why.
 */
export function RoleGrantsForm({
  roleKey,
  label,
  status,
  modules,
  actions,
}: {
  roleKey: string;
  label: string;
  status: 'provisional' | 'confirmed';
  modules: readonly string[];
  actions: readonly string[];
}): ReactNode {
  const groups = [...new Set(MODULES.map((m) => m.group))];

  return (
    <Form action={saveRoleGrants} submitLabel={`Save ${label}`} pendingLabel="Saving…">
      <input type="hidden" name="roleKey" value={roleKey} />

      <div className="field">
        <label>
          Screens {label} may reach{' '}
          <Pill tone={status === 'confirmed' ? 'ok' : 'warn'}>
            {status === 'confirmed' ? 'Confirmed' : 'Provisional'}
          </Pill>
        </label>
        {groups.map((group) => (
          <fieldset key={group} className="checks">
            <legend>{group}</legend>
            {MODULES.filter((m) => m.group === group).map((module) => (
              <label key={module.key} className="check">
                <input
                  type="checkbox"
                  name="module"
                  value={module.key}
                  defaultChecked={modules.includes(module.key)}
                />
                <span>{module.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="field">
        <label>What {label} may do</label>
        <fieldset className="checks">
          <legend>Named permissions</legend>
          {ACTIONS.map((action) => (
            <label key={action.key} className="check">
              <input
                type="checkbox"
                name="action"
                value={action.key}
                defaultChecked={actions.includes(action.key)}
              />
              <span>{action.label}</span>
            </label>
          ))}
        </fieldset>
        <span className="hint">
          Approving is a named permission, not something a role gets for being senior. Neither
          Administrator nor Director is exempt from an approval stage — the legacy exempts both,
          which turns a three-stage chain into a formality.
        </span>
      </div>
    </Form>
  );
}

export function AddRoleForm(): ReactNode {
  return (
    <Form action={addRole} submitLabel="Add role" pendingLabel="Adding…">
      <Field
        name="key"
        label="Key"
        required
        placeholder="qs"
        hint="Lowercase letters, digits and underscores. This is the string an approval stage names."
      />
      <Field name="label" label="Name" required placeholder="Quantity surveyor" />
      <p className="hint u-m0">
        A new role starts with no permissions at all. That is the safe direction: nobody gains
        anything by the role existing.
      </p>
    </Form>
  );
}

/**
 * An approval chain, as an ordered list of stages.
 *
 * Three spare rows are always rendered so a stage can be added without a
 * button; an untouched spare row is dropped rather than rejected. The sequence
 * is assigned by position, so reordering means retyping rather than fighting a
 * number field.
 */
export function ChainForm({
  entityType,
  name,
  stages,
  roles,
}: {
  entityType: string;
  name: string;
  stages: ReadonlyArray<{
    name: string;
    approverRole: string;
    minApprovals: number;
    /** Paise as a wire string, or `null` for no limit. Every seeded stage is null. */
    approvalCeilingPaise?: string | null;
  }>;
  roles: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  const rows = [...stages, ...Array.from({ length: 3 }, () => null)];

  return (
    <Form action={saveChain} submitLabel="Save chain" pendingLabel="Saving…">
      <input type="hidden" name="entityType" value={entityType} />
      <Field name="name" label="Chain name" required defaultValue={name} />

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Stage</th>
              <th>Approver role</th>
              <th>Approvers needed</th>
              <th>Signs alone up to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((stage, index) => (
              // Keyed by position deliberately: the position IS the stage's
              // identity here — sequence is assigned by order, and a spare row
              // has no id to key on.
              <tr key={`${entityType}-${index}`}>
                <td className="muted">{index + 1}</td>
                <td>
                  <input
                    name="stageName"
                    defaultValue={stage?.name ?? ''}
                    placeholder={stage === null ? 'Add a stage…' : ''}
                  />
                </td>
                <td>
                  <select name="stageRole" defaultValue={stage?.approverRole ?? ''}>
                    <option value="">Anyone signed in</option>
                    {roles.map(([value, roleLabel]) => (
                      <option key={value} value={value}>
                        {roleLabel}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    name="stageQuorum"
                    inputMode="numeric"
                    defaultValue={String(stage?.minApprovals ?? 1)}
                  />
                </td>
                <td>
                  {/*
                    Empty means NO LIMIT, and every stage ships empty.

                    Deliberately not pre-filled with a plausible figure. A
                    ceiling nobody agreed to, sitting in the box looking
                    settled, is the failure this field is shaped to avoid —
                    within a month it would be indistinguishable from a number
                    the company chose (PO-13d).

                    Rupees in, paise stored. The conversion is in the server
                    action, not here: an app does no arithmetic on money.
                  */}
                  <input
                    name="stageCeiling"
                    inputMode="numeric"
                    placeholder="No limit"
                    // RUPEES, no symbol — a field shows an undecorated
                    // number, because the label beside it says rupees.
                    //
                    // This was a SAVE-BLOCKING BUG until the parser learned to
                    // strip a pasted `₹`: prefilling with `formatIndianRupees`
                    // meant a chain that had a ceiling set could not be saved
                    // again. No seeded stage has one, which is why nothing
                    // caught it — seeding a value band is the user's call.
                    defaultValue={formatRupeesOrEmpty(stage?.approvalCeilingPaise)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint u-m0">
        Every field here is evaluated. Asking for two approvers gets two distinct people, and a
        stage with a role named refuses everybody else. The legacy declares nine stage fields and
        reads one, so configuring &ldquo;two approvers required&rdquo; there silently yields one.
      </p>
      <p className="hint u-m0">
        <strong>Signs alone up to</strong> is blank everywhere, and blank means no limit. Above the
        figure you set, that stage&rsquo;s approval still counts but the request moves to the next
        stage instead of completing — and if there is no next stage it is refused, because then the
        chain names nobody who may authorise the amount. Nothing here was filled in for you: the
        numbers are yours, and a plausible-looking default would read as agreed within a month.
      </p>
    </Form>
  );
}

/**
 * Recording a tax rate.
 *
 * Basis points, entered as basis points. A percentage field would need the
 * browser to multiply by 100, and an app never does arithmetic on a figure that
 * ends up on a statutory return.
 */
/** The three questions about the business — answers, not rates. */
export function TaxSetupForm({
  current,
}: {
  current: {
    worksContractBundling: boolean | null;
    transporterPanDeclared: boolean | null;
    buyerTurnoverOver10Crore: boolean | null;
  };
}): ReactNode {
  const asChoice = (value: boolean | null): string | undefined =>
    value === null ? undefined : value ? 'yes' : 'no';
  const bundling = asChoice(current.worksContractBundling);
  const transporter = asChoice(current.transporterPanDeclared);
  const turnover = asChoice(current.buyerTurnoverOver10Crore);
  return (
    <Form action={saveTaxSetup} submitLabel="Record the answers" pendingLabel="Recording…">
      <Choice
        name="worksContractBundling"
        label="Do your contracts bundle materials and labour under one contract?"
        required
        options={[
          ['yes', 'Yes — one contract covers supply and installation'],
          ['no', 'No — materials and labour are contracted separately'],
        ]}
        {...(bundling === undefined ? {} : { defaultValue: bundling })}
        hint="A works contract is taxed as one supply. Which rule that brings in is your tax adviser's answer, recorded on the statutory side — this only records yours."
      />
      <Choice
        name="transporterPanDeclared"
        label="Do you pay transporters who have given you a PAN declaration?"
        required
        options={[
          ['yes', 'Yes — declarations are on file'],
          ['no', 'No'],
        ]}
        {...(transporter === undefined ? {} : { defaultValue: transporter })}
        hint="The declaration changes what is deducted at source from a transporter. Whether and how much is the adviser's to confirm; this records that you hold them."
      />
      <Choice
        name="buyerTurnoverOver10Crore"
        label="Was your turnover last financial year above ten crore rupees?"
        options={[
          ['yes', 'Yes — above ten crore'],
          ['no', 'No'],
        ]}
        {...(turnover === undefined ? {} : { defaultValue: turnover })}
        hint="Tax on purchases of goods (194Q) is deducted only by a buyer above that turnover. Unanswered, nothing is deducted under 194Q."
      />
    </Form>
  );
}

export function CompleteTaxReviewForm(): ReactNode {
  return (
    <Form action={completeTaxReview} submitLabel="Mark the review complete" pendingLabel="Marking…">
      <p className="hint u-m0">
        Records that you have read this screen with the answers above. The rates stay provisional
        until a chartered accountant&rsquo;s details promote them.
      </p>
    </Form>
  );
}

/** Loading the provisional statutory values — idempotent, and never verified. */
export function LoadStatutoryValuesForm(): ReactNode {
  return (
    <Form
      action={loadStatutoryValues}
      submitLabel="Load the provisional values"
      pendingLabel="Loading…"
    >
      <p className="hint u-m0">
        Adds the rates and thresholds this organisation does not have yet, each marked provisional
        with where it came from. Nothing already here is changed.
      </p>
    </Form>
  );
}

export function TaxRateForm(): ReactNode {
  return (
    <Form action={recordTaxRate} submitLabel="Record as provisional" pendingLabel="Recording…">
      <Field name="key" label="Key" required placeholder="tds_194c" />
      <Field
        name="payeeClass"
        label="Payee class"
        placeholder="individual_huf"
        hint="Optional. Section 194C carries different rates by payee class."
      />
      <Field
        name="rateBp"
        label="Rate, in basis points"
        required
        placeholder="100"
        hint="1 basis point is 0.01%. So 0.1% is 10, 2% is 200, 18% is 1800. Entered exactly, never converted here."
      />
      <Field
        name="effectiveFrom"
        label="Effective from"
        type="date"
        required
        hint="Required, with no default. A voucher raised in one financial year must compute under that year's rules forever."
      />
      <p className="hint u-m0">
        Whatever is entered is stored as <strong>provisional</strong>. With drafts switched on, payments
        and invoices compute with it and say so; otherwise they are refused until a chartered
        accountant&rsquo;s details promote it. That is not something this screen can do.
      </p>
    </Form>
  );
}

/**
 * Switch one optional module on or off.
 *
 * One form per module rather than a grid with a single save, because these are
 * eleven separate decisions and a single "Save all" invites the sweep — tick
 * everything, save, and now eleven screens are in the navigation and nobody
 * chose any of them.
 *
 * The button says what will HAPPEN, not what is true now. "On/Off" is already
 * stated by the pill beside it, and a control labelled with its current state
 * is the oldest ambiguity in settings screens.
 */
export function ModuleToggle({
  moduleKey,
  title,
  enabled,
}: {
  moduleKey: string;
  title: string;
  enabled: boolean;
}): ReactNode {
  return (
    <Form
      action={setModule}
      submitLabel={enabled ? `Turn off ${title}` : `Turn on ${title}`}
      pendingLabel="Saving…"
    >
      <input type="hidden" name="key" value={moduleKey} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
    </Form>
  );
}

/**
 * The format of one document series.
 *
 * **There is no field for the counter, and that absence is the feature.** The
 * legacy tab renders `current_number` as an input; lowering it re-issues a
 * number already printed on an order somebody sent to a vendor.
 *
 * `resetEachFy` is offered only alongside `includeFy` because the server and
 * the database both refuse the combination — restarting a counter without
 * the year in the number issues the same string twice. The hint says so rather
 * than the control being hidden: a disabled checkbox teaches nobody why.
 */
export function NumberSeriesForm({
  moduleType,
  prefix,
  separator,
  padding,
  includeFy,
  fyFormat,
  resetEachFy,
  startingNumber,
}: {
  moduleType: string;
  prefix: string;
  separator: string;
  padding: number;
  includeFy: boolean;
  fyFormat: string;
  resetEachFy: boolean;
  startingNumber: number;
}): ReactNode {
  return (
    <Form action={saveNumberSeries} submitLabel="Save this format" pendingLabel="Saving…">
      <input type="hidden" name="moduleType" value={moduleType} />
      <Field name="prefix" label="Prefix" required defaultValue={prefix} hint="PO, WO, INV." />
      <Field
        name="separator"
        label="Separator"
        defaultValue={separator}
        hint="Between the parts. A hyphen gives PO-0001, a slash gives PO/0001."
      />
      <Field
        name="padding"
        label="Digits"
        type="number"
        required
        defaultValue={String(padding)}
        hint="A minimum, not a limit. Four digits gives 0001, and 10000 still prints in full."
      />
      <fieldset className="checks">
        <legend>Financial year</legend>
        <label>
          <input type="checkbox" name="includeFy" defaultChecked={includeFy} /> Put the
          financial year in the number
        </label>
        <label>
          <input type="checkbox" name="resetEachFy" defaultChecked={resetEachFy} /> Restart the
          counter each April
        </label>
      </fieldset>
      <Choice
        name="fyFormat"
        label="How the year is written"
        required
        defaultValue={fyFormat}
        options={[
          ['YYYY-YY', '2026-27'],
          ['YY-YY', '26-27'],
          ['YYYY', '2026'],
          ['YY', '26'],
        ]}
        hint="The Indian financial year runs April to March, so 31 March is still 2026-27."
      />
      <Field
        name="startingNumber"
        label="Restart from"
        type="number"
        required
        defaultValue={String(startingNumber)}
        hint="Where a restarted series begins. Zero means the first number each year is 1. This does not move the current counter."
      />
    </Form>
  );
}

/**
 * A margin is stored as basis points and shown as a percentage.
 *
 * `formatBasisPoints` rather than `bp / 100`: the app is banned from doing
 * arithmetic on a rate for the same reason it is banned from doing arithmetic
 * on money, and the formatter works on the digits. It emits a trailing `%`,
 * which a form field must not carry back — the label says percent.
 */
function percentOf(bp: number | null): string {
  return bp === null ? '' : formatBasisPoints(bp).replace('%', '');
}

export function NewTradePackageForm(): ReactNode {
  return (
    <Form action={addTradePackage} submitLabel="Add this trade" pendingLabel="Adding…">
      <div className="row">
        <Field name="code" label="Code" required hint="ELEC, HVAC. Uppercased." />
        <Field name="name" label="Trade" required hint="Electrical &amp; lighting" />
        <Field
          name="marginPct"
          label="Usual margin (%)"
          hint="Leave empty if the company has not settled on one. Nothing fills it in for you."
        />
        <Field name="sortOrder" label="Order" type="number" defaultValue="0" />
      </div>
      <Field name="description" label="What it covers" />
    </Form>
  );
}

export function TradePackageForm({
  tradePackageId,
  code,
  name,
  description,
  defaultMarginBp,
  sortOrder,
  isActive,
}: {
  tradePackageId: string;
  code: string;
  name: string;
  description: string;
  defaultMarginBp: number | null;
  sortOrder: number;
  isActive: boolean;
}): ReactNode {
  return (
    <Form action={saveTradePackage} submitLabel="Save" pendingLabel="Saving…">
      <input type="hidden" name="tradePackageId" value={tradePackageId} />
      <div className="row">
        <Field name="code" label="Code" required defaultValue={code} />
        <Field name="name" label="Trade" required defaultValue={name} />
        <Field name="marginPct" label="Margin (%)" defaultValue={percentOf(defaultMarginBp)} />
        <Field name="sortOrder" label="Order" type="number" defaultValue={String(sortOrder)} />
      </div>
      <Field name="description" label="What it covers" defaultValue={description} />
      <label>
        <input type="checkbox" name="isActive" defaultChecked={isActive} /> In use
      </label>
    </Form>
  );
}

/**
 * The organisation's registered details.
 *
 * Every tax field is optional and none has a placeholder. An empty one is
 * saved as absent and prints nothing — the previous system fabricates a
 * default TAN when one is missing and writes it into filed 26Q content.
 */
export function CompanyProfileForm({
  gstin,
  pan,
  cin,
  tan,
  address,
  phone,
  email,
  website,
  bankName,
  bankBranch,
  bankIfsc,
  documentFooter,
}: {
  gstin: string;
  pan: string;
  cin: string;
  tan: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankBranch: string;
  bankIfsc: string;
  documentFooter: string;
}): ReactNode {
  return (
    <Form action={saveCompanyProfile} submitLabel="Save these details" pendingLabel="Saving…">
      <div className="row">
        <Field name="gstin" label="GSTIN" defaultValue={gstin} hint="15 characters. Leave empty if not registered." />
        <Field name="pan" label="PAN" defaultValue={pan} hint="ABCDE1234F" />
        <Field name="cin" label="CIN" defaultValue={cin} hint="21 characters, for a company." />
        <Field name="tan" label="TAN" defaultValue={tan} hint="ABCD12345E. Challans and 26Q are refused without one." />
      </div>
      <Field name="address" label="Registered address" defaultValue={address} />
      <div className="row">
        <Field name="phone" label="Phone" defaultValue={phone} />
        <Field name="email" label="Email" defaultValue={email} />
        <Field name="website" label="Website" defaultValue={website} />
      </div>
      <div className="row">
        <Field name="bankName" label="Bank" defaultValue={bankName} />
        <Field name="bankBranch" label="Branch" defaultValue={bankBranch} />
        <Field name="bankIfsc" label="IFSC" defaultValue={bankIfsc} hint="HDFC0001234" />
      </div>
      <Notes
        name="documentFooter"
        label="Document footer"
        hint="Printed at the bottom of purchase orders and other documents."
        defaultValue={documentFooter}
      />
    </Form>
  );
}

/**
 * The defaults the organisation works to.
 *
 * `crmStaleDays` empty means NO RULE, not thirty. A staleness threshold
 * nobody chose quietly starts marking somebody's live pipeline as neglected,
 * and the first thing they do about it is stop trusting the flag.
 */
export function OperationalDefaultsForm({
  poTerms,
  crmStaleDays,
}: {
  poTerms: string;
  crmStaleDays: number | null;
}): ReactNode {
  return (
    <Form action={saveOperationalDefaults} submitLabel="Save defaults" pendingLabel="Saving…">
      <Field
        name="poTerms"
        label="Payment terms on a new purchase order"
        defaultValue={poTerms}
        hint="Free text, because terms in this trade are prose: “50% advance, balance on delivery”."
      />
      <Field
        name="crmStaleDays"
        label="Days before an opportunity is called stale"
        type="number"
        defaultValue={crmStaleDays === null ? '' : String(crmStaleDays)}
        hint="Leave empty for no rule. Nothing fills this in for you."
      />
    </Form>
  );
}

export function GrantClientProjectForm({
  principalId,
  projects,
}: {
  principalId: string;
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  if (projects.length === 0) {
    return <span className="muted">No projects to grant</span>;
  }
  return (
    <Form action={grantClientProject} submitLabel="Give access" pendingLabel="Granting…">
      <input type="hidden" name="principalId" value={principalId} />
      <Choice name="projectId" label="Project" required options={projects} />
    </Form>
  );
}

/**
 * Take a project away from a client login.
 *
 * The project's NAME is in the button, not just "Revoke". A row of identical
 * buttons beside a list is how the wrong one gets pressed, and this one
 * removes somebody's access to a job.
 */
export function RevokeClientProjectButton({
  principalId,
  projectId,
  projectName,
}: {
  principalId: string;
  projectId: string;
  projectName: string;
}): ReactNode {
  return (
    <form
      action={revokeClientProject.bind(null, principalId, projectId)}
      className="inline"
    >
      <button type="submit" className="btn danger sm">
        Revoke {projectName}
      </button>
    </form>
  );
}

/**
 * Give a vendor login one more supplier.
 *
 * **`Picker`, not `Choice`.** A tenant has thirty-odd vendors today and will
 * have hundreds; a flat `<select>` of every one is a scroll, not a choice. What
 * matters more is what it submits: the picker shows the vendor's NAME and puts
 * the vendor's ID in the payload, which is the same distinction the rate
 * contract screen needed and the identity model this rebuild replaced.
 */
export function GrantVendorForm({
  principalId,
  vendors,
}: {
  principalId: string;
  vendors: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}): ReactNode {
  if (vendors.length === 0) {
    return <span className="muted">No vendors to grant</span>;
  }
  return (
    <Form action={grantVendor} submitLabel="Give access" pendingLabel="Granting…">
      <input type="hidden" name="principalId" value={principalId} />
      <Picker name="vendorId" label="Vendor" required options={vendors} />
    </Form>
  );
}

/** The vendor's NAME is in the button, for the reason the client one gives. */
export function RevokeVendorButton({
  principalId,
  vendorId,
  vendorName,
}: {
  principalId: string;
  vendorId: string;
  vendorName: string;
}): ReactNode {
  return (
    <form action={revokeVendor.bind(null, principalId, vendorId)} className="inline">
      <button type="submit" className="btn danger sm">
        Revoke {vendorName}
      </button>
    </form>
  );
}
