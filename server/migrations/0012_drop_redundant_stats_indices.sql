-- Review-Finding 2026-06-10 (DB, Niedrig): Der PRIMARY KEY der stats-Tabelle
-- (datum, spiel, user_id) deckt die Links-Präfixe (datum) und (datum, spiel)
-- bereits vollständig ab. Die beiden Zusatzindizes waren damit redundant und
-- reiner Write-Overhead auf dem Spiel-Hotpath (jedes recordStat pflegte sie
-- umsonst mit). idx_stats_user bleibt — user_id ist kein Links-Präfix des PK.
--
-- Die zugehörigen CREATE-INDEX-Statements in db.js wurden ebenfalls entfernt,
-- sonst würden die Indizes beim nächsten Boot wieder angelegt.

DROP INDEX IF EXISTS idx_stats_datum;
DROP INDEX IF EXISTS idx_stats_datum_spiel;
