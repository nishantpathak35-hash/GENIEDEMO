import type { ReactNode } from 'react';
import {
  DUOTONE_FOR_ICON,
  DUOTONE_NAMES,
  DrawingSymbols,
  ICON_NAMES,
  ILLUSTRATION_CAPTION,
  ILLUSTRATION_FOR,
  ILLUSTRATION_NAMES,
  ILLUSTRATION_SUBJECTS,
  type DuotoneName,
  type IconName,
  type IllustrationName,
  type IllustrationSubject,
} from './drawings.js';

/**
 * The drawings, held once — three styles and never a fourth
 * (`docs/design/00-foundations.html`, the drawing system):
 *
 *   - **monoline** (`i-*`, 16 × 16, a 1.5px stroke, square caps): every icon
 *     in navigation and controls, `currentColor`-tinted, never a fixed colour;
 *   - **duotone** (`d-*`, 24 × 24, one line over one flat block): the icon on
 *     a stat's disc, a figure or money card's, a settings hub card's;
 *   - **the spot illustration** (`illo-*`, 160 × 160): one drawing per
 *     empty-state subject, flat blocks of the accent tokens under one
 *     hand-drawn line, decorative.
 *
 * Every symbol is this product's own, drawn in `docs/design/build/` and
 * brought here by `scripts/import-drawings.mjs` into `drawings.tsx`; nothing
 * of the published design system's drawings, icons, logos or typeface is
 * used. `Sprite` renders the symbols inside one hidden `<svg>` — an app
 * mounts it once, in its root layout body, because two copies in one
 * document would collide on every `id`. `Icon`, `Duotone` and
 * `Illustration` only ever reference a symbol by name, so a name that is not
 * drawn is a type error, not a blank at runtime.
 */
export { ICON_NAMES, DUOTONE_NAMES, ILLUSTRATION_NAMES, ILLUSTRATION_SUBJECTS, ILLUSTRATION_FOR, ILLUSTRATION_CAPTION, DUOTONE_FOR_ICON };
export type { IconName, DuotoneName, IllustrationName, IllustrationSubject };

/**
 * The hidden symbol table. Render once, in the root layout, and nowhere else.
 *
 * Not a `useEffect`-mounted portal and not deduplicated at runtime — a second
 * `<Sprite />` on the page is a bug the first render should already have made
 * obvious (every `id` collides), so this stays a plain function with no state
 * to get out of sync.
 */
export function Sprite(): ReactNode {
  return (
    <svg className="sprite" aria-hidden="true" focusable="false" width="0" height="0">
      <DrawingSymbols />
    </svg>
  );
}

/**
 * One icon, `currentColor`-tinted, never a fixed colour of its own.
 *
 * Decorative by default (`aria-hidden`, matching the icons this design pairs
 * with visible text everywhere else) — `label` is for the rare icon that
 * carries meaning on its own, in which case the wrapper announces as an image
 * rather than staying silent. An icon-only *button* still names itself on the
 * button, per the design (`aria-label` on `.bell`, not here); `label` is for an
 * `Icon` that is not inside one.
 */
export function Icon({ name, size, label, bare }: { name: IconName; size?: 'sm'; label?: string; bare?: boolean }): ReactNode {
  const svg = (
    <svg className={size === 'sm' ? 'i sm' : 'i'} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
  // `bare` draws the svg with no `.ico` wrapper, for the controls whose own
  // colour the design gives to the svg directly — the pill's + is one.
  if (bare === true && label === undefined) return svg;
  return (
    <span className="ico" {...(label === undefined ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label })}>
      {svg}
    </span>
  );
}

/**
 * A duotone icon, on a disc: one hand-drawn line in the disc's icon colour
 * over one flat block in the disc's subtler step (`--duo-block`, set by the
 * disc's hue class). Decorative — the disc's card names the figure.
 */
export function Duotone({ name }: { name: DuotoneName }): ReactNode {
  return (
    <svg className="duo" aria-hidden="true" focusable="false">
      <use href={`#d-${name}`} />
    </svg>
  );
}

/** The duotone that does a monoline icon's job on a disc, for a caller that names the icon. */
export function duotoneFor(icon: IconName | DuotoneName): DuotoneName {
  if ((DUOTONE_NAMES as readonly string[]).includes(icon)) return icon as DuotoneName;
  return (DUOTONE_FOR_ICON as Readonly<Record<string, DuotoneName>>)[icon] ?? 'count';
}

/**
 * One illustration, always `aria-hidden` — it is decoration beside a title
 * that already says what the empty state or the notice means, never the only
 * carrier of the meaning. Named by the empty state's name; the subject it
 * draws is `ILLUSTRATION_FOR[name]` (one drawing per subject), and
 * `data-subject` says which so a gate can read it. Sizing is contextual
 * (`.empty > .illo`), which is why this takes no `size` prop of its own.
 */
export function Illustration({ name }: { name: IllustrationName }): ReactNode {
  const subject = ILLUSTRATION_FOR[name];
  return (
    <svg className="illo" viewBox="0 0 160 160" aria-hidden="true" focusable="false" data-subject={subject}>
      <use href={`#illo-${subject}`} />
    </svg>
  );
}
