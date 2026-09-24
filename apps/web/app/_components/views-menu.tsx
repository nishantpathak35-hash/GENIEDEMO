import type { ReactNode } from 'react';
import type { SavedView } from '@cog/contracts';
import { Icon, ViewSwitch } from '@cog/design-system';
import { removeView, saveView } from '../actions/views';
import { star } from '../actions/preferences';

/**
 * The list's title as the view's name with a chevron, and what opens under
 * it (`docs/design/07-buying.html`): the firm's views, then yours, a star on
 * each that is a favourite, and *+ New view* with the criteria the address
 * carries now. Choosing a view is a navigation to `?view=<id>` — the server
 * applies the view's criteria where the address is silent — so a view can be
 * sent to somebody like any other filtered list.
 */
export function ViewsMenu({
  listKey,
  base,
  views,
  currentViewId,
  defaultName,
  criteria,
  columns,
  mayShare,
}: {
  listKey: string;
  base: string;
  views: readonly SavedView[];
  currentViewId: string | null;
  /** The unfiltered list's name — *All orders*. */
  defaultName: string;
  /** The filters on now, as a new view would keep them. */
  criteria: Readonly<Record<string, string>>;
  /** The columns chosen now, or null for the default. */
  columns: readonly string[] | null;
  /** Whether the server would take a firm-wide view from this person. */
  mayShare: boolean;
}): ReactNode {
  const current = views.find((v) => v.id === currentViewId) ?? null;
  const firm = views.filter((v) => v.ownerId === null);
  const mine = views.filter((v) => v.ownerId !== null);
  const group = (title: string, list: readonly SavedView[]): ReactNode =>
    list.length === 0 ? null : (
      <div className="views-group" role="group" aria-label={title}>
        <p className="menu-t">{title}</p>
        {list.map((v) => (
          <div key={v.id} className={`views-row${v.id === currentViewId ? ' is-current' : ''}`}>
            <a className="views-link" role="option" aria-selected={v.id === currentViewId} href={`${base}?view=${v.id}`}>
              {v.name}
              <small>{Object.entries(v.criteria).map(([k, val]) => `${k}: ${val}`).join(' · ') || 'no filter'}</small>
            </a>
            <form action={star.bind(null, 'view', v.id, !v.starred, base)}>
              <button type="submit" className={`btn icon ghost sm star${v.starred ? ' on' : ''}`} aria-label={v.starred ? `Unstar ${v.name}` : `Star ${v.name}`} aria-pressed={v.starred}>
                <Icon name="star" size="sm" />
              </button>
            </form>
            {v.ownerId !== null || mayShare ? (
              <form action={removeView}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="base" value={base} />
                <button type="submit" className="btn icon ghost sm" aria-label={`Remove the view ${v.name}`}>
                  <Icon name="x" size="sm" />
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    );
  return (
    <ViewSwitch name={current?.name ?? defaultName}>
      <div className="views-group" role="group" aria-label="The list">
        <a className="views-link" role="option" aria-selected={current === null} href={base}>
          {defaultName}
          <small>no filter</small>
        </a>
      </div>
      {group('The firm’s views', firm)}
      {group('Your views', mine)}
      <details className="views-new">
        <summary className="link-btn">
          <Icon name="plus" size="sm" />
          New view
        </summary>
        <form action={saveView} className="views-form">
          <input type="hidden" name="list" value={listKey} />
          <input type="hidden" name="base" value={base} />
          {Object.entries(criteria).map(([k, v]) => (
            <input key={k} type="hidden" name={`criteria.${k}`} value={v} />
          ))}
          <input type="hidden" name="columns" value={columns === null ? '' : columns.join(',')} />
          <div className="field">
            <label htmlFor={`view-name-${listKey}`}>Name</label>
            <input id={`view-name-${listKey}`} name="name" required maxLength={80} placeholder="Waiting on me" />
            <span className="hint">
              Keeps {Object.keys(criteria).length === 0 ? 'no filter' : `the filters on now: ${Object.entries(criteria).map(([k, v]) => `${k}: ${v}`).join(', ')}`}
              {columns === null ? '' : ' and the columns you chose'}.
            </span>
          </div>
          {mayShare ? (
            <label className="check-row">
              <span className="ico">
                <input type="checkbox" name="shared" />
              </span>
              <span>For the whole firm</span>
            </label>
          ) : null}
          <div className="actions">
            <button type="submit" className="btn primary sm">
              Save the view
            </button>
          </div>
        </form>
      </details>
    </ViewSwitch>
  );
}
