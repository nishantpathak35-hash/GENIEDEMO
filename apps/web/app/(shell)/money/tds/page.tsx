import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { Empty, Hero, Icon, Money, MoneyExact, Notice, PageHeader, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { exportHref } from '../../../../lib/export';

export const metadata = { title: 'Tax deducted · Money' };
export const dynamic = 'force-dynamic';

/**
 * Money › Tax deducted — `docs/design/09-money.html`, "Tax deducted".
 *
 * *Deposit the month's tax by the 7th and file the quarter's 26Q from
 * figures that add up to the vouchers.*
 *
 * The month's deposit is the hero — the one thing this screen is for — and
 * under it the challan (ITNS 281, one line per nature of payment) and the
 * quarter's 26Q, each a document the server built from the vouchers. Both
 * are statutory outputs: each says *Draft: provisional rates* while any rate
 * behind it is provisional (ADR-0014 addendums) and, unless drafts are
 * switched on (STATUTORY_OUTPUTS=draft), is refused rather than produced.
 * The firm's TAN comes from Settings › Company; a project has no challan.
 *
 * **Interest on a late deposit is not worked out here** (s.201(1A)), and
 * neither is the FVU file the department accepts — CA-gated, stated below.
 */
const VALUE = 'Deposit the month’s tax by the 7th and file the quarter’s 26Q from figures that add up to the vouchers.';

const REMARKS: Readonly<Record<string, string>> = {
  C: 'C — higher rate, no valid PAN',
  T: 'T — transporter declaration',
  Y: 'Y — below the threshold',
};

export default async function TaxDeductedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const params = await searchParams;
  const client = await apiAsCaller();
  const [challan, statement] = await Promise.all([
    load(client, API_ROUTES.tdsChallan, { query: params['period'] === undefined ? {} : { period: params['period'] } }),
    load(client, API_ROUTES.form26Q, { query: params['quarter'] === undefined ? {} : { quarter: params['quarter'] } }),
  ]);

  if (challan.kind === 'unreachable' || statement.kind === 'unreachable') return <UnreachableState />;

  const header = (
    <PageHeader
      crumbs={[{ href: '/money/bills', label: 'Money' }]}
      title="Tax deducted"
      help={VALUE}
      sub="the challan for a month, and 26Q for a quarter"
      actions={
        statement.kind === 'ok' ? (
          <a className="btn" href={exportHref('form-26q', { quarter: statement.data.quarter }, ['quarter'])}>
            <Icon name="download" />
            Export 26Q
          </a>
        ) : undefined
      }
    />
  );

  if (challan.kind === 'refused' || statement.kind === 'refused') {
    // a statutory document this deployment was not set to produce: the refusal sits in its card, the rest of the page stands
    return (
      <>
        {header}
        <Section title="Challan" sub="ITNS 281">
          {challan.kind === 'refused' ? <Refusal error={challan.error} /> : <p className="muted">The challan was produced; the 26Q was not.</p>}
        </Section>
        <Section title="26Q" sub="the quarter’s statement">{statement.kind === 'refused' ? <Refusal error={statement.error} /> : <p className="muted">The 26Q was produced; the challan was not.</p>}</Section>
      </>
    );
  }

  const c = challan.data;
  const s = statement.data;
  const here = (overrides: Record<string, string>): string => `/money/tds?${new URLSearchParams({ period: c.period, quarter: s.quarter, ...overrides }).toString()}`;
  const paymentsThisMonth = c.status === 'present' ? c.lines.reduce((n, l) => n + l.payments, 0) : 0;

  return (
    <>
      {header}

      <div data-hero>
        {c.status === 'present' ? (
          <Hero
            ariaLabel={`${c.period} · deposit by ${c.dueOn}`}
            eyebrow={`${c.period} · deposit by ${c.dueOn}`}
            value={<MoneyExact wire={c.total} />}
            sentence={
              <>
                deducted from <b>{paymentsThisMonth} {paymentsThisMonth === 1 ? 'payment' : 'payments'}</b> this month, each line rounded to ten rupees for the challan under Sec 288B — to deposit under ITNS 281
                {c.provisional ? '; every figure a draft on provisional rates until the review is done' : ''}. The quarter’s 26Q is below.
              </>
            }
            side={
              s.status === 'present' ? (
                <>
                  <b>{s.rows.length}</b> deductee {s.rows.length === 1 ? 'line' : 'lines'} this quarter · <Money wire={s.totalTds} />
                </>
              ) : undefined
            }
            actions={null}
          />
        ) : (
          <Section title="No challan without a TAN" sub="ITNS 281">
            <Empty
              illustration="money"
              title="No challan without a TAN"
              action={
                <Link className="btn primary" href="/settings/company">
                  Enter the TAN
                </Link>
              }
            >
              {c.why} It is built from the payments already recorded once the deductor’s TAN is entered in Settings › Company.
            </Empty>
          </Section>
        )}
      </div>

      <Section
        title={`Challan · ${c.period}`}
        sub={c.status === 'present' ? `${String(c.lines.length)} ${c.lines.length === 1 ? 'line' : 'lines'} · ITNS 281, one per nature of payment` : 'ITNS 281'}
        bare
        action={
          <div className="actions">
            <Link className="btn sm" href={here({ period: c.previous })}>
              <Icon name="left" size="sm" />
              {c.previous}
            </Link>
            <Link className="btn sm" href={here({ period: c.next })}>
              {c.next}
              <Icon name="right" size="sm" />
            </Link>
          </div>
        }
      >
        {c.status === 'absent' ? (
          <div className="card-b">
            <p className="muted">{c.why}</p>
          </div>
        ) : (
          <>
            <div className="card-b">
              {c.provisional ? (
                <Notice tone="warn" title="Draft: provisional rates">
                  The tax on this challan was deducted at rates a chartered accountant has not yet verified. Unless drafts are switched on, it is refused — and a draft is never sent to Tally.
                </Notice>
              ) : null}
              <dl className="kv">
                <dt>Deductor</dt>
                <dd>
                  {c.deductor} · TAN {c.tan}
                </dd>
                <dt>Minor head</dt>
                <dd>{c.minorHead}</dd>
                <dt>Due by</dt>
                <dd>{c.dueOn}</dd>
              </dl>
            </div>
            {c.lines.length === 0 ? (
              <div className="card-b">
                <p className="muted">Nothing was deducted this month.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Nature of payment</th>
                      <th>Section</th>
                      <th className="num">Payments</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((line) => (
                      <tr key={`${line.section}-${line.natureCode ?? ''}`}>
                        <td>{line.natureCode ?? <span className="muted">not recorded</span>}</td>
                        <td>{line.section}</td>
                        <td className="num">{line.payments}</td>
                        <td className="num">
                          <MoneyExact wire={line.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Rounded to ten rupees, Sec 288B — to deposit</td>
                      <td className="num">
                        <MoneyExact wire={c.total} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        title={`26Q · ${s.quarter}`}
        sub={s.status === 'present' ? `${String(s.rows.length)} deductee ${s.rows.length === 1 ? 'line' : 'lines'} for the quarter` : 'the quarter’s statement'}
        bare
        action={
          <div className="actions">
            <Link className="btn sm" href={here({ quarter: s.previous })}>
              <Icon name="left" size="sm" />
              {s.previous}
            </Link>
            <Link className="btn sm" href={here({ quarter: s.next })}>
              {s.next}
              <Icon name="right" size="sm" />
            </Link>
          </div>
        }
      >
        {s.status === 'absent' ? (
          <Empty
            illustration="money"
            title="No 26Q without a TAN"
            size="narrow"
            action={
              <Link className="btn primary" href="/settings/company">
                Enter the TAN
              </Link>
            }
          >
            {s.why}
          </Empty>
        ) : (
          <>
            <div className="card-b">
              {s.provisional ? (
                <Notice tone="warn" title="Draft: provisional rates">
                  These lines were computed at rates a chartered accountant has not yet verified. Unless drafts are switched on, the statement is refused.
                </Notice>
              ) : null}
              <dl className="kv">
                <dt>Deductor</dt>
                <dd>
                  {s.deductor} · TAN {s.tan}
                </dd>
                <dt>Period</dt>
                <dd>
                  {s.from} to {s.to}
                </dd>
                <dt>Due by</dt>
                <dd>{s.dueOn}</dd>
                <dt>Tax deducted</dt>
                <dd>
                  <Money wire={s.totalTds} />
                </dd>
              </dl>
            </div>
            {s.rows.length === 0 ? (
              <div className="card-b">
                <p className="muted">No payment under a section this quarter.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Deductee</th>
                      <th>Section</th>
                      <th className="num">Paid</th>
                      <th className="num">Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((row) => (
                      <tr key={row.paymentNumber}>
                        <td>
                          {row.deducteeName}
                          <span className="sub">
                            {row.pan} · {row.paidOn}
                            {row.remark === null ? '' : ` · ${REMARKS[row.remark] ?? row.remark}`}
                          </span>
                        </td>
                        <td>
                          {row.natureCode ?? row.section}
                          {row.tdsRateBp === null ? (
                            <span className="muted"> · nil</span>
                          ) : (
                            <>
                              {` · ${formatBasisPoints(row.tdsRateBp)} `}
                              <Pill tone={s.provisional ? 'warn' : 'ok'}>{s.provisional ? 'Provisional' : 'Verified'}</Pill>
                            </>
                          )}
                        </td>
                        <td className="num">
                          <MoneyExact wire={row.amountPaid} />
                        </td>
                        <td className="num">
                          <MoneyExact wire={row.tdsAmount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>

      <Notice tone="info" title="Interest on a late deposit is not worked out here" icon={<Icon name="info" />}>
        A deposit made after its due date carries interest under s.201(1A). This screen does not compute it, and neither the FVU file the department accepts — ask your chartered accountant for the amount
        before depositing late. The challan and 26Q here are the figures those are drawn up from.
      </Notice>
    </>
  );
}
