'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Drawer } from '@cog/design-system';
import { HandoverForm } from './forms';

/**
 * "Hand over to delivery", as a drawer.
 *
 * A client wrapper around the existing `handoverLead` form — the two
 * confirmations it submits (`z.literal(true)`, `projects.ts:875`) are
 * unchanged; this only moves the trigger and the form into a drawer, as
 * `docs/design/05-sales.html` draws it.
 */
export function HandoverDrawer({
  leadId,
  version,
  clientName,
  sub,
  facts = [],
}: {
  leadId: string;
  version: number;
  clientName: string;
  sub?: string;
  /** The lead as it stands — stage, value, scope, owner — above the form (`05-sales.html`, the handover drawer). */
  facts?: ReadonlyArray<readonly [string, ReactNode]>;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        Hand over to delivery
      </button>
      <Drawer title={clientName} {...(sub === undefined ? {} : { sub })} open={open} onClose={() => setOpen(false)}>
        {facts.length === 0 ? null : (
          <dl className="kv">
            {facts.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        <p className="u-strong">Hand over to delivery</p>
        <p className="muted">
          Creates the project with the code and contract value below, and moves this lead to Won. The sales history stays on the project — one statement, so there is no state where the
          project exists and the opportunity does not know about it.
        </p>
        <HandoverForm leadId={leadId} version={version} clientName={clientName} />
      </Drawer>
    </>
  );
}
