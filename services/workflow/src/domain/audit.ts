import type { PrincipalKind, TenantContext } from '@cog/contracts';

/**
 * The audit log.
 *
 * ENTERPRISE-READINESS: "append-only audit log on every mutation — actor,
 * action, tenant, timestamp, source IP", designed in from milestone 1 because
 * SOC 2 Type II wants 6–12 months of evidence and the clock starts when the log
 * does.
 *
 * Three properties this has and the legacy `audit_logs` does not:
 *
 *   1. **Append-only by privilege.** `app_runtime` holds `SELECT, INSERT` and
 *      nothing else, so rewriting history fails before it reaches a policy.
 *   2. **A structured diff.** The legacy writes
 *      `'PO Value: "1000" → "1200"'` into a free-text column, which cannot be
 *      queried, diffed or reconciled. This writes JSONB.
 *   3. **Written after the fact, in the same transaction.** `logAudit` is
 *      called *before* the operation it describes in `deletePOFull`, so a
 *      failed delete still leaves "PO Deleted" in the log.
 */

export interface AuditEvent {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before?: Readonly<Record<string, unknown>> | undefined;
  readonly after?: Readonly<Record<string, unknown>> | undefined;
  readonly sourceIp?: string | undefined;
}

export interface AuditRecord extends AuditEvent {
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorKind: PrincipalKind;
  readonly impersonatedBy?: string | undefined;
  readonly requestId: string;
}

/**
 * Build the record from the CONTEXT, never from a caller's arguments.
 *
 * The actor is whoever the request authenticated as. Accepting an actor id as a
 * parameter would let a caller write an audit row attributing its own action to
 * somebody else — which is worse than having no log, because it is evidence
 * that is wrong rather than absent.
 */
export function auditRecord(
  ctx: TenantContext,
  event: AuditEvent,
  impersonatedBy?: string,
): AuditRecord {
  if (event.action.trim() === '' || event.entityType.trim() === '') {
    throw new Error('an audit event needs an action and an entity type');
  }
  return {
    ...event,
    tenantId: ctx.tenantId,
    actorId: ctx.principal.id,
    actorKind: ctx.principal.kind,
    ...(impersonatedBy === undefined ? {} : { impersonatedBy }),
    requestId: ctx.requestId,
  };
}

/**
 * Prepare a value tree for JSONB.
 *
 * **Money becomes a string.** `node-postgres` parses a `jsonb` column with
 * `JSON.parse`, so a bigint serialised as a number returns as a JS float — and
 * a crore-scale figure silently loses precision on the way *out* of the audit
 * trail, which is the one place that must not happen. `JSON.stringify` would
 * throw on a bigint anyway; this converts deliberately rather than relying on
 * that throw.
 *
 * Redaction happens here too, so a diff of a vendor record cannot put a bank
 * account number into a table designed to be kept for years and shown to
 * auditors.
 */
const REDACTED_KEYS = new Set([
  'bank_account',
  'bankAccount',
  'ifsc',
  'pan',
  'gstin',
  'tan',
  'aadhaar',
  'password',
  'passwordHash',
  'token',
  'connectorKey',
  'keyHash',
]);

export function forJsonb(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[max depth]';
  if (typeof value === 'bigint') return value.toString(10);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => forJsonb(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : forJsonb(inner, depth + 1);
  }
  return out;
}

/**
 * The fields that changed between two states.
 *
 * Returns `null` when nothing changed, so a no-op write does not produce an
 * audit row claiming an edit. The legacy equivalent writes
 * `'No tracked field changes'` as an audit entry, which fills the log with rows
 * recording that nothing happened.
 */
export function diff(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  let changed = false;

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    // Compare on the JSONB-ready form so a bigint and its string are the same
    // value, and so a Date and its ISO string do not read as a change.
    if (JSON.stringify(forJsonb(a)) === JSON.stringify(forJsonb(b))) continue;
    changedBefore[key] = forJsonb(a);
    changedAfter[key] = forJsonb(b);
    changed = true;
  }

  return changed ? { before: changedBefore, after: changedAfter } : null;
}
