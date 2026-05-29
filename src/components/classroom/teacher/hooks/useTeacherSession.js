// T-4.8 — CRUD-Wrapper um die Teacher-Endpunkte aus Phase 2.
//
// Bewusst KEIN globaler Cache und KEIN Realtime-Hook hier drin: das hier ist
// reines Request/Response. Live-Updates uebernimmt useTeacherSocket; das
// Polling im LiveStep ist 3s-getriggert direkt aus der Komponente.

import { API } from '../../../../config'
import { apiFetch } from '../../../../utils/apiFetch'

const BASE = `${API}/classroom`

async function jsonOrThrow(res) {
  let body = null
  try { body = await res.json() } catch { /* leeres 204 z.B. */ }
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`)
    err.status = res.status
    err.payload = body
    throw err
  }
  return body
}

function jsonHeaders(extra) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extra || {}),
  }
}

// ── Sessions ───────────────────────────────────────────────────────

export async function listSessions({ limit = 20 } = {}) {
  const url = new URL(`${BASE}/sessions`, window.location.origin)
  if (limit) url.searchParams.set('limit', String(limit))
  const res = await apiFetch(url.pathname + url.search, { credentials: 'include' })
  return jsonOrThrow(res)
}

export async function createSession({ title, settings } = {}) {
  const res = await apiFetch(`${BASE}/sessions`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({ title: title || null, settings: settings || {} }),
  })
  return jsonOrThrow(res)
}

// ── Assignments ────────────────────────────────────────────────────

export async function addAssignment(sessionId, { mode, lemmaIds }) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/assignments`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({ mode, lemmaIds }),
  })
  return jsonOrThrow(res)
}

// W2-T2: mehrere (Modus + Lemmata)-Bloecke in Reihenfolge anlegen (atomar).
export async function addAssignments(sessionId, { blocks }) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/assignments/bulk`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({ blocks }),
  })
  return jsonOrThrow(res)
}

// W2-T2: auf das naechste Assignment vorruecken (oder Session beenden, wenn
// es das letzte war — { done: true }).
export async function nextAssignment(sessionId) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/next-assignment`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  })
  return jsonOrThrow(res)
}

// W2-T1: Schueleransicht-Vorschau. Holt fuer eine Modus+Lemma-Auswahl die
// gewhitelistete Schueler-Sicht, ohne eine Session/Assignment anzulegen.
export async function previewAssignment({ mode, lemmaIds }) {
  const res = await apiFetch(`${BASE}/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({ mode, lemmaIds }),
  })
  return jsonOrThrow(res)
}

export async function removeAssignment(sessionId, assignmentId) {
  const res = await apiFetch(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/assignments/${encodeURIComponent(assignmentId)}`,
    { method: 'DELETE', credentials: 'include' },
  )
  if (res.status === 204) return null
  return jsonOrThrow(res)
}

// ── Lebenszyklus ───────────────────────────────────────────────────

export async function startSession(sessionId) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/start`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  })
  return jsonOrThrow(res)
}

export async function finishSession(sessionId, { reason } = {}) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify(reason ? { reason } : {}),
  })
  return jsonOrThrow(res)
}

export async function pauseSession(sessionId) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/pause`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  })
  return jsonOrThrow(res)
}

export async function resumeSession(sessionId) {
  const res = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/resume`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  })
  return jsonOrThrow(res)
}

// ── Dashboard & Lemma-Picker ───────────────────────────────────────

export async function getDashboard(sessionId) {
  const res = await apiFetch(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/dashboard`,
    { credentials: 'include' },
  )
  return jsonOrThrow(res)
}

// W2-T4: pseudonymisierte Nachbereitung pro Modus/Lemma (nur fuer beendete
// Sessions). Liefert byLemma-Karten, trickiest (Top-3) und Totals.
export async function getSessionResults(sessionId) {
  const res = await apiFetch(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/results`,
    { credentials: 'include' },
  )
  return jsonOrThrow(res)
}

export async function searchLemmata({ q, pos, limit = 20 } = {}) {
  const url = new URL(`${BASE}/lemmata`, window.location.origin)
  if (q) url.searchParams.set('q', q)
  if (pos) url.searchParams.set('pos', pos)
  if (limit) url.searchParams.set('limit', String(limit))
  const res = await apiFetch(url.pathname + url.search, { credentials: 'include' })
  return jsonOrThrow(res)
}

// Default-Export-Bundle: erleichtert das Mocken in Tests.
export default {
  listSessions,
  createSession,
  addAssignment,
  addAssignments,
  nextAssignment,
  previewAssignment,
  removeAssignment,
  startSession,
  finishSession,
  pauseSession,
  resumeSession,
  getDashboard,
  getSessionResults,
  searchLemmata,
}
