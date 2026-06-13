/**
 * server/realtime/classroomSocket.js
 *
 * Realtime-Layer fuer den Klassenraum (Phase 3).
 *
 * Architektur:
 *   - Socket.io-Namespace `/cr2` (interner Wire-Name, Client-Vertrag —
 *     bewusst beibehalten, da Umbenennung eine koordinierte Client-Aenderung
 *     erfordert).
 *   - Zwei Rooms pro Session:
 *       cr2:<sessionId>:teacher    — Lehrkraft-Sockets (Live-Dashboard)
 *       cr2:<sessionId>:students   — alle Schueler-Sockets (Broadcasts)
 *     Plus pro Teilnehmer ein Single-Subscriber-Room:
 *       cr2:p:<participantId>      — view:updated, kicked
 *
 * Auth (D14, Single Source of Truth = cr2_capability_grant):
 *   - Lehrer  : Better-Auth-Session (Cookie) oder x-dev-user-id (ALLOW_DEV_AUTH=1)
 *               + handshake.auth.sessionId. Erfordert Capability `session:read`.
 *   - Schueler: handshake.auth.token oder Authorization-Header
 *               (Bearer <participant.auth_token>) oder Post-Connect-Event
 *               `student:hello { token }`. Erfordert Capability `view:student`.
 *   Beide Capabilities werden bei jedem Connect frisch aus der DB gelesen
 *   (kein In-Memory-Cache), damit Revokes (Kick, Session-Ende) sofort greifen.
 *
 * Reconnect-Logik (D6, 5-Min-Window):
 *   - Schueler-Socket schliesst: connected=0, last_seen_at aktualisiert,
 *     KEIN left_at gesetzt. Ein Timeout pro Teilnehmer wird gestartet.
 *   - Reconnect mit gueltigem Token innerhalb des Windows: Timer wird
 *     gecleart, view:updated wird gepusht. Keine erneuten capability_grants.
 *     Der Server bindet ueber den Token an denselben classroom_participant —
 *     kein neuer Teilnehmer, kein verlorener Platz (W2-T5).
 *   - Window laeuft ab (W2-T5): Teilnehmer wird ENDGUELTIG entfernt
 *     (leaveParticipant → left_at gesetzt) und student:left mit reason
 *     'timeout' an den Teacher-Room gesendet. Ein spaeterer Reconnect mit
 *     demselben Token scheitert dann an resolveParticipantSubject (leftAt-
 *     Check) — der Schueler muss per Code neu beitreten. Das haelt D6
 *     ("kein Dauerzustand") ein: 5 Min Gnadenfrist, danach ist der Platz frei
 *     und die aktive Teilnehmerzahl im Dashboard wieder korrekt.
 *
 * Risiko R-2 (Race-Conditions):
 *   Timer-Verwaltung zentral in Map<participantId, Timeout>. Beim Reconnect
 *   IMMER zuerst clearen, dann State setzen. clearAllTimers() fuer Tests.
 *
 * IP-Rate-Limit (Schutz gegen Connect-Floods, R-2-Pattern aus altem Code):
 *   Sliding-Window in Map<ip, { count, windowStart }>. Wird im Middleware
 *   vor jeglicher DB-Operation geprueft, damit DB-Last begrenzt bleibt.
 */

import cluster from 'node:cluster'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth/index.js'
import logger from '../logger.js'
import {
  findParticipantByToken,
  hasCapability,
  heartbeatParticipant,
  leaveParticipant,
  markParticipantDisconnect,
} from '../classroom/store.js'
import {
  trackParticipantReconnected,
  trackParticipantDropped,
} from '../classroom/telemetry.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const DEV_AUTH_ENABLED = !IS_PROD && process.env.ALLOW_DEV_AUTH === '1'

const DEFAULT_RECONNECT_WINDOW_MS = 5 * 60 * 1000  // D6
const DEFAULT_HELLO_TIMEOUT_MS = 5 * 1000
const DEFAULT_CONNECT_RATE_LIMIT = 50              // Connects pro IP / Fenster
const DEFAULT_CONNECT_RATE_WINDOW_MS = 60_000

// ── Modulzustand (SINGLE-NODE-ANNAHME, P5) ──────────────────────────
// nsps wird beim Setup gesetzt (Liste: [/classroom, /cr2]). Helper (notify*)
// und Timer-Logik lesen ueber Closure-Referenz. Ohne Setup sind alle Helper
// No-Ops (relevant fuer Route-Tests ohne Socket-Server).
//
// WICHTIG: nsps, disconnectTimers und connectAttempts sind MODUL-LOKAL —
// also pro Node-Prozess. Der Klassenraum-Realtime ist bewusst auf EINEN
// einzigen Node-Prozess ausgelegt (Use-Case: <=50 Teilnehmer/Schulstunde):
//   - notify*-Broadcasts erreichen nur Sockets, die mit DIESEM Prozess
//     verbunden sind (kein Redis-Adapter, kein Pub/Sub).
//   - Reconnect-Timer (D6) und IP-Rate-Limit leben nur in diesem Prozess.
// Mit PM2 instances>1 (Cluster-Mode) verteilt der Load-Balancer Sockets auf
// mehrere Prozesse → Broadcasts/Timer greifen prozessuebergreifend NICHT mehr,
// und zwar STILL (kein Fehler). Deshalb: ecosystem.config.cjs nutzt
// instances:1 + exec_mode:'fork', und setupClassroomSocket warnt LAUT, falls
// es doch in einem Cluster laeuft (assertSingleNode unten). Horizontal-Scaling
// (Redis-Adapter) ist fuer diesen Use-Case bewusst NICHT vorgesehen.
//
// W4-S2 (De-Brand): Primaerer Namespace ist `/classroom`. `/cr2` bleibt als
// Legacy-Alias erhalten, damit waehrend des Deploy-Fensters alte (gecachte)
// Clients, die noch `/cr2` verbinden, NICHT abreissen. Beide Namespaces teilen
// dieselbe Middleware + Connection-Logik; Emits gehen per emitToRoom() an
// BEIDE (Socket.io-Rooms sind pro Namespace isoliert). LEGACY_NAMESPACE
// entfernen, sobald keine alten Clients mehr aktiv sein koennen.
const PRIMARY_NAMESPACE = '/classroom'
const LEGACY_NAMESPACE  = '/cr2'
let nsps = []  // [primary, legacy] — gesetzt in setupClassroomSocket
let RECONNECT_WINDOW_MS = DEFAULT_RECONNECT_WINDOW_MS
let HELLO_TIMEOUT_MS = DEFAULT_HELLO_TIMEOUT_MS
let CONNECT_RATE_LIMIT = DEFAULT_CONNECT_RATE_LIMIT
let CONNECT_RATE_WINDOW_MS = DEFAULT_CONNECT_RATE_WINDOW_MS

// Zentrale Timer-Verwaltung (T-3.3). Genau EINE Map fuer alle
// pending Disconnect-Timeouts. Mehrere Tabs eines Teilnehmers
// teilen sich denselben Slot.
const disconnectTimers = new Map()

// Pro-IP-Rate-Limit
const connectAttempts = new Map()

function nowMs() { return Date.now() }

// Pruning: abgelaufene Fenster wurden bisher nur beim erneuten Connect
// DERSELBEN IP ueberschrieben — die Map wuchs sonst mit jeder je gesehenen
// IP unbegrenzt (langsamer Leak ueber Wochen). Muster wie CleanupStore in
// middleware/rateLimiter.js; unref() haelt CLI-Prozesse nicht am Leben.
// Exportiert fuer Tests.
export function pruneConnectAttempts(now = nowMs()) {
  let pruned = 0
  for (const [ip, entry] of connectAttempts.entries()) {
    if (now - entry.windowStart > CONNECT_RATE_WINDOW_MS) {
      connectAttempts.delete(ip)
      pruned++
    }
  }
  return pruned
}
setInterval(pruneConnectAttempts, 10 * 60 * 1000).unref()

// P5: Erkennt einen Multi-Instance-/Cluster-Betrieb, in dem der modul-lokale
// Realtime-State (Broadcasts/Timer/Rate-Limit) STILL bricht.
//   - PM2 cluster_mode forkt ueber Node's cluster-Modul → cluster.isWorker.
//   - PM2 setzt zusaetzlich NODE_APP_INSTANCE je Instanz; > 0 ⇒ definitiv
//     mehrere Instanzen (instance 0 allein faellt nicht auf, deckt cluster.isWorker ab).
function detectMultiInstance() {
  if (cluster.isWorker) return true
  const inst = Number(process.env.NODE_APP_INSTANCE)
  return Number.isFinite(inst) && inst > 0
}

// LAUTE Warnung beim Setup, falls der Single-Node-Vertrag verletzt ist (P5).
// Bewusst nur Warnung (kein process.exit): ein degradierter, aber laufender
// Server ist besser als ein harter Deploy-Ausfall — und die Warnung macht die
// Fehlkonfiguration unuebersehbar, statt sie still bleiben zu lassen.
function assertSingleNode() {
  if (!detectMultiInstance()) return
  logger.error(
    {
      nodeAppInstance: process.env.NODE_APP_INSTANCE ?? null,
      isClusterWorker: cluster.isWorker,
    },
    'KLASSENRAUM-REALTIME LAEUFT IM CLUSTER-/MULTI-INSTANCE-MODUS — das ist NICHT unterstuetzt. ' +
    'Socket-Broadcasts, Reconnect-Timer (D6) und IP-Rate-Limit sind modul-lokal pro Prozess und ' +
    'brechen prozessuebergreifend STILL. PM2: instances:1 + exec_mode:"fork" setzen (ecosystem.config.cjs).',
  )
}

function checkConnectRateLimit(ip) {
  if (CONNECT_RATE_LIMIT === 0) return true
  const now = nowMs()
  const entry = connectAttempts.get(ip)
  if (!entry || now - entry.windowStart > CONNECT_RATE_WINDOW_MS) {
    connectAttempts.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= CONNECT_RATE_LIMIT) return false
  entry.count++
  return true
}

function roomTeacher(sessionId)      { return `cr2:${sessionId}:teacher` }
function roomStudents(sessionId)     { return `cr2:${sessionId}:students` }
function roomParticipant(participantId) { return `cr2:p:${participantId}` }

// ── Subject-Resolver ────────────────────────────────────────────────
// Beide Pfade lesen ausschliesslich aus dem Handshake — keine
// per-Socket-Cookies oder State nach dem ersten Auth.

async function resolveTeacherSubject(socket) {
  const headers = socket.handshake.headers || {}
  if (DEV_AUTH_ENABLED) {
    const devId = headers['x-dev-user-id']
    if (typeof devId === 'string' && devId.trim()) {
      return { kind: 'teacher', id: devId.trim() }
    }
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
    if (session?.user?.id) return { kind: 'teacher', id: String(session.user.id) }
  } catch (err) {
    logger.debug({ err }, 'cr2 socket: getSession fehlgeschlagen')
  }
  return null
}

function extractParticipantToken(socket) {
  const authObj = socket.handshake.auth || {}
  if (typeof authObj.token === 'string' && authObj.token.trim()) {
    return authObj.token.trim()
  }
  const header = socket.handshake.headers?.authorization
  if (typeof header === 'string') {
    const m = header.match(/^Bearer\s+(.+)$/i)
    if (m) return m[1].trim()
  }
  return null
}

function resolveParticipantSubject(socket) {
  const token = extractParticipantToken(socket)
  if (!token) return null
  const p = findParticipantByToken(token)
  if (!p || p.leftAt) return null
  return { kind: 'participant', id: p.id, sessionId: p.sessionId, participant: p }
}

// ── Timer-Helfer (T-3.3, R-2-Mitigation) ────────────────────────────

function clearDisconnectTimer(participantId) {
  const t = disconnectTimers.get(participantId)
  if (t) {
    clearTimeout(t)
    disconnectTimers.delete(participantId)
  }
}

function scheduleDisconnectTimeout(sessionId, participantId) {
  // Wenn bereits ein Timer existiert (etwa weil ein zweiter Tab gerade
  // ebenfalls geschlossen wurde), erst clearen. Sonst kaeme das Event
  // doppelt durch.
  clearDisconnectTimer(participantId)

  const t = setTimeout(() => {
    disconnectTimers.delete(participantId)
    // W2-T5: Reconnect-Fenster abgelaufen → Teilnehmer endgueltig entfernen.
    // left_at wird gesetzt; ein spaeterer Reconnect mit demselben Token
    // scheitert dann an resolveParticipantSubject (leftAt-Check). Das gibt den
    // Platz frei (D6: kein Dauerzustand) und haelt die aktive Teilnehmerzahl
    // im Dashboard korrekt. KEIN explizites Revoke noetig — der leftAt-Gate
    // sperrt den Token bereits vor jeder Capability-Pruefung.
    try { leaveParticipant(participantId) } catch (err) {
      logger.warn({ err, participantId }, 'cr2 leaveParticipant on timeout fehlgeschlagen')
    }
    trackParticipantDropped(sessionId, participantId)
    if (!nsps.length) return
    // student:left zwecks Anzeige im Live-Dashboard (reason: 'timeout').
    emitToRoom(roomTeacher(sessionId), 'student:left', {
      participantId,
      reason: 'timeout',
      at: nowMs(),
    })
    logger.info({ sessionId, participantId }, 'cr2 student timed out (reconnect window expired)')
  }, RECONNECT_WINDOW_MS)
  t.unref?.()
  disconnectTimers.set(participantId, t)
}

function hasOpenSocketsForParticipant(participantId) {
  if (!nsps.length) return false
  // Ueber alle Namespaces pruefen — der Socket des Teilnehmers kann waehrend
  // des Deploy-Fensters auf /classroom ODER /cr2 haengen.
  const room = roomParticipant(participantId)
  return nsps.some((n) => (n.adapter?.rooms?.get(room)?.size ?? 0) > 0)
}

// ── Setup ───────────────────────────────────────────────────────────

// Auth-Middleware fuer den Klassenraum-Namespace. Identisch fuer /classroom
// und den Legacy-Alias /cr2 (W4-S2) — daher als benannte Funktion extrahiert.
async function classroomSocketAuth(socket, next) {
  try {
    // Hinter nginx ist handshake.address die Proxy-IP — das Limit wuerde
    // auf EINE IP kollabieren. X-Forwarded-For (vom Proxy gesetzt, siehe
    // ops/nginx-*.conf) hat Vorrang; erster Eintrag = Client. Caveat wie
    // bei Express trust proxy=1: nur hinter dem eigenen Proxy verlaesslich.
    const xff = socket.handshake.headers['x-forwarded-for']
    const ip = (typeof xff === 'string' && xff.length > 0)
      ? xff.split(',')[0].trim()
      : (socket.handshake.address || 'unknown')
    if (!checkConnectRateLimit(ip)) {
      logger.warn({ ip }, 'classroom socket: rate limit exceeded')
      return next(new Error('RATE_LIMITED'))
    }

    const handshakeAuth = socket.handshake.auth || {}
    const handshakeSessionId = typeof handshakeAuth.sessionId === 'string'
      ? handshakeAuth.sessionId.trim()
      : ''

    // 1. Teacher-Pfad: Cookie/Dev-Header + handshake.sessionId
    const teacher = await resolveTeacherSubject(socket)
    if (teacher && handshakeSessionId) {
      const ok = hasCapability({
        sessionId:    handshakeSessionId,
        subjectKind:  'teacher',
        subjectId:    teacher.id,
        capability:   'session:read',
      })
      if (!ok) return next(new Error('FORBIDDEN'))
      socket.data.role      = 'teacher'
      socket.data.sessionId = handshakeSessionId
      socket.data.subjectId = teacher.id
      return next()
    }

    // 2. Schueler-Pfad: Token im Handshake (oder Bearer-Header)
    const participantSubject = resolveParticipantSubject(socket)
    if (participantSubject) {
      const ok = hasCapability({
        sessionId:   participantSubject.sessionId,
        subjectKind: 'participant',
        subjectId:   participantSubject.id,
        capability:  'view:student',
      })
      if (!ok) return next(new Error('FORBIDDEN'))
      socket.data.role        = 'student'
      socket.data.sessionId   = participantSubject.sessionId
      socket.data.subjectId   = participantSubject.id
      socket.data.participant = participantSubject.participant
      return next()
    }

    // 3. Pending-Pfad: Client kuendigt mit role='student-pending' an,
    //    dass er das Token nach Connect per student:hello nachschiebt.
    //    Ein Watchdog schliesst die Verbindung, falls hello ausbleibt.
    if (handshakeAuth.role === 'student-pending') {
      socket.data.role = 'pending'
      return next()
    }

    return next(new Error('UNAUTHORIZED'))
  } catch (err) {
    logger.error({ err }, 'classroom socket middleware crashed')
    return next(new Error('INTERNAL'))
  }
}

/**
 * setupClassroomSocket(io, options) – registriert den /classroom-Namespace
 * (plus Legacy-Alias /cr2) auf einer bestehenden Socket.io-Server-Instanz.
 *
 * Options:
 *   reconnectWindowMs    – default 5 Min (D6). In Tests deutlich kleiner.
 *   helloTimeoutMs       – default 5 s, Grace-Period fuer pending-Sockets.
 *   connectRateLimit     – default 50/min/IP. 0 deaktiviert das Limit.
 *   connectRateWindowMs  – default 60 s.
 */
export function setupClassroomSocket(io, options = {}) {
  if (!io) throw new Error('setupClassroomSocket: io required')

  // P5: Single-Node-Vertrag pruefen (warnt laut bei Cluster-/Multi-Instance).
  assertSingleNode()

  RECONNECT_WINDOW_MS    = options.reconnectWindowMs    ?? DEFAULT_RECONNECT_WINDOW_MS
  HELLO_TIMEOUT_MS       = options.helloTimeoutMs       ?? DEFAULT_HELLO_TIMEOUT_MS
  CONNECT_RATE_LIMIT     = options.connectRateLimit     ?? DEFAULT_CONNECT_RATE_LIMIT
  CONNECT_RATE_WINDOW_MS = options.connectRateWindowMs  ?? DEFAULT_CONNECT_RATE_WINDOW_MS

  // Primaerer Namespace zuerst + Legacy-Alias /cr2 (W4-S2, Deploy-Fenster).
  // Beide teilen Auth-Middleware und Connection-Handler; Emits fan-out per
  // emitToRoom() an alle. nsps[0] (/classroom) ist der bevorzugte Rueckgabewert.
  nsps = [PRIMARY_NAMESPACE, LEGACY_NAMESPACE].map((name) => {
    const n = io.of(name)
    n.use(classroomSocketAuth)
    n.on('connection', (socket) => onSocketConnected(socket))
    return n
  })

  logger.info({ namespaces: [PRIMARY_NAMESPACE, LEGACY_NAMESPACE] }, 'classroom socket namespaces initialisiert')
  return nsps[0]
}

function onSocketConnected(socket) {
  const { role } = socket.data || {}

  if (role === 'teacher') {
    socket.join(roomTeacher(socket.data.sessionId))
    logger.debug({
      sid: socket.id,
      teacherId: socket.data.subjectId,
      sessionId: socket.data.sessionId,
    }, 'cr2 teacher socket connected')
  } else if (role === 'student') {
    attachStudent(socket)
  } else if (role === 'pending') {
    const watchdog = setTimeout(() => {
      if (socket.data.role === 'pending') {
        try { socket.emit('cr2:error', { code: 'HELLO_TIMEOUT' }) } catch {}
        socket.disconnect(true)
      }
    }, HELLO_TIMEOUT_MS)
    watchdog.unref?.()
    socket.data.helloWatchdog = watchdog
  }

  socket.on('student:hello', (payload) => handleStudentHello(socket, payload))
  socket.on('disconnect', (reason) => onSocketDisconnect(socket, reason))
}

function attachStudent(socket) {
  const sessionId     = socket.data.sessionId
  const participantId = socket.data.subjectId

  socket.join(roomStudents(sessionId))
  socket.join(roomParticipant(participantId))

  // Reconnect innerhalb des Windows: Timer war noch aktiv → ist ein Reconnect.
  const isReconnect = disconnectTimers.has(participantId)
  clearDisconnectTimer(participantId)

  try { heartbeatParticipant(participantId) } catch (err) {
    logger.warn({ err, participantId }, 'cr2 heartbeat on attach fehlgeschlagen')
  }

  if (isReconnect) {
    trackParticipantReconnected(sessionId, participantId)
    logger.debug({ sid: socket.id, participantId, sessionId }, 'cr2 student reconnected (within window)')
  }

  socket.emit('view:updated', { reason: 'connected' })
  logger.debug({
    sid: socket.id,
    participantId,
    sessionId,
  }, 'cr2 student socket connected')
}

function handleStudentHello(socket, payload) {
  if (socket.data.role !== 'pending') return
  try {
    const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
    if (!token) {
      socket.emit('cr2:error', { code: 'INVALID_TOKEN' })
      return
    }
    const p = findParticipantByToken(token)
    if (!p || p.leftAt) {
      socket.emit('cr2:error', { code: 'UNAUTHORIZED' })
      return
    }
    const ok = hasCapability({
      sessionId:   p.sessionId,
      subjectKind: 'participant',
      subjectId:   p.id,
      capability:  'view:student',
    })
    if (!ok) {
      socket.emit('cr2:error', { code: 'FORBIDDEN' })
      return
    }
    if (socket.data.helloWatchdog) clearTimeout(socket.data.helloWatchdog)
    socket.data.role        = 'student'
    socket.data.sessionId   = p.sessionId
    socket.data.subjectId   = p.id
    socket.data.participant = p
    attachStudent(socket)
  } catch (err) {
    logger.error({ err }, 'cr2 student:hello crashed')
  }
}

function onSocketDisconnect(socket, reason) {
  if (socket.data?.helloWatchdog) clearTimeout(socket.data.helloWatchdog)

  if (socket.data?.role !== 'student' || !socket.data.subjectId) {
    // Lehrer-/Pending-Disconnect: keine Aktion. Session laeuft serverseitig
    // weiter; T1 zeigt die Session als "live", Rejoin via Klick (Plan §UX).
    return
  }

  const sessionId     = socket.data.sessionId
  const participantId = socket.data.subjectId

  try { markParticipantDisconnect(participantId) } catch (err) {
    logger.warn({ err, participantId }, 'cr2 markParticipantDisconnect fehlgeschlagen')
  }

  // Nur Timer starten, wenn KEIN weiteres Socket dieses Teilnehmers offen ist.
  // Verhindert verfruehte timeouts, wenn ein zweiter Tab noch lebt.
  if (!hasOpenSocketsForParticipant(participantId)) {
    scheduleDisconnectTimeout(sessionId, participantId)
  }

  logger.debug({
    sid: socket.id,
    participantId,
    sessionId,
    reason,
  }, 'cr2 student socket disconnected')
}

// ════════════════════════════════════════════════════════════════════
// Broadcast-Helper fuer den HTTP-Layer (T-3.2)
// ════════════════════════════════════════════════════════════════════
// Werden aus server/routes/classroom.js gerufen. Kein direkter
// io-Zugriff in den Routes — saubere Kapselung.
//
// Alle Helper sind No-Ops, wenn setupClassroomSocket nicht gerufen
// wurde (Unit-Test-Pfad ohne Socket-Server).

// Emit an einen Room ueber ALLE aktiven Namespaces (/classroom + /cr2).
// Waehrend des Deploy-Fensters koennen Lehrer und Schueler einer Session auf
// verschiedenen Namespaces haengen (neuer Client → /classroom, alt-gecachter
// Client → /cr2). Socket.io-Rooms sind pro Namespace isoliert, also muss jeder
// Broadcast an beide gehen, sonst sehen sich die Parteien nicht.
function emitToRoom(room, event, payload) {
  for (const n of nsps) n.to(room).emit(event, payload)
}

export function notifyStudentJoined(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomTeacher(sessionId), 'student:joined', payload)
}

export function notifyStudentLeft(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomTeacher(sessionId), 'student:left', payload)
}

export function notifyStudentHeartbeat(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomTeacher(sessionId), 'student:heartbeat', payload)
}

export function notifySubmissionReceived(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomTeacher(sessionId), 'submission:received', payload)
}

export function notifyParticipantProgress(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomTeacher(sessionId), 'participant:progress', payload)
}

export function notifySessionStarted(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomStudents(sessionId), 'session:started', payload)
  emitToRoom(roomTeacher(sessionId), 'session:started', payload)
}

export function notifySessionFinished(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomStudents(sessionId), 'session:finished', payload)
  emitToRoom(roomTeacher(sessionId), 'session:finished', payload)
}

// Hinweis (P5/Kleinkram): notifySessionAborted wurde entfernt — es gibt keinen
// Abort-Endpoint, der 'aborted' erzeugt. Der Client lauscht zwar weiterhin
// defensiv auf 'session:aborted', aber niemand emittiert es. Bei Einfuehrung
// eines Abort-Flows hier wieder ergaenzen (Muster wie notifySessionFinished).

export function notifySessionPaused(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomStudents(sessionId), 'session:paused', payload)
  emitToRoom(roomTeacher(sessionId), 'session:paused', payload)
}

export function notifySessionResumed(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomStudents(sessionId), 'session:resumed', payload)
  emitToRoom(roomTeacher(sessionId), 'session:resumed', payload)
}

// W2-T2: Modus-Wechsel innerhalb einer laufenden Session.
//
// SICHERHEIT (R1): Das Payload enthaelt BEWUSST KEINEN content_snapshot —
// der Snapshot haelt antwort-relevante Felder (rang, periode, zuordnung,
// kollokator). Wuerden wir ihn ueber den Socket schicken, umgingen wir die
// Whitelist-Serialisierung aus /me/view. Stattdessen senden wir nur ein
// Signal + unkritische Metadaten (mode, index, total); der Schueler-Kiosk
// holt die gewhitelistete neue Aufgabe per GET /me/view nach (gleiches
// Muster wie 'view:updated'). Der Plan-Wortlaut „mit content_snapshot"
// wird hier zugunsten von R1 bewusst nicht woertlich umgesetzt.
export function notifyAssignmentChanged(sessionId, payload) {
  if (!nsps.length || !sessionId) return
  emitToRoom(roomStudents(sessionId), 'assignment:changed', payload)
  emitToRoom(roomTeacher(sessionId), 'assignment:changed', payload)
}

export function notifyStudentViewUpdated(participantId, payload) {
  if (!nsps.length || !participantId) return
  emitToRoom(roomParticipant(participantId), 'view:updated', payload)
}


// ── Test-/Cleanup-Helper ────────────────────────────────────────────

/**
 * Cleared alle pending Disconnect-Timeouts. Wird in Tests verwendet, damit
 * setTimeout-Handles nicht ueber das aktuelle Test-File hinaus weiterleben
 * (vitest-Worker recyclen ihre Module sonst nicht sauber).
 */
export function clearAllTimers() {
  for (const t of disconnectTimers.values()) clearTimeout(t)
  disconnectTimers.clear()
  connectAttempts.clear()
}

export function __getTimerCountForTests() {
  return disconnectTimers.size
}

export function __seedConnectAttemptForTests(ip, windowStart) {
  connectAttempts.set(ip, { count: 1, windowStart })
}

export function __getConnectAttemptCountForTests() {
  return connectAttempts.size
}

export function __getNamespaceForTests() {
  return nsps[0] ?? null
}
