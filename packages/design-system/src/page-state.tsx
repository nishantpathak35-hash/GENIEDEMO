import type { ReactNode } from 'react';
import type { ApiError } from '@cog/contracts';
import { Empty } from './empty.js';
import { Icon } from './sprite.js';
import { Refusal } from './ui.js';

/**
 * The whole-page answers, each an empty state on the published anatomy
 * (`docs/design/12-states-roles.html`, "Loading · not allowed · can't reach
 * us · not here · something went wrong"): the server could not be reached
 * (an unplugged cable, *Try again*), the record is not here (a signpost),
 * something went wrong (a warning triangle), signed out (a key), a project
 * you cannot open (the signpost, in the server's words). A REFUSAL inside a
 * screen stays a section message — `Refusal` — because the screen is still
 * there and the reason is what matters.
 *
 * Refused and not found are two states only where the API tells them apart:
 * `answer` reads the error's code, so a page passes what it got and draws the
 * state the server named — never a guess from an empty list.
 */

export function UnreachableState({ retryHref }: { retryHref?: string }): ReactNode {
  return (
    <Empty
      illustration="unreachable"
      title="We can’t reach Construct-O-Genie right now"
      size="narrow"
      action={
        <a className="btn primary" href={retryHref ?? '#'}>
          <Icon name="refresh" />
          Try again
        </a>
      }
      tertiaryAction={<a href="/notifications">Copy details for support</a>}
    >
      The API is not reachable. Nothing was saved. Check your connection and try again — your work on this page is still here.
    </Empty>
  );
}

export function NotFoundState({ what, backHref, backLabel }: { what: string; backHref: string; backLabel: string }): ReactNode {
  return (
    <Empty
      illustration="not-found"
      title={`${what} could not be found`}
      size="narrow"
      action={
        <a className="btn primary" href={backHref}>
          {backLabel}
        </a>
      }
    >
      The link may be old, or the record may have been removed. Nothing here is hidden from you on purpose — a thing you may not see is refused by name.
    </Empty>
  );
}

export function ErrorState({ requestId }: { requestId?: string }): ReactNode {
  return (
    <Empty
      illustration="error"
      title="Something went wrong on our side"
      size="narrow"
      action={
        <a className="btn primary" href="#">
          <Icon name="refresh" />
          Try again
        </a>
      }
      tertiaryAction={requestId === undefined ? undefined : <span className="muted">request {requestId}</span>}
    >
      Nothing was saved. Trying again brings back the same page; if it happens twice, copy the request id for support.
    </Empty>
  );
}

export function SignedOutState({ signInHref }: { signInHref: string }): ReactNode {
  return (
    <Empty
      illustration="signed-out"
      title="You’re signed out"
      size="narrow"
      action={
        <a className="btn primary" href={signInHref}>
          Sign in
        </a>
      }
    >
      Sign in again to carry on where you were — the address is kept.
    </Empty>
  );
}

/**
 * A read's failure as the state it is. `NOT_FOUND` draws not here (a module
 * the tenant never switched on answers the same, on purpose — the server does
 * not tell them apart, so neither does this); anything else the server refused
 * stays the section message with its reason; the transport failing draws
 * unreachable.
 */
export function answer(
  failure: { readonly kind: 'refused'; readonly error: ApiError } | { readonly kind: 'unreachable' },
  notFound: { readonly what: string; readonly backHref: string; readonly backLabel: string },
): ReactNode {
  if (failure.kind === 'unreachable') return <UnreachableState />;
  if (failure.error.code === 'NOT_FOUND') return <NotFoundState {...notFound} />;
  return <Refusal error={failure.error} />;
}
