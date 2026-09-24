import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type { TodaySetupResponse } from '@cog/contracts';
import { Icon, Notice, Progress, Section } from '@cog/design-system';

/**
 * Today › Getting started — the six setup steps (`docs/design/04-today.html`,
 * "Getting started"), a tab beside Today rather than a card in it, until
 * every step is done. The server judged each step (`/today/setup`); this
 * puts words to the keys, marks the ones it can see done, and makes the next
 * one's button primary.
 *
 * Four steps have no backing feature today, and the tab says so in product
 * words rather than drawing a button to nowhere: no project importer, no
 * vendor import from Tally or Excel, no magic-link invite, no tenant-side
 * Tally pairing screen. Each is recorded, not built.
 *
 * `tally` is done when a voucher was posted; until then `setup.tally` says
 * whether an agent has ever called in, and the detail line says which —
 * "never connected" and "connected, nothing posted yet" are different steps
 * to take. Dates are the server's instants, printed here in Asia/Kolkata.
 */
const STEP: Record<TodaySetupResponse['steps'][number]['key'], { label: string; detail: string; href: string; action: string; gap: string | null }> = {
  company: {
    label: 'Company details',
    detail: 'Legal name, GSTIN, PAN, address on every document',
    href: '/settings/company',
    action: 'Enter',
    gap: null,
  },
  projects: {
    label: 'Add your projects',
    detail: 'Type them in, or import the Excel you already keep',
    href: '/projects?new=1',
    action: 'Add',
    gap: 'No importer exists yet. Projects are added one at a time through the form; nothing reads Excel.',
  },
  vendors: {
    label: 'Add your vendors',
    detail: 'From your Tally ledgers, or an Excel list',
    href: '/vendors?new=1',
    action: 'Add',
    gap: 'The connector pushes vouchers to Tally and reads nothing back. There is no vendor import from Tally or Excel yet; vendors are added one at a time.',
  },
  team: {
    label: 'Invite your team',
    detail: 'Everyone signs in with their work email; no passwords to manage',
    href: '/settings/people',
    action: 'Invite',
    gap: 'Invitations exist and each link is shown once. Signing in by a link in an email — no password — is proposed, not built; today every sign-in is one credential.',
  },
  tally: {
    label: 'Connect Tally',
    detail: 'Install the connector on the machine that runs Tally',
    href: '/settings/company',
    action: 'Start',
    gap: 'The connector is its own installer and its key is issued when your organisation is set up. There is no pairing screen in Settings yet — ask for the key.',
  },
  tax: {
    label: 'Review your tax settings',
    detail: 'About two minutes. The rates every Indian business uses; three questions about your business',
    href: '/settings/tax',
    action: 'Review',
    gap: null,
  },
};

const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** The Tally step's second line, from what the server recorded. */
function tallyDetail(tally: TodaySetupResponse['tally']): string {
  if (tally.lastPostedAt !== null) {
    const waiting = tally.pendingCount === 0 ? '' : ` · ${String(tally.pendingCount)} waiting`;
    return `Last posted ${DAY.format(new Date(tally.lastPostedAt))} · ${String(tally.postedCount)} vouchers${waiting}`;
  }
  if (tally.lastSeenAt !== null) {
    return `Connected — last seen ${DAY.format(new Date(tally.lastSeenAt))}, nothing posted yet${tally.pendingCount === 0 ? '' : ` · ${String(tally.pendingCount)} waiting`}`;
  }
  return 'Never connected. Install the connector on the machine that runs Tally';
}

export function GettingStarted({ setup }: { setup: TodaySetupResponse }): ReactNode {
  const next = setup.steps.find((s) => s.state !== 'done');
  const gaps = setup.steps.filter((s) => STEP[s.key].gap !== null);
  return (
    <>
      <section className="card setup" aria-label="Get set up">
        <div className="card-h">
          <h2 className="ct">Get set up</h2>
          <div className="actions">
            <Progress pct={setup.pct} label="Setup progress" text={`${String(setup.done)} of ${String(setup.total)} done`} done={setup.done === setup.total} />
          </div>
        </div>
        <ol>
          {setup.steps.map((s) => {
            const step = STEP[s.key];
            const detail = s.key === 'tally' ? tallyDetail(setup.tally) : step.detail;
            return (
              <li key={s.key} className={s.state === 'done' ? 'done' : ''}>
                <span className="tick" aria-hidden="true">
                  {s.state === 'done' ? <Icon name="check" size="sm" bare /> : null}
                </span>
                <div>
                  <b>{step.label}</b>
                  <small>{detail}</small>
                </div>
                {s.state === 'done' ? (
                  <span className="status">Done</span>
                ) : (
                  <Link className={next?.key === s.key ? 'btn primary' : 'btn'} href={step.href}>
                    {step.action}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      <Notice tone="info" title="Four steps have no shortcut yet" icon={<Icon name="info" />}>
        No project importer, no vendor import from Tally or Excel, no invitation without a password, no Tally pairing screen in Settings — each is recorded, not built. What exists instead is below.
      </Notice>
      <Section title="What exists instead" sub={`${String(gaps.length)} steps done by hand for now`}>
        <dl className="kv">
          {gaps.map((s) => (
            <Fragment key={s.key}>
              <dt>{STEP[s.key].label}</dt>
              <dd>{STEP[s.key].gap}</dd>
            </Fragment>
          ))}
        </dl>
      </Section>
    </>
  );
}
