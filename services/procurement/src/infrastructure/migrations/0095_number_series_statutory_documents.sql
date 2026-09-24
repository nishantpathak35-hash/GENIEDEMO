-- 0095 — Payment vouchers and tax invoices take their numbers from the same series.
--
-- Forward-only. Never edit this file.
--
-- 0066 made module_type a one-value CHECK and said a second value joins it in
-- the migration that makes that module allocate. Two join here: payment
-- vouchers and tax invoices. Both are allocated inside the transaction that
-- writes the document, which is what keeps them free of gaps (the CA call,
-- CA-09): a document that fails to save rolls its counter back with it.
--
-- The series stays one table and one Settings screen, per tenant (the CA call,
-- CA-09). It lives in `procurement` because that is where numbering was first
-- built; finance never reads it — the host allocates and hands finance the
-- number, in the same transaction.
--
-- A statutory document's number has limits a purchase order's does not
-- (statute text, CGST Rule 46(b), CA-17): letters, digits, hyphen and slash
-- only, and at most sixteen characters. The characters of the parts a person
-- types are held here. The length depends on the year and the counter, so it is
-- refused when a format is saved and again when a number is allocated.

ALTER TABLE procurement.number_series
  DROP CONSTRAINT number_series_module_type_check,
  ADD CONSTRAINT number_series_module_type_check
    CHECK (module_type IN ('purchase_order', 'payment_voucher', 'tax_invoice')),
  ADD CONSTRAINT number_series_statutory_characters_check CHECK (
    module_type = 'purchase_order'
    OR (prefix ~ '^[A-Za-z0-9/-]+$' AND separator IN ('', '-', '/'))
  );
