import { z } from 'zod';

/**
 * The `/connector/v1` contract — cloud side.
 *
 * The on-prem Tally connector is built in a separate session against a frozen
 * version of this contract. Per the ADR-0015 correction it does NOT import this
 * package: it keeps a dated snapshot in `cog-tally-connector/docs/CONTRACT.md`,
 * because taking a build-time dependency on a versioned package from this repo
 * would couple its release to ours — exactly what its backwards-compatibility
 * rule forbids. It must run unchanged against a cloud eighteen months newer
 * than itself.
 *
 * **This file encodes the contract AS FROZEN, not as reviewed.** An adversarial
 * review recommended four wire changes; each is recorded below as a
 * `HUMAN(CONNECTOR-nn)` marker rather than applied, because changing the shape
 * unilaterally while another session codes against it is the one thing the
 * brief rules out. See `docs/connector/OPEN-QUESTIONS.md`.
 */

// --------------------------------------------------------------- vouchers --

/**
 * Voucher kind. **Open on the wire, deliberately.**
 *
 * The connector must never reject an unrecognised value: the cloud may add
 * kinds, and old connectors have to keep forwarding. So the wire type is
 * `string`, and the known values are constants rather than a closed union.
 *
 * A closed `z.enum` here would become a closed union in the connector's
 * snapshot, and eighteen months later a new kind would be dropped on the floor
 * by every deployed agent — the precise failure the openness rule exists to
 * prevent. The connector's snapshot must type this as `string`.
 */
export const VOUCHER_KINDS = [
  'purchase',
  'sales',
  'payment',
  'receipt',
  'journal',
] as const;

export type KnownVoucherKind = (typeof VOUCHER_KINDS)[number];

/** What actually travels: any string. Validate nothing beyond that. */
export const voucherKind = z.string().min(1);

export const voucher = z.object({
  id: z.uuid(),
  kind: voucherKind,
  /**
   * Complete Tally XML, **already escaped by us**.
   *
   * Escaping is the cloud's responsibility, never the connector's. The legacy
   * `generateTallyVoucherXML` interpolates vendor names and the caller-supplied
   * voucher reference unescaped, so `M/s A&B Interiors` produces XML Tally
   * rejects. `services/finance` owns the generator and its escaping.
   */
  xml: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  /**
   * HUMAN(CONNECTOR-02): the contract does not say when this increments —
   * on hand-out or on reported failure. Under increment-on-hand-out a
   * connector that leases 50 vouchers and crash-loops dead-letters all 50
   * without one reaching Tally. Connectors must not branch on this value
   * until it is defined.
   */
  attempts: z.number().int().min(0),
});

export type Voucher = z.infer<typeof voucher>;

export const vouchersResponse = z.object({
  vouchers: z.array(voucher),
  serverTime: z.iso.datetime({ offset: true }),
  /**
   * Lease duration for the returned batch.
   *
   * The connector computes expiry from its own monotonic receipt time plus this
   * value — never from `serverTime` plus local wall-clock, which breaks on a
   * site machine with a dead CMOS battery.
   */
  leaseSeconds: z.number().int().positive(),
});

export type VouchersResponse = z.infer<typeof vouchersResponse>;

// ---------------------------------------------------------------- results --

/**
 * HUMAN(CONNECTOR-01): `"unknown"` is missing and should be added.
 *
 * A POST to Tally can time out because a user has a modal dialog open — Tally's
 * HTTP server blocks until a key is pressed — and Tally then processes the
 * request anyway. With only `posted | failed` the connector must guess: one
 * guess loses a voucher, the other duplicates it in a book of account. This is
 * common, not exotic.
 */
export const voucherResultStatus = z.enum(['posted', 'failed']);

/**
 * HUMAN(CONNECTOR-03): `code` should be a CLOSED enum with a transient/permanent
 * class. Unlike `kind`, both sides must agree on this vocabulary: the connector
 * observes the Tally response and the cloud decides the consequence. Today
 * "Tally is closed for the weekend" and "this ledger does not exist" are
 * indistinguishable, so they share one retry budget.
 */
export const voucherResultError = z.object({
  code: z.string().min(1),
  message: z.string().max(4096),
});

export const voucherResultRequest = z.object({
  status: voucherResultStatus,
  /** Tally's `LASTVCHID`. Informational — it can change under a data rewrite. */
  tallyVoucherId: z.string().optional(),
  error: voucherResultError.optional(),
});

export type VoucherResultRequest = z.infer<typeof voucherResultRequest>;

export const voucherResultResponse = z.object({ ok: z.literal(true) });

// ----------------------------------------------------------------- health --

export const healthResponse = z.object({
  ok: z.literal(true),
  minConnectorVersion: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponse>;

// ---------------------------------------------------------------- headers --

export const CONNECTOR_HEADERS = {
  /** Semver of the connector build. Sent on every request. */
  version: 'X-Connector-Version',
  /**
   * Stable per-machine uuid, generated at install.
   *
   * HUMAN(CONNECTOR-04): currently OPTIONAL — a connector that omits it gets the
   * old unleased behaviour. That carve-out exists for backwards compatibility
   * with connectors that do not exist, because nothing has shipped, and it
   * re-opens the double-post hole leasing was added to close. Recommend making
   * it required before either side ships.
   */
  instance: 'X-Connector-Instance',
} as const;

/** Base path. Versioned, because the connector outlives the cloud release. */
export const CONNECTOR_BASE_PATH = '/connector/v1';

/**
 * Answered when `X-Connector-Version` is below `minConnectorVersion`.
 *
 * Never break an older connector silently — it runs on a machine we do not
 * control (ADR-0004).
 */
export const CONNECTOR_UPGRADE_REQUIRED_STATUS = 426;
