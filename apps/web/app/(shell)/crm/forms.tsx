'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import { convertLead, createLead, deleteLead, updateLead } from './actions';
import { LEAD_STAGE_OPTIONS } from './stage';

const PROBABILITY_HINT =
  'A whole percent, entered by you. It is never derived from the stage — four ladders in the legacy disagree by up to fifteen points (CRM-01).';

function LeadFields({ lead }: { lead?: LeadDefaults }): ReactNode {
  return (
    <>
      <div className="row">
        <Field
          name="clientName"
          label="Client"
          required
          {...(lead === undefined ? {} : { defaultValue: lead.clientName })}
        />
        <Field
          name="contactName"
          label="Contact"
          {...(lead === undefined ? {} : { defaultValue: lead.contactName })}
        />
        <Field
          name="phone"
          label="Phone"
          {...(lead === undefined ? {} : { defaultValue: lead.phone })}
        />
        <Field
          name="email"
          label="Email"
          {...(lead === undefined ? {} : { defaultValue: lead.email })}
        />
      </div>
      <div className="row">
        <Choice
          name="stage"
          label="Stage"
          required
          options={LEAD_STAGE_OPTIONS}
          defaultValue={lead?.stage ?? 'lead'}
        />
        <MoneyField
          name="estimatedValue"
          label="Estimated value"
          required
          {...(lead === undefined ? {} : { defaultValue: lead.estimatedValue })}
        />
        <Field
          name="probabilityPct"
          label="Probability (%)"
          required
          hint={PROBABILITY_HINT}
          defaultValue={lead?.probabilityPct ?? '50'}
        />
        <Field
          name="expectedClose"
          label="Expected close"
          type="date"
          {...(lead === undefined ? {} : { defaultValue: lead.expectedClose })}
        />
      </div>
      <div className="row">
        <Field
          name="projectType"
          label="Project type"
          {...(lead === undefined ? {} : { defaultValue: lead.projectType })}
        />
        <Field
          name="source"
          label="Source"
          {...(lead === undefined ? {} : { defaultValue: lead.source })}
        />
        <Field
          name="city"
          label="City"
          {...(lead === undefined ? {} : { defaultValue: lead.city })}
        />
        <Field
          name="consultant"
          label="Consultant"
          {...(lead === undefined ? {} : { defaultValue: lead.consultant })}
        />
      </div>
      <Notes
        name="notes"
        label="Notes"
        rows={2}
        {...(lead === undefined ? {} : { defaultValue: lead.notes })}
      />
    </>
  );
}

export function NewLeadForm(): ReactNode {
  return (
    <Form action={createLead} submitLabel="Add to pipeline" pendingLabel="Adding…">
      <LeadFields />
    </Form>
  );
}

export interface LeadDefaults {
  readonly id: string;
  readonly clientName: string;
  readonly contactName: string;
  readonly phone: string;
  readonly email: string;
  readonly stage: string;
  readonly estimatedValue: string;
  readonly probabilityPct: string;
  readonly expectedClose: string;
  readonly projectType: string;
  readonly source: string;
  readonly city: string;
  readonly consultant: string;
  readonly notes: string;
  readonly version: string;
}

export function EditLeadForm({ lead }: { lead: LeadDefaults }): ReactNode {
  return (
    <Form action={updateLead.bind(null, lead.id)} submitLabel="Save lead" pendingLabel="Saving…">
      <input type="hidden" name="expectedVersion" defaultValue={lead.version} />
      <LeadFields lead={lead} />
    </Form>
  );
}

export function ConvertLeadForm({
  leadId,
  version,
  projects,
}: {
  leadId: string;
  version: number;
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form
      action={convertLead.bind(null, leadId)}
      submitLabel="Attach to project"
      pendingLabel="Attaching…"
    >
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <Choice
        name="projectId"
        label="Project"
        required
        options={projects}
        hint="The lead keeps its own record; this records which project it became."
      />
    </Form>
  );
}

export function DeleteLeadButton({ leadId }: { leadId: string }): ReactNode {
  return (
    <form action={deleteLead.bind(null, leadId)} className="inline">
      <button type="submit" className="btn danger sm">
        Delete
      </button>
    </form>
  );
}
