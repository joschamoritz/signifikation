-- 0038_kollokator_korrektur.sql
--
-- Kollokator-Korrekturen aus dem Admin (Werkzeuge › Kollokator-Korrekturen).
-- Der Grundbestand bleibt im Code (server/kollokatorKorrektur.js, in Git
-- versioniert); diese Tabelle ergänzt und übersteuert ihn. Ein Eintrag mit
-- demselben (art, schluessel) wie ein Code-Eintrag gewinnt.
--
-- art / schluessel / ersatz:
--   lemma       'Wortart:lemma' (klein)   → richtiges Lemma, NULL = überall sperren
--   paar        'basis|kollokator' (klein) → richtiges Lemma, NULL = bei dieser Basis sperren
--   schreibung  'lemma' (klein)            → Anzeige-Schreibweise (CD-ROM)
--   abkuerzung  'lemma' (klein)            → Abkürzung (US), auch in Bindestrich-Wörtern
--   partizip    'partizip' (klein)         → Infinitiv (erhoben → erheben)
-- Ist der Ersatz das Wort selbst, hebt der Eintrag eine Code-Korrektur auf.
CREATE TABLE IF NOT EXISTS kollokator_korrektur (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  art           TEXT NOT NULL CHECK (art IN ('lemma', 'paar', 'schreibung', 'abkuerzung', 'partizip')),
  schluessel    TEXT NOT NULL,
  ersatz        TEXT,
  notiz         TEXT,
  erstellt_am   INTEGER NOT NULL,
  geaendert_am  INTEGER NOT NULL,
  admin_user_id TEXT,
  UNIQUE (art, schluessel)
);
