'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import { useActionState } from 'react';
import { IDLE, type ActionState } from './action-state.js';
import { Notice } from './ui.js';

/**
 * Every form in this app, wrapped once.
 *
 * It exists so the three outcomes are rendered the same way everywhere: the
 * server's own refusal message, the server's own success message, or nothing.
 * A per-screen `catch` that writes "something went wrong" would throw away the
 * only useful part of a refusal — `refused while an order references it` tells
 * a person what to do next; a generic string does not.
 *
 * Note what it does NOT do: it never disables a control because of a role. A
 * screen renders what the server said, and the server refuses what it refuses.
 */

const EMPTY_ERRORS: Readonly<Record<string, string>> = {};

/**
 * The per-field message map, provided by the nearest `Form`.
 *
 * Not part of the package's public surface — `Field`, `Choice`, `Picker` and
 * `MoneyField` read their own name out of it so a caller never has to thread
 * `errors.code` down by hand, but nothing outside this package should reach
 * into the context directly.
 */
const FormErrorsContext = createContext<Readonly<Record<string, string>>>(EMPTY_ERRORS);

/**
 * A field's own message: the explicit prop if given, else its name in the
 * nearest `Form`'s map. Exported for `Picker`, which lives in a different
 * file and needs the identical fallback.
 */
export function useFieldError(name: string, explicit: string | undefined): string | undefined {
  const fromForm = useContext(FormErrorsContext)[name];
  return explicit ?? fromForm;
}

/**
 * The ids a labelled control needs for its hint and its error, joined for
 * `aria-describedby`. Built from `useId` rather than `name` — see `Picker`'s
 * docblock for why a field name is not always unique on the page.
 */
export function describedByIds(uid: string, hasHint: boolean, hasError: boolean): string {
  const ids: string[] = [];
  if (hasHint) ids.push(`${uid}-hint`);
  if (hasError) ids.push(`${uid}-err`);
  return ids.join(' ');
}

export function Form({
  action,
  submitLabel,
  pendingLabel,
  children,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
}): ReactNode {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const fieldCount = state.errors === undefined ? 0 : Object.keys(state.errors).length;

  return (
    <form action={dispatch} className="stack">
      <FormErrorsContext.Provider value={state.errors ?? EMPTY_ERRORS}>
        {children}
      </FormErrorsContext.Provider>
      {state.error === null ? null : (
        <Notice tone="bad" title={state.error}>
          Nothing was saved.
          {fieldCount === 0
            ? ''
            : fieldCount === 1
              ? ' One field needs attention — it is marked below.'
              : ` ${fieldCount} fields need attention — they are marked below.`}
        </Notice>
      )}
      {state.ok === null ? null : <Notice tone="neutral">{state.ok}</Notice>}
      <div className="actions">
        <button type="submit" className={pending ? 'btn primary busy' : 'btn primary'} disabled={pending}>
          {pending ? (pendingLabel ?? 'Saving…') : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function Field({
  name,
  label,
  hint,
  type = 'text',
  required = false,
  defaultValue,
  placeholder,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
}): ReactNode {
  const message = useFieldError(name, error);
  const uid = useId();
  const describedBy = describedByIds(uid, hint !== undefined, message !== undefined);

  return (
    <div className={message === undefined ? 'field' : 'field invalid'}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        {...(defaultValue === undefined ? {} : { defaultValue })}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(message === undefined ? {} : { 'aria-invalid': true as const })}
        {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
      />
      {hint === undefined ? null : (
        <span className="hint" id={`${uid}-hint`}>
          {hint}
        </span>
      )}
      {message === undefined ? null : (
        <span className="err" id={`${uid}-err`}>
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * A required select that opens on nothing, not on its first option.
 *
 * Was `{required ? null : <option value="">—</option>}` — a required select
 * with no empty option opens pre-selected on its first real value, so a
 * person who never touches the control still submits something, and the form
 * cannot tell "they chose the first one" from "they did not answer". The
 * empty option is now always rendered; when `required` its label prompts
 * rather than dashes, and the browser refuses submission until it is left.
 */
export function Choice({
  name,
  label,
  options,
  hint,
  required = false,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}): ReactNode {
  const message = useFieldError(name, error);
  const uid = useId();
  const describedBy = describedByIds(uid, hint !== undefined, message !== undefined);

  return (
    <div className={message === undefined ? 'field' : 'field invalid'}>
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        required={required}
        {...(defaultValue === undefined ? {} : { defaultValue })}
        {...(message === undefined ? {} : { 'aria-invalid': true as const })}
        {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
      >
        <option value="">{required ? 'Choose…' : '—'}</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {hint === undefined ? null : (
        <span className="hint" id={`${uid}-hint`}>
          {hint}
        </span>
      )}
      {message === undefined ? null : (
        <span className="err" id={`${uid}-err`}>
          {message}
        </span>
      )}
    </div>
  );
}

export function Notes({
  name,
  label,
  hint,
  rows = 3,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  rows?: number;
  defaultValue?: string;
}): ReactNode {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        {...(defaultValue === undefined ? {} : { defaultValue })}
      />
      {hint === undefined ? null : <span className="hint">{hint}</span>}
    </div>
  );
}

/**
 * A rupee field.
 *
 * Text, not `type="number"` — a number input hands back a float and the whole
 * point is that the value stays a string until `parseRupeesToWire` shifts it
 * exactly. The hint says what is accepted, because the parser refuses rather
 * than rounding: `10.005` is an error, not `10.01`.
 *
 * `error` is not read from context here — it is simply handed to `Field`,
 * which already reads its own name out of the nearest `Form` when no `error`
 * prop reaches it. Passing `error` through unchanged is the whole of this
 * component's part in that contract.
 */
export function MoneyField({
  name,
  label,
  hint,
  required = false,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}): ReactNode {
  return (
    <Field
      name={name}
      label={label}
      type="text"
      required={required}
      placeholder="0.00"
      hint={hint ?? 'Rupees, up to two decimals. Separators are allowed.'}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(error === undefined ? {} : { error })}
    />
  );
}
