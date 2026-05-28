-- 0005_classroom_consolidation.sql
-- Klassenraum-Relaunch Welle 3 (siehe planning/Classroom-Relaunch-Plan.md, D17).
--
-- Der cr2_-Praefix (D11: getrennte Tabellen waehrend der Parallelphase) wird
-- aufgeloest. Da das alte v1-Datenmodell PLURAL benannt ist (classroom_sessions,
-- classroom_participants, …) und das neue Modell SINGULAR (classroom_session,
-- classroom_participant, …), kollidieren die Namen nicht — die v1-Tabellen
-- werden separat in 0006 entfernt, zusammen mit dem v1-Code.
--
-- Laeuft genau einmal (per _schema_migrations getrackt) und atomar in einer
-- Transaktion (migrate-sync.js). Daher kein IF EXISTS auf ALTER/RENAME noetig.

-- ── Tabellen umbenennen (FK-Referenzen werden von SQLite automatisch
--    mitgezogen, da legacy_alter_table aus ist) ──────────────────────
ALTER TABLE cr2_session           RENAME TO classroom_session;
ALTER TABLE cr2_assignment        RENAME TO classroom_assignment;
ALTER TABLE cr2_participant       RENAME TO classroom_participant;
ALTER TABLE cr2_participant_state RENAME TO classroom_participant_state;
ALTER TABLE cr2_submission        RENAME TO classroom_submission;
ALTER TABLE cr2_score_record      RENAME TO classroom_score_record;
ALTER TABLE cr2_capability_grant  RENAME TO classroom_capability_grant;
ALTER TABLE cr2_telemetry         RENAME TO classroom_telemetry;

-- ── Indizes umbenennen (SQLite kann Indizes nicht umbenennen → drop+create).
--    Definitionen 1:1 aus 0002/0003 uebernommen, nur Tabellen-/Indexnamen
--    auf classroom_ umgestellt. ───────────────────────────────────────

-- aus 0002
DROP INDEX IF EXISTS idx_cr2_session_teacher;
CREATE INDEX IF NOT EXISTS idx_classroom_session_teacher
  ON classroom_session(teacher_user_id, status);

DROP INDEX IF EXISTS idx_cr2_session_code_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_session_code_active
  ON classroom_session(code)
  WHERE status IN ('lobby','running');

DROP INDEX IF EXISTS idx_cr2_assignment_session;
CREATE INDEX IF NOT EXISTS idx_classroom_assignment_session
  ON classroom_assignment(session_id, position);

DROP INDEX IF EXISTS idx_cr2_participant_session;
CREATE INDEX IF NOT EXISTS idx_classroom_participant_session
  ON classroom_participant(session_id, left_at);

DROP INDEX IF EXISTS idx_cr2_submission_session;
CREATE INDEX IF NOT EXISTS idx_classroom_submission_session
  ON classroom_submission(session_id, submitted_at);

DROP INDEX IF EXISTS idx_cr2_score_session_part;
CREATE INDEX IF NOT EXISTS idx_classroom_score_session_part
  ON classroom_score_record(session_id, participant_id);

DROP INDEX IF EXISTS idx_cr2_cap_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_cap_unique
  ON classroom_capability_grant(session_id, subject_kind, subject_id, capability)
  WHERE revoked_at IS NULL;

DROP INDEX IF EXISTS idx_cr2_cap_subject;
CREATE INDEX IF NOT EXISTS idx_classroom_cap_subject
  ON classroom_capability_grant(subject_kind, subject_id)
  WHERE revoked_at IS NULL;

-- aus 0003
DROP INDEX IF EXISTS idx_cr2_telemetry_event_ts;
CREATE INDEX IF NOT EXISTS idx_classroom_telemetry_event_ts
  ON classroom_telemetry(event, ts DESC);

DROP INDEX IF EXISTS idx_cr2_telemetry_session;
CREATE INDEX IF NOT EXISTS idx_classroom_telemetry_session
  ON classroom_telemetry(session_id, ts DESC)
  WHERE session_id IS NOT NULL;

DROP INDEX IF EXISTS idx_cr2_telemetry_teacher;
CREATE INDEX IF NOT EXISTS idx_classroom_telemetry_teacher
  ON classroom_telemetry(teacher_id, ts DESC)
  WHERE teacher_id IS NOT NULL;
