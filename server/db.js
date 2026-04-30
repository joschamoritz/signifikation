/**
 * db.js – SQLite-Verbindung und Schema für Spieldaten
 *
 * Tabellen:
 *   lemmata      – Lemma-Objekte (Kollokationsspiel)
 *   kalender     – Tagesplanung { datum → [id1, id2, id3] }
 *   zeitreise    – Zeitreise-Einträge pro Datum
 *   wortzwilling – Wort-Zwilling-Einträge pro Datum
 *   zeitenwende  – Zeitenwende-Einträge pro Datum
 *   stats        – Spielstatistiken pro Datum + Spielmodus
 *
 * JSON-Felder (runden, rundenInfo, paare, …) werden als TEXT gespeichert
 * und per JSON.parse/stringify konvertiert.
 */
import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.APP_DB || join(__dirname, 'data', 'signifikation.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image         TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session (
    id         TEXT PRIMARY KEY,
    userId     TEXT NOT NULL,
    token      TEXT NOT NULL UNIQUE,
    expiresAt  TEXT NOT NULL,
    ipAddress  TEXT,
    userAgent  TEXT,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS account (
    id                    TEXT PRIMARY KEY,
    userId                TEXT NOT NULL,
    accountId             TEXT NOT NULL,
    providerId            TEXT NOT NULL,
    accessToken           TEXT,
    refreshToken          TEXT,
    idToken               TEXT,
    accessTokenExpiresAt  TEXT,
    refreshTokenExpiresAt TEXT,
    scope                 TEXT,
    password              TEXT,
    createdAt             TEXT NOT NULL,
    updatedAt             TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE (providerId, accountId)
  );

  CREATE TABLE IF NOT EXISTS verification (
    id         TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value      TEXT NOT NULL,
    expiresAt  TEXT NOT NULL,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id    TEXT PRIMARY KEY,
    role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','premium','admin')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_entitlements (
    user_id                 TEXT PRIMARY KEY,
    gesamtausgabe_unlocked  INTEGER NOT NULL DEFAULT 0,
    unlocked_at             INTEGER,
    source                  TEXT NOT NULL DEFAULT 'none',
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lemmata (
    id          TEXT PRIMARY KEY,
    lemma       TEXT NOT NULL,
    pos         TEXT NOT NULL DEFAULT '',
    wortart     TEXT NOT NULL DEFAULT '',
    runden      TEXT NOT NULL DEFAULT '{}',
    rundenInfo  TEXT NOT NULL DEFAULT '[]',
    notiz       TEXT NOT NULL DEFAULT '',
    link        TEXT NOT NULL DEFAULT '',
    definition  TEXT NOT NULL DEFAULT '',
    bonusFrage  TEXT,
    ipa         TEXT NOT NULL DEFAULT '',
    definitionen TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS kalender (
    datum TEXT PRIMARY KEY,
    ids   TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS zeitreise (
    datum    TEXT PRIMARY KEY,
    lemma    TEXT NOT NULL DEFAULT '',
    paare    TEXT NOT NULL DEFAULT '[]',
    perioden TEXT NOT NULL DEFAULT '[]',
    wortart  TEXT NOT NULL DEFAULT 'Substantiv'
  );

  CREATE TABLE IF NOT EXISTS wortzwilling (
    datum        TEXT PRIMARY KEY,
    wortA        TEXT NOT NULL DEFAULT '',
    wortB        TEXT NOT NULL DEFAULT '',
    pos          TEXT NOT NULL DEFAULT 'Substantiv',
    kollokatoren TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS zeitenwende (
    datum TEXT PRIMARY KEY,
    data  TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS stats (
    datum    TEXT NOT NULL,
    spiel    TEXT NOT NULL,
    user_id  TEXT NOT NULL DEFAULT '',
    plays    INTEGER NOT NULL DEFAULT 0,
    scoreSum INTEGER NOT NULL DEFAULT 0,
    maxSum   INTEGER NOT NULL DEFAULT 0,
    dist     TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (datum, spiel, user_id)
  );

  CREATE TABLE IF NOT EXISTS free_days (
    date  TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    amount       TEXT NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'EUR',
    status       TEXT NOT NULL,
    product      TEXT NOT NULL,
    processed_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_payments_user_product
    ON payments(user_id, product, status);

  CREATE TABLE IF NOT EXISTS webhook_retries (
    payment_id TEXT PRIMARY KEY,
    attempts   INTEGER NOT NULL DEFAULT 0,
    last_retry INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS device_registrations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    device_hash TEXT NOT NULL UNIQUE,
    user_agent  TEXT,
    last_seen   INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_device_user
    ON device_registrations(user_id);

  CREATE INDEX IF NOT EXISTS idx_device_hash
    ON device_registrations(device_hash);

  CREATE TABLE IF NOT EXISTS audit_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp      TEXT NOT NULL,
    action         TEXT NOT NULL,
    resource       TEXT NOT NULL,
    resource_id    TEXT NOT NULL,
    changes_json   TEXT NOT NULL DEFAULT '{}',
    admin_key_last4 TEXT NOT NULL DEFAULT 'unknown',
    ip             TEXT,
    status         TEXT NOT NULL DEFAULT 'SUCCESS',
    error          TEXT,
    entry_hash     TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS classroom_sessions (
    id             TEXT PRIMARY KEY,
    teacher_user_id TEXT NOT NULL,
    join_code_hash TEXT NOT NULL,
    state          TEXT NOT NULL CHECK (state IN ('created','lobby','running','finished','archived')),
    datum          TEXT NOT NULL,
    year           INTEGER NOT NULL,
    settings_json  TEXT NOT NULL DEFAULT '{}',
    created_at     INTEGER NOT NULL,
    started_at     INTEGER,
    finished_at    INTEGER,
    expires_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS classroom_participants (
    id                    TEXT PRIMARY KEY,
    session_id            TEXT NOT NULL,
    participant_token_hash TEXT NOT NULL,
    joined_at             INTEGER NOT NULL,
    last_seen_at          INTEGER NOT NULL,
    left_at               INTEGER,
    FOREIGN KEY (session_id) REFERENCES classroom_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS classroom_submissions (
    id             TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    round_no       INTEGER NOT NULL,
    payload_json   TEXT NOT NULL,
    score          INTEGER NOT NULL DEFAULT 0,
    max_score      INTEGER NOT NULL DEFAULT 0,
    submitted_at   INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES classroom_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES classroom_participants(id) ON DELETE CASCADE,
    UNIQUE (session_id, participant_id, round_no)
  );

  CREATE TABLE IF NOT EXISTS classroom_exports (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('csv','pdf')),
    status      TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
    file_ref    TEXT,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    finished_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES classroom_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_profiles_role
    ON user_profiles(role);

  CREATE INDEX IF NOT EXISTS idx_user_entitlements_unlocked
    ON user_entitlements(gesamtausgabe_unlocked);

  CREATE INDEX IF NOT EXISTS idx_user_email
    ON user(email);

  CREATE INDEX IF NOT EXISTS idx_user_createdAt
    ON user(createdAt);

  CREATE INDEX IF NOT EXISTS idx_session_userId
    ON session(userId);

  CREATE INDEX IF NOT EXISTS idx_account_userId
    ON account(userId);

  CREATE INDEX IF NOT EXISTS idx_verification_identifier
    ON verification(identifier);

  CREATE INDEX IF NOT EXISTS idx_classroom_sessions_teacher_created
    ON classroom_sessions(teacher_user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_classroom_sessions_state_expires
    ON classroom_sessions(state, expires_at);

  CREATE INDEX IF NOT EXISTS idx_classroom_sessions_join_hash
    ON classroom_sessions(join_code_hash);

  CREATE INDEX IF NOT EXISTS idx_classroom_participants_session_joined
    ON classroom_participants(session_id, joined_at);

  CREATE INDEX IF NOT EXISTS idx_classroom_participants_session_seen
    ON classroom_participants(session_id, last_seen_at);

  CREATE INDEX IF NOT EXISTS idx_classroom_submissions_session_round
    ON classroom_submissions(session_id, round_no);

  CREATE INDEX IF NOT EXISTS idx_classroom_submissions_session_submitted
    ON classroom_submissions(session_id, submitted_at);

  CREATE INDEX IF NOT EXISTS idx_classroom_exports_session_created
    ON classroom_exports(session_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
    ON audit_log(timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id
    ON audit_log(resource, resource_id, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_log_action_status
    ON audit_log(action, status, timestamp DESC);
`)

logger.info({ path: DB_PATH }, 'signifikation.db bereit')

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return rows.some((row) => row.name === columnName)
}

// ── Migrationen für neue Spalten ─────────────────────────────────
if (!hasColumn('kalender', 'thema')) {
  logger.info('Migration: kalender.thema hinzufügen')
  db.exec(`ALTER TABLE kalender ADD COLUMN thema TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('kalender', 'thema_kurz')) {
  logger.info('Migration: kalender.thema_kurz hinzufügen')
  db.exec(`ALTER TABLE kalender ADD COLUMN thema_kurz TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('kalender', 'thema_quelle')) {
  logger.info('Migration: kalender.thema_quelle hinzufügen')
  db.exec(`ALTER TABLE kalender ADD COLUMN thema_quelle TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('zeitreise', 'notiz')) {
  logger.info('Migration: zeitreise.notiz + zeitreise.link hinzufügen')
  db.exec(`ALTER TABLE zeitreise ADD COLUMN notiz TEXT NOT NULL DEFAULT ''`)
  db.exec(`ALTER TABLE zeitreise ADD COLUMN link  TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('wortzwilling', 'notiz')) {
  logger.info('Migration: wortzwilling.notiz + wortzwilling.link hinzufügen')
  db.exec(`ALTER TABLE wortzwilling ADD COLUMN notiz TEXT NOT NULL DEFAULT ''`)
  db.exec(`ALTER TABLE wortzwilling ADD COLUMN link  TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('stats', 'user_id')) {
  logger.info('Migriere Tabelle stats: fuege user_id hinzu')
  try {
    db.exec(`
      BEGIN;
      ALTER TABLE stats RENAME TO stats_legacy;

      CREATE TABLE stats (
        datum    TEXT NOT NULL,
        spiel    TEXT NOT NULL,
        user_id  TEXT NOT NULL DEFAULT '',
        plays    INTEGER NOT NULL DEFAULT 0,
        scoreSum INTEGER NOT NULL DEFAULT 0,
        maxSum   INTEGER NOT NULL DEFAULT 0,
        dist     TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (datum, spiel, user_id)
      );

      INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
      SELECT datum, spiel, '', plays, scoreSum, maxSum, dist
      FROM stats_legacy;

      DROP TABLE stats_legacy;

      COMMIT;
    `)
  } catch (err) {
    db.exec('ROLLBACK;')
    throw err
  }
}

if (hasColumn('stats', 'user_id')) {
  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stats_user
  ON stats(user_id);

  CREATE INDEX IF NOT EXISTS idx_stats_datum_spiel
  ON stats(datum, spiel);

  CREATE INDEX IF NOT EXISTS idx_stats_datum
  ON stats(datum);
  `)
}

// ── Migration: user_profiles.role 'teacher' → 'premium' ─────────
{
  const upRow = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='user_profiles'`).get()
  if (upRow?.sql?.includes("'teacher'")) {
    logger.info("Migration: user_profiles.role 'teacher' → 'premium'")
    try {
      db.exec(`
        BEGIN;

        CREATE TABLE user_profiles_new (
          user_id    TEXT PRIMARY KEY,
          role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','premium','admin')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        INSERT INTO user_profiles_new (user_id, role, created_at, updated_at)
        SELECT
          user_id,
          CASE WHEN role = 'teacher' THEN 'premium' ELSE role END,
          created_at,
          updated_at
        FROM user_profiles;

        DROP TABLE user_profiles;
        ALTER TABLE user_profiles_new RENAME TO user_profiles;

        CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

        COMMIT;
      `)
    } catch (err) {
      db.exec('ROLLBACK;')
      throw err
    }
  }
}

export default db
