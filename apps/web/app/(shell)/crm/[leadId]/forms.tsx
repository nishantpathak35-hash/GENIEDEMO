'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import { addContact, handOverLead, logActivity, markLost, mergeLead } from './actions';

export function AddContactForm({ leadId }: { leadId: string }): ReactNode {
  return (
    <Form action={addContact} submitLabel="Add contact" pendingLabel="Adding…">
      <input type="hidden" name="leadId" value={leadId} />
      <Field name="name" label="Name" required />
      <Field
        name="designation"
        label="Designation"
        placeholder="Facilities manager"
        hint="Who they are at the client. A fit-out lead usually runs through three or four people."
      />
      <Field name="phone" label="Phone" />
      <Field name="email" label="Email" type="email" />
      <label className="check">
        <input type="checkbox" name="isPrimary" value="on" />
        <span>Main contact — a proposal is addressed to this person</span>
      </label>
    </Form>
  );
}

export function LogActivityForm({ leadId }: { leadId: string }): ReactNode {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Form action={logActivity} submitLabel="Log it" pendingLabel="Saving…">
      <input type="hidden" name="leadId" value={leadId} />
      <Choice
        name="kind"
        label="What happened"
        required
        defaultValue="call"
        options={[
          ['call', 'Call'],
          ['meeting', 'Meeting'],
          ['email', 'Email'],
          ['site_visit', 'Site visit'],
          ['note', 'Note'],
        ]}
      />
      <Field name="summary" label="In one line" required placeholder="Spoke to the FM about phasing" />
      <Notes name="detail" label="Anything worth remembering" />
      <Field
        name="occurredOn"
        label="When it happened"
        type="date"
        required
        defaultValue={today}
        hint="The day it happened, not the day it was typed. A visit logged three days late still belongs on the day of the visit."
      />
      <Field
        name="nextFollowupOn"
        label="Next step"
        type="date"
        hint="Optional. Leaving it blank leaves the existing next step alone rather than clearing it."
      />
      <Choice
        name="nextFollowupKind"
        label="What the next step is"
        defaultValue="call"
        options={[
          ['call', 'Call'],
          ['meeting', 'Meeting'],
          ['email', 'Email'],
          ['site_visit', 'Site visit'],
          ['note', 'Note'],
        ]}
        hint="Kept only with a next-step date. A site visit here is what Sales shows as the next site visit."
      />
    </Form>
  );
}

export function MarkLostForm({
  leadId,
  version,
}: {
  leadId: string;
  version: number;
}): ReactNode {
  return (
    <Form action={markLost} submitLabel="Close as lost" pendingLabel="Closing…">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="expectedVersion" value={String(version)} />
      <Choice
        name="stage"
        label="Which"
        required
        defaultValue="rejected"
        options={[
          ['rejected', 'Lost — we bid and did not win'],
          ['unqualified', 'Unqualified — never a real opportunity'],
        ]}
      />
      <Notes
        name="reason"
        label="Why"
        hint="Required. It is the only field here that changes what the company does next — losing on price and losing because nobody followed up call for opposite responses."
      />
    </Form>
  );
}

/**
 * Fold a duplicate into this record.
 *
 * The candidates come from the duplicate detector already on this screen, so
 * this is not a free-text id field: merging is destructive enough that typing
 * an id is the wrong affordance. The record being looked at is the one that
 * SURVIVES, and the button says which record goes.
 *
 * **Nothing is summed and nothing is overwritten.** The other record's values
 * fill gaps only, its contacts move across, its timeline stays where it was
 * logged, and what it held is recorded.
 */
export function MergeLeadForm({
  leadId,
  candidates,
}: {
  leadId: string;
  candidates: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  if (candidates.length === 0) return null;
  return (
    <Form action={mergeLead} submitLabel="Merge it into this one" pendingLabel="Merging…">
      <input type="hidden" name="leadId" value={leadId} />
      <Choice
        name="secondaryId"
        label="Which record is the duplicate"
        required
        options={candidates}
        hint="That record keeps its row and its history and is marked merged — not lost, so it never counts against the win rate."
      />
    </Form>
  );
}

/**
 * The moment after a call.
 *
 * The same endpoint as the full activity form, in the shape somebody actually
 * uses while the phone is still warm: what happened, and when the next thing
 * is. The legacy modal also carries a “next action type” and a “resolve the
 * current task” checkbox; neither has anything behind it here, and a control
 * that stores nothing is worse than its absence.
 *
 * **The next date is required.** That is the entire point of the form — a
 * follow-up form that lets you record a call and forget the next step is the
 * form that produced the pipeline nobody trusts.
 */
export function FollowupForm({ leadId }: { leadId: string }): ReactNode {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Form action={logActivity} submitLabel="Save and set the next step" pendingLabel="Saving…">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="occurredOn" value={today} />
      <Choice
        name="kind"
        label="How it went"
        required
        defaultValue="call"
        options={[
          ['call', 'Spoke to them'],
          ['note', 'Could not reach them'],
          ['meeting', 'Met them'],
          ['site_visit', 'Visited the site'],
        ]}
      />
      <Field name="summary" label="In one line" required placeholder="Chasing the layout sign-off" />
      <Field
        name="nextFollowupOn"
        label="Next step, on"
        type="date"
        required
        hint="Required here. A follow-up recorded with no next step is how a pipeline stops being one."
      />
    </Form>
  );
}

/**
 * Handing this job to the people who will build it.
 *
 * **The two confirmations are a gate, and the letter of intent is not.** A
 * job cannot be handed over with a scope nobody confirmed — that is where
 * the variation argument three months later comes from. Starting on a verbal
 * commitment while the paperwork follows is an ordinary judgement in this
 * trade, so the LOI is recorded either way and its date is required only if
 * it is claimed.
 *
 * The project code is typed, never generated. `convertLeadToProject`
 * (`crm.js:179`) invents one with `Math.random()`, which is CRM-03 and is how
 * two projects end up with the same code.
 */
export function HandoverForm({
  leadId,
  version,
  clientName,
}: {
  leadId: string;
  version: number;
  clientName: string;
}): ReactNode {
  return (
    <Form action={handOverLead} submitLabel="Hand it over" pendingLabel="Handing over…">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="expectedVersion" value={String(version)} />
      <div className="row">
        <Field name="code" label="Project code" required hint="Yours. Nothing generates one." />
        <Field
          name="name"
          label="Project name"
          required
          defaultValue={clientName}
          hint="The client's name comes from this opportunity and is not typed again."
        />
        <MoneyField
          name="originalValue"
          label="Contract value"
          hint="Leave empty if it is not settled. Empty is not zero."
        />
      </div>
      <fieldset className="checks">
        <legend>Before it goes across</legend>
        <label className="check-row">
          <input type="checkbox" name="scopeConfirmed" />
          <span>The scope is confirmed</span>
        </label>
        <label className="check-row">
          <input type="checkbox" name="commercialsConfirmed" />
          <span>The commercials are confirmed</span>
        </label>
        <label className="check-row">
          <input type="checkbox" name="loiReceived" />
          <span>A letter of intent has been received</span>
        </label>
      </fieldset>
      <Field
        name="loiDate"
        label="Letter of intent dated"
        type="date"
        hint="Required if a letter of intent is ticked above, and refused if it is not."
      />
      <Notes name="notes" label="Anything delivery needs to know" />
      <p className="hint u-m0">
        The first two are refused if unticked, by the server and by the database. This record
        cannot be edited afterwards.
      </p>
    </Form>
  );
}
