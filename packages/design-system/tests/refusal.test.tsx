import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ApiError } from '@cog/contracts';
import { AbsentNotice, Empty, Refusal, UnreachableState } from '../src/index.js';

/**
 * What a person sees when the server says no.
 *
 * **A refusal that renders as an empty state is indistinguishable from
 * success.** Under row-level security a query with no tenant context returns
 * zero rows rather than erroring, so "the isolation layer refused this" and
 * "there is nothing here" arrive at the screen as the same shape. The legacy
 * renders a refusal, an unreachable API and an empty table identically — three
 * different situations, one blank panel, and no way to tell which one you are
 * looking at.
 *
 * Two properties, and the second is the one usually missing:
 *
 *   1. the reason is on the screen — the server's own message, its code, and
 *      the request id a support conversation starts from.
 *   2. it OFFERS NO ACTION. A refusal with a button invites a retry of
 *      something that was refused, and a retry that silently does nothing is
 *      how somebody concludes the save worked.
 */

const REFUSED = {
  code: 'FORBIDDEN',
  message: 'You do not hold approve_payment.',
  requestId: 'req_01HZX9',
} as const;

describe('a refusal renders its reason', () => {
  it('shows the server message, the code and the request id', () => {
    render(<Refusal error={REFUSED} />);

    // The server's own words, not a generic string. "refused while an order
    // references it" tells a person what to do next; "something went wrong"
    // does not.
    expect(screen.getByText(REFUSED.message)).toBeDefined();
    const { container } = render(<Refusal error={REFUSED} />);
    expect(container.textContent).toContain('FORBIDDEN');
    expect(container.textContent).toContain('req_01HZX9');
  });

  it('OFFERS NO ACTION', () => {
    const { container } = render(<Refusal error={REFUSED} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('is not mistakable for an empty state', () => {
    // The distinction this component exists to make. Rendered side by side,
    // the two must not read the same — so the refusal has to say something the
    // empty state does not.
    const refusal = render(<Refusal error={REFUSED} />).container.textContent ?? '';
    const empty = render(<Empty illustration="orders" title="No purchase orders" />).container.textContent ?? '';

    expect(refusal).not.toBe(empty);
    expect(refusal).toContain(REFUSED.requestId);
    expect(empty).not.toContain(REFUSED.requestId);
  });

  it('is announced as an alert', () => {
    render(<Refusal error={REFUSED} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('carries the code and request id behind "Copy details for support", not on the face of it', () => {
    // A disclosure, not a button — the affordance must add none of the four
    // elements the "OFFERS NO ACTION" test below rules out.
    render(<Refusal error={REFUSED} />);
    const summary = screen.getByText('Copy details for support');
    expect(summary.tagName).toBe('SUMMARY');
    expect(screen.getByText(REFUSED.code, { exact: false })).toBeDefined();
    expect(screen.getByText(REFUSED.requestId, { exact: false })).toBeDefined();
  });

  it('substitutes a known approval-refusal reason for the raw message', () => {
    // The six sentences from docs/design/13-decisions.html. `ErrorCode` has no
    // member equal to any of these — see the report — so this is exercised
    // with the same cast the "unrecognised code" test below uses; the title
    // falls to the default branch, which is expected here, not a bug.
    const selfApproval = {
      code: 'self-approval',
      message: 'raw message the sentence should replace',
      requestId: 'req_03',
    };
    render(<Refusal error={selfApproval as unknown as ApiError} />);

    expect(
      screen.getByText('You raised this order, so someone else needs to approve it.'),
    ).toBeDefined();
    expect(screen.queryByText(selfApproval.message)).toBeNull();
  });

  it('titles an unrecognised code rather than showing a bare code', () => {
    // A code this build has never heard of still has to produce a sentence.
    //
    // The cast is the point of the test, not a way around the type. `ApiError`'s
    // code union is closed, so `refusalTitle`'s `default:` branch is
    // unreachable by type and reachable in fact: this component renders a
    // response from a server that may be a version ahead. Asserting the branch
    // requires handing it a code the union does not contain.
    const fromTheFuture = { code: 'TEAPOT', message: 'No.', requestId: 'req_02' };
    const { container } = render(<Refusal error={fromTheFuture as unknown as ApiError} />);
    expect(container.textContent).toContain('The server could not answer');
  });
});

describe('unreachable is a different screen from refused', () => {
  // A refusal means the server answered. Unreachable means it did not, and
  // the difference decides whether a half-finished write might exist — so
  // the words say nothing was saved, and the one action is to try again
  // (`12-states.html`: the empty-state anatomy, the drawing, one primary).
  it('says the API is not reachable and nothing was saved', () => {
    const { container } = render(<UnreachableState />);
    expect(container.textContent).toContain('not reachable');
    expect(container.textContent).toContain('Nothing was saved');
  });

  it('offers one action, to try again, and the support copy as a tertiary link', () => {
    render(<UnreachableState retryHref="/x" />);
    expect(screen.getByRole('link', { name: /Try again/ }).getAttribute('href')).toBe('/x');
    expect(screen.getByRole('link', { name: /Copy details for support/ })).toBeDefined();
  });

  it('does not read the same as a refusal', () => {
    const unreachable = render(<UnreachableState />).container.textContent ?? '';
    const refusal = render(<Refusal error={REFUSED} />).container.textContent ?? '';
    expect(unreachable).not.toBe(refusal);
  });
});

describe('AbsentNotice is a passive note, not an alert', () => {
  it('renders its title and body, and is a note', () => {
    render(<AbsentNotice title="Figures withheld">A CA has not signed off this return.</AbsentNotice>);

    expect(screen.getByText('Figures withheld')).toBeDefined();
    expect(screen.getByText('A CA has not signed off this return.')).toBeDefined();
    expect(screen.getByRole('note')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
