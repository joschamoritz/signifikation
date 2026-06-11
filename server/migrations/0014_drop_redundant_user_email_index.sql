-- 0014_drop_redundant_user_email_index.sql
--
-- user.email ist UNIQUE — SQLite pflegt dafuer bereits einen impliziten
-- Unique-Index. idx_user_email war doppelter Write-Overhead pro User-Insert
-- (gleiche Kategorie wie die in 0012 entfernten Stats-Indizes).
-- Das CREATE INDEX in der db.js-Baseline ist ebenfalls entfernt, sonst
-- wuerde der Index beim naechsten Boot wieder angelegt.
DROP INDEX IF EXISTS idx_user_email;
