import { HTTP_STATUS, type ApiError, type ErrorCode } from '@cog/contracts';
import { TenantContextError } from './tenant-context.js';
import type { Logger } from './logger.js';

/**
 * Turning a thrown error into an HTTP response.
 *
 * The legacy handler does this:
 *
 *     if (isCloudProduction) {
 *       const refId = Math.random().toString(36).substring(2, 9).toUpperCase();
 *       return NextResponse.json({ error: `Something went wrong. Reference ID: ERR-${refId}` });
 *     }
 *     return NextResponse.json({ error: error.message });
 *
 * Both halves are wrong. Outside production it returns `error.message` verbatim,
 * so a stray database error becomes an API response — table names, SQL
 * fragments, sometimes a row. Inside production it invents a reference id that
 * is never written to any log, so it correlates with nothing and the caller
 * cannot describe what happened.
 *
 * The replacement returns the same envelope in every environment: a stable code
 * the client can branch on, a message safe to display, and a `requestId` that
 * genuinely appears in the logs.
 */

/** An error that already knows its own code. Anything else becomes INTERNAL. */
export class ServiceError extends Error {
  override readonly name = 'ServiceError';
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ApiError['details'],
  ) {
    super(message);
  }
}

/** Postgres SQLSTATEs we can map to something meaningful for a caller. */
const PG_CODE_MAP: Readonly<Record<string, ErrorCode>> = Object.freeze({
  '23505': 'CONFLICT', // unique_violation
  '23503': 'CONFLICT', // foreign_key_violation
  '23514': 'VALIDATION_FAILED', // check_violation
  '23502': 'VALIDATION_FAILED', // not_null_violation
  '42501': 'FORBIDDEN', // insufficient_privilege — an RLS WITH CHECK refusal
  '40001': 'CONFLICT', // serialization_failure
  '57014': 'INTERNAL', // query_canceled (statement_timeout)
  '53300': 'DEPENDENCY_UNAVAILABLE', // too_many_connections
});

/** Messages safe to show a caller. Never derived from the thrown error. */
const SAFE_MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
  AUTH_REQUIRED: 'Authentication is required.',
  AUTH_INVALID: 'Those credentials are not valid.',
  AUTH_EXPIRED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have permission to do that.',
  TENANT_NOT_RESOLVED: 'No organisation could be determined for this request.',
  TENANT_INACTIVE: 'This organisation is not currently active.',
  VALIDATION_FAILED: 'Some of the submitted values are not valid.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'That change conflicts with the current state of the record.',
  PROVISIONAL_OUTPUT_REFUSED: 'That cannot be produced while a statutory value behind it is still provisional.',
  RATE_LIMITED: 'Too many requests. Please retry shortly.',
  PAYLOAD_TOO_LARGE: 'That request is too large to process.',
  CONNECTOR_UPGRADE_REQUIRED: 'This connector version is no longer supported. Please upgrade.',
  INTERNAL: 'Something went wrong on our side.',
  DEPENDENCY_UNAVAILABLE: 'A dependency is temporarily unavailable. Please retry shortly.',
});

function classify(error: unknown): ErrorCode {
  if (error instanceof ServiceError) return error.code;
  if (error instanceof TenantContextError) return 'TENANT_NOT_RESOLVED';

  const pgCode = (error as { code?: unknown })?.code;
  if (typeof pgCode === 'string' && pgCode in PG_CODE_MAP) {
    return PG_CODE_MAP[pgCode] as ErrorCode;
  }
  return 'INTERNAL';
}

export interface ErrorResponse {
  readonly status: number;
  readonly body: ApiError;
}

/**
 * Map any thrown value to an `ApiError` and a status, and log the real cause.
 *
 * The full error — stack, SQLSTATE, `detail`, `hint` — goes to the log, keyed by
 * the same `requestId` returned to the caller. Postgres puts the offending
 * values in `detail` (`Key (gstin)=(27AAAAA0000A1Z5) already exists`), so it is
 * logged and never returned.
 */
export function toErrorResponse(
  error: unknown,
  requestId: string,
  logger?: Logger,
): ErrorResponse {
  const code = classify(error);
  const status = HTTP_STATUS[code];

  logger?.error(
    {
      err: error,
      errorCode: code,
      requestId,
      // Explicitly captured: pg puts the offending value here, which is exactly
      // what must reach the log and never the response.
      pgDetail: (error as { detail?: unknown })?.detail,
      pgConstraint: (error as { constraint?: unknown })?.constraint,
    },
    'request failed',
  );

  const details = error instanceof ServiceError ? error.details : undefined;

  return {
    status,
    body: {
      code,
      message: SAFE_MESSAGES[code],
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export { SAFE_MESSAGES };
