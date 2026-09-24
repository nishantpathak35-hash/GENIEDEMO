import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sprite } from '../src/sprite.js';
import { STORY_FILES, missingStoryFiles } from '../stories/index.js';

/**
 * Every component, every state, both themes — the package reviewed without
 * the app.
 *
 * There is no Storybook here, on purpose: it is a second build system with
 * its own bundler, and this package is plain React over one stylesheet. What
 * a reviewer needs is the same thing Storybook gives — every state of every
 * component on one page, in both themes — and a static render provides it.
 *
 * Each `stories/*.stories.tsx` exports `stories`: one entry per component,
 * one function per state, named as the design names it; `stories/index.ts`
 * lists the files, and asserts nothing is missing from that list. This test
 * does two things with them:
 *
 *   1. renders every state and asserts it produced markup — a story that
 *      throws is a component that cannot render that state, which is the
 *      cheapest possible regression check for a design system;
 *   2. writes the gallery to `stories/gallery/{light,dark}.html`, linking
 *      the package's own `styles.css`, so `docs/design/*.html` and the shipped
 *      component can be opened side by side. The gallery is generated output
 *      and is not committed.
 *
 * `next/navigation` is mocked because `Tabs` reads the pathname, and a static
 * render has no router.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const files = STORY_FILES;

const all = files.flatMap(({ file, stories }) =>
  stories.flatMap((story) =>
    Object.entries(story.states).map(([state, render]) => ({
      file,
      component: story.component,
      state,
      render,
    })),
  ),
);

describe('stories', () => {
  it('exist for the whole kit, and every story file is listed', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(0);
    expect(missingStoryFiles(join(import.meta.dirname, '..', 'stories'))).toEqual([]);
  });

  it.each(all.map((s) => [`${s.component} — ${s.state}`, s] as const))(
    '%s renders',
    (_name, story) => {
      // A state may legitimately render nothing — chips with nothing applied,
      // a bulk bar with nothing selected — so the assertion is that it renders
      // at all, not that it paints.
      expect(typeof renderToStaticMarkup(<>{story.render()}</>)).toBe('string');
    },
  );

  it('every component paints in at least one state', () => {
    const painted = new Set(
      all.filter((s) => renderToStaticMarkup(<>{s.render()}</>).length > 0).map((s) => s.component),
    );
    for (const s of all) expect(painted.has(s.component), `${s.component} never paints`).toBe(true);
  });

  it('writes the gallery, both themes', () => {
    const dir = join(import.meta.dirname, '..', 'stories', 'gallery');
    mkdirSync(dir, { recursive: true });
    const sprite = renderToStaticMarkup(<Sprite />);
    const byComponent = new Map<string, typeof all>();
    for (const story of all) {
      const list = byComponent.get(story.component) ?? [];
      list.push(story);
      byComponent.set(story.component, list);
    }
    const body = [...byComponent.entries()]
      .map(([component, states]) => {
        const sections = states
          .map(
            (s) =>
              `<section class="story"><h3 class="story-name">${escapeHtml(s.state)}</h3>` +
              `<div class="story-stage">${renderToStaticMarkup(<>{s.render()}</>)}</div></section>`,
          )
          .join('\n');
        return `<article class="story-group" id="${escapeHtml(component)}"><h2 class="story-group-name">${escapeHtml(component)}</h2>${sections}</article>`;
      })
      .join('\n');
    const nav = [...byComponent.keys()]
      .map((c) => `<a href="#${escapeHtml(c)}">${escapeHtml(c)}</a>`)
      .join('');
    for (const theme of ['light', 'dark'] as const) {
      const page =
        `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">` +
        `<title>@cog/design-system — ${theme}</title>` +
        `<link rel="stylesheet" href="../../src/styles.css">` +
        `<link rel="stylesheet" href="./gallery.css"></head><body>` +
        sprite +
        `<nav class="story-nav">${nav}</nav><main class="story-main">${body}</main></body></html>`;
      writeFileSync(join(dir, `${theme}.html`), page);
    }
    // The gallery's own chrome. Tokens only, like everything else.
    writeFileSync(
      join(dir, 'gallery.css'),
      [
        '.story-nav { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: var(--space-050) var(--space-100); padding: var(--space-100) var(--space-200); background: var(--ground); border-bottom: 1px solid var(--line); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); z-index: 1; }',
        '.story-main { padding: var(--space-250) var(--space-400) var(--space-1000); max-width: 1280px; }',
        '.story-group { margin-bottom: var(--space-600); }',
        '.story-group-name { font-family: var(--font-family-heading); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); margin: 0 0 var(--space-200); }',
        '.story { margin-bottom: var(--space-300); }',
        '.story-name { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: 600; color: var(--ink-faint); margin: 0 0 var(--space-100); }',
        '.story-stage { container-type: inline-size; position: relative; }',
        // A drawer, a scrim and a popover position themselves against the
        // nearest positioned ancestor; without a stage of their own they would
        // overlay the whole gallery.
        '.story-stage:has(> .drawer), .story-stage:has(> .scrim), .story-stage:has(> .popover) { min-height: 640px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-large); }',
        '.story-stage > .popover { position: absolute; }',
        '',
      ].join('\n'),
    );
    expect(byComponent.size).toBeGreaterThan(0);
  });
});

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
