import { z } from 'zod';
import { apiError, type ApiError } from '../errors.js';
import type { PathParams, RouteDescriptor } from './routes.js';

/**
 * The typed client apps reach services through.
 *
 * `eslint.config.mjs` forbids `apps -> services` and directs apps to "the
 * generated client in packages/contracts". That client did not exist, so until
 * now there was **no legal path from any app to any service at all** — the rule
 * was enforceable and unsatisfiable at the same time.
 *
 * It is hand-written over the Zod schemas rather than generated from a spec,
 * because there is no spec: the route shapes had to move into this package
 * either way, and once they have, codegen buys a generator dependency, a build
 * step and a drift check that only helps when CI runs. M2 rejected a service
 * generator on the same reasoning — written once, used a handful of times, then
 * drifting invisibly from the thing it claims to encode.
 *
 * **Responses are parsed, never cast.** A client that casts is a lie with types
 * on it: it promises the compiler something no one checked, and the first thing
 * a wrong promise does is put a `string` where a screen expected a number.
 */

/**
 * The result of a call.
 *
 * A discriminated union rather than an exception, because a refusal is an
 * ordinary outcome a screen has to render. In particular `TENANT_NOT_RESOLVED`
 * is what every tenant-scoped route answers until an identity provider is
 * configured, and it must be distinguishable from an empty list — under RLS a
 * query with no tenant set returns zero rows rather than erroring, so
 * "the isolation layer refused" and "there is no data" are otherwise the same
 * response.
 */
export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: ApiError };

/**
 * The server answered, but not in the shape it promised.
 *
 * Thrown rather than returned, because it is not a business outcome a screen
 * can render — it is a bug or a version skew between a deployed app and a
 * deployed API. Returning it as an ordinary error would let it be displayed as
 * "something went wrong" and never investigated.
 */
export class ApiContractError extends Error {
  constructor(
    readonly route: string,
    readonly issues: z.ZodError,
  ) {
    super(`${route}: response did not match the contract`);
    this.name = 'ApiContractError';
  }
}

/** The request never reached a server, or the connection failed mid-flight. */
export class ApiTransportError extends Error {
  constructor(
    readonly route: string,
    override readonly cause: unknown,
  ) {
    super(`${route}: request failed`);
    this.name = 'ApiTransportError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Origin of the API host, e.g. `http://localhost:4000`. No trailing slash. */
  readonly baseUrl: string;
  /** Injected so tests drive the real client without a network. Defaults to global `fetch`. */
  readonly fetch?: FetchLike;
  /** Sent on every request — a credential, a correlation id. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Options for one call. `body` is present exactly when the route declares a
 * request schema.
 *
 * `query` is separate from `params` because the two fail differently. A missing
 * path parameter produces a request to a URL with a literal `:id` in it, which
 * 404s loudly; a missing query parameter produces a request to a URL that
 * exists and answers something else. `GET /siteops/weekly/:projectId` requires
 * `weekStart` and answers 400 without it — found by the response-shape check in
 * the isolation suite, not by anything at compile time, because a query string
 * is not part of a route's path type.
 */
export type CallOptions<Req extends z.ZodTypeAny | undefined, Path extends string> = {
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  /** Appended as a query string. Values are encoded; an empty object adds nothing. */
  readonly query?: Readonly<Record<string, string>>;
} & ([PathParams<Path>] extends [never]
  ? { readonly params?: undefined }
  : { readonly params: Readonly<Record<PathParams<Path>, string>> }) &
  (Req extends z.ZodTypeAny ? { readonly body: z.input<Req> } : { readonly body?: undefined });

/**
 * A route, whichever one it is.
 *
 * These three aliases exist so an app can write a generic wrapper around
 * `call` **without depending on Zod**. `apps/web/lib/data.ts` needed
 * `z.output<Res>` to state its return type, which would have made every app a
 * consumer of the validation library — a dependency they have no other use for,
 * and one whose major version they would then be pinned to.
 */
export type AnyRoute = RouteDescriptor<z.ZodTypeAny | undefined, z.ZodTypeAny, string>;

/** What a route answers with, already parsed. */
export type RouteResponse<R extends AnyRoute> =
  R extends RouteDescriptor<z.ZodTypeAny | undefined, infer Res, string> ? z.output<Res> : never;

/** What one call to a route needs: its body, if it has one, and its path parameters. */
export type RouteOptions<R extends AnyRoute> =
  R extends RouteDescriptor<infer Req, z.ZodTypeAny, infer Path> ? CallOptions<Req, Path> : never;

export interface ApiClient {
  call<Req extends z.ZodTypeAny | undefined, Res extends z.ZodTypeAny, Path extends string>(
    route: RouteDescriptor<Req, Res, Path>,
    options: CallOptions<Req, Path>,
  ): Promise<ApiResult<z.output<Res>>>;
}

export function createClient(options: ClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  return {
    async call(route, callOptions) {
      const label = `${route.method} ${route.path}`;
      const url =
        baseUrl + substitutePathParams(route.path, callOptions.params) + toQuery(callOptions.query);

      const headers: Record<string, string> = { accept: 'application/json' };
      for (const [k, v] of Object.entries(options.headers ?? {})) headers[k] = v;
      for (const [k, v] of Object.entries(callOptions.headers ?? {})) headers[k] = v;

      const init: RequestInit = { method: route.method, headers };
      if (callOptions.signal !== undefined) init.signal = callOptions.signal;

      if (route.request !== undefined) {
        // Validated before it is sent. A malformed body caught here names the
        // offending field at the call site; the same body caught by the server
        // comes back as an opaque 400 from somewhere else entirely.
        const body: unknown = route.request.parse(callOptions.body);
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await doFetch(url, init);
      } catch (cause) {
        throw new ApiTransportError(label, cause);
      }

      const text = await response.text();
      let payload: unknown;
      let unreadable = false;
      try {
        payload = text.length === 0 ? null : (JSON.parse(text) as unknown);
      } catch {
        // A non-JSON body — an HTML error page from a proxy is the usual one.
        // Whether that is a contract violation depends on the status, so the
        // decision is deferred rather than thrown here: a 504 carrying an HTML
        // page is an ordinary outcome a screen must render, and turning it into
        // an exception would make the commonest infrastructure failure the
        // hardest one to handle.
        unreadable = true;
      }

      if (!response.ok) {
        const parsed = unreadable ? undefined : apiError.safeParse(payload);
        if (parsed?.success === true) {
          return { ok: false, status: response.status, error: parsed.data };
        }
        // A failure that does not carry the envelope did not come from our
        // error handler — a gateway timeout, a proxy, a crash before routing.
        return {
          ok: false,
          status: response.status,
          error: {
            code: response.status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED',
            message: 'The server returned an error that could not be interpreted.',
            requestId: response.headers.get('x-request-id') ?? 'unknown',
          },
        };
      }

      // A success that did not arrive as JSON is a contract violation: nothing
      // downstream can do anything with it.
      if (unreadable) throw new ApiContractError(label, notJson());

      const parsed = route.response.safeParse(payload);
      if (!parsed.success) throw new ApiContractError(label, parsed.error);
      return { ok: true, status: response.status, data: parsed.data as z.output<typeof route.response> };
    },
  };
}

function substitutePathParams(
  path: string,
  params: Readonly<Record<string, string>> | undefined,
): string {
  if (params === undefined) return path;
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`path parameter ":${name}" was not supplied for ${path}`);
    }
    // Encoded, so an id containing a slash cannot reach a different route.
    return encodeURIComponent(value);
  });
}

/** `?a=1&b=2`, or nothing at all. Never a bare `?`. */
function toQuery(query: Readonly<Record<string, string>> | undefined): string {
  if (query === undefined) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value.length > 0) search.set(key, value);
  }
  const rendered = search.toString();
  return rendered.length === 0 ? '' : `?${rendered}`;
}

function notJson(): z.ZodError {
  return new z.ZodError([
    { code: 'custom', path: [], message: 'response body was not JSON' } as z.core.$ZodIssue,
  ]);
}
