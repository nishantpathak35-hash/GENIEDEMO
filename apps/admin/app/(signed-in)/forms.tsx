'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { provisionTenant, setTenantPlan } from './actions';

/** An operator's label for an organisation's plan. Blank clears it. Nothing gates on it. */
export function SetPlanForm({ tenants }: { tenants: ReadonlyArray<readonly [string, string]> }): ReactNode {
  return (
    <Form action={setTenantPlan} submitLabel="Save plan" pendingLabel="Saving…">
      <div className="row">
        <Choice name="tenantId" label="Organisation" required options={tenants} />
        <Field name="plan" label="Plan" placeholder="Pilot" hint="Up to 40 characters. Leave blank to clear." />
      </div>
    </Form>
  );
}

export function ProvisionTenantForm(): ReactNode {
  return (
    <Form action={provisionTenant} submitLabel="Create organisation" pendingLabel="Creating…">
      <div className="row">
        <Field
          name="slug"
          label="Slug"
          required
          placeholder="bhitarang-interiors"
          hint="Lower case letters, digits and hyphens. Permanent."
        />
        <Field name="legalName" label="Legal name" required placeholder="Bhitarang Interiors Private Limited" />
      </div>
      <div className="row">
        <Field
          name="appOrigin"
          label="App origin"
          required
          placeholder="https://bhitarang-interiors.example"
          hint="Where this organisation's invitation links point. Per-tenant, so no invite URL is ever a constant."
        />
      </div>
      <div className="row">
        <Field name="adminEmail" label="First administrator's email" type="email" required />
        <Field
          name="adminExternalId"
          label="Their identity-provider id"
          required
          hint="What the configured provider will present. With the local provider this is the same address."
        />
      </div>
      <p className="hint u-m0">
        The organisation and its first administrator are created in one transaction. A tenant with
        no administrator is one nobody can sign in to, and it holds the slug so the retry fails too.
      </p>
    </Form>
  );
}
