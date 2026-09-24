import type { ReactNode } from 'react';
import { ReportsCenter } from './center';

export const metadata = { title: 'Reports · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/** The Reports Center — the nine reads the panels own, grouped, starrable, each one run on its own parameters. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  return <ReportsCenter params={await searchParams} project={null} />;
}
