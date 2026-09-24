import type { Loaded } from './data.js';

/**
 * What a form gets back, for every form in this app.
 *
 * Three outcomes and no fourth: it worked, the server refused with a reason a
 * person can act on, or nothing was reached. A refusal is rendered as the
 * server's own message rather than "something went wrong" — the messages are
 * written to be read (`a scale needs both a pixel count and a unit count`,
 * `refused while an order references it`), and replacing them with a generic
 * string throws away the only part of the response a user can do anything with.
 *
 * `MoneyInputError` is caught here too, and that is deliberate: a typo in a
 * rupee field is an ordinary outcome, and `packages/money` throws rather than
 * coercing it to zero the way the legacy's `money()` does.
 */

export interface ActionState {
  readonly error: string | null;
  readonly ok: string | null;
  /**
   * Which fields the refusal names, keyed by field `name`. `Form` provides
   * this map by context; `Field`, `Choice`, `Picker` and `MoneyField` read
   * their own name out of it when no `error` prop was given directly. Absent
   * rather than `{}` on success, so a succeeded state can never be read as
   * "zero fields failed".
   */
  readonly errors?: Readonly<Record<string, string>>;
}

export const IDLE: ActionState = { error: null, ok: null };

/**
 * A form whose answer includes server-computed totals.
 *
 * Lives here rather than beside the action that uses it because a `'use server'`
 * module may export only async functions — a plain object exported from one is
 * a request-time failure that a build does not catch.
 */
export interface PricedState extends ActionState {
  readonly totals: { taxable: string; gst: string; gross: string } | null;
}

export const PRICED_IDLE: PricedState = { error: null, ok: null, totals: null };

/**
 * `fields`, when given, is the per-field message map `Form` threads to
 * `Field`/`Choice`/`Picker`/`MoneyField` by context — the banner says *what*
 * failed and the fields say *where*, and neither replaces the other.
 */
export function failed(
  message: string,
  fields?: Readonly<Record<string, string>>,
): ActionState {
  return { error: message, ok: null, ...(fields === undefined ? {} : { errors: fields }) };
}

export function succeeded(message: string): ActionState {
  return { error: null, ok: message };
}

/** The message for a read or write that did not succeed. */
export function messageFor(loaded: Exclude<Loaded<unknown>, { kind: 'ok' }>): string {
  return loaded.kind === 'unreachable'
    ? 'The API is not reachable. Nothing was saved.'
    : `${loaded.error.message} (${loaded.error.code}, request ${loaded.error.requestId})`;
}

/**
 * Read one required text field from a submitted form.
 *
 * Returns `null` rather than throwing, so a missing field is a message beside
 * the form rather than a stack trace in a server log.
 */
export function text(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

/** An optional field: absent when it was left blank, never an empty string. */
export function optionalText(form: FormData, name: string): string | undefined {
  const value = text(form, name);
  return value.length === 0 ? undefined : value;
}

export function checked(form: FormData, name: string): boolean {
  return form.get(name) !== null;
}
