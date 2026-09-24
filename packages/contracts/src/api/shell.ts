import { z } from 'zod';

/**
 * The shell — what the bar and the sidebar read, and what they write.
 *
 * `docs/design/03-navigation.html`: two navigations, one shell. The sidebar's
 * counts are ONE read per request, not one per link; the switcher's Recent
 * and Mine, the bar's recent history, the quick-create square's permission
 * read and the scoped search are each one call; a person's preferences are
 * read once on sign-in and written once per change. None of these computes a
 * money figure — the shell holds counts, names and hrefs.
 */

/** The counts the sidebar draws beside its entries, each what its `say` says. */
export const shellCountsResponse = z.object({
  /** Orders waiting for a decision, firm-wide — "waiting on you". */
  approvals: z.number().int().min(0),
  /** Stock receipts at the gate, received and not checked in. */
  unchecked: z.number().int().min(0),
  /** Agreed rates (rate contracts) ending within 30 days. */
  expiring: z.number().int().min(0),
  /** Stock items below their reorder level. */
  low: z.number().int().min(0),
  /** Projects in progress that have never filed a daily report. */
  noReport: z.number().int().min(0),
  /** Bills past their due date and unpaid. */
  overdue: z.number().int().min(0),
});
export type ShellCountsResponse = z.infer<typeof shellCountsResponse>;

/** The projects the switcher groups: Mine (on the team) and Recent (opened last, newest first). */
export const myProjectsResponse = z.object({
  mine: z.array(z.uuid()),
  recent: z.array(z.uuid()),
});
export type MyProjectsResponse = z.infer<typeof myProjectsResponse>;

/** What a record is, for the history and the search: the kinds the bar draws with an icon each. */
export const recordKind = z.enum([
  'project',
  'order',
  'vendor',
  'lead',
  'bill',
  'payment',
  'invoice',
  'holding',
  'document',
  'report',
  'task',
  'boq-line',
  'page',
]);
export type RecordKind = z.infer<typeof recordKind>;

/** One record this person opened. */
export const historyItem = z.object({
  kind: recordKind,
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300),
  href: z.string().min(1).max(500),
  projectCode: z.string().max(32).nullable(),
  openedAt: z.string(),
});
export type HistoryItem = z.infer<typeof historyItem>;

export const recentHistoryResponse = z.object({ items: z.array(historyItem) });
export type RecentHistoryResponse = z.infer<typeof recentHistoryResponse>;

/** Written when a record is opened; the server stamps who and when. */
export const recordOpenedInput = z.object({
  kind: recordKind,
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).default(''),
  href: z.string().min(1).max(500),
  projectId: z.uuid().nullable().default(null),
});
export type RecordOpenedInput = z.infer<typeof recordOpenedInput>;

/**
 * A person's preferences — theirs, following them to another computer, so
 * never in the browser (COMPONENT-MAP §6). One row per person, merged on
 * write: a PATCH carries only what changed.
 */
export const preferences = z.object({
  /** The column choice per list, by the list's key; a list absent here shows its default columns. */
  columns: z.record(z.string(), z.array(z.string())),
  sidebar: z.object({
    collapsed: z.boolean(),
    /** Section ids this person opened and left open; the section holding the current page opens on arrival regardless. */
    open: z.array(z.string()),
  }),
  lastProjectId: z.uuid().nullable(),
  starredViews: z.array(z.uuid()),
  starredReports: z.array(z.string()),
  /** WCAG 2.1.4: off, and `/` and `?` type themselves. */
  singleKeyShortcuts: z.boolean(),
});
export type Preferences = z.infer<typeof preferences>;

export const preferencesResponse = preferences;
export const updatePreferencesInput = z
  .object({
    columns: z.record(z.string(), z.array(z.string()).max(40)).optional(),
    sidebar: z.object({ collapsed: z.boolean(), open: z.array(z.string().max(40)).max(40) }).optional(),
    lastProjectId: z.uuid().nullable().optional(),
    starredViews: z.array(z.uuid()).max(200).optional(),
    starredReports: z.array(z.string().max(80)).max(100).optional(),
    singleKeyShortcuts: z.boolean().optional(),
  })
  .strict();
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInput>;

/** What this person may create, here — the square's menu, grouped by section, the project pre-filled inside one. */
export const quickCreateItem = z.object({
  key: z.string(),
  label: z.string(),
  href: z.string(),
  /** Belongs to a project: inside one the href already names it; at the firm level the page asks which. */
  projectScoped: z.boolean(),
});
export const quickCreateResponse = z.object({
  groups: z.array(z.object({ section: z.string(), items: z.array(quickCreateItem) })),
});
export type QuickCreateResponse = z.infer<typeof quickCreateResponse>;

/** One hit of the bar's search. */
export const searchHit = z.object({
  kind: recordKind,
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  href: z.string(),
});
export const searchResponse = z.object({
  /** What was searched: the page kind, the scope, so the box can say "Search in Orders · SAN-01". */
  scope: z.string(),
  items: z.array(searchHit).max(50),
});
export type SearchResponse = z.infer<typeof searchResponse>;

/**
 * A saved view of a list: the firm's, or this person's. The criteria are the
 * list's own filter keys (`state`, `vendor`, `project`, `q`, `sort`) as the
 * address carries them — where `?project=` lives at the firm level.
 */
export const savedView = z.object({
  id: z.uuid(),
  listKey: z.string(),
  name: z.string().min(1).max(80),
  /** `null` is the firm's view; a principal id is that person's. */
  ownerId: z.uuid().nullable(),
  criteria: z.record(z.string(), z.string()),
  columns: z.array(z.string()).nullable(),
  /** Starred by THIS person (the preference store), never by the firm. */
  starred: z.boolean(),
});
export type SavedView = z.infer<typeof savedView>;
export const savedViewsResponse = z.object({ items: z.array(savedView) });
export const createSavedViewInput = z.object({
  listKey: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  /** The firm's view needs manage_settings; a person's needs nothing. */
  shared: z.boolean(),
  criteria: z.record(z.string().max(40), z.string().max(200)),
  columns: z.array(z.string().max(60)).max(40).nullable(),
});
export type CreateSavedViewInput = z.infer<typeof createSavedViewInput>;
