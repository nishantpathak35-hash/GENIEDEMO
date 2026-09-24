// token-renames.mjs — the geometry, type and motion names of the old system, mapped onto the new one.
//
// Colour keeps this product's names: they are the component layer, and each now points at a semantic token.
// Space, radius, type and motion do not: the old names described an old scale (a 10px step, a 15px body,
// an 8px control corner) that the new system does not have, so every reference is rewritten to the new
// system's own token — once, at build time, over the stylesheet and every inline style. The table is the
// record of what each old step became; the ones that moved to a different size are marked.
export const RENAME = [
  // space — the 8px base unit; four old steps had no equal and take the nearest
  ['s-1', 'space-025', '2px'], ['s-2', 'space-050', '4px'], ['s-3', 'space-075', '6px'], ['s-4', 'space-100', '8px'],
  ['s-5', 'space-100', '10px → 8px'], ['s-6', 'space-150', '12px'], ['s-7', 'space-150', '14px → 12px'], ['s-8', 'space-200', '16px'],
  ['s-9', 'space-250', '20px'], ['s-10', 'space-300', '24px'], ['s-11', 'space-400', '32px'], ['s-12', 'space-500', '40px'],
  ['s-13', 'space-600', '56px → 48px'], ['s-14', 'space-1000', '80px'], ['s-15', 'space-1000', '120px → 80px'],
  // radius — by what the element is, as the radius guidance assigns them
  ['r-xs', 'radius-small', '4px — lozenges, labels, chips'], ['r-sm', 'radius-medium', '6px — tab items, small interactive'],
  ['r-ctl', 'radius-medium', '8px → 6px — buttons, inputs, selects, navigation items'], ['r-card', 'radius-large', '12px → 8px — cards, in-page containers, popovers'],
  ['r-lg', 'radius-xlarge', '16px → 12px — page containers, tables, modals'], ['r-pill', 'radius-full', '999px'], ['r-round', 'radius-full', '50% → 9999px'],
  ['ring', 'mark-ring', '2px'],
  // type — onto the published heading, body and metric styles
  ['fs-micro', 'font-size-body-small', '11px → 12px'], ['lh-micro', 'line-height-body-small', '16px'],
  ['fs-meta', 'font-size-body-small', '12.5px → 12px'], ['lh-meta', 'line-height-body-small', '17px → 16px'],
  ['fs-label', 'font-size-body-small', '13px → 12px'], ['lh-label', 'line-height-body-small', '18px → 16px'],
  ['fs-body', 'font-size-body', '14px'], ['lh-body', 'line-height-body', '20px'],
  ['fs-read', 'font-size-body-large', '15px → 16px'], ['lh-read', 'line-height-body-large', '22px → 24px'],
  ['fs-lead', 'font-size-heading-small', '16px'], ['lh-lead', 'line-height-heading-small', '24px → 20px'],
  ['fs-quote', 'font-size-heading-medium', '18px → 20px'], ['lh-quote', 'line-height-heading-medium', '26px → 24px'],
  ['fs-h3', 'font-size-heading-medium', '20px'], ['lh-h3', 'line-height-heading-medium', '28px → 24px'],
  ['fs-h2', 'font-size-heading-large', '22px → 24px'], ['lh-h2', 'line-height-heading-large', '30px → 28px'],
  ['fs-h1', 'font-size-heading-xlarge', '30px → 28px'], ['lh-h1', 'line-height-heading-xlarge', '36px → 32px'],
  ['fs-display', 'font-size-heading-xxlarge', '40px → 32px'], ['lh-display', 'line-height-heading-xxlarge', '44px → 36px'],
  ['fs-hero', 'font-size-hero', 'clamp(36px, 5.5cqw, 62px) → clamp(36px, 5.5cqw, 56px)'], ['fs-fig', 'font-size-figure', 'clamp(26, 13cqw, 48) → clamp(24, 13cqw, 32)'],
  ['fs-stat', 'font-size-stat', 'clamp(20, 11.5cqw, 30) → clamp(16, 11.5cqw, 24)'], ['fs-stat-sm', 'font-size-stat-compact', 'clamp(18, 11cqw, 24) → clamp(16, 11cqw, 20)'],
  ['fs-title', 'font-size-title', 'clamp(21, 2.9cqw, 30) → clamp(20, 2.9cqw, 24)'], ['lh-fluid', 'line-height-fluid', '1.12'],
  ['ls-caps', 'letter-spacing-caps', '0.07em → 0.04em'],
  ['font-text', 'font-family-body', 'Inter'], ['font-display', 'font-family-heading', 'Newsreader → Inter'], ['font-mono', 'font-family-code', 'unchanged'],
  // controls
  ['h-ctl', 'control-height', '40px → 32px'], ['h-ctl-sm', 'control-height-compact', '30px → 24px'], ['h-ctl-lg', 'control-height-large', '46px → 40px'],
  ['h-box', 'checkbox-size', '18px → 16px'], ['avatar', 'avatar-size', '26px → 24px'], ['avatar-lg', 'avatar-size-large', '32px'],
  ['focus-ring', 'focus-ring-width', '2px'], ['focus-offset', 'focus-ring-offset', '2px'], ['o-disabled', 'opacity-disabled', '0.5 → 0.4'],
  // motion
  ['ease', 'motion-easing-out-practical', 'cubic-bezier(.2, 0, 0, 1) → cubic-bezier(0.4, 1, 0.6, 1)'],
  ['t-fast', 'motion-duration-short', '150ms'], ['t-base', 'motion-duration-medium', '200ms'], ['t-slow', 'motion-duration-long', '250ms'],
  ['tr-ctl', 'transition-control', ''], ['tr-card', 'transition-card', ''],
];
const MAP = new Map(RENAME.map(([a, b]) => [a, b]));
// the two tracking tokens the new type does not use: its headings are set at normal tracking
const DROP = new Map([['ls-display', 'normal'], ['ls-heading', 'normal']]);
export function renameGeometry(text) {
  let n = 0;
  const out = text.replace(/var\(--([a-z][a-z0-9-]*)\)/g, (m, name) => {
    if (MAP.has(name)) { n++; return `var(--${MAP.get(name)})`; }
    if (DROP.has(name)) { n++; return DROP.get(name); }
    return m;
  })
    // the focus glow is gone: the focus specification is a 2px ring set 2px outside the control, and nothing else
    .replace(/;?\s*box-shadow:\s*var\(--glow\)/g, () => { n++; return ''; });
  return { text: out, count: n };
}
