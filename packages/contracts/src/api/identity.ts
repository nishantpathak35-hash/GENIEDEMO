import { z } from 'zod';
import { pageOf } from '../pagination.js';
import { paiseWire } from '../money.js';

/**
 * Identity and tenancy shapes.
 *
 * **`externalId` appears nowhere.** It is the provider's identifier and the
 * credential the bootstrap lookup resolves, so publishing it would turn a list
 * of colleagues into a list of things to authenticate as.
 */

export const principal = z.object({
  id: z.uuid(),
  kind: z.string(),
  email: z.email(),
  /** What a colleague calls this person. `null` when nobody gave one — a
   *  screen then shows the address, never a name guessed from it. */
  displayName: z.string().nullable(),
  roles: z.array(z.string()),
  /** A boolean, not a timestamp: WHEN someone was disabled is an audit question. */
  disabled: z.boolean(),
});

export const principalsResponse = pageOf(principal);

export type PrincipalsResponse = z.infer<typeof principalsResponse>;

/**
 * The three kinds an INVITATION may create.
 *
 * `identity.principals` also allows `connector` and `system`; neither may
 * arrive by email. A connector principal is the on-prem Tally agent's
 * credential, minted with a per-tenant key on its own prefix. Migration 0080
 * carries the same CHECK, so this is the courteous refusal and the constraint
 * is the real one.
 */
export const invitableKind = z.enum(['staff', 'vendor', 'client']);

export type InvitableKind = z.infer<typeof invitableKind>;

export const invite = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  /** Which application the resulting login may reach. Read from this row at
   *  redemption, never from whoever is redeeming. */
  kind: invitableKind,
  roles: z.array(z.string()),
  /** The legacy invites table has no expiry at all, so a token works forever. */
  expiresAt: z.string(),
  accepted: z.boolean(),
});

export const invitesResponse = pageOf(invite);

export type InvitesResponse = z.infer<typeof invitesResponse>;

export const createInviteInput = z.object({
  email: z.email().max(320),
  /** The invitee's name, as the inviter knows it. Copied onto the principal
   *  at acceptance — read from the stored invitation, like `kind`. */
  displayName: z.string().trim().min(1).max(120).optional(),
  kind: invitableKind.default('staff'),
  roles: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export type CreateInviteInput = z.infer<typeof createInviteInput>;

/**
 * The response to minting an invite.
 *
 * The URL is returned **once** and is never readable again — only its hash is
 * stored. An invite link is a bearer credential, so re-issuing means minting a
 * new one, which is the correct shape.
 */
export const mintedInviteResponse = z.object({
  email: z.email(),
  kind: invitableKind,
  url: z.url(),
  expiresAt: z.string(),
});

export type MintedInviteResponse = z.infer<typeof mintedInviteResponse>;

export const tenantSettings = z.object({
  id: z.uuid(),
  slug: z.string(),
  legalName: z.string(),
  /**
   * Per-tenant, never a constant. `auth.js:253` hardcodes one demo domain as
   * the invite URL, which in a multi-tenant product sends every customer's
   * staff to somebody else's login page.
   */
  appOrigin: z.string().nullable(),
});

export type TenantSettings = z.infer<typeof tenantSettings>;

// --- the platform console ------------------------------------------------

/**
 * A tenant, as the back office sees it.
 *
 * The slug, the legal name and when it was created — and **nothing from inside
 * it**. A platform principal belongs to no tenant, so it sets no tenant context
 * and every tenant-scoped policy denies it by construction. That is the
 * isolation, not a filtered query.
 */
export const platformTenant = z.object({
  id: z.uuid(),
  slug: z.string(),
  legalName: z.string(),
  appOrigin: z.string().nullable(),
  createdAt: z.string(),
  /** An operator's label, not a price. `null` when none was set (0090). */
  plan: z.string().nullable(),
  /**
   * Instants the TENANT reported about itself, never read across tenants:
   * the connector last calling in, the last voucher Tally posted, the last
   * time a signed-in person loaded the application. `null` means none since
   * migration 0090 — never, as far as the directory knows.
   */
  connectorLastSeenAt: z.string().nullable(),
  lastPostedAt: z.string().nullable(),
  lastActiveAt: z.string().nullable(),
});
export type PlatformTenant = z.infer<typeof platformTenant>;

export const setTenantPlanInput = z.object({
  plan: z.string().trim().max(40).nullable(),
});
export type SetTenantPlanInput = z.infer<typeof setTenantPlanInput>;

export const platformTenantListResponse = pageOf(platformTenant);
export type PlatformTenantListResponse = z.infer<typeof platformTenantListResponse>;

/**
 * Creating an organisation.
 *
 * `appOrigin` is required and per-tenant: it is where this tenant's invitation
 * links point, and it exists precisely so that no invite URL is ever a constant
 * again — `auth.js:253` hardcodes one demo domain for everybody.
 */
export const provisionTenantInput = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9-]*$/, 'lower case letters, digits and hyphens, starting with a letter'),
  legalName: z.string().min(1).max(200),
  appOrigin: z.url().max(300),
  adminEmail: z.email().max(320),
  adminExternalId: z.string().min(1).max(320),
});
export type ProvisionTenantInput = z.infer<typeof provisionTenantInput>;

export const provisionedTenantResponse = z.object({
  tenantId: z.uuid(),
  principalId: z.uuid(),
  slug: z.string(),
});
export type ProvisionedTenantResponse = z.infer<typeof provisionedTenantResponse>;

/** Every provisioning attempt, refused ones included. Written by the function itself. */
export const provisioningEvent = z.object({
  id: z.uuid(),
  slug: z.string(),
  outcome: z.enum(['created', 'refused']),
  tenantId: z.uuid().nullable(),
  detail: z.string(),
  occurredAt: z.string(),
});

export const provisioningEventListResponse = pageOf(provisioningEvent);
export type ProvisioningEventListResponse = z.infer<typeof provisioningEventListResponse>;

export const platformWhoamiResponse = z.object({
  principalId: z.uuid(),
  kind: z.literal('platform'),
});
export type PlatformWhoamiResponse = z.infer<typeof platformWhoamiResponse>;

/**
 * What the signed-in person may do.
 *
 * The shape every app reads before rendering a control. Two flat lists, already
 * resolved across the caller's roles — an app never has to know that roles are
 * additive, or which role carried which grant, and it never derives either.
 */
export const entitlementsResponse = z.object({
  roles: z.array(z.string()),
  modules: z.array(z.string()),
  actions: z.array(z.string()),
});
export type EntitlementsResponse = z.infer<typeof entitlementsResponse>;

export const roleRow = z.object({
  key: z.string(),
  label: z.string(),
  /**
   * 'provisional' means the answer was inherited rather than agreed. Surfaced
   * so a settings screen can say so, the same way a project health threshold
   * does — PO-13's answer came out of a legacy tree, not out of a decision.
   */
  status: z.enum(['provisional', 'confirmed']),
  retired: z.boolean(),
  modules: z.array(z.string()),
  actions: z.array(z.string()),
});
export type RoleRow = z.infer<typeof roleRow>;

export const roleListResponse = z.object({
  items: z.array(roleRow),
  provisional: z.boolean(),
});
export type RoleListResponse = z.infer<typeof roleListResponse>;

export const setRoleGrantsInput = z.object({
  modules: z.array(z.string()).max(100),
  actions: z.array(z.string()).max(100),
});
export type SetRoleGrantsInput = z.infer<typeof setRoleGrantsInput>;

export const addRoleInput = z.object({
  key: z.string().min(2).max(31),
  label: z.string().min(1).max(80),
});
export type AddRoleInput = z.infer<typeof addRoleInput>;

export const okResponse = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof okResponse>;

/** One stage of an approval chain. Every field here is evaluated by the engine. */
export const approvalStageInput = z.object({
  name: z.string().min(1).max(80),
  sequence: z.number().int().min(1).max(50),
  approverRole: z.string().max(31),
  minApprovals: z.number().int().min(1).max(20),
  /**
   * The most this stage may authorise alone, in paise, as a digit string.
   *
   * **`null` means no limit, and every seeded stage is `null`.** Above the
   * ceiling the request escalates to the next stage instead of completing; with
   * no next stage it is refused, because the chain then contains nobody who may
   * authorise the amount.
   *
   * A `PaiseWire` string rather than a number, like every other money field —
   * ₹12 crore in paise is 1,200,000,000 and a spending limit is the last figure
   * that should be rounded by a JSON parser. Optional and nullable so that
   * omitting it and clearing it are the same thing: unset.
   */
  approvalCeilingPaise: paiseWire.nullable().optional(),
});

export const configureChainInput = z.object({
  name: z.string().min(1).max(120),
  stages: z.array(approvalStageInput).min(1).max(20),
});
export type ConfigureChainInput = z.infer<typeof configureChainInput>;

export const configuredChainResponse = z.object({
  id: z.uuid(),
  entityType: z.string(),
});
export type ConfiguredChainResponse = z.infer<typeof configuredChainResponse>;

/**
 * A tax rate, with its provenance attached.
 *
 * **`status` is the whole point of this shape.** `provisional` means somebody
 * typed it; `verified` means a named chartered accountant signed it off, on a
 * date, against a cited statute — and the table refuses a verified row without
 * all three. A screen renders the difference rather than hiding it, because a
 * rate that merely looks settled is how a wrong statutory figure gets filed.
 *
 * No route can write `verified`. That path is deliberately absent.
 */
export const taxRateRow = z.object({
  id: z.uuid(),
  key: z.string(),
  payeeClass: z.string().nullable(),
  /** Basis points. 1 bp = 0.01%, so 18% is 1800 — never a float. */
  rateBp: z.number().int(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  status: z.enum(['provisional', 'verified']),
  statute: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  verifiedOn: z.string().nullable(),
  questionRef: z.string().nullable(),
  /** Relayed from a CA call, statute text, or entered by a person. Not evidence. */
  source: z.string().nullable(),
});
export type TaxRateRow = z.infer<typeof taxRateRow>;

export const taxRateListResponse = z.object({ items: z.array(taxRateRow) });
export type TaxRateListResponse = z.infer<typeof taxRateListResponse>;

/**
 * A TDS threshold, with the provenance a rate carries.
 *
 * A threshold is a statutory value exactly as a rate is — it decides whether
 * anything is deducted at all — so it is `provisional` until a person promotes
 * it with a CA's details, and it is money, so it travels as paise.
 */
export const tdsThresholdRow = z.object({
  id: z.uuid(),
  section: z.string(),
  kind: z.enum(['single_payment', 'annual_aggregate', 'monthly', 'annual_excess']),
  amount: paiseWire,
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  status: z.enum(['provisional', 'verified']),
  statute: z.string().nullable(),
  source: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  verifiedOn: z.string().nullable(),
  questionRef: z.string().nullable(),
});
export type TdsThresholdRow = z.infer<typeof tdsThresholdRow>;

export const tdsThresholdListResponse = z.object({ items: z.array(tdsThresholdRow) });
export type TdsThresholdListResponse = z.infer<typeof tdsThresholdListResponse>;

/** What loading the provisional catalogue added. Zero and zero the second time. */
export const loadStatutoryCatalogueResponse = z.object({
  ratesAdded: z.number().int().nonnegative(),
  thresholdsAdded: z.number().int().nonnegative(),
});
export type LoadStatutoryCatalogueResponse = z.infer<typeof loadStatutoryCatalogueResponse>;

/**
 * Recording a rate somebody intends to apply.
 *
 * There is no `status` field, and that is not an oversight — every row written
 * through this input is provisional. An effective date is required with no
 * default: a voucher raised in one financial year must compute under that
 * year's rules forever, and the legacy's rate tables carry the date columns and
 * never filter on them (CA-05).
 */
export const recordTaxRateInput = z.object({
  key: z.string().min(1).max(60),
  payeeClass: z.string().max(60).optional(),
  rateBp: z.number().int().min(0).max(100_000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'An effective date is required.'),
  questionRef: z.string().max(60).optional(),
});
export type RecordTaxRateInput = z.infer<typeof recordTaxRateInput>;

/**
 * A person, with what they may do and where they may do it.
 *
 * Two different scopes on one row, and they are not the same question:
 * `roles` is tenant-wide and answers what somebody is permitted to do;
 * `projects` is the narrower scope added by `project_members`, and a
 * designation on it is a job title, never an authorisation.
 */
export const person = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  roles: z.array(z.string()),
  disabled: z.boolean(),
  projects: z.array(
    z.object({ id: z.uuid(), name: z.string(), designation: z.string() }),
  ),
});
export type Person = z.infer<typeof person>;

/** `active` counts staff whose `disabled_at` is null, over the whole tenant — not this page. */
export const peopleResponse = pageOf(person).extend({
  summary: z.object({ active: z.number().int() }),
});
export type PeopleResponse = z.infer<typeof peopleResponse>;

/**
 * A client portal account and the projects it may see.
 *
 * `principal_links` is the mechanism the portal already reads — a client
 * login sees exactly the projects listed here and answers not-found for
 * anything else. This makes that list editable rather than inventing a second
 * one beside it.
 */
export const clientAccount = z.object({
  id: z.uuid(),
  email: z.email(),
  disabled: z.boolean(),
  projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type ClientAccount = z.infer<typeof clientAccount>;

export const clientAccountsResponse = pageOf(clientAccount);
export type ClientAccountsResponse = z.infer<typeof clientAccountsResponse>;

export const grantClientProjectInput = z.object({ projectId: z.uuid() });
export type GrantClientProjectInput = z.infer<typeof grantClientProjectInput>;

/**
 * A vendor portal account and the vendors it represents.
 *
 * The exact mirror of `clientAccount`, on the same mechanism — the vendor
 * portal reads `principal_links` and shows an order only if the order's vendor
 * is linked to the caller. Until this existed there was no route that could
 * write such a link: an invitation could mint a vendor LOGIN, and then nothing
 * could attach it to a vendor. Only `scripts/seed-demo.mjs` did, by direct SQL,
 * with a comment saying so. That made "vendor onboarding" a database task,
 * which is not onboarding.
 *
 * `vendors`, not `projects`, is the only difference in shape. It is a separate
 * schema rather than a generic one keyed by `subjectKind` because the two lists
 * name different things and a screen that says "projects" when it means
 * "vendors" is worse than two schemas.
 */
export const vendorAccount = z.object({
  id: z.uuid(),
  email: z.email(),
  disabled: z.boolean(),
  vendors: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type VendorAccount = z.infer<typeof vendorAccount>;

export const vendorAccountsResponse = pageOf(vendorAccount);
export type VendorAccountsResponse = z.infer<typeof vendorAccountsResponse>;

export const grantVendorInput = z.object({ vendorId: z.uuid() });
export type GrantVendorInput = z.infer<typeof grantVendorInput>;
