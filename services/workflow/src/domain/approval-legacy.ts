/**
 * COMMIT 1 OF 2 — the approval chain, ported VERBATIM.
 *
 * Sources:
 *   `src/modules/core/services/ApprovalWorkflowService.ts:225-306` (database-driven)
 *   `src/modules/core/services/ApprovalEngine.ts:90-140` (hardcoded fallback)
 *
 * **Reproduces the legacy behaviour including two security defects.** Not
 * exported from the package. The corrected engine is `approval.ts`, commit 2.
 *
 * Defects carried over, recorded in `docs/STACK-MIGRATION.md`:
 *
 *   **APPR-01 — one user can walk the entire chain.** The loop advances while
 *   the user holds the required role, and `admin`/`director` are exempted from
 *   the break condition entirely. A single call from an admin advances a
 *   payment request from the first stage to the last. A three-stage approval
 *   chain that one person can satisfy alone is not a control, and separation of
 *   duties is the first thing a SOC 2 auditor tests.
 *
 *   **APPR-02 — no server-side self-approval check.** The only creator check is
 *   in `PaymentsView.js:448`, client-side, and it gates loading a summary
 *   rather than the approve action. The server never compares the approver
 *   against the requester.
 *
 *   **APPR-03 — nine configured fields, one evaluated.**
 *   `approval_workflow_stages` declares `min_approval_count`, `approval_type`,
 *   `specific_user`, `department`, `comments_mandatory`, `auto_approval`,
 *   `escalation_ready` and `skip_conditions`. Execution reads only
 *   `approver_role`. An administrator configuring "two approvers required" gets
 *   one, silently.
 *
 * **UNDER THE MONEY GUARD.** This file was exempt from `MONEY_ARITHMETIC` until
 * 2026-09-06, by a `*-legacy.ts` filename glob that covered it for its name
 * rather than for anything it does. Measured with the exemption removed and the
 * selectors widened to match nested identifiers: **zero violations.** It moves
 * an approval through stages by comparing roles and names, and the only numbers
 * in it are stage indices — so there was never anything here for the guard to be
 * relaxed about, and it is now enforced like every other domain file.
 */

export interface LegacyStage {
  readonly stage_name: string;
  readonly sequence: number;
  readonly approver_role: string;
  // Declared in the schema, never read by the engine. Present here so the port
  // is honest about what is accepted and discarded.
  readonly min_approval_count?: number;
  readonly approval_type?: string;
  readonly specific_user?: string;
}

export interface LegacyAdvanceResult {
  readonly newStage: string;
  readonly stagesSkipped: number;
}

/**
 * Verbatim transcription of `ApprovalWorkflowService.getNextStage`.
 *
 * The `while` is the defect: it keeps advancing as long as the caller holds the
 * role for the next stage, and admin/director never trigger the break.
 */
export function getNextStageLegacy(
  stages: readonly LegacyStage[],
  currentStage: string,
  userRoles: readonly string[],
): LegacyAdvanceResult {
  const normalizedRoles = userRoles.map((r) => String(r || '').toLowerCase().trim());
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);

  let index = ordered.findIndex((s) => s.stage_name === currentStage);
  let skipped = 0;

  // Start at the stage AFTER the current one.
  index = index + 1;

  while (index < ordered.length) {
    const stage = ordered[index] as LegacyStage;
    const requiredRole = String(stage.approver_role || '').toLowerCase().trim();

    let hasRole =
      !requiredRole ||
      normalizedRoles.includes(requiredRole) ||
      normalizedRoles.includes('admin') ||
      normalizedRoles.includes('director');

    if (!hasRole && ['proc', 'procurement', 'maker'].includes(requiredRole)) {
      hasRole = normalizedRoles.some((r) => ['proc', 'procurement', 'maker'].includes(r));
    }

    if (!hasRole) break;

    // APPR-01: admin and director are exempt from the break, so they continue
    // through every remaining stage in a single call.
    if (!normalizedRoles.includes('director') && !normalizedRoles.includes('admin')) {
      break;
    }

    index += 1;
    skipped += 1;
  }

  const landed = ordered[Math.min(index, ordered.length - 1)] as LegacyStage;
  return { newStage: landed.stage_name, stagesSkipped: skipped };
}
