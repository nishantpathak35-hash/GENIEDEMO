-- 0020 — Record what `gross` means on a purchase order.
--
-- Forward-only. Never edit `0009_purchase_orders.sql`; this documents it.
--
-- No column changes. `0009` already has the right shape and the right CHECK;
-- what it does not have is the record of a decision, and the decision is the
-- part that will be re-derived wrongly by whoever touches this next.
--
-- **PO-23.** The legacy create path — `POService.ts:48`, and again at `:160` —
-- computes `totalVal = subt + gstSum - tdsAmt` and writes that single value to
-- both `po_value` and `revised_po_value`. So the stored order value is net of a
-- deduction that has not been made, against an invoice that does not exist yet.
-- It is neither what the order is worth to the vendor nor what the vendor will
-- be paid. Any rollup summing `po_value` under-states committed spend by the
-- TDS, which is exactly what `committedSpend` in `services/projects` does.
--
-- Here `gross = taxable + gst`, and TDS is not netted anywhere on this table.
-- That is not a statutory judgement — declining to compute a figure needs no
-- ruling. It is a modelling one: an order records what was ordered, and a
-- deduction is an event on the payment that discharges it. TDS is computed once
-- there is a payment to deduct it from, in `services/finance`, under a rate a
-- CA has confirmed (CA-05..CA-08).
--
-- **This is also a data-migration hazard, not only a defect row.** Legacy
-- `po_value` cannot be loaded into `gross` as it stands: it must be un-netted
-- first, using the `tds_amount` stored alongside it, or every imported order
-- silently understates. See STACK-MIGRATION PO-23.

COMMENT ON COLUMN procurement.purchase_orders.gross IS
  'taxable + gst, enforced by purchase_orders_money_check. TDS is NOT netted '
  'here: the legacy POService.ts:48 wrote po_value net of TDS, which made the '
  'stored order value neither the order nor the payment (PO-23). A deduction '
  'belongs to the payment that discharges the order, in services/finance.';

COMMENT ON COLUMN procurement.purchase_orders.taxable IS
  'Sum of per-line quantity x unit rate, rounded to paise per line. Never '
  'supplied by a caller — there is no request field for it.';

COMMENT ON COLUMN procurement.purchase_orders.gst IS
  'Sum of per-line GST at paise precision. Sec 170 rounding is per invoice per '
  'tax head and happens at the invoice in services/finance, not per line and '
  'not on the order.';

COMMENT ON COLUMN procurement.purchase_orders.number IS
  'Human-facing, tenant-scoped, and free to change: renaming updates this row '
  'and nothing else. In the legacy it is the primary key, and write.js:142 '
  'cascades a rename across five tables with loose UPDATEs and no transaction '
  'while missing boq_items and vendor_retention_ledger, which also carry po_no '
  '(PO-19).';
