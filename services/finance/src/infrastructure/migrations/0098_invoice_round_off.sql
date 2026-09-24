-- 0098 — A tax invoice's total is rounded once, and its round-off is a line of its own.
--
-- Forward-only. Never edit this file.
--
-- The CA's answer to CA-02 (CA answers document, reviewed by the CA; CA details
-- to follow; provisional): "Rounding shall be applied only to the final total
-- invoice value. The taxable/basic value and the GST components shall retain
-- their calculated values and shall not be individually rounded to the nearest
-- rupee. Any round-off adjustment will therefore be posted only at the
-- invoice-total level."
--
-- 0097 rounded each head to the rupee. From here each head is kept to the paise,
-- the total — taxable value plus every head — is rounded to the rupee under
-- Sec 170, and the difference is `round_off`, shown on the invoice and posted in
-- its Tally voucher.
--
-- An invoice raised before this has no round-off: its total is the sum of its
-- parts, so 0 keeps every CHECK true.

ALTER TABLE finance.client_invoices
  ADD COLUMN round_off bigint NOT NULL DEFAULT 0,
  DROP CONSTRAINT client_invoices_total_check,
  ADD CONSTRAINT client_invoices_total_check CHECK (total = taxable + cgst + sgst + igst + round_off),
  -- Rounding to the nearest rupee moves a total by fifty paise at most, either way.
  ADD CONSTRAINT client_invoices_round_off_check CHECK (round_off BETWEEN -50 AND 50);
