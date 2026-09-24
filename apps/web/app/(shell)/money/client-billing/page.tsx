import type { ReactNode } from 'react';
import { ClientBillingList } from './list';

export const metadata = { title: 'Client billing · Money' };
export const dynamic = 'force-dynamic';

/** Money › Client billing — the firm's receivables, with the Project column and filter. `list.tsx` draws it; the project's twin draws the same narrowed. */
export default async function ClientBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  return <ClientBillingList params={await searchParams} project={null} />;
}
