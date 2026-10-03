/**
 * unterricht.js – Abgaben aus statischen Unterrichts-Tools (public/unterricht/)
 *
 * POST   /api/v1/unterricht/abgabe          – Team schickt seinen Bericht (ohne Login)
 * GET    /admin/unterricht/abgaben           – Admin liest die Abgaben einer Aufgabe
 * DELETE /admin/unterricht/abgaben/:id       – Admin löscht eine Abgabe
 * DELETE /admin/unterricht/abgaben?aufgabe=… – Admin löscht alle Abgaben einer Aufgabe
 *
 * Gespeichert wird nur, was das Team eintippt (Teamname, Antworten) – keine IP,
 * kein Account. Die Tools liegen same-origin unter /unterricht/ und schicken den
 * CSRF-Header wie die App selbst.
 */
import express from 'express'
import { z } from 'zod/v3'
import db from '../db.js'
import logger from '../logger.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, serverError } from '../middleware/auth.js'
import { adminLimiter, unterrichtAbgabeLimiter } from '../middleware/rateLimiter.js'

const router = express.Router()

// Neue Tools hier eintragen – unbekannte Aufgaben werden abgewiesen.
export const AUFGABEN = ['fallakte-oetzi']

// ── Zod-Schemata ─────────────────────────────────────────────────────────────

const stempelSchema = z.enum(['belegt', 'vermutet', 'ungeklaert']).nullable()
const freitext = (max) => z.string().max(max, `Text zu lang (max. ${max} Zeichen)`)

const karteSchema = z.object({
  titel:   freitext(80),
  text:    freitext(500),
  stempel: stempelSchema,
  tipps:   z.number().int().min(0).max(5),
})

export const abgabeSchema = z.object({
  aufgabe: z.enum(AUFGABEN),
  team:    z.string().trim().min(1, 'Teamname fehlt').max(80, 'Teamname zu lang'),
  bericht1992: z.object({
    wer:      freitext(600),
    wie:      z.string().max(40).nullable(),
    wieWarum: freitext(600),
  }),
  abschluss: z.object({
    wer:    freitext(600), werS:   stempelSchema,
    wie:    freitext(600), wieS:   stempelSchema,
    warum:  freitext(600), warumS: stempelSchema,
    schild: freitext(600),
  }),
  karten: z.record(z.string().regex(/^[a-z][0-9]{1,2}$/), karteSchema)
    .refine((k) => Object.keys(k).length <= 20, 'Zu viele Beweisstücke'),
})

const aufgabeQuerySchema = z.object({
  aufgabe: z.enum(AUFGABEN).default('fallakte-oetzi'),
})

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ── Statements ───────────────────────────────────────────────────────────────
// Lazy vorbereitet: Die Tabelle entsteht erst in Migration 0021, und
// runMigrations() läuft in server/index.js NACH den Router-Imports. Ein
// db.prepare() auf Modulebene würde beim ersten Deploy mit „no such table"
// den Start abbrechen.
let stmtCache = null
function stmts() {
  if (!stmtCache) {
    stmtCache = {
      insert: db.prepare(`
        INSERT INTO unterricht_abgabe (aufgabe, team, payload, created_at)
        VALUES (?, ?, ?, ?)
      `),
      list: db.prepare(`
        SELECT id, team, payload, created_at FROM unterricht_abgabe
        WHERE aufgabe = ? ORDER BY created_at DESC
      `),
      deleteOne: db.prepare(`DELETE FROM unterricht_abgabe WHERE id = ?`),
      deleteAll: db.prepare(`DELETE FROM unterricht_abgabe WHERE aufgabe = ?`),
    }
  }
  return stmtCache
}

// ── Öffentlich: Abgabe ───────────────────────────────────────────────────────

router.post('/api/v1/unterricht/abgabe', unterrichtAbgabeLimiter, validate(abgabeSchema), (req, res) => {
  const { aufgabe, team, bericht1992, abschluss, karten } = req.body
  try {
    const info = stmts().insert.run(aufgabe, team, JSON.stringify({ bericht1992, abschluss, karten }), Date.now())
    logger.info({ aufgabe, id: info.lastInsertRowid }, 'Unterrichts-Abgabe gespeichert')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, aufgabe }, 'Unterrichts-Abgabe fehlgeschlagen')
    serverError(res, err)
  }
})

// ── Admin: lesen und löschen ─────────────────────────────────────────────────

router.get('/admin/unterricht/abgaben', adminLimiter, requireAuth, validate(aufgabeQuerySchema, 'query'), (req, res) => {
  try {
    const abgaben = stmts().list.all(req.query.aufgabe).map((row) => {
      let inhalt = {}
      try { inhalt = JSON.parse(row.payload) } catch { /* defekte Zeile: leer anzeigen */ }
      return { id: row.id, team: row.team, created_at: row.created_at, ...inhalt }
    })
    res.json({ aufgabe: req.query.aufgabe, abgaben })
  } catch (err) {
    logger.error({ err }, 'Unterrichts-Abgaben GET fehlgeschlagen')
    serverError(res, err)
  }
})

router.delete('/admin/unterricht/abgaben/:id', adminLimiter, requireAuth, validate(idParamsSchema, 'params'), (req, res) => {
  try {
    const info = stmts().deleteOne.run(req.params.id)
    logger.info({ id: req.params.id, geloescht: info.changes }, 'Unterrichts-Abgabe gelöscht')
    res.json({ ok: true, geloescht: info.changes })
  } catch (err) {
    logger.error({ err }, 'Unterrichts-Abgabe DELETE fehlgeschlagen')
    serverError(res, err)
  }
})

router.delete('/admin/unterricht/abgaben', adminLimiter, requireAuth, validate(aufgabeQuerySchema, 'query'), (req, res) => {
  try {
    const info = stmts().deleteAll.run(req.query.aufgabe)
    logger.info({ aufgabe: req.query.aufgabe, geloescht: info.changes }, 'Unterrichts-Abgaben gelöscht')
    res.json({ ok: true, geloescht: info.changes })
  } catch (err) {
    logger.error({ err }, 'Unterrichts-Abgaben DELETE fehlgeschlagen')
    serverError(res, err)
  }
})

export default router
