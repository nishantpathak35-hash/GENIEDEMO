import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatRupeesOrEmpty, parseRupeesToWire } from '@cog/money';
import { Money, MoneyExact, MoneyField, Form } from '../src/index.js';
import { IDLE, type ActionState } from '../src/action-state.js';

/**
 * A wire string in, a rupee figure out. Never raw paise, never a float.
 *
 * `PaiseWire` is a digit-only STRING, so rendering one raw is type-correct,
 * lint-clean, and looks like a number on the screen. Nothing in the type system
 * can tell `"1098700"` printed as itself from `"₹10,987.00"`; only reading the
 * output can, which is why these assertions are here and not in a unit test of
 * the formatter.
 *
 * Indian grouping: the first separator falls after three digits and every later
 * one after two — ₹1,00,00,000.00, not ₹10,000,000.00. Getting that wrong is
 * not cosmetic on an invoice a client signs.
 */

const noop = async (): Promise<ActionState> => IDLE;

describe('Money renders a wire string as rupees', () => {
  it('groups in the Indian convention at crore scale', () => {
    // ₹1,00,00,000.00 — one crore rupees, as 100_000_000 paise.
    render(<MoneyExact wire="1000000000" />);
    expect(screen.getByText('₹1,00,00,000.00')).toBeDefined();
  });

  it('renders zero as zero', () => {
    render(<MoneyExact wire="0" />);
    expect(screen.getByText('₹0.00')).toBeDefined();
  });

  it('puts the sign OUTSIDE the symbol on a negative amount', () => {
    // `-₹50.00`, not `₹-50.00`. The second reads as a typo; the first reads as
    // a credit, which is what it is.
    render(<MoneyExact wire="-5000" />);
    expect(screen.getByText('-₹50.00')).toBeDefined();
  });

  it('NEVER renders the raw paise digits', () => {
    // The failure this whole layer exists to prevent. `10987` on a screen is a
    // plausible figure and a wrong one by a factor of a hundred.
    const { container } = render(<MoneyExact wire="1098700" />);
    expect(container.textContent).toBe('₹10,987.00');
    expect(container.textContent).not.toContain('1098700');
  });

  it('renders an absent figure as an absence, not as zero', () => {
    // Several server figures are nullable on purpose — a takeoff total with an
    // uncosted item, a contract value nobody has entered. `₹0.00` there is a
    // claim, and an under-priced quotation is how it goes out (TAKE-01).
    const { container } = render(<Money wire={null} />);
    expect(container.textContent).not.toContain('0.00');
    expect(container.textContent?.trim()).not.toBe('');
  });
});

describe('MoneyField never puts paise in an editable box', () => {
  it('round-trips: what it shows, parsed back as rupees, is the amount it was given', async () => {
    // The strongest available statement, and it is the one that catches the
    // real bug. Handing `MoneyField` — labelled *rupees, up to two decimals* —
    // a `PaiseWire` straight from the API renders a plausible number that the
    // browser guard cannot see, because an `<input value>` is not `innerText`.
    // Saving then re-reads those digits as rupees and multiplies by a hundred,
    // once per round trip.
    const wire = '1098700';

    render(
      <Form action={noop} submitLabel="Save">
        <MoneyField name="amount" label="Amount" defaultValue={formatRupeesOrEmpty(wire)} />
      </Form>,
    );

    const input = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(input.value).toBe('10,987.00');
    expect(input.value).not.toBe(wire);
    expect(parseRupeesToWire(input.value)).toBe(wire);
  });

  it('shows an absent amount as an empty box, not as a dash', () => {
    // A dash typed back into a rupee input is not a number. Empty is the
    // absence a form already means by empty.
    render(
      <Form action={noop} submitLabel="Save">
        <MoneyField name="amount" label="Amount" defaultValue={formatRupeesOrEmpty(null)} />
      </Form>,
    );
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('');
  });
});
