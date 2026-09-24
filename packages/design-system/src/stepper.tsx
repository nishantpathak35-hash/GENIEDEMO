import type { ReactNode } from 'react';
import { Icon } from './sprite.js';

export interface Step {
  readonly label: string;
  readonly note?: string;
  readonly state: 'done' | 'now' | 'later';
}

/**
 * An approval chain, drawn as a chain rather than collapsed to a pill.
 *
 * The shipped kit renders approval state as a single `Pill` and loses the
 * shape of it — a chain of five steps and a chain of two look identical from
 * "Waiting for approval". `aria-current="step"` marks the one in progress;
 * "done" and "later" are told apart by fill, not by a colour alone, since the
 * step number itself changes to a tick.
 */
export function Stepper({ steps }: { steps: readonly Step[] }): ReactNode {
  return (
    <ol className="stepper">
      {steps.map((step, index) => (
        <li
          key={step.label}
          {...(step.state === 'done' ? { className: 'done' } : {})}
          {...(step.state === 'now' ? { 'aria-current': 'step' as const } : {})}
        >
          <span className="stepno" aria-hidden="true">
            {step.state === 'done' ? '✓' : index + 1}
          </span>
          <span>
            <b>{step.label}</b>
            {step.note === undefined ? null : <small>{step.note}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The same steps, stacked — the pane's form (`build/shell.mjs` `steps`): a
 * tick per step, the name, and under it who did it and when, who it waits
 * for, or "Not reached yet".
 */
export function Steps({ steps }: { steps: readonly Step[] }): ReactNode {
  return (
    <ol className="steps">
      {steps.map((step) => (
        <li key={step.label} className={step.state}>
          <span className="tick" aria-hidden="true">
            {step.state === 'done' ? <Icon name="check" size="sm" /> : null}
          </span>
          <div>
            {step.label}
            {step.note === undefined ? null : <small>{step.note}</small>}
          </div>
        </li>
      ))}
    </ol>
  );
}
