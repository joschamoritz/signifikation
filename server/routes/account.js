import express from 'express'
import crypto from 'crypto'
import { requireAuthUser, optionalAuthUser } from '../middleware/userAuth.js'
import { authFeatureFlags } from '../auth/index.js'
import { IS_PROD } from '../middleware/auth.js'
import { deleteUserTx } from './admin-users-data.js'
import db from '../db.js'
import logger from '../logger.js'

const router = express.Router()

const MAX_DEVICES = 3

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

const getFreeDayStmt = db.prepare(`SELECT label FROM free_days WHERE date = ?`)

// ── Device Registration Statements ────────────────────────────

const getDeviceByHashStmt = db.prepare(`
  SELECT id FROM device_registrations 
  WHERE user_id = ? AND device_hash = ?
`)

const updateDeviceLastSeenStmt = db.prepare(`
  UPDATE device_registrations 
  SET last_seen = ? 
  WHERE id = ?
`)

const countUserDevicesStmt = db.prepare(`
  SELECT COUNT(*) as cnt 
  FROM device_registrations 
  WHERE user_id = ?
`)

const insertDeviceStmt = db.prepare(`
  INSERT INTO device_registrations (id, user_id, device_hash, user_agent, last_seen, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const listUserDevicesStmt = db.prepare(`
  SELECT id, user_agent, last_seen, created_at 
  FROM device_registrations 
  WHERE user_id = ? 
  ORDER BY last_seen DESC
`)

const deleteDeviceStmt = db.prepare(`
  DELETE FROM device_registrations 
  WHERE id = ? AND user_id = ?
`)

// ── Helper Functions ───────────────────────────────────────────

function getDeviceFingerprint(req) {
  const ua = req.headers['user-agent'] || 'unknown'
  const acceptLang = req.headers['accept-language'] || ''
  const acceptEnc = req.headers['accept-encoding'] || ''
  return crypto.createHash('sha256')
    .update(`${ua}:${acceptLang}:${acceptEnc}`)
    .digest('hex')
}

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

function readEntitlements(userId, userRole) {
  const now = Date.now()
  ensureEntitlementStmt.run(userId, now, now)
  const row = getEntitlementStmt.get(userId)
  const unlockedByPayment = !!row?.gesamtausgabe_unlocked
  const unlockedByRole = userRole === 'premium'
  return {
    gesamtausgabe: {
      unlocked: unlockedByPayment || unlockedByRole,
      unlockedAt: row?.unlocked_at || null,
      source: unlockedByPayment ? (row?.source || 'none') : unlockedByRole ? 'admin-role' : 'none',
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

    const entitlements = readEntitlements(req.user.id, req.user.role)
    
    // ── Gerätelimit prüfen (nur bei bezahlten Accounts) ───────
    if (entitlements.gesamtausgabe.unlocked && entitlements.gesamtausgabe.source !== 'admin-role') {
      const deviceHash = getDeviceFingerprint(req)
      
      // Ist dieses Gerät bereits registriert?
      const knownDevice = getDeviceByHashStmt.get(req.user.id, deviceHash)
      
      if (knownDevice) {
        // Gerät bekannt → last_seen aktualisieren
        updateDeviceLastSeenStmt.run(Date.now(), knownDevice.id)
      } else {
        // Neues Gerät → Limit prüfen
        const deviceCount = countUserDevicesStmt.get(req.user.id)
        
        if (deviceCount.cnt >= MAX_DEVICES) {
          const devices = listUserDevicesStmt.all(req.user.id)
          return res.status(403).json({
            error: 'Gerätelimit erreicht',
            message: `Du kannst die Gesamtausgabe auf maximal ${MAX_DEVICES} Geräten nutzen. Entferne ein Gerät in den Einstellungen.`,
            devices,
          })
        }
        
        // Gerät registrieren
        const now = Date.now()
        insertDeviceStmt.run(
          crypto.randomUUID(),
          req.user.id,
          deviceHash,
          req.headers['user-agent'] || 'unknown',
          now,
          now
        )
        
        logger.info({ userId: req.user.id, deviceHash: deviceHash.slice(0, 8) }, 'Neues Gerät registriert')
      }
    }
    
    res.json({
      ...entitlements,
      freeAccessToday: freeAccess.active,
      freeAccessReason: freeAccess.reason,
      freeAccessLabel: freeAccess.label,
    })
  } catch (err) {
    logger.error({ err }, 'Entitlements-Abruf fehlgeschlagen')
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

// ── GET /api/v1/account/devices ───────────────────────────────
// Liste aller registrierten Geräte des Users

router.get('/api/v1/account/devices', requireAuthUser, (req, res) => {
  try {
    const devices = listUserDevicesStmt.all(req.user.id)
    res.json({ devices, maxDevices: MAX_DEVICES })
  } catch (err) {
    logger.error({ err }, 'Geräte-Abruf fehlgeschlagen')
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

// ── DELETE /api/v1/account/devices/:id ────────────────────────
// Gerät entfernen (z.B. altes Handy)

router.delete('/api/v1/account/devices/:id', requireAuthUser, (req, res) => {
  try {
    const result = deleteDeviceStmt.run(req.params.id, req.user.id)
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Gerät nicht gefunden' })
    }
    
    logger.info({ userId: req.user.id, deviceId: req.params.id }, 'Gerät entfernt')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Gerät-Entfernung fehlgeschlagen')
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
