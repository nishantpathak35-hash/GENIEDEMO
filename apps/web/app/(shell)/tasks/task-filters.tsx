'use client';

import { useRouter } from 'next/navigation';
import type { ChangeEvent, ReactNode } from 'react';
import { Toolbar } from '@cog/design-system';

/**
 * Person and About — the two facets `09-approvals-money.html` shows.
 *
 * A select that navigates on change, so the URL still carries the state: the
 * server component reads `?person=` and `?about=` from `searchParams` and
 * filters the (already-whole) list it already has, the same as a link would.
 * No client state survives a reload, because none is kept here — the two
 * `value`s are exactly the props the server passed in.
 */
export function TaskFilters({
  people,
  about,
  person,
  aboutValue,
}: {
  people: ReadonlyArray<readonly [string, string]>;
  about: ReadonlyArray<readonly [string, string]>;
  person?: string;
  aboutValue?: string;
}): ReactNode {
  const router = useRouter();

  function navigate(next: { readonly person: string | undefined; readonly about: string | undefined }): void {
    const qs = new URLSearchParams();
    if (next.person !== undefined && next.person !== '') qs.set('person', next.person);
    if (next.about !== undefined && next.about !== '') qs.set('about', next.about);
    const s = qs.toString();
    router.push(s.length === 0 ? '/tasks' : `/tasks?${s}`);
  }

  return (
    <Toolbar>
      <div className="field">
        <label htmlFor="f-who">Person</label>
        <select
          id="f-who"
          name="person"
          value={person ?? ''}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            navigate({ person: event.target.value, about: aboutValue })
          }
        >
          <option value="">Choose…</option>
          {people.map(([id, email]) => (
            <option key={id} value={id}>
              {email}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-kind">About</label>
        <select
          id="f-kind"
          name="about"
          value={aboutValue ?? ''}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            navigate({ person, about: event.target.value })
          }
        >
          <option value="">Choose…</option>
          {about.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Toolbar.Spacer />
      <span className="showing">Open first</span>
    </Toolbar>
  );
}
