import express from 'express'
import { requireAuthUser, optionalAuthUser } from '../middleware/userAuth.js'
import { authFeatureFlags } from '../auth/index.js'
import { IS_PROD } from '../middleware/auth.js'
import { deleteUserTx } from './admin-users-data.js'
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

const unlockEntitlementStmt = db.prepare(`
  UPDATE user_entitlements
  SET
    gesamtausgabe_unlocked = 1,
    unlocked_at = CASE
      WHEN unlocked_at IS NULL THEN @now
      ELSE unlocked_at
    END,
    source = CASE
      WHEN gesamtausgabe_unlocked = 1 THEN source
      ELSE @source
    END,
    updated_at = @now
  WHERE user_id = @userId
`)

const getUserCreatedAtStmt = db.prepare(`
  SELECT createdAt
  FROM user
  WHERE id = ?
`)

const getFreeDayStmt = db.prepare(`SELECT label FROM free_days WHERE date = ?`)

function getTodayBerlin() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }) // YYYY-MM-DD
}

function checkFreeAccess() {
  const day = new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' })
  if (day === 'Sun') return { active: true, reason: 'sunday', label: 'Sonntag' }
  const today = getTodayBerlin()
  const row = getFreeDayStmt.get(today)
  if (row) return { active: true, reason: 'free_day', label: row.label || 'Freier Tag' }
  return { active: false, reason: null, label: null }
}

function readEntitlements(userId) {
  const now = Date.now()
  ensureEntitlementStmt.run(userId, now, now)
  const row = getEntitlementStmt.get(userId)
  return {
    gesamtausgabe: {
      unlocked: !!row?.gesamtausgabe_unlocked,
      unlockedAt: row?.unlocked_at || null,
      source: row?.source || 'none',
    },
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
    const freeAccess = checkFreeAccess()
    if (!req.user) {
      return res.json({
        gesamtausgabe: { unlocked: false, unlockedAt: null, source: 'none' },
        freeAccessToday: freeAccess.active,
        freeAccessReason: freeAccess.reason,
        freeAccessLabel: freeAccess.label,
      })
    }
    res.json({
      ...readEntitlements(req.user.id),
      freeAccessToday: freeAccess.active,
      freeAccessReason: freeAccess.reason,
      freeAccessLabel: freeAccess.label,
    })
  } catch {
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.post('/api/v1/account/entitlements/gesamtausgabe/unlock', requireAuthUser, (req, res) => {
  try {
    const now = Date.now()
    ensureEntitlementStmt.run(req.user.id, now, now)
    unlockEntitlementStmt.run({
      userId: req.user.id,
      now,
      source: 'instant-unlock',
    })
    res.json({ ok: true, ...readEntitlements(req.user.id) })
  } catch {
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.get('/api/v1/account/sessions', requireAuthUser, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, createdAt, ipAddress, userAgent, expiresAt
      FROM session
      WHERE userId = ? AND expiresAt > ?
      ORDER BY createdAt DESC
    `).all(req.user.id, new Date().toISOString())
    res.json({ sessions: rows })
  } catch {
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.delete('/api/v1/account/sessions/:id', requireAuthUser, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM session WHERE id = ? AND userId = ?'
    ).run(req.params.id, req.user.id)
    if (result.changes === 0) return res.status(404).json({ error: 'Session nicht gefunden' })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.delete('/api/v1/account/me', requireAuthUser, (req, res) => {
  try {
    const userId = req.user.id
    // Alle User-Daten löschen (Profile, Entitlements, Stats, Classroom-Sessions, User-Row)
    deleteUserTx(userId)
    // betterAuth-Tabellen manuell bereinigen (kein Cascade in SQLite ohne PRAGMA)
    db.prepare('DELETE FROM session WHERE userId = ?').run(userId)
    db.prepare('DELETE FROM account WHERE userId = ?').run(userId)
    // Session-Cookie löschen
    res.clearCookie('better-auth.session_token', { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' })
    logger.info({ userId }, 'Account gelöscht')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Account-Löschung fehlgeschlagen')
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

export default router
