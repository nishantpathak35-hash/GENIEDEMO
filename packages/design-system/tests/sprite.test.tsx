import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  Sprite,
  Icon,
  Duotone,
  Illustration,
  duotoneFor,
  ICON_NAMES,
  DUOTONE_NAMES,
  ILLUSTRATION_NAMES,
  ILLUSTRATION_SUBJECTS,
  ILLUSTRATION_FOR,
} from '../src/sprite.js';

/**
 * The symbol table is the one thing in this file worth pinning to a count:
 * every icon, duotone and illustration the four apps can name has to resolve
 * to a real `<symbol>`, or a screen renders a blank `<use>` and nobody
 * notices until somebody looks at it. The drawings are the design's own
 * (`docs/design/build/`), brought here by `scripts/import-drawings.mjs`; the
 * last case runs the script's check so a redraw the kit has not taken is a
 * red test, not a quiet drift.
 */
describe('Sprite', () => {
  it('renders every symbol — 57 icons, 19 duotones and 23 illustrations, one per subject', () => {
    const { container } = render(<Sprite />);
    expect(ICON_NAMES.length).toBe(57);
    expect(DUOTONE_NAMES.length).toBe(19);
    expect(ILLUSTRATION_SUBJECTS.length).toBe(23);
    expect(container.querySelectorAll('symbol').length).toBe(57 + 19 + 23);
  });

  it('names the ten empty states the shipped component did not take, and every name draws a subject', () => {
    for (const name of ['today', 'boq', 'rates', 'vendors', 'not-found', 'unreachable', 'error', 'signed-out', 'operator', 'client']) {
      expect(ILLUSTRATION_NAMES, name).toContain(name);
    }
    for (const name of ILLUSTRATION_NAMES) expect(ILLUSTRATION_SUBJECTS).toContain(ILLUSTRATION_FOR[name]);
  });

  it('every DuotoneName resolves to a rendered symbol, and a monoline name maps to the duotone that does its job', () => {
    const { container } = render(<Sprite />);
    for (const name of DUOTONE_NAMES) expect(container.querySelector(`#d-${name}`), `missing duotone "${name}"`).not.toBeNull();
    expect(duotoneFor('cart')).toBe('orders');
    expect(duotoneFor('margin')).toBe('margin');
    expect(duotoneFor('pen')).toBe('count');
  });

  it('is the generator’s current drawing — import-drawings.mjs --check passes', () => {
    const repo = join(import.meta.dirname, '..', '..', '..');
    expect(() => execFileSync(process.execPath, [join(repo, 'scripts', 'import-drawings.mjs'), '--check'], { encoding: 'utf8' })).not.toThrow();
  });

  it('every IconName resolves to a rendered symbol', () => {
    const { container } = render(<Sprite />);
    for (const name of ICON_NAMES) {
      expect(container.querySelector(`#i-${name}`), `missing symbol for icon "${name}"`).not.toBeNull();
    }
  });

  it('every IllustrationName resolves to a rendered symbol through its subject', () => {
    const { container } = render(<Sprite />);
    for (const name of ILLUSTRATION_NAMES) {
      expect(container.querySelector(`#illo-${ILLUSTRATION_FOR[name]}`), `missing symbol for illustration "${name}"`).not.toBeNull();
    }
  });

  it('is hidden from assistive technology and holds no visible geometry of its own', () => {
    const { container } = render(<Sprite />);
    const svg = container.querySelector('svg.sprite');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = render(<Icon name="bell" />);
    const ico = container.querySelector('.ico');
    expect(ico?.getAttribute('aria-hidden')).toBe('true');
    expect(ico?.getAttribute('role')).toBeNull();
  });

  it('announces as an image when a label is given', () => {
    const { container, getByRole } = render(<Icon name="bell" label="Notifications" />);
    const image = getByRole('img', { name: 'Notifications' });
    expect(image).toBeDefined();
    expect(container.querySelector('.ico')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('references the requested symbol', () => {
    const { container } = render(<Icon name="rupee" />);
    expect(container.querySelector('use')?.getAttribute('href')).toBe('#i-rupee');
  });

  it('carries the small size class only when asked', () => {
    const { container: withSm } = render(<Icon name="rupee" size="sm" />);
    expect(withSm.querySelector('svg')?.classList.contains('sm')).toBe(true);

    const { container: withoutSm } = render(<Icon name="rupee" />);
    expect(withoutSm.querySelector('svg')?.classList.contains('sm')).toBe(false);
  });
});

describe('Illustration', () => {
  it('is always hidden from assistive technology', () => {
    const { container } = render(<Illustration name="orders" />);
    expect(container.querySelector('svg.illo')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('references the subject its name draws, and says which', () => {
    const { container } = render(<Illustration name="stock" />);
    expect(container.querySelector('use')?.getAttribute('href')).toBe('#illo-stock');
    const { container: chai } = render(<Illustration name="client" />);
    expect(chai.querySelector('use')?.getAttribute('href')).toBe('#illo-chai');
    expect(chai.querySelector('svg.illo')?.getAttribute('data-subject')).toBe('chai');
  });
});

describe('Duotone', () => {
  it('is decorative and references its symbol', () => {
    const { container } = render(<Duotone name="tray" />);
    expect(container.querySelector('svg.duo')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('use')?.getAttribute('href')).toBe('#d-tray');
  });
});
