import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Choice, Form } from '../src/form.js';
import { IDLE, type ActionState } from '../src/action-state.js';
import { Notice, Pill, type PillTone } from '../src/ui.js';
import { Section } from '../src/section.js';

/**
 * `Choice` replaced: a required select opens on nothing, never on its first
 * option.
 *
 * The defect this removes: `{required ? null : <option value="">—</option>}`
 * gave a *required* select no empty option, so it opened pre-selected on its
 * first real value — a person who never touched the control still submitted
 * one, and the form could not tell "chose the first option" from "did not
 * answer". The fix always renders the empty option; `required` only changes
 * its label and adds the constraint that refuses submission while it is
 * chosen. Asserted the same way `Field`'s required test is: behaviourally,
 * against `validity.valueMissing` and whether the action ran — not against
 * the attribute being present.
 */
function formWithChoice(required: boolean) {
  const action = vi.fn(async (_s: ActionState, form: FormData): Promise<ActionState> => {
    void form;
    return IDLE;
  });
  render(
    <Form action={action} submitLabel="Save">
      <Choice
        name="stage"
        label="Stage"
        options={[
          ['lead', 'Lead'],
          ['won', 'Won'],
        ]}
        {...(required ? { required: true } : {})}
      />
    </Form>,
  );
  return {
    action,
    select: screen.getByLabelText('Stage') as HTMLSelectElement,
    submit: () => userEvent.click(screen.getByRole('button', { name: 'Save' })),
  };
}

describe('a required Choice opens on nothing, not on its first option', () => {
  it('does not run the action while nothing is chosen', async () => {
    const { select, submit, action } = formWithChoice(true);

    expect(select.value).toBe('');
    expect(select.validity.valueMissing).toBe(true);

    await submit();
    expect(action).not.toHaveBeenCalled();
  });

  it('runs the action once a choice is made', async () => {
    // The discriminating half — see `Field`'s required tests for why this is
    // a separate test rather than a continuation of the one above.
    const { select, submit, action } = formWithChoice(true);

    await userEvent.selectOptions(select, 'lead');
    expect(select.validity.valueMissing).toBe(false);

    await submit();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('prompts rather than dashes', () => {
    const { select } = formWithChoice(true);
    expect(select.options[0]?.textContent).toBe('Choose…');
    expect(select.options[0]?.value).toBe('');
  });
});

describe('an optional Choice keeps its dash and never refuses', () => {
  it('opens empty and submits empty without complaint', async () => {
    const { select, submit, action } = formWithChoice(false);

    expect(select.value).toBe('');
    expect(select.validity.valueMissing).toBe(false);
    expect(select.options[0]?.textContent).toBe('—');

    await submit();
    expect(action).toHaveBeenCalledTimes(1);
  });
});

/**
 * `Notice` — the general form `AbsentNotice` and `Refusal`
 * are each one instance of. `role` follows the design's own samples: every
 * `bad` notice in the twelve design files carries `role="alert"`, every
 * `warn`/`info` one carries `role="note"`.
 */
describe('Notice carries the role its tone earns', () => {
  it('bad is an alert', () => {
    render(
      <Notice tone="bad" title="Refused">
        Nothing was saved.
      </Notice>,
    );
    expect(screen.getByRole('alert')).toBeDefined();
  });

  for (const tone of ['neutral', 'info', 'warn'] as const) {
    it(`${tone} is a note`, () => {
      render(
        <Notice tone={tone} title="Heads up">
          Something worth reading.
        </Notice>,
      );
      expect(screen.getByRole('note')).toBeDefined();
    });
  }
});

describe('Notice renders its parts', () => {
  it('title, body and an action', () => {
    render(
      <Notice tone="info" title="A title" actions={<button type="button">Do it</button>}>
        The body sentence.
      </Notice>,
    );
    expect(screen.getByText('A title')).toBeDefined();
    expect(screen.getByText('The body sentence.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Do it' })).toBeDefined();
  });

  it('renders with no title and no actions', () => {
    render(<Notice tone="neutral">Just a sentence.</Notice>);
    expect(screen.getByText('Just a sentence.')).toBeDefined();
  });
});

/**
 * `Section` is the design's card: a head with the title and its sub, and a
 * body that pads itself unless `bare` — a table or a list that carries its
 * own inset — in which case children render exactly as given.
 */
describe('Section — the design’s card', () => {
  it('renders the title, the sub and the body', () => {
    render(
      <Section title="Open" sub="12 today">
        <p>Body</p>
      </Section>,
    );
    expect(screen.getByText('Open')).toBeDefined();
    expect(screen.getByText('12 today')).toBeDefined();
    expect(screen.getByText('Body').closest('.card-b')).not.toBeNull();
  });

  it('bare: a table keeps its own padding, no body wraps it', () => {
    const { container } = render(
      <Section title="Open" bare>
        <table>
          <tbody>
            <tr>
              <td>A row</td>
            </tr>
          </tbody>
        </table>
      </Section>,
    );
    expect(screen.getByRole('cell', { name: 'A row' })).toBeDefined();
    expect(container.querySelector('.card-b')).toBeNull();
  });
});

/**
 * `Pill`'s tones. `info` is gone from the type — a compile-time guarantee,
 * checked by `pnpm typecheck` rather than here, since there is no runtime
 * value to construct for a member a union no longer has. `waiting` and
 * `active` are the two additions; all six just need to keep showing their
 * label, since the tone itself is a colour and a leading dot with nothing
 * accessible to assert beyond the text every tone already carries.
 */
describe('Pill renders every tone', () => {
  const TONES: readonly PillTone[] = ['ok', 'warn', 'bad', 'waiting', 'active', 'idle'];

  for (const tone of TONES) {
    it(`${tone} shows its label`, () => {
      render(<Pill tone={tone}>Label</Pill>);
      expect(screen.getByText('Label')).toBeDefined();
    });
  }
});
