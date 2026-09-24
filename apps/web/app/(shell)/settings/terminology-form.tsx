'use client';

import type { ReactNode } from 'react';
import { TERM_PAIRS, type Terminology } from '@cog/design-system';
import { Form } from '@cog/design-system';
import { saveTerminology } from './actions';

/**
 * Four pairs, one radio group each (`build/pages/site-to-demo.mjs`
 * terminology): the pair's question, its two words, and why the two exist.
 * The current word is checked; Save posts all four.
 */
export function TerminologyForm({ current }: { current: Terminology }): ReactNode {
  return (
    <Form action={saveTerminology} submitLabel="Save" pendingLabel="Saving…">
      {TERM_PAIRS.map((pair) => (
        <div className="term-row" role="radiogroup" aria-labelledby={`term-${pair.key}`} key={pair.key}>
          <p className="term-l" id={`term-${pair.key}`}>
            {pair.what}
          </p>
          <div className="term-opts">
            {pair.options.map((word) => (
              <label className="radio" key={word}>
                <span className="ico">
                  <input type="radio" name={pair.key} value={word} defaultChecked={current[pair.key] === word} />
                </span>
                <span>{word}</span>
              </label>
            ))}
          </div>
          <p className="hint">{pair.note}</p>
        </div>
      ))}
    </Form>
  );
}
