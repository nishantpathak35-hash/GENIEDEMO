import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { NewTradePackageForm, TradePackageForm } from '../forms';

export const metadata = { title: 'Trades · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Trade packages — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Trade packages" sub="The trades the BOQ, rates and vendors are grouped by." />;

/**
 * The trades this organisation works in.
 *
 * **It starts empty and nothing fills it in.** The legacy seeds ten packages
 * with a default margin each — 18% for civil, 22% for flooring, 25% for
 * joinery — and a named preferred vendor beside every one. A margin is a
 * commercial position, not a fact about masonry, and one seeded here would end
 * up inside the rate of every item estimated under that trade without anybody
 * having agreed to it.
 */
export default async function TradePackagesPage(): Promise<ReactNode> {
  const trades = await load(await apiAsCaller(), API_ROUTES.tradePackages, {});

  if (trades.kind === 'unreachable') return <UnreachableState />;
  if (trades.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Trade packages">
          <Refusal error={trades.error} />
        </Section>
      </>
    );
  }

  return (
    <>
      {HEADER}
      <Section bare title={`Trades — ${trades.data.items.filter((t) => t.isActive).length} in use`}>
        <div className="card-b">
          {trades.data.items.length === 0 ? (
            <Empty illustration="projects" title="No trades yet">
              Until there is at least one, the trade on an estimating line and the
              section on a BOQ stay free text — which is how one organisation ends up with
              &ldquo;Electrical&rdquo;, &ldquo;Electricals&rdquo; and &ldquo;ELECTRICAL &amp;
              LIGHTING&rdquo; as three different groupings of the same work.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Trade · State · Usual margin · Code · (edit) — identity
                    never drops; in-use/retired is the decision column;
                    margin, code and the edit form are reference and drop
                    first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Trade</th>
                      <th data-p="2">State</th>
                      <th data-p="3">Usual margin</th>
                      <th data-p="4">Code</th>
                      <th data-p="4" aria-label="Edit" />
                    </tr>
                  </thead>
                  <tbody>
                    {trades.data.items.map((trade) => (
                      <tr key={trade.id}>
                        <td data-p="1">
                          {trade.name}
                          {trade.description === '' ? null : (
                            <span className="sub">{trade.description}</span>
                          )}
                        </td>
                        <td data-p="2">
                          <Pill tone={trade.isActive ? 'ok' : 'idle'}>
                            {trade.isActive ? 'In use' : 'Retired'}
                          </Pill>
                        </td>
                        <td data-p="3" data-label="Usual margin">
                          {trade.defaultMarginBp === null ? (
                            <span className="muted">Not said</span>
                          ) : (
                            formatBasisPoints(trade.defaultMarginBp)
                          )}
                        </td>
                        <td data-p="4" data-label="Code">
                          <code>{trade.code}</code>
                        </td>
                        <td data-p="4">
                          <TradePackageForm
                            tradePackageId={trade.id}
                            code={trade.code}
                            name={trade.name}
                            description={trade.description}
                            defaultMarginBp={trade.defaultMarginBp}
                            sortOrder={trade.sortOrder}
                            isActive={trade.isActive}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: trades.data.items.length }}
                of={trades.data.items.length}
                unit={trades.data.items.length === 1 ? 'trade' : 'trades'}
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Add a trade">
        <div className="card-b">
          <NewTradePackageForm />
        </div>
      </Section>

      <AbsentNotice title="No preferred vendor, and no rate-contract number">
        The previous system stores a preferred vendor per trade as the vendor&rsquo;s{' '}
        <strong>name</strong>, in a text column. Keying a supplier by its name is the defect this
        rebuild exists to remove — &ldquo;M/s A&amp;B Interiors&rdquo; and &ldquo;A &amp; B
        Interiors&rdquo; are one company and two rows. Which vendor a trade usually goes to belongs
        with rate contracts on the procurement side, against a vendor id, and there are no rate
        contracts here yet.
      </AbsentNotice>

      <AbsentNotice title="Retiring, not deleting">
        A trade that is retired disappears from the pickers and stays on every line already costed
        under it. There is no delete: an estimate that says what it was priced as is worth more
        than a tidy list.
      </AbsentNotice>
    </>
  );
}
