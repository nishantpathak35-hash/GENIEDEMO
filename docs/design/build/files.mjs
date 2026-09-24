// The set is fifteen files plus a contents page, numbered in reading order (19 September 2026), and every cross-reference in the prose has to resolve in
// both shapes — the monolith this was built as, and the split it ships as. So no link is ever typed.
// Every one goes through hrefFor(), which knows which file it is being written into and returns a bare
// fragment when the target is on the same page and a filename when it is not.
//
// SPLIT = false still emits the single DESIGN-SAMPLES.html, which is how the split was verified: build
// both, diff the link gate, and the anchors are proved before the emitter changes shape.

export const FILES = [
  ['0', '00-foundations.html', 'Foundations', 'The palette and how it was chosen, the type, the spacing scale, the icons, the illustration system, every token with the number that justifies it — and the patterns every screen is built from: one page header, one list, one set of states, one form.'],
  ['1', '01-components.html', 'Components', 'Every element the set draws, the published component it is, and each one in its states — default, hover, pressed, focused, selected, disabled and loading — in light and dark.'],
  ['2', '02-motion.html', 'Motion', 'Every motion the product makes, named by its token and played on the page — and the same page under reduced motion, where nothing moves.'],
  ['3', '03-navigation.html', 'Navigation', 'Two navigations, one shell — the firm’s functions or a project’s lifecycle in the sidebar, the switcher that changes between them, the search and quick-create that follow, the edge states a link can land on, and every route mapped to its level, module and action. Numbers, not opinions: which of 65 routes is the firm’s, which a project’s, and what a link to a hidden one draws.'],
  ['4', '04-today.html', 'Today & Notifications', 'The first screen after signing in, built around the single most urgent thing — and the notification feed behind the bell.'],
  ['5', '05-sales.html', 'Sales', 'Leads, the quote a client actually sees, and what happens when a quote becomes a project.'],
  ['6', '06-projects.html', 'Projects', 'The project record, its budget against what has been committed, and the change orders that move both.'],
  ['7', '07-buying.html', 'Buying', 'Vendors, rate contracts, purchase orders and the moment an order goes past the rate that was agreed.'],
  ['8', '08-site.html', 'Site', 'What happens on site: daily progress, material received, snags, and the measurement sheet that protects a bill.'],
  ['9', '09-approvals-money.html', 'Approvals, Tasks & Money', 'Who approves what and in what order, the task list that comes out of it, and the five Money screens — bills, payments, tax deducted, client billing and retention — saying plainly what rests on a provisional rate.'],
  ['10', '10-portals.html', 'Portals', 'The two outside views: what a client sees and what a vendor sees, and how little of the product that is.'],
  ['11', '11-settings.html', 'Reports, Settings & operator', 'Tenant settings including the tax review — every rate provisional until a chartered accountant signs it — and the operator console that runs the tenants.'],
  ['12', '12-states-roles.html', 'States & roles', 'Every state a screen can be in — empty, loading, error, forbidden, offline — and what each of the five roles is allowed to see.'],
  ['13', '13-decisions.html', 'Decisions', 'The eighteen links of the shipped product mapped to where each one is rendered here, and the decisions taken along the way.'],
  ['14', '14-demo.html', 'The five-minute demo', 'The path through the product you would walk a prospect down, in order, with what to say at each stop.'],
];

export const INDEX = 'index.html';
const FILE_OF = new Map(FILES.map(([id, file]) => [id, file]));

export const SPLIT = process.env.MONOLITH !== '1';

let current = null;
export function setCurrentFile(id) { current = id; }

// The one way a link to a section is written. In the monolith every target is on the page; in the split
// only the section being written is, and everything else needs its filename in front of the fragment.
export function hrefFor(id) {
  const frag = `#s${id}`;
  if (!SPLIT || id === current) return frag;
  const f = FILE_OF.get(String(id));
  if (!f) throw new Error(`hrefFor: no file for section ${id}`);
  return f + frag;
}

// The document's own nav, in three groups — the labels are the file's shape, not the product's.
export const NAV_GROUPS = [['', ['0', '1', '2', '3']], ['The product', ['4', '5', '6', '7', '8', '9', '10', '11']], ['The record', ['12', '13', '14']]];
