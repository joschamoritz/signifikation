// kioskFetch — fetch-Wrapper fuer den Schueler-Kiosk-Pfad.
//
// Bewusst NICHT ueber utils/apiFetch:
//   apiFetch setzt auf Native (Capacitor) automatisch den User-Bearer-Token.
//   Im Schueler-Pfad gibt es aber keinen User-Account — der Schueler hat
//   einen Participant-Token (classroom_participant.auth_token), der nichts mit der
//   App-Auth zu tun hat. Wuerde apiFetch den User-Bearer dazwischenfunken,
//   wuerde der Server das als ungueltigen Participant-Token zurueckweisen.
//
// CSRF: window.fetch ist global durch installCsrfFetch (main.jsx) gepatcht,
// state-changing requests bekommen ihren CSRF-Header automatisch — wir
// muessen hier nichts dafuer tun.

import { API } from '../../../config'

const BASE = `${API}/classroom`

function jsonHeaders(extra) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extra || {}),
  }
}

function bearer(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function readBody(res) {
  if (res.status === 204) return null
  try { return await res.json() } catch { return null }
}

export class KioskApiError extends Error {
  constructor(message, { status, code, payload } = {}) {
    super(message)
    this.name    = 'KioskApiError'
    this.status  = status ?? null
    this.code    = code ?? null
    this.payload = payload ?? null
  }
}

async function throwIfNotOk(res) {
  if (res.ok) return
  const body = await readBody(res)
  const msg  = body?.error || `HTTP ${res.status}`
  throw new KioskApiError(msg, { status: res.status, code: body?.code, payload: body })
}

// ── Public ────────────────────────────────────────────────────────────

export async function joinSession({ code, displayName }) {
  const res = await fetch(`${BASE}/join`, {
    method:  'POST',
    headers: jsonHeaders(),
    body:    JSON.stringify({ code, displayName: displayName || undefined }),
  })
  await throwIfNotOk(res)
  return readBody(res)
}

// ── Participant (Bearer) ──────────────────────────────────────────────

export async function fetchView(token) {
  const res = await fetch(`${BASE}/me/view`, { headers: bearer(token) })
  await throwIfNotOk(res)
  return readBody(res)
}

// Schritt 4 (C1): item-genaue Aufloesung der EIGENEN Abgabe. Der Server
// liefert vor der Freigabe { revealed:false } ohne Loesung (R1).
export async function fetchReveal(token) {
  const res = await fetch(`${BASE}/me/reveal`, { headers: bearer(token) })
  await throwIfNotOk(res)
  return readBody(res)
}

export async function submitAnswer(token, { assignmentId, lemmaId, roundIndex, rawAnswer, clientMs }) {
  const res = await fetch(`${BASE}/me/submit`, {
    method:  'POST',
    headers: jsonHeaders(bearer(token)),
    body: JSON.stringify({
      assignmentId,
      lemmaId,
      roundIndex: roundIndex ?? 0,
      rawAnswer:  rawAnswer  ?? {},
      ...(clientMs != null ? { clientMs } : {}),
    }),
  })
  await throwIfNotOk(res)
  return readBody(res)
}

export async function sendHeartbeat(token) {
  const res = await fetch(`${BASE}/me/heartbeat`, {
    method:  'POST',
    headers: jsonHeaders(bearer(token)),
    body:    '{}',
  })
  // Heartbeat-Fehler stillschweigend tolerieren — der Aufrufer entscheidet.
  if (!res.ok) {
    throw new KioskApiError(`Heartbeat HTTP ${res.status}`, { status: res.status })
  }
  return readBody(res)
}

export async function leaveSession(token) {
  const res = await fetch(`${BASE}/me/leave`, {
    method:  'POST',
    headers: jsonHeaders(bearer(token)),
    body:    '{}',
  })
  if (!res.ok && res.status !== 204) {
    throw new KioskApiError(`Leave HTTP ${res.status}`, { status: res.status })
  }
  return null
}

export default {
  joinSession,
  fetchView,
  fetchReveal,
  submitAnswer,
  sendHeartbeat,
  leaveSession,
  KioskApiError,
}
