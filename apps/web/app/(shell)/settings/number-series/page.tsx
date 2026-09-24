import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, PageHeader, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { NumberSeriesForm } from '../forms';

export const metadata = { title: 'Document numbering · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Numbering — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Numbering" sub="One gapless series per document — orders, bills, vouchers, invoices." />;

const LABELS: Record<string, string> = {
  purchase_order: 'Purchase orders',
  payment_voucher: 'Payment vouchers',
  tax_invoice: 'Tax invoices',
};

/**
 * How documents are named.
 *
 * **The counter is shown and is not editable.** The legacy version of this
 * screen (`SettingsNumberSeriesTab.js`) renders the current number as an input,
 * so an administrator can set it back and re-issue a number already printed on
 * an order that went to a vendor. Nothing behind that field stops them. Here
 * the counter moves in one direction, from the allocation that happens inside
 * the transaction which writes the order, and no route can reach it.
 */
export default async function NumberSeriesPage(): Promise<ReactNode> {
  const series = await load(await apiAsCaller(), API_ROUTES.numberSeries, {});

  if (series.kind === 'unreachable') return <UnreachableState />;
  if (series.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Numbering">
          <Refusal error={series.error} />
        </Section>
      </>
    );
  }

  return (
    <>
      {HEADER}
      {series.data.items.map((row) => (
        <Section bare key={row.moduleType} title={LABELS[row.moduleType] ?? row.moduleType}>
          <div className="card-b">
            <dl className="kv">
              <dt>Next number</dt>
              <dd>
                <code>{row.number}</code>{' '}
                <Pill tone={row.format.status === 'confirmed' ? 'ok' : 'warn'}>
                  {row.format.status === 'confirmed' ? 'Confirmed' : 'Provisional'}
                </Pill>
              </dd>
              <dt>Financial year</dt>
              <dd>
                {row.financialYear}
                {row.format.includeFy ? '' : ' — not shown in the number'}
              </dd>
            </dl>
            <NumberSeriesForm
              moduleType={row.moduleType}
              prefix={row.format.prefix}
              separator={row.format.separator}
              padding={row.format.padding}
              includeFy={row.format.includeFy}
              fyFormat={row.format.fyFormat}
              resetEachFy={row.format.resetEachFy}
              startingNumber={row.format.startingNumber}
            />
          </div>
        </Section>
      ))}

      <AbsentNotice title="There is no field for the current number">
        The counter only ever goes up, and it moves inside the transaction that writes the order —
        so two people raising an order at the same moment take it in turn and cannot be handed the
        same number. The previous system shows the next number in the form before you submit and
        does not reserve it, which is why two people who open that form together are both shown
        <code> PO-0042</code>. Changing the prefix or the padding here changes what FUTURE numbers
        look like; documents already issued keep the names they were given.
      </AbsentNotice>

      <AbsentNotice title="Payment vouchers and tax invoices have no gaps, and a limit">
        Their numbers are taken in the transaction that saves the document, so a document that
        fails to save gives its number back. A number is at most sixteen characters of letters,
        digits, hyphen and slash — our reading of the invoice rules, provisional until a chartered
        accountant confirms it. Change-order and vendor references are typed in by the person
        creating them, so they are not listed here.
      </AbsentNotice>
    </>
  );
}
