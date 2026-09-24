import type { ReactNode } from 'react';
import Link from 'next/link';
import type { HeroCandidate } from '@cog/contracts';
import { Hero, Money } from '@cog/design-system';

/**
 * The hero, in the shape its candidate came in — Today's, and a project's
 * Overview's, which asks `/today/hero?projectId=` the same question of one
 * project. The server ranked the candidates; this only draws the winner.
 */

function plural(n: number, one: string, many = `${one}s`): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** The hero, in the shape its candidate came in. `dateLine` is the whole eyebrow. */
export function TodayHero({
  candidate,
  dateLine,
  project,
}: {
  candidate: HeroCandidate;
  dateLine: string;
  /** Set on a project's Overview: the hero speaks of this project, and its actions open its own tabs. */
  project?: { id: string; code: string };
}): ReactNode {
  switch (candidate.kind) {
    case 'blocked-approvals': {
      // One face per person who can clear something, named; a role nobody
      // holds is shown as the role, because that is who it waits on.
      const owners = candidate.owners.flatMap((o) =>
        o.people.length === 0
          ? [
              {
                initial: (o.role.length === 0 ? '?' : o.role).slice(0, 1).toUpperCase(),
                name: o.role.length === 0 ? 'no stage' : o.role,
                role: 'nobody holds the role',
              },
            ]
          : o.people.slice(0, 3).map((p) => ({
              initial: p.name.slice(0, 1).toUpperCase(),
              name: p.name,
              role: o.role,
            })),
      );
      const first = candidate.owners[0];
      const firstPerson = first?.people[0];
      return (
        <Hero
          ariaLabel={dateLine}
          eyebrow={dateLine}
          value={<Money wire={candidate.total} />}
          sentence={
            <>
              Held by <b>{plural(candidate.count, 'approval')}</b>
              {first === undefined ? null : (
                <>
                  , waiting on{' '}
                  <b>
                    {firstPerson !== undefined
                      ? `${firstPerson.name}${first.holders > 1 ? ` and ${String(first.holders - 1)} more` : ''}`
                      : first.role.length === 0
                        ? 'a stage nobody can approve'
                        : `${first.role} — nobody holds it`}
                  </b>
                </>
              )}
              {candidate.oldestDays > 0 ? (
                <>
                  {' '}
                  — the oldest since <b>{plural(candidate.oldestDays, 'day')}</b> ago
                </>
              ) : null}
              .
            </>
          }
          side={
            <div className="d watch">
              <b>{candidate.count}</b> waiting · oldest <b>{plural(candidate.oldestDays, 'day')}</b> · <b>{candidate.olderThanWeek}</b> older
              than a week
            </div>
          }
          actions={
            <Link className="btn primary lg" href="/approvals">
              Open all {candidate.count}
            </Link>
          }
          owners={owners}
        />
      );
    }
    case 'contract-ceiling':
      return (
        <Hero
          ariaLabel={`${candidate.code} · ordered against contract`}
          eyebrow={`${candidate.code} · ordered against contract`}
          value={`${String(candidate.orderedPct)}%`}
          sentence={
            candidate.over ? (
              <>
                <b>{candidate.name}</b> has ordered{' '}
                <b>
                  <Money wire={candidate.overBy} />
                </b>{' '}
                past its{' '}
                <b>
                  <Money wire={candidate.contractValue} />
                </b>{' '}
                contract.
              </>
            ) : (
              <>
                <b>
                  <Money wire={candidate.committed} />
                </b>{' '}
                ordered against a{' '}
                <b>
                  <Money wire={candidate.contractValue} />
                </b>{' '}
                contract on <b>{candidate.name}</b>.
              </>
            )
          }
          watch
          bar={{
            pct: candidate.orderedPct > 100 ? 100 : candidate.orderedPct,
            thresholdPct: candidate.thresholdPct,
            ...(candidate.over ? { overPct: candidate.orderedPct - 100 > 100 ? 100 : candidate.orderedPct - 100 } : {}),
            left: (
              <>
                <Money wire={candidate.committed} /> ordered
              </>
            ),
            right: (
              <>
                <Money wire={candidate.contractValue} /> contract
              </>
            ),
            thresholdLabel: `${String(candidate.thresholdPct)}% watch line`,
          }}
          actions={
            <Link
              className="btn primary lg"
              href={project === undefined ? `/projects/${candidate.projectId}` : `/projects/${candidate.projectId}/procurement`}
            >
              {project === undefined ? `Open ${candidate.code}` : 'Open orders'}
            </Link>
          }
        />
      );
    case 'ordered-so-far':
      if (project !== undefined) {
        return (
          <Hero
            ariaLabel={`${project.code} · ordered so far`}
            eyebrow={`${project.code} · ordered so far`}
            value={<Money wire={candidate.total} />}
            sentence={
              <>
                Nothing on <b>{project.code}</b> is waiting on you this morning — <b>{plural(candidate.orderCount, 'order')}</b>{' '}
                raised, none past the contract.
              </>
            }
            actions={
              <Link className="btn primary lg" href={`/projects/${project.id}/procurement`}>
                Open orders
              </Link>
            }
          />
        );
      }
      return (
        <Hero
          ariaLabel="Ordered so far, all projects"
          eyebrow="Ordered so far, all projects"
          value={<Money wire={candidate.total} />}
          sentence={
            <>
              Nothing is waiting on you this morning — <b>{plural(candidate.orderCount, 'order')}</b> across{' '}
              <b>{plural(candidate.projectCount, 'project')}</b>.
            </>
          }
          actions={
            <Link className="btn primary lg" href="/projects">
              View projects
            </Link>
          }
        />
      );
    case 'absent':
      // `rankToday` never names an absent candidate the hero; typed for completeness.
      return null;
  }
}

