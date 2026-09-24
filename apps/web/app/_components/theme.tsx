'use client';

import { useState, type ReactNode } from 'react';

/**
 * The theme control: system, light, dark.
 *
 * `data-theme` on the root element is the whole mechanism. Absent means
 * "follow the system" and the stylesheet's `prefers-color-scheme` block
 * applies; `light` or `dark` forces one. **Nothing is persisted** — no
 * `localStorage`, no cookie: reload and it follows the system again. That is
 * the design's decision (README, "It stores nothing"), and it is also what
 * keeps this app free of browser storage of any kind.
 */
type Theme = 'system' | 'light' | 'dark';

export function ThemeControl(): ReactNode {
  const [theme, setTheme] = useState<Theme>('system');
  const choose = (next: Theme): void => {
    setTheme(next);
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
  };
  return (
    <fieldset className="seg" aria-label="Theme">
      {(['system', 'light', 'dark'] as const).map((option) => (
        <label key={option}>
          <input
            type="radio"
            name="theme"
            value={option}
            checked={theme === option}
            onChange={() => choose(option)}
          />
          {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
        </label>
      ))}
    </fieldset>
  );
}
