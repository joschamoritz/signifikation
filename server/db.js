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
    plays    INTEGER NOT NULL DEFAULT 0,
    scoreSum INTEGER NOT NULL DEFAULT 0,
    maxSum   INTEGER NOT NULL DEFAULT 0,
    dist     TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (datum, spiel)
  );
`)

logger.info({ path: DB_PATH }, 'signifikation.db bereit')

export default db
