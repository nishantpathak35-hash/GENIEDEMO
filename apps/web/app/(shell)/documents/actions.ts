'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseWholeNumber } from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';
import { failed, messageFor, optionalText, succeeded, text, type ActionState } from '@cog/design-system';

/**
 * The document vault, as metadata.
 *
 * **This registers an object. It never carries the bytes.** Three separate
 * legacy defects are what that sentence is about:
 *
 *   - **VAULT-01.** `attachments.js:75-83` writes uploads into
 *     `public/uploads/` and stores the path. That directory is served with no
 *     session and no tenant check, so anything in it — signed contracts
 *     included — is retrievable by URL by anyone who knows or guesses it.
 *   - **VAULT-02.** The alternative path base64-encodes the file into a
 *     column, so a 20 MB drawing is a 27 MB row that every list query reads.
 *   - The vault screen sends `fileSize: 1024 * 50` and
 *     `fileType: 'application/octet-stream'` as literals regardless of the real
 *     file (`DocumentVaultView.js:51-52`), so the size and type recorded are
 *     the same for every document ever uploaded.
 *
 * The checksum is required and validated as a sha256 hex digest, so a
 * registration names exactly one object and a mismatch is detectable.
 */
export async function registerDocument(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const entityType = text(form, 'entityType');
  const entityId = text(form, 'entityId');
  const fileName = text(form, 'fileName');
  const contentType = text(form, 'contentType');
  const checksum = text(form, 'checksum').toLowerCase();

  if (
    entityType.length === 0 ||
    entityId.length === 0 ||
    fileName.length === 0 ||
    contentType.length === 0
  ) {
    return failed('Every field except the checksum note is required.');
  }
  if (!/^[0-9a-f]{64}$/.test(checksum)) {
    return failed('The checksum must be a sha256 hex digest — 64 hex characters.');
  }

  let sizeBytes: number;
  try {
    sizeBytes = parseWholeNumber(text(form, 'sizeBytes'), 'Size');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.registerDocument, {
    body: { entityType, entityId, fileName, contentType, sizeBytes, checksum },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/documents');
  // the project's twin, when the form was its
  const base = optionalText(form, 'base');
  if (base !== undefined && /^\/projects\/[^/]+\/documents$/.test(base)) revalidatePath(base);
  return succeeded(`${result.data.fileName} registered at ${result.data.objectKey}.`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.deleteDocument, { params: { documentId } });
  revalidatePath('/documents');
}

/**
 * Delete more than one at once — the vault's bulk bar has no batch endpoint
 * behind it, so this is `deleteDocument` called once per id, sequentially,
 * server-side. "Download as a zip" and "Share a link" (the design's other two
 * bulk actions) have no endpoint at all and are not built here —
 * `HUMAN(DATA-documents-bulk)`.
 */
export async function bulkDeleteDocuments(documentIds: readonly string[]): Promise<void> {
  const client = await apiAsCaller();
  for (const documentId of documentIds) {
    await load(client, API_ROUTES.deleteDocument, { params: { documentId } });
  }
  revalidatePath('/documents');
}
