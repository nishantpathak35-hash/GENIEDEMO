import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatQuantity } from '@cog/money';
import { apiAsCaller } from '../../../../../lib/api';
import { SITE_CONDITIONS, labelOf, load, type Options } from '@cog/design-system';
import { AbsentNotice, Empty, Pager, Section, Pill, Refusal, UnreachableState } from '@cog/design-system';
import type { PillTone } from '@cog/design-system';
import { NewRecceForm } from './forms';
import { pageLinks, pageState } from '../../../../../lib/paging';
import { ProjectHead } from '../header';

export const dynamic = 'force-dynamic';

const RECCE_STATUS: Options = [
  ['draft', 'Draft'],
  ['complete', 'Complete'],
];

function recceTone(status: string): PillTone {
  return status === 'complete' ? 'ok' : 'idle';
}

/**
 * Site · Recce.
 *
 * `docs/design/08-site.html` draws one survey as a two-column hero — a
 * `dl.kv` of what the site actually is, next to a checklist of what has been
 * done before pricing it. The left column is real: every field it names
 * (`recceOn`, `siteCondition`, the three areas, floor, handover, client
 * presence) is on `recce` and rendered from the most recent survey. The right
 * column is the survey history instead of the design's checklist — `recce`
 * has no checklist field (no "drawings received" / "photos taken" / "client
 * walkthrough" steps, typed or otherwise) and no link to a lead (only
 * `projectId`), so a recce here cannot be "reachable from Sales too" the way
 * the design describes it; ticking boxes that do not exist in the schema
 * would be fabricating a workflow, not reporting one.
 *
 * **No efficiency ratio is shown.** The legacy computes carpet ÷ built-up three
 * times, at `.toFixed(0)` on the list card and `.toFixed(1)` in the form and
 * the report, so one survey reads 78% in one place and 78.3% in another. A
 * ratio is a division; if it belongs anywhere it belongs on the server with one
 * definition, and nobody has asked for it. The two areas are shown exactly and
 * a reader can see them side by side.
 *
 * **Photographs are not part of this port.** The legacy embeds each one as a
 * base64 data URL in the survey record (`SiteRecceView.js:261`), so a survey
 * with twelve site photographs is a multi-megabyte row. Site photographs belong
 * in the vault, by reference.
 */
export default async function ReccePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const sp = await searchParams;
  const paging = pageState(sp);
  const recces = await load(await apiAsCaller(), API_ROUTES.listRecces, {
    params: { projectId },
    query: paging.query,
  });

  if (recces.kind === 'unreachable') return <UnreachableState />;
  if (recces.kind === 'refused') return <Refusal error={recces.error} />;

  // `recce_on DESC, id` is the server's order, so this is already newest
  // first within the window — no client sort left to do.
  const items = recces.data.items;
  // The hero is "the latest survey", which is only this window's first row
  // when the window starts at the top of the list — on a later page it would
  // show a survey that is not actually the newest, next to a "Past surveys"
  // list that IS this later window. Shown only on the first page so the two
  // stay about the same set of rows.
  const latest = paging.query['cursor'] === undefined ? items[0] : undefined;

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...sp, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? `/projects/${projectId}/recce` : `/projects/${projectId}/recce?${qs}`;
  }
  const links = pageLinks(paging, recces.data, hrefFor);

  return (
    <>
      <ProjectHead projectId={projectId} section="Build" title="Recce" />
      {latest === undefined ? null : (
        <div className="recce">
          <Section bare
            title={`Survey — ${latest.recceOn}`}
            {...(latest.siteCondition === '' ? {} : { sub: labelOf(SITE_CONDITIONS, latest.siteCondition) })}
          >
            <div className="card-b">
              <dl className="kv">
                <dt>Survey date</dt>
                <dd>{latest.recceOn}</dd>
                <dt>Site condition</dt>
                <dd>{latest.siteCondition === '' ? '—' : labelOf(SITE_CONDITIONS, latest.siteCondition)}</dd>
                <dt>Built-up area</dt>
                <dd>{latest.buaMicros === null ? '—' : formatQuantity(latest.buaMicros)}</dd>
                <dt>Carpet area</dt>
                <dd>{latest.carpetMicros === null ? '—' : formatQuantity(latest.carpetMicros)}</dd>
                <dt>Clear height</dt>
                <dd>{latest.floorHeightMicros === null ? '—' : formatQuantity(latest.floorHeightMicros)}</dd>
                <dt>Floor(s)</dt>
                <dd>
                  {latest.floorNumber === '' ? '—' : latest.floorNumber} · {latest.numFloors}{' '}
                  {latest.numFloors === 1 ? 'floor' : 'floors'}
                </dd>
                <dt>Expected handover</dt>
                <dd>{latest.handoverOn ?? '—'}</dd>
                <dt>Client present</dt>
                <dd>{latest.clientPresent ? 'Yes' : 'No'}</dd>
              </dl>
              {latest.keyChallenges === '' ? null : (
                <p>
                  <b>Critical challenges — </b>
                  {latest.keyChallenges}
                </p>
              )}
              {latest.observations === '' ? null : (
                <p>
                  <b>Observations — </b>
                  {latest.observations}
                </p>
              )}
            </div>
          </Section>

          <Section bare title="Past surveys" sub={`${recces.data.count} recorded`}>
            <ul className="checklist">
              {items.map((r) => (
                <li key={r.id} className={r.status === 'complete' ? 'done' : undefined}>
                  <span className="tick" aria-hidden="true" />
                  <div>
                    {r.recceOn}
                    <small>{r.siteCondition === '' ? 'Condition not recorded' : labelOf(SITE_CONDITIONS, r.siteCondition)}</small>
                  </div>
                  <Pill tone={recceTone(r.status)}>{labelOf(RECCE_STATUS, r.status)}</Pill>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <Section bare title="Every survey" action={<a className="btn sm" href={`/export/recces?projectId=${projectId}`}>Export</a>}>
        {recces.data.count === 0 ? (
          <Empty illustration="recce" title="No site survey recorded">
            Record the first one below.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            {/* Date · Status · Condition · Built-up · Carpet · Clear height · Floors · Client present */}
            <table className="tbl" data-priority="">
              <thead>
                <tr>
                  <th data-p="1">Date</th>
                  <th data-p="2">Status</th>
                  <th data-p="3">Condition</th>
                  <th className="num" data-p="3">
                    Built-up
                  </th>
                  <th className="num" data-p="3">
                    Carpet
                  </th>
                  <th className="num" data-p="4">
                    Clear height
                  </th>
                  <th className="num" data-p="4">
                    Floors
                  </th>
                  <th data-p="4">Client present</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td data-p="1">{r.recceOn}</td>
                    <td data-p="2" data-label="Status">
                      <Pill tone={recceTone(r.status)}>{labelOf(RECCE_STATUS, r.status)}</Pill>
                    </td>
                    <td data-p="3" data-label="Condition">
                      {r.siteCondition === '' ? <span className="muted">—</span> : labelOf(SITE_CONDITIONS, r.siteCondition)}
                    </td>
                    <td className="num" data-p="3" data-label="Built-up">
                      {r.buaMicros === null ? <span className="muted">—</span> : formatQuantity(r.buaMicros)}
                    </td>
                    <td className="num" data-p="3" data-label="Carpet">
                      {r.carpetMicros === null ? <span className="muted">—</span> : formatQuantity(r.carpetMicros)}
                    </td>
                    <td className="num" data-p="4" data-label="Clear height">
                      {r.floorHeightMicros === null ? <span className="muted">—</span> : formatQuantity(r.floorHeightMicros)}
                    </td>
                    <td className="num" data-p="4" data-label="Floors">
                      {r.numFloors}
                    </td>
                    <td data-p="4" data-label="Client present">
                      {r.clientPresent ? 'Yes' : 'No'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              shown={links.shown}
              of={recces.data.count}
              unit={recces.data.count === 1 ? 'survey' : 'surveys'}
              next={links.next}
              prev={links.prev}
            />
          </div>
        )}
      </Section>

      <AbsentNotice title="No checklist, no lead link, no efficiency ratio, and no photographs">
        A survey has no checklist field (the design&rsquo;s "drawings received / photos taken /
        client walkthrough" steps are not modelled) and no link to a lead — only to a project — so
        it cannot be reached from a lead the way the design describes. The efficiency ratio is a
        division the legacy computes at three different roundings with no agreed definition, so it
        is not invented here, and photographs are not part of this port — they belong in the vault,
        by reference.
      </AbsentNotice>

      <Section bare title="Record a survey">
        <div className="card-b">
          <NewRecceForm projectId={projectId} />
        </div>
      </Section>
    </>
  );
}
