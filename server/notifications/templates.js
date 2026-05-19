/**
 * templates.js – Notification-Templates für Push-Benachrichtigungen
 *
 * Templates werden in der Tabelle `push_templates` gepflegt (Admin-Panel).
 * Jedes Template hat Titel + Text mit Platzhaltern. Für die tägliche
 * Benachrichtigung wird zufällig aus den aktiven Templates gewählt, deren
 * Platzhalter an dem Tag alle befüllbar sind.
 */
import db from '../db.js'
import logger from '../logger.js'

/** Verfügbare Platzhalter (für Admin-UI und Validierung). */
export const PLACEHOLDERS = ['lemma', 'thema', 'wortA', 'wortB', 'lueckensatz', 'wochentag', 'lemmata']

const STATIC_FALLBACK = {
  title: 'Signifikation',
  body: 'Dein tägliches Wortspiel wartet.',
  url: '/',
}

/** Gibt den deutschen Wochentagsnamen zurück. */
function getWochentag(date) {
  const tage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  return tage[date.getDay()]
}

/** Formatiert ein Date-Objekt als YYYY-MM-DD. */
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

const listEnabledTemplatesStmt = db.prepare(`
  SELECT id, title, body FROM push_templates WHERE enabled = 1
`)

const getTemplateStmt = db.prepare(`
  SELECT id, title, body FROM push_templates WHERE id = ?
`)

const listAllTemplatesStmt = db.prepare(`
  SELECT id, title, body, enabled FROM push_templates ORDER BY id
`)

/**
 * Lädt die Tagesdaten für ein gegebenes Datum aus der DB.
 * Gibt ein Objekt mit lemma, thema, wortA, wortB, lueckensatz, lemmata zurück.
 * Felder können null bzw. leer sein, wenn keine Daten vorhanden.
 */
function loadTagesdaten(datum) {
  const result = {
    lemma: null,
    lemmata: [],
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
      result.lemmata = ids.slice(0, 3)
        .map(id => getLemmaStmt.get(id)?.lemma)
        .filter(Boolean)
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
 * Baut den Platzhalter-Kontext für ein Datum.
 * Jeder Wert ist ein nicht-leerer String oder null (= nicht verfügbar).
 */
function buildContext(date) {
  const t = loadTagesdaten(formatDatum(date))
  return {
    lemma:       t.lemma || null,
    thema:       t.thema || null,
    wortA:       t.wortA || null,
    wortB:       t.wortB || null,
    lueckensatz: t.lueckensatz || null,
    wochentag:   getWochentag(date),
    lemmata:     t.lemmata.length > 0 ? t.lemmata.join(' · ') : null,
  }
}

/** Liefert die Menge der in einem Text verwendeten Platzhalter-Namen. */
function placeholdersIn(text) {
  const found = new Set()
  for (const m of String(text ?? '').matchAll(/\{(\w+)\}/g)) {
    found.add(m[1])
  }
  return found
}

/**
 * Gibt die Platzhalter eines Templates zurück, die im Kontext nicht
 * befüllbar sind. Unbekannte Platzhalter zählen ebenfalls als fehlend.
 */
function missingPlaceholders(template, ctx) {
  const used = new Set([
    ...placeholdersIn(template.title),
    ...placeholdersIn(template.body),
  ])
  return [...used].filter(key => !ctx[key])
}

/** Ersetzt {platzhalter}-Token durch ihre Kontextwerte (fehlende → leer). */
function render(text, ctx) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (_, key) => ctx[key] ?? '')
}

/**
 * Erstellt das Notification-Payload für ein gegebenes Datum.
 * Wählt zufällig aus den aktiven Templates, deren Platzhalter an dem Tag
 * vollständig befüllbar sind. Gibt es keine, kommt ein statischer Fallback.
 *
 * @param {Date} date
 * @returns {{ title: string, body: string, url: string }}
 */
export function buildNotificationPayload(date = new Date()) {
  try {
    const ctx = buildContext(date)
    const templates = listEnabledTemplatesStmt.all()
    const eligible = templates.filter(t => missingPlaceholders(t, ctx).length === 0)

    if (eligible.length === 0) {
      logger.warn({ datum: formatDatum(date) }, 'Push: kein passendes Template – Fallback')
      return { ...STATIC_FALLBACK }
    }

    const chosen = eligible[Math.floor(Math.random() * eligible.length)]
    return {
      title: render(chosen.title, ctx),
      body:  render(chosen.body, ctx),
      url:   '/',
    }
  } catch (err) {
    logger.warn({ err }, 'Template-Rendering fehlgeschlagen, verwende Fallback')
    return { ...STATIC_FALLBACK }
  }
}

/**
 * Rendert ein einzelnes Template (per ID) mit den Tagesdaten eines Datums.
 * Für den manuellen Versand eines Templates aus dem Admin-Panel.
 *
 * @returns {{ title: string, body: string } | null}
 */
export function renderTemplateById(id, date = new Date()) {
  const t = getTemplateStmt.get(id)
  if (!t) return null
  const ctx = buildContext(date)
  return { title: render(t.title, ctx), body: render(t.body, ctx) }
}

/**
 * Liefert alle Templates inkl. gerenderter Vorschau für ein Datum.
 * Für die Anzeige im Admin-Panel.
 */
export function listTemplatesWithPreview(date = new Date()) {
  const ctx = buildContext(date)
  return listAllTemplatesStmt.all().map(t => {
    const missing = missingPlaceholders(t, ctx)
    return {
      id:      t.id,
      title:   t.title,
      body:    t.body,
      enabled: !!t.enabled,
      preview: {
        title:    render(t.title, ctx),
        body:     render(t.body, ctx),
        eligible: missing.length === 0,
        missing,
      },
    }
  })
}
