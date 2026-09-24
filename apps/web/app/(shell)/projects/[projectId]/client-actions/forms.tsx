'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { recordDecision } from './actions';

/**
 * Record a decision that arrived somewhere other than this system.
 *
 * The subject comes from the list of things actually waiting, not a free-text
 * id: recording a decision against something nobody was waiting for is a
 * mistake with no useful reading.
 *
 * **The date is when they SAID it**, not when it was typed. A decision taken on
 * Friday and recorded on Monday belongs on Friday, and the difference is what
 * somebody counts when they ask how long the client takes.
 */
export function ExternalDecisionForm({
  projectId,
  items,
}: {
  projectId: string;
  items: readonly { kind: string; id: string; title: string }[];
}): ReactNode {
  if (items.length === 0) {
    return (
      <p className="muted">
        Nothing is waiting on the client, so there is nothing to record a decision about.
      </p>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Form action={recordDecision} submitLabel="Record it" pendingLabel="Recording…">
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="subject"
        label="What they decided about"
        required
        options={items.map((i) => [`${i.kind}:${i.id}`, i.title] as const)}
      />
      <div className="row">
        <Choice
          name="channel"
          label="How it came in"
          required
          defaultValue="whatsapp"
          options={[
            ['whatsapp', 'WhatsApp'],
            ['meeting', 'In a meeting'],
            ['phone', 'On the phone'],
            ['email', 'Email'],
            ['letter', 'Letter'],
          ]}
        />
        <Choice
          name="decision"
          label="What they said"
          required
          defaultValue="approved"
          options={[
            ['approved', 'Approved'],
            ['revision_requested', 'Wants a revision (design)'],
            ['alternative_requested', 'Wants an alternative (selection)'],
            ['rejected', 'Rejected'],
          ]}
        />
        <Field name="saidBy" label="Who said it" placeholder="Their name" />
        <Field
          name="decidedOn"
          label="When they said it"
          type="date"
          required
          defaultValue={today}
          hint="The day they said it, not the day it was typed."
        />
      </div>
      <Notes name="note" label="What exactly was said" />
    </Form>
  );
}
