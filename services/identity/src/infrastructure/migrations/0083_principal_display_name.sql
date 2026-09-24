-- 0083 — a principal has a name a colleague would use.
--
-- Forward-only. Never edit this file.
--
-- `identity.principals` carried an email and nothing a screen could call the
-- person. Every surface that names who something waits on — the Today hero,
-- the approvals queue, an approval row — therefore named the ROLE and counted
-- who holds it ("2 people hold the role"), which is honest and is not what a
-- director reads at eight in the morning. DATA-03 in `docs/BACKLOG.md`.
--
-- Nullable, deliberately. A principal created before this migration, or by a
-- path that did not ask, has no name, and a screen shows the address rather
-- than inventing one from it. `'Rahul'` guessed from `rahul.finance@…` is a
-- claim the data does not make.
--
-- The name is given at invitation, by whoever is inviting, and copied onto
-- the principal when the invitation is accepted — the same direction as
-- `kind` and `roles` (0080): what a principal becomes is read from the stored
-- invitation, never from whoever is redeeming it. A display name is not a
-- permission, so a self-chosen one would not be an escalation; it is copied
-- from the invitation anyway so that one path names people and one rule says
-- where a name comes from.

ALTER TABLE identity.principals
  ADD COLUMN display_name text,
  -- Bounded so a screen can lay it out; non-empty so "" cannot masquerade as
  -- a name. NULL is the honest "not given".
  ADD CONSTRAINT principals_display_name_check
    CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 120);

ALTER TABLE identity.invites
  ADD COLUMN display_name text,
  ADD CONSTRAINT invites_display_name_check
    CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 120);
