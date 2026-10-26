-- Veröffentlichte Social-Card-Beiträge (Stufe 2: Bluesky). Je Entwurf höchstens
-- ein Beitrag – das verhindert Doppelposts, auch wenn der Job nach einem
-- Neustart nachholt. Fehlversuche zählen mit; ab dem dritten gibt der Job auf
-- und meldet sich. uri/cid braucht die Auflösung am Folgetag, um als Antwort
-- auf den Beitrag zu erscheinen (root = Beitrag, an dem der Faden hängt).
-- Kein Fremdschlüssel: Der Eintrag bleibt als Protokoll, auch wenn der
-- Entwurf nach 8 Wochen gelöscht wird.
CREATE TABLE social_post (
  entwurf_id   INTEGER PRIMARY KEY,
  plattform    TEXT NOT NULL DEFAULT 'bluesky',
  uri          TEXT,
  cid          TEXT,
  root_uri     TEXT,
  root_cid     TEXT,
  gepostet_am  TEXT,
  versuche     INTEGER NOT NULL DEFAULT 0,
  fehler       TEXT
);
