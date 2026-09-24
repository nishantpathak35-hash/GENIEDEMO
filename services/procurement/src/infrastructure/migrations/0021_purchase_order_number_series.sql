-- 0021 — Per-tenant purchase-order number allocation.
--
-- Forward-only. Never edit this file.
--
-- **Why this exists.** `POST /api/v1/purchase-orders` requires a `number`, and
-- until now nothing allocated one. The legacy answer is
-- `NumberSeriesService.peekNextNumber` (`read.js:189`), which a screen calls to
-- fill the form.
--
-- **PO-24 — the legacy number is a suggestion, and that is live.** `peekNextNumber`
-- says so in its own doc comment: *"Peeks at the next unique number for a module
-- type without incrementing the counter."* `POsView.js:301` puts the result in
-- the form. Two users opening the modal at the same time both see `PO-0042`,
-- both submit, and the second one collides. This is the same category as PO-22
-- — a control that does not engage — except that it is reachable, because
-- `savePO` works.
--
-- Here the number is allocated **at submit, inside the transaction that inserts
-- the order**, so two concurrent creates take the row lock in turn and get
-- different numbers. A form may still preview one; the preview is not what is
-- stored.
--
-- **Gaps are accepted.** A rolled-back insert burns a number. Consecutive
-- serials are a GST Rule 46 requirement on a *tax invoice* — a document the
-- supplier issues — and M1.md:272 already scopes the per-tenant counter to
-- exactly that. A purchase order is neither an invoice nor supplier-issued, so
-- the requirement does not reach it, and gapless allocation would make every
-- PO creation serialise on a lock held until commit.
--
-- **Deliberately scoped to purchase orders.** Not a general `document_series`
-- covering invoices, payment vouchers and challans: invoice numbering *is* Rule
-- 46 territory, it is CA-adjacent, and a general abstraction built here would
-- commit slices 8-10 to a design that cannot be evaluated yet.
--
-- **The format is per-tenant configuration, not a constant.** The legacy already
-- stores prefix, separator, padding and a financial-year format per module. `PO`
-- and 4 digits ship as a *provisional* default, marked as such, for the same
-- reason as PO-18: an inherited value that nobody has confirmed must say so.

CREATE TABLE procurement.number_series (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  -- The counter. `bigint`, and it only ever moves forward.
  last_number bigint NOT NULL DEFAULT 0,

  -- Format. `PO` + `-` + 4 digits gives `PO-0001`.
  prefix      text    NOT NULL DEFAULT 'PO',
  separator   text    NOT NULL DEFAULT '-',
  padding     integer NOT NULL DEFAULT 4,

  -- 'provisional' until a person confirms the format for this tenant. Surfaced
  -- by the API, exactly as projects.health_thresholds does, so a screen can say
  -- whether the numbering it is showing was agreed or inherited.
  status      text NOT NULL DEFAULT 'provisional',
  set_by      text,
  set_on      date,

  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One row per tenant: the tenant IS the key, as in projects.health_thresholds.
  -- Nothing references this table, so there is no composite FK to satisfy.
  CONSTRAINT number_series_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT number_series_last_number_check CHECK (last_number >= 0),
  CONSTRAINT number_series_padding_check     CHECK (padding BETWEEN 1 AND 12),
  CONSTRAINT number_series_prefix_check      CHECK (length(prefix) BETWEEN 1 AND 16),
  CONSTRAINT number_series_separator_check   CHECK (length(separator) <= 4),
  CONSTRAINT number_series_status_check      CHECK (status IN ('provisional', 'confirmed')),
  -- A confirmed format must say who confirmed it and when, or the status is a
  -- claim rather than a record. Same shape as finance.tax_rates, deliberately.
  CONSTRAINT number_series_confirmed_evidence_check CHECK (
    status <> 'confirmed' OR (set_by IS NOT NULL AND set_on IS NOT NULL)
  )
);

ALTER TABLE procurement.number_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.number_series FORCE  ROW LEVEL SECURITY;

-- The pair, never one. Permissive policies are OR-ed, so a later
-- `USING (true)` would open a single-permissive table while still satisfying
-- "the table has a policy". The RESTRICTIVE half is what makes that impossible.
CREATE POLICY tenant_isolation ON procurement.number_series AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.number_series AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.number_series FROM PUBLIC;
-- No TRUNCATE: it is not subject to RLS, so granting it would hand one tenant a
-- way to reset every tenant's counter.
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.number_series TO app_runtime;

COMMENT ON TABLE procurement.number_series IS
  'Per-tenant purchase-order numbering. Ships with no rows: the allocator '
  'inserts one on first use rather than falling through to 1, so a tenant '
  'without a row can neither 500 nor silently restart the series. Gaps are '
  'accepted — GST Rule 46 consecutive serials apply to tax invoices, not '
  'purchase orders (M1.md:272).';

COMMENT ON COLUMN procurement.number_series.last_number IS
  'The last number handed out. Bumped by UPDATE ... RETURNING inside the same '
  'transaction that inserts the order, so concurrent creates cannot collide. '
  'The legacy peeks without incrementing (read.js:189), which is why two users '
  'can both be shown PO-0042 (PO-24).';

COMMENT ON COLUMN procurement.number_series.status IS
  'provisional until a person confirms the format for this tenant. PO/4 digits '
  'is inherited from the legacy default and has never been chosen (cf. PO-18).';
