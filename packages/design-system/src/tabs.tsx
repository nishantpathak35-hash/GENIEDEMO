'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A row of sub-navigation. Client-side only because it needs the pathname.
 *
 * **Every tab is always shown.** The legacy hides tabs and buttons by deriving
 * a role in the browser; a hidden tab is not an access control, because the URL
 * still resolves. Here the tab is visible, the server refuses what it refuses,
 * and the refusal says why.
 */
export function Tabs({ links }: { links: ReadonlyArray<readonly [string, string]> }): ReactNode {
  const pathname = usePathname();
  return (
    <nav className="tabs">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          {...(pathname === href ? { 'aria-current': 'page' as const } : {})}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The segmented views of one page — `.subtabs` (`build/shell.mjs` subtabs):
 * Today | Getting started, Profile | Notifications | Keyboard. The same
 * pathname match as `Tabs`, at the class the design names; a `match` of
 * `exact` lights only the pathname, `prefix` lights a section's pages too.
 */
export function Subtabs({
  links,
  label = 'Views',
  match = 'exact',
}: {
  links: ReadonlyArray<readonly [string, string]>;
  label?: string;
  match?: 'exact' | 'prefix';
}): ReactNode {
  const pathname = usePathname();
  const lit = (href: string): boolean => pathname === href || (match === 'prefix' && href !== '/' && pathname.startsWith(`${href}/`));
  return (
    <nav className="subtabs" aria-label={label}>
      {links.map(([href, text]) => (
        <Link key={href} href={href} {...(lit(href) ? { 'aria-current': 'page' as const } : {})}>
          {text}
        </Link>
      ))}
    </nav>
  );
}
