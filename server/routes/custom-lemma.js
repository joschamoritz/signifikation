/**
 * routes/custom-lemma.js – Routen für das „Eigenes Lemma“-Feature.
 *
 * Gating (Phase 4):
 *   - Jeder eingeloggte Nutzer darf validieren (Live-Vorabprüfung, kein Verbrauch).
 *   - Spielen (play) verbraucht: Premium unbegrenzt; Basic 1/Tag + Admin-Bonus
 *     (free_days.bonus_count). Anonym → 401 (Login nötig, weil pro Account gezählt).
 */

import express from 'express'
import { requireAuthUser } from '../middleware/userAuth.js'
import { customLemmaLimiter } from '../middleware/rateLimiter.js'
import { validate, customLemmaValidateSchema } from '../middleware/validate.js'
import { validateCustomLemma, buildCustomPlay } from '../customLemma.js'
import { getQuota, tryConsume, todayBerlin } from '../customLemmaQuota.js'
import { serverError } from '../middleware/auth.js'
import logger from '../logger.js'

const router = express.Router()

// Sekunden bis zum naechsten Berlin-Mitternacht (täglicher Kontingent-Reset) —
// als Retry-After-Hinweis fuer den 429. toLocaleString liefert die Berliner
// Wanduhrzeit; setHours(24,…) ist der naechste Tagesbeginn.
function secondsUntilBerlinReset(now = new Date()) {
  const berlin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const nextMidnight = new Date(berlin)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((nextMidnight - berlin) / 1000))
}

// Kontingent erschöpft: 429 (semantisch „jetzt nicht, morgen wieder“) + Retry-
// After, statt 403 (das hiesse „grundsätzlich verboten“). Der Client (EigenesLemma)
// verzweigt auf res.ok, nicht auf den Status → nicht-breaking für Web + iOS-Bundle.
function sendQuotaExhausted(res, allowance) {
  res.set('Retry-After', String(secondsUntilBerlinReset()))
  return res.status(429).json({
    error: 'Dein Eigenes-Lemma-Kontingent für heute ist aufgebraucht.',
    quota: { unlimited: false, allowance, remaining: 0 },
  })
}

/**
 * GET /api/v1/custom-lemma/validate?mode=…&q=… (bzw. a=&b= bei Wort-Zwilling)
 * → { mode, usable, reason, … } – verbraucht KEIN Kontingent.
 */
router.get(
  '/api/v1/custom-lemma/validate',
  customLemmaLimiter,
  requireAuthUser,
  validate(customLemmaValidateSchema, 'query'),
  async (req, res) => {
    try {
      const result = await validateCustomLemma(req.query)
      res.json(result)
    } catch (err) {
      logger.error({ err, query: req.query }, 'Eigenes-Lemma-Validierung fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/**
 * GET /api/v1/custom-lemma/play?mode=…&q=… → Spieldaten in Tageslemma-Form.
 * Verbraucht bei Erfolg 1 Eigenes-Lemma-Spiel (außer Premium).
 *   200 { usable:true, mode, lemma|data, quota }  – spielbar
 *   429 { error, quota } + Retry-After            – Tageskontingent aufgebraucht
 *   422 { usable:false, reason }                  – Wort nicht geeignet
 */
router.get(
  '/api/v1/custom-lemma/play',
  customLemmaLimiter,
  requireAuthUser,
  validate(customLemmaValidateSchema, 'query'),
  async (req, res) => {
    try {
      const date = todayBerlin()
      const quota = getQuota({ userId: req.user.id, role: req.user.role, date })
      if (!quota.unlimited && quota.remaining <= 0) {
        return sendQuotaExhausted(res, quota.allowance)
      }

      const result = await buildCustomPlay(req.query)
      if (result.notImplemented) return res.status(501).json({ error: result.reason })
      if (!result.usable) return res.status(422).json({ error: result.reason, usable: false })

      // Erst bei spielbarem Ergebnis verbrauchen — ATOMAR (zaehlen+pruefen in
      // einem Statement). Der getQuota-Pre-Check oben ist nur der schnelle
      // 403-Pfad; das Race zweier paralleler Requests bei remaining=1
      // entscheidet sich hier.
      const consume = tryConsume({ userId: req.user.id, role: req.user.role, date })
      if (!consume.consumed) {
        return sendQuotaExhausted(res, consume.allowance)
      }

      res.json({
        ...result,
        quota: consume.unlimited
          ? { unlimited: true }
          : { unlimited: false, allowance: consume.allowance, remaining: consume.remaining },
      })
    } catch (err) {
      logger.error({ err, query: req.query }, 'Eigenes-Lemma-Spielaufbau fehlgeschlagen')
      serverError(res, err)
    }
  },
)

export default router
