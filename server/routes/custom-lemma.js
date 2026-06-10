/**
 * routes/custom-lemma.js – Routen für das „Eigenes Lemma"-Feature.
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
import { getQuota, incrementUsage, todayBerlin } from '../customLemmaQuota.js'
import { serverError } from '../middleware/auth.js'
import logger from '../logger.js'

const router = express.Router()

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
 *   403 { error, quota }                          – Tageskontingent aufgebraucht
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
        return res.status(403).json({
          error: 'Dein Eigenes-Lemma-Kontingent für heute ist aufgebraucht.',
          quota: { unlimited: false, allowance: quota.allowance, remaining: 0 },
        })
      }

      const result = await buildCustomPlay(req.query)
      if (result.notImplemented) return res.status(501).json({ error: result.reason })
      if (!result.usable) return res.status(422).json({ error: result.reason, usable: false })

      // Erst bei spielbarem Ergebnis verbrauchen.
      let remaining = Infinity
      if (!quota.unlimited) {
        incrementUsage(req.user.id, date)
        remaining = Math.max(0, quota.remaining - 1)
      }

      res.json({
        ...result,
        quota: quota.unlimited
          ? { unlimited: true }
          : { unlimited: false, allowance: quota.allowance, remaining },
      })
    } catch (err) {
      logger.error({ err, query: req.query }, 'Eigenes-Lemma-Spielaufbau fehlgeschlagen')
      serverError(res, err)
    }
  },
)

export default router
