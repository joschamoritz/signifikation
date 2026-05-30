-- 0009_classroom_performance_indices.sql
-- Performance-Indizes fuer den Lasttest (W2-T7).
--
-- Analyse des Submit-Hotpaths ergab zwei optimierungswuerdige Stellen:
--
-- 1. submitAnswer() rief listAssignmentsBySession.all() auf, um das aktive
--    Assignment zu identifizieren. Das laedt ALLE Assignments der Session
--    (max. 5), obwohl nur Index[current_assignment_index] relevant ist.
--    Stattdessen nutzt der optimierte Store-Code jetzt:
--      SELECT ... LIMIT 1 OFFSET current_assignment_index
--    Dieser Query nutzt den bereits vorhandenen
--    idx_classroom_assignment_session(session_id, position) — kein neuer
--    Index noetig.
--
-- 2. getDashboard() und buildStudentView() laden Submissions WHERE session_id=?
--    und filtern assignment_id dann JS-seitig. Bei mehreren Assignments
--    (W2-T2) werden Submissions aller Assignments geladen, auch wenn nur
--    das aktive relevant ist.
--    Der neue Index erlaubt kuenftig direktes Filtern per (assignment_id, session_id).
--    Er wirkt bereits bei der vorhandenen idx_classroom_submission_session-Query,
--    da SQLite das Covering-Index-Modell nutzt.

CREATE INDEX IF NOT EXISTS idx_classroom_submission_assignment
  ON classroom_submission(assignment_id, session_id);

-- Fuer den hasCapability()-Hotpath (wird bei jedem Request und Socket-Connect
-- aufgerufen): Ergaenzender Index, der Lookups nach subject_id ohne session_id
-- beschleunigt (z.B. beim Revoke aller Grants eines Teilnehmers).
-- Der vorhandene idx_classroom_cap_subject(subject_kind, subject_id) deckt
-- bereits den main path ab; dieser Index ergaenzt den Revoke-Pfad.
CREATE INDEX IF NOT EXISTS idx_classroom_cap_subject_session
  ON classroom_capability_grant(subject_id, session_id)
  WHERE revoked_at IS NULL;
