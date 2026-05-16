/**
 * templates.js – Notification-Templates für Push-Benachrichtigungen
 *
 * 8 Vorlagen, Rotation via dayOfYear % 8.
 * Tagesdaten werden aus der DB geladen (kalender, lemmata, wortzwilling).
 */
import db from '../db.js'
import logger from '../logger.js'

/**
 * Berechnet den Tag des Jahres (1-basiert) für ein Date-Objekt.
 */
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date - start
  const oneDay = 1000 * 60 * 60 * 24
  return Math.floor(diff / oneDay)
}

/**
 * Gibt den deutschen Wochentagsnamen zurück.
 */
function getWochentag(date) {
  const tage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  return tage[date.getDay()]
}

/**
 * Formatiert ein Date-Objekt als YYYY-MM-DD.
 */
function formatDatum(date) {
  return date.toISOString().slice(0, 10)
}

const getKalenderStmt = db.prepare(`
  SELECT ids, thema, lueckenfueller_id
  FROM kalender
  WHERE datum = ?
`)

const getLemmaStmt = db.prepare(`
  SELECT lemma, lueckenfueller
  FROM lemmata
  WHERE id = ?
`)

const getWortzwillingStmt = db.prepare(`
  SELECT wortA, wortB
  FROM wortzwilling
  WHERE datum = ?
`)

/**
 * Lädt die Tagesdaten für ein gegebenes Datum aus der DB.
 * Gibt ein Objekt mit lemma, thema, wortA, wortB, lueckensatz zurück.
 * Felder können null sein, wenn keine Daten vorhanden.
 */
function loadTagesdaten(datum) {
  const result = {
    lemma: null,
    thema: null,
    wortA: null,
    wortB: null,
    lueckensatz: null,
  }

  try {
    const kalender = getKalenderStmt.get(datum)
    if (!kalender) return result

    if (kalender.thema) result.thema = kalender.thema

    const ids = (() => {
      try { return JSON.parse(kalender.ids) } catch { return [] }
    })()

    if (ids.length > 0) {
      const lemmaRow = getLemmaStmt.get(ids[0])
      if (lemmaRow) {
        result.lemma = lemmaRow.lemma || null
        if (lemmaRow.lueckenfueller) {
          try {
            const lf = JSON.parse(lemmaRow.lueckenfueller)
            result.lueckensatz = lf?.satz || null
          } catch {
            // kein gültiges JSON – ignorieren
          }
        }
      }
    }

    if (kalender.lueckenfueller_id && !result.lueckensatz) {
      const lfRow = getLemmaStmt.get(kalender.lueckenfueller_id)
      if (lfRow?.lueckenfueller) {
        try {
          const lf = JSON.parse(lfRow.lueckenfueller)
          result.lueckensatz = lf?.satz || null
        } catch {
          // ignorieren
        }
      }
    }

    const wz = getWortzwillingStmt.get(datum)
    if (wz) {
      result.wortA = wz.wortA || null
      result.wortB = wz.wortB || null
    }
  } catch (err) {
    logger.warn({ err, datum }, 'Tagesdaten für Notification konnten nicht geladen werden')
  }

  return result
}

/**
 * Definiert die 8 Template-Builder-Funktionen (Index 0–7).
 * Jede Funktion erhält die Tagesdaten und gibt { title, body } zurück.
 * Fallbacks sind inline definiert.
 */
const TEMPLATES = [
  // 0
  ({ lemma }) => ({
    title: lemma ? `Heute: »${lemma}«` : 'Signifikation · Heute',
    body: 'Welche Wörter treten am häufigsten gemeinsam auf?',
  }),
  // 1
  ({ lemma }) => ({
    title: lemma ? `${lemma} wartet auf dich` : 'Dein Wort wartet auf dich',
    body: 'Kennst du seine stärksten Kollokationen?',
  }),
  // 2 – Fallback auf #0 wenn kein Thema
  ({ lemma, thema }) => {
    if (!thema) {
      return {
        title: lemma ? `Heute: »${lemma}«` : 'Signifikation · Heute',
        body: 'Welche Wörter treten am häufigsten gemeinsam auf?',
      }
    }
    return {
      title: `Thema heute: ${thema}`,
      body: lemma ? `»${lemma}« und mehr warten auf dich.` : 'Dein tägliches Wortspiel wartet.',
    }
  },
  // 3
  ({ lemma }) => ({
    title: lemma ? `Aus echten Texten: »${lemma}«` : 'Aus echten Texten',
    body: 'Heute täglich neu – korpusbasiert.',
  }),
  // 4 – Fallback auf #1 wenn kein Wortzwilling
  ({ lemma, wortA, wortB }) => {
    if (!wortA || !wortB) {
      return {
        title: lemma ? `${lemma} wartet auf dich` : 'Dein Wort wartet auf dich',
        body: 'Kennst du seine stärksten Kollokationen?',
      }
    }
    return {
      title: `${wortA} oder ${wortB}?`,
      body: 'Spür dem feinen Unterschied nach.',
    }
  },
  // 5 – Fallback auf #3 wenn kein Wortzwilling
  ({ lemma, wortA, wortB }) => {
    if (!wortA || !wortB) {
      return {
        title: lemma ? `Aus echten Texten: »${lemma}«` : 'Aus echten Texten',
        body: 'Heute täglich neu – korpusbasiert.',
      }
    }
    return {
      title: 'Zwei Wörter, ein Rätsel',
      body: `${wortA} und ${wortB} – was unterscheidet sie?`,
    }
  },
  // 6 – Fallback auf #0 wenn kein Lückensatz
  ({ lemma, lueckensatz }) => {
    if (!lueckensatz) {
      return {
        title: lemma ? `Heute: »${lemma}«` : 'Signifikation · Heute',
        body: 'Welche Wörter treten am häufigsten gemeinsam auf?',
      }
    }
    return {
      title: `„${lueckensatz}"`,
      body: 'Kannst du die Lücke füllen? · Signifikation',
    }
  },
  // 7
  ({ lemma, wochentag }) => ({
    title: `Signifikation · ${wochentag}`,
    body: lemma ? `${lemma} · täglich neu.` : 'Täglich neu.',
  }),
]

/**
 * Erstellt das Notification-Payload für ein gegebenes Datum.
 *
 * @param {Date} date
 * @returns {{ title: string, body: string, url: string }}
 */
export function buildNotificationPayload(date = new Date()) {
  const datum = formatDatum(date)
  const dayOfYear = getDayOfYear(date)
  const templateIndex = dayOfYear % 8
  const wochentag = getWochentag(date)

  const tagesdaten = loadTagesdaten(datum)
  const ctx = { ...tagesdaten, wochentag }

  try {
    const { title, body } = TEMPLATES[templateIndex](ctx)
    return { title, body, url: '/' }
  } catch (err) {
    logger.warn({ err, templateIndex, datum }, 'Template-Rendering fehlgeschlagen, verwende Fallback')
    return {
      title: 'Signifikation',
      body: 'Dein tägliches Wortspiel wartet.',
      url: '/',
    }
  }
}
