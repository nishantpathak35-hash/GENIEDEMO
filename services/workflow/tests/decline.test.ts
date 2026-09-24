import { describe, expect, it } from 'vitest';
import { decline, type ApprovalStage, type ChainState } from '../src/domain/approval.js';

const stages: ApprovalStage[] = [
  { name: 'Finance check', sequence: 1, approverRole: 'finance', minApprovals: 2, approvalCeilingPaise: null },
  { name: 'Director sign-off', sequence: 2, approverRole: 'director', minApprovals: 1, approvalCeilingPaise: null },
];

const waitingAtFinance: ChainState = { currentStage: 'Finance check', requesterId: 'raiser', approvals: [] };
const at = new Date('2026-09-14T10:00:00Z');

describe('decline', () => {
  it('lets a person entitled to the current stage decline it — one "no" needs no quorum', () => {
    expect(decline({ stages, state: waitingAtFinance, approverId: 'fin-1', approverRoles: ['finance'], at })).toEqual({
      kind: 'declined',
      stage: 'Finance check',
    });
  });

  it('refuses the requester, whatever roles they hold — separation of duties both ways', () => {
    expect(
      decline({ stages, state: waitingAtFinance, approverId: 'raiser', approverRoles: ['finance', 'director'], at }),
    ).toEqual({ kind: 'refused', reason: 'self-approval' });
  });

  it('refuses somebody the stage does not name', () => {
    expect(decline({ stages, state: waitingAtFinance, approverId: 'dir-1', approverRoles: ['director'], at })).toEqual({
      kind: 'refused',
      reason: 'not-entitled',
    });
  });

  it('refuses a person who already approved this stage — they have decided', () => {
    const halfway: ChainState = { ...waitingAtFinance, approvals: [{ stage: 'Finance check', approverId: 'fin-1', at }] };
    expect(decline({ stages, state: halfway, approverId: 'fin-1', approverRoles: ['finance'], at })).toEqual({
      kind: 'refused',
      reason: 'already-approved-this-stage',
    });
    expect(decline({ stages, state: halfway, approverId: 'fin-2', approverRoles: ['finance'], at }).kind).toBe(
      'declined',
    );
  });

  it('refuses a stage the chain does not have', () => {
    expect(
      decline({
        stages,
        state: { ...waitingAtFinance, currentStage: 'Nowhere' },
        approverId: 'fin-1',
        approverRoles: ['finance'],
        at,
      }),
    ).toEqual({ kind: 'refused', reason: 'unknown-stage' });
  });
});
