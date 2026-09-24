import { pino, type Logger } from 'pino';
import type { TenantContext } from '@cog/contracts';

/**
 * Structured logging, correlated by tenant / user / request.
 *
 * Two things here are load-bearing rather than cosmetic.
 *
 * **1. Money must never be logged as a number.** `JSON.stringify` throws on a
 * bigint, which is a useful guard elsewhere — but pino does not use it. Its
 * serialiser emits a bigint as an *unquoted numeric literal*, so
 * `{"amount": 9007199254740993}` in a log line becomes 9007199254740992 the
 * moment anything downstream parses it. For an audit trail that is meant to be
 * evidence, that is a silently wrong figure. Every bigint is converted to its
 * decimal string before it reaches the serialiser.
 *
 * **2. Nothing sensitive is logged, by construction rather than by care.** The
 * legacy app's data carries vendor `bank_account`, `ifsc`, `pan` and `gstin`;
 * connector keys authenticate a whole tenant. Redaction is configured centrally
 * so a new service cannot forget it.
 */

/** Recursively replace bigints with their decimal string form. */
function stringifyBigints(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[max depth]';
  if (typeof value === 'bigint') return value.toString(10);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stringifyBigints(v, depth + 1));
  if (value instanceof Date || value instanceof Error) return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = stringifyBigints(inner, depth + 1);
  }
  return out;
}

/**
 * Paths never written to a log.
 *
 * Wildcards cover nesting, because the same field arrives under different
 * parents — a vendor record, a payment advice, an audit diff.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.connectorKey',
  '*.bank_account',
  '*.bankAccount',
  '*.ifsc',
  '*.pan',
  '*.gstin',
  '*.tan',
  '*.aadhaar',
  'password',
  'token',
  'connectorKey',
];

export interface LoggerOptions {
  readonly level?: string;
  readonly destination?: NodeJS.WritableStream;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const base = {
    level: options.level ?? process.env['LOG_LEVEL'] ?? 'info',
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    formatters: {
      // Runs on every log object, so a bigint cannot slip through from a
      // caller that did not think about it.
      log: (object: Record<string, unknown>) =>
        stringifyBigints(object) as Record<string, unknown>,
    },
  };

  return options.destination ? pino(base, options.destination) : pino(base);
}

/**
 * A child logger bound to one request's context.
 *
 * Every line a request emits carries the same `tenantId`, `principalId` and
 * `requestId`, which is what makes "show me everything that happened for this
 * tenant on this request" a query rather than an archaeology exercise. The
 * `requestId` is the same value returned in an `ApiError`, so a support ticket
 * quoting it leads straight to the lines.
 *
 * `tenantId` is included even though RLS also scopes the data: a log line is
 * outside the database, and a reviewer asking "how do you know this request
 * only touched one tenant" wants it stated, not inferred.
 */
export function forRequest(logger: Logger, context: TenantContext): Logger {
  return logger.child({
    tenantId: context.tenantId,
    principalId: context.principal.id,
    principalKind: context.principal.kind,
    requestId: context.requestId,
  });
}

export type { Logger };
