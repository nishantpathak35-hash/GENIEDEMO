'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, relabel, type Terms } from '@cog/design-system';
import { projectIdOf } from '../../lib/nav';
import { ROUTES, matchRoute, type RouteEntry } from '../../lib/routes';

/**
 * The bar's search, 300px on the lifted fill, with its scope inside it
 * (`docs/design/03-navigation.html`): the placeholder says where it looks —
 * *Search in Orders · SAN-01*, *Search everything* — and the toggle beside
 * the field moves between this page, this project and everything.
 *
 * What it reaches today is every screen by name: the route manifest
 * (`lib/routes.ts`), expanded per project for the screens that live under
 * one, so "SAN-01 BOQ" is an entry and not a two-step lookup. A record page
 * — an order, a vendor, a lead — has no name of its own; its entry opens the
 * list it is found in and says so. Records themselves arrive with the scoped
 * search endpoint (README item 8); the scope here already narrows the
 * screens the same way that endpoint will narrow the records.
 *
 * `/` focuses it from anywhere that is not already a text field — unless the
 * person has turned single-key shortcuts off (WCAG 2.1.4), in which case `/`
 * types itself. Pure over what it is given: the projects come from the
 * layout; nothing here fetches, and nothing is stored in the browser.
 */

export interface SearchProject {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

interface Entry {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
  readonly projectId: string | null;
  readonly group: string;
}

type Scope = 'page' | 'project' | 'everything';

/** The kind of record a list page holds — what the search read is asked for on that page. */
const RECORD_KIND_OF: Readonly<Record<string, string>> = {
  '/purchase-orders': 'orders',
  '/projects/[projectId]/orders': 'orders',
  '/vendors': 'vendors',
  '/projects': 'projects',
  '/crm': 'leads',
  '/crm/board': 'leads',
  '/documents': 'documents',
  '/projects/[projectId]/documents': 'documents',
};

function entries(projects: readonly SearchProject[], terms: Terms): Entry[] {
  const out: Entry[] = [];
  const name = (route: RouteEntry): string => relabel(route.name, terms);
  for (const route of ROUTES) {
    if (route.group === 'Project') {
      for (const project of projects) {
        const href = route.via === undefined ? route.pattern : route.via;
        const via = route.via === undefined ? undefined : ROUTES.find((r) => r.pattern === route.via);
        out.push({
          href: href.replace('[projectId]', project.id),
          label: `${project.code} · ${name(route)}`,
          hint: route.via === undefined ? project.name : `open from ${project.code} · ${via === undefined ? terms.boq : name(via)}`,
          projectId: project.id,
          group: route.group,
        });
      }
      continue;
    }
    if (route.via !== undefined) {
      const via = ROUTES.find((r) => r.pattern === route.via);
      out.push({ href: route.via, label: name(route), hint: `open from ${via === undefined ? route.via : name(via)}`, projectId: null, group: route.group });
      continue;
    }
    out.push({ href: route.pattern, label: name(route), hint: route.group, projectId: null, group: route.group });
  }
  return out;
}

export function Search({ projects, singleKey, terms }: { projects: readonly SearchProject[]; singleKey: boolean; terms: Terms }): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const projectId = projectIdOf(pathname);
  const project = projectId === null ? null : (projects.find((p) => p.id === projectId) ?? null);
  const route = matchRoute(pathname);
  // a record page searches the list it was reached through — "Search in Orders", not "in An order"
  const scopeRoute = route?.via === undefined ? route : (matchRoute(route.via) ?? route);
  const pageName = scopeRoute === undefined || scopeRoute.pattern === '/' ? null : relabel(scopeRoute.name, terms);
  const [scope, setScope] = useState<Scope>('everything');
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  // under 760 the search is its button; pressed, the box opens under the bar and takes focus
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) input.current?.focus();
  }, [shown]);
  const all = useMemo(() => entries(projects, terms), [projects, terms]);

  // the scope follows the page: inside a project it is the project, on a list it is that list
  useEffect(() => {
    setScope(project !== null ? 'project' : pageName !== null ? 'page' : 'everything');
  }, [pathname, project, pageName]);

  const where =
    scope === 'project' && project !== null
      ? `Search in ${project.code}`
      : scope === 'page' && pageName !== null
        ? `Search in ${pageName}${project === null ? '' : ` · ${project.code}`}`
        : 'Search everything';

  const needle = query.trim().toLowerCase();

  // the records — the scoped search read, one call per pause in typing: the
  // kind the page lists (orders on Orders, vendors on Vendors…), the project
  // inside one, everything otherwise. Screens come from the manifest below.
  const [records, setRecords] = useState<Entry[]>([]);
  const kind = scopeRoute === undefined ? 'everything' : (RECORD_KIND_OF[scopeRoute.via ?? scopeRoute.pattern] ?? 'everything');
  useEffect(() => {
    if (needle.length < 2) {
      setRecords([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: needle, scope: scope === 'page' ? kind : 'everything' });
      if (scope !== 'everything' && project !== null) params.set('projectId', project.id);
      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((body: { items: Array<{ title: string; subtitle: string; href: string }> }) =>
          setRecords(body.items.map((h) => ({ href: h.href, label: h.title, hint: h.subtitle, projectId: null, group: 'Records' }))),
        )
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle, scope, kind, project]);
  // what the scope holds first, then the rest of everything under "Elsewhere"
  // — a screen's name typed from any page still reaches it, and the list says
  // which matches are the scope's and which are not
  const { matches, elsewhereFrom } = useMemo(() => {
    if (needle === '') return { matches: [], elsewhereFrom: -1 };
    const hit = (e: Entry): boolean => `${e.label} ${e.hint}`.toLowerCase().includes(needle);
    // the name typed exactly first, then names that begin with it, then the rest
    const rank = (e: Entry): number => {
      const label = e.label.toLowerCase();
      return label === needle ? 0 : label.startsWith(needle) ? 1 : label.includes(needle) ? 2 : 3;
    };
    const ranked = (list: Entry[]): Entry[] => list.map((e, i) => ({ e, i, r: rank(e) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.e);
    const pool = all.filter((e) => {
      if (scope === 'project' && project !== null) return e.projectId === project.id;
      if (scope === 'page' && scopeRoute !== undefined) return e.group === scopeRoute.group && (project === null || e.projectId === project.id || e.projectId === null);
      return true;
    });
    // the records the read found come first — they are what a number or a name typed here is for
    const found = records.slice(0, 6);
    const within = [...found, ...ranked(pool.filter(hit))];
    if (scope === 'everything') return { matches: within.slice(0, 12), elsewhereFrom: -1 };
    const inScope = new Set(within);
    const others = ranked(all.filter((e) => hit(e) && !inScope.has(e)));
    const joined = [...within, ...others].slice(0, 12);
    return { matches: joined, elsewhereFrom: others.length === 0 || within.length >= 12 ? -1 : within.length };
  }, [all, needle, scope, project, scopeRoute, records]);

  useEffect(() => {
    if (!singleKey) return undefined;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && isEditable(target)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [singleKey]);

  const listId = `${uid}-results`;
  const go = (entry: Entry | undefined): void => {
    if (entry === undefined) return;
    setOpen(false);
    setQuery('');
    router.push(entry.href);
  };
  const cycle = (): void => {
    const order: Scope[] = [
      ...(pageName !== null ? (['page'] as Scope[]) : []),
      ...(project !== null ? (['project'] as Scope[]) : []),
      'everything',
    ];
    const at = order.indexOf(scope);
    setScope(order[(at + 1) % order.length] ?? 'everything');
  };

  return (
    <>
      <div className={shown ? 'search shown' : 'search'}>
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          placeholder={`${where}${singleKey ? ' ( / )' : ''}`}
          aria-label={where}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(open && matches[active] !== undefined ? { 'aria-activedescendant': `${listId}-${active}` } : {})}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() =>
            setTimeout(() => {
              setOpen(false);
              setShown(false);
            }, 120)
          }
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1 < matches.length ? a + 1 : a));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a > 0 ? a - 1 : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              go(matches[active]);
            } else if (e.key === 'Escape') {
              // Esc closes the top-most thing and never navigates.
              if (query !== '') {
                setQuery('');
                setOpen(false);
              } else {
                input.current?.blur();
              }
            }
          }}
        />
        <button type="button" className="search-scope" aria-label={`Choose where to search — now: ${where}`} title={where} onClick={cycle}>
          <Icon name="chevron" size="sm" />
        </button>
        {open && needle !== '' ? (
          <ul className="search-results page-theme" role="listbox" id={listId} aria-label="Screens">
            {matches.length === 0 ? (
              <li className="none" role="option" aria-selected="false">
                Nothing matches “{query.trim()}” — try a screen, a project code or a setting.
              </li>
            ) : (
              matches.map((entry, index) => (
                <Fragment key={`${entry.href}-${entry.label}`}>
                  {index === elsewhereFrom ? (
                    <li className="none" aria-hidden="true">
                      {index === 0 ? `Nothing in ${where.replace(/^Search in /, '')} — elsewhere:` : 'Elsewhere:'}
                    </li>
                  ) : null}
                  <li
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(entry);
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.hint}</small>
                  </li>
                </Fragment>
              ))
            )}
          </ul>
        ) : null}
      </div>
      <button type="button" className="btn icon ghost search-btn" aria-label="Search" aria-expanded={shown} onClick={() => setShown(true)}>
        <Icon name="search" />
      </button>
    </>
  );
}

function isEditable(el: HTMLElement): boolean {
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
