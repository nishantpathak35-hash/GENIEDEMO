import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { load } from '@cog/design-system';
import { AbsentNotice, Empty, Pager, Section, Pill, Refusal, Stat, StatRow, UnreachableState } from '@cog/design-system';
import type { PillTone } from '@cog/design-system';
import { IssueDrawingForm, WithdrawDrawingForm } from './forms';
import { ProjectHead } from '../header';

export const dynamic = 'force-dynamic';

/**
 * Good-for-construction drawings.
 *
 * **There is no file on this screen, and no field that could carry one.** The
 * legacy reads the drawing with `FileReader.readAsDataURL` and sends the whole
 * base64 blob as `fileUrl` (`DesignView.js:100`, `:111`), storing a megabyte of
 * PDF in a text column — and when no file is chosen it fabricates an S3 URL
 * pointing at a bucket nothing ever uploaded to (`:117`), so the record claims
 * a file exists at an address that has none.
 *
 * A drawing here references a vault object by id. Registering that object is a
 * separate act with a checksum, and the bytes never travel through the API.
 *
 * **Issuing a revision supersedes the previous one in the same transaction.**
 * `change-orders.js:146` and `:152` issue the supersede and the insert loose,
 * so a failure between them leaves a project with two active revisions of the
 * same drawing — or none.
 */
export default async function DrawingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const client = await apiAsCaller();
  const [drawings, documents] = await Promise.all([
    load(client, API_ROUTES.listDrawings, { params: { projectId } }),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.listDocuments, { query: { limit: '200' } }),
  ]);

  if (drawings.kind === 'unreachable') return <UnreachableState />;
  if (drawings.kind === 'refused') return <Refusal error={drawings.error} />;

  const items = drawings.data.items;
  const active = items.filter((d) => d.status === 'active');
  const documentOptions =
    documents.kind === 'ok'
      ? documents.data.items.map((doc) => [doc.id, doc.fileName] as const)
      : [];

  return (
    <>
      <ProjectHead projectId={projectId} section="Design" title="Drawings" />
      <StatRow n={3}>
        <Stat label="Active revisions" value={active.length} />
        <Stat label="Superseded" value={items.filter((d) => d.status === 'superseded').length} />
        <Stat label="Withdrawn" value={items.filter((d) => d.status === 'withdrawn').length} />
      </StatRow>

      <Section bare title="Drawings">
        {items.length === 0 ? (
          <Empty illustration="projects" title="No drawings issued">
            Issue the first revision below.
          </Empty>
        ) : (
          <>
            <div className="tbl-wrap">
              {/* Number · Title · Discipline · Revision · Status · File ·
                  (actions) — priority: identity (drawing number) never drops,
                  status is the decision column, revision count and the file
                  attachment state are status figures that drop into the
                  detail line, title, discipline and the withdraw action are
                  reference and drop first. */}
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="1">Number</th>
                    <th data-p="4">Title</th>
                    <th data-p="4">Discipline</th>
                    <th data-p="3">Revision</th>
                    <th data-p="2">Status</th>
                    <th data-p="3">File</th>
                    <th data-p="4" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td data-p="1">{d.drawingNo}</td>
                      <td data-p="4">{d.title}</td>
                      <td data-p="4">{d.category}</td>
                      <td data-p="3" data-label="Revision">
                        {d.revision}
                      </td>
                      <td data-p="2">
                        <Pill tone={statusTone(d.status)}>{d.status}</Pill>
                      </td>
                      <td data-p="3" data-label="File">
                        {d.documentId === null ? (
                          <span className="muted">not attached</span>
                        ) : (
                          'in the vault'
                        )}
                      </td>
                      <td data-p="4">
                        {d.status === 'active' ? (
                          <WithdrawDrawingForm projectId={projectId} drawingId={d.id} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager shown={{ from: 1, to: items.length }} of={items.length} unit="drawings" />
          </>
        )}
      </Section>

      <AbsentNotice title="Drawing files are referenced, not uploaded here">
        The API never accepts file bytes. A drawing points at a vault object registered by its
        checksum and key, and the object itself is fetched through a signed URL. VAULT-01: the
        legacy writes uploads into <code>public/uploads/</code>, a directory served with no
        authentication at all.
      </AbsentNotice>

      <Section bare title="Issue a revision">
        <div className="card-b">
          <IssueDrawingForm projectId={projectId} documents={documentOptions} />
        </div>
      </Section>
    </>
  );
}

function statusTone(status: string): PillTone {
  switch (status) {
    case 'active':
      return 'ok';
    case 'superseded':
      return 'idle';
    default:
      return 'bad';
  }
}
