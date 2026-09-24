import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { terms } from '../../../../../lib/terms';
import { load } from '@cog/design-system';
import { Absent, Empty, Icon, MoneyExact, Section, Refusal, StatRow, Stat, UnreachableState } from '@cog/design-system';
import Link from 'next/link';
import { AddBoqLineForm } from './forms';
import { LinesTable } from './lines-table';
import { ProjectHead } from '../header';

export const dynamic = 'force-dynamic';

/**
 * The bill of quantities — Build's first tab, and the design's centrepiece.
 *
 * **Every total on this page came from the server.** `BoqView.js` computes
 * eight of them in the browser — `activeScheduleTotalBilling`,
 * `activeScheduleTotalCost`, `activeScheduleTotalProfit`,
 * `activeScheduleMarginPct`, `pendingItemsTotalCost`, `selectedItemsTotalCost`
 * and two counts (`:216-249`) — and renders a ninth per row as
 * `(item.qty * item.rate).toLocaleString('en-IN')` (`:768`). None of that is
 * reproduced: the endpoint returns `lineCount`, `value`, `cost` and `margin`.
 *
 * **Cost and margin are `null`, not zero, when any line has no cost rate.**
 * The uncosted lines named in the Cost stat's note are read straight off
 * `items` (`costRate === null`) — `boqResponse` has no separate list of them,
 * unlike `takeoffSummary`'s `uncostedItems`, so this is the one place that
 * name is built rather than read. `boqItem` has no compound "section.itemNo"
 * label the way the design's sample spells "2.2 and 3.1" — items carry a
 * `section` string and a flat `itemNo` integer, so the note names both.
 *
 * **The selection's bulk bar shows a count, never a sum.** No endpoint
 * returns the total of an arbitrary set of lines, and summing `amount`
 * client-side is exactly the BOQ-01 pattern this port exists to remove —
 * `HUMAN(DATA-boq-selection-sum)`.
 */
export default async function BoqPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const adding = (await searchParams)['new'] === '1';
  const client = await apiAsCaller();
  const t = await terms();

  const [boq, vendors] = await Promise.all([
    load(client, API_ROUTES.projectBoq, { params: { projectId } }),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.listVendors, { query: { limit: '200' } }),
  ]);

  if (boq.kind === 'unreachable') return <UnreachableState />;
  if (boq.kind === 'refused') return <Refusal error={boq.error} />;

  const { items, totals } = boq.data;
  const vendorOptions =
    vendors.kind === 'ok'
      ? vendors.data.items
          .filter((v) => v.status === 'active')
          .map((v) => [v.id, `${v.code} — ${v.name}`] as const)
      : [];

  const tradeCount = new Set(items.map((i) => i.section)).size;
  const uncosted = items.filter((i) => i.costRate === null);
  const uncostedLabels = uncosted.map((i) => `${i.section} ${i.itemNo}`);

  return (
    <>
      <ProjectHead
        projectId={projectId}
        section="Build"
        title={t.boq}
        help="Price the job line by line, and see the margin the moment every line carries a cost rate."
        actions={
          <a className="btn" href={`/export/boq?projectId=${projectId}`}>
            <Icon name="download" />
            Export
          </a>
        }
        primary={
          <Link className="btn primary" href={`/projects/${projectId}/boq?new=1#add-line`}>
            <Icon name="plus" />
            Add a line
          </Link>
        }
      />
      <StatRow n={3}>
        <Stat
          label="Client value"
          value={<MoneyExact wire={totals.value} />}
          delta={{ direction: 'flat', figure: `${totals.lineCount} lines`, period: `· ${tradeCount} trades` }}
        />
        <Stat
          label="Cost"
          value={
            totals.cost === null ? (
              <Absent why="At least one line has no cost rate yet." />
            ) : (
              <MoneyExact wire={totals.cost} />
            )
          }
          {...(totals.cost === null
            ? {
                delta: {
                  direction: 'flat' as const,
                  figure: `add cost rates on ${joinWithAnd(uncostedLabels)}`,
                  period: 'to see this',
                },
              }
            : {})}
        />
        <Stat
          label="Margin"
          value={
            totals.margin === null ? (
              <Absent why="Needs a cost total first." />
            ) : (
              <MoneyExact wire={totals.margin} />
            )
          }
          {...(totals.margin === null
            ? { delta: { direction: 'flat' as const, figure: 'appears with the cost', period: '' } }
            : {})}
        />
      </StatRow>

      <div data-hero>
        <Section title="Lines" sub={`${String(totals.lineCount)} lines · ${String(tradeCount)} trades`} bare>
          {items.length === 0 ? (
            <Empty
              illustration="boq"
              title="No lines yet"
              action={
                <Link className="btn primary" href={`/projects/${projectId}/boq?new=1#add-line`}>
                  <Icon name="plus" />
                  Add a line
                </Link>
              }
            >
              Add the first line, or copy the proposal’s {t.boqLower === 'boq' ? t.boq : t.boqLower} across from the lead it came from.
            </Empty>
          ) : (
            <LinesTable projectId={projectId} rows={items} vendors={vendorOptions} clientValue={totals.value} />
          )}
        </Section>
      </div>

      {adding ? (
        <Section bare title="Add a line">
          <div className="card-b" id="add-line">
            <AddBoqLineForm projectId={projectId} />
          </div>
        </Section>
      ) : null}
    </>
  );
}

function joinWithAnd(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]!}`;
}
