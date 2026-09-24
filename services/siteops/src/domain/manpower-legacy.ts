/**
 * COMMIT 1 OF 2 — DPR manpower counting, ported VERBATIM.
 *
 * Source: `_legacy/atelier-current/src/modules/operations/utils/dprCalculations.js`
 * (the whole file, 19 lines).
 *
 * **Reproduces the legacy behaviour including its defects.** The corrected
 * version is in `manpower.ts`, in commit 2. See ADR-0014 decision 5 — fixing
 * while porting destroys the only way to tell whether a changed figure is a
 * wrong port or a right fix.
 *
 * Defects carried over, each with a row in `docs/STACK-MIGRATION.md`:
 *
 *   **DPR-01** `parseInt` is lenient. `parseInt('12 workers')` is 12,
 *   `parseInt('1.9')` is 1 (truncated toward zero), and `parseInt('0x10')` is
 *   16. A site engineer typing free text into a count field gets a number
 *   silently derived from a prefix of it.
 *
 *   **DPR-02** `|| 0` turns an unparseable count into zero, so a malformed
 *   entry reduces the reported headcount instead of raising. On a report used
 *   for client billing and progress claims, that under-reports labour.
 *
 *   **DPR-03** No bound and no validation: a negative count is accepted and
 *   subtracts from the total.
 *
 * **UNDER THE MONEY GUARD.** This file was exempt from `MONEY_ARITHMETIC` until
 * 2026-09-06, by a `*-legacy.ts` filename glob that covered it for its name
 * rather than for anything it does. Measured with the exemption removed and the
 * selectors widened to match nested identifiers: **zero violations.** It counts
 * people. `parseInt` on a headcount is DPR-01, not a money defect, and a worker
 * is not a currency — so there was never anything here for the guard to be
 * relaxed about, and it is now enforced like every other domain file.
 */

export interface LegacyManpowerEntry {
  readonly count?: unknown;
}

export interface LegacyFloor {
  readonly manpower?: unknown;
}

export interface LegacyDprData {
  readonly floors?: unknown;
}

/** Verbatim transcription of `calculateFloorManpower`. */
export function calculateFloorManpowerLegacy(floor: LegacyFloor | null | undefined): number {
  if (!floor || !floor.manpower || !Array.isArray(floor.manpower)) {
    return 0;
  }
  return (floor.manpower as LegacyManpowerEntry[]).reduce(
    // DPR-01 and DPR-02 both live on this line.
    (sum, mp) => sum + (parseInt(mp.count as string) || 0),
    0,
  );
}

/** Verbatim transcription of `calculateOverallManpower`. */
export function calculateOverallManpowerLegacy(
  dprData: LegacyDprData | null | undefined,
): number {
  if (!dprData || !dprData.floors || !Array.isArray(dprData.floors)) {
    return 0;
  }
  return (dprData.floors as LegacyFloor[]).reduce(
    (sum, floor) => sum + calculateFloorManpowerLegacy(floor),
    0,
  );
}
