import type { ReactNode } from 'react';
import { BillsList } from './list';

export const metadata = { title: 'Bills · Money' };
export const dynamic = 'force-dynamic';

/** Money › Bills — the firm's payables, with the Project column and filter. `list.tsx` draws it; the project's twin draws the same narrowed. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  return <BillsList params={await searchParams} project={null} />;
}
