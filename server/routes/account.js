import express from 'express'
import { requireAuthUser } from '../middleware/userAuth.js'
import { authFeatureFlags } from '../auth/index.js'
import db from '../db.js'

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

router.get('/api/v1/account/entitlements', requireAuthUser, (req, res) => {
  try {
    res.json(readEntitlements(req.user.id))
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

export default router
