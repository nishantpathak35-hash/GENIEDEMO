-- The words this tenant uses — Settings › Terminology.
--
-- One row per pair per tenant: `term_key` names the pair (the priced list of
-- work, a change to the contract, what site files each day, who you buy
-- from) and `word` is the one the firm chose. A pair with no row reads as the
-- pair's first word, so a tenant provisioned before this migration and one
-- that never chose get the same answer, and nothing is seeded.
--
-- The pairs and their two words are closed in `packages/contracts`
-- (`TERM_OPTIONS`), where every consumer compiles against them; the write
-- path refuses a word outside its pair. The CHECK here is on SHAPE only, so a
-- key that is not a pair cannot become a row that no label ever reads. The
-- chosen word reaches every label, the generated navigation and a document's
-- heading — it is never template code, only data bound into a render.

CREATE TABLE tenancy.terminology (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),

  term_key   text NOT NULL,
  word       text NOT NULL,

  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT terminology_pkey PRIMARY KEY (tenant_id, id),

  -- Composite, because referential integrity is exempt from RLS and a
  -- single-column FK would confirm the existence of another tenant's principal
  -- by whether the insert succeeded.
  CONSTRAINT terminology_changed_by_fkey
    FOREIGN KEY (tenant_id, changed_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  -- Includes tenant_id like every unique constraint here. One row per pair
  -- per tenant is what makes the upsert in `saveTerminology` safe.
  CONSTRAINT terminology_unique UNIQUE (tenant_id, term_key),

  CONSTRAINT terminology_key_check
    CHECK (term_key ~ '^[a-z][a-zA-Z0-9]{2,39}$'),
  CONSTRAINT terminology_word_check
    CHECK (length(word) BETWEEN 1 AND 40)
);

CREATE INDEX terminology_tenant_idx ON tenancy.terminology (tenant_id);

ALTER TABLE tenancy.terminology ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.terminology FORCE  ROW LEVEL SECURITY;

-- The pair. Policies are PERMISSIVE by default and permissive policies are
-- OR-ed, so one alone would let a later `USING (true)` open the table while
-- still satisfying "the table has a policy". The RESTRICTIVE half makes that
-- addition inert.
CREATE POLICY tenant_isolation ON tenancy.terminology AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON tenancy.terminology AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.terminology FROM PUBLIC;
-- No TRUNCATE, ever: it is not subject to row-level security. UPDATE is granted
-- because changing a word back is the entire feature.
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.terminology TO app_runtime;
