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
export const PLACEHOLDERS = ['lemma', 'thema', 'wortA', 'wortB', 'lueckensatz', 'wochentag', 'lemmata', 'streak']

const STATIC_FALLBACK = {
  title: 'Signifikation',
  body: 'Dein tägliches Wortspiel wartet.',
  url: '/',
}

/**
 * Fallback für den Streak-Saver, wenn an dem Tag kein Streak-Template
 * befüllbar ist (z. B. nur ein {lemma}-Template, aber kein Tageswort).
 * Enthält die Serienlänge, damit der Anreiz erhalten bleibt.
 */
function streakFallback(streak) {
  return {
    title: `Deine Serie 🔥 ${streak}`,
    body: 'Heute noch nicht gespielt. Ein Wort genügt, damit die Serie weiterläuft.',
    url: '/',
  }
}

// „Heute“ und der Wochentag zählen nach Berliner Zeit (wie todayBerlin() im Kontingent). Mit toISOString()
// und getDay() (UTC bzw. Zeitzone des Servers) zeigten Vorschau und manueller Versand zwischen 0 und 1/2 Uhr
// noch die Wörter von gestern. Der 8-Uhr-Versand ist davon nicht betroffen.
const ZEITZONE = process.env.TIMEZONE || 'Europe/Berlin'
const DATUM_BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const WOCHENTAG_BERLIN = new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, weekday: 'long' })

/** Gibt den deutschen Wochentagsnamen (Berliner Zeit) zurück. */
function getWochentag(date) {
  return WOCHENTAG_BERLIN.format(date)
}

/** Formatiert ein Date-Objekt als YYYY-MM-DD (Berliner Kalendertag). */
export function formatDatum(date) {
  return DATUM_BERLIN.format(date)
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

// Tages-Broadcast (08:00) zieht NUR aus 'daily'-Templates; Streak-Templates
// sind dem Abend-Job vorbehalten (Kategorie-Trennung).
const listEnabledTemplatesStmt = db.prepare(`
  SELECT id, title, body FROM push_templates WHERE enabled = 1 AND category = 'daily'
`)

// Abend-Job (Streak-Saver) zieht NUR aus 'streak'-Templates.
const listStreakTemplatesStmt = db.prepare(`
  SELECT id, title, body FROM push_templates WHERE enabled = 1 AND category = 'streak'
`)

const getTemplateStmt = db.prepare(`
  SELECT id, title, body, category FROM push_templates WHERE id = ?
`)

const listAllTemplatesStmt = db.prepare(`
  SELECT id, title, body, enabled, category FROM push_templates ORDER BY id
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
 *
 * `extra` überschreibt/ergänzt einzelne Platzhalter (z. B. {streak} aus dem
 * Streak-Saver oder ein Beispielwert für die Admin-Vorschau). Der tägliche
 * Broadcast ruft buildContext OHNE extra → {streak} bleibt unbefüllbar und
 * Streak-Templates wären dort ohnehin nicht eligible.
 */
export function buildContext(date, extra = {}) {
  const t = loadTagesdaten(formatDatum(date))
  return {
    lemma:       t.lemma || null,
    thema:       t.thema || null,
    wortA:       t.wortA || null,
    wortB:       t.wortB || null,
    lueckensatz: t.lueckensatz || null,
    wochentag:   getWochentag(date),
    lemmata:     t.lemmata.length > 0 ? t.lemmata.join(' · ') : null,
    streak:      null,
    ...extra,
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
export function missingPlaceholders(template, ctx) {
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
 * Erstellt das Streak-Saver-Payload für ein Datum und eine Serienlänge.
 * Wählt zufällig aus den aktiven 'streak'-Templates, deren Platzhalter an dem
 * Tag vollständig befüllbar sind ({streak} ist immer gesetzt, {lemma} nur an
 * Inhaltstagen). Gibt es keins, kommt ein streak-bewusster Fallback.
 *
 * @param {Date} date
 * @param {number} streak  aktuelle Serienlänge des Empfängers
 * @returns {{ title: string, body: string, url: string }}
 */
export function buildStreakPayload(date = new Date(), streak = 0) {
  const ctx = buildContext(date, { streak: String(streak) })
  try {
    const templates = listStreakTemplatesStmt.all()
    const eligible = templates.filter(t => missingPlaceholders(t, ctx).length === 0)

    if (eligible.length === 0) {
      logger.warn({ datum: formatDatum(date) }, 'Streak-Push: kein passendes Template – Fallback')
      return streakFallback(streak)
    }

    const chosen = eligible[Math.floor(Math.random() * eligible.length)]
    return {
      title: render(chosen.title, ctx),
      body:  render(chosen.body, ctx),
      url:   '/',
    }
  } catch (err) {
    logger.warn({ err }, 'Streak-Template-Rendering fehlgeschlagen, verwende Fallback')
    return streakFallback(streak)
  }
}

/**
 * Rendert ein einzelnes Template (per ID) mit den Tagesdaten eines Datums.
 * Für den Test an die eigenen Geräte und den manuellen Versand aus dem Admin-Panel.
 *
 * Streak-Templates ({streak}) werden mit einem Beispielwert gerendert, damit
 * der Admin-Test nicht leer läuft.
 *
 * `missing` nennt die Platzhalter, die an dem Tag nicht befüllbar sind – dieselbe
 * Prüfung wie beim täglichen Versand (missingPlaceholders). Wer die Vorlage
 * verschickt, muss sie bei `missing.length > 0` ablehnen; gerendert enthielte sie Lücken
 * („Heute: »«“).
 *
 * @returns {{ title: string, body: string, category: string, missing: string[] } | null}
 */
export function renderTemplateById(id, date = new Date()) {
  const t = getTemplateStmt.get(id)
  if (!t) return null
  const ctx = buildContext(date, t.category === 'streak' ? { streak: '5' } : {})
  return { title: render(t.title, ctx), body: render(t.body, ctx), category: t.category || 'daily', missing: missingPlaceholders(t, ctx) }
}

/**
 * Liefert alle Templates inkl. gerenderter Vorschau für ein Datum.
 * Für die Anzeige im Admin-Panel.
 */
export function listTemplatesWithPreview(date = new Date()) {
  const dailyCtx = buildContext(date)
  // Streak-Templates mit Beispielwert vorschauen (sonst wäre {streak} immer
  // "missing" und die Vorschau bliebe leer/„nicht versendbar“).
  const streakCtx = buildContext(date, { streak: '5' })
  return listAllTemplatesStmt.all().map(t => {
    const ctx = t.category === 'streak' ? streakCtx : dailyCtx
    const missing = missingPlaceholders(t, ctx)
    return {
      id:       t.id,
      title:    t.title,
      body:     t.body,
      enabled:  !!t.enabled,
      category: t.category || 'daily',
      preview: {
        title:    render(t.title, ctx),
        body:     render(t.body, ctx),
        eligible: missing.length === 0,
        missing,
      },
    }
  })
}
