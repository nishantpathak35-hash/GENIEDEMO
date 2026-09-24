import type { ReactNode } from 'react';
import type { ApiError } from '@cog/contracts';
import { Form, Field, Choice, MoneyField } from '../src/form.js';
import { Picker } from '../src/picker.js';
import { Notice, Pill, Refusal, AbsentNotice } from '../src/ui.js';
import { Section } from '../src/section.js';
import { UnreachableState } from '../src/page-state.js';
import { IDLE, failed, succeeded, type ActionState } from '../src/action-state.js';

const VENDORS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Ashvale Interiors Private Limited' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Brightmoor Contracts LLP' },
];

const IDLE_ACTION = async (): Promise<ActionState> => IDLE;

/** One entry per component; one state per design state, named as the design names it. */
export const stories: ReadonlyArray<{ component: string; states: Record<string, () => ReactNode> }> = [
  {
    component: 'Field',
    states: {
      plain: () => <Field name="title" label="Title" />,
      'with hint': () => <Field name="code" label="Order code" hint="Letters and digits only, no spaces" />,
      'with error': () => (
        <Field name="title" label="Title" defaultValue="" error="Say what this task is" />
      ),
    },
  },
  {
    component: 'Picker',
    states: {
      plain: () => <Picker name="vendorId" label="Vendor" options={VENDORS} />,
      'with error': () => <Picker name="vendorId" label="Vendor" options={VENDORS} error="Choose a vendor" />,
      'with no options': () => <Picker name="vendorId" label="Vendor" options={[]} />,
    },
  },
  {
    component: 'Form',
    states: {
      // Nothing renders below the fields until Save is pressed — that is the
      // component's own contract (`shows nothing at all before anything has
      // been submitted`), so "idle" is this render as it stands.
      idle: () => (
        <Form action={IDLE_ACTION} submitLabel="Save">
          <Field name="title" label="Title" />
        </Form>
      ),
      // Press Save to see it: the banner and the two field messages only
      // exist after a submit resolves, exactly as they would from a server.
      'refused with two field errors': () => (
        <Form
          action={async (): Promise<ActionState> =>
            failed('This task was not saved', {
              title: 'Say what the task is',
              assignedTo: 'Choose who this is for',
            })
          }
          submitLabel="Save"
        >
          <Field name="title" label="Title" />
          <Field name="assignedTo" label="Assigned to" />
        </Form>
      ),
      // Press Save to see it.
      succeeded: () => (
        <Form action={async (): Promise<ActionState> => succeeded('Saved. They see it on their next request.')} submitLabel="Save">
          <Field name="title" label="Title" />
        </Form>
      ),
    },
  },
  {
    component: 'Choice',
    states: {
      optional: () => (
        <Choice
          name="priority"
          label="Priority"
          options={[
            ['low', 'Low'],
            ['high', 'High'],
          ]}
        />
      ),
      // Opens on the prompt, not on "Low" — the defect this replacement
      // removes.
      required: () => (
        <Choice
          name="stage"
          label="Stage"
          required
          options={[
            ['lead', 'Lead'],
            ['won', 'Won'],
          ]}
        />
      ),
    },
  },
  {
    component: 'Pill',
    states: {
      ok: () => <Pill tone="ok">At the agreed rate</Pill>,
      warn: () => <Pill tone="warn">Below reorder</Pill>,
      bad: () => <Pill tone="bad">Over contract</Pill>,
      waiting: () => <Pill tone="waiting">Waiting on Priya</Pill>,
      active: () => <Pill tone="active">In progress</Pill>,
      idle: () => <Pill tone="idle">Draft</Pill>,
    },
  },
  {
    component: 'Section',
    states: {
      plain: () => (
        <Section title="Open">
          <p>Body content.</p>
        </Section>
      ),
      'with sub': () => (
        <Section title="Thursday 11 September" sub="PRJ-01 · Workplace refresh, two floors">
          <p>Body content.</p>
        </Section>
      ),
      'bare, a table': () => (
        <Section title="Lines" sub="2 lines" bare>
          <div className="tbl-wrap">
            <table className="tbl">
              <tbody>
                <tr>
                  <td>A row</td>
                </tr>
                <tr>
                  <td>Another</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      ),
    },
  },
  {
    component: 'Notice',
    states: {
      neutral: () => <Notice tone="neutral">Saved. They see it on their next request.</Notice>,
      info: () => (
        <Notice tone="info" title="You were signed out">
          You were away for a while, so we signed you out to keep things safe.
        </Notice>
      ),
      warn: () => (
        <Notice tone="warn" title="Figures withheld">
          A CA has not signed off this return.
        </Notice>
      ),
      bad: () => (
        <Notice tone="bad" title="Refused">
          Your role can&apos;t approve at this stage.
        </Notice>
      ),
      'with actions': () => (
        <Notice tone="warn" title="We can't find that" actions={<a href="#">Go to Today</a>}>
          This part of Construct-O-Genie is switched off for your organisation.
        </Notice>
      ),
    },
  },
  {
    component: 'Refusal',
    states: {
      'FORBIDDEN with request id': () => (
        <Refusal
          error={
            {
              code: 'FORBIDDEN',
              message: 'You do not hold approve_payment.',
              requestId: 'req_01HZX9EXAMPLE',
            } as ApiError
          }
        />
      ),
    },
  },
  {
    component: 'UnreachableState',
    states: {
      default: () => <UnreachableState />,
    },
  },
  {
    component: 'AbsentNotice',
    states: {
      default: () => (
        <AbsentNotice title="Figures withheld">A CA has not signed off this return.</AbsentNotice>
      ),
    },
  },
  {
    component: 'MoneyField',
    states: {
      plain: () => <MoneyField name="amount" label="Amount" />,
      'with error': () => <MoneyField name="amount" label="Amount" error="Enter a valid amount" />,
    },
  },
  // No new component — `.icon` and `.busy` are class modifiers on the button
  // `styles.css` already ships (`button, .button` with `.primary .danger
  // .ghost .sm .lg`), documented here rather than behind a wrapper.
  {
    component: 'Button (.icon / .busy modifiers)',
    states: {
      icon: () => (
        <button type="button" className="icon" aria-label="Download">
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
            <path d="M8 1v9m0 0 3-3m-3 3-3-3M2 13h12" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      ),
      busy: () => (
        <button type="button" className="primary busy" disabled>
          Saving…
        </button>
      ),
    },
  },
];
