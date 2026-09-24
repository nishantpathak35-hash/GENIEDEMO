/**
 * The layout detector — what the eye sees, measured.
 *
 * Every function here runs INSIDE the page (`page.evaluate`), so each is
 * self-contained: no import is used inside one, and the arguments come in as
 * one plain object. `design-gates.spec.ts` calls them over every screen at
 * every width, and `RULES` names what each measures. A fault is a sentence
 * naming the element, so a reader can find it without the screenshot.
 *
 * The old gate measured `document.documentElement.scrollWidth` and passed
 * while the bar overflowed its own 48px row: a flex row's overflowing children
 * never move the document's scroll width when the row clips or the children
 * are clipped by the next box. So rule (a) asks EVERY element, and rule (b)
 * asks where the visible boxes actually are.
 */

export const RULES = {
  a: 'horizontal overflow — the document, or an element whose content spills sideways under overflow visible or clip',
  b: 'a visible box beyond the viewport — right past the window, left past zero, or below the fold inside a fixed box',
  c: 'sibling overlap — two in-flow children of one flex or grid parent whose boxes intersect by more than 2px',
  d: 'clipped text — an element hides its overflow without an ellipsis',
  e: 'a box whose content is taller than it, with no scroll',
  f: 'a tap target under the touch size',
  g: 'a focus ring outside the viewport or clipped by an ancestor',
  h: 'a popover under something else at its centre',
  i: 'two sticky or fixed boxes overlapping, or the shell leaving the screen — scrolled, the bar’s top is 0 and the sidebar’s 48, and the sidebar’s own scroll never moves the page',
  j: 'a scroll trap — overflow-y auto with a max-height and no overscroll-behavior: contain (static, over the stylesheet)',
  k: 'the content’s left edge or width differs from the ladder’s arithmetic for this width',
} as const;
export type Rule = keyof typeof RULES;
/** The rules the browser measures per screen (j is static, g and h have their own passes). */
export const SCREEN_RULES = ['a', 'b', 'c', 'd', 'e', 'f', 'i', 'k'] as const;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LayoutArgs {
  /** The content's expected padding edge — left from the window's edge, and the gutter on the right; null skips rule k. */
  edge: { left: number; right: number; selector: string } | null;
  /** The touch size every control must reach at this width; null skips rule f. */
  touch: number | null;
}

export interface LayoutResult {
  faults: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'k', string[]>;
  /** The content box actually measured, for the report's left-edge table. */
  content: { left: number; width: number } | null;
}

/** Rules a–f and k over the page as it stands. */
export function measureLayout({ edge, touch }: LayoutArgs): LayoutResult {
  const faults: LayoutResult['faults'] = { a: [], b: [], c: [], d: [], e: [], f: [], k: [] };
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const label = (el: Element): string => {
    const cls = [...el.classList].slice(0, 3).join('.');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls === '' ? '' : `.${cls}`}${text === '' ? '' : ` “${text}”`}`;
  };
  const px = (v: string): number => Number.parseFloat(v) || 0;
  const rectOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const cross = (a: Box, b: Box): Box => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });
  const empty = (b: Box): boolean => b.right - b.left <= 0 || b.bottom - b.top <= 0;
  /** The part of an element a person can see: its box cut by every ancestor that clips. */
  const visibleBox = (el: Element): Box => {
    let box = rectOf(el);
    for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const clipsX = cs.overflowX !== 'visible';
      const clipsY = cs.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const r = p.getBoundingClientRect();
      const inner: Box = {
        left: r.left + px(cs.borderLeftWidth),
        top: r.top + px(cs.borderTopWidth),
        right: r.right - px(cs.borderRightWidth) - (clipsY ? p.offsetWidth - p.clientWidth - px(cs.borderLeftWidth) - px(cs.borderRightWidth) : 0),
        bottom: r.bottom - px(cs.borderBottomWidth),
      };
      box = {
        left: clipsX ? Math.max(box.left, inner.left) : box.left,
        right: clipsX ? Math.min(box.right, inner.right) : box.right,
        top: clipsY ? Math.max(box.top, inner.top) : box.top,
        bottom: clipsY ? Math.min(box.bottom, inner.bottom) : box.bottom,
      };
    }
    return box;
  };
  const inFixed = (el: Element): boolean => {
    for (let p: Element | null = el; p !== null; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true;
    return false;
  };
  const FORM = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'OPTION']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'BR', 'WBR']);
  // a chart's marks overhang their track by design — a threshold line, a rotated point, a figure
  // set tight on its line; the chart gates measure those
  const CHART = '.chart, .spark, .meter, .hbar, .owe, .figbox';
  // a mark's own track: a threshold line, a rotated point, a band at 100% overhang it by design, and the
  // chart gates measure those. The chart AROUND them is measured here like anything else.
  const MARK = '.meter, .spark, .hbar, .plot, .owe-bar, .bar, .track';
  /** Rendered and visible — a closed details' content has a box in Chromium but is not shown. */
  const shownAtAll = (el: Element): boolean => el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
  /** A popover inside a closed details keeps the box it will open with; where it would open is measured now. */
  const closedPopover = (el: Element): boolean => {
    const p = el.parentElement;
    return p !== null && p.tagName === 'DETAILS' && !(p as HTMLDetailsElement).open && el.tagName !== 'SUMMARY';
  };

  // (a) the document
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) faults.a.push(`the document scrolls sideways by ${String(doc.scrollWidth - doc.clientWidth)}px`);

  const seen: Array<{ el: HTMLElement; cs: CSSStyleDeclaration; box: Box; shown: Box }> = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!(el instanceof HTMLElement) || SKIP.has(el.tagName) || el.closest('[data-detector-ignore]') !== null) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'contents') continue;
    const box = rectOf(el);
    if (!shownAtAll(el)) {
      // closed, but the box it opens with is laid out: a menu that would open past the window is a fault
      // now — unless it carries a try fallback, which the browser applies when it opens, not before
      const flips = cs.getPropertyValue('position-try-fallbacks') !== 'none' && cs.getPropertyValue('position-try-fallbacks') !== '';
      if (!flips && closedPopover(el) && box.right - box.left > 0) {
        if (box.right > vw + 0.5) faults.b.push(`${label(el)} (closed) would open ${String(Math.round(box.right - vw))}px past the window's right edge`);
        if (box.left < -0.5) faults.b.push(`${label(el)} (closed) would open ${String(Math.round(-box.left))}px left of the window`);
      }
      continue;
    }
    // a 1px box is a screen-reader-only line, clipped by design
    if (box.right - box.left <= 1 || box.bottom - box.top <= 1) continue;
    const shown = visibleBox(el);
    if (empty(shown)) continue; // clipped away entirely — a column scrolled out of a table wrap, a closed sheet
    seen.push({ el, cs, box, shown });
    const inChart = el.closest(CHART) !== null;

    const blockLike = cs.display !== 'inline';
    // (a) an element whose content spills sideways while nothing scrolls or clips it
    if (blockLike && !FORM.has(el.tagName) && !el.matches(MARK) && (cs.overflowX === 'visible' || cs.overflowX === 'clip') && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
      faults.a.push(`${label(el)} spills ${String(el.scrollWidth - el.clientWidth)}px sideways`);
    }
    // (b) a visible box beyond the window
    if (shown.right > vw + 0.5) faults.b.push(`${label(el)} reaches ${String(Math.round(shown.right - vw))}px past the window's right edge`);
    if (shown.left < -0.5) faults.b.push(`${label(el)} starts ${String(Math.round(-shown.left))}px left of the window`);
    if (shown.bottom > vh + 0.5 && inFixed(el) && cs.position !== 'fixed') {
      faults.b.push(`${label(el)} sits ${String(Math.round(shown.bottom - vh))}px below the fold inside a fixed box`);
    }
    // (d) clipped without an ellipsis
    if (!inChart && blockLike && !FORM.has(el.tagName) && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
      faults.d.push(`${label(el)} clips ${String(el.scrollWidth - el.clientWidth)}px of its content with no ellipsis`);
    }
    // (e) content taller than its box — only where a height was given: a page that scrolls is not a fault,
    // and `min-height` is a floor, not a ceiling
    const capped = cs.height !== 'auto' || cs.maxHeight !== 'none';
    if (capped && !inChart && blockLike && !FORM.has(el.tagName) && (cs.overflowY === 'visible' || cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2) {
      faults.e.push(`${label(el)} holds ${String(el.scrollHeight - el.clientHeight)}px more than its height`);
    }
    // (c) in-flow siblings of a flex or grid parent overlapping
    if (cs.display === 'flex' || cs.display === 'inline-flex' || cs.display === 'grid' || cs.display === 'inline-grid') {
      const kids = [...el.children].filter((k): k is HTMLElement => {
        if (!(k instanceof HTMLElement)) return false;
        const kc = getComputedStyle(k);
        return kc.display !== 'none' && kc.position !== 'absolute' && kc.position !== 'fixed' && k.getBoundingClientRect().width > 0 && k.getBoundingClientRect().height > 0;
      });
      for (let i = 0; i < kids.length; i += 1) {
        for (let j = i + 1; j < kids.length; j += 1) {
          const a = kids[i] as HTMLElement;
          const b = kids[j] as HTMLElement;
          const x = cross(rectOf(a), rectOf(b));
          if (x.right - x.left > 2 && x.bottom - x.top > 2) {
            faults.c.push(`${label(a)} and ${label(b)} overlap by ${String(Math.round(x.right - x.left))}×${String(Math.round(x.bottom - x.top))}px inside ${label(el)}`);
          }
        }
      }
    }
  }
  // (f) tap targets: every control that is a box of its own; a link inside a sentence is the sentence's
  if (touch !== null) {
    const controls = document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [tabindex]:not([tabindex="-1"])');
    for (const el of controls) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'inline' || !shownAtAll(el) || el.closest('[data-detector-ignore]') !== null) continue;
      if (el.tagName === 'INPUT' && (el.getAttribute('type') === 'hidden')) continue;
      // a checkbox or a radio is tapped on its row or its cell; that is the target
      const target = (el.tagName === 'INPUT' && (el.getAttribute('type') === 'checkbox' || el.getAttribute('type') === 'radio')) ? (el.closest('label, td, th') ?? el) : el;
      const shown = visibleBox(target);
      // off the screen — the skip link parked above the window — is not a target yet
      if (empty(shown) || shown.bottom <= 0 || shown.top >= vh || shown.right <= 0 || shown.left >= vw) continue;
      const w = shown.right - shown.left;
      const h = shown.bottom - shown.top;
      if (w < touch - 0.5 || h < touch - 0.5) faults.f.push(`${label(el)} is ${String(Math.round(w))}×${String(Math.round(h))}px, under ${String(touch)}`);
    }
  }
  // (k) the content's edge and width, against the ladder's arithmetic
  let content: LayoutResult['content'] = null;
  if (edge !== null) {
    const el = document.querySelector<HTMLElement>(edge.selector);
    if (el === null) faults.k.push(`no ${edge.selector} on the page`);
    else {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const left = r.left + px(cs.paddingLeft);
      const width = r.width - px(cs.paddingLeft) - px(cs.paddingRight);
      content = { left, width };
      if (Math.abs(left - edge.left) > 1) faults.k.push(`content starts at ${String(Math.round(left))}px, the ladder says ${String(edge.left)}`);
      const want = vw - edge.left - edge.right;
      if (Math.abs(width - want) > 1) faults.k.push(`content is ${String(Math.round(width))}px wide, the ladder says ${String(want)}`);
    }
  }
  void seen;
  return { faults, content };
}

/** Rule (i), after the page is scrolled: sticky and fixed boxes that overlap one another. */
export function measureSticky(): string[] {
  const faults: string[] = [];
  const label = (el: Element): string => `${el.tagName.toLowerCase()}${el.classList.length === 0 ? '' : `.${[...el.classList].slice(0, 3).join('.')}`}`;
  const px = (v: string): number => Number.parseFloat(v) || 0;
  // what a person sees of it: the box cut by every ancestor that clips. A sticky `th` in a table wider
  // than its scroll has a layout box outside that scroll, and a box nobody sees overlaps nothing.
  const seenBox = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    let box: Box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const clipsX = cs.overflowX !== 'visible';
      const clipsY = cs.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const b = p.getBoundingClientRect();
      const inner = { left: b.left + px(cs.borderLeftWidth), top: b.top + px(cs.borderTopWidth) };
      box = {
        left: clipsX ? Math.max(box.left, inner.left) : box.left,
        right: clipsX ? Math.min(box.right, inner.left + p.clientWidth) : box.right,
        top: clipsY ? Math.max(box.top, inner.top) : box.top,
        bottom: clipsY ? Math.min(box.bottom, inner.top + p.clientHeight) : box.bottom,
      };
    }
    return box;
  };
  // A sticky box counts only while it HOLDS its line against the window. One whose container has ended is
  // leaving with that container — a record pane at the end of its list — and one inside a box that scrolls
  // or clips holds to that box, not to the window — a table's head in a sideways scroll. Both move as
  // ordinary content does, under the bar, and are not two layers fighting for one place.
  const clippedAbove = (el: Element): boolean => {
    for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
    }
    return false;
  };
  const holds = (el: Element, cs: CSSStyleDeclaration): boolean => {
    if (cs.position === 'fixed') return true;
    if (clippedAbove(el)) return false;
    const r = el.getBoundingClientRect();
    const top = cs.top === 'auto' ? null : px(cs.top);
    const bottom = cs.bottom === 'auto' ? null : px(cs.bottom);
    return (top !== null && Math.abs(r.top - top) <= 1) || (bottom !== null && Math.abs(window.innerHeight - r.bottom - bottom) <= 1);
  };
  const stuck: Array<{ el: Element; r: Box }> = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!(el instanceof HTMLElement) || el.closest('[data-detector-ignore]') !== null) continue;
    const cs = getComputedStyle(el);
    if ((cs.position !== 'sticky' && cs.position !== 'fixed') || !el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
    if (!holds(el, cs)) continue;
    const r = seenBox(el);
    if (r.right - r.left <= 0 || r.bottom - r.top <= 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
    stuck.push({ el, r });
  }
  for (let i = 0; i < stuck.length; i += 1) {
    for (let j = i + 1; j < stuck.length; j += 1) {
      const a = stuck[i] as { el: Element; r: Box };
      const b = stuck[j] as { el: Element; r: Box };
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) faults.push(`${label(a.el)} and ${label(b.el)} overlap by ${String(Math.round(w))}×${String(Math.round(h))}px`);
    }
  }
  return faults;
}

/** Rule (g), for the element focused now: its ring, drawn at the outline's width and offset, must be on screen and unclipped. */
export function measureFocusRing(): string | null {
  const el = document.activeElement;
  if (el === null || el === document.body || !(el instanceof HTMLElement)) return null;
  if (el.tagName === 'NEXTJS-PORTAL') return null; // the dev overlay's host, not the product's
  const cs = getComputedStyle(el);
  const label = `${el.tagName.toLowerCase()}${el.classList.length === 0 ? '' : `.${[...el.classList].slice(0, 3).join('.')}`} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28)}”`;
  const px = (v: string): number => Number.parseFloat(v) || 0;
  const width = cs.outlineStyle === 'none' ? 0 : px(cs.outlineWidth);
  if (width === 0 && cs.boxShadow === 'none') return `${label} shows no focus ring`;
  const grow = width + px(cs.outlineOffset);
  const r = el.getBoundingClientRect();
  const ring = { left: r.left - grow, top: r.top - grow, right: r.right + grow, bottom: r.bottom + grow };
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  if (ring.left < -0.5 || ring.right > vw + 0.5 || ring.top < -0.5 || ring.bottom > vh + 0.5) {
    return `${label}: its ring [${String(Math.round(ring.left))},${String(Math.round(ring.top))}–${String(Math.round(ring.right))},${String(Math.round(ring.bottom))}] is outside the ${String(vw)}×${String(vh)} window (scrolled ${String(Math.round(window.scrollY))} of ${String(document.documentElement.scrollHeight - vh)})`;
  }
  for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
    const pc = getComputedStyle(p);
    const clipsX = pc.overflowX !== 'visible';
    const clipsY = pc.overflowY !== 'visible';
    if (!clipsX && !clipsY) continue;
    const b = p.getBoundingClientRect();
    const inner = { left: b.left + px(pc.borderLeftWidth), top: b.top + px(pc.borderTopWidth), right: b.left + px(pc.borderLeftWidth) + p.clientWidth, bottom: b.top + px(pc.borderTopWidth) + p.clientHeight };
    const cutX = clipsX && (ring.left < inner.left - 0.5 || ring.right > inner.right + 0.5);
    const cutY = clipsY && (ring.top < inner.top - 0.5 || ring.bottom > inner.bottom + 0.5);
    if (cutX || cutY) {
      const pl = `${p.tagName.toLowerCase()}${p.classList.length === 0 ? '' : `.${[...p.classList].slice(0, 3).join('.')}`}`;
      return `${label}: its ring is clipped by ${pl} (overflow ${pc.overflowX}/${pc.overflowY})`;
    }
  }
  return null;
}

/** Rule (h) and the popover's own box: what is at its centre, and whether it is inside the window. */
export function measurePopover(selector: string): string[] {
  const faults: string[] = [];
  const pop = document.querySelector<HTMLElement>(selector);
  if (pop === null) return [`${selector} did not open`];
  const r = pop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  if (r.width <= 0 || r.height <= 0) return [`${selector} has no size`];
  if (r.left < -0.5) faults.push(`${selector} starts ${String(Math.round(-r.left))}px left of the window`);
  if (r.right > vw + 0.5) faults.push(`${selector} reaches ${String(Math.round(r.right - vw))}px past the window's right edge`);
  if (r.top < -0.5) faults.push(`${selector} starts above the window`);
  if (r.bottom > vh + 0.5 && getComputedStyle(pop).overflowY === 'visible') faults.push(`${selector} reaches ${String(Math.round(r.bottom - vh))}px below the fold`);
  const cx = Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2));
  const cy = Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2));
  const at = document.elementFromPoint(cx, cy);
  if (at === null || !pop.contains(at)) {
    const chain: string[] = [];
    for (let q: Element | null = at; q !== null && chain.length < 5; q = q.parentElement) {
      chain.push(`${q.tagName.toLowerCase()}${q.classList.length === 0 ? '' : `.${[...q.classList].slice(0, 2).join('.')}`}`);
    }
    faults.push(`${selector}: at its centre (${String(Math.round(cx))},${String(Math.round(cy))}) the top element is ${at === null ? 'nothing' : chain.join(' < ')}`);
  }
  return faults;
}

/** The bar's own gate: one row, 48px, nothing outside it, nothing spilling. */
export function measureBar(): string[] {
  const faults: string[] = [];
  const bar = document.querySelector<HTMLElement>('.topbar');
  if (bar === null) return ['no .topbar'];
  const r = bar.getBoundingClientRect();
  if (Math.abs(r.height - 48) > 0.5) faults.push(`the bar is ${String(Math.round(r.height))}px tall, not 48`);
  if (bar.scrollWidth > bar.clientWidth + 1) faults.push(`the bar's content is ${String(bar.scrollWidth - bar.clientWidth)}px wider than the bar`);
  const label = (el: Element): string => `${el.tagName.toLowerCase()}${el.classList.length === 0 ? '' : `.${[...el.classList].slice(0, 3).join('.')}`}`;
  for (const child of bar.children) {
    const cs = getComputedStyle(child);
    if (cs.display === 'none' || cs.position === 'absolute') continue;
    const c = child.getBoundingClientRect();
    if (c.width <= 0) continue;
    if (c.left < r.left - 0.5 || c.right > r.right + 0.5) faults.push(`${label(child)} [${String(Math.round(c.left))}–${String(Math.round(c.right))}] is outside the bar [${String(Math.round(r.left))}–${String(Math.round(r.right))}]`);
    if (c.top < r.top - 0.5 || c.bottom > r.bottom + 0.5) faults.push(`${label(child)} is taller than the bar's row`);
    // a popover inside a wrapper is absolute; the wrapper's in-flow children must fit too
    for (const inner of child.children) {
      const ic = getComputedStyle(inner);
      if (ic.display === 'none' || ic.position === 'absolute') continue;
      const b = inner.getBoundingClientRect();
      if (b.width > 0 && (b.left < r.left - 0.5 || b.right > r.right + 0.5)) faults.push(`${label(inner)} is outside the bar`);
    }
  }
  return faults;
}

/**
 * Rule (i), the shell's half: scrolled anywhere, the bar and the sidebar stay on screen. Only the content
 * scrolls; the document is still the scroller (find, scroll restoration and anchors depend on it), so the
 * two stay put by being sticky, and an ancestor that clips or scrolls breaks that without a sound.
 * A phone's sheet is fixed and a hidden sidebar is not measured.
 */
export function measureShellStuck(): string[] {
  const faults: string[] = [];
  if (window.scrollY < 1) return faults;
  const bar = document.querySelector<HTMLElement>('.topbar');
  const side = document.querySelector<HTMLElement>('.app > .body > .side');
  const barHeight = bar === null ? 0 : bar.getBoundingClientRect().height;
  const where = `at scroll ${String(Math.round(window.scrollY))}`;
  if (bar !== null && getComputedStyle(bar).display !== 'none') {
    const top = bar.getBoundingClientRect().top;
    if (Math.abs(top) > 0.5) faults.push(`div.topbar sits at ${String(Math.round(top))}px ${where}, not 0`);
  }
  if (side !== null) {
    const cs = getComputedStyle(side);
    if (cs.display !== 'none' && cs.position !== 'fixed') {
      const top = side.getBoundingClientRect().top;
      if (Math.abs(top - barHeight) > 0.5) faults.push(`aside.side sits at ${String(Math.round(top))}px ${where}, not ${String(Math.round(barHeight))}`);
    }
  }
  return faults;
}
