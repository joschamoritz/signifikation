-- 0007_classroom_lifecycle.sql
-- W2-T3: Robuster Session-Lifecycle — Pause/Resume + Auto-End (D8).
--
-- BEWUSST KEINE Erweiterung der CHECK-Constraint status IN
-- ('lobby','running','finished','aborted'). Eine zusaetzliche 'paused'-
-- Enum-Variante wuerde in SQLite einen vollstaendigen Table-Rebuild
-- erzwingen (CHECK ist nicht via ALTER aenderbar) — also Tabelle neu
-- anlegen, Daten kopieren, FK-Kinder beachten. Das ist riskant und
-- gegen die sichere 0005/0006-Linie.
--
-- Stattdessen modellieren wir Pause als FLAG: paused_at (NULL = nicht
-- pausiert). Der DB-Status bleibt waehrend einer Pause 'running' — die
-- partielle UNIQUE-Index auf code (WHERE status IN ('lobby','running'))
-- und getSessionByCode greifen also unveraendert weiter (eine pausierte
-- Session bleibt beitretbar). Der „paused"-Status wird erst im
-- Normalizer (store.js) aus paused_at abgeleitet und nach aussen
-- gereicht.
--
-- last_activity_at ist die PERSISTENTE Quelle der Wahrheit fuer das
-- Auto-End nach Inaktivitaet (D8, 90 Min). Persistent heisst: ueberlebt
-- Server-Neustarts — der Sweep-Job rechnet gegen diesen Timestamp, nicht
-- gegen einen In-Memory-Timer.
--
-- Laeuft genau einmal (per _schema_migrations getrackt) und atomar in
-- einer Transaktion (migrate-sync.js).

ALTER TABLE classroom_session ADD COLUMN paused_at INTEGER;
ALTER TABLE classroom_session ADD COLUMN last_activity_at INTEGER;

-- Bestandszeilen backfillen, damit der Auto-End-Sweep einen Bezugspunkt
-- hat (sonst wuerde COALESCE im Code auf started_at/created_at fallen,
-- aber wir setzen es hier explizit fuer einen sauberen Index).
UPDATE classroom_session
  SET last_activity_at = COALESCE(started_at, created_at)
  WHERE last_activity_at IS NULL;

-- Sweep-Index: nur laufende Sessions sind Kandidaten fuers Auto-End.
CREATE INDEX IF NOT EXISTS idx_classroom_session_activity
  ON classroom_session(status, last_activity_at)
  WHERE status = 'running';
