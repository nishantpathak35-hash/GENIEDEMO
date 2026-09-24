-- 0022 — Record what a BOQ rate means.
--
-- Forward-only. Never edit `0011_boq.sql`; this documents it.
--
-- No column changes. `0011` says `rate` is "What the client is charged. Paise."
-- — which does not answer the question that decides whether every imported line
-- is right or overstated by the GST rate.
--
-- **The answer, already taken in the domain and unstated here until now: a BOQ
-- rate is PRE-TAX.** `services/projects/src/domain/boq.ts:98-100` takes a
-- `preTaxRate` and says it "refuses to guess"; `rate-analysis.ts:18-20` returns
-- the pre-tax rate and the tax separately and leaves the composition to the
-- caller. The column has been carrying that meaning without saying so, which is
-- two declarations of one fact with only one of them written down.
--
-- **PO-16 stays open, and it is a different question.** PO-16 asks what tenant
-- #1 *intended*, because `boq.js:365` imports an estimation item using
-- `final_rate_with_gst` as the unit rate with quantity hardcoded to 1 —
-- embedding tax inside a rate and losing the quantity at the same time. If
-- their BOQs were quoted tax-inclusive, their historic lines need converting on
-- import, not reinterpreting. That is a reconciliation input for M2.5 and only
-- the customer can answer it.
--
-- What does not depend on their answer is what this column means *going
-- forward*. A column whose tax treatment is ambiguous cannot be built on, and
-- slices 3-7 build on it.
--
-- This is a modelling decision, not a statutory one, so it needs no CA: the GST
-- rate that applies to a works contract is CA-16 and is separately open. Naming
-- the rate pre-tax does not decide what rate applies to it.

COMMENT ON COLUMN projects.boq_items.rate IS
  'What the client is charged per unit, PRE-TAX, in paise. Tax is never '
  'embedded in this figure — the legacy boq.js:365 imports '
  'final_rate_with_gst as a unit rate with quantity 1, which is PO-16 and is '
  'about their historic data, not about this column. Line value is '
  'quantity_micros x rate, computed by lineAmount, never supplied.';

COMMENT ON COLUMN projects.boq_items.cost_rate IS
  'What the work costs us per unit, in paise. NULL means UNKNOWN and must stay '
  'distinguishable from zero: BoqView.js:137 invents a missing cost rate as 78 '
  'percent of the selling rate, with no stated basis, and every margin on the '
  'screen then rests on it (BOQ-02, PO-15).';

COMMENT ON COLUMN projects.boq_items.quantity_micros IS
  'Whole units x 1,000,000. Scaled integer rather than a float, because the '
  'line value is quantity x rate and a float quantity re-enters money through '
  'the back door. 12.375 sqm is 12375000.';
