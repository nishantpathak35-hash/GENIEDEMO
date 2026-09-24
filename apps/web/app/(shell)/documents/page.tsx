import type { ReactNode } from 'react';
import { DocumentsVault } from './vault';

export const metadata = { title: 'Documents · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/** The firm's vault — every file, with its project. `vault.tsx` draws it; the project's twin draws the same narrowed. */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  return <DocumentsVault params={await searchParams} project={null} />;
}
