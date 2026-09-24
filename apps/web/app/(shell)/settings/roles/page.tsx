import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, PageHeader, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { AddRoleForm, RoleGrantsForm } from '../forms';

export const metadata = { title: 'Roles · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Roles — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Roles" sub="What each role may do, firm-wide." />;

/**
 * **PO-13, as a screen you can argue with.**
 *
 * Ten roles, read out of the repaired legacy tree at `settings-catalog.js:1`
 * and seeded when this organisation was provisioned. Every one arrives marked
 * PROVISIONAL, because reading an answer out of somebody else's code is not the
 * same as agreeing to it — and the difference is on the screen rather than in a
 * comment nobody opens.
 *
 * Pressing save on a role is what makes it confirmed. The server records who
 * and when, and the table refuses a confirmed row without both.
 *
 * **What is deliberately not here: a value limit.** There is no "approve up to
 * five lakh" field, because there is no such thing anywhere in the system this
 * answer came from — the stage table has no amount column and never had one.
 * Inventing one would be a control that looks enforced and is not, which is the
 * defect this whole screen exists to stop repeating.
 */
export default async function RolesPage(): Promise<ReactNode> {
  const roles = await load(await apiAsCaller(), API_ROUTES.listRoles, {});

  if (roles.kind === 'unreachable') return <UnreachableState />;
  if (roles.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Roles">
          <Refusal error={roles.error} />
        </Section>
      </>
    );
  }

  const live = roles.data.items.filter((role) => !role.retired);

  return (
    <>
      {HEADER}
      {roles.data.provisional ? (
        <div className="notice">
          <p>
            <strong>These permissions were inherited, not agreed.</strong> They were read out of
            the repaired legacy application and seeded when this organisation was created. Anything
            still marked <Pill tone="warn">Provisional</Pill> is a guess that happens to match how
            the old system behaved. Saving a role records that a person looked at it.
          </p>
        </div>
      ) : null}

      {live.length === 0 ? (
        <Empty illustration="documents" title="No roles">
          This organisation was created before the role model existed — add one below.
        </Empty>
      ) : (
        live.map((role) => (
          <Section bare key={role.key} title={role.label}>
            <div className="card-b">
              <RoleGrantsForm
                roleKey={role.key}
                label={role.label}
                status={role.status}
                modules={role.modules}
                actions={role.actions}
              />
            </div>
          </Section>
        ))
      )}

      <Section bare title="Add a role">
        <div className="card-b">
          <AddRoleForm />
        </div>
      </Section>

      <AbsentNotice title="Roles are retired, never deleted">
        Every approval in <code>workflow.approval_history</code> names the stage it was given at,
        and a stage names a role. Deleting a role would leave those rows describing a decision made
        under a rule that no longer exists anywhere — and that history is the only thing a dispute
        can be settled from.
      </AbsentNotice>
    </>
  );
}
