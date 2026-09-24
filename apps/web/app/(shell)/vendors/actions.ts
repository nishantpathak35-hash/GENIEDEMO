'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES, VENDOR_CONSTITUTIONS } from '@cog/contracts';
import { MoneyInputError, parseWholeNumber } from '@cog/money';
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
 * Vendor writes.
 *
 * **No bank field appears here, in either direction.** `vendors.js:42` does
 * `SELECT *` and returns the account number and IFSC to any authenticated
 * caller (VEND-02); the replacement keeps them in
 * `procurement.vendor_bank_accounts`, a table no vendor read touches, and there
 * is no endpoint on this path that would carry them.
 *
 * GSTIN and PAN are validated by shape in the contract, so a malformed one is
 * named at the field rather than stored and discovered on a return.
 */

function optionalUpper(form: FormData, name: string): string | undefined {
  const value = optionalText(form, name);
  return value === undefined ? undefined : value.toUpperCase();
}

export async function createVendor(_previous: ActionState, form: FormData): Promise<ActionState> {
  const name = text(form, 'name');
  const code = text(form, 'code');
  if (name.length === 0 || code.length === 0) return failed('Name and code are both required.');

  const gstin = optionalUpper(form, 'gstin');
  const pan = optionalUpper(form, 'pan');

  const result = await load(await apiAsCaller(), API_ROUTES.createVendor, {
    body: {
      name,
      code,
      ...(gstin === undefined ? {} : { gstin }),
      ...(pan === undefined ? {} : { pan }),
      ...(optionalText(form, 'email') === undefined ? {} : { email: text(form, 'email') }),
      ...(optionalText(form, 'phone') === undefined ? {} : { phone: text(form, 'phone') }),
      ...(optionalText(form, 'address') === undefined ? {} : { address: text(form, 'address') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/vendors');
  return succeeded(`${result.data.code} registered.`);
}

export async function updateVendor(
  vendorId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = text(form, 'name');
  const code = text(form, 'code');
  const status = text(form, 'status');
  if (status !== 'active' && status !== 'inactive') return failed('Status must be set.');

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }
  const gstin = optionalUpper(form, 'gstin');
  const pan = optionalUpper(form, 'pan');

  const result = await load(await apiAsCaller(), API_ROUTES.updateVendor, {
    params: { vendorId },
    body: {
      name,
      code,
      status,
      expectedVersion,
      ...(gstin === undefined ? {} : { gstin }),
      ...(pan === undefined ? {} : { pan }),
      ...(optionalText(form, 'email') === undefined ? {} : { email: text(form, 'email') }),
      ...(optionalText(form, 'phone') === undefined ? {} : { phone: text(form, 'phone') }),
      ...(optionalText(form, 'address') === undefined ? {} : { address: text(form, 'address') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/vendors');
  return succeeded('Saved.');
}

/**
 * Remove a vendor.
 *
 * Refused while a purchase order references it — `0033`'s foreign key is
 * `ON DELETE RESTRICT` — and the refusal says to deactivate instead. That
 * message reaches the screen unchanged, because it is the part a person can
 * act on.
 */
export async function deleteVendor(
  vendorId: string,
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const result = await load(await apiAsCaller(), API_ROUTES.deleteVendor, {
    params: { vendorId },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/vendors');
  return succeeded('Removed.');
}

const TDS_SECTIONS = ['194C', '194I', '194J', '194Q'] as const;
const TDS_PAYEE_CLASSES = ['plant_machinery', 'land_building', 'technical', 'professional'] as const;

/**
 * What a payment to this vendor is deducted under. Which sections take a kind,
 * and where a transporter declaration applies, is the server's rule, said back
 * in words when the form does not meet it.
 */
export async function setVendorTdsProfile(
  vendorId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const section = text(form, 'tdsSection');
  const kind = text(form, 'tdsPayeeClass');
  const tdsSection = TDS_SECTIONS.find((s) => s === section) ?? null;
  const tdsPayeeClass = TDS_PAYEE_CLASSES.find((k) => k === kind) ?? null;

  const result = await load(await apiAsCaller(), API_ROUTES.setVendorTdsProfile, {
    params: { vendorId },
    body: {
      tdsSection,
      tdsPayeeClass,
      panInoperative: text(form, 'panStatus') === 'inoperative',
      constitution: VENDOR_CONSTITUTIONS.find((k) => k === text(form, 'constitution')) ?? null,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath('/money/bills');
  return succeeded(
    tdsSection === null
      ? 'Saved. Nothing is deducted from payments to this vendor.'
      : `Saved. Payments to this vendor are deducted under ${tdsSection}, at the provisional rate.`,
  );
}

/**
 * A transporter's 194C(6) declaration. The evidence has to be a document the
 * vault holds against this vendor, and the date has to fall in the year — the
 * server's rules, said back in words.
 */
export async function recordTransporterDeclaration(
  vendorId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (form.get('goodsCarriageConfirmed') !== 'on') {
    return failed('The declaration has to confirm the goods-carriage condition of s.194C(6).');
  }
  const result = await load(await apiAsCaller(), API_ROUTES.recordTransporterDeclaration, {
    params: { vendorId },
    body: {
      financialYear: text(form, 'financialYear'),
      declaredOn: text(form, 'declaredOn'),
      goodsCarriageConfirmed: true,
      evidenceDocumentId: text(form, 'evidenceDocumentId'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath('/money/bills');
  return succeeded(`Recorded the ${result.data.financialYear} declaration.`);
}
