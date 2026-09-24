import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS, recordTransporterDeclarationInput, type ErrorCode } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import {
  TransporterDeclarationRefused,
  VendorNotFound,
  financialYearOfDate,
  getVendor,
  listTransporterDeclarations,
  recordTransporterDeclaration,
  todayInIndia,
} from '@cog/procurement';
import { documentsFor } from '@cog/workflow';

/**
 * A vendor's 194C(6) transporter declarations, and the evidence each is kept
 * against.
 *
 * **In the host because it is composition**: the declaration is procurement's,
 * and its evidence is a document in workflow's vault, registered against this
 * vendor (M1/D5). The CA's answer to CA-07 asks for "authorised
 * signature/declaration evidence"; a declaration whose evidence the vault does
 * not hold against this vendor is refused before anything is written.
 */

const VENDOR_ENTITY = 'vendor';
const PATH = '/purchase-orders/vendors/:vendorId/transporter-declarations';

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function refuse(c: Context, code: ErrorCode, message: string): Response {
  return c.json({ code, message, requestId: requestId(c) }, HTTP_STATUS[code] as 400);
}

export function vendorDeclarationRoutes(): Hono {
  const app = new Hono();

  app.get(PATH, async (c) => {
    const vendorId = c.req.param('vendorId');
    if (!z.uuid().safeParse(vendorId).success) return refuse(c, 'NOT_FOUND', 'No such vendor.');
    const tx = txOf(c);
    await getVendor(tx, vendorId);
    const items = await listTransporterDeclarations(tx, vendorId);
    const evidence = await documentsFor(tx, VENDOR_ENTITY, vendorId);
    const names = new Map(evidence.map((d) => [d.id, d.fileName]));
    return c.json({
      items: items.map((d) => ({ ...d, evidenceFileName: names.get(d.evidenceDocumentId) ?? null })),
      count: items.length,
      evidence: evidence.map((d) => ({ id: d.id, fileName: d.fileName })),
      currentFinancialYear: financialYearOfDate(todayInIndia(new Date())),
    });
  });

  app.post(PATH, async (c) => {
    const vendorId = c.req.param('vendorId');
    if (!z.uuid().safeParse(vendorId).success) return refuse(c, 'NOT_FOUND', 'No such vendor.');
    const parsed = recordTransporterDeclarationInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return refuse(c, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'That declaration was not recorded.');
    }
    const tx = txOf(c);
    await getVendor(tx, vendorId);
    const evidence = (await documentsFor(tx, VENDOR_ENTITY, vendorId)).find(
      (d) => d.id === parsed.data.evidenceDocumentId,
    );
    if (evidence === undefined) {
      return refuse(
        c,
        'CONFLICT',
        "The evidence has to be a document registered in the vault against this vendor — register it under Documents with the vendor's id.",
      );
    }
    const declaration = await recordTransporterDeclaration(tx, tenantOf(c), vendorId, parsed.data);
    return c.json({ ...declaration, evidenceFileName: evidence.fileName }, 201);
  });

  app.onError((error, c) => {
    if (error instanceof VendorNotFound) return refuse(c, 'NOT_FOUND', 'No such vendor.');
    if (error instanceof TransporterDeclarationRefused) return refuse(c, 'CONFLICT', error.message);
    throw error;
  });

  return app;
}
