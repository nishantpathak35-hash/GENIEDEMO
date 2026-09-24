'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, Pill } from '@cog/design-system';
import { projectIdOf } from '../../lib/nav';
import type { ProjectLite } from './side-nav';

/**
 * The project switcher — second in the top bar, after the mark and before
 * the search (`docs/design/03-navigation.html`, the switcher open).
 *
 * A button that opens a dialog holding a combobox and a grouped listbox: a
 * search, then All projects, then Recent — the projects this person opened
 * last, newest first — then Mine, then All active, then Finished folded with
 * its count. Each row is code, name and client; the footer is All projects
 * and New project. Choosing a project navigates to its Overview and the
 * sidebar becomes its tree; there is no × — the way out is the sidebar's
 * ◂ All projects. Keyboard: Tab, Enter or Space open; typing filters; ↑↓ Home
 * End move; Enter chooses; Esc closes without change and returns focus.
 *
 * `held`: the address names a project the server would not resolve —
 * refused, missing, or unreachable — so the switcher holds the words the
 * server gave, on a dashed edge, and never a code it could not look up.
 */
export function ScopeSwitcher({
  projects,
  mine,
  recent,
  held,
}: {
  projects: readonly ProjectLite[];
  mine: readonly string[];
  recent: readonly string[];
  held: string | null;
}): ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const projectId = projectIdOf(pathname);
  const current = projectId === null ? null : (projects.find((p) => p.id === projectId) ?? null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<string>('all');
  const [showFinished, setShowFinished] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    setOpen(false);
    setFilter('');
  }, [pathname]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const finished = (p: ProjectLite): boolean => p.state === 'handed_over' || p.state === 'closed';
  const f = filter.trim().toLowerCase();
  const match = (p: ProjectLite): boolean => f === '' || [p.code, p.name, p.clientName].some((s) => s.toLowerCase().includes(f));
  const groups = useMemo(() => {
    const live = projects.filter((p) => !finished(p));
    const recentRows = f === '' ? recent.map((id) => live.find((p) => p.id === id)).filter((p): p is ProjectLite => p !== undefined) : [];
    const taken = new Set(recentRows.map((p) => p.id));
    const mineRows = live.filter((p) => mine.includes(p.id) && !taken.has(p.id) && match(p));
    const restRows = live.filter((p) => !mine.includes(p.id) && !taken.has(p.id) && match(p));
    const doneRows = projects.filter((p) => finished(p) && match(p));
    return { recentRows, mineRows, restRows, doneRows };
  }, [projects, mine, recent, f]);

  const shown: Array<{ id: string; p: ProjectLite | null }> = [
    ...(f === '' ? [{ id: 'all', p: null }] : []),
    ...groups.recentRows.map((p) => ({ id: p.id, p })),
    ...groups.mineRows.map((p) => ({ id: p.id, p })),
    ...groups.restRows.map((p) => ({ id: p.id, p })),
    ...(f !== '' || showFinished ? groups.doneRows.map((p) => ({ id: p.id, p })) : []),
  ];

  const choose = (id: string): void => {
    setOpen(false);
    router.push(id === 'all' ? '/' : `/projects/${id}`);
  };

  const onKey = (e: React.KeyboardEvent): void => {
    const at = shown.findIndex((s) => s.id === active);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(shown[at + 1 < shown.length ? at + 1 : at]?.id ?? active);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(shown[at > 0 ? at - 1 : 0]?.id ?? active);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(shown[0]?.id ?? active);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(shown[shown.length - 1]?.id ?? active);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown.some((s) => s.id === active)) choose(active);
    }
  };

  const label =
    held !== null ? (
      <span className="sc t">{held}</span>
    ) : current !== null ? (
      <>
        <span className="sc">{current.code}</span>
        <span className="sn">· {current.name.split(',')[0]}</span>
      </>
    ) : (
      <span className="sc">All projects</span>
    );
  const aria =
    held !== null
      ? `${held}. Choose a project`
      : current !== null
        ? `Working in ${current.code}, ${current.name}. Change project`
        : 'Working across all projects. Choose a project';

  const option = (p: ProjectLite | null): ReactNode => {
    const id = p === null ? 'all' : p.id;
    const isCurrent = p === null ? current === null && held === null : current?.id === p.id;
    return (
      <div
        key={id}
        role="option"
        id={`${uid}-o-${id}`}
        className={`opt${p === null ? ' all' : ''}${active === id ? ' active' : ''}`}
        aria-selected={isCurrent}
        onMouseEnter={() => setActive(id)}
        onClick={() => choose(id)}
      >
        <span className="oc">{p === null ? <Icon name="layers" size="sm" /> : hl(p.code, f)}</span>
        <span className="on">
          {p === null ? 'All projects' : hl(p.name, f)}
          <small>{p === null ? `${String(projects.length)} projects you can see` : hl(p.clientName, f)}</small>
        </span>
        {p !== null && finished(p) ? <Pill tone={p.state === 'closed' ? 'idle' : 'ok'}>{p.state === 'closed' ? 'Closed' : 'Handed over'}</Pill> : null}
        {isCurrent ? <Icon name="check" size="sm" /> : null}
      </div>
    );
  };
  const group = (id: string, title: string, rows: readonly ProjectLite[]): ReactNode =>
    rows.length === 0 ? null : (
      <div key={id} role="group" aria-labelledby={`${uid}-g-${id}`}>
        <div className="og" id={`${uid}-g-${id}`}>
          {title}
        </div>
        {rows.map((p) => option(p))}
      </div>
    );

  return (
    <div className={`scope${current !== null || held !== null ? ' on' : ''}${held !== null ? ' held' : ''}`}>
      <button
        ref={button}
        className="scope-btn"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={current !== null ? 'projects' : 'layers'} />
        {label}
        <Icon name="chevron" size="sm" />
      </button>
      {open ? (
        <div className="scope-pop page-theme" role="dialog" aria-label="Choose a project" onKeyDown={onKey}>
          <div className="scope-q">
            <div className="search">
              <Icon name="search" />
              <input
                ref={input}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-autocomplete="list"
                aria-activedescendant={`${uid}-o-${active}`}
                aria-label="Find a project"
                placeholder="Code, project or client"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setActive(shown[0]?.id ?? 'all');
                }}
              />
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="scope-none" role="status">
              No project matches “{filter}”.
              <small>Codes, project names and clients are searched. A project you cannot open is not listed.</small>
            </p>
          ) : (
            <div className="scope-list" role="listbox" id={`${uid}-list`} aria-label="Projects">
              {f === '' ? option(null) : null}
              {group('recent', 'Recent', groups.recentRows)}
              {group('mine', 'Mine', groups.mineRows)}
              {group('rest', 'All active', groups.restRows)}
              {f !== '' || showFinished ? group('done', 'Finished', groups.doneRows) : null}
            </div>
          )}
          {f === '' && !showFinished && groups.doneRows.length > 0 ? (
            <div className="scope-more">
              <button className="link-btn" type="button" onClick={() => setShowFinished(true)}>
                Finished · {groups.doneRows.length}
              </button>
            </div>
          ) : null}
          <div className="scope-foot">
            <a href="/projects">All projects</a>
            <a href="/projects?new=1" className="scope-new">
              <Icon name="plus" size="sm" />
              New project
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The matched part of a name, marked. */
function hl(s: string, f: string): ReactNode {
  const i = f === '' ? -1 : s.toLowerCase().indexOf(f);
  if (i < 0) return s;
  return (
    <>
      {s.slice(0, i)}
      <mark>{s.slice(i, i + f.length)}</mark>
      {s.slice(i + f.length)}
    </>
  );
}
