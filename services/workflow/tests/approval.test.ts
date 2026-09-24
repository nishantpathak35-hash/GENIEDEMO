import { describe, expect, it } from 'vitest';
import { getNextStageLegacy } from '../src/domain/approval-legacy.js';
import {
  ApprovalError,
  approve,
  awaitingStage,
  isEntitled,
  validateChain,
  type ApprovalStage,
  type ChainState,
} from '../src/domain/approval.js';

/** The legacy default payment chain (`app/lib/api/core.js:344-362`). */
const LEGACY_STAGES = [
  { stage_name: 'Pending Procurement', sequence: 1, approver_role: 'procurement' },
  { stage_name: 'Pending Finance', sequence: 2, approver_role: 'finance' },
  { stage_name: 'Pending Director', sequence: 3, approver_role: 'director' },
];

const STAGES: ApprovalStage[] = [
  { name: 'Pending Procurement', sequence: 1, approverRole: 'procurement', minApprovals: 1, approvalCeilingPaise: null },
  { name: 'Pending Finance', sequence: 2, approverRole: 'finance', minApprovals: 1, approvalCeilingPaise: null },
  { name: 'Pending Director', sequence: 3, approverRole: 'director', minApprovals: 1, approvalCeilingPaise: null },
];

const state = (over: Partial<ChainState> = {}): ChainState => ({
  currentStage: 'Pending Procurement',
  requesterId: 'u_requester',
  approvals: [],
  ...over,
});

const AT = new Date('2026-09-04T10:00:00Z');

describe('COMMIT 1 — APPR-01, recorded: one admin walks the whole chain', () => {
  it('advances an admin through every remaining stage in one call', () => {
    // The loop keeps going while the caller holds the next role, and admin and
    // director never trigger the break. A three-stage chain that one person can
    // satisfy alone is not a control.
    const r = getNextStageLegacy(LEGACY_STAGES, 'Pending Procurement', ['admin']);
    expect(r.newStage).toBe('Pending Director');
    expect(r.stagesSkipped).toBeGreaterThan(0);
  });

  it('stops after one stage for a non-privileged role, as intended', () => {
    const r = getNextStageLegacy(LEGACY_STAGES, 'Pending Procurement', ['finance']);
    expect(r.newStage).toBe('Pending Finance');
    expect(r.stagesSkipped).toBe(0);
  });
});

describe('COMMIT 2 — APPR-01 fixed: one stage per call, always', () => {
  it('advances an admin by exactly one stage', () => {
    const out = approve({
      stages: STAGES,
      state: state(),
      approverId: 'u_admin',
      approverRoles: ['admin', 'procurement'],
      at: AT,
    });
    expect(out).toEqual({ kind: 'advanced', stage: 'Pending Finance', complete: false });
  });

  it('gives admin no bypass at a stage it is not entitled to', () => {
    // In the legacy, holding admin or director satisfies EVERY stage, which is
    // what turns the chain into a formality.
    const out = approve({
      stages: STAGES,
      state: state({ currentStage: 'Pending Finance' }),
      approverId: 'u_admin',
      approverRoles: ['admin'],
      at: AT,
    });
    expect(out).toEqual({ kind: 'refused', reason: 'not-entitled' });
    expect(isEntitled(STAGES[1]!, ['admin'])).toBe(false);
  });

  it('requires a separate person at each stage to complete the chain', () => {
    let s = state();
    const steps: Array<[string, string[]]> = [
      ['u_proc', ['procurement']],
      ['u_fin', ['finance']],
      ['u_dir', ['director']],
    ];
    for (const [who, roles] of steps) {
      const out = approve({ stages: STAGES, state: s, approverId: who, approverRoles: roles, at: AT });
      expect(out.kind).toBe('advanced');
      if (out.kind !== 'advanced') return;
      s = {
        ...s,
        currentStage: out.stage,
        approvals: [...s.approvals, { stage: s.currentStage, approverId: who, at: AT }],
      };
      if (out.complete) expect(out.stage).toBe('Pending Director');
    }
  });
});

describe('COMMIT 2 — APPR-02 fixed: self-approval is refused server-side', () => {
  it('refuses the requester, whatever roles they hold', () => {
    // The legacy check is client-side and gates loading a summary, not the
    // action. The server never compared approver against requester.
    for (const roles of [['procurement'], ['admin'], ['admin', 'director', 'procurement']]) {
      const out = approve({
        stages: STAGES,
        state: state({ requesterId: 'u_self' }),
        approverId: 'u_self',
        approverRoles: roles,
        at: AT,
      });
      expect(out).toEqual({ kind: 'refused', reason: 'self-approval' });
    }
  });

  it('allows a different person with the same role', () => {
    const out = approve({
      stages: STAGES,
      state: state({ requesterId: 'u_self' }),
      approverId: 'u_other',
      approverRoles: ['procurement'],
      at: AT,
    });
    expect(out.kind).toBe('advanced');
  });
});

describe('COMMIT 2 — APPR-03 fixed: declared configuration is evaluated', () => {
  const TWO: ApprovalStage[] = [
    { name: 'Dual', sequence: 1, approverRole: 'finance', minApprovals: 2, approvalCeilingPaise: null },
    { name: 'Done', sequence: 2, approverRole: 'director', minApprovals: 1, approvalCeilingPaise: null },
  ];

  it('holds at a stage until it has the number of approvers it asks for', () => {
    // The legacy declares min_approval_count and never reads it, so an
    // administrator configuring "two approvers" silently gets one.
    const first = approve({
      stages: TWO,
      state: state({ currentStage: 'Dual' }),
      approverId: 'u_a',
      approverRoles: ['finance'],
      at: AT,
    });
    expect(first).toEqual({ kind: 'awaiting-more', stage: 'Dual', stillNeeded: 1 });
  });

  it('advances once the quorum is met by DISTINCT people', () => {
    const out = approve({
      stages: TWO,
      state: state({
        currentStage: 'Dual',
        approvals: [{ stage: 'Dual', approverId: 'u_a', at: AT }],
      }),
      approverId: 'u_b',
      approverRoles: ['finance'],
      at: AT,
    });
    expect(out).toEqual({ kind: 'advanced', stage: 'Done', complete: false });
  });

  it('refuses the same person counting twice toward one quorum', () => {
    const out = approve({
      stages: TWO,
      state: state({
        currentStage: 'Dual',
        approvals: [{ stage: 'Dual', approverId: 'u_a', at: AT }],
      }),
      approverId: 'u_a',
      approverRoles: ['finance'],
      at: AT,
    });
    expect(out).toEqual({ kind: 'refused', reason: 'already-approved-this-stage' });
  });
});

describe('validateChain', () => {
  it('accepts a sound chain', () => {
    expect(() => validateChain(STAGES)).not.toThrow();
  });

  it('refuses two stages claiming one position', () => {
    // They would otherwise order by whatever the database returns, which
    // differs between environments.
    expect(() =>
      validateChain([
        { name: 'A', sequence: 1, approverRole: 'finance', minApprovals: 1, approvalCeilingPaise: null },
        { name: 'B', sequence: 1, approverRole: 'director', minApprovals: 1, approvalCeilingPaise: null },
      ]),
    ).toThrow(/share sequence/);
  });

  it('refuses a quorum with no role named', () => {
    expect(() =>
      validateChain([{ name: 'A', sequence: 1, approverRole: '', minApprovals: 2, approvalCeilingPaise: null }]),
    ).toThrow(/names no role/);
  });

  it('refuses an empty chain or a zero quorum', () => {
    expect(() => validateChain([])).toThrow(ApprovalError);
    expect(() =>
      validateChain([{ name: 'A', sequence: 1, approverRole: 'x', minApprovals: 0, approvalCeilingPaise: null }]),
    ).toThrow(/at least one approver/);
  });
});

describe('stage identity is exact, never a substring', () => {
  it('does not confuse one stage name containing another', () => {
    // The legacy decides state with `stage.includes('reject')`, under which
    // "Rejected", "rejected by finance" and "not rejected" are one state.
    const out = approve({
      stages: STAGES,
      state: state({ currentStage: 'Pending' }),
      approverId: 'u_1',
      approverRoles: ['procurement'],
      at: AT,
    });
    expect(out).toEqual({ kind: 'refused', reason: 'unknown-stage' });
  });
});

describe('PO-13d — the value ceiling', () => {
  // A ceiling is the most a stage may authorise ALONE. Above it the request
  // escalates rather than being refused; it is refused only when there is
  // nowhere left to escalate to.
  //
  // Nothing seeds a ceiling. These tests set one explicitly, which is the only
  // way one ever comes to exist.

  const ceilinged = (paise: bigint | null, stages = 1): ApprovalStage[] =>
    stages === 1
      ? [{ name: 'Only', sequence: 1, approverRole: 'finance', minApprovals: 1, approvalCeilingPaise: paise }]
      : [
          { name: 'First', sequence: 1, approverRole: 'finance', minApprovals: 1, approvalCeilingPaise: paise },
          { name: 'Second', sequence: 2, approverRole: 'director', minApprovals: 1, approvalCeilingPaise: null },
        ];

  const approveAt = (stages: ApprovalStage[], currentStage: string, amountPaise: bigint | null) =>
    approve({
      stages,
      state: { currentStage, requesterId: 'u_requester', approvals: [] },
      approverId: 'u_finance',
      approverRoles: ['finance', 'director'],
      amountPaise,
      at: AT,
    });

  /**
   * THE ONE THAT MATTERS MOST.
   *
   * Every stage in this system ships with `approvalCeilingPaise: null`, and the
   * whole design rests on that meaning "behaves exactly as before". If an
   * unconfigured ceiling ever started refusing — the shape `NOT NULL DEFAULT 0`
   * would have had — every approval in every tenant would stop, silently, on
   * the migration. So the unconfigured path is asserted with an absurd amount.
   */
  it('with no ceiling configured, approves any amount — the shipped state', () => {
    const huge = 999_999_999_999_999n; // ~₹100 billion
    expect(approveAt(ceilinged(null), 'Only', huge)).toEqual({
      kind: 'advanced',
      stage: 'Only',
      complete: true,
    });
  });

  it('approves at or below the ceiling', () => {
    const stages = ceilinged(50_000_00n); // ₹50,000
    expect(approveAt(stages, 'Only', 49_999_00n).kind).toBe('advanced');
    // Exactly at the ceiling is within it. "Up to and including" is what a
    // spending limit means to the person who set it.
    expect(approveAt(stages, 'Only', 50_000_00n)).toEqual({
      kind: 'advanced',
      stage: 'Only',
      complete: true,
    });
  });

  it('ESCALATES above the ceiling instead of refusing, when there is a next stage', () => {
    const stages = ceilinged(50_000_00n, 2);
    const outcome = approveAt(stages, 'First', 50_000_01n);
    // One paise over. The approval still counted — it is recorded — but it is
    // not the last word.
    expect(outcome).toEqual({ kind: 'advanced', stage: 'Second', complete: false });
  });

  it('refuses above the ceiling when there is no next stage', () => {
    // The chain as configured contains nobody who may authorise this. Approving
    // anyway would make the ceiling decorative, which is APPR-03's shape: a
    // declared field that is not evaluated.
    expect(approveAt(ceilinged(50_000_00n), 'Only', 50_000_01n)).toEqual({
      kind: 'refused',
      reason: 'above-ceiling',
    });
  });

  it('a zero ceiling authorises nothing alone, and is not the same as unset', () => {
    // Zero is a real, meaningful setting — "this stage always escalates" — which
    // is exactly why NULL rather than 0 had to mean unset.
    expect(approveAt(ceilinged(0n, 2), 'First', 1n)).toEqual({
      kind: 'advanced',
      stage: 'Second',
      complete: false,
    });
    expect(approveAt(ceilinged(0n, 2), 'First', 0n)).toEqual({
      kind: 'advanced',
      stage: 'Second',
      complete: false,
    });
  });

  it('a subject with no amount is never above a ceiling', () => {
    // A drawing revision or a site instruction has no value. It must not be
    // refused by a limit that cannot apply to it.
    expect(approveAt(ceilinged(1n), 'Only', null)).toEqual({
      kind: 'advanced',
      stage: 'Only',
      complete: true,
    });
  });

  it('the ceiling is checked after entitlement, not instead of it', () => {
    // An over-ceiling request from somebody who may not approve at all is
    // refused for the reason that matters. Reporting `above-ceiling` would tell
    // an unauthorised caller what the limit is.
    const outcome = approve({
      stages: ceilinged(1n),
      state: { currentStage: 'Only', requesterId: 'u_requester', approvals: [] },
      approverId: 'u_stranger',
      approverRoles: ['site'],
      amountPaise: 10_000_00n,
      at: AT,
    });
    expect(outcome).toEqual({ kind: 'refused', reason: 'not-entitled' });
  });

  it('an over-ceiling request still cannot be self-approved', () => {
    const outcome = approve({
      stages: ceilinged(1n, 2),
      state: { currentStage: 'First', requesterId: 'u_finance', approvals: [] },
      approverId: 'u_finance',
      approverRoles: ['finance'],
      amountPaise: 10_000_00n,
      at: AT,
    });
    expect(outcome).toEqual({ kind: 'refused', reason: 'self-approval' });
  });
});

/**
 * The stage a request waits at, as the queue reports it — the same resolution
 * `approve()` performs, so the role a screen names is the role the engine will
 * check. Both halves: what it resolves, and what it refuses to guess.
 */
describe('awaitingStage', () => {
  it('an empty current stage is stage one — the request has not entered the chain', () => {
    expect(awaitingStage(STAGES, '')?.name).toBe('Pending Procurement');
    expect(awaitingStage(STAGES, '   ')?.approverRole).toBe('procurement');
  });

  it('a named stage is itself, not the one after it', () => {
    // `approval_stage` records the stage being COLLECTED. Reporting the next
    // one would name the wrong approver for every order in the queue.
    expect(awaitingStage(STAGES, 'Pending Finance')?.approverRole).toBe('finance');
  });

  it('resolves by sequence, not by array order', () => {
    const shuffled = [STAGES[2], STAGES[0], STAGES[1]] as ApprovalStage[];
    expect(awaitingStage(shuffled, '')?.name).toBe('Pending Procurement');
  });

  it('is null for an unknown stage and for an empty chain', () => {
    expect(awaitingStage(STAGES, 'Pending Nobody')).toBeNull();
    expect(awaitingStage([], '')).toBeNull();
  });
});
