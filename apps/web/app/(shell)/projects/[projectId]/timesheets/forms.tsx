'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { bookTime } from './actions';

/**
 * Book time.
 *
 * **In minutes, chosen from a list.** A free-text hours field invites `7.5`,
 * which is a float, and floats are what make a month's total end in nines. The
 * options are the durations people actually book.
 *
 * There is no field for whose time it is: it is the caller's, always.
 */
export function BookTimeForm({ projectId }: { projectId: string }): ReactNode {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Form action={bookTime} submitLabel="Book it" pendingLabel="Booking…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="workDate" label="Day" type="date" required defaultValue={today} />
        <Choice
          name="minutes"
          label="How long"
          required
          defaultValue="60"
          options={[
            ['15', '15 minutes'],
            ['30', 'Half an hour'],
            ['60', 'An hour'],
            ['90', 'An hour and a half'],
            ['120', 'Two hours'],
            ['240', 'Half a day'],
            ['480', 'A full day'],
          ]}
        />
        <Field name="stage" label="Stage" placeholder="Concept, GFC" />
      </div>
      <Field name="description" label="What you did" />
      <label>
        <input type="checkbox" name="additionalService" /> This was beyond what the fee covers
      </label>
    </Form>
  );
}
