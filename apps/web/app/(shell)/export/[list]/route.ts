import { WORDS, relabel } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { terms } from '../../../../lib/terms';
import { EXPORT_ROW_CAP, toCsv } from '../../../../lib/export';
import { EXPORT_LISTS } from '../lists';

export const dynamic = 'force-dynamic';

/**
 * `GET /export/<list>?<the screen's filters>` — the list as a CSV file.
 *
 * Read as the signed-in caller, so the file holds exactly what that person may
 * see: a refusal from the API is a refusal here, with the same status, and
 * nothing is written for a caller who could not read the list.
 */
export async function GET(request: Request, { params }: { params: Promise<{ list: string }> }): Promise<Response> {
  const { list } = await params;
  const spec = Object.hasOwn(EXPORT_LISTS, list) ? EXPORT_LISTS[list] : undefined;
  if (spec === undefined) return plain(404, 'There is no export by that name.');

  const url = new URL(request.url);
  const [result, t] = await Promise.all([spec.rows(await apiAsCaller(), url.searchParams), terms()]);
  // a column is a label: the firm's word for it, and the design's — Before GST, never Taxable
  const headers = (result.kind === 'ok' && result.headers !== undefined ? result.headers : spec.headers).map((h) => relabel(MONEY_WORDS[h] ?? h, t));

  switch (result.kind) {
    case 'unreachable':
      return plain(503, 'The API is not reachable, so nothing was exported.');
    case 'too-many':
      return plain(
        413,
        `This list holds more than ${String(EXPORT_ROW_CAP)} rows. Narrow the filters and export again.`,
      );
    case 'refused':
      return plain(statusFor(result.error.code), result.error.message);
    case 'ok': {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      return new Response(toCsv(headers, result.rows), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${spec.filename}-${day}.csv"`,
          'cache-control': 'no-store',
        },
      });
    }
  }
}

/** The label map on a CSV's head, where the shipped words still stood. */
const MONEY_WORDS: Readonly<Record<string, string>> = { Taxable: WORDS.beforeGst, 'Taxable value': WORDS.beforeGst, Gross: WORDS.total };

function statusFor(code: string): number {
  if (code.startsWith('AUTH_')) return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'VALIDATION_FAILED') return 400;
  return 502;
}

function plain(status: number, message: string): Response {
  return new Response(`${message}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
