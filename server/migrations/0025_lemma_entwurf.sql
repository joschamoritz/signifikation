-- Entwurfs-Postfach für Lemma-Vorschläge.
-- Vorschläge kommen per API-Schlüssel herein und landen hier, nicht im Kalender.
-- Erst ein Admin übernimmt sie im Dashboard; das läuft über denselben
-- Speicherweg wie POST /admin/tag. payload ist genau dessen Request-Body.
CREATE TABLE lemma_entwurf (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  datum          TEXT NOT NULL,
  payload        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'offen'
                   CHECK (status IN ('offen', 'uebernommen', 'verworfen')),
  erstellt_am    TEXT NOT NULL,
  entschieden_am TEXT
);

-- Pro Datum höchstens ein offener Entwurf: Ein erneuter Push für denselben Tag
-- ersetzt den alten, statt dass sich Varianten stapeln.
CREATE UNIQUE INDEX lemma_entwurf_offen_je_datum
  ON lemma_entwurf (datum) WHERE status = 'offen';
