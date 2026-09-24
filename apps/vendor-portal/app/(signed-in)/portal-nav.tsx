'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@cog/design-system';

/**
 * The vendor portal's bottom navigation — `.p-nav`, not `Tabs`'s `.tabs`.
 *
 * A small, local duplicate of `Tabs`'s pathname-matching logic rather than a
 * change to the shared component: `Tabs` renders a fixed `.tabs` shell used
 * elsewhere (`13-decisions.html`'s tab row), and `.p-nav` is the design's
 * distinct icon-over-label bottom bar for a narrow portal screen — a second
 * shape, not a themeable variant of the first. `packages/design-system` is
 * not this app's to edit, so the four links live here.
 */
export function PortalNav({
  links,
}: {
  links: ReadonlyArray<{ href: string; label: string; icon: IconName }>;
}): ReactNode {
  const pathname = usePathname();
  return (
    <nav className="p-nav" aria-label="Portal">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          {...(pathname === link.href ? { 'aria-current': 'page' as const } : {})}
        >
          <Icon name={link.icon} />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
