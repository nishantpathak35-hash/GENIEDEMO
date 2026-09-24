import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { load } from '@cog/design-system';
import { AbsentNotice, Empty, Pager, Section, Pill, Refusal, UnreachableState } from '@cog/design-system';
import { NewSheetForm } from './forms';
import { ProjectHead } from '../header';

export const dynamic = 'force-dynamic';

/**
 * Takeoff sheets.
 *
 * **There is no BOQ export, and a test asserts no such route exists.** The
 * legacy's `exportTakeoffToBOQ` has three separate missing-column defects in
 * one function — it inserts into `boq_items(unit, qty)` and
 * `boq_schedules(description)`, none of which exists, and omits the required
 * `id` for both (TAKE-02, TAKE-03) — so the first statement throws and the
 * function has never run. It also creates the exported schedule with status
 * `'Approved'` outright, which `boq.js:298` then refuses to let anyone edit
 * (TAKE-05). Nothing is lost by not porting a feature that has never worked,
 * and rebuilding it needs PO-16 answered anyway.
 *
 * The per-sheet totals live on the sheet, and they are `null` — not zero — when
 * any item lacks the matching rate, with the offending items named.
 */
export default async function TakeoffPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const sheets = await load(await apiAsCaller(), API_ROUTES.listTakeoffSheets, {
    params: { projectId },
  });

  if (sheets.kind === 'unreachable') return <UnreachableState />;
  if (sheets.kind === 'refused') return <Refusal error={sheets.error} />;

  const items = sheets.data.items;

  return (
    <>
      <ProjectHead projectId={projectId} section="Build" title="Takeoff" />
      <Section bare title="Sheets">
        {items.length === 0 ? (
          <Empty illustration="projects" title="No takeoff sheets">
            Create one below to start quantifying against a drawing.
          </Empty>
        ) : (
          <>
            <div className="tbl-wrap">
              {/* Title · Floor · Scale · Drawing — priority: identity (title)
                  never drops, scale is the decision column since an
                  uncalibrated sheet cannot be measured, drawing-attachment
                  state is a status figure that drops into the detail line,
                  floor is reference and drops first. */}
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Floor</th>
                    <th>Scale</th>
                    <th>Drawing</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((sheet) => (
                    <tr key={sheet.id}>
                      <td data-p="1">{sheet.title}</td>
                      <td data-p="4">
                        {sheet.floorName === '' ? (
                          <span className="muted">—</span>
                        ) : (
                          sheet.floorName
                        )}
                      </td>
                      <td data-p="2">
                        {sheet.scalePxNum === null || sheet.scalePxDen === null ? (
                          <Pill tone="warn">not calibrated</Pill>
                        ) : (
                          <>
                            {sheet.scalePxNum} px : {sheet.scalePxDen} {sheet.scaleUnit}
                          </>
                        )}
                      </td>
                      <td data-p="3" data-label="Drawing">
                        {sheet.documentId === null ? (
                          <span className="muted">not attached</span>
                        ) : (
                          'in the vault'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager shown={{ from: 1, to: items.length }} of={items.length} unit="sheets" />
          </>
        )}
      </Section>

      <AbsentNotice title="Measured items are captured against the drawing, not typed here">
        Items are saved as a set — the sheet is redrawn when a measurement changes, so a partial
        update would leave items nothing on screen produced. The measuring surface itself is a
        canvas tool and is not part of this port; what is built is the sheet, the exact scale, and
        the totals endpoint that names every unpriced and uncosted item rather than quietly
        totalling the priced subset (TAKE-01).
      </AbsentNotice>

      <AbsentNotice title="There is no export to BOQ">
        The legacy&rsquo;s export writes to three columns that do not exist and has therefore
        never run once. Rebuilding it also needs <strong>PO-16</strong> — whether a BOQ rate
        carries GST — which is unanswered.
      </AbsentNotice>

      <Section bare title="New sheet">
        <div className="card-b">
          <NewSheetForm projectId={projectId} />
        </div>
      </Section>
    </>
  );
}
