/**
 * Relation und Position der geprüften Belegsätze lesen (Spalte beleg_pruefung.details, Migration 0034).
 *
 * Eigenes, nur lesendes Modul mit eigener Verbindung: Der Lückenfüller rechnet im Worker-Thread
 * (lueckenfuellerWorker.js) und braucht die Details dort. db.js gehört dem Hauptprozess – es
 * öffnet beim Import schreibend und migriert. Eine Read-only-Verbindung auf dieselbe WAL-Datei
 * ist dagegen auch neben dem Hauptprozess unbedenklich.
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
      holen = db.prepare('SELECT belege_stand, details FROM beleg_pruefung WHERE basis = ? AND kollokator = ?')
    } catch (err) {
      logger.warn({ err }, 'Belegprüfung: Details nicht lesbar')
      holen = undefined
      return null
    }
  }
  return holen
}

/**
 * Relation (aus Sicht der Basis, „ATTR“, „~ATTR“ …) und Position des Kollokators je geprüftem Satz.
 * Leeres Objekt: geprüft, aber kein Satz bestanden. null: nie geprüft, vor Migration 0034
 * geprüft oder auf einem anderen Belegbestand.
 *
 * @returns {Object<string, {rel: string[], start: number, ende: number}>|null}  Schlüssel = Satz-ID
 */
export function gepruefteDetails(basis, kollokator) {
  let row
  try {
    row = stmt()?.get(String(basis).toLowerCase(), String(kollokator).toLowerCase())
  } catch {
    return null   // Tabelle oder Spalte fehlt (Migration noch nicht gelaufen)
  }
  if (!row?.details || row.belege_stand !== belegeStand()) return null
  try {
    return JSON.parse(row.details)
  } catch {
    return null
  }
}
