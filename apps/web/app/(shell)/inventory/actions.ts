'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseQuantityToParts, parseWholeNumber } from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';
import {
  failed,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';

/**
 * Stock movements.
 *
 * Stock is the **sum of an append-only ledger**, so every one of these writes a
 * movement rather than setting a number. INV-01 is why: `createTransfer` in the
 * legacy inserts a transfer row and never touches `inventory_items`, and it is
 * the only inventory write any screen calls — so no transfer has ever changed a
 * stock figure. A transfer here is two movements sharing an id that must sum to
 * zero, in one transaction.
 *
 * **No value is entered anywhere on this path.** The legacy's `unit_price` is
 * the last price paid, overwritten by each receipt and multiplied by the whole
 * quantity on hand (`InventoryView.js:79`, `:161`). Which costing method
 * applies is a commercial decision nobody has made — INV-03.
 */

export async function createStockItem(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = text(form, 'name');
  const uom = text(form, 'uom');
  if (name.length === 0 || uom.length === 0) return failed('A name and a unit are required.');

  let reorderWhole: number | undefined;
  try {
    const typed = optionalText(form, 'reorderWhole');
    reorderWhole = typed === undefined ? undefined : parseWholeNumber(typed, 'Reorder level');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createStockItem, {
    body: {
      name,
      uom,
      ...(optionalText(form, 'category') === undefined
        ? {}
        : { category: text(form, 'category') }),
      ...(reorderWhole === undefined ? {} : { reorderWhole }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/inventory');
  return succeeded('Item defined.');
}

async function movement(
  route: typeof API_ROUTES.receiveStock | typeof API_ROUTES.issueStock,
  form: FormData,
  done: string,
): Promise<ActionState> {
  const stockItemId = text(form, 'stockItemId');
  const warehouse = text(form, 'warehouse');
  if (stockItemId.length === 0 || warehouse.length === 0) {
    return failed('An item and a warehouse are both required.');
  }

  let quantity: { quantityWhole: number; quantityMillionths: number };
  try {
    quantity = parseQuantityToParts(text(form, 'quantity'));
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), route, {
    body: {
      stockItemId,
      warehouse,
      ...quantity,
      ...(optionalText(form, 'reference') === undefined
        ? {}
        : { reference: text(form, 'reference') }),
      // Only the receipt form asks; an issue sends nothing and the server
      // ignores the field on an issue regardless.
      ...(form.get('checkedIn') === null ? {} : { checkedIn: text(form, 'checkedIn') !== 'no' }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/inventory');
  return succeeded(done);
}

export async function receiveStock(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return movement(API_ROUTES.receiveStock, form, 'Receipt recorded.');
}

/** Count a gate receipt into its store. The server refuses one that is not waiting. */
export async function checkInReceipt(movementId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.checkInReceipt, { params: { movementId } });
  revalidatePath('/inventory');
}

export async function issueStock(_previous: ActionState, form: FormData): Promise<ActionState> {
  // Refused if it would take the balance below zero — the ledger is the
  // balance, so there is no stored figure to go negative behind its back.
  return movement(API_ROUTES.issueStock, form, 'Issue recorded.');
}

export async function transferStock(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const stockItemId = text(form, 'stockItemId');
  const fromWarehouse = text(form, 'fromWarehouse');
  const toWarehouse = text(form, 'toWarehouse');
  if (stockItemId.length === 0 || fromWarehouse.length === 0 || toWarehouse.length === 0) {
    return failed('An item and both warehouses are required.');
  }

  let quantity: { quantityWhole: number; quantityMillionths: number };
  try {
    quantity = parseQuantityToParts(text(form, 'quantity'));
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.transferStock, {
    body: {
      stockItemId,
      fromWarehouse,
      toWarehouse,
      ...quantity,
      ...(optionalText(form, 'reference') === undefined
        ? {}
        : { reference: text(form, 'reference') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/inventory');
  return succeeded('Transferred. Two movements, summing to zero.');
}
