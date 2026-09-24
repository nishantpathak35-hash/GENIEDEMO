import type { ReactNode } from 'react';
import { StockList } from './list';

export const metadata = { title: 'Stock · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/** Buying › Stock — the central store and every site store. `list.tsx` draws it; the project's twin draws its site store alone. */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  return <StockList params={await searchParams} project={null} store={null} />;
}
