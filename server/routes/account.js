import express from 'express'
import { requireAuthUser, optionalAuthUser, isPremiumRole } from '../middleware/userAuth.js'
import { authFeatureFlags } from '../auth/index.js'
import { IS_PROD, serverError } from '../middleware/auth.js'
import { deleteUserTx } from './admin-users-data.js'
import { getQuota } from '../customLemmaQuota.js'
import db from '../db.js'
import logger from '../logger.js'

const router = express.Router()

const ensureEntitlementStmt = db.prepare(`
  INSERT INTO user_entitlements (
    user_id,
    gesamtausgabe_unlocked,
    unlocked_at,
    source,
    created_at,
    updated_at
  )
  VALUES (?, 0, NULL, 'none', ?, ?)
  ON CONFLICT(user_id) DO NOTHING
`)

const getEntitlementStmt = db.prepare(`
  SELECT
    gesamtausgabe_unlocked,
    unlocked_at,
    source
  FROM user_entitlements
  WHERE user_id = ?
`)

const getUserCreatedAtStmt = db.prepare(`
  SELECT createdAt
  FROM user
  WHERE id = ?
`)

const getPlayedDatesStmt = db.prepare(`
  SELECT DISTINCT datum
  FROM stats
  WHERE user_id = ?
  ORDER BY datum
`)

const getStatsBySpielStmt = db.prepare(`
  SELECT datum, SUM(scoreSum) AS score, SUM(maxSum) AS max
  FROM stats
  WHERE user_id = ? AND spiel = ?
  GROUP BY datum
`)

const getPlaysBySpielStmt = db.prepare(`
  SELECT spiel, SUM(plays) AS plays
  FROM stats
  WHERE user_id = ?
  GROUP BY spiel
`)

const SPIELE = ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']

// ── Helper Functions ───────────────────────────────────────────

function readEntitlements(userId, userRole) {
  const now = Date.now()
  ensureEntitlementStmt.run(userId, now, now)
  const row = getEntitlementStmt.get(userId)
  const unlockedByPayment = !!row?.gesamtausgabe_unlocked
  const unlockedByRole = isPremiumRole(userRole)

  const quota = getQuota({ userId, role: userRole })
  const customLemma = quota.unlimited
    ? { unlimited: true }
    : { unlimited: false, allowance: quota.allowance, remaining: quota.remaining }

  return {
    // Login-Status: steuert clientseitig das freie Kurs-Üben (Login statt Premium).
    loggedIn: true,
    gesamtausgabe: {
      unlocked: unlockedByPayment || unlockedByRole,
      unlockedAt: row?.unlocked_at || null,
      source: unlockedByPayment ? (row?.source || 'none') : unlockedByRole ? 'admin-role' : 'none',
    },
    // Klassenraum (Lehrkraft-Bereich): nur fuer Premium-/Admin-Konten sichtbar.
    classroomTeacher: isPremiumRole(userRole),
    // Eigenes-Lemma-Tageskontingent (Phase 4). Premium = unbegrenzt.
    customLemma,
  }
}

router.get('/api/v1/account/me', requireAuthUser, (req, res) => {
  const userRow = getUserCreatedAtStmt.get(req.user.id)
  res.json({
    id: req.user.id,
    role: req.user.role,
    createdAt: userRow?.createdAt || null,
  })
})

router.get('/api/v1/account/auth-options', (_req, res) => {
  res.json(authFeatureFlags)
})

router.get('/api/v1/account/entitlements', optionalAuthUser, (req, res) => {
  try {
    if (!req.user) {
      return res.json({
        loggedIn: false,
        gesamtausgabe: { unlocked: false, unlockedAt: null, source: 'none' },
        // Anonym: Eigenes Lemma erfordert Login (Verbrauch wird pro Account gezählt).
        customLemma: { unlimited: false, allowance: 0, remaining: 0, requiresLogin: true },
      })
    }

    res.json(readEntitlements(req.user.id, req.user.role))
  } catch (err) {
    logger.error({ err }, 'Entitlements-Abruf fehlgeschlagen')
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

// Serverseitige Spielstatistik des eingeloggten Nutzers – Basis für den
// Konto-Statistik-Block, der die Daten mit dem lokalen Verlauf zusammenführt.
router.get('/api/v1/account/stats', requireAuthUser, (req, res) => {
  try {
    const userId = req.user.id
    const playedDates = getPlayedDatesStmt.all(userId).map((row) => row.datum)

    const payload = { playedDates, plays: {} }
    for (const spiel of SPIELE) {
      const map = {}
      for (const row of getStatsBySpielStmt.all(userId, spiel)) {
        map[row.datum] = { score: row.score, max: row.max }
      }
      payload[spiel] = map
    }
    for (const row of getPlaysBySpielStmt.all(userId)) {
      payload.plays[row.spiel] = row.plays
    }
    res.json(payload)
  } catch (err) {
    logger.error({ err }, 'Konto-Statistik-Abruf fehlgeschlagen')
    serverError(res, err)
  }
})

// Hier lagen bis 2026-08-10 GET/DELETE /api/v1/account/sessions fuer eine
// Geraeteverwaltung ("Angemeldete Geraete"). Das Feature wurde nie gebaut —
// es gab keinen einzigen Aufrufer, nur die Routen und das passende CSS
// (.konto-device*, ebenfalls entfernt). Entscheidung 2026-08-10: wird auch
// nicht mehr gebaut. Sessions laufen ueber die Ablaufzeit aus, und
// invalidate-all-sessions.js bleibt als Notfallwerkzeug.

router.delete('/api/v1/account/me', requireAuthUser, (req, res) => {
  try {
    const userId = req.user.id
    // Alle User-Daten löschen (Profile, Entitlements, Stats, Classroom-Sessions, User-Row).
    // session/account räumt SQLite selbst auf: beide Tabellen haben
    // FOREIGN KEY ... ON DELETE CASCADE auf user(id) und db.js setzt
    // PRAGMA foreign_keys = ON — manuelle Deletes sind nicht nötig.
    deleteUserTx(userId)
    // Session-Cookie löschen
    res.clearCookie('better-auth.session_token', { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' })
    logger.info({ userId }, 'Account gelöscht')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Account-Löschung fehlgeschlagen')
    serverError(res, err)
  }
})

export default router
