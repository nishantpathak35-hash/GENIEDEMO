-- Number series, per module and per financial year.
--
-- Migration `0021` built one counter per tenant and its own comment said the
-- fuller design "stores prefix, separator, padding and a financial-year format
-- per module". This is that, and it is an ALTER rather than a second table
-- because the counter it carries is live — a new table would either abandon the
-- numbers already issued or need a backfill that can silently restart a series.
--
-- **What the legacy screen does that is NOT ported.**
-- `components/views/settings/SettingsNumberSeriesTab.js` renders
-- `current_number` as an editable field. Lowering it re-issues numbers that
-- already exist on documents somebody has sent to a vendor, and there is no
-- constraint anywhere in that app to stop it. The counter is not writable from
-- any route here; the format around it is.
--
-- `_syncWithExistingPOs` is not ported either. It reads the trailing digits off
-- existing purchase-order numbers with a regex to guess where the counter
-- should be. Numbers here have been allocated from this row since M1, so there
-- is nothing to reconstruct and a regex over document identifiers is a way to
-- introduce a duplicate rather than to avoid one.

ALTER TABLE procurement.number_series
  -- Which document this series numbers.
  --
  -- DEFAULT 'purchase_order' so the existing row keeps its meaning and its
  -- counter. The CHECK below lists ONE value today, deliberately: a settings
  -- screen offering a series for a document the system does not number is a
  -- control that appears to take effect and does not. A second module joins the
  -- CHECK in the same migration that makes that module allocate from here.
  ADD COLUMN module_type text NOT NULL DEFAULT 'purchase_order',

  -- Whether the financial year appears in the number: `PO/2026-27/0001`.
  --
  -- DEFAULT false, because turning it on changes what a document is called and
  -- that is a decision, not a migration. Every tenant keeps `PO-0042` until
  -- somebody chooses otherwise on the settings screen.
  ADD COLUMN include_fy boolean NOT NULL DEFAULT false,

  -- How the year is written. The four forms the legacy supports
  -- (`NumberSeriesService.getFinancialYear`), and the Indian financial year
  -- runs April to March, so a document raised on 31 March 2027 is in 2026-27
  -- and one raised the next day is in 2027-28.
  ADD COLUMN fy_format text NOT NULL DEFAULT 'YYYY-YY',

  -- Whether the counter restarts each financial year.
  --
  -- DEFAULT false, which is what the legacy does — its `getNextNumber` has no
  -- notion of a year at all, so its counter runs on across April. Restarting is
  -- what most Indian businesses actually want, and it is offered rather than
  -- assumed because the two produce different numbers on the same document.
  ADD COLUMN reset_each_fy boolean NOT NULL DEFAULT false,

  -- Which financial year `last_number` belongs to. NULL until the first
  -- allocation after this migration. Compared, not trusted: the reset happens
  -- when the FY computed at allocation differs from this.
  ADD COLUMN series_fy text,

  -- Where a restarted series begins. `last_number` is set to this on a reset,
  -- so the first number issued in the new year is `starting_number + 1`.
  ADD COLUMN starting_number bigint NOT NULL DEFAULT 0;

-- Re-keyed. One row per tenant per module, which is what makes the upsert in
-- `allocateNumber` safe once there is more than one series.
ALTER TABLE procurement.number_series
  DROP CONSTRAINT number_series_pkey,
  ADD  CONSTRAINT number_series_pkey PRIMARY KEY (tenant_id, module_type);

ALTER TABLE procurement.number_series
  ADD CONSTRAINT number_series_module_type_check
    CHECK (module_type IN ('purchase_order')),
  ADD CONSTRAINT number_series_fy_format_check
    CHECK (fy_format IN ('YYYY-YY', 'YY-YY', 'YYYY', 'YY')),
  ADD CONSTRAINT number_series_starting_number_check
    CHECK (starting_number >= 0),

  -- **A series may only restart if the year is in the number.**
  --
  -- Without the year, restarting the counter issues `PO-0001` a second time —
  -- the same string on two different purchase orders, a year apart, with
  -- nothing on either document to tell them apart. That is not a preference to
  -- be configured; it is a duplicate document identifier, so it is refused here
  -- rather than validated in a route somebody can add a second caller to.
  ADD CONSTRAINT number_series_reset_needs_fy_check
    CHECK (NOT reset_each_fy OR include_fy);

COMMENT ON COLUMN procurement.number_series.module_type IS
  'Which document this series numbers. One value today; a second joins the CHECK in the migration that makes that module allocate.';
COMMENT ON COLUMN procurement.number_series.series_fy IS
  'The financial year last_number belongs to. A differing year at allocation is what triggers a reset, when reset_each_fy is on.';
COMMENT ON COLUMN procurement.number_series.reset_each_fy IS
  'Restart the counter each April. Only legal with include_fy, or the same number is issued twice.';
