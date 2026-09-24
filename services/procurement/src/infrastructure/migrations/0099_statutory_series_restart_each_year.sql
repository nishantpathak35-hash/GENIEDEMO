-- 0099 — Payment vouchers and tax invoices restart their numbers each financial year.
--
-- Forward-only. Never edit this file.
--
-- The CA's answer to CA-09 (CA answers document, reviewed by the CA; CA details
-- to follow; provisional): "Must the counter reset each financial year? Yes. The
-- counter shall restart for each financial year." The statutory series ran on
-- across years unless a tenant chose otherwise; `number-series.ts` now restarts
-- them by default.
--
-- A series row that the first allocation created carries the old default and
-- nobody's decision — its status is still 'provisional' — so it takes the new
-- one. A format somebody saved is 'confirmed', and is left exactly as it is.
-- Only a series with the year in its number may restart
-- (number_series_reset_needs_fy_check).
--
-- Nothing is renumbered. A series used this year already has this year in
-- `series_fy`, so its next number follows on, and the first restart is the
-- first number of the next financial year.
--
-- Migrations connect directly as the bootstrap role, not as app_runtime through
-- the pooler (docker-compose.yml), so the tenant policies do not narrow this.

UPDATE procurement.number_series
   SET reset_each_fy = true, updated_at = now()
 WHERE module_type IN ('payment_voucher', 'tax_invoice')
   AND status = 'provisional'
   AND include_fy
   AND NOT reset_each_fy;
