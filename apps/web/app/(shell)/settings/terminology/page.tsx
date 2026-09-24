import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { Icon, Notice, PageHeader, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { TerminologyForm } from '../terminology-form';

export const metadata = { title: 'Terminology · Settings' };
export const dynamic = 'force-dynamic';

/**
 * Settings › Terminology — the words this firm uses (`11-settings.html`).
 *
 * One choice per pair, per tenant, read by every label: the sidebar entry,
 * the list title, every column and button that names the thing, the
 * quick-create, the search's scope, and the heading on a document (bound
 * into a render as data). The route stays `/boq` whichever word is chosen,
 * so a link never breaks.
 */
export default async function TerminologyPage(): Promise<ReactNode> {
  const current = await load(await apiAsCaller(), API_ROUTES.terminology, {});
  if (current.kind === 'unreachable') return <UnreachableState />;

  const header = (
    <PageHeader
      crumbs={[{ href: '/settings', label: 'Settings' }]}
      title="Terminology"
      sub="The words this firm uses. Every label, column, menu and document reads the choice here; nothing else changes."
    />
  );

  if (current.kind === 'refused') {
    return (
      <>
        {header}
        <Section title="Four pairs">
          <Refusal error={current.error} />
        </Section>
      </>
    );
  }

  const { changedAt, ...words } = current.data;
  return (
    <>
      {header}
      <div data-hero>
        <Section
          title="Four pairs"
          sub="one choice each · the sidebar, the lists and the PDFs follow"
          action={changedAt === null ? <Pill tone="idle">Nobody has chosen yet</Pill> : <Pill tone="ok">Chosen · {changedAt.slice(0, 10)}</Pill>}
        >
          <TerminologyForm current={words} />
        </Section>
      </div>
      <Notice tone="info" title="What a choice changes" icon={<Icon name="info" />}>
        The sidebar entry, the list title, every column and button that names the thing, the search’s scope, and the heading on the PDF — as data the document reads, never as its code. The route stays
        /boq whichever word is chosen, so a link never breaks. A skeleton drawn before the page answers, and the portals, still say the first word of each pair.
      </Notice>
    </>
  );
}
