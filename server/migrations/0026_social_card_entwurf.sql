-- Postfach für automatisch erzeugte Social-Card-Entwürfe (Stufe 1, ohne
-- Veröffentlichen). Ein Job legt sie wochenweise im Voraus an; ein Admin gibt
-- sie frei oder verwirft sie. spec ist die Eingabe für drawCard
-- (shared/socialCards.js), das Bild liegt als PNG-Datei neben der DB und lässt
-- sich aus spec jederzeit neu zeichnen.
CREATE TABLE social_card_entwurf (
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
CREATE UNIQUE INDEX social_card_entwurf_slot ON social_card_entwurf (datum, slot);
