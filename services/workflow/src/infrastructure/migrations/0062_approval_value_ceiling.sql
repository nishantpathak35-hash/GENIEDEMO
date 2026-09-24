-- A value ceiling per approval stage. Configured, never seeded.
--
-- PO-13d, reopened deliberately. Migration `0024_role_catalog_and_grants.sql`
-- argued AGAINST a value-limit column, and the argument was good: the repaired
-- legacy tree has no amount threshold anywhere, so adding one would have been a
-- column "declared and never evaluated" — the APPR-03 shape this project keeps
-- finding and refusing to reproduce.
--
-- What changed is not the evidence, it is the reading of it. The absence in the
-- legacy is a MISSING FEATURE rather than a decision: a contractor running
-- ₹40 lakh to ₹12 crore projects does not let one authority sign both a ₹40,000
-- stationery order and a ₹12 crore MEP package. So the machinery is built here
-- and **evaluated** — `approve()` reads this column on every decision — which is
-- exactly the condition 0024 set for declaring it.
--
-- 0024 is not edited. This supersedes its reasoning, and `docs/OPEN-DECISIONS.md`
-- PO-13d moves from "None." to "machinery built, unconfigured".
--
-- ---------------------------------------------------------------------------
-- NULL MEANS NO LIMIT, AND EVERY ROW SHIPS NULL
-- ---------------------------------------------------------------------------
--
-- Nullable, with no default, and nothing anywhere seeds a value. That is the
-- whole design and it is not timidity:
--
--   * The numbers are the client's. A "reasonable" default — ₹5 lakh for a
--     project manager, say — would be indistinguishable, three months from now,
--     from a figure somebody agreed to. Provisional-but-plausible is the most
--     expensive kind of wrong here, because nobody re-opens it.
--   * `NOT NULL DEFAULT 0` would be worse than wrong, it would be silent: zero
--     is a real ceiling, and every approval in the system would begin refusing
--     the moment this migration ran.
--
-- So: unconfigured is the shipped state, unconfigured behaves exactly as the
-- system behaved before this column existed, and the settings screen shows the
-- ceiling as unset rather than as a number.
--
-- ---------------------------------------------------------------------------
-- WHAT THE ENGINE DOES WITH IT
-- ---------------------------------------------------------------------------
--
-- A ceiling is the most this stage may authorise ON ITS OWN. Above it, the
-- stage's approval is recorded and the request moves to the NEXT stage instead
-- of completing — it escalates, rather than being refused. It is refused only
-- when there is no next stage to escalate to, because then the chain as
-- configured contains nobody who may authorise the amount, and quietly
-- approving it anyway would make the ceiling decorative.
--
-- Paise, bigint, like every other money column (ADR-0012). No rounding happens
-- here and none should: a ceiling is compared, never multiplied.

ALTER TABLE workflow.approval_stages
  ADD COLUMN approval_ceiling_paise bigint;

-- A negative ceiling is not a stricter limit, it is a typo that refuses
-- everything. Zero is allowed and means exactly what it says: this stage
-- authorises nothing on its own and always escalates.
ALTER TABLE workflow.approval_stages
  ADD CONSTRAINT approval_stages_ceiling_check
  CHECK (approval_ceiling_paise IS NULL OR approval_ceiling_paise >= 0);

COMMENT ON COLUMN workflow.approval_stages.approval_ceiling_paise IS
  'Most this stage may authorise alone, in paise. NULL = no limit. Never seeded: PO-13d.';
