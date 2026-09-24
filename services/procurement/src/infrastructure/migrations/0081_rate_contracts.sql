-- 0081 — vendor rate contracts, and the deviation check that gives them a point.
--
-- Forward-only. Never edit this file.
--
-- The missing rung of a ladder that was otherwise complete:
--
--   trade catalogue   what categories of work exist            (0067, built)
--   RATE CONTRACT     what THIS vendor charges for THIS trade  (here)
--   BOQ rate          what we quote the client                 (built)
--   PO price          what we actually pay                     (built)
--
-- Found by the port ledger, not by a document: `rate-contracts.js` (338 lines,
-- six exports) is named in none of the four port notes and nothing here matched
-- it. It was missed rather than declined.
--
-- **WHAT IS DELIBERATELY NOT PORTED.** The legacy's
-- `getMatchingRateContractsForItem` scores contracts against a line by splitting
-- the item name into words and testing `description.includes(word)`, then sorts
-- by score and returns everything. That is the fuzzy identity matching this
-- system exists to remove, and it is worse here than elsewhere: it decides which
-- price a purchase order is measured against. It also filters on
-- `c.status = 'Active'` and NEVER COMPARES THE VALIDITY DATES IT STORES, so an
-- expired contract keeps matching forever. Matching here is an exact equality on
-- vendor, trade code and the date, and it returns one row or none.
--
-- Every invented default is dropped: `gst_pct 18`, `min_qty 1`, `lead_days 3`,
-- `valid_to '2026-12-31'`, `payment_terms '30 Days Net'`, `category 'General'`,
-- `uom 'Sq.Ft'`. The 18 is a statutory value nobody has verified (CA-04) and the
-- rest are numbers somebody typed once. Absent stays absent.

-- Needed for the exclusion constraint below: it compares uuid and text with `=`
-- alongside a range with `&&`, and stock gist has no operator class for the
-- scalar types. Ships with postgres:17-alpine.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------- contracts ---
--
-- The document: who it is with, what it is called, and whether it is in force.
-- The RATES are on the item rows, because a contract can legitimately revise a
-- rate part-way through its life and the validity that matters is the rate's.

CREATE TABLE procurement.rate_contracts (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),

  vendor_id     uuid NOT NULL,

  -- Human-facing and freely editable, exactly like `vendors.code` and
  -- `purchase_orders.number`. The legacy uses the typed code AS the primary key
  -- (`const id = rcNumber`), so correcting a typo means rewriting every
  -- reference — the same shape as keying a project by its name.
  number        text NOT NULL,
  title         text NOT NULL,

  -- `draft` until somebody puts it in force; `withdrawn` rather than deleted, so
  -- a purchase order raised against it still explains itself.
  status        text NOT NULL DEFAULT 'draft',

  -- NULL, not '30 Days Net'. Payment terms are a commercial fact about this
  -- agreement; a default here is a term nobody negotiated appearing on a
  -- contract somebody signs.
  payment_terms text,
  notes         text NOT NULL DEFAULT '',

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,

  CONSTRAINT rate_contracts_pkey PRIMARY KEY (tenant_id, id),

  -- Composite, so tenant A cannot attach a contract to tenant B's vendor.
  -- RESTRICT rather than CASCADE: deleting a vendor that has priced agreements
  -- should fail loudly and be a decision, not a silent cascade through the
  -- record of what was agreed.
  CONSTRAINT rate_contracts_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES procurement.vendors (tenant_id, id) ON DELETE RESTRICT,

  CONSTRAINT rate_contracts_number_key UNIQUE (tenant_id, number),
  CONSTRAINT rate_contracts_status_check
    CHECK (status IN ('draft', 'active', 'withdrawn')),
  CONSTRAINT rate_contracts_number_present CHECK (number <> ''),
  CONSTRAINT rate_contracts_title_present CHECK (title <> ''),

  -- Not redundant with the primary key, and not decoration: it is what lets an
  -- item carry `vendor_id` and have the database keep that copy true, which is
  -- what makes the exclusion constraint below possible at all.
  CONSTRAINT rate_contracts_vendor_ref_key UNIQUE (tenant_id, id, vendor_id)
);

CREATE INDEX rate_contracts_tenant_idx ON procurement.rate_contracts (tenant_id);
CREATE INDEX rate_contracts_vendor_idx
  ON procurement.rate_contracts (tenant_id, vendor_id);

ALTER TABLE procurement.rate_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.rate_contracts FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.rate_contracts AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.rate_contracts AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ------------------------------------------------------- contracted rates ---

CREATE TABLE procurement.rate_contract_items (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),

  contract_id   uuid NOT NULL,

  -- DENORMALISED FROM THE PARENT, and held true by the composite foreign key
  -- below rather than by anybody remembering. It is here because the exclusion
  -- constraint has to see the vendor, and a constraint cannot join.
  vendor_id     uuid NOT NULL,

  -- WHICH TRADE THIS RATE IS FOR — a soft reference to
  -- `projects.trade_packages.code`, deliberately not a foreign key.
  --
  -- `apps -> services -> packages`, and no service imports another: the trade
  -- catalogue is owned by `services/projects` and this table by
  -- `services/procurement`, so a real FK is not available. The alternative
  -- would be moving the catalogue, which is a bigger change than the feature.
  --
  -- **This is not the identity matching that was removed.** `LIKE '%…%'` over a
  -- project name is a guess about which record somebody meant; an exact `=` on a
  -- short uppercase code chosen from a catalogue is a key that happens to live
  -- in another service. The upper-case CHECK is what keeps it one: without it
  -- `elec` never matches `ELEC` and the deviation check silently finds nothing,
  -- which is the failure mode that looks like a feature nobody uses.
  --
  -- Validation that the code EXISTS happens at the composition root, which is
  -- the only layer permitted to read both services. The deviation check itself
  -- never reads `projects` at all.
  trade_code    text NOT NULL,

  description   text NOT NULL,
  -- What the rate is per. Recorded because a rate is meaningless without it, and
  -- NOT part of the key: the key is vendor plus trade, which is what the ladder
  -- above actually says. A vendor quoting two units for one trade is a data
  -- problem to see, not a dimension to match on.
  uom           text NOT NULL,

  -- PAISE. Commercial, not statutory — no CA gate. It is still integer paise
  -- because it is multiplied by a quantity to compare against a line total, and
  -- the legacy's `Number(it.contract_rate || 0)` is a float that turns a missing
  -- rate into a free one.
  contract_rate bigint NOT NULL,

  -- Inclusive at both ends, which is how a person reads a contract period.
  valid_from    date NOT NULL,
  valid_to      date NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rate_contract_items_pkey PRIMARY KEY (tenant_id, id),

  -- Carries `vendor_id` through, so the denormalised copy cannot drift from the
  -- contract it belongs to.
  CONSTRAINT rate_contract_items_contract_fkey
    FOREIGN KEY (tenant_id, contract_id, vendor_id)
    REFERENCES procurement.rate_contracts (tenant_id, id, vendor_id)
    ON DELETE CASCADE,

  CONSTRAINT rate_contract_items_trade_code_check
    CHECK (trade_code <> '' AND trade_code = upper(trade_code)),
  CONSTRAINT rate_contract_items_description_present CHECK (description <> ''),
  CONSTRAINT rate_contract_items_uom_present CHECK (uom <> ''),
  CONSTRAINT rate_contract_items_rate_check CHECK (contract_rate >= 0),
  CONSTRAINT rate_contract_items_validity_check CHECK (valid_to >= valid_from),

  -- THE CONSTRAINT THAT MAKES "THE CONTRACTED RATE" A FUNCTION.
  --
  -- Without it, two contracts covering the same vendor and trade over
  -- overlapping periods both match, and the deviation check has to pick one —
  -- which means an `ORDER BY` somewhere decides what a purchase order is
  -- measured against. The legacy has exactly that problem and answers it by
  -- returning every match sorted by a similarity score.
  --
  -- Unconditional rather than scoped to active contracts, because status lives
  -- on the parent and a constraint cannot join. That is stricter than strictly
  -- needed and it is the right direction: revising a rate part-way through means
  -- closing the old row (`valid_to`) and opening a new one, which leaves the
  -- history readable instead of overwriting what was agreed.
  CONSTRAINT rate_contract_items_no_overlap EXCLUDE USING gist (
    tenant_id  WITH =,
    vendor_id  WITH =,
    trade_code WITH =,
    daterange(valid_from, valid_to, '[]') WITH &&
  )
);

CREATE INDEX rate_contract_items_tenant_idx
  ON procurement.rate_contract_items (tenant_id);
CREATE INDEX rate_contract_items_contract_idx
  ON procurement.rate_contract_items (tenant_id, contract_id);
-- The lookup the deviation check makes on every priced purchase-order line.
CREATE INDEX rate_contract_items_lookup_idx
  ON procurement.rate_contract_items (tenant_id, vendor_id, trade_code, valid_from, valid_to);

ALTER TABLE procurement.rate_contract_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.rate_contract_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.rate_contract_items AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.rate_contract_items AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- --------------------------------------------- what a purchase order records ---
--
-- The deviation check resolves the contract SERVER-SIDE, inside the transaction
-- that writes the line. These three columns record what it found; they are an
-- OUTPUT, not an input.
--
-- The distinction is the whole feature. If the check only ran on lines where
-- somebody had attached a contract, it would run almost never — and a control
-- that fires only when you remember to ask for it is a table nobody reads, which
-- is what the legacy built.

ALTER TABLE procurement.purchase_order_lines
  -- SUPPLIED. Which trade this line is buying, so the line can be matched at
  -- all. NULL means the line names no trade and is not measured against
  -- anything — an honest absence, the same answer PO-15 gives for a BOQ cost
  -- rate with no basis.
  ADD COLUMN trade_code text,

  -- RESOLVED. The contract item this line was measured against.
  --
  -- ON DELETE SET NULL rather than RESTRICT: this is a pointer, and
  -- `contracted_unit_rate` beside it is the evidence. Deleting a contract must
  -- not rewrite what a historical purchase order was checked against, and must
  -- not be blocked by it either.
  ADD COLUMN rate_contract_item_id uuid,

  -- RESOLVED, AND STAMPED. The rate as it stood when this line was priced.
  --
  -- Same reasoning as `losing_before` on a lead merge: a contract edited next
  -- year must not silently change what last year's deviation was. Reading the
  -- rate back through the pointer would do exactly that.
  ADD COLUMN contracted_unit_rate bigint;

ALTER TABLE procurement.purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_trade_code_check
    CHECK (trade_code IS NULL OR (trade_code <> '' AND trade_code = upper(trade_code))),

  ADD CONSTRAINT purchase_order_lines_rate_contract_item_fkey
    FOREIGN KEY (tenant_id, rate_contract_item_id)
    REFERENCES procurement.rate_contract_items (tenant_id, id) ON DELETE SET NULL,

  ADD CONSTRAINT purchase_order_lines_contracted_rate_check
    CHECK (contracted_unit_rate IS NULL OR contracted_unit_rate >= 0);

CREATE INDEX purchase_order_lines_deviation_idx
  ON procurement.purchase_order_lines (tenant_id, rate_contract_item_id)
  WHERE rate_contract_item_id IS NOT NULL;

-- Never TRUNCATE: it is not subject to row-level security.
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.rate_contracts      TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.rate_contract_items TO app_runtime;

COMMENT ON TABLE procurement.rate_contract_items IS
  'Contracted unit rates in PAISE, per vendor per trade, valid over an inclusive '
  'date range. At most one row covers a given vendor, trade and day - enforced by '
  'an exclusion constraint, so "the contracted rate" is a function rather than a '
  'convention. trade_code is a soft reference to projects.trade_packages.code: no '
  'foreign key, because no service imports another.';
