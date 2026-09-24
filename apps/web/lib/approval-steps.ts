import type { Step } from '@cog/design-system';

/**
 * An order's approval steps as the stepper draws them — done, now, later —
 * from the chain the tenant configured, the decisions recorded on the order,
 * and where the queue says it waits. The full order page and the record pane
 * beside the list draw the same steps from the same three reads, so the
 * rule lives once.
 */
export interface ChainLike {
  readonly stages: ReadonlyArray<{ readonly name: string; readonly sequence: number; readonly minApprovals: number }>;
}
export interface DecisionLike {
  readonly stageName: string;
  readonly approverId: string;
  readonly occurredAt: string;
}
export interface WaitingLike {
  readonly stageName: string;
  readonly approverRole: string;
  readonly days: number;
}

export function orderSteps(
  chain: ChainLike | null,
  decisions: readonly DecisionLike[],
  waiting: WaitingLike | null,
  approverLabel: (id: string) => string,
  /** The order's own state: an approved order's every step is behind it, whether or not a decision was recorded at each. */
  state?: string,
): readonly Step[] | null {
  if (chain === null) return null;
  return [...chain.stages]
    .sort((a, b) => a.sequence - b.sequence)
    .map((stage) => {
      const atStage = decisions.filter((d) => d.stageName === stage.name);
      if (state === 'approved' && atStage.length === 0) return { label: stage.name, state: 'done' as const, note: 'Approved' };
      if (atStage.length >= stage.minApprovals) {
        const last = atStage[atStage.length - 1];
        return {
          label: stage.name,
          state: 'done' as const,
          ...(last === undefined ? {} : { note: `${approverLabel(last.approverId)} · ${last.occurredAt}` }),
        };
      }
      if (waiting !== null && waiting.stageName === stage.name) {
        return {
          label: stage.name,
          state: 'now' as const,
          note: `Waiting for ${waiting.approverRole} · ${String(waiting.days)} ${waiting.days === 1 ? 'day' : 'days'}`,
        };
      }
      return { label: stage.name, state: 'later' as const, note: 'Not reached yet' };
    });
}
