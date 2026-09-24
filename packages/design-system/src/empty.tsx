import type { ReactNode } from 'react';
import { Illustration, type IllustrationName } from './sprite.js';

/**
 * A screen with nothing on it yet, said once, the same way everywhere — the
 * published empty state (`docs/design/12-states-roles.html`): an image, a
 * heading, one description of one or two sentences, the secondary action
 * before the primary, a link under them; wide or narrow.
 *
 * The image is decorative (`aria-hidden`) and the heading and description
 * carry the meaning. The design's gate rule is carried into the type: one
 * illustration (this component chooses it, the caller only names which), at
 * most two buttons with the primary last, at most one link. It is also the
 * shape of every whole-page answer — unreachable, not found, gone wrong,
 * signed out, a project you cannot open (`PageState`).
 *
 * `variant: 'filtered'` is a list a filter matched nothing against — not the
 * same screen as a list nobody has populated yet: the magnifier, the narrow
 * size, and the caller's sentence naming what was filtered on.
 */
export function Empty({
  illustration,
  title,
  children,
  action,
  secondaryAction,
  tertiaryAction,
  variant,
  size,
}: {
  illustration: IllustrationName;
  title: string;
  /** One or two sentences. */
  children?: ReactNode;
  /** The primary action, last. */
  action?: ReactNode;
  /** The secondary action, before the primary. */
  secondaryAction?: ReactNode;
  /** One link under the buttons. */
  tertiaryAction?: ReactNode;
  variant?: 'new' | 'filtered';
  size?: 'wide' | 'narrow';
}): ReactNode {
  const narrow = size === 'narrow' || variant === 'filtered';
  return (
    <div className={`empty${narrow ? ' narrow' : ''}${variant === 'filtered' ? ' filtered' : ''}`}>
      <Illustration name={variant === 'filtered' ? 'search' : illustration} />
      <b className="es-h">{title}</b>
      {children === undefined ? null : <p>{children}</p>}
      {action === undefined && secondaryAction === undefined ? null : (
        <div className="actions">
          {secondaryAction}
          {action}
        </div>
      )}
      {tertiaryAction === undefined ? null : <p className="es-t">{tertiaryAction}</p>}
    </div>
  );
}
