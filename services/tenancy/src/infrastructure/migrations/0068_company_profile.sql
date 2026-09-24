-- Who this organisation is, and the defaults it works to.
--
-- **This closes a defect the workspace has carried since the first survey.**
-- `app/po/[poNo]/page.js` and `SettingsService.ts` contain a real GSTIN and a
-- real PAN as literals, compiled into the app. In a single-tenant app that is
-- untidy; in a multi-tenant one it prints one customer's tax registration on
-- another customer's purchase order.
--
-- **A GSTIN and a PAN here are IDENTITY, not statutory calculation.** They are
-- who the organisation is registered as, in the way a legal name is — not a
-- rate, a threshold or an effective date, and nothing in `packages/money` or
-- the CA question list bears on them. The format is checked; the checksum is
-- not, because that is application logic with a test rather than a CHECK
-- nobody can read. Same patterns as `procurement.vendors`, deliberately: one
-- definition of what a GSTIN looks like.

CREATE TABLE tenancy.company_profile (
  -- One row per tenant, so the primary key IS the tenant. There is only one
  -- organisation per tenant by construction.
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  -- Registered identity. Every one of these is nullable and NOTHING seeds a
  -- value: an absent GSTIN prints nothing, where a placeholder prints a
  -- plausible wrong number onto a document somebody files.
  gstin       text,
  pan         text,
  cin         text,

  address     text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  website     text NOT NULL DEFAULT '',

  -- Bank details for disbursement, as printed on a document. NOT a payment
  -- instrument: nothing in this system moves money, and the vendor bank
  -- columns are already excluded from every vendor read for the same reason.
  bank_name   text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  bank_ifsc   text,

  -- The footer that appears at the bottom of a printed document.
  document_footer text NOT NULL DEFAULT '',

  -- No logo column. A logo is a file and there is no asset store here; the
  -- legacy tab uploads one to a 2 MB base64 string in a settings row, which
  -- puts an image in every read of the organisation's own details.

  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_profile_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT company_profile_updated_by_fkey
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT company_profile_gstin_check CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'
  ),
  CONSTRAINT company_profile_pan_check CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  -- 21 characters: one letter, five digits, four letters, six digits, three
  -- letters, six digits. Format only, like the two above.
  CONSTRAINT company_profile_cin_check CHECK (
    cin IS NULL OR cin ~ '^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'
  ),
  CONSTRAINT company_profile_ifsc_check CHECK (
    bank_ifsc IS NULL OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
  )
);

ALTER TABLE tenancy.company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.company_profile FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenancy.company_profile AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON tenancy.company_profile AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.company_profile FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.company_profile TO app_runtime;

-- ------------------------------------------------------------------------ --

-- The defaults this organisation works to.
--
-- Two settings, both from `OperationalSettings.js`, and both are real: the
-- payment terms that go onto a new purchase order, and how many days of silence
-- make an opportunity stale.
--
-- **Neither is seeded with a number.** `crm_stale_days` is nullable and NULL
-- means nobody has said, which the CRM screen renders as "no rule" rather than
-- inventing thirty. A staleness rule that nobody chose quietly starts marking
-- somebody's live pipeline as neglected.
CREATE TABLE tenancy.operational_defaults (
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  -- The terms printed on a new purchase order, e.g. "30 days net". Text, not a
  -- number of days: the legacy field is free text and payment terms in this
  -- trade are prose ("50% advance, balance on delivery").
  po_terms        text NOT NULL DEFAULT '',

  -- Days without an activity before an opportunity is called stale. NULL means
  -- no rule.
  crm_stale_days  integer,

  updated_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT operational_defaults_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT operational_defaults_updated_by_fkey
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT operational_defaults_terms_check CHECK (length(po_terms) <= 500),
  -- A stale rule of zero days marks everything stale the moment it is created.
  CONSTRAINT operational_defaults_stale_check CHECK (
    crm_stale_days IS NULL OR (crm_stale_days >= 1 AND crm_stale_days <= 365)
  )
);

ALTER TABLE tenancy.operational_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.operational_defaults FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenancy.operational_defaults AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON tenancy.operational_defaults AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.operational_defaults FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.operational_defaults TO app_runtime;
