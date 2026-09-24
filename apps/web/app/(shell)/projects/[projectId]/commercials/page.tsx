import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints, formatIndianRupeesOrDash, formatRupeesOrEmpty } from '@cog/money';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { AgreementForm, AgreementStatusForm, StagesForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Commercials' };
export const dynamic = 'force-dynamic';

/**
 * The contract value, and what releases it.
 *
 * **One rule, and it is the reason this screen is worth having.** The payment
 * stages have to total exactly 100% of the contract before it can be signed. A
 * schedule adding up to 95% never bills the last 5% and looks completely normal
 * on the way past.
 *
 * There is no deposit percentage, no validity period and no included-revision
 * count here. The previous system invents all four with a `??` and reads none
 * of them; a workflow judged thin is built without its invented numbers rather
 * than with them.
 */
export default async function CommercialsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const loaded = await load(await apiAsCaller(), API_ROUTES.agreementForProject, {
    params: { projectId },
  });

  if (loaded.kind === 'unreachable') return <UnreachableState />;
  if (loaded.kind === 'refused') {
    return loaded.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={loaded.error} />
    );
  }

  const agreement = loaded.data.agreement;
  const shortBy = agreement === null ? 10_000 : 10_000 - agreement.allocatedBp;

  return (
    <>
      <ProjectHead projectId={projectId} section="Commercial" title="Commercials" />
      {agreement === null ? (
        <Section bare title="No agreement yet">
          <div className="card-b">
            <Empty illustration="projects" title="Nothing agreed">
              The contract value and the stages that release it — both go on a document somebody
              signs, so both are recorded here rather than in an email.
            </Empty>
            <AgreementForm projectId={projectId} />
          </div>
        </Section>
      ) : (
        <>
          <Section bare title="Agreement">
            <div className="card-b">
              <dl className="kv">
                <dt>State</dt>
                <dd>
                  <Pill
                    tone={
                      agreement.status === 'signed'
                        ? 'ok'
                        : agreement.status === 'issued'
                          ? 'active'
                          : 'idle'
                    }
                  >
                    {agreement.status}
                  </Pill>
                  {agreement.signedOn === null ? null : (
                    <span className="muted"> Signed {agreement.signedOn}</span>
                  )}
                </dd>
                <dt>Contract value</dt>
                <dd>{formatIndianRupeesOrDash(agreement.contractValuePaise)}</dd>
                <dt>Engagement</dt>
                <dd>
                  {agreement.engagementType === '' ? (
                    <span className="muted">Not said</span>
                  ) : (
                    agreement.engagementType
                  )}
                </dd>
                <dt>Stages account for</dt>
                <dd>
                  {formatBasisPoints(agreement.allocatedBp)}{' '}
                  {shortBy === 0 ? (
                    <Pill tone="ok">All of it</Pill>
                  ) : shortBy > 0 ? (
                    <Pill tone="warn">
                      {formatBasisPoints(shortBy)} of the contract is not in any stage
                    </Pill>
                  ) : (
                    <Pill tone="bad">More than the whole contract</Pill>
                  )}
                </dd>
              </dl>
              {agreement.notes === '' ? null : <p>{agreement.notes}</p>}
            </div>
          </Section>

          <Section bare title="Payment stages">
            <div className="card-b">
              {agreement.stages.length === 0 ? (
                <Empty illustration="projects" title="No stages yet">
                  What has to happen before each part of the contract is billed.
                </Empty>
              ) : (
                <>
                  {/* # · Stage · Released by · Share · Amount — priority:
                      stage name is identity and never drops, amount is the
                      decision column (the figure this schedule exists to
                      show), share is money/status and drops into the detail
                      line, the sequence number and the release trigger are
                      reference and drop first. */}
                  <div className="tbl-wrap">
                    <table className="tbl" data-priority>
                      <thead>
                        <tr>
                          <th data-p="4">#</th>
                          <th data-p="1">Stage</th>
                          <th data-p="4">Released by</th>
                          <th data-p="3">Share</th>
                          <th data-p="2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agreement.stages.map((stage) => (
                          <tr key={stage.id}>
                            <td data-p="4">{stage.position + 1}</td>
                            <td data-p="1">{stage.name}</td>
                            <td className="muted" data-p="4">
                              {stage.trigger}
                            </td>
                            <td data-p="3" data-label="Share">
                              {formatBasisPoints(stage.shareBp)}
                            </td>
                            <td data-p="2">{formatIndianRupeesOrDash(stage.amountPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager
                    shown={{ from: 1, to: agreement.stages.length }}
                    of={agreement.stages.length}
                    unit="stages"
                  />
                </>
              )}
              {agreement.status === 'signed' ? (
                <p className="hint u-mb0">
                  Signed, so the schedule is fixed. Changing what is being built is a change order,
                  which goes through the approval chain.
                </p>
              ) : (
                <StagesForm projectId={projectId} stages={agreement.stages} />
              )}
            </div>
          </Section>

          {agreement.status === 'signed' ? null : (
            <Section bare title="Change it">
              <div className="card-b">
                <AgreementForm
                  projectId={projectId}
                  engagementType={agreement.engagementType}
                  contractValue={formatRupeesOrEmpty(agreement.contractValuePaise)}
                  notes={agreement.notes}
                />
                <AgreementStatusForm projectId={projectId} allocatedBp={agreement.allocatedBp} />
              </div>
            </Section>
          )}
        </>
      )}

      <AbsentNotice title="Each stage amount is worked out, not typed">
        A stage carries its share of the contract, and the amount is computed from that every time
        it is read. Storing both means they disagree the moment the contract value changes, and then
        two screens say different things about what is owed. The last stage takes the rounding
        remainder, so the stages always add up to exactly the contract.
      </AbsentNotice>
    </>
  );
}
