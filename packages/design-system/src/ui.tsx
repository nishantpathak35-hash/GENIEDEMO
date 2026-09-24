import type { ReactNode } from 'react';
import { formatIndianRupees, formatIndianRupeesOrDash } from '@cog/money';
import type { ApiError } from '@cog/contracts';

export type NoticeTone = 'neutral' | 'info' | 'warn' | 'bad';

/**
 * An inline message in four tones, with an icon slot.
 *
 * The general form of `.notice`, which existed in `styles.css` with no
 * component in front of it. `Refusal` and `AbsentNotice` are
 * two specific instances — re-expressed on top of this below, with their
 * existing props and words unchanged, so no call site moves.
 *
 * `role` follows the design's own convention, not a guess: `bad` samples in
 * the design carry `role="alert"` throughout; every `warn` and `info` sample
 * carries `role="note"`. `neutral` gets the same passive role — nothing in
 * this package's neutral notices (a form's success message) is urgent enough
 * to interrupt a screen reader.
 *
 * Caution (`warn`) is a FILL carrying ink, never a border or a stroke on a
 * plain panel — see `styles.css`'s comment on the point; this component does
 * not let a caller choose otherwise.
 */
export function Notice({
  tone,
  title,
  children,
  actions,
  icon,
}: {
  tone: NoticeTone;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Decorative; the icon component itself is responsible for `aria-hidden`. */
  icon?: ReactNode;
}): ReactNode {
  return (
    <div className={tone === 'neutral' ? 'notice' : `notice ${tone}`} role={tone === 'bad' ? 'alert' : 'note'}>
      {icon === undefined ? null : <span className="ico">{icon}</span>}
      <div>
        {title === undefined ? null : <strong className="t">{title}</strong>}
        <p>{children}</p>
        {actions === undefined ? null : <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A refusal, rendered as itself.
 *
 * **Not as an empty list.** Under row-level security a query with no tenant
 * context returns zero rows rather than erroring, so "the isolation layer
 * refused this" and "there is no data" are otherwise the same screen. The error
 * code and the request id are both shown because they are what a support
 * conversation starts from — behind a disclosure now, rather than always on
 * the screen, so the sentence a person needs first is what they read first.
 */
export function Refusal({ error }: { error: ApiError }): ReactNode {
  return (
    <Notice
      tone="bad"
      title={refusalTitle(error.code)}
      actions={
        <details>
          <summary>Copy details for support</summary>
          <p className="muted">
            <code>
              {error.code} · request {error.requestId}
            </code>
          </p>
        </details>
      }
    >
      {reasonSentence(error.code) ?? error.message}
    </Notice>
  );
}

function refusalTitle(code: string): string {
  switch (code) {
    case 'TENANT_NOT_RESOLVED':
      return 'No organisation could be determined for this request';
    case 'FORBIDDEN':
      return 'Refused';
    case 'NOT_FOUND':
      return 'Not here';
    case 'CONFLICT':
      return 'That cannot be done in this state';
    case 'VALIDATION_FAILED':
      return 'The request was not accepted';
    default:
      return 'The server could not answer';
  }
}

/**
 * The six approval-refusal reasons as sentences — `docs/design/13-decisions.html`,
 * "Refusal reasons become sentences".
 *
 * **Nothing wires this up to a live response yet.** `ErrorCode` in
 * `packages/contracts` has no member matching any of these six strings: a
 * self-approval refusal answers as `FORBIDDEN` today, with the reason (if it
 * exists at all) travelling somewhere this type does not expose — see the
 * report for what was found. This is exported and read by `Refusal` off
 * `error.code` regardless, so the day a real carrier exists, wiring it in is a
 * one-line change at the call site rather than a new component.
 */
const REASON_SENTENCES: Readonly<Record<string, string>> = {
  'self-approval': 'You raised this order, so someone else needs to approve it.',
  'not-entitled': "Your role can't approve at this stage. Ask an administrator if that should change.",
  'already-approved-this-stage': "You've already approved this stage. It's waiting on someone else now.",
  'chain-complete': 'This order is fully approved. Nothing more to decide.',
  'unknown-stage': "This order's approval steps have changed. Reload to see where it is now.",
  'above-ceiling':
    "This amount is above what this step can approve, and there's no higher step set up. Ask an administrator to add one.",
};

/** A reason code from the approval chain, as the sentence the design gives it — or `undefined`. */
export function reasonSentence(code: string): string | undefined {
  return REASON_SENTENCES[code];
}


/**
 * A figure the server computed, and the only thing an app does with money.
 *
 * `null` renders as an absence, never as zero — several server figures are
 * nullable on purpose (a takeoff total when an item is uncosted, a contract
 * value nobody has entered) and `₹0.00` in that slot is a claim.
 */
export function Money({ wire }: { wire: string | null }): ReactNode {
  return <span className="num">{formatIndianRupeesOrDash(wire)}</span>;
}

/** The same, when the value is known to be present. */
export function MoneyExact({ wire }: { wire: string }): ReactNode {
  return <span className="num">{formatIndianRupees(wire)}</span>;
}

export type PillTone = 'ok' | 'warn' | 'bad' | 'waiting' | 'active' | 'idle';

/**
 * A status pill. `waiting` (violet) is "waiting on a named person" — not a
 * problem, a fact about whose desk it is on; `active` (neutral fill, leading
 * dot) is "in progress", the most common and least informative state in the
 * product, deliberately spending no colour on it. There is no `info` tone —
 * the brand may not stand in for a status.
 */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }): ReactNode {
  return <span className={tone === 'idle' ? 'pill' : `pill ${tone}`}>{children}</span>;
}

/**
 * A figure that is ABSENT rather than zero, with the reason.
 *
 * DASH-01 is what this exists to prevent: the legacy dashboard reads three keys
 * the server does not send, `Number(undefined)` is falsy, and the fallback
 * quietly renders a computed number in a slot the reader takes for a reported
 * one. An absent figure has to look absent.
 */
export function Absent({ why }: { why: string }): ReactNode {
  return (
    <span className="muted" title={why}>
      —
    </span>
  );
}

export function AbsentNotice({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <Notice tone="warn" title={title}>
      {children}
    </Notice>
  );
}
