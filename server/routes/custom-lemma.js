/**
 * routes/custom-lemma.js – Öffentliche, premium-gegatete Routen für das
 * „Eigenes Lemma"-Feature. Phase 2a: Eignungsprüfung pro Modus.
 *
 * Gating: requirePremium (Rolle premium/admin – wird bei jedem Kauf gesetzt,
 * siehe payments.js / iap.js). Das Basic-Tageskontingent (1/Tag + Admin-Bonus)
 * folgt in Phase 4.
 */

import express from 'express'
import { requirePremium } from '../middleware/userAuth.js'
import { validate, customLemmaValidateSchema } from '../middleware/validate.js'
import { validateCustomLemma } from '../customLemma.js'
import { serverError } from '../middleware/auth.js'
import logger from '../logger.js'

const router = express.Router()

/**
 * GET /api/v1/custom-lemma/validate?mode=…&q=… (bzw. a=&b= bei Wort-Zwilling)
 * → { mode, usable, reason, … }
 */
router.get(
  '/api/v1/custom-lemma/validate',
  requirePremium,
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

export default router
