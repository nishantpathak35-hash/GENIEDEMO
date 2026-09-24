import { randomUUID } from 'node:crypto';
import type { Page, TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './site-controls.js';

/**
 * Site recce.
 *
 * **RECCE-01: the legacy table is created outside the migration system.**
 * `recce.js:14-37` calls an inline `ensureTable()` at the top of every function,
 * so nothing knows whether the table exists or what shape it has — the same
 * failure as TASK-01.
 *
 * The columns checked clean otherwise. This is one of the modules where the
 * missing-column pattern does not appear, and the port is therefore a
 * straightforward move into the migration system with the measurements made
 * exact.
 *
 * Areas are integer millionths rather than `REAL`. None of them is money, but a
 * built-up area drives an estimate, and a float is a float wherever it sits.
 */

const FK_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const SCALE = 1_000_000n;

export class RecceNotFound extends Error {
  override readonly name = 'RecceNotFound';
}

export class RecceRefused extends Error {
  override readonly name = 'RecceRefused';
}

export interface Recce {
  readonly id: string;
  readonly projectId: string;
  readonly recceOn: string;
  readonly conductedBy: string;
  readonly clientPresent: boolean;
  readonly buaMicros: string | null;
  readonly carpetMicros: string | null;
  readonly floorHeightMicros: string | null;
  readonly floorNumber: string;
  readonly numFloors: number;
  readonly siteCondition: string;
  readonly handoverOn: string | null;
  readonly keyChallenges: string;
  readonly observations: string;
  readonly measurements: unknown;
  readonly services: unknown;
  readonly status: string;
  readonly version: number;
}

type Row = {
  id: string;
  project_id: string;
  recce_on: string;
  conducted_by: string;
  client_present: boolean;
  bua_micros: string | null;
  carpet_micros: string | null;
  floor_height_micros: string | null;
  floor_number: string;
  num_floors: number;
  site_condition: string;
  handover_on: string | null;
  key_challenges: string;
  observations: string;
  measurements: unknown;
  services: unknown;
  status: string;
  version: number;
};

const COLUMNS = `id, project_id, recce_on::text AS recce_on, conducted_by,
                 client_present, bua_micros::text AS bua_micros,
                 carpet_micros::text AS carpet_micros,
                 floor_height_micros::text AS floor_height_micros,
                 floor_number, num_floors, site_condition,
                 handover_on::text AS handover_on, key_challenges, observations,
                 measurements, services, status, version`;

function toRecce(r: Row): Recce {
  return {
    id: r.id,
    projectId: r.project_id,
    recceOn: r.recce_on,
    conductedBy: r.conducted_by,
    clientPresent: r.client_present,
    buaMicros: r.bua_micros,
    carpetMicros: r.carpet_micros,
    floorHeightMicros: r.floor_height_micros,
    floorNumber: r.floor_number,
    numFloors: r.num_floors,
    siteCondition: r.site_condition,
    handoverOn: r.handover_on,
    keyChallenges: r.key_challenges,
    observations: r.observations,
    measurements: r.measurements,
    services: r.services,
    status: r.status,
    version: r.version,
  };
}

function micros(whole: number | undefined, millionths: number | undefined): bigint | null {
  if (whole === undefined) return null;
  return BigInt(whole) * SCALE + BigInt(millionths ?? 0);
}

export async function listRecces(
  tx: TxLike,
  projectId: string,
  page: PageQuery,
): Promise<Page<Recce>> {
  const k = keyset(page, 'recce_on', 'id', 'date', true, 2);
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS}
       FROM siteops.site_recces
      WHERE project_id = $1
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [projectId, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM siteops.site_recces WHERE project_id = $1`,
    [projectId],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.recce_on, id: r.id }));
  return {
    items: paged.items.map(toRecce),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export interface RecceInput {
  readonly projectId: string;
  readonly recceOn: string;
  readonly clientPresent?: boolean | undefined;
  readonly buaWhole?: number | undefined;
  readonly buaMillionths?: number | undefined;
  readonly carpetWhole?: number | undefined;
  readonly carpetMillionths?: number | undefined;
  readonly floorHeightWhole?: number | undefined;
  readonly floorHeightMillionths?: number | undefined;
  readonly floorNumber?: string | undefined;
  readonly numFloors?: number | undefined;
  readonly siteCondition?: string | undefined;
  readonly handoverOn?: string | undefined;
  readonly keyChallenges?: string | undefined;
  readonly observations?: string | undefined;
  readonly measurements?: unknown;
  readonly services?: unknown;
}

export async function createRecce(
  tx: TxLike,
  ctx: TenantContext,
  input: RecceInput,
): Promise<Recce> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO siteops.site_recces
         (tenant_id, id, project_id, recce_on, conducted_by, client_present,
          bua_micros, carpet_micros, floor_height_micros, floor_number,
          num_floors, site_condition, handover_on, key_challenges, observations,
          measurements, services)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16::jsonb, $17::jsonb)`,
      [
        ctx.tenantId,
        id,
        input.projectId,
        input.recceOn,
        // Who conducted it is who is authenticated, never a name from the body.
        ctx.principal.id,
        input.clientPresent ?? false,
        micros(input.buaWhole, input.buaMillionths),
        micros(input.carpetWhole, input.carpetMillionths),
        micros(input.floorHeightWhole, input.floorHeightMillionths),
        input.floorNumber ?? '',
        input.numFloors ?? 1,
        input.siteCondition ?? 'bare_shell',
        input.handoverOn ?? null,
        input.keyChallenges ?? '',
        input.observations ?? '',
        JSON.stringify(input.measurements ?? {}),
        JSON.stringify(input.services ?? {}),
      ],
    );
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === FK_VIOLATION) {
      throw new RecceRefused('that project does not exist in this organisation');
    }
    if (code === CHECK_VIOLATION) {
      // The carpet-within-BUA check is the one that fires in practice: a survey
      // saying otherwise is a transcription error, and it is cheaper to refuse
      // it than to find it later inside an estimate.
      throw new RecceRefused(
        'those measurements are inconsistent — carpet area cannot exceed built-up area',
      );
    }
    throw error;
  }

  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM siteops.site_recces WHERE id = $1`, [id]);
  return toRecce(rows[0]!);
}

export async function getRecce(tx: TxLike, id: string): Promise<Recce> {
  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM siteops.site_recces WHERE id = $1`, [id]);
  const row = rows[0];
  if (row === undefined) throw new RecceNotFound(`no such recce: ${id}`);
  return toRecce(row);
}
