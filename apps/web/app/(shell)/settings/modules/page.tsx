import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { ModuleToggle } from '../forms';

export const metadata = { title: 'Modules · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Modules — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Modules" sub="What the firm has switched on." />;

/**
 * What this organisation actually uses.
 *
 * **This is not the Module Access screen from the legacy app.** That one
 * (`components/views/settings/ModuleAccessSettings.js`) is a role × module
 * matrix — which people may reach which screens — and that already exists here
 * as Roles &amp; permissions. This screen answers a question the legacy app has
 * no answer to: whether a feature is switched on for the company at all.
 *
 * Everything here starts OFF, including for a brand-new organisation. The
 * eleven design-build workflows came out of a feature tree written on top of
 * the original app rather than out of watching a business run, so some describe
 * a real process and some are a shape somebody sketched. A switch is the honest
 * answer to not knowing which — and it is reversible, which "we deleted it" is
 * not.
 */
export default async function ModulesPage(): Promise<ReactNode> {
  const modules = await load(await apiAsCaller(), API_ROUTES.modules, {});

  if (modules.kind === 'unreachable') return <UnreachableState />;
  if (modules.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Modules">
          <Refusal error={modules.error} />
        </Section>
      </>
    );
  }

  const on = modules.data.items.filter((m) => m.enabled).length;

  return (
    <>
      {HEADER}
      <Section bare title={`Optional modules — ${on} of ${modules.data.items.length} on`}>
        <div className="card-b">
          <p className="muted">
            A module that is off is not in anyone&rsquo;s navigation and its endpoints answer as
            though they do not exist. <strong>Switching one off deletes nothing.</strong> Turn it
            back on and the work that was already recorded is still there.
          </p>
          <div className="tbl-wrap">
            {/* Module · State · What it is for · (toggle) — identity never
                drops; on/off is the decision column; the description and the
                action are reference and drop first. */}
            <table className="tbl" data-priority>
              <thead>
                <tr>
                  <th data-p="1">Module</th>
                  <th data-p="2">State</th>
                  <th data-p="3">What it is for</th>
                  <th data-p="4" aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {modules.data.items.map((module) => (
                  <tr key={module.key}>
                    <td data-p="1">{module.title}</td>
                    <td data-p="2">
                      <Pill tone={module.enabled ? 'ok' : 'idle'}>
                        {module.enabled ? 'On' : 'Off'}
                      </Pill>
                    </td>
                    <td className="muted" data-p="3" data-label="What it is for">
                      {module.summary}
                    </td>
                    <td data-p="4">
                      <ModuleToggle
                        moduleKey={module.key}
                        title={module.title}
                        enabled={module.enabled}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            shown={{ from: 1, to: modules.data.items.length }}
            of={modules.data.items.length}
            unit="modules"
          />
        </div>
      </Section>

      <AbsentNotice title="There is no bulk &ldquo;turn everything on&rdquo;">
        Eleven modules switched on together is the same decision as never having had a switch. Each
        one is a separate act because each one puts a screen in front of people who then have to
        keep it filled in, and a half-used module is worse than an absent one — it looks like a
        record and is not.
      </AbsentNotice>
    </>
  );
}
