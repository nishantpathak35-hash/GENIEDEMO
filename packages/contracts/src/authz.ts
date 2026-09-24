/**
 * The vocabulary of the role model: which modules exist, which actions exist,
 * and the provisional default answer to PO-13.
 *
 * **This is a vocabulary, not a policy.** Nothing here decides what anyone may
 * do — every grant is a row in `identity.role_grants`, and this file only names
 * the strings such a row may legally contain. Keeping the list here rather than
 * in a database CHECK means adding a screen is a code change in one place
 * instead of a migration, while a typo in a grant is still refused at the write
 * boundary rather than stored as a grant that matches nothing.
 *
 * **Provenance.** Every value below was read out of the repaired legacy tree at
 * a cited line and adopted PROVISIONALLY — see the PROPOSED table in
 * `docs/OPEN-DECISIONS.md`. That tree's own handover calls itself "a repair of
 * the audited paths, not certification of every module, tax rule, permission
 * combination", so this is evidence of how the company works, not a decision
 * anybody signed. Each seeded row carries `status = 'provisional'` and can be
 * overruled by editing the row.
 *
 * **No statutory value appears here, and none may.** The same settings screens
 * that supplied these roles also configure a TDS rate and default GST to 18.
 * Configuring a rate is not verifying one: CA-01..CA-08 stay hard-gated, and
 * the tax rate this file does not contain is deliberate.
 */

/**
 * A screen and the endpoints behind it.
 *
 * Source: `settings-catalog.js:3-5` in the repaired tree — seventeen entries,
 * grouped for display. The grouping is carried because a permission screen
 * listing seventeen checkboxes in file order is unreadable.
 */
export const MODULES = [
  { key: 'dashboard', label: 'Overview', group: 'Workspace' },
  { key: 'projects', label: 'Projects', group: 'Workspace' },
  { key: 'crm', label: 'Leads & opportunities', group: 'Plan & procure' },
  { key: 'design_build', label: 'Design & build', group: 'Plan & procure' },
  { key: 'estimation', label: 'Estimates', group: 'Plan & procure' },
  { key: 'boq', label: 'Bill of quantities', group: 'Plan & procure' },
  { key: 'purchase_orders', label: 'Purchase orders', group: 'Plan & procure' },
  { key: 'vendors', label: 'Vendors', group: 'Plan & procure' },
  { key: 'operations', label: 'Daily & weekly reports', group: 'Site & delivery' },
  { key: 'inventory', label: 'Inventory & goods receipts', group: 'Site & delivery' },
  { key: 'change_orders', label: 'Variations & drawings', group: 'Site & delivery' },
  { key: 'site_controls', label: 'Site expenses & measurements', group: 'Site & delivery' },
  { key: 'payments', label: 'Vendor payments', group: 'Finance' },
  { key: 'client_billing', label: 'Client billing', group: 'Finance' },
  { key: 'reports', label: 'Reports', group: 'Finance' },
  { key: 'documents', label: 'Documents', group: 'Collaboration' },
  { key: 'project_team', label: 'Project team', group: 'Collaboration' },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

/**
 * A named power, separate from reaching a screen.
 *
 * Source: labelled at `SettingsLegacyView.js:563-572`, granted at
 * `core.js:557-562`. In the legacy these live in the SAME flat array as the
 * modules, and the consequence is that they are enforced almost nowhere —
 * `module-access.js:31` resolves a method to a module, never to an action, so
 * the only site in the tree that reads one of these is `projects.js:282-302`,
 * gating a read rather than a write.
 *
 * Here they are a distinct grant kind, so "may this role approve a purchase
 * order" is a question with an answer.
 */
export const ACTIONS = [
  { key: 'create_po', label: 'Create purchase orders' },
  { key: 'approve_po', label: 'Approve purchase orders' },
  { key: 'create_payment', label: 'Raise payment requests' },
  { key: 'approve_payment', label: 'Approve payments' },
  { key: 'reject_payment', label: 'Reject payments' },
  { key: 'upload_document', label: 'Upload documents' },
  { key: 'delete_document', label: 'Delete documents' },
  { key: 'manage_users', label: 'Manage people and roles' },
  { key: 'manage_settings', label: 'Change company settings' },
  { key: 'export_data', label: 'Export data' },
  { key: 'view_analytics', label: 'See analytics' },
] as const;

export type ActionKey = (typeof ACTIONS)[number]['key'];

export const MODULE_KEYS: readonly string[] = MODULES.map((m) => m.key);
export const ACTION_KEYS: readonly string[] = ACTIONS.map((a) => a.key);

export interface RoleDefault {
  readonly key: string;
  readonly label: string;
  readonly modules: readonly ModuleKey[];
  readonly actions: readonly ActionKey[];
}

/**
 * Every role except the two administrative ones reaches these.
 *
 * `settings.js:30` gives every role `dashboard` plus ten modules regardless of
 * what the explicit defaults say, so this is the real floor rather than the
 * declared one. Carried faithfully because it is what the running system does.
 */
const BASELINE_MODULES = [
  'dashboard',
  'crm',
  'design_build',
  'estimation',
  'boq',
  'inventory',
  'change_orders',
  'site_controls',
  'client_billing',
  'documents',
  'project_team',
] as const satisfies readonly ModuleKey[];

/** `settings.js:30` also gives these three roles `operations` and `projects`. */
const SITE_MODULES = ['operations', 'projects'] as const satisfies readonly ModuleKey[];

/**
 * The provisional answer to PO-13.
 *
 * Ten roles, from `settings-catalog.js:1`. The four with explicit grants take
 * them from `core.js:557-562`; the other six get the baseline only, which is
 * exactly what the running system gives them.
 *
 * **`director` and `admin` are not exempt from anything.** In the legacy,
 * holding either satisfies every approval stage (`ApprovalWorkflowService.ts:19`,
 * `:330-331`), which turns a three-stage chain into a formality. Here they are
 * entitled where a stage names them and nowhere else — see
 * `services/workflow/src/domain/approval.ts:139`. They are broad, not exempt.
 */
export const DEFAULT_ROLES: readonly RoleDefault[] = [
  {
    key: 'proc',
    label: 'Procurement',
    modules: [...BASELINE_MODULES, 'payments', 'purchase_orders', 'vendors'],
    actions: ['create_payment', 'create_po'],
  },
  {
    key: 'finance',
    label: 'Finance',
    modules: [...BASELINE_MODULES, 'payments', 'vendors', 'reports'],
    actions: ['approve_payment', 'reject_payment', 'export_data'],
  },
  {
    key: 'accountant',
    label: 'Accountant',
    modules: [...BASELINE_MODULES, 'payments', 'purchase_orders', 'vendors', 'reports'],
    actions: ['create_payment', 'approve_payment', 'export_data', 'upload_document'],
  },
  {
    key: 'site',
    label: 'Site team',
    modules: [...BASELINE_MODULES, ...SITE_MODULES],
    actions: ['upload_document'],
  },
  {
    key: 'engineer',
    label: 'Engineer',
    modules: [...BASELINE_MODULES, ...SITE_MODULES],
    actions: ['upload_document'],
  },
  {
    key: 'designer',
    label: 'Designer',
    modules: [...BASELINE_MODULES],
    actions: ['upload_document'],
  },
  {
    key: 'sales',
    label: 'Sales',
    modules: [...BASELINE_MODULES],
    actions: [],
  },
  {
    key: 'manager',
    label: 'Project manager',
    modules: [...BASELINE_MODULES, ...SITE_MODULES, 'purchase_orders', 'vendors'],
    actions: ['create_po'],
  },
  {
    key: 'admin',
    label: 'Administrator',
    modules: MODULE_KEYS as readonly ModuleKey[],
    actions: ['manage_users', 'manage_settings', 'export_data', 'view_analytics'],
  },
  {
    key: 'director',
    label: 'Director',
    modules: MODULE_KEYS as readonly ModuleKey[],
    actions: [
      'approve_po',
      'approve_payment',
      'reject_payment',
      'manage_users',
      'manage_settings',
      'export_data',
      'view_analytics',
    ],
  },
];

export interface StageDefault {
  readonly name: string;
  readonly sequence: number;
  readonly approverRole: string;
  readonly minApprovals: number;
}

export interface ChainDefault {
  readonly entityType: string;
  readonly name: string;
  readonly stages: readonly StageDefault[];
}

/**
 * The provisional approval chains — what actually turns PO-13's blocked screens
 * on.
 *
 * Source: the documented fallback in `ApprovalWorkflowService.ts:267-305`, used
 * whenever no custom workflow is configured. That is the chain the running
 * system applies by default, so it is the chain with evidence behind it.
 *
 * **Two faithful departures, both narrowing:**
 *
 * 1. Four of those five fallbacks accept EITHER of two roles per stage —
 *    `:278` `isDir || isFin`, `:285` `isDir || isProc`, `:297`, `:302`. Our
 *    `ApprovalStage.approverRole` is one string and `isEntitled` matches it
 *    exactly. Rather than widen the schema for a fidelity nothing needs, each
 *    stage is seeded with the NARROWER role. Widening a stage is one row.
 *
 * 2. The change-order fallback's second stage is satisfied by a `client` role
 *    (`:290`). We do not seed it. `loadPrincipalRoles` reads staff principals,
 *    so a staff stage requiring `client` is satisfiable by nobody and would
 *    wedge every change order permanently. Client sign-off is not missing — it
 *    lives on the client portal's decide-variation route, where the signatory
 *    is a client principal rather than a staff member holding a role named
 *    after one.
 */
export const DEFAULT_CHAINS: readonly ChainDefault[] = [
  {
    entityType: 'purchase_order',
    name: 'Purchase order approval',
    stages: [{ name: 'Pending Approval', sequence: 1, approverRole: 'finance', minApprovals: 1 }],
  },
  {
    entityType: 'payment_request',
    name: 'Payment approval',
    stages: [
      { name: 'Pending Procurement', sequence: 1, approverRole: 'proc', minApprovals: 1 },
      { name: 'Pending Finance', sequence: 2, approverRole: 'finance', minApprovals: 1 },
    ],
  },
  {
    entityType: 'change_order',
    name: 'Variation internal review',
    stages: [
      { name: 'Pending Internal Review', sequence: 1, approverRole: 'proc', minApprovals: 1 },
    ],
  },
  {
    entityType: 'boq_schedule',
    name: 'BOQ approval',
    stages: [{ name: 'Draft', sequence: 1, approverRole: 'finance', minApprovals: 1 }],
  },
  {
    entityType: 'site_imprest',
    name: 'Imprest sanction',
    stages: [{ name: 'Pending Approval', sequence: 1, approverRole: 'finance', minApprovals: 1 }],
  },
];
