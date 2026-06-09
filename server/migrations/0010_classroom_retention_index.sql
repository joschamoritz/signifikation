-- 0010_classroom_retention_index.sql
-- Retention-Index fuer den Aufraeum-Sweep (E1/D9, Code-Review Kleinkram).
--
-- runClassroomRetention() (server/classroom/store.js) scannt periodisch
-- beendete Sessions ueber zwei Statements:
--   - anonymizeStaleParticipants: ... session_id IN (
--       SELECT id FROM classroom_session
--       WHERE status IN ('finished','aborted') AND finished_at <= @threshold)
--   - listHardDeleteSessions:  SELECT id FROM classroom_session
--       WHERE status IN ('finished','aborted') AND finished_at <= @threshold
--
-- Ohne Index muss SQLite dafuer die gesamte classroom_session-Tabelle scannen.
-- Ein partieller Index ueber genau die relevante Teilmenge (beendete Sessions)
-- haelt den Index klein und deckt beide Sweep-Queries direkt ab.
CREATE INDEX IF NOT EXISTS idx_classroom_session_finished
  ON classroom_session(status, finished_at)
  WHERE status IN ('finished', 'aborted');
