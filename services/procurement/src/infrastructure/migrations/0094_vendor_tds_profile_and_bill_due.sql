-- 0094 — What a payment to a vendor is deducted under, and when a bill is due.
--
-- Forward-only. Never edit this file.
--
-- ============================================================================
-- THE VENDOR'S TDS PROFILE
-- ============================================================================
--
-- A section alone does not decide a deduction (CA-07). Four facts about the
-- payee do, and each is recorded here by a person, never inferred:
--
--   tds_section             194C, 194I, 194J or 194Q — or NULL, nothing deducted
--   tds_payee_class         for 194I, plant or building; for 194J, technical or
--                           professional. 194C's class is read from the PAN's
--                           fourth character; 194Q has none.
--   pan_inoperative         a PAN on file that is inoperative is treated as no
--                           PAN at all (statute text, CA-11)
--   transporter_declared_on the date of a 194C(6) declaration on file
--
-- The rates themselves are finance's, provisional, and are not stored here.

ALTER TABLE procurement.vendors
  ADD COLUMN tds_section text,
  ADD COLUMN tds_payee_class text,
  ADD COLUMN pan_inoperative boolean NOT NULL DEFAULT false,
  ADD COLUMN transporter_declared_on date,
  ADD CONSTRAINT vendors_tds_section_check
    CHECK (tds_section IS NULL OR tds_section IN ('194C', '194I', '194J', '194Q')),
  ADD CONSTRAINT vendors_tds_payee_class_check CHECK (
    tds_payee_class IS NULL
    OR (tds_section = '194I' AND tds_payee_class IN ('plant_machinery', 'land_building'))
    OR (tds_section = '194J' AND tds_payee_class IN ('technical', 'professional'))
  ),
  ADD CONSTRAINT vendors_transporter_declaration_check
    CHECK (transporter_declared_on IS NULL OR tds_section = '194C');

-- ============================================================================
-- A BILL BECOMES A PAYABLE WHEN SOMEBODY ACKNOWLEDGES IT
-- ============================================================================
--
-- 0050 stored a vendor's claim and nothing derived from it. Acknowledging a
-- bill is the staff decision that turns a claim into something owed, and it
-- records the three things a payment needs and the claim does not say:
--
--   taxable_amount, gst_amount  the invoice's own split. TDS is computed on the
--                               value excluding GST shown separately (CA-08), so
--                               the split is recorded, never assumed. The two
--                               must add up to exactly what was claimed.
--   due_on                      when it is payable. "Due this week" is read from
--                               this and nothing else (DATA-02).
--
-- paid_on and payment_id are written by the host in the same transaction as
-- finance records the payment, so procurement never reads finance's tables and
-- a bill is never shown unpaid after its payment has landed.

ALTER TABLE procurement.vendor_bills
  ADD COLUMN taxable_amount  bigint,
  ADD COLUMN gst_amount      bigint,
  ADD COLUMN due_on          date,
  ADD COLUMN acknowledged_by uuid,
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN paid_on         date,
  ADD COLUMN payment_id      uuid,
  ADD CONSTRAINT vendor_bills_split_pair_check
    CHECK ((taxable_amount IS NULL) = (gst_amount IS NULL)),
  ADD CONSTRAINT vendor_bills_split_sum_check CHECK (
    taxable_amount IS NULL
    OR (taxable_amount >= 0 AND gst_amount >= 0 AND taxable_amount + gst_amount = amount_claimed)
  ),
  -- NOT VALID: a bill acknowledged before this migration has no split to show.
  -- Every acknowledgement from here on is held to it.
  ADD CONSTRAINT vendor_bills_acknowledged_check CHECK (
    state <> 'acknowledged'
    OR (taxable_amount IS NOT NULL AND due_on IS NOT NULL AND acknowledged_at IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT vendor_bills_paid_pair_check CHECK ((paid_on IS NULL) = (payment_id IS NULL)),
  ADD CONSTRAINT vendor_bills_paid_acknowledged_check
    CHECK (paid_on IS NULL OR state = 'acknowledged');

CREATE INDEX vendor_bills_payable_idx
  ON procurement.vendor_bills (tenant_id, due_on)
  WHERE state = 'acknowledged' AND paid_on IS NULL;
