#!/usr/bin/env node
/**
 * Migrations-Skript: user_profiles Tabelle für 'admin'-Role updaten
 */

import db from './db.js'
import logger from './logger.js'

function printInfo(message) {
  process.stdout.write(`${message}\n`)
}

function printError(message) {
  process.stderr.write(`${message}\n`)
}

try {
  printInfo('Migrating user_profiles table...')

  // Erstelle neue Tabelle mit korrektem Schema
  db.exec(`
    BEGIN;

    CREATE TABLE user_profiles_new (
      user_id    TEXT PRIMARY KEY,
      role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','premium','admin')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT INTO user_profiles_new SELECT * FROM user_profiles;
    DROP TABLE user_profiles;
    ALTER TABLE user_profiles_new RENAME TO user_profiles;

    COMMIT;
  `)

  printInfo('Migration complete - admin role added to user_profiles')
  db.close()
} catch (err) {
  logger.error({ err }, 'Migration-Fehler')
  printError(`Fehler: ${err.message}`)
  process.exit(1)
}
