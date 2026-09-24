import { createClient, type ApiClient } from '@cog/contracts';
import { currentCredential } from './session';
import { handleBackendRequest } from './backend/handler';

/**
 * The one place this app constructs a client.
 *
 * Apps reach services over HTTP through `packages/contracts` and never by
 * linking — `eslint.config.mjs` fails the build on `apps -> services`, with a
 * message pointing here.
 *
 * When `API_URL` is set, calls go to that external service.
 * When absent, calls are served directly by the embedded backend handler,
 * giving a self-contained zero-configuration experience on Vercel and local dev.
 */

export function apiBaseUrl(): string {
  if (process.env['API_URL']) return process.env['API_URL'];
  if (process.env['NEXT_PUBLIC_API_URL']) return process.env['NEXT_PUBLIC_API_URL'];
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const vercelHost =
    process.env['VERCEL_PROJECT_PRODUCTION_URL'] ?? process.env['VERCEL_URL'];
  if (vercelHost) {
    return `https://${vercelHost}`;
  }
  return `http://localhost:${process.env['PORT'] ?? 3000}`;
}

export interface ApiOptions {
  readonly credential?: string | null;
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly baseUrl?: string;
}

export function api(options: ApiOptions = {}): ApiClient {
  const headers: Record<string, string> = {};
  const credential = options.credential;
  if (credential !== null && credential !== undefined && credential.length > 0) {
    headers['authorization'] = `Bearer ${credential}`;
  }

  // 1. Explicit fetch supplied (tests, custom transport)
  if (options.fetch !== undefined) {
    return createClient({
      baseUrl: options.baseUrl ?? apiBaseUrl(),
      headers,
      fetch: options.fetch,
    });
  }

  // 2. Explicit external API_URL configured
  if (process.env['API_URL']) {
    return createClient({
      baseUrl: options.baseUrl ?? process.env['API_URL'],
      headers,
    });
  }

  // 3. Browser caller: calls standard fetch against the app origin /api/v1
  if (typeof window !== 'undefined') {
    return createClient({
      baseUrl: options.baseUrl ?? apiBaseUrl(),
      headers,
    });
  }

  // 4. Server caller without external API: dispatch in-process to embedded backend
  return createClient({
    baseUrl: options.baseUrl ?? 'http://localhost:3000',
    headers,
    fetch: async (input: string, init?: RequestInit) => {
      return handleBackendRequest(new Request(input, init));
    },
  });
}

/** A client carrying this request's credential. Server components only. */
export async function apiAsCaller(): Promise<ApiClient> {
  return api({ credential: await currentCredential() });
}

