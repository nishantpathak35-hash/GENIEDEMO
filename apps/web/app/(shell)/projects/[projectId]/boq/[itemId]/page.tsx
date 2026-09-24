import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { formatQuantity, formatRupees } from '@cog/money';
import { apiAsCaller } from '../../../../../../lib/api';
import { load } from '@cog/design-system';
import { Section, Refusal, UnreachableState } from '@cog/design-system';
import { EditBoqLineForm } from './form';

export const dynamic = 'force-dynamic';

/**
 * Edit one BOQ line.
 *
 * The line is re-read here so the form carries the CURRENT version, and the
 * write sends it back as `expectedVersion`. That is BOQ-04 closed: until
 * migration `0030` added the column, two people editing the same line lost one
 * edit with no error, because there was no version to compare.
 *
 * The whole line is replaced rather than patched, which is why every field is
 * present in the form even when only one is being changed.
 */
export default async function EditBoqLinePage({
  params,
}: {
  params: Promise<{ projectId: string; itemId: string }>;
}): Promise<ReactNode> {
  const { projectId, itemId } = await params;
  const boq = await load(await apiAsCaller(), API_ROUTES.projectBoq, { params: { projectId } });

  if (boq.kind === 'unreachable') return <UnreachableState />;
  if (boq.kind === 'refused') return <Refusal error={boq.error} />;

  const line = boq.data.items.find((i) => i.id === itemId);
  if (line === undefined) notFound();

  return (
    <Section bare title={`Edit ${line.section} · ${String(line.itemNo)}`}>
      <div className="card-b">
        <p className="muted u-mt0">
          <Link href={`/projects/${projectId}/boq`}>Back to the BOQ</Link> · version{' '}
          {line.version}
        </p>
        <EditBoqLineForm
          projectId={projectId}
          itemId={itemId}
          line={{
            section: line.section,
            itemNo: String(line.itemNo),
            description: line.description,
            uom: line.uom,
            quantity: formatQuantity(line.quantityMicros),
            rate: formatRupees(line.rate),
            costRate: line.costRate === null ? '' : formatRupees(line.costRate),
            version: String(line.version),
          }}
        />
      </div>
    </Section>
  );
}
