import type { ReactNode } from 'react';
import { OrdersList } from './list';

export const metadata = { title: 'Orders · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/** Buying › Orders — the firm's list, with its Project column and filter. `list.tsx` draws it; the project's twin draws the same narrowed. */
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  return <OrdersList params={await searchParams} project={null} />;
}
