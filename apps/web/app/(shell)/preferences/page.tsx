import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { redirect } from 'next/navigation';
import { InlineMessage, PageHeader, Refusal, Section, Switch, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { setSingleKeyShortcuts } from '../../actions/preferences';

export const metadata = { title: 'Your preferences · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Your preferences — the person's, not the firm's, reached from the account
 * menu and not from Settings (`docs/design/11-settings.html`, Your
 * preferences › Keyboard; VALUE-MAP).
 *
 * It exists for WCAG 2.1.4: the switch turns single-key shortcuts OFF, in the
 * shell — `/` and `?` then type themselves and the shortcut list stays in the
 * account menu — so a person who uses speech input or a switch device is
 * never moved somewhere by a stray letter. The rest of the page shows what
 * the preference store holds about this person, honestly: the sections left
 * open, the collapse, the last project, the column choices, the stars. None
 * of it is in a browser; it follows the person to another computer.
 */
export default async function PreferencesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const params = await searchParams;
  const saved = params['saved'] === 'keyboard';
  const client = await apiAsCaller();
  const [prefs, projects] = await Promise.all([
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
  ]);
  if (prefs.kind === 'unreachable') return <UnreachableState />;
  if (prefs.kind === 'refused') return <Refusal error={prefs.error} />;
  const p = prefs.data;
  const lastProject = p.lastProjectId === null || projects.kind !== 'ok' ? null : (projects.data.items.find((x) => x.id === p.lastProjectId) ?? null);
  const columnLists = Object.entries(p.columns);

  return (
    <>
      <PageHeader
        title="Your preferences"
        sub="Yours, not the firm’s. They follow you to another computer; nothing is kept in this browser."
        help="Turn off one-key shortcuts if you use speech input or a switch, so a stray letter never moves you somewhere you did not mean to go."
      />

      <Section bare title="Keyboard">
        <div className="card-b">
          <form action={toggleShortcuts} className="stack">
            <Switch name="on" label="Use single-key shortcuts" checked={p.singleKeyShortcuts} describedBy="kbd-why" />
            <p className="hint" id="kbd-why">
              With them on, <kbd>/</kbd> focuses the search and <kbd>?</kbd> opens the shortcut list from anywhere that is not a text
              field. With them off, both keys type themselves; Esc, the arrows in a table and Ctrl or Alt chords are unaffected, and
              the list stays in the account menu.
            </p>
            <div className="actions">
              <button type="submit" className="btn primary">
                Save
              </button>
              {saved ? <InlineMessage tone="ok">Saved — it applies everywhere from now.</InlineMessage> : null}
            </div>
          </form>
          <table className="tbl kbd-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Does</th>
                <th>On</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['/', 'Focus the search', p.singleKeyShortcuts],
                ['?', 'Open the shortcut list', p.singleKeyShortcuts],
                ['Esc', 'Close the top-most thing — never navigates', true],
                ['↑ ↓', 'Move the row in a table; between the sidebar’s visible entries', true],
                ['Enter', 'Open the row', true],
                ['Space · Shift+↑↓ · Ctrl+A', 'Select a row, extend, select the page', true],
              ].map(([key, does, on]) => (
                <tr key={String(key)}>
                  <td>
                    <kbd>{key}</kbd>
                  </td>
                  <td>{does}</td>
                  <td>{on === true ? 'On' : 'Off — types itself'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Approve and Decline have no shortcut. A decision is never a single keystroke.</p>
        </div>
      </Section>

      <Section bare title="What is kept about you">
        <div className="card-b">
          <dl className="kv">
            <dt>The sidebar</dt>
            <dd>
              {p.sidebar.collapsed ? 'Collapsed to its icons' : 'Open'}
              {p.sidebar.open.length === 0 ? '; no section left open' : `; left open: ${p.sidebar.open.join(', ')}`}. Changed from the sidebar itself.
            </dd>
            <dt>Last project opened</dt>
            <dd>{lastProject === null ? 'None yet' : <Link href={`/projects/${lastProject.id}`}>{`${lastProject.code} · ${lastProject.name}`}</Link>}</dd>
            <dt>Columns you chose</dt>
            <dd>
              {columnLists.length === 0
                ? 'None — every list shows its default columns. Change one from a list’s Columns control.'
                : columnLists.map(([list, cols]) => `${list}: ${cols.join(', ')}`).join(' · ')}
            </dd>
            <dt>Starred views</dt>
            <dd>{p.starredViews.length === 0 ? 'None yet — star one under a list’s title.' : `${String(p.starredViews.length)} starred`}</dd>
            <dt>Starred reports</dt>
            <dd>{p.starredReports.length === 0 ? 'None yet — star one in Reports.' : p.starredReports.join(', ')}</dd>
          </dl>
        </div>
      </Section>
    </>
  );
}

async function toggleShortcuts(form: FormData): Promise<void> {
  'use server';
  await setSingleKeyShortcuts(form.get('on') === 'on');
  // the page says it saved, and the address carries it so a reload does not re-submit
  redirect('/preferences?saved=keyboard');
}
