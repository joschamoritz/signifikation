import { createHmac, timingSafeEqual } from 'crypto'
import logger from '../logger.js'

const TEACHER_SOCKET_TOKEN_TTL_MS = 60 * 1000
const IS_PROD = process.env.NODE_ENV === 'production'

const configuredSecret = (
  process.env.CLASSROOM_SOCKET_SECRET
  || process.env.CLASSROOM_JOIN_SECRET
  || process.env.BETTER_AUTH_SECRET
  || process.env.AUTH_SECRET
  || ''
).trim()

if (IS_PROD && !configuredSecret) {
  throw new Error('Teacher-Socket-Secret ist nicht gesetzt (CLASSROOM_SOCKET_SECRET/CLASSROOM_JOIN_SECRET/BETTER_AUTH_SECRET/AUTH_SECRET)')
}

if (!IS_PROD && !configuredSecret) {
  logger.warn('Teacher-Socket-Secret nicht gesetzt – Dev-Fallback aktiv (nur lokal!)')
}

const TEACHER_SOCKET_SECRET = configuredSecret || 'dev-classroom-socket-secret'

function sign(payload) {
  return createHmac('sha256', TEACHER_SOCKET_SECRET).update(payload).digest('hex')
}

function encodePayload(data) {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
}

function decodePayload(payload) {
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function createTeacherSocketToken({ sessionId, teacherUserId, now = Date.now() }) {
  const payload = encodePayload({
    sessionId,
    teacherUserId,
    iat: now,
    exp: now + TEACHER_SOCKET_TOKEN_TTL_MS,
  })
  return `${payload}.${sign(payload)}`
}

export function verifyTeacherSocketToken(token, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !token.trim()) {
    return { error: 'INVALID_TOKEN' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { error: 'INVALID_TOKEN' }
  }

  const [payload, signature] = parts
  if (!payload || !signature) {
    return { error: 'INVALID_TOKEN' }
  }

  const expectedSignature = sign(payload)
  if (signature.length !== expectedSignature.length) {
    return { error: 'INVALID_TOKEN' }
  }

  try {
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return { error: 'INVALID_TOKEN' }
    }
  } catch {
    return { error: 'INVALID_TOKEN' }
  }

  const data = decodePayload(payload)
  if (!data || typeof data !== 'object') {
    return { error: 'INVALID_TOKEN' }
  }

  const sessionId = String(data.sessionId || '').trim()
  const teacherUserId = String(data.teacherUserId || '').trim()
  const exp = Number(data.exp)

  if (!sessionId || !teacherUserId || !Number.isFinite(exp)) {
    return { error: 'INVALID_TOKEN' }
  }

  if (exp < now) {
    return { error: 'TOKEN_EXPIRED' }
  }

  return { sessionId, teacherUserId }
}
