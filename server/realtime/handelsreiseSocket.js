/**
 * server/realtime/handelsreiseSocket.js – Klassenmarkt der „Handelsreise“
 *
 * Namespace /handelsreise. Zwei Rollen:
 *   - Spielleitung (Beamer, /unterricht/handelsreise-leitung.html): nur mit
 *     Admin-Login (Cookie better-auth.session_token, Rolle admin) – dieselbe
 *     Prüfung wie requireAuth für /admin.
 *   - Teams (iPads): ohne Account, per Raumcode; danach Token im Gerät.
 * Spiellogik: server/handelsreise/spiel.js. Rooms: hr:<code>:teams, hr:<code>:leitung.
 */
import db from '../db.js'
import logger from '../logger.js'
import {
  spielAnlegen, spielHolen, teamBeitreten, teamPerToken, ereignisSetzen,
  rundeFreigeben, abgabeSpeichern, standSpeichern, abrechnen,
  zustandFuerTeams, zustandFuerLeitung, spielLoeschen, teamEntfernen, vorzeitigBeenden,
} from '../handelsreise/spiel.js'

const NAMESPACE = '/handelsreise'
const COOKIE = 'better-auth.session_token'

function cookieWert(header, name) {
  for (const teil of String(header || '').split(';')) {
    const i = teil.indexOf('=')
    if (i > 0 && teil.slice(0, i).trim() === name) {
      try { return decodeURIComponent(teil.slice(i + 1).trim()) } catch { return null }
    }
  }
  return null
}

/** true, wenn der Handshake eine gültige Admin-Session mitbringt. */
export function istAdmin(cookieHeader) {
  const token = cookieWert(cookieHeader, COOKIE)
  if (!token) return false
  try {
    const session = db.prepare('SELECT userId FROM session WHERE token = ? AND expiresAt > ?').get(token, new Date().toISOString())
    if (!session) return false
    const profil = db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(session.userId)
    return !!profil && profil.role === 'admin'
  } catch (err) {
    logger.warn({ err }, 'Handelsreise: Admin-Prüfung fehlgeschlagen')
    return false
  }
}

const antworten = (ack, daten) => { if (typeof ack === 'function') ack(daten) }
const text = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '')

// ── Begrenzungen (Review 08.10.) ─────────────────────────────────────────
// Eine Schulklasse sitzt meist hinter EINER öffentlichen IP – die Grenzen sind
// deshalb großzügig für 14 iPads mit Wiederverbindungen, aber eng genug gegen
// Skripte. Die IP wird nur im Speicher gezählt, nicht gespeichert.
const CONNECTS_PRO_MINUTE = 150
const BEITRITTE_PRO_SOCKET = 8        // falsche Codes durchprobieren
const EVENTS_PRO_10S = 40             // ein normales Gerät sendet wenige Ereignisse je Runde
const connects = new Map()            // ip → { n, start }
setInterval(() => { const jetzt = Date.now(); for (const [ip, e] of connects) if (jetzt - e.start > 60_000) connects.delete(ip) }, 5 * 60_000).unref()

function clientIp(socket) {
  const xff = socket.handshake.headers['x-forwarded-for']
  return (typeof xff === 'string' && xff.length > 0) ? xff.split(',')[0].trim() : (socket.handshake.address || 'unknown')
}
function connectErlaubt(ip) {
  const jetzt = Date.now()
  const e = connects.get(ip)
  if (!e || jetzt - e.start > 60_000) { connects.set(ip, { n: 1, start: jetzt }); return true }
  e.n++
  return e.n <= CONNECTS_PRO_MINUTE
}

export function setupHandelsreiseSocket(io) {
  const nsp = io.of(NAMESPACE)

  function senden(s) {
    nsp.to(`hr:${s.code}:teams`).emit('zustand', zustandFuerTeams(s))
    nsp.to(`hr:${s.code}:leitung`).emit('leitung:zustand', zustandFuerLeitung(s))
  }
  // Beamer-Updates bündeln: viele Team-Meldungen kurz hintereinander → ein Update
  const leitungTimer = new Map()
  function leitungSenden(s) {
    if (leitungTimer.has(s.code)) return
    leitungTimer.set(s.code, setTimeout(() => {
      leitungTimer.delete(s.code)
      nsp.to(`hr:${s.code}:leitung`).emit('leitung:zustand', zustandFuerLeitung(s))
    }, 250))
  }

  nsp.use((socket, next) => {
    if (!connectErlaubt(clientIp(socket))) return next(new Error('RATE_LIMITED'))
    next()
  })

  nsp.on('connection', (socket) => {
    let teamRef = null   // { code, id }
    let beitritte = 0
    let fenster = { n: 0, start: Date.now() }

    // Ereignisse je Socket drosseln (Spam-Schutz)
    socket.use((_packet, next) => {
      const jetzt = Date.now()
      if (jetzt - fenster.start > 10_000) fenster = { n: 0, start: jetzt }
      if (++fenster.n > EVENTS_PRO_10S) return next(new Error('RATE_LIMITED'))
      next()
    })
    socket.on('error', () => { /* gedrosselte Ereignisse still verwerfen */ })

    function teamAus(d) {
      const s = spielHolen(text(d && d.code, 8))
      if (!s) return {}
      const t = teamPerToken(s, text(d && d.token, 64))
      return t ? { s, t } : {}
    }

    // ── Teams ─────────────────────────────────────────────
    socket.on('team:beitreten', (d, ack) => {
      if (++beitritte > BEITRITTE_PRO_SOCKET) return antworten(ack, { ok: false, fehler: 'zuviele' })
      const s = spielHolen(text(d && d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const name = text(d.name, 80)
      if (!name) return antworten(ack, { ok: false, fehler: 'name' })
      const r = teamBeitreten(s, { name, haus: text(d.haus, 40), socketId: socket.id })
      if (r.fehler) return antworten(ack, { ok: false, fehler: r.fehler })
      socket.join(`hr:${s.code}:teams`)
      r.team.verbunden = true
      r.team.socketId = socket.id
      teamRef = { code: s.code, id: r.team.id }
      antworten(ack, { ok: true, id: r.team.id, token: r.team.token, raum: r.team.raum, ort: r.team.ort, zustand: zustandFuerTeams(s) })
      leitungSenden(s)
    })

    // Wiederverbinden – und alle 15 s als Lebenszeichen des Geräts (heilt beide Seiten)
    socket.on('team:wieder', (d, ack) => {
      const { s, t } = teamAus(d)
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const neu = !t.verbunden || t.socketId !== socket.id
      socket.join(`hr:${s.code}:teams`)
      t.verbunden = true
      t.getrenntSeit = null
      t.socketId = socket.id
      teamRef = { code: s.code, id: t.id }
      antworten(ack, { ok: true, zustand: zustandFuerTeams(s) })
      if (neu) leitungSenden(s)
    })

    socket.on('team:hypothese', (d) => {
      const { s, t } = teamAus(d)
      if (!s) return
      if (['lage', 'ware', 'schutz', 'glueck'].includes(d.wahl)) t.hypothese = d.wahl
      leitungSenden(s)
    })

    socket.on('team:abgabe', (d) => {
      const { s, t } = teamAus(d)
      if (!s || !d) return
      if (abgabeSpeichern(s, t, { runde: d.runde, ort: d.ort, ziel: d.ziel, ueber: d.ueber, schutz: d.schutz, verkaeufe: d.verkaeufe })) leitungSenden(s)
    })

    socket.on('team:stand', (d) => {
      const { s, t } = teamAus(d)
      if (!s || !d) return
      if (standSpeichern(s, t, d)) leitungSenden(s)
    })

    socket.on('disconnect', () => {
      if (!teamRef) return
      const s = spielHolen(teamRef.code)
      const t = s && s.teams.get(teamRef.id)
      // Nur trennen, wenn kein neuerer Socket das Team übernommen hat
      if (t && t.socketId === socket.id) { t.verbunden = false; t.getrenntSeit = Date.now(); leitungSenden(s) }
    })

    // ── Spielleitung ──────────────────────────────────────
    function leitung(ereignisName, fn) {
      socket.on(ereignisName, (d, ack) => {
        if (!istAdmin(socket.handshake.headers.cookie)) return antworten(ack, { ok: false, fehler: 'login' })
        fn(d || {}, ack)
      })
    }

    leitung('leitung:hallo', (_d, ack) => antworten(ack, { ok: true }))

    leitung('leitung:neu', (_d, ack) => {
      const s = spielAnlegen()
      socket.join(`hr:${s.code}:leitung`)
      logger.info({ code: s.code }, 'Handelsreise: Spiel angelegt')
      antworten(ack, { ok: true, zustand: zustandFuerLeitung(s) })
    })

    leitung('leitung:oeffnen', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      socket.join(`hr:${s.code}:leitung`)
      antworten(ack, { ok: true, zustand: zustandFuerLeitung(s) })
    })

    leitung('leitung:ereignis', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const ok = ereignisSetzen(s, d.runde, d.raum, d.ereignis)
      antworten(ack, { ok })
      if (ok) leitungSenden(s)
    })

    leitung('leitung:freigeben', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const r = rundeFreigeben(s)
      antworten(ack, r.ok ? { ok: true } : { ok: false, fehler: r.fehler })
      if (r.ok) senden(s)
    })

    leitung('leitung:abrechnen', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const r = abrechnen(s)
      antworten(ack, r.ok ? { ok: true } : { ok: false, fehler: r.fehler })
      if (r.ok) senden(s)
    })

    leitung('leitung:schluss', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const r = vorzeitigBeenden(s)
      antworten(ack, r.ok ? { ok: true } : { ok: false, fehler: r.fehler })
      if (r.ok) senden(s)
    })

    leitung('leitung:entfernen', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (!s) return antworten(ack, { ok: false, fehler: 'unbekannt' })
      const team = s.teams.get(text(d.id, 32))
      const ok = teamEntfernen(s, text(d.id, 32))
      if (ok && team && team.socketId) nsp.to(team.socketId).emit('zustand', { ...zustandFuerTeams(s), entfernt: true })
      antworten(ack, { ok })
      if (ok) leitungSenden(s)
    })

    leitung('leitung:loeschen', (d, ack) => {
      const s = spielHolen(text(d.code, 8))
      if (s) { nsp.to(`hr:${s.code}:teams`).emit('zustand', { ...zustandFuerTeams(s), geloescht: true }); spielLoeschen(s.code) }
      antworten(ack, { ok: true })
    })
  })

  return nsp
}
