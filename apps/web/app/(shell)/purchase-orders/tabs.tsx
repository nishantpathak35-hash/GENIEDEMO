import type { ReactNode } from 'react';

/** Inside a project, Orders carries the procurement plan as its second tab (06-projects, the twins). */
export function OrdersTabs({ projectId, current }: { projectId: string; current: 'orders' | 'plan' }): ReactNode {
  return (
    <nav className="subtabs" aria-label="Views">
      <a href={`/projects/${projectId}/orders`} {...(current === 'orders' ? { 'aria-current': 'page' as const } : {})}>
        Orders
      </a>
      <a href={`/projects/${projectId}/procurement`} {...(current === 'plan' ? { 'aria-current': 'page' as const } : {})}>
        Plan
      </a>
    </nav>
  );
}
