import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Picker } from '../src/index.js';
import { IDLE, type ActionState } from '../src/action-state.js';

/**
 * What the vendor picker SUBMITS.
 *
 * This is the security-shaped one, and until now the guarantee was structural
 * only: there is no hidden id field, so nothing can go stale. A structural
 * argument is worth having and is not worth trusting on its own — the
 * structure is one refactor away from a hidden input somebody adds because it
 * seemed simpler.
 *
 * The thing under test is `FormData`, not the markup. `FormData(form)` is what
 * the browser sends and what the server action receives, so an assertion about
 * it is an assertion about the request. These tests read it from inside the
 * action, because React 19 RESETS a form after a function action resolves — a
 * `new FormData(form)` taken after the click is empty, and a test written that
 * way would pass for the wrong reason.
 *
 * The failure being prevented: keying a rate contract by a vendor NAME. The
 * legacy matches vendors with `LIKE '%…%'`, so "Ashvale Interiors" and
 * "Ashvale Interiors Pvt Ltd" are one supplier on Tuesday and two on Wednesday.
 * A picker that submitted its typed text would reintroduce exactly that, inside
 * the component written to remove it.
 */

const ASHVALE = '11111111-1111-4111-8111-111111111111';
const BRIGHTMOOR = '22222222-2222-4222-8222-222222222222';

const VENDORS = [
  { id: ASHVALE, name: 'Ashvale Interiors Private Limited' },
  { id: BRIGHTMOOR, name: 'Brightmoor Contracts LLP' },
];

/** Renders a picker inside a real form and reports what that form submits. */
function pickerForm(options: { required?: boolean } = {}) {
  const submitted: Record<string, string>[] = [];
  const action = vi.fn(async (_s: ActionState, form: FormData): Promise<ActionState> => {
    submitted.push(Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])));
    return IDLE;
  });

  const view = render(
    <Form action={action} submitLabel="Save">
      <Picker
        name="vendorId"
        label="Vendor"
        options={VENDORS}
        {...(options.required === true ? { required: true } : {})}
      />
    </Form>,
  );

  return {
    ...view,
    submitted,
    // The label is on the SEARCH box — it is the control a person types into.
    search: screen.getByLabelText('Vendor') as HTMLInputElement,
    // By NAME, not by role. `name="vendorId"` is the contract these tests are
    // about — it is what puts a value in the payload — and querying for it says
    // so. (`getByRole('combobox')` also does not match: the explicit `size={1}`
    // moves a `<select>`'s implicit role to `listbox`.)
    select: view.container.querySelector('select[name="vendorId"]') as HTMLSelectElement,
    submit: () => userEvent.click(screen.getByRole('button', { name: 'Save' })),
  };
}

describe('the picker submits an id and never a name', () => {
  it('submits the id of the option that was chosen', async () => {
    const { search, select, submit, submitted } = pickerForm();

    await userEvent.type(search, 'Ashvale');
    await userEvent.selectOptions(select, ASHVALE);
    await submit();

    // Exactly one entry, and it is the id. Not "contains the id" — the search
    // box must contribute NOTHING, and an extra key here would be it.
    expect(submitted[0]).toEqual({ vendorId: ASHVALE });
  });

  it('submits nothing at all from the search box', async () => {
    const { search, submit, submitted } = pickerForm();

    // Typed, never chosen. A person who types a name and presses Save has not
    // picked a vendor, and the form must not pretend they did.
    await userEvent.type(search, 'Brightmoor Contracts LLP');
    await submit();

    const sent = submitted[0] ?? {};
    expect(Object.keys(sent)).toEqual(['vendorId']);
    expect(sent['vendorId']).toBe('');
    // No key anywhere carries the typed text — this is the assertion that a
    // hidden-input implementation would fail.
    expect(Object.values(sent).join('|')).not.toContain('Brightmoor');
  });

  it('KEEPS THE CHOSEN VENDOR when the text is edited to name a different one', async () => {
    // The exact defect the design avoids. With a visible text box plus a hidden
    // id, choosing Ashvale and then editing the text to "Brightmoor" submits
    // Brightmoor's NAME with Ashvale's id, the server trusts the id, and the
    // record is written against a vendor the person did not choose while the
    // screen never disagreed with them.
    //
    // Here the id can only come from the select, so the submitted value is
    // still Ashvale — and, crucially, the screen still SHOWS Ashvale.
    const { search, select, submit, submitted } = pickerForm();

    await userEvent.selectOptions(select, ASHVALE);
    await userEvent.clear(search);
    await userEvent.type(search, 'Brightmoor');

    // What is DISPLAYED is checked BEFORE the submit, not after. React 19
    // resets a form once its action resolves, so `select.value` afterwards is
    // '' whatever happened — a post-submit assertion here would pass or fail
    // for a reason that has nothing to do with this component.
    expect(select.value).toBe(ASHVALE);

    await submit();
    expect(submitted[0]).toEqual({ vendorId: ASHVALE });
  });

  it('there is no hidden field to go stale', () => {
    const { container, search } = pickerForm();

    expect(container.querySelector('input[type="hidden"]')).toBeNull();
    // The search box carries no `name`, which is what keeps it out of the
    // payload. `getAttribute` rather than `.name`, because the DOM property
    // reports '' for an absent attribute and '' is also a legal name.
    expect(search.getAttribute('name')).toBeNull();
  });
});

describe('Picker shows its own error under the select, not the search box', () => {
  it('marks the select invalid and describes it with the message', () => {
    const { container } = render(
      <Form action={vi.fn(async (): Promise<ActionState> => IDLE)} submitLabel="Save">
        <Picker name="vendorId" label="Vendor" options={VENDORS} error="Choose a vendor" />
      </Form>,
    );

    const select = container.querySelector('select[name="vendorId"]') as HTMLSelectElement;
    const message = screen.getByText('Choose a vendor');

    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe(message.id);
    // The search box is a filter, not the answer — it never carries the
    // invalid state itself.
    expect(screen.getByLabelText('Vendor').getAttribute('aria-invalid')).toBeNull();
  });

  it('plain: no error, no aria-invalid', () => {
    const { container } = render(
      <Form action={vi.fn(async (): Promise<ActionState> => IDLE)} submitLabel="Save">
        <Picker name="vendorId" label="Vendor" options={VENDORS} />
      </Form>,
    );
    const select = container.querySelector('select[name="vendorId"]') as HTMLSelectElement;
    expect(select.getAttribute('aria-invalid')).toBeNull();
  });

  it('with no options: says so, and still submits an empty choice', async () => {
    const action = vi.fn(async (_s: ActionState, form: FormData): Promise<ActionState> => {
      void form;
      return IDLE;
    });
    render(
      <Form action={action} submitLabel="Save">
        <Picker name="vendorId" label="Vendor" options={[]} />
      </Form>,
    );

    expect(screen.getByText('Nothing to choose from yet.')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('the chosen option survives a search that excludes it', () => {
  it('keeps the selection AND keeps the option rendered', async () => {
    // Filtering a native select down to a set that omits the current value
    // makes the browser silently move the selection to whatever is left. On
    // this screen that means signing a rate contract with the wrong vendor,
    // with nothing on screen having changed to say so.
    const { search, select, submitted, submit } = pickerForm();

    await userEvent.selectOptions(select, ASHVALE);
    expect(select.value).toBe(ASHVALE);

    await userEvent.type(search, 'Brightmoor');

    // Both halves. The value alone could be state pointing at an option that is
    // no longer in the document, which submits correctly and displays nothing.
    expect(select.value).toBe(ASHVALE);
    expect(screen.getByRole('option', { name: VENDORS[0]!.name })).toBeDefined();

    // And the filter did run, or this test proves only that nothing happened.
    expect(screen.queryByRole('option', { name: VENDORS[1]!.name })).not.toBeNull();
    await userEvent.clear(search);
    await userEvent.type(search, 'Ashvale');
    expect(screen.queryByRole('option', { name: VENDORS[1]!.name })).toBeNull();

    await submit();
    expect(submitted[0]).toEqual({ vendorId: ASHVALE });
  });
});
