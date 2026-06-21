-- 0017_course_engine.sql
-- Kurs-Tab Datenmodell (AP2) — siehe planning/Kurs-Tab-Planung.md §6 und
-- planning/Kurs-Engine-Spec.md §10 (Mapping Item-Felder → Spalten).
--
-- Vier neue Tabellen für den Premium-Kurs (Stationen ①–⑤):
--   course_stations  – Lernpfad-Stationen (Struktur, Beamer-Konfig)
--   course_tasks     – Aufgaben-Items F1–F5, „ein Item, zwei Ausspielungen"
--   course_materials – Druck-/Beamer-Material je Station (PDF/Generierung)
--   course_progress  – kontobezogener Solo-Fortschritt (KEIN Schüler-Tracking)
--
-- Idempotent via CREATE TABLE/INDEX IF NOT EXISTS. Läuft genau einmal und
-- atomar in einer Transaktion (migrate-runner.js). Alle Spalten stehen hier im
-- CREATE TABLE (keine ALTER, keine Doppelung in db.js — Konvention: ab 0001
-- ausschließlich über den Runner).
--
-- Bewusst NICHT enthalten (Kurs-Tab-Planung §6):
--   - kein course_attempts / Schüler-Tracking
--   - kein Klassenraum-Anschluss (Kurs ist nicht für Schüler freigebbar)
-- Stations-/Item-Inhalte werden NICHT hier geseedet — das ist AP4 (Content).

-- ── Stationen (Lernpfad ①–⑤) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_stations (
  id                 TEXT PRIMARY KEY,          -- z.B. 's1' … 's5'
  order_no           INTEGER NOT NULL UNIQUE,   -- 1–5, Reihenfolge im Pfad
  title              TEXT NOT NULL,             -- z.B. 'Wortpartner & Kollokationen'
  ipa                TEXT,                      -- optionale IPA (Wörterbuch-Ästhetik)
  category           TEXT,                      -- Datenquelle/Kernkompetenz-Tag (frei)
  beamer_config_json TEXT NOT NULL DEFAULT '{}',-- Beamer-Folien-Konfiguration (JSON)
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER
);

-- ── Aufgaben-Items (F1–F5) ───────────────────────────────────────────
-- Ein Datensatz = ein Item EINER Niveaustufe. „Zwei Ausspielungen" meint
-- interaktiv↔Druck (gleiche Daten), NICHT das Niveau. Niveau-Varianten sind
-- eigene Zeilen mit gleichem `kern` (Inhaltskern-Anker zur AB-Bündelung).
--
-- Quellmodus (source, Engine-Spec §1/§10):
--   static          → content_json gesetzt (kuratiert),       template_json NULL
--   corpus-template → template_json gesetzt (corpusQuery+      content_json   NULL
--                     bindings+payload-Gerüst, Korpus-Fill)
-- rubric_json (solution + feedback) ist immer Pflicht (interaktiv + Lösungsblatt).
CREATE TABLE IF NOT EXISTS course_tasks (
  id            TEXT PRIMARY KEY,               -- z.B. 's1-f3-entscheidung-01'
  station_id    TEXT NOT NULL REFERENCES course_stations(id) ON DELETE CASCADE,
  format        TEXT NOT NULL
                  CHECK (format IN ('F1','F2','F3','F4','F5')),
  level         TEXT NOT NULL
                  CHECK (level IN ('DaZ','SekI','SekII','LK')),
  source        TEXT NOT NULL
                  CHECK (source IN ('static','corpus-template')),
  kern          TEXT,                           -- Inhaltskern-Anker (Niveau-Varianten teilen ihn)
  content_json  TEXT,                           -- static: payload+prompt+display+beleg
  template_json TEXT,                           -- corpus-template: corpusQuery+bindings+payload-Gerüst
  rubric_json   TEXT NOT NULL,                  -- solution + feedback
  position      INTEGER NOT NULL DEFAULT 0,     -- Reihenfolge innerhalb station+level
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  -- Quellmodus-Konsistenz (entspricht Engine-Spec Lint-Regeln 1+2):
  CHECK (
    (source = 'static'          AND content_json  IS NOT NULL AND template_json IS NULL)
    OR
    (source = 'corpus-template' AND template_json IS NOT NULL AND content_json  IS NULL)
  )
);

-- Haupt-Lookup (AP3): Tasks nach Station + Niveau in Reihenfolge.
CREATE INDEX IF NOT EXISTS idx_course_tasks_station_level
  ON course_tasks(station_id, level, position);

-- Bündelung der Niveau-Varianten eines Inhaltskerns (AB-Erzeugung).
CREATE INDEX IF NOT EXISTS idx_course_tasks_kern
  ON course_tasks(station_id, kern)
  WHERE kern IS NOT NULL;

-- ── Material (Druck/Beamer) je Station ───────────────────────────────
-- kind = Ausspielung (Kurs-Tab-Planung §4.1–4.3):
--   beamer            – Folien-PDF (Querformat), i.d.R. level-übergreifend
--   arbeitsblatt      – differenziertes AB (PDF)
--   loesung           – Lösungsblatt/Erwartungshorizont
--   unterrichtsentwurf– kuratierter Entwurf (level-übergreifend)
-- level NULL = level-übergreifend (Beamer/Entwurf). CHECK lässt NULL zu
-- (NULL IN (...) → NULL → CHECK erfüllt).
--
-- source (file_ref|template_json, AP2/AP5):
--   static          → file_ref gesetzt (vor-gerendertes PDF),  template_json NULL
--   corpus-template → template_json gesetzt (Hybrid-Generierung), file_ref NULL
CREATE TABLE IF NOT EXISTS course_materials (
  id            TEXT PRIMARY KEY,
  station_id    TEXT NOT NULL REFERENCES course_stations(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL
                  CHECK (kind IN ('beamer','arbeitsblatt','loesung','unterrichtsentwurf')),
  level         TEXT
                  CHECK (level IN ('DaZ','SekI','SekII','LK')),
  title         TEXT,
  source        TEXT NOT NULL
                  CHECK (source IN ('static','corpus-template')),
  file_ref      TEXT,                           -- static: Pfad/Referenz auf PDF
  template_json TEXT,                           -- corpus-template: Render-Vorgabe (Tasks/Lemma)
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  CHECK (
    (source = 'static'          AND file_ref      IS NOT NULL AND template_json IS NULL)
    OR
    (source = 'corpus-template' AND template_json IS NOT NULL AND file_ref      IS NULL)
  )
);

-- Material-Liste je Station (AP3/AP7): nach kind + Niveau.
CREATE INDEX IF NOT EXISTS idx_course_materials_station
  ON course_materials(station_id, kind, level, position);

-- ── Solo-Fortschritt (nur eingeloggter Premium-Nutzer, optional) ─────
-- KEIN Schüler-Tracking, kein attempts-Apparat (Kurs-Tab-Planung §6).
-- Genau eine Zeile je (user_id, station_id); Abfrage nach user_id nutzt
-- den PK-Präfix → kein Zusatzindex nötig.
CREATE TABLE IF NOT EXISTS course_progress (
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  station_id TEXT NOT NULL REFERENCES course_stations(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'idle'
               CHECK (status IN ('idle','in-progress','done')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, station_id)
);
