#!/usr/bin/env node
/**
 * scripts/classroom-loadtest.js
 *
 * Classroom-Lasttest (W2-T7).
 * Simuliert N gleichzeitige Schüler-Clients gegen einen laufenden Server.
 *
 * Aufruf (Server muss laufen, ALLOW_DEV_AUTH=1 in .env):
 *   node --env-file=.env scripts/classroom-loadtest.js
 *   node --env-file=.env scripts/classroom-loadtest.js --n=30 --url=http://localhost:3001
 *
 * Optionen:
 *   --n=50             Anzahl simulierter Schüler (Default: 50)
 *   --url=<url>        Server-URL (Default: http://localhost:3001)
 *   --reconnect-pct=10 Anteil Clients mit Reconnect-Simulation in % (Default: 10)
 *
 * Voraussetzungen:
 *   - Server läuft (npm run server) mit ALLOW_DEV_AUTH=1
 *   - APP_DB-Variable zeigt auf die DB-Datei (oder Default-Pfad wird verwendet)
 *   - socket.io-client ist in node_modules vorhanden (ist in dependencies)
 */

import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { io as ioClient } from 'socket.io-client'

// ── CLI-Argumente ──────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(key, def) {
  const f = args.find(a => a.startsWith(`--${key}=`))
  return f ? f.slice(key.length + 3) : def
}
const N = Math.max(1, parseInt(getArg('n', '50'), 10))
const SERVER_URL = getArg('url', 'http://localhost:3001')
const RECONNECT_PCT = Math.max(0, Math.min(100, parseInt(getArg('reconnect-pct', '10'), 10)))
const TEACHER_ID = `lt-teacher-${randomUUID().slice(0, 8)}`

// ── DB-Pfad ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_PATH = process.env.APP_DB || join(__dirname, '..', 'server', 'data', 'signifikation.db')

// ── Metriken-Sammlung ──────────────────────────────────────────────
const m = {
  joinMs: [],
  submitMs: [],
  viewMs: [],
  reconnectMs: [],
  broadcastStartMs: null,
  broadcastChangeMs: null,
  httpErrors: 0,   // nur HTTP-Fehler (nicht Socket-Connect)
  socketErrors: 0, // Socket-Verbindungsfehler separat
  totalReqs: 0,
  submissionsExpected: 0,
  submissionsInDb: 0,
}
// Alias für Rückwärtskompatibilität der Logging-Zeilen
Object.defineProperty(m, 'errors', {
  get() { return this.httpErrors + this.socketErrors },
})

function pct(arr, p) {
  if (!arr.length) return '-'
  const s = [...arr].sort((a, b) => a - b)
  return Math.round(s[Math.max(0, Math.ceil(p / 100 * s.length) - 1)]) + 'ms'
}

function log(phase, msg) {
  const pad = phase.padEnd(10)
  console.log(`[${pad}] ${msg}`)
}

// ── HTTP-Wrapper mit Timing ────────────────────────────────────────
async function api(path, opts = {}) {
  m.totalReqs++
  const t0 = performance.now()
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
        'x-requested-with': 'signifikation-app',
        ...(opts.headers || {}),
      },
    })
    const elapsed = performance.now() - t0
    let body = null
    try { body = await res.json() } catch {}
    if (!res.ok) m.httpErrors++
    return { ok: res.ok, status: res.status, body, ms: elapsed }
  } catch (err) {
    m.httpErrors++
    return { ok: false, status: 0, body: null, ms: performance.now() - t0, err }
  }
}

function teacherHdr() {
  return { 'x-dev-user-id': TEACHER_ID, 'x-dev-user-role': 'premium' }
}

// ── DB-Zugriff für Setup/Teardown ──────────────────────────────────
let db
let sessionId, lemmaId, assignmentId1, assignmentId2, joinCode

function setupDb() {
  try {
    db = new Database(DB_PATH, { timeout: 3000 })
  } catch (err) {
    console.error(`DB nicht geöffnet (${DB_PATH}): ${err.message}`)
    process.exit(1)
  }
  // Test-User anlegen — nötig wegen FK classroom_session.teacher_user_id → user.id
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Load Test Teacher', ?, 0, ?, ?)
  `).run(TEACHER_ID, `${TEACHER_ID}@loadtest.local`, now, now)

  // Lemma mit Kollokatoren-Daten für den Kollokationen-Modus
  const rows = db.prepare(`
    SELECT id, runden FROM lemmata
    WHERE runden IS NOT NULL AND runden NOT IN ('null', '{}', '')
    LIMIT 20
  `).all()

  for (const row of rows) {
    try {
      const r = JSON.parse(row.runden)
      const koll = r.kollokatoren || r.kollokationen?.kollokatoren || []
      if (koll.length >= 3) { lemmaId = row.id; break }
    } catch {}
  }

  if (!lemmaId) {
    // Notfall-Fallback: irgendein Lemma, Scoring liefert 0 aber kein Fehler
    const row = db.prepare('SELECT id FROM lemmata LIMIT 1').get()
    lemmaId = row?.id
  }
}

function cleanupDb() {
  if (!db) return
  try {
    // Kaskadierendes Löschen über FK: classroom_session → classroom_submission etc.
    if (sessionId) {
      db.prepare('DELETE FROM classroom_session WHERE id = ?').run(sessionId)
    }
    db.prepare('DELETE FROM user WHERE id = ?').run(TEACHER_ID)
  } catch (err) {
    log('Cleanup', `DB-Cleanup-Fehler: ${err.message}`)
  } finally {
    try { db.close() } catch {}
  }
}

// ── Socket-Helper ──────────────────────────────────────────────────
function connectSocket(auth, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const sock = ioClient(`${SERVER_URL}/cr2`, {
      transports: ['websocket'],
      auth,
      extraHeaders,
      reconnection: false,
      timeout: 5000,
    })
    const timer = setTimeout(() => {
      try { sock.disconnect() } catch {}
      reject(new Error('Socket-Verbindung Timeout'))
    }, 5000)
    sock.once('connect', () => { clearTimeout(timer); resolve(sock) })
    sock.once('connect_error', (err) => { clearTimeout(timer); reject(err) })
  })
}

// ── Haupttest ─────────────────────────────────────────────────────
async function main() {
  if (process.env.ALLOW_DEV_AUTH !== '1') {
    console.warn('Warnung: ALLOW_DEV_AUTH ist nicht gesetzt — Server muss mit ALLOW_DEV_AUTH=1 laufen.')
  }

  console.log(`\nClassroom-Lasttest  N=${N}  URL=${SERVER_URL}  Reconnect=${RECONNECT_PCT}%`)
  console.log('─'.repeat(55))

  setupDb()
  if (!lemmaId) {
    console.error('Kein Lemma in DB gefunden. Abbruch.')
    cleanupDb(); process.exit(1)
  }
  log('Setup', `Teacher=${TEACHER_ID.slice(0, 20)}  Lemma=${lemmaId}`)

  // ── Phase 1: Session + 2 Assignments anlegen ──────────────────
  log('Phase 1', 'Session anlegen...')
  const sessRes = await api('/api/v1/classroom/sessions', {
    method: 'POST',
    headers: teacherHdr(),
    body: JSON.stringify({ title: 'Lasttest' }),
  })
  if (!sessRes.ok) {
    console.error('Session-Anlegen fehlgeschlagen:', sessRes.body, sessRes.err?.message)
    cleanupDb(); process.exit(1)
  }
  sessionId = sessRes.body.id
  joinCode = sessRes.body.code
  log('Phase 1', `Session=${sessionId.slice(0, 8)}…  Code=${joinCode}`)

  const a1 = await api(`/api/v1/classroom/sessions/${sessionId}/assignments`, {
    method: 'POST',
    headers: teacherHdr(),
    body: JSON.stringify({ mode: 'kollokationen', lemmaIds: [lemmaId] }),
  })
  if (!a1.ok) { console.error('Assignment 1 fehlgeschlagen:', a1.body); cleanupDb(); process.exit(1) }
  assignmentId1 = a1.body.id

  // Zweites Assignment für den Modus-Wechsel-Test (W2-T2)
  const a2 = await api(`/api/v1/classroom/sessions/${sessionId}/assignments`, {
    method: 'POST',
    headers: teacherHdr(),
    body: JSON.stringify({ mode: 'kollokationen', lemmaIds: [lemmaId] }),
  })
  assignmentId2 = a2.ok ? a2.body.id : null
  log('Phase 1', `Assignments: ${assignmentId1.slice(0, 8)}…  ${assignmentId2 ? assignmentId2.slice(0, 8) + '…' : '(nur 1)'}`)

  // ── Phase 2: N Clients beitreten (concurrent) ─────────────────
  log('Phase 2', `${N} Clients beitreten...`)
  const students = []
  // Separate virtuelle Client-IPs → classroomJoinLimiter (10/5min/IP) wird
  // nicht zum Engpass. Jeder simulierte Client bekommt eine eigene IP.
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      api('/api/v1/classroom/join', {
        method: 'POST',
        headers: { 'x-forwarded-for': `10.${Math.floor(i / 65025)}.${Math.floor((i % 65025) / 255)}.${i % 255 + 1}` },
        body: JSON.stringify({ code: joinCode, displayName: `S${i + 1}` }),
      }).then(r => {
        m.joinMs.push(r.ms)
        if (r.ok && r.body?.token) {
          // fakeIp: in Prod hat jedes Gerät eine eigene IP → Rate-Limiter kein Problem.
          // Im Test simulieren wir das durch virtuelle IPs pro Student.
          const fakeIp = `10.${Math.floor(i / 65025)}.${Math.floor((i % 65025) / 255)}.${i % 255 + 1}`
          students.push({ token: r.body.token, id: r.body.participantId, idx: i, fakeIp })
        }
      }),
    ),
  )
  log('Phase 2', `${students.length}/${N} beigetreten — P50: ${pct(m.joinMs, 50)}  P95: ${pct(m.joinMs, 95)}`)

  if (students.length === 0) {
    console.error('Kein Client hat sich verbunden. Prüfe Server und ALLOW_DEV_AUTH.')
    cleanupDb(); process.exit(1)
  }

  // ── Phase 3: Sockets verbinden ────────────────────────────────
  log('Phase 3', `${students.length} Student-Sockets verbinden...`)
  const t0Sockets = performance.now()
  const socketResults = await Promise.allSettled(
    students.map(s => connectSocket({ token: s.token })),
  )
  const sockets = []
  for (let i = 0; i < socketResults.length; i++) {
    if (socketResults[i].status === 'fulfilled') {
      sockets.push({ sock: socketResults[i].value, student: students[i] })
    } else {
      m.socketErrors++
    }
  }
  log('Phase 3', `${sockets.length}/${students.length} verbunden in ${Math.round(performance.now() - t0Sockets)}ms`)

  // Teacher-Socket (für Broadcast-Empfang)
  let teacherSock = null
  try {
    teacherSock = await connectSocket(
      { sessionId },
      { 'x-dev-user-id': TEACHER_ID },
    )
    log('Phase 3', 'Teacher-Socket verbunden')
  } catch (err) {
    log('Phase 3', `Teacher-Socket fehlgeschlagen: ${err.message}`)
  }

  // ── Phase 4: Session starten + Broadcast-Latenz ───────────────
  log('Phase 4', 'Session starten (Broadcast-Messung)...')

  // Alle Student-Sockets auf session:started-Event vorbereiten
  let startReceivedCount = 0
  const startReceiveTimes = []
  const allStartedP = Promise.all(
    sockets.map(({ sock }) => new Promise(resolve => {
      sock.once('session:started', () => {
        startReceiveTimes.push(performance.now())
        startReceivedCount++
        resolve()
      })
    })),
  )

  const t0Start = performance.now()
  const startRes = await api(`/api/v1/classroom/sessions/${sessionId}/start`, {
    method: 'POST',
    headers: teacherHdr(),
    body: '{}',
  })

  if (startRes.ok) {
    await Promise.race([allStartedP, new Promise(r => setTimeout(r, 5000))])
    const maxT = startReceiveTimes.length ? Math.max(...startReceiveTimes) : 0
    m.broadcastStartMs = maxT > 0 ? Math.round(maxT - t0Start) : null
    log('Phase 4', `${startReceivedCount}/${sockets.length} session:started empfangen — ${m.broadcastStartMs ?? '?'}ms`)
  } else {
    log('Phase 4', `Start fehlgeschlagen: ${JSON.stringify(startRes.body)}`)
  }

  // ── Phase 5: Submissions Assignment 1 (concurrent) ───────────
  log('Phase 5', `${students.length} Submissions Assignment 1...`)
  m.submissionsExpected += students.length
  await Promise.all(
    students.map(s =>
      api('/api/v1/classroom/me/submit', {
        method: 'POST',
        headers: { authorization: `Bearer ${s.token}`, 'x-forwarded-for': s.fakeIp },
        body: JSON.stringify({
          assignmentId: assignmentId1,
          lemmaId,
          roundIndex: 0,
          rawAnswer: { selected: [] },
        }),
      }).then(r => { m.submitMs.push(r.ms) }),
    ),
  )
  log('Phase 5', `P50: ${pct(m.submitMs, 50)}  P95: ${pct(m.submitMs, 95)}  P99: ${pct(m.submitMs, 99)}  Fehler: ${m.errors}`)

  // ── Phase 6: Reconnect-Test ───────────────────────────────────
  const reconnectN = Math.max(1, Math.round(sockets.length * RECONNECT_PCT / 100))
  log('Phase 6', `Reconnect: ${reconnectN} von ${sockets.length} Clients...`)

  // Sockets trennen
  for (let i = 0; i < reconnectN; i++) {
    try { sockets[i].sock.disconnect() } catch {}
  }
  // 300ms warten, damit Server Disconnect verarbeitet
  await new Promise(r => setTimeout(r, 300))

  // Reconnect und view:updated-Event messen
  const reconnectTasks = sockets.slice(0, reconnectN).map(({ student }) =>
    new Promise(resolve => {
      const t0 = performance.now()
      connectSocket({ token: student.token })
        .then(newSock => {
          newSock.once('view:updated', () => {
            m.reconnectMs.push(performance.now() - t0)
            resolve(newSock)
          })
          setTimeout(() => resolve(newSock), 5000)
        })
        .catch(() => { m.socketErrors++; resolve(null) })
    }),
  )
  const newSocks = await Promise.all(reconnectTasks)
  for (let i = 0; i < reconnectN; i++) {
    if (newSocks[i]) sockets[i].sock = newSocks[i]
  }
  log('Phase 6', `${m.reconnectMs.length}/${reconnectN} erfolgreich — P50: ${pct(m.reconnectMs, 50)}  P95: ${pct(m.reconnectMs, 95)}`)

  // ── Phase 7: Modus-Wechsel + Broadcast (W2-T2) ───────────────
  if (assignmentId2) {
    log('Phase 7', 'next-assignment (Broadcast-Messung)...')

    const changeReceiveTimes = []
    let changeReceivedCount = 0
    const allChangedP = Promise.all(
      sockets.map(({ sock }) => new Promise(resolve => {
        sock.once('assignment:changed', () => {
          changeReceiveTimes.push(performance.now())
          changeReceivedCount++
          resolve()
        })
      })),
    )

    const t0Change = performance.now()
    const nextRes = await api(`/api/v1/classroom/sessions/${sessionId}/next-assignment`, {
      method: 'POST',
      headers: teacherHdr(),
      body: '{}',
    })

    if (nextRes.ok && !nextRes.body?.done) {
      await Promise.race([allChangedP, new Promise(r => setTimeout(r, 5000))])
      const maxT = changeReceiveTimes.length ? Math.max(...changeReceiveTimes) : 0
      m.broadcastChangeMs = maxT > 0 ? Math.round(maxT - t0Change) : null
      log('Phase 7', `${changeReceivedCount}/${sockets.length} assignment:changed — ${m.broadcastChangeMs ?? '?'}ms`)

      // ── Phase 8: Submissions Assignment 2 ───────────────────
      log('Phase 8', `${students.length} Submissions Assignment 2...`)
      m.submissionsExpected += students.length
      await Promise.all(
        students.map(s =>
          api('/api/v1/classroom/me/submit', {
            method: 'POST',
            headers: { authorization: `Bearer ${s.token}`, 'x-forwarded-for': s.fakeIp },
            body: JSON.stringify({
              assignmentId: assignmentId2,
              lemmaId,
              roundIndex: 0,
              rawAnswer: { selected: [] },
            }),
          }).then(r => { m.submitMs.push(r.ms) }),
        ),
      )
      log('Phase 8', `P50: ${pct(m.submitMs, 50)}  P95: ${pct(m.submitMs, 95)}  P99: ${pct(m.submitMs, 99)}`)
    } else {
      log('Phase 7', `next-assignment Antwort: ${JSON.stringify(nextRes.body)}`)
    }
  }

  // ── Phase 9: View-Latenzen (10 Stichproben) ──────────────────
  log('Phase 9', 'View-Latenzen messen (10 Stichproben)...')
  await Promise.all(
    students.slice(0, 10).map(s =>
      api('/api/v1/classroom/me/view', {
        headers: { authorization: `Bearer ${s.token}` },
      }).then(r => { m.viewMs.push(r.ms) }),
    ),
  )
  log('Phase 9', `P50: ${pct(m.viewMs, 50)}  P95: ${pct(m.viewMs, 95)}`)

  // ── Phase 10: Session beenden ─────────────────────────────────
  log('Phase 10', 'Session beenden...')
  await api(`/api/v1/classroom/sessions/${sessionId}/finish`, {
    method: 'POST',
    headers: teacherHdr(),
    body: JSON.stringify({ reason: 'manual' }),
  })

  // ── Sockets trennen ───────────────────────────────────────────
  for (const { sock } of sockets) { try { sock.disconnect() } catch {} }
  if (teacherSock) { try { teacherSock.disconnect() } catch {} }
  await new Promise(r => setTimeout(r, 150))

  // ── DB: Submissions zählen (Vollständigkeitsprüfung) ──────────
  try {
    m.submissionsInDb = db.prepare(
      'SELECT COUNT(*) AS c FROM classroom_submission WHERE session_id = ?',
    ).get(sessionId)?.c ?? 0
  } catch {}

  cleanupDb()

  // ── Report ────────────────────────────────────────────────────
  const sep = '═'.repeat(58)
  const httpErrRate = m.totalReqs > 0 ? (m.httpErrors / m.totalReqs * 100).toFixed(1) : '0.0'
  const subPct = m.submissionsExpected > 0
    ? Math.round(m.submissionsInDb / m.submissionsExpected * 100)
    : '?'
  // Pass: HTTP-Fehlerrate < 5% UND alle Submissions in DB (Datenverlust = Fail)
  const pass = parseFloat(httpErrRate) < 5 && (m.submissionsExpected === 0 || subPct >= 95)

  console.log(`\n${sep}`)
  console.log(`Classroom-Lasttest ${pass ? 'BESTANDEN' : 'PROBLEME  '} | ${N} Clients | ${assignmentId2 ? '2' : '1'} Assignments`)
  console.log(sep)
  console.log(`Join-Latenz     P50: ${pct(m.joinMs, 50).padEnd(6)}  P95: ${pct(m.joinMs, 95).padEnd(6)}  P99: ${pct(m.joinMs, 99)}`)
  console.log(`Submit-Latenz   P50: ${pct(m.submitMs, 50).padEnd(6)}  P95: ${pct(m.submitMs, 95).padEnd(6)}  P99: ${pct(m.submitMs, 99)}`)
  console.log(`View-Latenz     P50: ${pct(m.viewMs, 50).padEnd(6)}  P95: ${pct(m.viewMs, 95)}`)
  if (m.broadcastStartMs !== null) {
    console.log(`Broadcast Start    ${m.broadcastStartMs}ms → ${sockets.length} Clients`)
  }
  if (m.broadcastChangeMs !== null) {
    console.log(`Broadcast Wechsel  ${m.broadcastChangeMs}ms → ${sockets.length} Clients`)
  }
  if (m.reconnectMs.length) {
    console.log(`Reconnect       P50: ${pct(m.reconnectMs, 50).padEnd(6)}  P95: ${pct(m.reconnectMs, 95)}`)
  }
  console.log(`HTTP-Fehler        ${m.httpErrors} / ${m.totalReqs} (${httpErrRate}%)`)
  if (m.socketErrors > 0) {
    console.log(`Socket-Fehler      ${m.socketErrors} (Rate-Limit lokaler Test — in Prod 1 IP/Gerät)`)
  }
  console.log(`Submissions DB     ${m.submissionsInDb} / ${m.submissionsExpected} (${subPct}%)`)
  console.log(sep)

  process.exit(pass ? 0 : 1)
}

main().catch(err => {
  console.error('\nLasttest abgebrochen:', err.message)
  try { cleanupDb() } catch {}
  process.exit(1)
})
