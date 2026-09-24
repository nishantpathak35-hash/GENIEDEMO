import type {
  AnyRoute,
  ApiClient,
  ApiError,
  RouteOptions,
  RouteResponse,
} from '@cog/contracts';

/**
 * One way to read from the API, so every screen handles the three outcomes.
 *
 * A screen has to distinguish three things and the legacy distinguishes none of
 * them: the server answered, the server refused, or nothing was reached. Under
 * row-level security a query with no tenant context returns **zero rows** — so
 * a refusal and an empty list are the same response unless something keeps them
 * apart, and `TENANT_NOT_RESOLVED` is what every route answers until an
 * identity provider is configured.
 *
 * `ApiContractError` is deliberately NOT caught. A response that does not match
 * its schema is a version skew between a deployed app and a deployed API, not a
 * business outcome, and swallowing it into "something went wrong" is how it
 * never gets investigated.
 */

export type Loaded<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'refused'; readonly error: ApiError }
  | { readonly kind: 'unreachable' };

export async function load<R extends AnyRoute>(
  client: ApiClient,
  route: R,
  options: RouteOptions<R>,
): Promise<Loaded<RouteResponse<R>>> {
  let result;
  try {
    result = await client.call(route, options);
  } catch (error) {
    // A transport failure only. `ApiContractError` carries its own name and is
    // rethrown, because it means the two sides disagree about a shape.
    if (error instanceof Error && error.name === 'ApiTransportError') {
      return { kind: 'unreachable' };
    }
    throw error;
  }
  // One cast, at the generic boundary and nowhere else. `call` already PARSED
  // the body against `route.response` — the value is checked; what TypeScript
  // cannot do is connect the inferred `R` back to its own type parameters
  // through a generic. This is not the cast `client.ts` warns about, which is
  // promising the compiler something nobody verified.
  return result.ok
    ? { kind: 'ok', data: result.data as RouteResponse<R> }
    : { kind: 'refused', error: result.error };
}

/** The first failure of several reads, or `null` when all of them succeeded. */
export function firstFailure(
  ...loaded: ReadonlyArray<Loaded<unknown>>
): Exclude<Loaded<never>, { kind: 'ok' }> | null {
  for (const one of loaded) {
    if (one.kind === 'refused') return { kind: 'refused', error: one.error };
    if (one.kind === 'unreachable') return { kind: 'unreachable' };
  }
  return null;
}

/** The rows of a successful read, or none — for a panel beside a failed one. */
export function itemsOf<T>(loaded: Loaded<{ items: readonly T[] }>): readonly T[] {
  return loaded.kind === 'ok' ? loaded.data.items : [];
}
