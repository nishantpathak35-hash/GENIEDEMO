import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Field } from '../src/index.js';
import { IDLE, failed, succeeded, type ActionState } from '../src/action-state.js';

/**
 * A required field refuses empty, and the refusal is visible.
 *
 * **Not "the attribute is present".** `expect(input).toHaveAttribute('required')`
 * tests that somebody typed the attribute; it says nothing about whether an
 * empty form reaches the server. The property worth holding is behavioural: the
 * action does not run, and the person is told why.
 *
 * That needs a real DOM. Constraint validation — `checkValidity`,
 * `validity.valueMissing`, `validationMessage`, and a blocked submit — is
 * implemented by the browser, and it is the whole reason this package has a
 * `jsdom` environment while every other package here runs on `node`.
 *
 * The other half of `Form`'s contract is what it does with what the server
 * said. It renders the server's own refusal message rather than a generic
 * string, because "refused while an order references it" tells somebody what to
 * do next and "something went wrong" does not.
 */

function formWith(field: React.ReactNode) {
  const action = vi.fn(async (_s: ActionState, form: FormData): Promise<ActionState> => {
    void form;
    return IDLE;
  });
  const view = render(
    <Form action={action} submitLabel="Save">
      {field}
    </Form>,
  );
  return {
    ...view,
    action,
    submit: () => userEvent.click(screen.getByRole('button', { name: 'Save' })),
  };
}

describe('a required field refuses empty', () => {
  it('does not run the action, and says why', async () => {
    const { action, submit } = formWith(<Field name="code" label="Code" required />);
    const input = screen.getByLabelText('Code') as HTMLInputElement;

    expect(input.validity.valueMissing).toBe(true);
    // A message, not just a false. An empty `validationMessage` is a refusal
    // with nothing on the screen, which is the failure mode being ruled out.
    expect(input.validationMessage).not.toBe('');

    await submit();
    expect(action).not.toHaveBeenCalled();
  });

  it('runs the action once the field is filled', async () => {
    // The discriminating half. A form that refused everything would pass the
    // test above, and this repo has shipped a refusal-only test before.
    const { action, submit } = formWith(<Field name="code" label="Code" required />);

    await userEvent.type(screen.getByLabelText('Code'), 'RC-01');
    await submit();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('an optional field submits empty without complaint', async () => {
    const { action, submit } = formWith(<Field name="notes" label="Notes" />);
    const input = screen.getByLabelText('Notes') as HTMLInputElement;

    expect(input.validity.valueMissing).toBe(false);
    await submit();
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("the form renders what the server said, not a string of its own", () => {
  it("shows the server's refusal message", async () => {
    const message = 'refused while an order references it';
    const action = async (): Promise<ActionState> => failed(message);

    render(
      <Form action={action} submitLabel="Save">
        <Field name="x" label="X" />
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(message)).toBeDefined();
  });

  it("shows the server's success message", async () => {
    const message = 'Done. They see it on their next request.';
    const action = async (): Promise<ActionState> => succeeded(message);

    render(
      <Form action={action} submitLabel="Save">
        <Field name="x" label="X" />
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(message)).toBeDefined();
  });

  it('shows nothing at all before anything has been submitted', async () => {
    // An idle form must not render an empty notice box. A notice that is always
    // present is a notice nobody reads.
    const { container } = formWith(<Field name="x" label="X" />);
    expect(container.querySelector('.notice')).toBeNull();
  });

  it("the refusal banner is an alert, the success banner a note", async () => {
    // `Notice` gives each tone the role the design gives it. A refusal has to
    // interrupt a screen reader; a success message does not.
    const refused = async (): Promise<ActionState> => failed('Not saved');
    render(
      <Form action={refused} submitLabel="Save">
        <Field name="x" label="X" />
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeDefined();

    const succeed = async (): Promise<ActionState> => succeeded('Saved');
    render(
      <Form action={succeed} submitLabel="Save">
        <Field name="y" label="Y" />
      </Form>,
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
    expect(await screen.findByRole('note')).toBeDefined();
  });
});

describe('a refusal that names fields threads them to the Fields themselves', () => {
  it('marks each named field, counts them in the banner, and needs no error prop at the call site', async () => {
    const action = async (): Promise<ActionState> =>
      failed('This task was not saved', {
        title: 'Say what the task is',
        assignedTo: 'Choose who this is for',
      });

    render(
      <Form action={action} submitLabel="Save">
        <Field name="title" label="Title" />
        <Field name="assignedTo" label="Assigned to" />
        <Field name="notes" label="Notes" />
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The banner: the caller's own sentence as the title, then how many.
    expect(await screen.findByText('This task was not saved')).toBeDefined();
    expect(screen.getByText(/2 fields need attention/)).toBeDefined();

    // Each named field carries its own message and is marked invalid — with
    // no `error` prop passed at any of these call sites.
    const titleInput = screen.getByLabelText('Title');
    const assignedInput = screen.getByLabelText('Assigned to');
    const notesInput = screen.getByLabelText('Notes');

    expect(screen.getByText('Say what the task is')).toBeDefined();
    expect(screen.getByText('Choose who this is for')).toBeDefined();
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    expect(assignedInput.getAttribute('aria-invalid')).toBe('true');

    // The field the refusal did not name stays untouched — marking it too
    // would be noise, and it would make the two that need work harder to find.
    expect(notesInput.getAttribute('aria-invalid')).toBeNull();

    const titleErrId = screen.getByText('Say what the task is').id;
    expect(titleInput.getAttribute('aria-describedby')).toContain(titleErrId);
  });

  it('a field with an explicit `error` prop wins over the form-wide map', async () => {
    const action = async (): Promise<ActionState> => failed('Not saved', { title: 'From the form' });

    render(
      <Form action={action} submitLabel="Save">
        <Field name="title" label="Title" error="From the caller" />
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('From the caller')).toBeDefined();
    expect(screen.queryByText('From the form')).toBeNull();
  });
});

describe('Field shows its own error under the control', () => {
  it('plain: no aria-invalid', () => {
    render(<Field name="code" label="Code" />);
    expect(screen.getByLabelText('Code').getAttribute('aria-invalid')).toBeNull();
  });

  it('with a hint: the hint is in aria-describedby', () => {
    render(<Field name="code" label="Code" hint="Letters and digits only" />);
    const input = screen.getByLabelText('Code');
    const hint = screen.getByText('Letters and digits only');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('with an error: aria-invalid, and the message is in aria-describedby alongside the hint', () => {
    render(<Field name="code" label="Code" hint="Letters and digits only" error="Already taken" />);
    const input = screen.getByLabelText('Code');
    const hint = screen.getByText('Letters and digits only');
    const err = screen.getByText('Already taken');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain(hint.id);
    expect(describedBy).toContain(err.id);
  });
});
