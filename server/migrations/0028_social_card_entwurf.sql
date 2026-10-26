-- Postfach für automatisch erzeugte Social-Card-Entwürfe (Stufe 1, ohne
-- Veröffentlichen). Ein Job legt sie wochenweise im Voraus an; ein Admin gibt
-- sie frei oder verwirft sie. spec ist die Eingabe für drawCard
-- (shared/socialCards.js), das Bild liegt als PNG-Datei neben der DB und lässt
-- sich aus spec jederzeit neu zeichnen.
--
-- Entstand als 0026 auf einem eigenen Branch; beim Zusammenführen mit der
-- Admin-Neugestaltung (dort 0026/0027) umbenannt. IF NOT EXISTS, damit eine
-- Datenbank, die sie schon als 0026 kennt, beim erneuten Lauf nicht scheitert.
CREATE TABLE IF NOT EXISTS social_card_entwurf (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  datum          TEXT NOT NULL,
  slot           TEXT NOT NULL,
  spec           TEXT NOT NULL,
  caption        TEXT NOT NULL,
  hashtags       TEXT NOT NULL,
  bild           TEXT,
  status         TEXT NOT NULL DEFAULT 'offen'
                   CHECK (status IN ('offen', 'freigegeben', 'verworfen')),
  erstellt_am    TEXT NOT NULL,
  aktualisiert_am TEXT NOT NULL,
  entschieden_am TEXT
);

-- Je Tag und Platz im Wochenplan genau ein Entwurf: Der Job ergänzt nur, was
-- fehlt, und überschreibt nie eine Entscheidung.
CREATE UNIQUE INDEX IF NOT EXISTS social_card_entwurf_slot ON social_card_entwurf (datum, slot);
