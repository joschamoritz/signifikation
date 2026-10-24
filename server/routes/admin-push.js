/**
 * admin-push.js – Admin-Endpunkte für Push-Benachrichtigungen
 *
 * GET    /admin/push/templates        – alle Templates inkl. Vorschau, Gerätezahlen, Tageskontext, letzter Versand
 * POST   /admin/push/templates        – neues Template anlegen (category: daily | streak)
 * PUT    /admin/push/templates/:id    – Template bearbeiten
 * DELETE /admin/push/templates/:id    – Template löschen
 * POST   /admin/push/send             – Nachricht senden (an alle oder als Test an die eigenen Geräte)
 *
 * Vorlagen anlegen/ändern/löschen und jeder Versand an alle stehen im Änderungsprotokoll.
 */
import express from 'express'
import db from '../db.js'
import { requireAuth, serverError } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimiter.js'
import {
  validate,
  adminPushTemplateBodySchema,
  adminPushTemplateIdParamsSchema,
  adminPushSendSchema,
} from '../middleware/validate.js'
import logger from '../logger.js'
import { PLACEHOLDERS, listTemplatesWithPreview, renderTemplateById, buildContext, formatDatum } from '../notifications/templates.js'
import { sendPushToAll, sendPushToUser, getSubscriberCount, pushStatus } from '../notifications/sender.js'
import { auditCreate, auditUpdate, auditDelete } from '../audit.js'

const router = express.Router()

const getTemplateStmt = db.prepare(`SELECT id, category FROM push_templates WHERE id = ?`)
const getTemplateFullStmt = db.prepare(`SELECT id, title, body, enabled, category FROM push_templates WHERE id = ?`)
const insertTemplateStmt = db.prepare(`
  INSERT INTO push_templates (title, body, enabled, category, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const updateTemplateStmt = db.prepare(`
  UPDATE push_templates SET title = ?, body = ?, enabled = ?, updated_at = ? WHERE id = ?
`)
const deleteTemplateStmt = db.prepare(`DELETE FROM push_templates WHERE id = ?`)
const countOwnDevicesStmt = db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?`)
const lastBroadcastStmt = db.prepare(`
  SELECT timestamp, changes_json FROM audit_log
  WHERE resource = 'push' AND action = 'CREATE'
  ORDER BY timestamp DESC, id DESC LIMIT 1
`)

/** Texte in Vorlagen und freien Nachrichten: {name} = Platzhalter */
const platzhalterIn = (...texte) => [...new Set(texte.flatMap((t) => [...String(t ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1])))]
const klammern = (namen) => namen.map((k) => `{${k}}`).join(', ')

// Ein Versand an alle läuft synchron in der Anfrage (Blöcke à 10 Geräte). Ein zweiter Versand würde
// alle Geräte doppelt erreichen. Genau ein Node-Prozess → eine Variable genügt (Deployment: 1 PM2-Instanz).
let versandAnAlleLaeuft = false

// enabled kommt als boolean ODER 0/1 rein (Legacy-Aufrufer) - fuer die DB
// (INTEGER-Spalte) immer auf 0/1 normalisieren.
function enabledToDb(enabled) {
  return enabled === false || enabled === 0 ? 0 : 1
}

const auditOptionen = (req) => ({ adminKey: req.adminSessionId || 'unknown', ip: req.ip })

// ── Templates ─────────────────────────────────────────────────────

function letzterVersand() {
  try {
    const row = lastBroadcastStmt.get()
    if (!row) return null
    const a = JSON.parse(row.changes_json || '{}').after || {}
    return { zeit: row.timestamp, titel: a.title ?? '', sent: a.sent ?? null, total: a.total ?? null }
  } catch {
    return null
  }
}

router.get('/admin/push/templates', adminLimiter, requireAuth, (req, res) => {
  try {
    const jetzt = new Date()
    res.json({
      templates: listTemplatesWithPreview(jetzt),
      subscriberCount: getSubscriberCount(),
      push: pushStatus(),
      placeholders: PLACEHOLDERS,
      // Für die Seite: Test-Knopf mit Zahl, Dialog-Fakten, Vorschau ungespeicherter Entwürfe, „heute“ nach Berliner Zeit
      eigeneGeraete: countOwnDevicesStmt.get(req.session?.userId ?? '')?.n ?? 0,
      letzterVersand: letzterVersand(),
      kontext: buildContext(jetzt),
      heute: formatDatum(jetzt),
    })
  } catch (err) {
    logger.error({ err }, 'push/templates GET fehlgeschlagen')
    serverError(res, err)
  }
})

/** Platzhalter, die es nicht gibt, würden die Vorlage jeden Tag überspringen lassen. */
function unbekannteIn(title, body) {
  return platzhalterIn(title, body).filter((k) => !PLACEHOLDERS.includes(k))
}

const unbekannterPlatzhalterFehler = (namen) =>
  `Unbekannter Platzhalter: ${klammern(namen)}. Die Vorlage würde jeden Tag übersprungen.`

router.post('/admin/push/templates', adminLimiter, requireAuth, validate(adminPushTemplateBodySchema), (req, res) => {
  const { title, body, enabled, category = 'daily' } = req.body
  const unbekannt = unbekannteIn(title, body)
  if (unbekannt.length) return res.status(400).json({ error: unbekannterPlatzhalterFehler(unbekannt) })
  try {
    const now = Date.now()
    const result = insertTemplateStmt.run(title, body, enabledToDb(enabled), category, now, now)
    logger.info({ id: result.lastInsertRowid }, 'Push-Template angelegt')
    auditCreate('push_vorlage', String(result.lastInsertRowid), { title, body, enabled: !!enabledToDb(enabled), category }, auditOptionen(req))
    res.status(201).json({ ok: true, id: result.lastInsertRowid })
  } catch (err) {
    logger.error({ err }, 'push/templates POST fehlgeschlagen')
    serverError(res, err)
  }
})

router.put(
  '/admin/push/templates/:id',
  adminLimiter,
  requireAuth,
  validate(adminPushTemplateIdParamsSchema, 'params'),
  validate(adminPushTemplateBodySchema),
  (req, res) => {
    const id = req.params.id
    const { title, body, enabled } = req.body
    const unbekannt = unbekannteIn(title, body)
    if (unbekannt.length) return res.status(400).json({ error: unbekannterPlatzhalterFehler(unbekannt) })
    try {
      const vorher = getTemplateFullStmt.get(id)
      if (!vorher) {
        return res.status(404).json({ error: 'Template nicht gefunden' })
      }
      updateTemplateStmt.run(title, body, enabledToDb(enabled), Date.now(), id)
      logger.info({ id }, 'Push-Template aktualisiert')
      auditUpdate('push_vorlage', String(id),
        { title: vorher.title, body: vorher.body, enabled: !!vorher.enabled, category: vorher.category },
        { title, body, enabled: !!enabledToDb(enabled), category: vorher.category }, auditOptionen(req))
      res.json({ ok: true })
    } catch (err) {
      logger.error({ err, id }, 'push/templates PUT fehlgeschlagen')
      serverError(res, err)
    }
  },
)

router.delete(
  '/admin/push/templates/:id',
  adminLimiter,
  requireAuth,
  validate(adminPushTemplateIdParamsSchema, 'params'),
  (req, res) => {
    const id = req.params.id
    try {
      const vorher = getTemplateFullStmt.get(id)
      const result = deleteTemplateStmt.run(id)
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Template nicht gefunden' })
      }
      logger.info({ id }, 'Push-Template gelöscht')
      auditDelete('push_vorlage', String(id),
        { title: vorher?.title, body: vorher?.body, enabled: !!vorher?.enabled, category: vorher?.category }, auditOptionen(req))
      res.json({ ok: true })
    } catch (err) {
      logger.error({ err, id }, 'push/templates DELETE fehlgeschlagen')
      serverError(res, err)
    }
  },
)

// ── Versand ───────────────────────────────────────────────────────

/**
 * POST /admin/push/send
 * mode 'free'     – Freitext sofort an alle Geräte (Platzhalter werden hier nicht ersetzt → abgelehnt)
 * mode 'template' – gerendertes Template sofort an alle Geräte (Weg für die Kommandozeile; die Oberfläche
 *                   übernimmt Vorlagen in „Nachricht senden“ und schickt dann Freitext)
 * mode 'self'     – Test nur an die Geräte des eingeloggten Admins, mit Freitext ODER templateId
 *                   (Streak-Vorlagen mit Beispiel-Serie 5)
 */
router.post('/admin/push/send', adminLimiter, requireAuth, validate(adminPushSendSchema), async (req, res) => {
  const { mode } = req.body

  let payload
  if (mode === 'template' || (mode === 'self' && req.body.templateId)) {
    const id = req.body.templateId
    // Guardrail: Streak-Templates sind an einzelne gefährdete Nutzer adressiert
    // und werden ausschließlich vom abendlichen Streak-Saver-Job (19:00) an die
    // jeweilige Zielgruppe versandt – niemals als Broadcast an alle Geräte.
    const tplRow = getTemplateStmt.get(id)
    if (mode === 'template' && tplRow?.category === 'streak') {
      return res.status(400).json({ error: 'Streak-Templates werden automatisch um 19:00 an gefährdete Serien versendet – kein Broadcast möglich.' })
    }
    const rendered = renderTemplateById(id, new Date())
    if (!rendered) {
      return res.status(404).json({ error: 'Template nicht gefunden' })
    }
    // Dieselbe Prüfung wie beim täglichen Versand: Eine Vorlage mit heute nicht befüllbarem Platzhalter
    // ginge sonst mit Lücken hinaus („Heute: »«“).
    if (rendered.missing.length) {
      const n = rendered.missing.length
      return res.status(400).json({ error: `Heute nicht versendbar: ${klammern(rendered.missing)} ${n === 1 ? 'ist' : 'sind'} heute nicht befüllt.` })
    }
    if (!rendered.title.trim() || !rendered.body.trim()) {
      return res.status(400).json({ error: 'Template enthält heute leere Platzhalter – nicht versendbar' })
    }
    payload = { title: rendered.title, body: rendered.body }
  } else {
    // Freitext: {lemma} & Co. würden wörtlich hinausgehen
    const ph = platzhalterIn(req.body.title, req.body.body)
    if (ph.length) {
      return res.status(400).json({ error: `In einer freien Nachricht werden Platzhalter nicht ersetzt: ${klammern(ph)} ginge wörtlich hinaus. Bitte ausschreiben.` })
    }
    payload = { title: req.body.title, body: req.body.body }
  }

  // Test-Versand: nur an die eigenen Geräte des Admins – kein Broadcast, kein Audit, keine Sperre.
  if (mode === 'self') {
    try {
      const result = await sendPushToUser(req.session.userId, payload)
      const total = result.sent + result.failed
      if (total === 0) {
        return res.status(400).json({ error: 'Auf deinem Konto ist kein Gerät angemeldet. Melde dich in der App mit diesem Konto an und erlaube Benachrichtigungen.' })
      }
      logger.info({ adminId: req.session.userId, ...result }, 'Push-Test an eigene Geräte')
      return res.json({ ok: true, ...result, total })
    } catch (err) {
      logger.error({ err }, 'push/send (self) fehlgeschlagen')
      return serverError(res, err)
    }
  }

  // Versand an alle: höchstens einer gleichzeitig (Doppelklick, zweiter Tab). Die Sperre wird gesetzt, bevor
  // irgendetwas wartet, und im finally freigegeben.
  if (versandAnAlleLaeuft) {
    return res.status(409).json({ error: 'Es läuft schon ein Versand an alle. Es wurde nichts zusätzlich gesendet; bitte warten, bis er fertig ist (Änderungsprotokoll).' })
  }
  versandAnAlleLaeuft = true
  try {
    logger.info({ mode, title: payload.title }, 'Manueller Push-Broadcast gestartet')
    const result = await sendPushToAll(payload)

    auditCreate('push', payload.title.slice(0, 80), {
      mode,
      title: payload.title,
      body: payload.body,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
    }, auditOptionen(req))

    res.json({ ok: true, ...result })
  } catch (err) {
    logger.error({ err }, 'push/send fehlgeschlagen')
    serverError(res, err)
  } finally {
    versandAnAlleLaeuft = false
  }
})

export default router
