'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { SITE_CONDITIONS } from '@cog/design-system';
import { createRecce } from './actions';

export function NewRecceForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form
      action={createRecce.bind(null, projectId)}
      submitLabel="Record survey"
      pendingLabel="Recording…"
    >
      <div className="row">
        <Field name="recceOn" label="Survey date" type="date" required />
        <Choice name="siteCondition" label="Handover condition" options={SITE_CONDITIONS} />
        <Field name="handoverOn" label="Expected handover" type="date" />
        <div className="field">
          <label htmlFor="clientPresent">Client representative present</label>
          <input id="clientPresent" name="clientPresent" type="checkbox" />
        </div>
      </div>
      <div className="row">
        <Field name="bua" label="Built-up area" placeholder="12500" hint="Exact — no float." />
        <Field name="carpet" label="Carpet area" placeholder="9800" />
        <Field name="floorHeight" label="Clear floor height" placeholder="10.5" />
        <Field name="floorNumber" label="Floor or level" />
        <Field name="numFloors" label="Floors in scope" placeholder="1" />
      </div>
      <Notes name="keyChallenges" label="Critical challenges" rows={3} />
      <Notes name="observations" label="Observations" rows={3} />
      <p className="hint u-m0">
        Who conducted the survey is the signed-in principal, not a typed name.
      </p>
    </Form>
  );
}
