-- Syntaktische Belegprüfung (server/belegPruefung/): je Paar aus Basis und Kollokator
-- die Satz-IDs aus belege_v2.db, in denen de_zdl_lg die Kollokation tatsächlich findet.
-- Schlüssel kleingeschrieben. belege_stand = höchste Satz-ID der Belege-DB beim Prüfen;
-- passt sie nicht mehr zur geöffneten DB, gelten die IDs nicht (Neuaufbau).
CREATE TABLE beleg_pruefung (
  basis        TEXT    NOT NULL,
  kollokator   TEXT    NOT NULL,
  belege_stand INTEGER NOT NULL,
  kandidaten   INTEGER NOT NULL,
  bestanden    INTEGER NOT NULL,
  satz_ids     TEXT    NOT NULL,   -- JSON-Array der bestandenen saetze.id
  geprueft_am  TEXT    NOT NULL,
  PRIMARY KEY (basis, kollokator)
);
