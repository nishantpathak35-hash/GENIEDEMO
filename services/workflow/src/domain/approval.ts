/**
 * COMMIT 2 OF 2 — the approval chain, corrected.
 *
 * Closes **APPR-01 … APPR-03** from `docs/STACK-MIGRATION.md`. The verbatim
 * port is in `approval-legacy.ts`, with tests recording what it does.
 *
 * `services/workflow` owns the chain and the history. It owns **no business
 * domain** — TOPOLOGY flags this service as the one to watch, because if
 * procurement or finance logic accumulates here that is the early warning that
 * the old mess is re-forming. So this engine knows about stages, roles and
 * approvers; it does not know what a purchase order is.
 */

export interface ApprovalStage {
  readonly name: string;
  readonly sequence: number;
  /** Who may act at this stage. Empty means anyone authenticated. */
  readonly approverRole: string;
  /**
   * How many DISTINCT approvers this stage needs.
   *
   * **Fixes APPR-03.** The legacy schema declares `min_approval_count` and
   * never reads it, so an administrator configuring "two approvers required"
   * silently gets one. Here every declared field is evaluated — and a field
   * that cannot be evaluated is not declared.
   */
  readonly minApprovals: number;
  /**
   * The most this stage may authorise ON ITS OWN, in paise. `null` = no limit.
   *
   * Above it the stage's approval still counts and the request ESCALATES to the
   * next stage rather than completing. It is refused only when there is no next
   * stage — see `approve`.
   *
   * Every stage ships `null` and nothing seeds a value. The numbers belong to
   * the organisation, and a plausible default here would be indistinguishable
   * from an agreed figure a few months from now (PO-13d).
   */
  readonly approvalCeilingPaise: bigint | null;
}

export interface Approval {
  readonly stage: string;
  readonly approverId: string;
  readonly at: Date;
}

export interface ChainState {
  readonly currentStage: string;
  /** Who raised the request. Compared against every approver. */
  readonly requesterId: string;
  readonly approvals: readonly Approval[];
}

export type AdvanceOutcome =
  | { readonly kind: 'advanced'; readonly stage: string; readonly complete: boolean }
  | { readonly kind: 'awaiting-more'; readonly stage: string; readonly stillNeeded: number }
  | { readonly kind: 'refused'; readonly reason: RefusalReason };

export type RefusalReason =
  | 'not-entitled'
  | 'self-approval'
  | 'already-approved-this-stage'
  | 'chain-complete'
  | 'unknown-stage'
  /**
   * The amount is above this stage's ceiling and there is no further stage to
   * escalate to, so the chain as configured contains nobody who may authorise
   * it. Approving anyway would make the ceiling decorative — which is APPR-03,
   * a declared field that is not evaluated.
   */
  | 'above-ceiling';

export class ApprovalError extends Error {
  override readonly name = 'ApprovalError';
}

export interface ApproveInput {
  /**
   * What the request is worth, in paise, or `null` when the subject has no
   * amount — a drawing revision, a site instruction.
   *
   * This is the engine's ONLY concession to knowing anything about a subject,
   * and it is deliberately a bare number rather than a purchase order: workflow
   * owns the chain and no business domain (TOPOLOGY flags this service as the
   * one to watch for exactly that drift). A `null` amount can never exceed a
   * ceiling, so an amountless subject behaves as it always has.
   */
  readonly amountPaise?: bigint | null;
  readonly stages: readonly ApprovalStage[];
  readonly state: ChainState;
  readonly approverId: string;
  readonly approverRoles: readonly string[];
  readonly at: Date;
}

/**
 * Record one approval and decide what happens next.
 *
 * **Advances at most ONE stage per call. Always.**
 *
 * That is the fix for APPR-01. The legacy loops forward while the caller holds
 * the next role, and exempts `admin` and `director` from the break — so one
 * call from an administrator carries a payment request through every stage of
 * its chain. A three-stage approval that one person can satisfy alone is not a
 * control; it is a control-shaped hole, and separation of duties is the first
 * thing an auditor tests.
 *
 * There is deliberately no role that bypasses this. An administrator who must
 * push something through does so by approving at each stage, leaving one audit
 * row per stage with their name on it — visible, rather than invisible.
 */
export function approve(input: ApproveInput): AdvanceOutcome {
  const ordered = [...input.stages].sort((a, b) => a.sequence - b.sequence);

  // **An empty current stage means the request has not entered the chain yet,
  // and entering it means stage one.**
  //
  // Without this the chain is configurable and unusable: a purchase order
  // carries `approval_stage = NULL` until something advances it, and nothing
  // advances it until an approval succeeds. Every approval refused
  // `unknown-stage` — a control that could be configured, and could never fire.
  //
  // Narrow on purpose. Only the EMPTY stage resolves this way; a stage that is
  // named but absent from the chain still refuses, because that is a
  // reconfiguration that stranded a live request and silently restarting it at
  // stage one would discard the approvals it had already collected.
  //
  // The legacy does the same thing and says so — `['Draft','Pending Approval']
  // .includes(currentStage)` falls through to `stages[0]` at
  // `ApprovalWorkflowService.ts:16` and `:313` — except that it matches two
  // hardcoded English stage names, so a chain whose first stage is called
  // anything else could not be entered either.
  const index =
    input.state.currentStage.trim() === ''
      ? 0
      : ordered.findIndex((s) => s.name === input.state.currentStage);

  if (index === -1 || ordered.length === 0) return { kind: 'refused', reason: 'unknown-stage' };
  if (index === ordered.length - 1 && stageSatisfied(ordered[index] as ApprovalStage, input.state)) {
    return { kind: 'refused', reason: 'chain-complete' };
  }

  const stage = ordered[index] as ApprovalStage;

  // APPR-02: the server compares the approver against the requester. The legacy
  // check is client-side and gates loading a summary, not the action.
  if (input.approverId === input.state.requesterId) {
    return { kind: 'refused', reason: 'self-approval' };
  }

  if (!isEntitled(stage, input.approverRoles)) {
    return { kind: 'refused', reason: 'not-entitled' };
  }

  // One person cannot count twice toward the same stage's quorum.
  const already = input.state.approvals.some(
    (a) => a.stage === stage.name && a.approverId === input.approverId,
  );
  if (already) return { kind: 'refused', reason: 'already-approved-this-stage' };

  const approvalsHere =
    input.state.approvals.filter((a) => a.stage === stage.name).length + 1;

  if (approvalsHere < stage.minApprovals) {
    return {
      kind: 'awaiting-more',
      stage: stage.name,
      stillNeeded: stage.minApprovals - approvalsHere,
    };
  }

  const next = ordered[index + 1];

  // THE VALUE CEILING (PO-13d).
  //
  // A ceiling is the most this stage may authorise alone. Above it the approval
  // just given still stands — it is recorded, and it counted toward the quorum
  // above — but it cannot be the LAST word: the request escalates to the next
  // stage instead of completing.
  //
  // Comparison only. No arithmetic happens on either figure, which is why this
  // is allowed to live outside `packages/money`: `>` is not a computation, and
  // both sides are already exact bigint paise.
  //
  // Unconfigured is the shipped state and behaves exactly as before: `null`
  // ceiling short-circuits, and a `null`/absent amount can never exceed one.
  const ceiling = stage.approvalCeilingPaise;
  const amount = input.amountPaise;
  const aboveCeiling =
    ceiling !== null && amount !== null && amount !== undefined && amount > ceiling;

  if (aboveCeiling) {
    // Nobody further to escalate to. Refusing is the honest answer: the
    // alternative is to approve an amount the configuration says this stage may
    // not authorise, which is the ceiling not being evaluated.
    return next === undefined
      ? { kind: 'refused', reason: 'above-ceiling' }
      : { kind: 'advanced', stage: next.name, complete: false };
  }

  return next === undefined
    ? { kind: 'advanced', stage: stage.name, complete: true }
    : { kind: 'advanced', stage: next.name, complete: false };
}

/**
 * The stage a request is waiting at — the one whose approvals are being
 * collected — or `null` when the chain is empty or names a stage it does not
 * hold.
 *
 * The same resolution `approve()` performs, exported so the queue can say WHO
 * an order is waiting on without re-deriving the rule: an empty current stage
 * means stage one (the request has not entered the chain yet); a named stage
 * is itself, because `approval_stage` records the stage being collected, not
 * the last one passed. A screen that reads `approverRole` off the answer is
 * reading the same field the engine will check.
 */
export type DeclineOutcome =
  | { readonly kind: 'declined'; readonly stage: string }
  | { readonly kind: 'refused'; readonly reason: RefusalReason };

/**
 * Whether this person may decline the request at its current stage.
 *
 * The people who may approve a stage are the people who may decline it, under
 * the same rules: the requester decides nothing about their own request either
 * way, somebody the stage does not name decides nothing, and a person who has
 * already approved this stage has already decided. A decline has no quorum —
 * one entitled "no" ends the request.
 */
export function decline(input: Omit<ApproveInput, 'amountPaise'>): DeclineOutcome {
  const ordered = [...input.stages].sort((a, b) => a.sequence - b.sequence);
  const index =
    input.state.currentStage.trim() === ''
      ? 0
      : ordered.findIndex((s) => s.name === input.state.currentStage);
  if (index === -1 || ordered.length === 0) return { kind: 'refused', reason: 'unknown-stage' };
  const stage = ordered[index] as ApprovalStage;
  if (index === ordered.length - 1 && stageSatisfied(stage, input.state)) {
    return { kind: 'refused', reason: 'chain-complete' };
  }
  if (input.approverId === input.state.requesterId) return { kind: 'refused', reason: 'self-approval' };
  if (!isEntitled(stage, input.approverRoles)) return { kind: 'refused', reason: 'not-entitled' };
  const already = input.state.approvals.some(
    (a) => a.stage === stage.name && a.approverId === input.approverId,
  );
  if (already) return { kind: 'refused', reason: 'already-approved-this-stage' };
  return { kind: 'declined', stage: stage.name };
}

export function awaitingStage(
  stages: readonly ApprovalStage[],
  currentStage: string,
): ApprovalStage | null {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  const index = currentStage.trim() === '' ? 0 : ordered.findIndex((s) => s.name === currentStage);
  if (index === -1) return null;
  return ordered[index] ?? null;
}

function stageSatisfied(stage: ApprovalStage, state: ChainState): boolean {
  return state.approvals.filter((a) => a.stage === stage.name).length >= stage.minApprovals;
}

/**
 * Whether a set of roles entitles someone to act at a stage.
 *
 * No `admin`/`director` override. In the legacy, holding either role satisfies
 * *every* stage — which is what turns the chain into a formality. An
 * administrator here is entitled where the configuration says so and nowhere
 * else.
 */
export function isEntitled(stage: ApprovalStage, roles: readonly string[]): boolean {
  const required = stage.approverRole.trim().toLowerCase();
  if (required === '') return true;
  return roles.some((r) => r.trim().toLowerCase() === required);
}

/**
 * Validate a chain before it is saved.
 *
 * Rejects a configuration that cannot be honoured, rather than accepting it and
 * quietly doing something else — which is APPR-03's real shape.
 */
export function validateChain(stages: readonly ApprovalStage[]): void {
  if (stages.length === 0) throw new ApprovalError('an approval chain needs at least one stage');

  const sequences = new Set<number>();
  for (const stage of stages) {
    if (stage.name.trim() === '') throw new ApprovalError('a stage needs a name');
    if (!Number.isInteger(stage.sequence)) {
      throw new ApprovalError(`stage ${stage.name} has a non-integer sequence`);
    }
    if (sequences.has(stage.sequence)) {
      // Two stages claiming one position order by whatever the database
      // returns, which differs between environments.
      throw new ApprovalError(`two stages share sequence ${stage.sequence}`);
    }
    sequences.add(stage.sequence);

    if (!Number.isInteger(stage.minApprovals) || stage.minApprovals < 1) {
      throw new ApprovalError(`stage ${stage.name} needs at least one approver`);
    }
    if (stage.minApprovals > 1 && stage.approverRole.trim() === '') {
      // "Two approvers, anyone at all" is almost certainly a misconfiguration,
      // and it is cheaper to refuse it than to explain it later.
      throw new ApprovalError(
        `stage ${stage.name} requires ${stage.minApprovals} approvers but names no role`,
      );
    }
  }
}
