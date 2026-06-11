/**
 * db.js – SQLite-Verbindung und Schema für Spieldaten
 *
 * Tabellen:
 *   lemmata      – Lemma-Objekte (Kollokationsspiel)
 *   kalender     – Tagesplanung { datum → [id1, id2, id3] }
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
import { runSqlMigrationsSync } from './migrate-sync.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Exportiert für das dateibasierte Backup (jobs/sqliteBackup.js)
export const DB_PATH = process.env.APP_DB || join(__dirname, 'data', 'signifikation.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')
// 5 s Retry-Fenster bei DB-Lock (z.B. PM2-Reload während Writes), damit
// Writer nicht sofort mit SQLITE_BUSY scheitern.
db.pragma('busy_timeout = 5000')
// 16 MB Page-Cache (negativer Wert = KiB). Default 2 MB ist für die
// hot Lemma-/Kalender-Reads zu knapp.
db.pragma('cache_size = -16000')
// Auto-Checkpoint nach 1000 Page-Writes (Default), zusätzlich periodisch
// passive Checkpoint, damit die .db-wal-Datei bei sehr schreibintensiven
// Phasen (Classroom-Sessions) nicht unbegrenzt wächst. PASSIVE blockiert
// keine Reader/Writer.
db.pragma('wal_autocheckpoint = 1000')
const WAL_CHECKPOINT_INTERVAL_MS = 60 * 60 * 1000 // 60 min
const walTimer = setInterval(() => {
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch {
    // Bei DB-Lock einfach beim nächsten Tick wieder probieren.
  }
}, WAL_CHECKPOINT_INTERVAL_MS)
walTimer.unref() // soll den Prozess nicht am Leben halten

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

  CREATE TABLE IF NOT EXISTS spezialwochen (
    woche               TEXT PRIMARY KEY,
    von                 TEXT NOT NULL,
    bis                 TEXT NOT NULL,
    lemma_id            TEXT NOT NULL,
    zwilling_partner    TEXT NOT NULL DEFAULT '',
    zwilling_pos        TEXT NOT NULL DEFAULT 'Substantiv',
    zwilling_kollokatoren TEXT NOT NULL DEFAULT '[]',
    zeitenwende_notiz   TEXT NOT NULL DEFAULT '',
    zeitenwende_link    TEXT NOT NULL DEFAULT '',
    lueckenfueller_id   TEXT NOT NULL DEFAULT '',
    notiz               TEXT NOT NULL DEFAULT '',
    link                TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_spezialwochen_von_bis
    ON spezialwochen(von, bis);

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

  CREATE INDEX IF NOT EXISTS idx_user_profiles_role
    ON user_profiles(role);

  CREATE INDEX IF NOT EXISTS idx_user_entitlements_unlocked
    ON user_entitlements(gesamtausgabe_unlocked);

  CREATE INDEX IF NOT EXISTS idx_user_createdAt
    ON user(createdAt);

  CREATE INDEX IF NOT EXISTS idx_session_userId
    ON session(userId);

  CREATE INDEX IF NOT EXISTS idx_session_expiresAt
    ON session(expiresAt);

  CREATE INDEX IF NOT EXISTS idx_account_userId
    ON account(userId);

  CREATE INDEX IF NOT EXISTS idx_verification_identifier
    ON verification(identifier);

  CREATE INDEX IF NOT EXISTS idx_verification_expiresAt
    ON verification(expiresAt);

  CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
    ON audit_log(timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id
    ON audit_log(resource, resource_id, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_log_action_status
    ON audit_log(action, status, timestamp DESC);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    platform   TEXT NOT NULL,
    endpoint   TEXT,
    p256dh     TEXT,
    auth       TEXT,
    apns_token TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_push_apns ON push_subscriptions(apns_token) WHERE apns_token IS NOT NULL;

  CREATE TABLE IF NOT EXISTS push_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
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

if (!hasColumn('kalender', 'lueckenfueller_id')) {
  logger.info('Migration: kalender.lueckenfueller_id hinzufügen')
  db.exec(`ALTER TABLE kalender ADD COLUMN lueckenfueller_id TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('wortzwilling', 'notiz')) {
  logger.info('Migration: wortzwilling.notiz + wortzwilling.link hinzufügen')
  db.exec(`ALTER TABLE wortzwilling ADD COLUMN notiz TEXT NOT NULL DEFAULT ''`)
  db.exec(`ALTER TABLE wortzwilling ADD COLUMN link  TEXT NOT NULL DEFAULT ''`)
}

if (!hasColumn('stats', 'user_id')) {
  logger.info('Migriere Tabelle stats: fuege user_id hinzu')
  // better-sqlite3-Transaktion sorgt für sauberes Rollback bei Fehlern;
  // rohes BEGIN/COMMIT via db.exec() würde im catch-Pfad ROLLBACK ins Leere laufen lassen.
  const migrateStats = db.transaction(() => {
    db.exec(`ALTER TABLE stats RENAME TO stats_legacy`)
    db.exec(`
      CREATE TABLE stats (
        datum    TEXT NOT NULL,
        spiel    TEXT NOT NULL,
        user_id  TEXT NOT NULL DEFAULT '',
        plays    INTEGER NOT NULL DEFAULT 0,
        scoreSum INTEGER NOT NULL DEFAULT 0,
        maxSum   INTEGER NOT NULL DEFAULT 0,
        dist     TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (datum, spiel, user_id)
      )
    `)
    db.exec(`
      INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
      SELECT datum, spiel, '', plays, scoreSum, maxSum, dist
      FROM stats_legacy
    `)
    db.exec(`DROP TABLE stats_legacy`)
  })
  migrateStats()
}

if (hasColumn('stats', 'user_id')) {
  // Nur idx_stats_user: der PRIMARY KEY (datum, spiel, user_id) deckt die
  // Links-Präfixe (datum) und (datum, spiel) bereits ab — die früheren
  // Zusatzindizes idx_stats_datum / idx_stats_datum_spiel waren redundanter
  // Write-Overhead auf dem Spiel-Hotpath und werden in Migration 0012
  // entfernt (Review 2026-06-10).
  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stats_user
  ON stats(user_id);
  `)
}

if (!hasColumn('lemmata', 'lueckenfueller')) {
  logger.info('Migration: lemmata.lueckenfueller hinzufügen')
  db.exec(`ALTER TABLE lemmata ADD COLUMN lueckenfueller TEXT`)
}

// ── Migration: MM-DD → YYYY-MM-DD (Datum mit Jahr speichern) ────────────────
// Alle vorhandenen MM-DD-Keys bekommen das aktuelle Jahr zugewiesen.
// Idempotent: WHERE LENGTH(datum) = 5 trifft nur noch nicht migrierte Einträge.
// db.transaction() statt rohem BEGIN/COMMIT via db.exec(): wirft ein Statement
// mittendrin, rollt better-sqlite3 sauber zurück — ein roher Block ließe eine
// offene Transaktion auf der Connection liegen und der nächste BEGIN
// scheiterte mit "cannot start a transaction within a transaction".
{
  const hasMmddKalender = db.prepare(`SELECT COUNT(*) as n FROM kalender WHERE LENGTH(datum) = 5`).get()
  if (hasMmddKalender?.n > 0) {
    const year = new Date().getFullYear()
    logger.info({ count: hasMmddKalender.n, year }, 'Migration: kalender MM-DD → YYYY-MM-DD')
    db.transaction(() => {
      db.exec(`
        INSERT OR IGNORE INTO kalender (datum, ids, thema, thema_kurz, thema_quelle, lueckenfueller_id)
          SELECT '${year}-' || datum, ids, thema, thema_kurz, thema_quelle, lueckenfueller_id
          FROM kalender WHERE LENGTH(datum) = 5;
        DELETE FROM kalender WHERE LENGTH(datum) = 5;
      `)
    })()
  }

  const hasMmddWZ = db.prepare(`SELECT COUNT(*) as n FROM wortzwilling WHERE LENGTH(datum) = 5`).get()
  if (hasMmddWZ?.n > 0) {
    const year = new Date().getFullYear()
    logger.info({ count: hasMmddWZ.n, year }, 'Migration: wortzwilling MM-DD → YYYY-MM-DD')
    db.transaction(() => {
      db.exec(`
        INSERT OR IGNORE INTO wortzwilling (datum, wortA, wortB, pos, kollokatoren, notiz, link)
          SELECT '${year}-' || datum, wortA, wortB, pos, kollokatoren, notiz, link
          FROM wortzwilling WHERE LENGTH(datum) = 5;
        DELETE FROM wortzwilling WHERE LENGTH(datum) = 5;
      `)
    })()
  }

  const hasMmddZW = db.prepare(`SELECT COUNT(*) as n FROM zeitenwende WHERE LENGTH(datum) = 5`).get()
  if (hasMmddZW?.n > 0) {
    const year = new Date().getFullYear()
    logger.info({ count: hasMmddZW.n, year }, 'Migration: zeitenwende MM-DD → YYYY-MM-DD')
    db.transaction(() => {
      db.exec(`
        INSERT OR IGNORE INTO zeitenwende (datum, data)
          SELECT '${year}-' || datum, data
          FROM zeitenwende WHERE LENGTH(datum) = 5;
        DELETE FROM zeitenwende WHERE LENGTH(datum) = 5;
      `)
    })()
  }

  const hasMmddStats = db.prepare(`SELECT COUNT(*) as n FROM stats WHERE LENGTH(datum) = 5`).get()
  if (hasMmddStats?.n > 0) {
    const year = new Date().getFullYear()
    logger.info({ count: hasMmddStats.n, year }, 'Migration: stats MM-DD → YYYY-MM-DD')
    db.transaction(() => {
      db.exec(`
        INSERT OR IGNORE INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
          SELECT '${year}-' || datum, spiel, user_id, plays, scoreSum, maxSum, dist
          FROM stats WHERE LENGTH(datum) = 5;
        DELETE FROM stats WHERE LENGTH(datum) = 5;
      `)
    })()
  }
}

// ── Migration: Gerätelimit-Feature entfernt – device_registrations löschen ──
{
  const deviceTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='device_registrations'`).get()
  if (deviceTable) {
    logger.info('Migration: device_registrations entfernt (Gerätelimit-Feature abgeschafft)')
    db.exec(`DROP TABLE IF EXISTS device_registrations`)
  }
}

// ── Migration: user_profiles.role 'teacher' → 'premium' ─────────
{
  const upRow = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='user_profiles'`).get()
  if (upRow?.sql?.includes("'teacher'")) {
    logger.info("Migration: user_profiles.role 'teacher' → 'premium'")
    // db.transaction() statt rohem BEGIN/COMMIT: better-sqlite3 rollt bei
    // Fehlern selbst zurück — kein ROLLBACK-ins-Leere / "no transaction
    // is active"-Maskierungsrisiko im catch-Pfad.
    db.transaction(() => {
      db.exec(`
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
      `)
    })()
  }
}

// ── Migration: push_subscriptions.user_id → nullable ────────────
// Erlaubt anonyme Push-Subscriptions ohne eingeloggten Account.
{
  const pushCols = db.prepare(`PRAGMA table_info(push_subscriptions)`).all()
  const userIdCol = pushCols.find(r => r.name === 'user_id')
  if (userIdCol && userIdCol.notnull === 1) {
    logger.info('Migration: push_subscriptions.user_id NOT NULL → nullable')
    // db.transaction() statt rohem BEGIN/COMMIT (siehe user_profiles-Block oben)
    db.transaction(() => {
      db.exec(`
        CREATE TABLE push_subscriptions_new (
          id         TEXT PRIMARY KEY,
          user_id    TEXT,
          platform   TEXT NOT NULL,
          endpoint   TEXT,
          p256dh     TEXT,
          auth       TEXT,
          apns_token TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        );
        INSERT INTO push_subscriptions_new SELECT * FROM push_subscriptions;
        DROP TABLE push_subscriptions;
        ALTER TABLE push_subscriptions_new RENAME TO push_subscriptions;
        CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_push_apns ON push_subscriptions(apns_token) WHERE apns_token IS NOT NULL;
      `)
    })()
  }
}

// ── Seed: Standard-Push-Templates ───────────────────────────────
// Platzhalter: {lemma} {thema} {wortA} {wortB} {lueckensatz} {wochentag} {lemmata}
{
  const count = db.prepare(`SELECT COUNT(*) AS n FROM push_templates`).get().n
  if (count === 0) {
    logger.info('Seed: Standard-Push-Templates einfügen')
    const now = Date.now()
    const insert = db.prepare(`
      INSERT INTO push_templates (title, body, enabled, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
    `)
    const defaults = [
      ['Heute: »{lemma}«',            'Welche Wörter treten am häufigsten gemeinsam auf?'],
      ['{lemma} wartet auf dich',     'Kennst du seine stärksten Kollokationen?'],
      ['Thema heute: {thema}',        '»{lemma}« und mehr warten auf dich.'],
      ['Aus echten Texten: »{lemma}«', 'Heute täglich neu – korpusbasiert.'],
      ['{wortA} oder {wortB}?',       'Spür dem feinen Unterschied nach.'],
      ['Zwei Wörter, ein Rätsel',     '{wortA} und {wortB} – was unterscheidet sie?'],
      ['Kannst du die Lücke füllen?', '„{lueckensatz}"'],
      ['Signifikation · {wochentag}', '{lemmata}'],
      ['Signifikation · Heute',       'Thema: {thema}'],
    ]
    db.transaction((rows) => {
      for (const [title, body] of rows) insert.run(title, body, now, now)
    })(defaults)
  }
}

// ── Versionierte SQL-Migrationen synchron anwenden ──────────────────────────
// Muss VOR dem Export geschehen: andere Module (z.B. server/classroom/store.js)
// registrieren beim Import sofort Prepared Statements auf classroom_*-Tabellen.
// Ohne diesen Aufruf scheitert der Server-Boot in einer frischen DB-Umgebung
// (z.B. CI Smoke-Test) mit "no such table: classroom_session".
// JS-Migrationen bleiben dem async migrate-runner.js im Server-IIFE überlassen.
const _migResult = runSqlMigrationsSync(db)
if (_migResult.applied.length > 0) {
  logger.info({ applied: _migResult.applied }, 'SQL-Migrationen (sync) angewendet')
}

export default db
