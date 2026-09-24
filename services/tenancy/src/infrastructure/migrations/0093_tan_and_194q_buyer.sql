-- 0093 — The TAN, and the one fact 194Q needs about the buyer.
--
-- Forward-only. Never edit this file.
--
-- TAN. A challan and 26Q content are refused without one. It is never
-- defaulted and never invented: the legacy `tdsChallan281.js:54` writes a
-- fabricated TAN into generated 26Q content when one is missing, which is the
-- failure this column exists to refuse. NULL means not supplied.
--
-- buyer_turnover_over_194q. Section 194Q applies only when the buyer's turnover
-- in the previous financial year exceeded ten crore rupees (statute text,
-- CA-15). That is a fact about this organisation, answered on Settings › Tax
-- beside the two answers 0084 records, and carried by the same who-and-when.
-- NULL is unanswered, and an unanswered buyer has nothing deducted under 194Q.

ALTER TABLE tenancy.company_profile
  ADD COLUMN tan text,
  ADD CONSTRAINT company_profile_tan_check
    CHECK (tan IS NULL OR tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$');

ALTER TABLE tenancy.tax_setup
  ADD COLUMN buyer_turnover_over_194q boolean;
