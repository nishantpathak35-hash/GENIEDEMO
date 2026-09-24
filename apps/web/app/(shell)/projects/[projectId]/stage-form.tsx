'use client';

import type { ReactNode } from 'react';
import { Form } from '@cog/design-system';
import { moveProject } from '../actions';
import { projectMoveLabel } from '../vocabulary';

/**
 * One form per move the server offered. `project.moves` is the server's
 * rule; this renders exactly those and decides nothing. A final state offers
 * nothing, and says so where the buttons would be.
 */
export function StageForms({
  projectId,
  moves,
}: {
  projectId: string;
  moves: readonly string[];
}): ReactNode {
  if (moves.length === 0) {
    return <p className="hint u-m0">This project is in a final state; nothing moves it.</p>;
  }
  return (
    <div className="stack">
      {moves.map((state) => (
        <Form
          key={state}
          action={moveProject.bind(null, projectId)}
          submitLabel={projectMoveLabel(state)}
          pendingLabel="Moving…"
        >
          <input type="hidden" name="state" value={state} />
        </Form>
      ))}
    </div>
  );
}
