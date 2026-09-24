'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire } from '@cog/money';
import { apiAsCaller } from '../../../../lib/api';
import {
  failed,
  load,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';

/**
 * Recording a rate contract.
 *
 * **The rate is typed in RUPEES and converted here by `packages/money`.** Not
 * because a form is special, but because the alternative is `value * 100` in a
 * browser — a float, and a lint violation. `parseRupeesToWire` throws on
 * anything it cannot represent exactly rather than coercing to zero, and a
 * contracted rate that silently became ₹0 would make every purchase order look
 * like a deviation.
 *
 * One rate per submission. The legacy's form takes an array of items and
 * defaults every field of each — GST 18, minimum quantity 1, lead time 3 days —
 * so a hurried save records five numbers nobody chose. Adding rates one at a
 * time is slower and says what it recorded.
 */
export async function createRateContract(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const vendorId = text(form, 'vendorId');
  const number = text(form, 'number');
  const title = text(form, 'title');
  const tradeCode = text(form, 'tradeCode');
  const description = text(form, 'description');
  const uom = text(form, 'uom');
  const validFrom = text(form, 'validFrom');
  const validTo = text(form, 'validTo');

  if (vendorId.length === 0) return failed('Choose the vendor this contract is with.');
  if (number.length === 0 || title.length === 0) {
    return failed('A contract needs a number and a title.');
  }
  if (tradeCode.length === 0 || validFrom.length === 0 || validTo.length === 0) {
    return failed('A contracted rate needs a trade, and the dates it is valid between.');
  }

  let contractRate: string;
  try {
    contractRate = parseRupeesToWire(text(form, 'contractRate'), 'contracted rate');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createRateContract, {
    body: {
      vendorId,
      number,
      title,
      status: form.get('status') === 'active' ? 'active' : 'draft',
      paymentTerms: optionalText(form, 'paymentTerms') ?? null,
      items: [
        {
          // Uppercased on the server too — this is a convenience, not the
          // control. `elec` never matching `ELEC` is how a check silently finds
          // nothing and looks like a feature nobody uses.
          tradeCode: tradeCode.toUpperCase(),
          description,
          uom,
          contractRate,
          validFrom,
          validTo,
        },
      ],
    },
  });

  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/vendors/rate-contracts');
  return succeeded(
    `Recorded ${result.data.number} for ${result.data.vendorName}. Every purchase-order line ` +
      `naming ${tradeCode.toUpperCase()} for this vendor is now measured against it.`,
  );
}
