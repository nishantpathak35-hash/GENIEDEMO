'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A project's own tab row — `10-portals.html`'s `.p-head .ptabs`, not
 * `Tabs`'s `.tabs`. A small local duplicate of `Tabs`'s pathname-matching
 * logic for the same reason `apps/vendor-portal`'s `PortalNav` is one:
 * `.ptabs` is a distinct shape the design draws inside `.p-head`, and
 * `packages/design-system` is not this app's to change.
 */
export function ProjectTabs({ projectId }: { projectId: string }): ReactNode {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const links: ReadonlyArray<readonly [string, string]> = [
    [base, 'Progress'],
    [`${base}/variations`, 'Variations'],
    [`${base}/documents`, 'Documents'],
    [`${base}/billing`, 'Billing'],
  ];

  return (
    <nav className="ptabs" aria-label="Project">
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
