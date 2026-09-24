-- Rename lead_contacts.role to designation.
--
-- `role` is an authorisation term in this system. Migration 0024 gave it a
-- catalogue (identity.role_catalog), a grant table and a vocabulary, and every
-- other `role` in the codebase means "what a principal is permitted to do".
--
-- On a lead contact it meant something entirely different: the job title of a
-- person at the prospective client — "Head of Facilities", "Project Manager".
-- Two unrelated concepts under one name in one system is the setup for someone
-- eventually writing `contact.role === 'admin'` and it type-checking.
--
-- `designation` is the ordinary word for this on an Indian business card, and
-- it collides with nothing.
--
-- Renaming rather than add-and-backfill because 0060 landed in the same
-- milestone and no deployed reader exists; a rename keeps the values and the
-- NOT NULL DEFAULT '' without a second pass. Forward-only, and 0060 is not
-- edited.

ALTER TABLE projects.lead_contacts RENAME COLUMN role TO designation;
