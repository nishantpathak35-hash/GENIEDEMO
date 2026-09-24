'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES, type ApiError, type PurchaseOrderLineInput } from '@cog/contracts';
import {
  MoneyInputError,
  parsePercentToBasisPoints,
  parseQuantityToParts,
  parseRupeesToWire,
  parseWholeNumber,
} from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';
import {
  failed,
  messageFor,
  optionalText,
  reasonSentence,
  succeeded,
  text,
  type ActionState,
  type PricedState,
} from '@cog/design-system';

/**
 * Purchase-order writes.
 *
 * **The form sends lines. It does not send a total, and it cannot.**
 * `createPurchaseOrderInput` has no field for one — the server computes
 * `taxable`, `gst` and `gross` from the lines, and that is the whole of
 * ADR-0014's authority inversion made concrete.
 *
 * The legacy computes the totals in the browser and sends them:
 * `poValue: netPayable` (`POFormModal.js:429`), where `netPayable` is
 * `grandTotal - tdsAmount` from `POsView.js:154` and `tdsAmount` is
 * `Math.round(subtotal * (tdsPct / 100))` from `:153`. So a filed figure was
 * decided in a browser, by a rate typed into a form.
 *
 * **There is no TDS field on this path and there will not be one until
 * CA-05..CA-08 are answered.** A TDS rate applied to a taxable value is a
 * statutory rounding decision; putting a plausible one here to make the screen
 * feel complete is the move that produced the legacy.
 */

interface ParsedLines {
  readonly lines: PurchaseOrderLineInput[];
}

/** Read the repeated line fields a dynamic form submits. */
function readLines(form: FormData): ParsedLines {
  const descriptions = form.getAll('lineDescription').map((v) => String(v));
  const lines: PurchaseOrderLineInput[] = [];

  for (let index = 0; index < descriptions.length; index += 1) {
    const description = (descriptions[index] ?? '').trim();
    if (description.length === 0) continue;

    const quantity = parseQuantityToParts(
      String(form.getAll('lineQuantity')[index] ?? ''),
      `Line ${String(index + 1)} quantity`,
    );
    lines.push({
      description,
      hsnSac: String(form.getAll('lineHsnSac')[index] ?? '').trim(),
      ...quantity,
      unitRate: parseRupeesToWire(
        String(form.getAll('lineUnitRate')[index] ?? ''),
        `Line ${String(index + 1)} rate`,
      ),
      gstRate: parsePercentToBasisPoints(
        String(form.getAll('lineGstPct')[index] ?? '0'),
        `Line ${String(index + 1)} GST rate`,
      ),
    });
  }

  return { lines };
}

/**
 * Ask the server what these lines come to, without saving anything.
 *
 * The endpoint that makes the rule visible on screen: the figure a person sees
 * before they commit is produced by the same code that will store it, so there
 * is no second answer to disagree with.
 */
export async function priceOrder(_previous: PricedState, form: FormData): Promise<PricedState> {
  const vendorId = text(form, 'vendorId');
  if (vendorId.length === 0) return { error: 'Choose a vendor.', ok: null, totals: null };

  let parsed: ParsedLines;
  try {
    parsed = readLines(form);
  } catch (error) {
    if (error instanceof MoneyInputError) return { error: error.message, ok: null, totals: null };
    throw error;
  }
  if (parsed.lines.length === 0) {
    return { error: 'Add at least one line.', ok: null, totals: null };
  }

  const result = await load(await apiAsCaller(), API_ROUTES.pricePurchaseOrder, {
    body: { vendorId, lines: parsed.lines },
  });
  if (result.kind !== 'ok') return { error: messageFor(result), ok: null, totals: null };

  return { error: null, ok: 'Priced by the server.', totals: result.data };
}

export async function createOrder(_previous: PricedState, form: FormData): Promise<PricedState> {
  const vendorId = text(form, 'vendorId');
  if (vendorId.length === 0) return { error: 'Choose a vendor.', ok: null, totals: null };

  let parsed: ParsedLines;
  try {
    parsed = readLines(form);
  } catch (error) {
    if (error instanceof MoneyInputError) return { error: error.message, ok: null, totals: null };
    throw error;
  }
  if (parsed.lines.length === 0) {
    return { error: 'Add at least one line.', ok: null, totals: null };
  }

  const number = optionalText(form, 'number');
  const projectId = optionalText(form, 'projectId');

  const result = await load(await apiAsCaller(), API_ROUTES.createPurchaseOrder, {
    body: {
      vendorId,
      lines: parsed.lines,
      // Omitted means the server allocates one by bumping a per-tenant counter
      // inside the same transaction that inserts the order. PO-24: the legacy's
      // `peekNextNumber` hands the same number to two people at once.
      ...(number === undefined ? {} : { number }),
      ...(projectId === undefined ? {} : { projectId }),
    },
  });
  if (result.kind !== 'ok') return { error: messageFor(result), ok: null, totals: null };

  revalidatePath('/purchase-orders');
  revalidatePath('/');
  return {
    error: null,
    ok: `${result.data.number} created as a draft.`,
    totals: {
      taxable: result.data.taxable,
      gst: result.data.gst,
      gross: result.data.gross,
    },
  };
}

export async function renameOrder(
  id: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const number = text(form, 'number');
  if (number.length === 0) return failed('Enter the new number.');

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.renamePurchaseOrder, {
    params: { id },
    body: { number, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/purchase-orders');
  return succeeded(`Renamed to ${result.data.number}.`);
}

/**
 * What recording an approval decision comes back with.
 *
 * Not `ActionState`: that type's `error` is a plain string, and rendering the
 * refusal through `<Refusal>` (S4-buying) needs the structured `ApiError` —
 * its `code`, so the disclosure can name it for a support conversation, and
 * its `message`, which is where the workflow engine's own refusal reason
 * actually lives (see below). `unreachable` is kept separate from `refusal`
 * rather than folded into it, because there is no `ApiError` to show for it.
 */
export interface ApprovalState {
  readonly ok: string | null;
  readonly refusal: ApiError | null;
  readonly unreachable: boolean;
}

export const APPROVAL_IDLE: ApprovalState = { ok: null, refusal: null, unreachable: false };

/**
 * Record one approval decision.
 *
 * The refusal reaches the screen with its own message rather than being
 * turned into a disabled button — a button hidden because the browser decided
 * a role is `POListTable.js:170`, and the route stays reachable behind it.
 *
 * **`reasonSentence` wired in, at the one call site that has the raw reason.**
 * `services/workflow/src/application/approve-in-transaction.ts` throws
 * `ApprovalRefused(outcome.reason)` with one of the six words `reasonSentence`
 * maps (`self-approval`, `not-entitled`, …), and
 * `services/host/src/api/approvals.ts` answers every one of them as
 * `code: 'FORBIDDEN'` with that raw word as `message`. `reasonSentence` reads
 * `error.code`, so on the wire today it never matches — its own doc comment
 * says nothing calls it yet. The raw word is sitting in `.message` instead, so
 * this rewrites `message` (never `code`, which is what gives `<Refusal>` its
 * "Refused" heading) to the sentence before handing the error to the screen.
 * A real reason carrier on the wire would make this redundant, not wrong.
 */
export async function approveOrder(
  id: string,
  _previous: ApprovalState,
  form: FormData,
): Promise<ApprovalState> {
  const remarks = optionalText(form, 'remarks');

  const result = await load(await apiAsCaller(), API_ROUTES.approvePurchaseOrder, {
    params: { id },
    body: remarks === undefined ? {} : { remarks },
  });

  if (result.kind === 'unreachable') return { ok: null, refusal: null, unreachable: true };
  if (result.kind === 'refused') {
    const sentence = reasonSentence(result.error.message);
    return {
      ok: null,
      unreachable: false,
      refusal: sentence === undefined ? result.error : { ...result.error, message: sentence },
    };
  }

  revalidatePath('/purchase-orders');
  revalidatePath('/approvals');
  return {
    ok: result.data.complete
      ? 'Approved. The chain is complete.'
      : `Recorded. The chain is now at ${result.data.stage}.`,
    refusal: null,
    unreachable: false,
  };
}
