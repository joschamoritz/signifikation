import { normalizeKalenderShape } from '../store-daily-content.js'
import { normalizeDatumToIso } from '../date-utils.js'

function normalizeDateKeyedMap(raw) {
  const result = {}
  for (const [datum, value] of Object.entries(raw || {})) {
    const isoDatum = normalizeDatumToIso(datum)
    if (!isoDatum) continue
    result[isoDatum] = value
  }
  return result
}

/**
 * Konvertiert das alte aggregierte stats.json-Format (datum → spiel → {plays,...})
 * in das aktuelle Zeilen-Array-Format, falls nötig.
 */
function flattenLegacyStatsFormat(statsObj) {
  const rows = []
  for (const [datum, games] of Object.entries(statsObj)) {
    if (!games || typeof games !== 'object') continue
    for (const [spiel, v] of Object.entries(games)) {
      if (!v || typeof v !== 'object') continue
      rows.push({
        datum,
        spiel,
        user_id:  v.user_id  ?? '',
        plays:    v.plays    ?? 0,
        scoreSum: v.scoreSum ?? 0,
        maxSum:   v.maxSum   ?? 0,
        dist:     Array.isArray(v.dist) ? v.dist : [],
      })
    }
  }
  return rows
}

function normalizeStatsRows(rows) {
  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new BackupDateiFehler('Die Datei enthält eine ungültige Statistik-Zeile.')
    }

    const isoDatum = normalizeDatumToIso(row.datum)
    if (!isoDatum) {
      throw new BackupDateiFehler('Die Datei enthält eine Statistik-Zeile mit ungültigem Datum.')
    }

    return { ...row, datum: isoDatum }
  })
}

/** Die Datei ist nicht zu gebrauchen (Format, fehlende Teile): Der Aufrufer antwortet mit 400, nichts wird geändert. */
export class BackupDateiFehler extends Error {
  constructor(message) {
    super(message)
    this.name = 'BackupDateiFehler'
    this.status = 400
  }
}

/** Die vier Inhaltsteile, die jede Sicherungsdatei enthalten muss (Name in der Datei → Art). */
const PFLICHTTEILE = [
  ['lemmata.json', 'liste'],
  ['kalender.json', 'objekt'],
  ['wortzwilling.json', 'objekt'],
  ['zeitenwende.json', 'objekt'],
]

const istObjekt = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

// Links aus einer Sicherungsdatei gelten wie im Tag-Editor (LINK_HTTP in middleware/validate.js): leer oder
// http(s)://…, sonst wird der Link geleert statt die Datei abzuweisen – ältere Sicherungen enthalten Links
// ohne Schema (Security-Audit run-1: das Wiederherstellen umging die Prüfung).
const WEB_LINK = /^https?:\/\/\S+$/i
function mitWebLink(eintrag) {
  if (!istObjekt(eintrag) || typeof eintrag.link !== 'string') return eintrag
  const link = eintrag.link.trim()
  return { ...eintrag, link: link && WEB_LINK.test(link) && link.length <= 500 ? link : '' }
}
const mapWerte = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]))

/**
 * Prüft die Sicherungsdatei und bringt sie in die Form, die der Store erwartet.
 *
 * Fehlt einer der vier Inhaltsteile (oder hat er die falsche Form), wird die Datei abgewiesen:
 * Ein fehlender Teil darf nie als „leer“ gelten, sonst löschte das Wiederherstellen die Tabelle.
 * Eine leere Liste bzw. ein leeres Objekt ist dagegen eine gültige Angabe.
 *
 * statsRows ist null, wenn die Datei keine Statistik enthält.
 *
 * @throws {BackupDateiFehler}
 */
export function sanitizeBackupBundle(payload) {
  if (!payload || typeof payload !== 'object' || !payload.files || typeof payload.files !== 'object') {
    throw new BackupDateiFehler('Ungültiges Backup-Format')
  }

  const files = payload.files
  for (const [name, art] of PFLICHTTEILE) {
    if (files[name] === undefined || files[name] === null) {
      throw new BackupDateiFehler(`Datei unvollständig: ${name} fehlt`)
    }
    if (art === 'liste' ? !Array.isArray(files[name]) : !istObjekt(files[name])) {
      throw new BackupDateiFehler(`Datei ungültig: ${name} hat nicht das erwartete Format`)
    }
  }

  const lemmata = files['lemmata.json'].map(mitWebLink)
  // Alte Backup-Formate (datum → id[]) auf neue Shape (datum → { ids, thema }) normalisieren
  const kalender = normalizeDateKeyedMap(normalizeKalenderShape(files['kalender.json']))
  const wortzwilling = mapWerte(normalizeDateKeyedMap(files['wortzwilling.json']), mitWebLink)
  const zeitenwende = mapWerte(normalizeDateKeyedMap(files['zeitenwende.json']), mitWebLink)

  const rawStatsRows = (() => {
    if (Array.isArray(files['stats-rows.json'])) return files['stats-rows.json']
    if (Array.isArray(files['stats.json'])) return files['stats.json']
    // Altes Format: { datum: { spiel: { plays, ... } } } → in Zeilen-Array konvertieren
    if (istObjekt(files['stats.json'])) return flattenLegacyStatsFormat(files['stats.json'])
    return null
  })()
  const statsRows = rawStatsRows ? normalizeStatsRows(rawStatsRows) : null

  return { lemmata, kalender, wortzwilling, zeitenwende, statsRows }
}

/** Dateinamen, die eine Sicherungsdatei enthalten darf (nur diese kommen ins Protokoll). */
export const BACKUP_DATEINAMEN = Object.freeze(['lemmata.json', 'kalender.json', 'wortzwilling.json', 'zeitenwende.json', 'stats.json', 'stats-rows.json'])

/**
 * Zahlen je Teil für Antwort, Protokoll und Vorschau. statsRows zählt nur, was tatsächlich ersetzt würde:
 * ohne `mitStatistik` ist es 0 (die Statistik bleibt), sonst die Zahl der Zeilen in der Datei.
 */
export function zaehleBundle(bundle, { mitStatistik = false } = {}) {
  return {
    lemmata: bundle.lemmata.length,
    kalender: Object.keys(bundle.kalender).length,
    wortzwilling: Object.keys(bundle.wortzwilling).length,
    zeitenwende: Object.keys(bundle.zeitenwende).length,
    statsRows: mitStatistik && Array.isArray(bundle.statsRows) ? bundle.statsRows.length : 0,
  }
}
