/**
 * Ergebnisse der Belegprüfung lesen: bestandene Satz-IDs und je Satz Relation und Position
 * (Spalte beleg_pruefung.details, Migration 0034).
 *
 * Eigenes, nur lesendes Modul mit eigener Verbindung: Der Lückenfüller rechnet im Worker-Thread
 * (lueckenfuellerWorker.js) und braucht die Details dort. db.js gehört dem Hauptprozess – es
 * öffnet beim Import schreibend und migriert. Eine Read-only-Verbindung auf dieselbe WAL-Datei
 * ist dagegen auch neben dem Hauptprozess unbedenklich. Der Kurs liest hier, weil die Prüfung
 * (index.js) ihrerseits die Kurs-Paare einsammelt.
 */
import Database from 'better-sqlite3'
import { DB_PATH } from '../dbPfad.js'
import { belegeStand } from '../belege.js'
import logger from '../logger.js'

let holen = null

function stmt() {
  if (holen === undefined) return null   // Öffnen schon einmal gescheitert
  if (!holen) {
    try {
      const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      holen = db.prepare('SELECT belege_stand, bestanden, satz_ids, details FROM beleg_pruefung WHERE basis = ? AND kollokator = ?')
    } catch (err) {
      logger.warn({ err }, 'Belegprüfung: Details nicht lesbar')
      holen = undefined
      return null
    }
  }
  return holen
}

function zeile(basis, kollokator) {
  try {
    return stmt()?.get(String(basis).toLowerCase(), String(kollokator).toLowerCase())
  } catch {
    return null   // Tabelle oder Spalte fehlt (Migration noch nicht gelaufen)
  }
}

/** Geprüfte Satz-IDs eines Paars, oder null (nie geprüft, nichts bestanden, anderer Belegbestand). */
export function gepruefteSatzIds(basis, kollokator) {
  const row = zeile(basis, kollokator)
  if (!row || row.bestanden === 0 || row.belege_stand !== belegeStand()) return null
  try {
    return JSON.parse(row.satz_ids)
  } catch {
    return null
  }
}

/**
 * Relation (aus Sicht der Basis, „ATTR“, „~ATTR“ …) und Position des Kollokators je geprüftem Satz.
 * Leeres Objekt: geprüft, aber kein Satz bestanden. null: nie geprüft, vor Migration 0034
 * geprüft oder auf einem anderen Belegbestand.
 *
 * @returns {Object<string, {rel: string[], start: number, ende: number}>|null}  Schlüssel = Satz-ID
 */
export function gepruefteDetails(basis, kollokator) {
  const row = zeile(basis, kollokator)
  if (!row?.details || row.belege_stand !== belegeStand()) return null
  try {
    return JSON.parse(row.details)
  } catch {
    return null
  }
}
