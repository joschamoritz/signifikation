-- Phase 4 (Eigenes Lemma): free_days wird zur Bonus-Tabelle umgewidmet, und
-- der tägliche Verbrauch pro Account wird in custom_lemma_usage getrackt.
--
-- free_days bedeutet jetzt: "an diesem Tag bekommen Basic-Nutzer bonus_count
-- zusätzliche Eigenes-Lemma-Spiele oben drauf" (Grundkontingent ist 1/Tag).
-- Das label bleibt als Anlass-Beschriftung (z. B. "Sonntag", "Tag der Archive").

ALTER TABLE free_days ADD COLUMN bonus_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS custom_lemma_usage (
  user_id TEXT    NOT NULL,
  date    TEXT    NOT NULL,            -- YYYY-MM-DD (Europe/Berlin)
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
