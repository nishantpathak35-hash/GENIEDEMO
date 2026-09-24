import type { ReactNode } from "react";
import Link from 'next/link';
import { API_ROUTES } from "@cog/contracts";
import { apiAsCaller } from "../../../../lib/api";
import { terms } from "../../../../lib/terms";
import { Absent, AbsentNotice, Empty, Icon, Notice, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from "@cog/design-system";
import { formatBasisPoints, formatIndianRupees } from "@cog/money";
import {
  CompleteTaxReviewForm,
  LoadStatutoryValuesForm,
  TaxRateForm,
  TaxSetupForm,
} from "../forms";

export const metadata = { title: "Tax · Settings" };
export const dynamic = "force-dynamic";

/** Settings › Tax — the two-minute review (`11-settings.html`). */
const HEADER = (
  <PageHeader
    crumbs={[{ href: '/settings', label: 'Settings' }]}
    title="Review your tax settings"
    sub="About two minutes. The rates are the ones every Indian business uses; three questions are about you."
  />
);

/**
 * The tax-rate table and its thresholds — every value provisional.
 *
 * **What computes with these, and how that is kept honest.** Payments, the
 * challan, 26Q content, Tally vouchers and tax invoices compute with the rows
 * listed here (ADR-0014, addendum). Every row is provisional: each names where
 * it came from — relayed from a CA call, or statute text — and the question in
 * `QUESTIONS-FOR-CA.md` that would settle it. With drafts switched on
 * (`STATUTORY_OUTPUTS=draft`) the outputs say *Draft: provisional rates*;
 * otherwise they are refused.
 *
 * **Nothing here marks a row verified**, and no route can. A person promotes a
 * row, in the database, with the CA's name, membership number, firm and date.
 *
 * The values come from `services/finance`'s catalogue through the load button,
 * never typed in from the design's illustrative sample and never copied from
 * the legacy, whose two rate tables disagree with each other (CA-05).
 */
export default async function TaxRatesPage(): Promise<ReactNode> {
  const client = await apiAsCaller();
  const [rates, setup, thresholdList, vendors, t] = await Promise.all([
    load(client, API_ROUTES.listTaxRates, {}),
    load(client, API_ROUTES.taxSetup, {}),
    load(client, API_ROUTES.listTdsThresholds, {}),
    // the GSTIN-missing count: active vendors with no PAN or GSTIN, whose payments deduct at the higher rate (206AA)
    load(client, API_ROUTES.listVendors, { query: { limit: '1' } }),
    terms(),
  ]);
  const withoutTaxIds = vendors.kind === 'ok' ? vendors.data.summary.withoutTaxIds.count : null;

  if (rates.kind === "unreachable") return <UnreachableState />;
  if (rates.kind === "refused") {
    return (
      <>
        {HEADER}
        <Section title="Rates that apply to everyone">
          <Refusal error={rates.error} />
        </Section>
      </>
    );
  }

  const items = rates.data.items;
  const thresholds = thresholdList.kind === "ok" ? thresholdList.data.items : [];
  const verifiedCount = items.filter((r) => r.status === "verified").length;
  // The two answers and the review's state are the server's (0084); the
  // screen decides only which step to draw as done.
  const answers =
    setup.kind === "ok"
      ? setup.data
      : {
          worksContractBundling: null,
          transporterPanDeclared: null,
          buyerTurnoverOver10Crore: null,
          answeredAt: null,
          answeredBy: null,
          reviewCompletedAt: null,
          reviewCompletedBy: null,
        };
  const answered =
    answers.worksContractBundling !== null && answers.transporterPanDeclared !== null;
  const reviewed = answers.reviewCompletedAt !== null;

  return (
    <>
      {withoutTaxIds === null || withoutTaxIds === 0 ? (
        HEADER
      ) : (
        <PageHeader
          crumbs={[{ href: '/settings', label: 'Settings' }]}
          title="Review your tax settings"
          sub="About two minutes. The rates are the ones every Indian business uses; three questions are about you."
          status={
            <Link className="warn-chip" href="/vendors?status=active">
              <Icon name="alert" size="sm" />
              No PAN or GSTIN for {withoutTaxIds} {withoutTaxIds === 1 ? t.vendorLower : t.vendorsLower} — deducted at the higher rate
            </Link>
          }
        />
      )}
      <Notice tone="warn" title="Every rate here is provisional">
        Payments, challans, 26Q content, Tally vouchers and tax invoices
        compute with these rates and are marked as drafts on provisional rates.
        Unless drafts are switched on, they are refused until a chartered accountant&rsquo;s
        name, membership number, firm and date promote each row.
      </Notice>

      <div className="two even">
        <Section bare title="Rates that apply to everyone" sub="nothing to type">
          {items.length === 0 ? (
            <div className="card-b">
              <Empty illustration="documents" title="No rates loaded yet">
                Load the provisional statutory values: each arrives marked
                provisional, with where it came from and the question that
                would settle it.
              </Empty>
              <LoadStatutoryValuesForm />
            </div>
          ) : (
            <>
              {items.map((rate) => (
                <div className="taxrow" key={rate.id}>
                  <div>
                    <b>{taxRateLabel(rate.key)}</b>
                    <small>
                      {rate.payeeClass === null
                        ? "Any payee"
                        : payeeClassLabel(rate.payeeClass)}
                      {" · effective "}
                      {rate.effectiveFrom}
                      {rate.source === null ? null : ` · ${sourceLabel(rate.source)}`}
                      {rate.questionRef === null ? null : ` · ${rate.questionRef}`}
                    </small>
                  </div>
                  <div className="val">{formatBasisPoints(rate.rateBp)}</div>
                  <Pill tone={rate.status === "verified" ? "ok" : "warn"}>
                    {rate.status === "verified" ? "Verified" : "Provisional"}
                  </Pill>
                </div>
              ))}
              {items
                .filter((r) => r.status === "verified")
                .map((rate) => (
                  // A real provenance line, built only from what the row
                  // carries — verifiedBy/verifiedOn/statute — never a
                  // manufactured sentence. A verified row with any of the
                  // three still absent says so rather than guessing.
                  <div className="provenance" key={`${rate.id}-provenance`}>
                    <Icon name="check" />
                    <span>
                      {taxRateLabel(rate.key)} verified by{" "}
                      {rate.verifiedBy ?? <Absent why="No verifier recorded" />}
                      {" on "}
                      {rate.verifiedOn ?? (
                        <Absent why="No verification date recorded" />
                      )}
                      {rate.statute === null ? null : (
                        <> under {rate.statute}</>
                      )}
                      .
                    </span>
                  </div>
                ))}
              <div className="card-b">
                <Pager
                  shown={{ from: 1, to: items.length }}
                  of={items.length}
                  unit={items.length === 1 ? "rate" : "rates"}
                />
              </div>
            </>
          )}
        </Section>

        <div>
          <Section bare title="Three questions about your business">
            <div className="card-b">
              {answered ? (
                <p className="muted">
                  Answered by {answers.answeredBy ?? "somebody"} on{" "}
                  {answers.answeredAt?.slice(0, 10) ?? "an unknown date"}. Change an answer and
                  the review reopens.
                </p>
              ) : (
                <p className="muted">
                  Each changes which statutory rule applies. The rule itself is recorded on the
                  statutory side by your adviser; this records the facts about your business.
                </p>
              )}
              <TaxSetupForm current={answers} />
            </div>
          </Section>

          <ol className="steps">
            <li className={verifiedCount > 0 ? "done" : "now"}>
              <span className="tick" aria-hidden="true">
                {verifiedCount > 0 ? <Icon name="check" size="sm" /> : null}
              </span>
              <div>
                Statutory rates
                <small>
                  {verifiedCount} of {items.length} recorded rate
                  {items.length === 1 ? "" : "s"} verified
                </small>
              </div>
            </li>
            <li className={answered ? "done" : verifiedCount > 0 ? "now" : "todo"}>
              <span className="tick" aria-hidden="true">
                {answered ? <Icon name="check" size="sm" /> : null}
              </span>
              <div>
                Three questions about your business
                <small>
                  {answered
                    ? `Answered${answers.answeredBy === null ? "" : ` by ${answers.answeredBy}`}`
                    : "Not answered yet"}
                </small>
              </div>
            </li>
            <li className={reviewed ? "done" : answered ? "now" : "todo"}>
              <span className="tick" aria-hidden="true">
                {reviewed ? <Icon name="check" size="sm" /> : null}
              </span>
              <div>
                Review complete
                <small>
                  {reviewed
                    ? `Marked complete${answers.reviewCompletedBy === null ? "" : ` by ${answers.reviewCompletedBy}`} on ${answers.reviewCompletedAt?.slice(0, 10) ?? ""}. The rates stay provisional until a CA promotes them.`
                    : answered
                      ? "Read the rates and the answers, then mark the review complete."
                      : "Answer the three questions first."}
                </small>
                {reviewed || !answered ? null : <CompleteTaxReviewForm />}
              </div>
            </li>
          </ol>
        </div>
      </div>

      <Section bare title="Thresholds" sub="below these, nothing is deducted">
        {thresholds.length === 0 ? (
          <div className="card-b">
            <Empty illustration="documents" title="No thresholds loaded yet">
              Without a threshold, a payment is tested against nothing — so
              payments refuse to compute until these are loaded.
            </Empty>
            <LoadStatutoryValuesForm />
          </div>
        ) : (
          thresholds.map((threshold) => (
            <div className="taxrow" key={threshold.id}>
              <div>
                <b>
                  {threshold.section} — {thresholdKindLabel(threshold.kind)}
                </b>
                <small>
                  {"effective "}
                  {threshold.effectiveFrom}
                  {threshold.source === null ? null : ` · ${sourceLabel(threshold.source)}`}
                  {threshold.questionRef === null ? null : ` · ${threshold.questionRef}`}
                </small>
              </div>
              <div className="val">{formatIndianRupees(threshold.amount)}</div>
              <Pill tone={threshold.status === "verified" ? "ok" : "warn"}>
                {threshold.status === "verified" ? "Verified" : "Provisional"}
              </Pill>
            </div>
          ))
        )}
      </Section>

      <Section bare title="Record a rate">
        <div className="card-b">
          <TaxRateForm />
        </div>
      </Section>

      <AbsentNotice title="There is no button that marks a rate verified">
        Verification needs a name, a date and a statute, and the table refuses a
        verified row without all three. That path does not exist over HTTP on
        purpose: the one failure this whole design is built to prevent is a
        number that looks verified because a screen let somebody tick a box.
      </AbsentNotice>
    </>
  );
}

/** The design's own vocabulary for the catalogue's keys; anything else falls back to the raw key, spaced out. */
const TAX_RATE_LABELS: Record<string, string> = {
  gst_works_contract: "GST on works contracts",
  gst_goods_separate: "GST on goods supplied separately",
  tds_194c: "TDS on contractor payments (194C)",
  tds_194i: "TDS on rent (194I)",
  tds_194j: "TDS on professional and technical fees (194J)",
  tds_194q: "TDS on purchases of goods (194Q)",
  tds_206aa: "TDS when no valid PAN is held (206AA)",
  tds_206aa_194q: "TDS on purchases of goods when no valid PAN is held (206AA proviso, 194Q)",
};

const PAYEE_CLASS_LABELS: Record<string, string> = {
  individual_huf: "Individuals and HUFs",
  other: "Companies, firms and everyone else",
  plant_machinery: "Plant, machinery or equipment",
  land_building: "Land, building, furniture or fittings",
  technical: "Technical services",
  professional: "Professional services",
};

const THRESHOLD_KIND_LABELS: Record<string, string> = {
  single_payment: "nothing deducted up to this, in one payment",
  annual_aggregate: "nothing deducted up to this, in the year",
  monthly: "nothing deducted up to this, for a month",
  annual_excess: "deducted only above this, in the year",
};

function payeeClassLabel(payeeClass: string): string {
  return PAYEE_CLASS_LABELS[payeeClass] ?? `Payee class: ${payeeClass}`;
}

function thresholdKindLabel(kind: string): string {
  return THRESHOLD_KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

/** The source, in the screen's words. The long form names the CA call it came from. */
function sourceLabel(source: string): string {
  if (source.startsWith("relayed")) return "relayed from the CA call";
  if (source === "statute text") return "from the statute text";
  return source;
}

function taxRateLabel(key: string): string {
  return TAX_RATE_LABELS[key] ?? key.replace(/_/g, " ");
}
