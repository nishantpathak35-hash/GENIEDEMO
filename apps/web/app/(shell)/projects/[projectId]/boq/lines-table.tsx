'use client';

import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatQuantity } from '@cog/money';
import { BulkBar, Drawer, Money, MoneyExact, useRowSelection } from '@cog/design-system';
import { DeleteLineButton } from './delete';
import { RaiseOrderFromBoq, type BoqRow } from './forms';

/**
 * The Lines table — `docs/design/06-projects.html`, "Project › Build › BOQ —
 * three lines selected": spreadsheet-like, one group row per trade, the
 * check column, the client value in the foot, and the bulk bar above it
 * when lines are selected. A client island because `useRowSelection` and the
 * drawer's open state are.
 *
 * Selecting rows and opening the drawer reuses `RaiseOrderFromBoq` from
 * `forms.tsx` unchanged — filtered to the selected ids — which prices from
 * the stored cost rates on the server and refuses a line with none (BOQ-06).
 *
 * **The bulk bar shows a count, never a sum.** No endpoint returns the total
 * of an arbitrary set of lines, and summing `amount` client-side is exactly
 * the BOQ-01 pattern this port exists to remove — `HUMAN(DATA-boq-selection-sum)`.
 * **"from takeoff TS-02 …" does not render.** `boqItem` carries no takeoff
 * reference — `HUMAN(DATA-boq-takeoff-ref)`.
 */
export function LinesTable({
  projectId,
  rows,
  vendors,
  clientValue,
}: {
  projectId: string;
  rows: readonly BoqRow[];
  vendors: ReadonlyArray<readonly [string, string]>;
  /** The server's total of every line, for the foot. */
  clientValue: string;
}): ReactNode {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ids = rows.map((r) => r.id);
  const selection = useRowSelection(ids, (id) => router.push(`/projects/${projectId}/boq/${id}`));
  const selectedRows = rows.filter((r) => selection.selected.has(r.id));

  let lastSection: string | null = null;

  return (
    <>
      <BulkBar count={selection.selected.size} onClear={selection.clear} clearLabel="Clear selection">
        <button type="button" className="btn sm primary" onClick={() => setDrawerOpen(true)}>
          Raise an order
        </button>
      </BulkBar>
      <div className="tbl-wrap">
        <table className="tbl" aria-label="BOQ lines">
          <thead>
            <tr>
              <th className="check">
                <span className="sr-only">Select</span>
              </th>
              <th className="num p3">#</th>
              <th className="p1">Item</th>
              <th className="num p2">Quantity</th>
              <th className="num p2">Client rate</th>
              <th className="num p3">Cost rate</th>
              <th className="num p1">Amount</th>
              <th className="p3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const groupHeader =
                row.section !== lastSection ? (
                  <tr className="group" key={`group-${row.section}-${row.id}`}>
                    <td colSpan={8}>{row.section}</td>
                  </tr>
                ) : null;
              lastSection = row.section;
              const picked = selection.selected.has(row.id);
              return (
                <Fragment key={row.id}>
                  {groupHeader}
                  <tr
                    className="row-link"
                    {...(picked ? { 'aria-selected': true } : {})}
                    onClick={() => router.push(`/projects/${projectId}/boq/${row.id}`)}
                    {...selection.rowProps(row.id)}
                  >
                    <td className="check" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${row.section} ${String(row.itemNo)}`} checked={picked} onChange={() => selection.toggle(row.id)} />
                    </td>
                    <td className="num p3">{row.itemNo}</td>
                    <td className="p1">
                      {row.description}
                      <span className="sub alt">
                        {formatQuantity(row.quantityMicros)} {row.uom} · <Money wire={row.rate} />
                      </span>
                    </td>
                    <td className="num p2">
                      {formatQuantity(row.quantityMicros)} {row.uom}
                    </td>
                    <td className="num p2">
                      <Money wire={row.rate} />
                    </td>
                    <td className="num p3">
                      {row.costRate === null ? (
                        <span className="muted" title="No cost rate yet — add one to see margin">
                          —
                        </span>
                      ) : (
                        <Money wire={row.costRate} />
                      )}
                    </td>
                    <td className="num p1">
                      <Money wire={row.amount} />
                    </td>
                    <td className="p3" onClick={(event) => event.stopPropagation()}>
                      <Link href={`/projects/${projectId}/boq/${row.id}`}>Edit</Link> <DeleteLineButton projectId={projectId} itemId={row.id} />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Client value, calculated for you</td>
              <td className="num">
                <MoneyExact wire={clientValue} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <Drawer title={`Raise an order from ${String(selectedRows.length)} ${selectedRows.length === 1 ? 'line' : 'lines'}`} sub="step 2 of 3" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {vendors.length === 0 ? (
          <p className="muted">No active vendor is registered, so no order can be raised. Register one first.</p>
        ) : (
          <>
            <p className="ps">
              {selectedRows.length === 1 ? `Line ${selectedRows[0]?.section ?? ''} ${String(selectedRows[0]?.itemNo ?? '')}` : `Lines ${selectedRows.map((r) => `${r.section} ${String(r.itemNo)}`).join(', ')}`} — at the BOQ’s cost
              rates, never the client rate. You can change the rates on the order afterwards; they are checked against the vendor’s agreed rates there.
            </p>
            <RaiseOrderFromBoq projectId={projectId} rows={selectedRows} vendors={vendors} />
          </>
        )}
      </Drawer>
    </>
  );
}
