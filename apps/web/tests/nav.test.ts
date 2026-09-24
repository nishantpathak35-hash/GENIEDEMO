import { describe, expect, it } from 'vitest';
import { MODULE_KEYS, ACTION_KEYS } from '@cog/contracts';
import { termsFor } from '@cog/design-system';
import { NAV_FIRM, NAV_PROJECT, NEW_OF, currentEntry, drawn, navFor, projectIdOf, type Entitled, type NavNode } from '../lib/nav.js';
import { ROUTES } from '../lib/routes.js';

/**
 * Two navigations, one shell — generated from modules × roles, never listed.
 *
 * `docs/design/03-navigation.html`: an entry whose module is off is not
 * drawn; an entry whose action the role lacks is not drawn; a section with
 * nothing left in it is not drawn; inside a project the tree is the project's
 * lifecycle with its id in every href. These are the rules the sidebar is
 * built from, so they are proved on the pure function, not on a screenshot.
 */

const EVERYTHING: Entitled = { modules: [...MODULE_KEYS], actions: [...ACTION_KEYS], optional: null };

const hrefsOf = (tree: readonly NavNode[]): string[] =>
  tree.flatMap((n) => (n.kind === 'link' ? [n.href] : n.kind === 'section' ? n.pages.map((p) => p.href) : []));
const sectionsOf = (tree: readonly NavNode[]): string[] => tree.flatMap((n) => (n.kind === 'section' ? [n.id] : []));

describe('the firm’s tree', () => {
  it('draws every section for a role that reaches everything, in the design’s order', () => {
    const tree = navFor('firm', EVERYTHING);
    expect(sectionsOf(tree)).toEqual(['sales', 'projects', 'buying', 'site', 'money']);
    expect(hrefsOf(tree).slice(0, 2)).toEqual(['/', '/approvals']);
  });

  it('does not draw the pipeline or the leads when crm is off — Sales keeps Rate analysis, whose module is estimation', () => {
    const who: Entitled = { ...EVERYTHING, modules: MODULE_KEYS.filter((m) => m !== 'crm') };
    const tree = navFor('firm', who);
    expect(sectionsOf(tree)).toContain('sales');
    const hrefs = hrefsOf(tree);
    expect(hrefs).not.toContain('/crm/board');
    expect(hrefs).not.toContain('/crm');
    expect(hrefs).toContain('/estimation');
  });

  it('drops a section with nothing left in it', () => {
    const who: Entitled = { ...EVERYTHING, modules: MODULE_KEYS.filter((m) => !['crm', 'estimation'].includes(m)) };
    expect(sectionsOf(navFor('firm', who))).not.toContain('sales');
  });

  it('draws a list by its module, never by the power to write into it — Orders, Approvals and Payments stay for a director', () => {
    const who: Entitled = { ...EVERYTHING, actions: [] };
    const hrefs = hrefsOf(navFor('firm', who));
    for (const href of ['/purchase-orders', '/approvals', '/money/payments', '/documents']) expect(hrefs).toContain(href);
  });

  it('does not draw an entry whose action the server refuses the read without — the door would be refused', () => {
    const none: Entitled = { ...EVERYTHING, actions: [] };
    expect(drawn('/settings/people', none)).toBe(false);
    expect(drawn('/settings/people', { ...EVERYTHING, actions: ['manage_users'] })).toBe(true);
  });

  it('a person who reaches nothing sees Today alone', () => {
    const who: Entitled = { modules: ['dashboard'], actions: [], optional: null };
    const tree = navFor('firm', who);
    expect(hrefsOf(tree)).toEqual(['/']);
    expect(tree.some((n) => n.kind === 'sep')).toBe(false);
  });
});

describe('a project’s tree', () => {
  it('fills the project’s id into every href and keeps the lifecycle’s order', () => {
    const tree = navFor('project', EVERYTHING, 'p-1');
    expect(sectionsOf(tree)).toEqual(['design', 'build', 'commercial', 'people', 'close']);
    for (const href of hrefsOf(tree)) expect(href.startsWith('/projects/p-1')).toBe(true);
  });

  it('does not draw a page whose optional workflow the tenant switched off', () => {
    const tree = navFor('project', { ...EVERYTHING, optional: ['delivery_milestones'] }, 'p-1');
    const hrefs = hrefsOf(tree);
    expect(hrefs).toContain('/projects/p-1/milestones');
    expect(hrefs).not.toContain('/projects/p-1/brief');
    expect(hrefs).not.toContain('/projects/p-1/warranty');
  });

  it('draws every optional page when the switches could not be read', () => {
    const hrefs = hrefsOf(navFor('project', EVERYTHING, 'p-1'));
    expect(hrefs).toContain('/projects/p-1/brief');
    expect(hrefs).toContain('/projects/p-1/handover');
  });

  it('every page the tree wants has a route — nothing in the sidebar is a door to nowhere', () => {
    const wanted = hrefsOf(NAV_PROJECT).concat(hrefsOf(NAV_FIRM));
    const missing = wanted.filter((h) => !ROUTES.some((r) => r.pattern === h));
    expect(missing).toEqual([]);
  });
});

describe('which entry the page lights', () => {
  const firm = navFor('firm', EVERYTHING);
  it('the page itself, exactly', () => {
    expect(currentEntry('/money/bills', firm)).toEqual({ href: '/money/bills', sectionId: 'money', exact: true });
    expect(currentEntry('/', firm)).toEqual({ href: '/', sectionId: null, exact: true });
  });
  it('a record lights the list it was opened from, not exactly', () => {
    expect(currentEntry('/purchase-orders/abc', firm)).toEqual({ href: '/purchase-orders', sectionId: 'buying', exact: false });
    expect(currentEntry('/vendors/v-1', firm)).toEqual({ href: '/vendors', sectionId: 'buying', exact: false });
  });
  it('a page with no entry lights nothing rather than Today', () => {
    expect(currentEntry('/settings/tax', firm)).toBeNull();
  });
  it('inside a project, the project’s own entries', () => {
    const project = navFor('project', EVERYTHING, 'p-1');
    expect(currentEntry('/projects/p-1/boq/item-9', project)).toEqual({ href: '/projects/p-1/boq', sectionId: 'build', exact: false });
    expect(currentEntry('/projects/p-1', project)?.href).toBe('/projects/p-1');
  });
  it('reads the project out of a pathname', () => {
    expect(projectIdOf('/projects/p-1/boq')).toBe('p-1');
    expect(projectIdOf('/projects')).toBeNull();
    expect(projectIdOf('/purchase-orders/x')).toBeNull();
  });
});

describe('the firm’s words', () => {
  const linksOf = (tree: readonly NavNode[]) => tree.flatMap((n) => (n.kind === 'link' ? [n] : n.kind === 'section' ? n.pages : []));

  it('every entry is drawn in the firm’s word, and the quick-create follows', () => {
    const t = termsFor({ vendor: 'Supplier', variation: 'Change order', dailyReport: 'Site diary', boq: 'Estimate' });
    const firm = linksOf(navFor('firm', EVERYTHING, undefined, t));
    expect(firm.find((l) => l.href === '/vendors')?.label).toBe('Suppliers');
    expect(firm.find((l) => l.href === '/vendors')?.create).toBe('New supplier');
    expect(firm.find((l) => l.href === '/site-reports')?.label).toBe('Site diaries');
    expect(firm.find((l) => l.href === '/site-reports')?.create).toBe('File today’s site diary');
    const project = linksOf(navFor('project', EVERYTHING, 'p-1', t));
    expect(project.find((l) => l.href === '/projects/p-1/change-orders')?.label).toBe('Change orders');
    expect(project.find((l) => l.href === '/projects/p-1/boq')?.create).toBe('New Estimate line');
  });

  it('the quick-create is keyed by href, so a relabelled entry keeps its +', () => {
    for (const href of Object.keys(NEW_OF)) expect(ROUTES.some((r) => r.pattern === href), href).toBe(true);
    const plain = linksOf(navFor('firm', EVERYTHING));
    expect(plain.find((l) => l.href === '/vendors')?.create).toBe('New vendor');
  });
});
