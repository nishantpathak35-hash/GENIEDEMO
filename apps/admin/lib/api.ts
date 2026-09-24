import { createClient, type ApiClient } from '@cog/contracts';
import { currentCredential } from './session';

/**
 * The one place this app constructs a client.
 *
 * Apps reach services over HTTP through `packages/contracts` and never by
 * linking — `eslint.config.mjs` fails the build on `apps -> services`.
 *
 * `api` takes the credential and a `fetch`, so a test drives the real client
 * against a fake transport; `apiAsCaller` is the server-side convenience that
 * reads the cookie.
 */

export interface ApiOptions {
  readonly credential?: string | null;
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly baseUrl?: string;
}

/**
 * Where the API is, from wherever this code happens to be running.
 *
 * **Two answers, because there are two callers.** Every page here is a server
 * component and fetches from the Next.js server; a form action posts from the
 * browser. In containers those are different networks:
 *
 *   server side  →  http://api:4000        (service name, internal network)
 *   browser side →  http://localhost:4000  (published host port)
 *
 * `NEXT_PUBLIC_API_URL` is baked into the client bundle and so must be the
 * host-reachable one. `API_URL` is server-only and takes precedence when it is
 * set, which it is only in compose.
 *
 * Getting this wrong is quiet, which is why it is written out. With one value
 * for both, every screen in the container rendered "The API is not reachable"
 * — a 200, with a heading and a paragraph, no console error and no raw money on
 * it, because there was no data at all. A browser smoke suite went green across
 * all 39 screens against that.
 */
function apiBaseUrl(): string {
  return (
    process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
  );
}

export function api(options: ApiOptions = {}): ApiClient {
  const headers: Record<string, string> = {};
  const credential = options.credential;
  if (credential !== null && credential !== undefined && credential.length > 0) {
    headers['authorization'] = `Bearer ${credential}`;
  }
  return createClient({
    baseUrl: options.baseUrl ?? apiBaseUrl(),
    headers,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}

export async function apiAsCaller(): Promise<ApiClient> {
  return api({ credential: await currentCredential() });
}
