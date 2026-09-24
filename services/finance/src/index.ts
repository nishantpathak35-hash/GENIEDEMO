/**
 * `services/finance` — payments, TDS, GST, client invoices, Tally staging.
 *
 * **Nothing in this package contains a statutory rate.** Rates arrive through
 * the effective-dated table, every value in which is `provisional` until a
 * named chartered accountant signs it off (ADR-0014, and CA-05 in
 * docs/statutory/QUESTIONS-FOR-CA.md).
 *
 * The mechanisms here — where rounding happens, how a rate is selected for a
 * date, how a voucher is built and how its acceptance is judged — are separable
 * from the numbers, and are correct independently of them.
 */

export {
  rateOn,
  unverified,
  financialYearOf,
  RateLookupError,
  type RateRow,
  type EffectiveDate,
  type Provenance,
} from './domain/rate-table.js';

export {
  splitGst,
  invoiceTotal,
  totalGst,
  type SupplyType,
  type GstBreakdown,
  type InvoiceTotal,
} from './domain/gst.js';

export {
  escapeXml,
  tallyDate,
  buildVoucherXml,
  tallyAccepted,
  TallyXmlError,
  type VoucherInput,
  type LedgerEntry,
} from './domain/tally-xml.js';

export {
  submit,
  approve,
  reject,
  remit,
  cancel,
  canTransition,
  effectiveAmount,
  netPayable,
  summarise,
  isOpen,
  PaymentRequestError,
  PR_STATES,
  type PaymentRequest,
  type PrState,
  type ApproveInput,
  type RemitInput,
  type OutflowSummary,
} from './domain/payment-request.js';

export {
  computeDeduction,
  deductionBase,
  thresholdOutcome,
  aggregate,
  type DeductionBase,
  type DeductionInput,
  type Deduction,
  type ThresholdRule,
  type ThresholdState,
  type ThresholdOutcome,
} from './domain/tds.js';

export {
  connectorRoutes,
  compareSemver,
  type ConnectorDeps,
  type ConnectorAuthenticator,
  type VoucherQueue,
  type VoucherResult,
} from './api/connector.js';

/**
 * The tax-rate surface. Reads and records rates; computes with none of them.
 * Every row it writes is provisional, and no route marks one verified.
 */
export {
  CA_CALL,
  STATUTE_TEXT,
  CATALOGUE_EFFECTIVE_FROM,
  TDS_SECTIONS,
  THRESHOLD_KINDS,
  PAYEE_CLASSES,
  RATE_KEYS,
  PROVISIONAL_RATES,
  PROVISIONAL_THRESHOLDS,
  payeeClassFromConstitution,
  type TdsSection,
  type ThresholdKind,
  type CatalogueRate,
  type CatalogueThreshold,
} from './domain/statutory-catalogue.js';

export {
  listTdsThresholds,
  loadProvisionalCatalogue,
  type TdsThresholdRow,
} from './application/tax-rates.js';

export {
  STATUTORY_OUTPUTS,
  ProvisionalOutputRefused,
  assertStatutoryOutputAllowed,
  environmentFrom,
  type StatutoryOutput,
  type Environment,
  type ProvenancedRow,
  type RefusedRow,
} from './domain/go-live-gate.js';

export {
  PaymentRuleMissing,
  TDS_REASONS,
  settle,
  tdsForPayment,
  type PayeeFacts,
  type PaymentRules,
  type PaymentTds,
  type PaymentTdsInput,
  type TdsReason,
  type ThresholdRow,
  type YearSoFar,
} from './domain/payment-tds.js';

export {
  getVendorPayment,
  listVendorPayments,
  loadPaymentRules,
  paymentsSummary,
  prepareBillPayment,
  recordBillPayment,
  RetentionReleaseRefused,
  prepareRetentionRelease,
  recordRetentionRelease,
  retentionByOrder,
  retentionTotals,
  type RetentionTotals,
  type BillPaymentFacts,
  type PaymentPreparation,
  type PaymentsSummary,
  type VendorPayment,
  type VendorPaymentPage,
} from './application/payments.js';

export {
  MINOR_HEAD_TDS_BY_DEDUCTOR,
  PAN_NOT_AVAILABLE,
  StatementPeriodInvalid,
  challanAmount,
  challanDueOn,
  form26QDueOn,
  natureOfPaymentCode,
  parseQuarter,
  quarterKey,
  quarterOf,
  remarkCode,
  type Quarter,
} from './domain/tds-statements.js';

export {
  challanFor,
  form26QFor,
  type ChallanLine,
  type ChallanResponse,
  type Deductor,
  type Form26QResponse,
  type Form26QRow,
  type StatementAbsent,
} from './application/tds-statements.js';

export { TaxInvoiceRefused, invoiceTax, stateOfGstin, supplyTypeFor } from './domain/tax-invoice.js';

export {
  ClientInvoiceNotFound,
  cancelClientInvoice,
  getClientInvoice,
  listClientInvoices,
  prepareClientInvoice,
  receivablesSummary,
  recordClientInvoice,
  recordClientReceipt,
  type ClientInvoice,
  type ClientInvoicePage,
  type InvoicePreparation,
  type ReceivablesSummary,
} from './application/client-invoices.js';

export { receivablesAgeing, moneyByMonth, invoicedByProject, type ReceivablesAgeing } from './application/dashboard.js';
export { ageing, bucketOf, monthSeries, sharePct, type Ageing, type AgeingBucket, type MonthSeries } from './domain/ageing.js';

export { financeRoutes } from './api/routes.js';
export { connectorPosting, type ConnectorPosting } from './application/connector-presence.js';
export {
  listTaxRates,
  recordTaxRate,
  TaxRateError,
  type TaxRateRow,
  type RecordTaxRateInput,
} from './application/tax-rates.js';
