import type { ReactNode } from 'react';

/**
 * Leads — the same pipeline, two ways of looking at it.
 *
 * The repaired legacy tree ships both (`CrmTableView.js`, `CrmKanbanView.js`)
 * and the reason is not taste: a table is how somebody finds one lead, and a
 * board is how somebody sees that eleven of them are stuck at the same stage.
 * Neither answers the other's question.
 *
 * **The board does not drag.** Moving a card between columns is a stage change,
 * a stage change is an edit under an optimistic lock, and a drag that silently
 * loses to a concurrent edit is worse than a form that says so. The card links
 * to the lead, where the change is made and recorded.
 *
 * The two tabs — Pipeline, Leads — are the Sales destination's, drawn by the
 * shell from `lib/routes.ts` like every other grouping destination's; this
 * layout keeps the note and nothing else.
 */
export default function CrmLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
