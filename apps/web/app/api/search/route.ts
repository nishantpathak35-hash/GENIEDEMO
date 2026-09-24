import { API_ROUTES } from '@cog/contracts';
import { load } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';

export const dynamic = 'force-dynamic';

/**
 * The bar's search, for the browser: the one call to the scoped search read
 * (`GET /api/v1/shell/search`), made with the caller's own credential, which
 * the browser never holds. No rules here — the host decides what this person
 * may find; this hands the words over and the hits back.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const scope = url.searchParams.get('scope') ?? 'everything';
  const projectId = url.searchParams.get('projectId');
  const read = await load(await apiAsCaller(), API_ROUTES.search, {
    query: { q, scope, ...(projectId === null || projectId === '' ? {} : { projectId }) },
  });
  const body = read.kind === 'ok' ? read.data : { scope, items: [] };
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
