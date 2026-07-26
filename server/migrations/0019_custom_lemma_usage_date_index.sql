-- 0019_custom_lemma_usage_date_index.sql
-- Index fuer den taeglichen Retention-Sweep (server/jobs/dataRetention.js).
--
-- Der Sweep loescht alte custom_lemma_usage-Zeilen per "date < @threshold".
-- Der bestehende PRIMARY KEY (user_id, date) deckt Punktabfragen ab
-- (getUsageToday: user_id = ? AND date = ?), aber NICHT eine reine
-- date-Bereichsabfrage ohne user_id-Praefix — dafuer scannt SQLite die
-- gesamte Tabelle. Ein eigener Index auf date allein macht den Batch-Delete
-- zum Index-Scan statt Full-Table-Scan.
CREATE INDEX IF NOT EXISTS idx_custom_lemma_usage_date
  ON custom_lemma_usage(date);
