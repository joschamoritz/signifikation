#!/usr/bin/env node
/**
 * Setup-Skript: Zusatz-Index idx_collocations_top auf wortprofil.db anlegen.
 * Nutze: node server/setup-wortprofil-index.js
 *
 * Hintergrund (Review 2026-07-18): fetchSyntagmaticPatterns sortiert über
 * ALLE Relationen eines Lemmas nach logDice. Der vorhandene Index
 * idx_collocations_lookup (lemma, pos, relation, logDice DESC) sortiert nur
 * je Relations-Gruppe → EXPLAIN QUERY PLAN zeigt "USE TEMP B-TREE FOR
 * ORDER BY": alle Lemma-Zeilen (z. B. "Haus" ≈ 5.000) werden materialisiert,
 * nur um Top-10 zu liefern.
 *
 * idx_collocations_top (lemma, pos, logDice DESC, frequency, dep_pos) liefert
 * die Sortierung direkt aus dem Index, filtert frequency/dep_pos ohne
 * Row-Lookup und deckt auch die SUM(frequency)-Query ab. Bewusst schlank
 * (keine Textspalten wie relation_description) – Row-Lookups fallen nur für
 * die LIMIT-Treffer an, der Index bleibt bei ~9,3 Mio. Zeilen kompakt.
 *
 * Idempotent (IF NOT EXISTS). Muss einmal lokal UND einmal auf dem Hetzner-
 * Volume laufen; Neubauten der DB bekommen den Index aus
 * wortprofil/04_score/build_wortprofil_fast.py.
 */

import './env.js' // .env laden – WORTPROFIL_DB kann dort gesetzt sein (Hetzner)
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Gleiche Pfad-Auflösung wie server/wortprofil.js
const DB_PATH = process.env.WORTPROFIL_DB
  ?? resolve(__dirname, '..', 'wortprofil', '05_db', 'wortprofil.db')

try {
  const db = new Database(DB_PATH, { fileMustExist: true })
  const before = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_collocations_top'"
  ).get()
  if (before) {
    logger.info({ db: DB_PATH }, 'idx_collocations_top existiert bereits – nichts zu tun')
  } else {
    logger.info({ db: DB_PATH }, 'Lege idx_collocations_top an (kann bei ~9 Mio. Zeilen ein paar Minuten dauern) …')
    const t0 = Date.now()
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_collocations_top
        ON collocations (lemma, pos, logDice DESC, frequency, dep_pos)
    `)
    logger.info({ db: DB_PATH, sekunden: ((Date.now() - t0) / 1000).toFixed(1) }, 'idx_collocations_top angelegt')
  }
  db.close()
} catch (err) {
  logger.error({ err, db: DB_PATH }, 'Index-Setup fehlgeschlagen')
  process.exit(1)
}
