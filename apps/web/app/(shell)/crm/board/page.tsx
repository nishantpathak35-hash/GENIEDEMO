import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { Empty, KebabMenu, Money, MoneyExact, PageHeader, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { exportHref } from '../../../../lib/export';
import { NewLeadDrawer } from '../new-lead-drawer';
import { leadStageLabel } from '../stage';

export const metadata = { title: 'Pipeline · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/** Stages a lead is still alive in. A board of closed leads is a report. */
const OPEN_STAGES = ['lead', 'qualified', 'proposal_shared', 'negotiation'] as const;
const VALUE = 'See where every open lead sits and what each stage is worth, before the weekly sales review.';

/**
 * Sales › Pipeline — `docs/design/05-sales.html`, "the board, a stage total
 * per column".
 *
 * One column per open stage, with the stage's total at its head — the
 * server's (`totals.byStage`), never summed here — and a card per lead:
 * client, scope, value, owner and the next step. The board does not drag:
 * a stage change is an edit under an optimistic lock, made on the lead.
 *
 * The board reads a bounded window (`limit: '200'`, the widest `/leads`
 * allows) and groups the cards it has by stage; a column whose server count
 * exceeds what arrived says "and N more" rather than dropping them.
 */
export default async function LeadBoardPage(): Promise<ReactNode> {
  const client = await apiAsCaller();
  const [pipeline, people] = await Promise.all([
    load(client, API_ROUTES.listLeads, { query: { limit: '200', sort: 'value:desc' } }),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.people, { query: { limit: '200' } }),
  ]);

  if (pipeline.kind === 'unreachable') return <UnreachableState />;

  const totals = pipeline.kind === 'ok' ? pipeline.data.totals : null;
  const header = (
    <PageHeader
      crumbs={[{ href: '/crm/board', label: 'Sales' }]}
      title="Pipeline"
      help={VALUE}
      sub={
        totals === null ? undefined : (
          <>
            <Money wire={totals.total} /> in the pipeline · {totals.openCount} open · {totals.wonThisQuarter.count} won this quarter
          </>
        )
      }
      more={<KebabMenu sortHrefs={[]} exportHref={exportHref('leads', {}, [])} refreshHref="/crm/board" />}
      primary={<NewLeadDrawer />}
    />
  );

  if (pipeline.kind === 'refused') {
    return (
      <>
        {header}
        <Section title="Pipeline">
          <Refusal error={pipeline.error} />
        </Section>
      </>
    );
  }

  const { items } = pipeline.data;
  const byStage = new Map(pipeline.data.totals.byStage.map((s) => [s.stage, s]));
  const nameOf = new Map(people.kind === 'ok' ? people.data.items.map((p) => [p.id, p.displayName ?? p.email]) : []);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {header}
      <div data-hero>
        <section className="card">
          <div className="card-b board">
            {items.length === 0 ? (
              <Empty illustration="leads" title="No leads yet" action={<NewLeadDrawer />}>
                Record the first opportunity, and the pipeline starts here.
              </Empty>
            ) : (
              <div className="kanban">
                {OPEN_STAGES.map((stage) => {
                  const column = items.filter((lead) => lead.stage === stage);
                  const stageTotals = byStage.get(stage);
                  // how many of this stage's leads did not arrive in the bounded read
                  const shown = column.length;
                  const known = stageTotals === undefined ? shown : stageTotals.count;
                  const hidden = known - shown;
                  return (
                    <div key={stage} className="kcol">
                      <div className="kh">
                        <span>{leadStageLabel(stage)}</span>
                        <span className="num">{stageTotals === undefined || stageTotals.count === 0 ? '—' : <MoneyExact wire={stageTotals.value} />}</span>
                      </div>
                      {column.length === 0 ? (
                        <p className="muted kempty">Nothing here yet</p>
                      ) : (
                        column.map((lead) => {
                          const owner = lead.ownerId === null ? null : (nameOf.get(lead.ownerId) ?? null);
                          const scope = [lead.projectType, lead.city].filter((s) => s !== '').join(' · ');
                          const overdue = lead.nextFollowupOn !== null && lead.nextFollowupOn < today;
                          return (
                            <Link key={lead.id} href={`/crm/${lead.id}`} className="kcard">
                              <b>{lead.clientName}</b>
                              {scope === '' ? null : <small>{scope}</small>}
                              <span className="num">
                                <MoneyExact wire={lead.estimatedValue} />
                              </span>
                              <span className="who">
                                {owner === null ? null : (
                                  <span className="avatar" aria-hidden="true">
                                    {owner.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                {owner ?? 'No owner'} · {lead.nextFollowupOn === null ? 'no next step' : overdue ? `overdue ${lead.nextFollowupOn}` : `next ${lead.nextFollowupOn}`}
                              </span>
                            </Link>
                          );
                        })
                      )}
                      {hidden > 0 ? <p className="muted kempty">and {hidden} more</p> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
