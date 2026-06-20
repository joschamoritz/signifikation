/**
 * admin-push.js – Admin-Endpunkte für Push-Benachrichtigungen
 *
 * GET    /admin/push/templates        – alle Templates inkl. Vorschau + Abonnentenzahl
 * POST   /admin/push/templates        – neues Template anlegen
 * PUT    /admin/push/templates/:id    – Template bearbeiten
 * DELETE /admin/push/templates/:id    – Template löschen
 * POST   /admin/push/send             – Nachricht sofort an alle Abonnenten senden
 */
import express from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimiter.js'
import logger from '../logger.js'
import { PLACEHOLDERS, listTemplatesWithPreview, renderTemplateById } from '../notifications/templates.js'
import { sendPushToAll, sendPushToUser, getSubscriberCount } from '../notifications/sender.js'
import { auditCreate } from '../audit.js'

const router = express.Router()

const TITLE_MAX = 120
const BODY_MAX = 300

const getTemplateStmt = db.prepare(`SELECT id, category FROM push_templates WHERE id = ?`)
const insertTemplateStmt = db.prepare(`
  INSERT INTO push_templates (title, body, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`)
const updateTemplateStmt = db.prepare(`
  UPDATE push_templates SET title = ?, body = ?, enabled = ?, updated_at = ? WHERE id = ?
`)
const deleteTemplateStmt = db.prepare(`DELETE FROM push_templates WHERE id = ?`)

/**
 * Validiert title/body/enabled aus dem Request-Body.
 * @returns {{ ok: true, title, body, enabled } | { ok: false, error }}
 */
function validateTemplateInput(body) {
  const title = String(body?.title ?? '').trim()
  const text = String(body?.body ?? '').trim()

  if (!title) return { ok: false, error: 'Titel erforderlich' }
  if (title.length > TITLE_MAX) return { ok: false, error: `Titel max. ${TITLE_MAX} Zeichen` }
  if (!text) return { ok: false, error: 'Text erforderlich' }
  if (text.length > BODY_MAX) return { ok: false, error: `Text max. ${BODY_MAX} Zeichen` }

  const enabled = body?.enabled === false || body?.enabled === 0 ? 0 : 1
  return { ok: true, title, body: text, enabled }
}

// ── Templates ─────────────────────────────────────────────────────

router.get('/admin/push/templates', adminLimiter, requireAuth, (_req, res) => {
  try {
    res.json({
      templates: listTemplatesWithPreview(new Date()),
      subscriberCount: getSubscriberCount(),
      placeholders: PLACEHOLDERS,
    })
  } catch (err) {
    logger.error({ err }, 'push/templates GET fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

router.post('/admin/push/templates', adminLimiter, requireAuth, (req, res) => {
  const input = validateTemplateInput(req.body)
  if (!input.ok) return res.status(400).json({ error: input.error })

  try {
    const now = Date.now()
    const result = insertTemplateStmt.run(input.title, input.body, input.enabled, now, now)
    logger.info({ id: result.lastInsertRowid }, 'Push-Template angelegt')
    res.status(201).json({ ok: true, id: result.lastInsertRowid })
  } catch (err) {
    logger.error({ err }, 'push/templates POST fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

router.put('/admin/push/templates/:id', adminLimiter, requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Ungültige ID' })
  }

  const input = validateTemplateInput(req.body)
  if (!input.ok) return res.status(400).json({ error: input.error })

  try {
    if (!getTemplateStmt.get(id)) {
      return res.status(404).json({ error: 'Template nicht gefunden' })
    }
    updateTemplateStmt.run(input.title, input.body, input.enabled, Date.now(), id)
    logger.info({ id }, 'Push-Template aktualisiert')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, id }, 'push/templates PUT fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

router.delete('/admin/push/templates/:id', adminLimiter, requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Ungültige ID' })
  }

  try {
    const result = deleteTemplateStmt.run(id)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Template nicht gefunden' })
    }
    logger.info({ id }, 'Push-Template gelöscht')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, id }, 'push/templates DELETE fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

// ── Manueller Versand ─────────────────────────────────────────────

/**
 * POST /admin/push/send
 * mode 'free'     – Freitext sofort an alle Geräte
 * mode 'template' – gerendertes Template sofort an alle Geräte
 * mode 'self'     – Freitext-Test nur an die Geräte des eingeloggten Admins
 */
router.post('/admin/push/send', adminLimiter, requireAuth, async (req, res) => {
  const mode = req.body?.mode

  let payload
  if (mode === 'template') {
    const id = Number(req.body?.templateId)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Ungültige Template-ID' })
    }
    // Guardrail: Streak-Templates sind an einzelne gefährdete Nutzer adressiert
    // und werden ausschließlich vom abendlichen Streak-Saver-Job (19:00) an die
    // jeweilige Zielgruppe versandt – niemals als Broadcast an alle Geräte.
    const tplRow = getTemplateStmt.get(id)
    if (tplRow?.category === 'streak') {
      return res.status(400).json({ error: 'Streak-Templates werden automatisch um 19:00 an gefährdete Serien versendet – kein Broadcast möglich.' })
    }
    const rendered = renderTemplateById(id, new Date())
    if (!rendered) {
      return res.status(404).json({ error: 'Template nicht gefunden' })
    }
    if (!rendered.title.trim() || !rendered.body.trim()) {
      return res.status(400).json({ error: 'Template enthält heute leere Platzhalter – nicht versendbar' })
    }
    payload = rendered
  } else if (mode === 'free' || mode === 'self') {
    const title = String(req.body?.title ?? '').trim()
    const body = String(req.body?.body ?? '').trim()
    if (!title) return res.status(400).json({ error: 'Titel erforderlich' })
    if (title.length > TITLE_MAX) return res.status(400).json({ error: `Titel max. ${TITLE_MAX} Zeichen` })
    if (!body) return res.status(400).json({ error: 'Text erforderlich' })
    if (body.length > BODY_MAX) return res.status(400).json({ error: `Text max. ${BODY_MAX} Zeichen` })
    payload = { title, body }
  } else {
    return res.status(400).json({ error: 'mode muss "free", "template" oder "self" sein' })
  }

  try {
    // Test-Versand: nur an die eigenen Geräte des Admins – kein Broadcast, kein Audit.
    if (mode === 'self') {
      const result = await sendPushToUser(req.session.userId, payload)
      const total = result.sent + result.failed
      if (total === 0) {
        return res.status(400).json({ error: 'Auf diesem Konto sind keine Push-Geräte registriert.' })
      }
      logger.info({ adminId: req.session.userId, ...result }, 'Push-Test an eigene Geräte')
      return res.json({ ok: true, ...result, total })
    }

    logger.info({ mode, title: payload.title }, 'Manueller Push-Broadcast gestartet')
    const result = await sendPushToAll(payload)

    auditCreate('push', payload.title.slice(0, 80), {
      mode,
      title: payload.title,
      body: payload.body,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
    }, { adminKey: req.adminSessionId || 'unknown', ip: req.ip })

    res.json({ ok: true, ...result })
  } catch (err) {
    logger.error({ err }, 'push/send fehlgeschlagen')
    res.status(500).json({ error: 'Versand fehlgeschlagen' })
  }
})

export default router
