import type { ReactNode } from 'react';
import { Icon, type IconName } from './sprite.js';

/**
 * The published elements the kit lacked (`docs/design/COMPONENT-MAP.md` §3;
 * `01-components.html`): a tag, a badge, a tooltip, a banner, an inline
 * message, a switch, the three waits, the kebab, the column control, the
 * saved-views menu, the document toolbar. Each is plain markup over the one
 * stylesheet; none holds state the address or the server does not.
 *
 * Blue is the brand and every affordance, never a status; red is confined to
 * money the wrong way, a refusal and a failure. A lozenge (`Pill`) is a
 * status; a `Tag` is a label someone applied or a removable filter; a
 * `Badge` is a count — never a status.
 */

/** A count. Neutral, `important` for the bell and what has gone wrong, `primary` on a selected thing. */
export function Badge({
  count,
  tone,
  say,
}: {
  count: number;
  tone?: 'important' | 'primary';
  /** What the count counts, for a reader. */
  say?: string;
}): ReactNode {
  return (
    <span className={tone === undefined ? 'badge' : `badge ${tone}`} {...(say === undefined ? {} : { title: `${String(count)} ${say}` })}>
      {count}
      {say === undefined ? null : <span className="sr-only"> {say}</span>}
    </span>
  );
}

/** A label someone applied. */
export function Tag({ children }: { children: ReactNode }): ReactNode {
  return <span className="tag">{children}</span>;
}

/** A hint on hover and focus; the wrapper carries the text for a reader too. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }): ReactNode {
  return (
    <span className="has-tip" tabIndex={0} aria-label={text}>
      {children}
      <span className="tooltip" role="tooltip" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/** A page-level message across the top of the page, in the published four tones. */
export function Banner({
  tone,
  title,
  children,
  actions,
}: {
  tone: 'info' | 'warn' | 'bad' | 'ok';
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon name={tone === 'ok' ? 'check-circle' : tone === 'info' ? 'info' : 'alert'} />
      <div>
        <b>{title}</b>
        {children === undefined ? null : <p>{children}</p>}
        {actions === undefined ? null : <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

/** A short message beside the thing it is about, with an icon; the published inline message. */
export function InlineMessage({ tone, children }: { tone: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }): ReactNode {
  return (
    <span className={`inline-msg ${tone}`}>
      <Icon name={tone === 'ok' ? 'check-circle' : tone === 'info' ? 'info' : 'alert'} size="sm" />
      <span>{children}</span>
    </span>
  );
}

/** A `role="switch"` control: on or off, submitted as a form. */
export function Switch({
  name,
  label,
  checked,
  describedBy,
}: {
  name: string;
  label: string;
  checked: boolean;
  describedBy?: string;
}): ReactNode {
  return (
    <label className="toggle-row">
      <input type="checkbox" role="switch" className="toggle" name={name} defaultChecked={checked} aria-checked={checked} {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })} />
      <span>{label}</span>
    </label>
  );
}

/** A short wait inside a component or a button. */
export function Spinner({ size = 'm', label }: { size?: 's' | 'm' | 'l'; label?: string }): ReactNode {
  return (
    <span className={`spinner ${size}`} {...(label === undefined ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label })}>
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" />
      </svg>
    </span>
  );
}

/** A known amount done. `pct` is the server's, an integer 0–100. */
export function ProgressBar({ pct, label }: { pct: number; label: string }): ReactNode {
  return (
    <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <span className="fill" style={{ width: `${String(pct)}%` }} />
    </div>
  );
}

/** A menu behind a button, closed by default; `details` so it works before the browser runs a line of script. */
export function Menu({
  label,
  icon,
  className,
  children,
  align = 'end',
}: {
  label: string;
  icon?: IconName;
  className?: string;
  children: ReactNode;
  align?: 'start' | 'end';
}): ReactNode {
  return (
    <details className={`menu-wrap${className === undefined ? '' : ` ${className}`}`}>
      <summary className={icon === undefined ? 'btn' : 'btn icon'} aria-haspopup="menu" aria-label={label} title={label}>
        {icon === undefined ? label : <Icon name={icon} />}
      </summary>
      <div className={`popup menu-pop ${align}`} role="menu" aria-label={label}>
        {children}
      </div>
    </details>
  );
}

export function MenuItem({ href, icon, children, hint }: { href: string; icon?: IconName; children: ReactNode; hint?: string }): ReactNode {
  return (
    <a className="menu-i" role="menuitem" href={href}>
      {icon === undefined ? null : <Icon name={icon} />}
      <span className="menu-c">
        <span>{children}</span>
        {hint === undefined ? null : <small>{hint}</small>}
      </span>
    </a>
  );
}

/** The list's kebab, open: what is about the list, not a row. */
export function KebabMenu({
  sortHrefs,
  exportHref,
  refreshHref,
  columnsHref,
}: {
  sortHrefs: ReadonlyArray<readonly [string, string]>;
  exportHref?: string;
  refreshHref: string;
  columnsHref?: string;
}): ReactNode {
  return (
    <Menu label="More actions" icon="more" className="kebab-wrap">
      <p className="menu-t">Sort by</p>
      <ul className="menu">
        {sortHrefs.map(([label, href]) => (
          <li key={href} role="none">
            <MenuItem href={href}>{label}</MenuItem>
          </li>
        ))}
      </ul>
      <ul className="menu">
        {exportHref === undefined ? null : (
          <li role="none">
            <MenuItem href={exportHref} icon="download">
              Export
            </MenuItem>
          </li>
        )}
        <li role="none">
          <MenuItem href={refreshHref} icon="refresh">
            Refresh
          </MenuItem>
        </li>
        {columnsHref === undefined ? null : (
          <li role="none">
            <MenuItem href={columnsHref} icon="columns">
              Columns
            </MenuItem>
          </li>
        )}
      </ul>
    </Menu>
  );
}

/**
 * The column control: a checklist of the table's columns with identity and
 * the decision locked, kept per person on the server (the preference store)
 * — the one piece of list state not in the address.
 */
export function ColumnControl({
  columns,
  chosen,
  action,
  listKey,
  compact,
}: {
  columns: ReadonlyArray<{ readonly key: string; readonly label: string; readonly locked: boolean }>;
  chosen: readonly string[] | null;
  /** The form action that writes the choice. */
  action: (form: FormData) => Promise<void>;
  listKey: string;
  compact?: boolean;
}): ReactNode {
  const on = (key: string): boolean => chosen === null || chosen.includes(key);
  return (
    <details className="colwrap">
      <summary className={compact === true ? 'btn icon' : 'btn'} aria-haspopup="dialog" {...(compact === true ? { 'aria-label': 'Columns' } : {})}>
        <Icon name="columns" />
        {compact === true ? null : 'Columns'}
      </summary>
      <form action={action} className="cols-pop" role="dialog" aria-label="Columns">
        <input type="hidden" name="list" value={listKey} />
        <p className="cols-h">Show these columns</p>
        <ul>
          {columns.map((c) => (
            <li key={c.key}>
              <label className={c.locked ? 'lock' : undefined}>
                <span className="ico">
                  <input type="checkbox" name="column" value={c.key} defaultChecked={c.locked || on(c.key)} disabled={c.locked} />
                </span>
                <span>{c.label}</span>
                {c.locked ? (
                  <>
                    <Icon name="lock" size="sm" />
                    <small>always shown</small>
                  </>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
        <div className="cols-f">
          <button type="submit" name="reset" value="1" className="link-btn">
            Back to the default columns
          </button>
          <button type="submit" className="btn sm primary">
            Apply
          </button>
        </div>
      </form>
    </details>
  );
}

/** The list's title as the view's name with a chevron; opens the saved views. */
export function ViewSwitch({ name, children }: { name: string; children: ReactNode }): ReactNode {
  return (
    <details className="views-wrap">
      <summary className="view-switch" aria-haspopup="listbox">
        {name}
        <Icon name="chevron" size="sm" />
      </summary>
      <div className="popup views-menu page-theme" role="listbox" aria-label="Views">
        {children}
      </div>
    </details>
  );
}

/** A document opens with PDF and Send, then the decision or the money action its state allows. */
export function DocToolbar({ pdfHref, sendHref, children }: { pdfHref?: string; sendHref?: string; children?: ReactNode }): ReactNode {
  return (
    <div className="doc-tb">
      {pdfHref === undefined ? null : (
        <a className="btn" href={pdfHref}>
          <Icon name="download" />
          PDF
        </a>
      )}
      {sendHref === undefined ? null : (
        <a className="btn" href={sendHref}>
          Send
        </a>
      )}
      {children}
    </div>
  );
}

/** A paperclip in a list's last column, named for a reader, where the record has a file; a dash where it has none. */
export function AttachmentClip({ what }: { what: string | null }): ReactNode {
  return what === null ? (
    <span className="muted" aria-hidden="true">
      —
    </span>
  ) : (
    <span className="clip" title={what}>
      <Icon name="paperclip" size="sm" />
      <span className="sr-only">{what}</span>
    </span>
  );
}
