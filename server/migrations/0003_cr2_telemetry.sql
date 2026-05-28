-- 0003_cr2_telemetry.sql
-- Telemetrie-Tabelle fuer Classroom v2 (T-6.5).
--
-- Trennt Telemetrie-Events sauber von admin_log (der primär Admin-Aktionen
-- protokolliert). cr2_telemetry misst Pilot-Erfolgsmetriken aus §14:
--   - Aktivierungsrate (sessions_created / started mit >= 3 Teilnehmern)
--   - Schüler-Completion-Rate (join_succeeded vs. session_finished)
--   - Lehrer-Wiederholungsabsicht (Interview; hier nur struktureller Hook)
--
-- Idempotent via IF NOT EXISTS — kann wiederholt ohne Schaden angewendet werden.

CREATE TABLE IF NOT EXISTS cr2_telemetry (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,              -- Unix-Ms, für Reihenfolge + Bucket-Queries
  event        TEXT NOT NULL,                 -- z. B. 'cr2_session_created'
  session_id   TEXT,                          -- NULL bei Join-Fail (Session noch unbekannt)
  teacher_id   TEXT,                          -- NULL bei Schueler-Events
  payload_json TEXT NOT NULL DEFAULT '{}'     -- Event-spezifische Daten (mode, reason, …)
);

CREATE INDEX IF NOT EXISTS idx_cr2_telemetry_event_ts
  ON cr2_telemetry(event, ts DESC);

CREATE INDEX IF NOT EXISTS idx_cr2_telemetry_session
  ON cr2_telemetry(session_id, ts DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cr2_telemetry_teacher
  ON cr2_telemetry(teacher_id, ts DESC)
  WHERE teacher_id IS NOT NULL;
