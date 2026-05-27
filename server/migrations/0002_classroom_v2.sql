-- 0002_classroom_v2.sql
-- Classroom-Relaunch v2 (siehe planning/Classroom-Relaunch-Plan.md §4).
--
-- Praefix cr2_ haelt das neue Datenmodell strikt vom bestehenden
-- classroom_* getrennt (D11). Beide laufen parallel bis Welle 3.
-- Idempotent via CREATE TABLE/INDEX IF NOT EXISTS – Migration darf
-- ohne Schaden wiederholt werden (z.B. nach Rollback eines Branchs).

-- ── Sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr2_session (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  teacher_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title           TEXT,
  status          TEXT NOT NULL DEFAULT 'lobby'
                    CHECK (status IN ('lobby','running','finished','aborted')),
  settings_json   TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  started_at      INTEGER,
  finished_at     INTEGER,
  locked_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cr2_session_teacher
  ON cr2_session(teacher_user_id, status);

-- Partial Unique Index: gleicher Code darf nach Session-Ende erneut
-- vergeben werden. Nur lobby/running darf weltweit eindeutig sein.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr2_session_code_active
  ON cr2_session(code)
  WHERE status IN ('lobby','running');

-- ── Assignments (Modus + Lemmata + Content-Snapshot) ───────────────
CREATE TABLE IF NOT EXISTS cr2_assignment (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES cr2_session(id) ON DELETE CASCADE,
  mode             TEXT NOT NULL
                     CHECK (mode IN ('kollokationen','wortzwilling','zeitenwende','lueckenfueller')),
  lemma_ids        TEXT NOT NULL,            -- JSON-Array
  content_snapshot TEXT NOT NULL,            -- JSON, beim Anlegen eingefroren
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cr2_assignment_session
  ON cr2_assignment(session_id, position);

-- ── Participants (Schueler) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr2_participant (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES cr2_session(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  auth_token   TEXT NOT NULL UNIQUE,
  joined_at    INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  connected    INTEGER NOT NULL DEFAULT 0,
  left_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cr2_participant_session
  ON cr2_participant(session_id, left_at);

-- ── Pro-Schueler-Fortschritt je Assignment ─────────────────────────
CREATE TABLE IF NOT EXISTS cr2_participant_state (
  participant_id TEXT NOT NULL REFERENCES cr2_participant(id) ON DELETE CASCADE,
  assignment_id  TEXT NOT NULL REFERENCES cr2_assignment(id) ON DELETE CASCADE,
  current_index  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'idle'
                   CHECK (status IN ('idle','playing','done')),
  started_at     INTEGER,
  finished_at    INTEGER,
  PRIMARY KEY (participant_id, assignment_id)
);

-- ── Submissions (rohe Antworten) ───────────────────────────────────
-- raw_answer ist JSON (modusspezifisch). Server berechnet daraus den
-- Score in cr2_score_record – Client liefert NIEMALS score (D13/R6).
CREATE TABLE IF NOT EXISTS cr2_submission (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES cr2_session(id) ON DELETE CASCADE,
  assignment_id  TEXT NOT NULL REFERENCES cr2_assignment(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES cr2_participant(id) ON DELETE CASCADE,
  lemma_id       TEXT NOT NULL,
  round_index    INTEGER NOT NULL,
  raw_answer     TEXT NOT NULL,
  submitted_at   INTEGER NOT NULL,
  client_ms      INTEGER,
  UNIQUE (participant_id, assignment_id, lemma_id, round_index)
);

CREATE INDEX IF NOT EXISTS idx_cr2_submission_session
  ON cr2_submission(session_id, submitted_at);

-- ── Score-Records (serverautoritativ) ──────────────────────────────
CREATE TABLE IF NOT EXISTS cr2_score_record (
  submission_id  TEXT PRIMARY KEY REFERENCES cr2_submission(id) ON DELETE CASCADE,
  session_id     TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  assignment_id  TEXT NOT NULL,
  score          INTEGER NOT NULL,
  max_score      INTEGER NOT NULL,
  correct        INTEGER NOT NULL,
  detail_json    TEXT,
  scored_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cr2_score_session_part
  ON cr2_score_record(session_id, participant_id);

-- ── Capability-Grants (DB-basiert, sofortiges Revoke; D14) ─────────
CREATE TABLE IF NOT EXISTS cr2_capability_grant (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES cr2_session(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('teacher','participant')),
  subject_id   TEXT NOT NULL,
  capability   TEXT NOT NULL,
  granted_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);

-- Partial Unique Index: nur aktive (nicht revoked) Grants muessen
-- eindeutig sein. Erlaubt Re-Grant nach Revoke ohne Loeschen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr2_cap_unique
  ON cr2_capability_grant(session_id, subject_kind, subject_id, capability)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cr2_cap_subject
  ON cr2_capability_grant(subject_kind, subject_id)
  WHERE revoked_at IS NULL;
