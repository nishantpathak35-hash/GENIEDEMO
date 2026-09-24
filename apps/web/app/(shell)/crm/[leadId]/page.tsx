import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { formatRupees } from '@cog/money';
import { apiAsCaller } from '../../../../lib/api';
import { Empty, Money, Notice, NotFoundState, PageHeader, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { ConvertLeadForm, DeleteLeadButton, EditLeadForm } from '../forms';
import { leadStageLabel, leadStageTone } from '../stage';
import { HandoverDrawer } from './handover-drawer';
import {
  AddContactForm,
  FollowupForm,
  LogActivityForm,
  MarkLostForm,
  MergeLeadForm,
} from './forms';

export const metadata = { title: 'Lead · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

const ACTIVITY_LABELS: Record<string, string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  site_visit: 'Site visit',
  note: 'Note',
  stage_change: 'Stage change',
  lost: 'Lost',
};

/**
 * One lead, and everything anybody has done about it.
 *
 * The legacy's equivalent is a 1,612-line drawer that loads contacts,
 * activities, tasks, site visits and proposals in one call. Here each panel
 * reads what it shows, so a refusal on one does not take the page down.
 *
 * **The duplicate warning decides nothing.** It matches an exact,
 * case-insensitive client name and shows the other records. It does not link
 * them, merge them, or stop anything — the legacy reaches its merge from a
 * fuzzy `LIKE` match, and identity by fuzzy string is the defect this whole
 * rebuild exists to leave behind.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}): Promise<ReactNode> {
  const { leadId } = await params;
  const client = await apiAsCaller();
  const [pipeline, contacts, activities, duplicates, merges, people, projects] = await Promise.all([
    // a lookup by id: the widest window the endpoint allows
    load(client, API_ROUTES.listLeads, { query: { limit: '200' } }),
    load(client, API_ROUTES.leadContacts, { params: { leadId } }),
    load(client, API_ROUTES.leadActivities, { params: { leadId } }),
    load(client, API_ROUTES.leadDuplicates, { params: { leadId } }),
    load(client, API_ROUTES.leadMerges, { params: { leadId } }),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.people, { query: { limit: '200' } }),
    load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
  ]);

  if (pipeline.kind === 'unreachable') return <UnreachableState />;
  if (pipeline.kind === 'refused') return <Refusal error={pipeline.error} />;

  const lead = pipeline.data.items.find((candidate) => candidate.id === leadId);
  if (lead === undefined) return <NotFoundState what="This lead" backHref="/crm" backLabel="Back to Leads" />;

  const closed = lead.stage === 'unqualified' || lead.stage === 'rejected';
  const today = new Date().toISOString().slice(0, 10);

  // Owner is `lead.ownerId`, a uuid with nothing else to say what it is — the
  // people list is the only endpoint that turns a principal id into anything
  // a person reads (an email; there is no display name), the same
  // substitution the Today page already makes for a task's owner.
  const emailOf = new Map(people.kind === 'ok' ? people.data.items.map((p) => [p.id, p.email]) : []);
  const ownerEmail = lead.ownerId === null ? null : (emailOf.get(lead.ownerId) ?? null);
  const scope =
    lead.projectType === '' && lead.city === ''
      ? ''
      : lead.projectType === ''
        ? lead.city
        : lead.city === ''
          ? lead.projectType
          : `${lead.projectType}, ${lead.city}`;
  const projectOptions =
    projects.kind === 'ok'
      ? projects.data.items.map((p) => [p.id, `${p.code} — ${p.name}`] as const)
      : [];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/crm/board', label: 'Sales' },
          { href: '/crm', label: 'Leads' },
        ]}
        title={lead.clientName}
        status={<Pill tone={leadStageTone(lead.stage)}>{leadStageLabel(lead.stage)}</Pill>}
        facts={[
          ['Value', <Money key="v" wire={lead.estimatedValue} />],
          ['Scope', scope === '' ? <span key="s" className="muted">Not recorded</span> : scope],
          ['Owner', ownerEmail ?? <span key="o" className="muted">No owner</span>],
          [
            'Next step',
            lead.nextFollowupOn === null ? (
              <span key="n" className="muted">
                None scheduled
              </span>
            ) : lead.nextFollowupOn < today ? (
              <Pill key="n" tone="bad">
                Overdue {lead.nextFollowupOn}
              </Pill>
            ) : (
              <span key="n" className="nowrap">
                {lead.nextFollowupOn}
              </span>
            ),
          ],
        ]}
        {...(lead.convertedProjectId === null
          ? {
              primary: (
                <HandoverDrawer
                  leadId={leadId}
                  version={lead.version}
                  clientName={lead.clientName}
                  {...(scope === '' ? {} : { sub: scope })}
                  facts={[
                    ['Stage', leadStageLabel(lead.stage)],
                    ['Value', <Money key="v" wire={lead.estimatedValue} />],
                    ['Scope', scope === '' ? 'Not recorded' : scope],
                    ['Owner', ownerEmail ?? 'No owner'],
                  ]}
                />
              ),
            }
          : {})}
      />

      {closed && lead.lostReason !== '' ? (
        <Notice tone="neutral" title={leadStageLabel(lead.stage)}>
          {lead.lostReason}
        </Notice>
      ) : null}

      {duplicates.kind === 'ok' && duplicates.data.items.length > 0 ? (
        <Notice tone="info" title={`${String(duplicates.data.items.length)} other ${duplicates.data.items.length === 1 ? 'lead shares' : 'leads share'} this client name`}>
          {duplicates.data.items.map((other, index) => (
            <span key={other.id}>
              {index === 0 ? '' : ', '}
              <Link href={`/crm/${other.id}`}>{leadStageLabel(other.stage)}</Link>
            </span>
          ))}
          . Nothing has been linked or merged — this is a note for a person to look at.
          <MergeLeadForm
            leadId={leadId}
            candidates={duplicates.data.items.map(
              (other) =>
                [
                  other.id,
                  `${other.clientName} — ${leadStageLabel(other.stage)}`,
                ] as const,
            )}
          />
        </Notice>
      ) : null}

      {merges.kind === 'ok' && merges.data.items.length > 0 ? (
        <Section title="Merged in" sub={`${String(merges.data.items.length)} ${merges.data.items.length === 1 ? 'record' : 'records'}`}>
          <div>
            <p className="muted">
              What each of these records held, as it was. The previous system marks a merged
              duplicate <strong>Lost</strong> and keeps no note of what moved, so this question
              has no answer there at all.
            </p>
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>It held</th>
                  <th>Moved across</th>
                </tr>
              </thead>
              <tbody>
                {merges.data.items.map((merge) => (
                  <tr key={merge.id}>
                    <td>{merge.mergedAt}</td>
                    <td>
                      {String(merge.losingBefore['client_name'] ?? '')}
                      {merge.losingBefore['phone'] === '' ||
                      merge.losingBefore['phone'] === undefined ? null : (
                        <span className="muted"> — {String(merge.losingBefore['phone'])}</span>
                      )}
                    </td>
                    <td>
                      {merge.repointed.length === 0 ? (
                        <span className="muted">Nothing</span>
                      ) : (
                        `${String(merge.repointed.length)} contact${merge.repointed.length === 1 ? '' : 's'}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint u-mb0">
              The timeline below already includes everything logged against those records. A
              merge never rewrites an activity to say it happened somewhere else.
            </p>
          </div>
        </Section>
      ) : null}

      <Section title="Contacts" {...(contacts.kind === 'ok' ? { sub: `${String(contacts.data.items.length)} ${contacts.data.items.length === 1 ? 'person' : 'people'}` } : {})} bare>
        {contacts.kind !== 'ok' ? (
          <div className="card-b">
            <p className="muted">The contacts could not be read.</p>
          </div>
        ) : contacts.data.items.length === 0 ? (
          <Empty illustration="leads" title="Nobody recorded" size="narrow">
            A fit-out lead usually has a facilities manager, an architect and a procurement head.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contacts.data.items.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.name}</td>
                    <td>
                      {contact.designation === '' ? (
                        <span className="muted">—</span>
                      ) : (
                        contact.designation
                      )}
                    </td>
                    <td>{contact.phone}</td>
                    <td>{contact.email}</td>
                    <td>{contact.isPrimary ? <Pill tone="ok">Primary</Pill> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-b">
          <AddContactForm leadId={leadId} />
        </div>
      </Section>

      <Section title="What has happened" sub="every entry a record of something that happened" bare>
        {activities.kind !== 'ok' ? (
          <div className="card-b">
            <p className="muted">The timeline could not be read.</p>
          </div>
        ) : activities.data.items.length === 0 ? (
          <Empty illustration="leads" title="Nothing logged yet" size="narrow">
            The timeline is append-only — an entry is a record of something that happened, so
            correcting one means recording the correction.
          </Empty>
        ) : (
          <ol className="timeline">
            {activities.data.items.map((entry) => (
              <li key={entry.id}>
                <span className="timeline-date">{entry.occurredOn}</span>
                <span className="timeline-kind">
                  {ACTIVITY_LABELS[entry.kind] ?? entry.kind}
                </span>
                <div>
                  <strong>{entry.summary}</strong>
                  {entry.detail === '' ? null : <p className="muted">{entry.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="card-b">
          <FollowupForm leadId={leadId} />
          <p className="hint">
            Or record something in full, including a visit logged days after it happened:
          </p>
          <LogActivityForm leadId={leadId} />
        </div>
      </Section>

      {closed ? null : (
        <Section title="Close as lost">
          <MarkLostForm leadId={leadId} version={lead.version} />
        </Section>
      )}

      <Section title="Edit lead">
        <div>
          <EditLeadForm
            lead={{
              id: lead.id,
              clientName: lead.clientName,
              contactName: lead.contactName,
              phone: lead.phone,
              email: lead.email,
              stage: lead.stage,
              estimatedValue: formatRupees(lead.estimatedValue),
              probabilityPct: String(lead.probabilityPct),
              expectedClose: lead.expectedClose ?? '',
              projectType: lead.projectType,
              source: lead.source,
              city: lead.city,
              consultant: lead.consultant,
              notes: lead.notes,
              version: String(lead.version),
            }}
          />
          {lead.stage === 'won' && lead.convertedProjectId === null ? (
            <div className="u-mt-8">
              <h3>Attach to the project it became</h3>
              <ConvertLeadForm leadId={leadId} version={lead.version} projects={projectOptions} />
            </div>
          ) : null}
          <div className="u-mt-8">
            <DeleteLeadButton leadId={leadId} />
          </div>
        </div>
      </Section>
    </>
  );
}
