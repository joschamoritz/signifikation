/**
 * server/middleware/requireCapability.js
 *
 * Capability-Middleware fuer Classroom v2 (D14).
 * Loest das aktive Subject auf zwei Wegen auf:
 *
 *   1. Teacher: bestehende better-auth-Session (cookie-basiert via
 *      requireAuthUser / req.user). Subject = { kind:'teacher', id:userId }
 *   2. Schueler: Authorization: Bearer <auth_token> →
 *      classroom_participant per HMAC-Hash. Subject = { kind:'participant', id:participantId }
 *
 * Anschliessend wird gegen classroom_capability_grant geprueft
 * (WHERE revoked_at IS NULL). Mismatch → 403 mit JSON-Fehler.
 *
 * Session-ID wird aus req.params.sessionId, req.body.sessionId oder
 * der Participant-Zuordnung gezogen – Reihenfolge ist Route-spezifisch.
 *
 * Logging via pino (kein console.log).
 */

import logger from '../logger.js'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth/index.js'
import {
  findParticipantByToken,
  hasCapability as storeHasCapability,
} from '../classroom/store.js'

// Dev-Auth-Guard (identisch zu middleware/userAuth.js — beide prufen dasselbe Flag)
const IS_PROD = process.env.NODE_ENV === 'production'
const DEV_AUTH_ENABLED = !IS_PROD && process.env.ALLOW_DEV_AUTH === '1'

function extractBearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization
  if (!header || typeof header !== 'string') return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

async function resolveTeacherSubject(req) {
  // 1. Bereits aufgeloest (z.B. durch requirePremium / requireAuthUser davor)
  if (req.user?.id) return { kind: 'teacher', id: String(req.user.id) }
  // 2. Dev-Header-Auth (nur wenn ALLOW_DEV_AUTH=1, nie in Produktion)
  if (DEV_AUTH_ENABLED) {
    const devId = req.headers['x-dev-user-id']
    if (devId && typeof devId === 'string' && devId.trim()) {
      return { kind: 'teacher', id: devId.trim() }
    }
  }
  // 3. Better-Auth-Session (Normal-/Produktiv-Pfad via Cookie)
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (session?.user?.id) return { kind: 'teacher', id: String(session.user.id) }
  } catch (err) {
    logger.debug({ err }, 'cr2 capability: getSession fehlgeschlagen')
  }
  return null
}

function resolveParticipantSubject(req) {
  const token = extractBearer(req)
  if (!token) return null
  const participant = findParticipantByToken(token)
  if (!participant) return null
  if (participant.leftAt) return null
  return {
    kind: 'participant',
    id: participant.id,
    sessionId: participant.sessionId,
    participant,
  }
}

function pickSessionId(req, fallback) {
  return req.params?.sessionId
    || req.params?.id
    || req.body?.sessionId
    || fallback
    || null
}

// Schueler-Capabilities: hier bevorzugen wir den Participant (Bearer-Token),
// auch wenn gleichzeitig ein Lehrer-Cookie anliegt. Sonst scheitert der Submit,
// wenn ein eingeloggter Lehrer im selben Browser als Schueler beitritt
// (Cookie + Bearer): der Teacher hat keine sessionId → „sessionId fehlt".
const PARTICIPANT_CAPABILITIES = new Set(['submission:write', 'view:student'])

/**
 * requireCapability(capability) – Express-Middleware.
 *
 * Beispiele:
 *   router.post('/sessions/:id/start',  requireCapability('session:manage'), handler)
 *   router.post('/me/submit',           requireCapability('submission:write'), handler)
 */
export function requireCapability(capability) {
  if (!capability) throw new Error('requireCapability: capability required')

  return async function requireCapabilityMiddleware(req, res, next) {
    try {
      // Beide Subjekte parallel probieren. Vorrang haengt von der Capability ab:
      // Schueler-Capabilities → Participant zuerst, sonst Teacher zuerst.
      const teacher = await resolveTeacherSubject(req)
      const participant = resolveParticipantSubject(req)
      const subject = PARTICIPANT_CAPABILITIES.has(capability)
        ? (participant || teacher)
        : (teacher || participant)
      if (!subject) {
        return res.status(401).json({ error: 'Nicht autorisiert' })
      }

      const sessionId = pickSessionId(req, subject.sessionId)
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId fehlt' })
      }

      const allowed = storeHasCapability({
        sessionId,
        subjectKind: subject.kind,
        subjectId: subject.id,
        capability,
      })
      if (!allowed) {
        logger.warn(
          { subjectKind: subject.kind, subjectId: subject.id, sessionId, capability },
          'cr2 capability denied',
        )
        return res.status(403).json({ error: 'Keine Berechtigung' })
      }

      req.cr2 = {
        subject,
        sessionId,
        capability,
        // Convenience-Alias fuer Participant-Routen (analog requireParticipantAuth)
        participant: subject.kind === 'participant' ? subject.participant : undefined,
      }
      return next()
    } catch (err) {
      logger.error({ err, capability }, 'cr2 capability middleware crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  }
}

export default requireCapability
