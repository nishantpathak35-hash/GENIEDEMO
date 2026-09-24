'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { describedByIds, useFieldError } from './form.js';

/**
 * Pick one record out of many by typing its name, and submit its **id**.
 *
 * The distinction is the whole component. Every screen that needed a vendor
 * before this asked for the uuid to be typed in by hand, with a hint saying
 * why: a contract keyed by a vendor NAME is the identity model this rebuild
 * exists to remove. The legacy matches a vendor with `LIKE '%…%'`, so
 * "Ashvale Interiors" and "Ashvale Interiors Pvt Ltd" are one supplier on
 * Tuesday and two on Wednesday. Asking a person to copy a uuid was the honest
 * shape while nothing better existed; it is not a usable one.
 *
 * **What is submitted can only ever be an id that was rendered as an option.**
 * That is a structural property, not a rule the component follows. The obvious
 * build — a visible text box plus a hidden `<input type="hidden">` holding the
 * id — has a defect that reintroduces exactly the confusion it was written to
 * fix: pick "Ashvale", then edit the text to "Brightmoor" without picking
 * again, and the form submits Brightmoor's NAME with Ashvale's id. The server
 * trusts the id, so the record is written against a vendor the person did not
 * choose and the screen never disagreed with them.
 *
 * So there is no hidden field. The search box carries no `name` and is never
 * submitted; the `<select>` carries the `name`, and a select's value is
 * necessarily one of its own options.
 *
 * **The selected option is always rendered, even when the search excludes it.**
 * Filtering a native select down to a set that omits the current value makes
 * the browser silently move the selection to whatever is left — so typing a
 * filter after choosing would change the answer without saying so. Keeping the
 * chosen option in the list makes that impossible.
 *
 * Pure: it takes the options it offers. Fetching them is the screen's job, and
 * a component in this package doing IO would be a different kind of thing.
 */
export function Picker({
  name,
  label,
  options,
  hint,
  required = false,
  defaultValue,
  placeholder = 'Type to search…',
  emptyLabel = '—',
  limit = 100,
  error,
}: {
  name: string;
  label: string;
  /** What may be chosen. `name` is displayed; `id` is what the form carries. */
  options: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  /** How many to render at once. A tenant with 2,000 vendors is not a list. */
  limit?: number;
  error?: string;
}): ReactNode {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(defaultValue ?? '');

  const { shown, hidden } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching =
      needle === ''
        ? options
        : options.filter((o) => o.name.toLowerCase().includes(needle));

    const capped = matching.slice(0, limit);
    // The chosen option survives the filter. See the note above: dropping it
    // would move the selection without telling anyone.
    const chosen = options.find((o) => o.id === selected);
    const list =
      chosen === undefined || capped.some((o) => o.id === chosen.id)
        ? capped
        : [chosen, ...capped];

    return { shown: list, hidden: matching.length - capped.length };
  }, [options, query, selected, limit]);

  // `useId`, not the field name. This component is rendered once per row on
  // Settings > Vendor access — one picker per vendor login — and a DOM id built
  // from `name` would repeat, which makes every `<label htmlFor>` on the screen
  // focus the first row's control.
  const message = useFieldError(name, error);
  const uid = useId();
  const searchId = `${uid}-search`;
  const selectId = `${uid}-value`;
  // The search box is a filter, not the answer — see the docblock. Its own
  // hint/error ids are unused by any control's `aria-describedby`; only the
  // `<select>` is the invalid one.
  const describedBy = describedByIds(uid, hint !== undefined, message !== undefined);

  return (
    <div className={message === undefined ? 'field' : 'field invalid'}>
      <label htmlFor={searchId}>{label}</label>
      <input
        id={searchId}
        type="search"
        // NO `name`. This box is a filter, not an answer — naming it would put
        // a typed string in the payload beside the id, which is the pair that
        // lets the two disagree.
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <select
        id={selectId}
        name={name}
        required={required}
        value={selected}
        size={1}
        onChange={(e) => {
          setSelected(e.target.value);
        }}
        {...(message === undefined ? {} : { 'aria-invalid': true as const })}
        {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
      >
        <option value="">{emptyLabel}</option>
        {shown.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {hidden > 0 ? (
        <span className="hint">
          {hidden} more {hidden === 1 ? 'match is' : 'matches are'} not shown — narrow the search.
        </span>
      ) : null}
      {options.length === 0 ? (
        <span className="hint">Nothing to choose from yet.</span>
      ) : null}
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
