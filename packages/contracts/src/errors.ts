import { z } from 'zod';

/**
 * Stable, machine-readable error codes.
 *
 * The legacy app returns `error.message` verbatim outside production and, in
 * production, `"Something went wrong. Reference ID: ERR-A7B2C1"` where the
 * reference is `Math.random()` and is never written to a log — so it correlates
 * with nothing and the caller has no way to describe what happened. Both halves
 * are wrong: one leaks internals, the other discards them.
 *
 * The replacement: a stable `code` the client can branch on, a `message` that
 * is safe to display, and a `requestId` that actually appears in the logs.
 */
export const errorCode = z.enum([
  // --- authentication and authorisation ---
  /** No credential presented. */
  'AUTH_REQUIRED',
  /** Credential presented but invalid, malformed, or revoked. */
  'AUTH_INVALID',
  /** Credential was valid and has expired. Distinct so clients can refresh. */
  'AUTH_EXPIRED',
  /** Authenticated, but not permitted to do this. Never a 404 in disguise. */
  'FORBIDDEN',

  // --- tenancy ---
  /**
   * No tenant could be resolved for this request.
   *
   * This is its own code, not a flavour of AUTH_INVALID, because it is the
   * signal that the isolation layer refused rather than that the caller was
   * unknown. Under RLS a missing `app.tenant_id` yields zero rows rather than
   * an error, so a query that quietly returns nothing is indistinguishable from
   * an empty table — this code is how that becomes loud instead of silent.
   */
  'TENANT_NOT_RESOLVED',
  /** The tenant exists but is suspended, or past due. */
  'TENANT_INACTIVE',

  // --- request ---
  'VALIDATION_FAILED',
  'NOT_FOUND',
  /** Optimistic-lock failure, or a duplicate of something unique. */
  'CONFLICT',
  'RATE_LIMITED',
  /** Payload or response too large to process. */
  'PAYLOAD_TOO_LARGE',

  // --- connector ---
  /**
   * The connector build is older than `minConnectorVersion`. Answered with 426.
   *
   * It runs on a machine we do not control, so this must never be a silent
   * failure — ADR-0004.
   */
  'CONNECTOR_UPGRADE_REQUIRED',

  // --- statutory ---
  /**
   * A statutory output — TDS on a payment, a challan, 26Q content, a Tally
   * voucher, a tax invoice — would rely on a value no chartered accountant has
   * verified, and this process was not told to produce drafts
   * (`STATUTORY_OUTPUTS=draft`). ADR-0014, addendums. The message names every
   * provisional value and its CA question. Told to produce drafts, the same
   * request computes and is marked provisional.
   */
  'PROVISIONAL_OUTPUT_REFUSED',

  // --- server ---
  /** Unexpected. The message is generic by construction; details go to logs. */
  'INTERNAL',
  /** A dependency (identity provider, object storage) is unavailable. */
  'DEPENDENCY_UNAVAILABLE',
]);

export type ErrorCode = z.infer<typeof errorCode>;

/**
 * The error envelope every endpoint returns on failure.
 *
 * `message` is safe to show a user. It must never carry a stack, a SQL
 * fragment, a file path, an internal identifier, or a vendor's PAN — the
 * legacy handler returns `error.message` raw whenever `NODE_ENV` is not
 * production, which means a stray database error becomes an API response.
 *
 * `details` exists only for `VALIDATION_FAILED`, and carries field paths, never
 * the offending values: echoing a rejected value back is how a bank account
 * number ends up in a browser console.
 */
export const apiError = z.object({
  code: errorCode,
  message: z.string(),
  /** Correlates with the `requestId` in the logs. Quote it in a support ticket. */
  requestId: z.string(),
  details: z
    .array(
      z.object({
        /** Dotted path to the offending field, e.g. `items.0.rate`. */
        path: z.string(),
        /** Why it was rejected. Never includes the value. */
        reason: z.string(),
      }),
    )
    .optional(),
});

export type ApiError = z.infer<typeof apiError>;

/**
 * The HTTP status each code is answered with.
 *
 * Kept here rather than at the call site so one code cannot mean 403 in one
 * service and 404 in another.
 */
export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  AUTH_EXPIRED: 401,
  FORBIDDEN: 403,
  TENANT_NOT_RESOLVED: 403,
  TENANT_INACTIVE: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  CONNECTOR_UPGRADE_REQUIRED: 426,
  PROVISIONAL_OUTPUT_REFUSED: 409,
  INTERNAL: 500,
  DEPENDENCY_UNAVAILABLE: 503,
});
