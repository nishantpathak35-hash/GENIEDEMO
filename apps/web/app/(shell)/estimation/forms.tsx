'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField } from '@cog/design-system';
import { formatBasisPoints } from '@cog/money';
import { createEstimationItem, deleteEstimationItem } from './actions';

/**
 * A new estimating line.
 *
 * **The trade is a picker when the organisation has a trade list and a text
 * box when it does not.** `estimation_items.trade` is free text and stays
 * free text — a migration to a foreign key would have to guess which trade
 * every existing row meant — so the list constrains what gets typed next
 * without rewriting what was typed before. A tenant with no trades keeps
 * exactly the screen they had.
 *
 * The usual margin is shown beside the trade rather than filled into the
 * margin field. Silently replacing a number somebody is about to read is how a
 * default becomes a figure nobody chose.
 */
export function NewEstimationForm({
  trades,
}: {
  trades: readonly { name: string; marginBp: number | null }[];
}): ReactNode {
  return (
    <Form action={createEstimationItem} submitLabel="Analyse rate" pendingLabel="Analysing…">
      <div className="row">
        <Field name="itemName" label="Line item" required />
        {trades.length === 0 ? (
          <Field
            name="trade"
            label="Trade"
            hint="Free text until somebody sets up a trade list in Settings → Trades."
          />
        ) : (
          <Choice
            name="trade"
            label="Trade"
            options={trades.map((t) => [
              t.name,
              t.marginBp === null
                ? t.name
                : `${t.name} (usually ${formatBasisPoints(t.marginBp)})`,
            ])}
          />
        )}
        <Field name="uom" label="Unit" required placeholder="sqm" />
        <Field name="benchmark" label="Benchmark reference" />
      </div>
      <div className="row">
        <MoneyField name="materialCost" label="Material (A)" required />
        <MoneyField name="labourCost" label="Labour (B)" required />
        <MoneyField name="equipmentCost" label="Tools and transport (C)" required />
        <Field name="overheadPct" label="Site overhead (%)" required defaultValue="6" />
        <Field name="marginPct" label="Target margin (%)" required defaultValue="15" />
      </div>
      <p className="hint u-m0">
        There is no GST field. Whether a BOQ rate carries GST is <strong>PO-16</strong> and
        unanswered; a default of 18% here would answer it by accident. The defaults shown are
        placeholders, not agreed values — the commercial defaults are PO-15.
      </p>
    </Form>
  );
}

export function DeleteEstimationButton({ itemId }: { itemId: string }): ReactNode {
  return (
    <form action={deleteEstimationItem.bind(null, itemId)} className="inline">
      <button type="submit" className="btn danger sm">
        Delete
      </button>
    </form>
  );
}
