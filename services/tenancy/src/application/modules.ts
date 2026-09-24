/**
 * Optional modules, and whether this tenant has turned them on.
 *
 * Two different questions get confused constantly, so they are two different
 * mechanisms:
 *
 *   `identity.role_grants`      may THIS PERSON use module X
 *   `tenancy.tenant_modules`    is module X turned on HERE AT ALL
 *
 * A gated route asks this one FIRST, and answers **404** when the answer is no
 * — not 403. 403 says "this exists and you may not have it", which is a true
 * statement about a permission and a false one about a module the tenant never
 * switched on. See `moduleGate` in `services/host`.
 */

import type { TxLike } from './provisioning.js';

/**
 * The catalogue. **This, not the database, is the authority on what is
 * gateable.**
 *
 * A key absent from here is not an optional module and is never consulted
 * against `tenant_modules` — which is what stops "absent means off" from
 * silently disabling the seventeen modules that predate this file. Those are
 * governed by `role_grants` alone and always have been.
 */
export const OPTIONAL_MODULES = [
  {
    key: 'design_brief',
    title: 'Client brief and rooms',
    summary: 'Record what the client asked for, room by room, before design starts.',
  },
  {
    key: 'design_deliverables',
    title: 'Design deliverables',
    summary: 'Drawings and 3D views issued for client review, with revisions.',
  },
  {
    key: 'room_selections',
    title: 'Room selections',
    summary: 'Finishes and fittings chosen per room, and substitutions against them.',
  },
  {
    key: 'commercial_agreement',
    title: 'Commercial agreement',
    summary: 'The contract value, payment stages and what each stage releases.',
  },
  {
    key: 'procurement_plan',
    title: 'Procurement planning',
    summary: 'What has to be ordered by when, worked back from the site programme.',
  },
  {
    key: 'joinery_packages',
    title: 'Joinery packages',
    summary: 'Bespoke joinery issued to a workshop as a package with its own dates.',
  },
  {
    key: 'delivery_milestones',
    title: 'Delivery milestones',
    summary: 'Site milestones, their planned and actual dates, and what slipped.',
  },
  {
    key: 'handover',
    title: 'Handover',
    summary: 'Snag list, sign-off and the documents the client is given at the end.',
  },
  {
    key: 'warranty',
    title: 'Warranty',
    summary: 'What is under warranty, until when, and claims raised against it.',
  },
  {
    key: 'design_timesheets',
    title: 'Design timesheets',
    summary: 'Hours booked by the design team against a project.',
  },
  {
    key: 'client_actions',
    title: 'Client action items',
    summary: 'Decisions the client owes, and what is held up waiting for them.',
  },
] as const;

export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
export type OptionalModuleKey = OptionalModule['key'];

const KEYS: ReadonlySet<string> = new Set(OPTIONAL_MODULES.map((m) => m.key));

export function isOptionalModule(key: string): key is OptionalModuleKey {
  return KEYS.has(key);
}

export interface ModuleState {
  readonly key: OptionalModuleKey;
  readonly title: string;
  readonly summary: string;
  readonly enabled: boolean;
  readonly changedAt: string | null;
}

/**
 * Is this module on for the current tenant?
 *
 * **Absent means off**, and only ever for a key in the catalogue. A tenant
 * provisioned before migration 0065, or one whose seed row was never written,
 * gets the same answer as one that explicitly switched the module off. Failing
 * closed is the right direction here: the cost of a wrong `false` is somebody
 * turning a feature on, and the cost of a wrong `true` is a screen nobody chose
 * appearing in their product.
 */
export async function moduleEnabled(tx: TxLike, key: OptionalModuleKey): Promise<boolean> {
  const rows = await tx.query<{ enabled: boolean }>(
    'SELECT enabled FROM tenancy.tenant_modules WHERE module_key = $1',
    [key],
  );
  return rows[0]?.enabled === true;
}

/** The whole catalogue with this tenant's answer against each. */
export async function listModules(tx: TxLike): Promise<readonly ModuleState[]> {
  const rows = await tx.query<{ module_key: string; enabled: boolean; changed_at: string }>(
    `SELECT module_key, enabled, changed_at::text AS changed_at
       FROM tenancy.tenant_modules`,
  );
  const byKey = new Map(rows.map((r) => [r.module_key, r]));
  // Driven by the catalogue, not by the rows. A module with no row still
  // appears — off — so the screen shows what could be switched on rather than
  // only what somebody has already touched.
  return OPTIONAL_MODULES.map((m) => {
    const row = byKey.get(m.key);
    return {
      key: m.key,
      title: m.title,
      summary: m.summary,
      enabled: row?.enabled === true,
      changedAt: row?.changed_at ?? null,
    };
  });
}

/**
 * Turn one on or off.
 *
 * Upsert, because the row may never have existed. `changed_by` and `changed_at`
 * are written on every change: "who turned the money screen on" is a question
 * somebody eventually asks, and the answer should not be an inference from a
 * backup.
 *
 * Switching a module off writes one boolean. **It deletes nothing** — see the
 * migration. Off is a visibility state so that switching back on returns the
 * work already done.
 */
export async function setModuleEnabled(
  tx: TxLike,
  tenantId: string,
  key: OptionalModuleKey,
  enabled: boolean,
  changedBy: string | null,
): Promise<void> {
  await tx.query(
    `INSERT INTO tenancy.tenant_modules (tenant_id, module_key, enabled, changed_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, module_key)
     DO UPDATE SET enabled    = EXCLUDED.enabled,
                   changed_by = EXCLUDED.changed_by,
                   changed_at = now()`,
    [tenantId, key, enabled, changedBy],
  );
}

/**
 * Write the catalogue out at provisioning, every module off.
 *
 * The rows are not what makes a module off — `moduleEnabled` already answers
 * false without them. They exist so that a new tenant's settings screen lists
 * the eleven from the first day, and so that `changed_at` on a module that was
 * never touched is the provisioning date rather than null forever.
 *
 * `DO NOTHING`, so re-running it on an existing tenant cannot switch off a
 * module that tenant deliberately switched on. Idempotent in the way that
 * matters, not just in the way that avoids an error.
 */
export async function seedTenantModules(tx: TxLike, tenantId: string): Promise<void> {
  await tx.query(
    `INSERT INTO tenancy.tenant_modules (tenant_id, module_key, enabled)
     SELECT $1, k, false FROM unnest($2::text[]) AS k
     ON CONFLICT (tenant_id, module_key) DO NOTHING`,
    [tenantId, OPTIONAL_MODULES.map((m) => m.key)],
  );
}
