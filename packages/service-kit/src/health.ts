import type { Pool } from 'pg';

/**
 * Health checks.
 *
 * Two endpoints, because they answer different questions and conflating them
 * causes outages:
 *
 *   **liveness**  — is this process alive? Never touches a dependency. If it
 *                   fails, the orchestrator should restart the container.
 *   **readiness** — can it serve traffic? Checks dependencies. If it fails, the
 *                   load balancer should stop sending requests, and the
 *                   container should NOT be restarted.
 *
 * A liveness probe that checks the database restarts every API container when
 * Postgres has a brief blip — turning a recoverable dependency hiccup into a
 * full outage, and then a thundering herd of reconnects on the way back.
 */

export interface DependencyCheck {
  readonly name: string;
  check(): Promise<void>;
}

export type HealthStatus = 'ok' | 'degraded';

export interface ReadinessReport {
  readonly status: HealthStatus;
  readonly checks: ReadonlyArray<{
    readonly name: string;
    readonly ok: boolean;
    readonly durationMs: number;
    /** Present only when `ok` is false. Never carries a connection string. */
    readonly error?: string;
  }>;
}

/** Liveness. Deliberately trivial — it must not depend on anything. */
export function liveness(): { ok: true } {
  return { ok: true };
}

/**
 * A database check that verifies the runtime role as well as reachability.
 *
 * `SELECT 1` proves only that something answered. It would pass while connected
 * as a superuser through a misconfigured pooler — the exact condition under
 * which every row-level security policy in the system is inert. Readiness is
 * where that gets caught, because it is checked continuously rather than once
 * at boot.
 */
export function databaseCheck(pool: Pool, expectedRole = 'app_runtime'): DependencyCheck {
  return {
    name: 'postgres',
    async check() {
      const { rows } = await pool.query<{ role: string; bypass: boolean; superuser: boolean }>(
        `SELECT current_user AS role,
                rolbypassrls  AS bypass,
                rolsuper      AS superuser
           FROM pg_roles WHERE rolname = current_user`,
      );
      const row = rows[0];
      if (row === undefined) throw new Error('could not resolve current_user');
      if (row.role !== expectedRole) {
        throw new Error(`connected as ${row.role}, expected ${expectedRole}`);
      }
      if (row.bypass) throw new Error('runtime role can bypass row-level security');
      if (row.superuser) throw new Error('runtime role is a superuser');
    },
  };
}

/**
 * Run every check, always. No short-circuit.
 *
 * Stopping at the first failure hides the second one, and the second is often
 * the one that explains the first. An operator reading this at 2am wants the
 * whole picture in one response.
 */
export async function readiness(
  checks: readonly DependencyCheck[],
  timeoutMs = 2000,
): Promise<ReadinessReport> {
  const results = await Promise.all(
    checks.map(async (c) => {
      const started = Date.now();
      try {
        await withTimeout(c.check(), timeoutMs, c.name);
        return { name: c.name, ok: true, durationMs: Date.now() - started };
      } catch (error) {
        return {
          name: c.name,
          ok: false,
          durationMs: Date.now() - started,
          // A dependency error routinely contains a connection string, which
          // carries a password. Only the message survives, and callers must
          // treat readiness output as internal.
          error: error instanceof Error ? error.message : 'check failed',
        };
      }
    }),
  );

  return {
    status: results.every((r) => r.ok) ? 'ok' : 'degraded',
    checks: results,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
