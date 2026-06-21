/**
 * server/course/store.js
 *
 * Datenzugriff-Layer für den Premium-Kurs (course_* Tabellen, Migration 0017).
 * Siehe planning/Kurs-Tab-Planung.md §6 und planning/Kurs-Engine-Spec.md §10.
 *
 * Liest Stationen, Aufgaben-Items (F1–F5) und Material; verwaltet den
 * optionalen, kontobezogenen Solo-Fortschritt. KEIN Schüler-Tracking.
 *
 * JSON-Spalten (content_json | template_json | rubric_json | beamer_config_json)
 * werden hier geparst und nach camelCase gemappt. Prepared Statements werden
 * eager beim Import erstellt — die course_*-Tabellen existieren bereits, weil
 * db.js die SQL-Migrationen synchron beim Laden anwendet (migrate-sync.js).
 */

import db from '../db.js'
import logger from '../logger.js'

// Feste Sortier-Reihenfolgen (Differenzierung / Material-Ausspielungen).
const LEVEL_ORDER = ['DaZ', 'SekI', 'SekII', 'LK']
const KIND_ORDER  = ['beamer', 'arbeitsblatt', 'loesung', 'unterrichtsentwurf']

function parseJson(value, fallback = null) {
  if (value == null) return fallback
  try {
    return JSON.parse(value)
  } catch (err) {
    logger.warn({ err }, 'course/store: JSON-Parse fehlgeschlagen')
    return fallback
  }
}

// ── Prepared Statements ──────────────────────────────────────────────
const stmts = {
  listStations: db.prepare(`
    SELECT * FROM course_stations ORDER BY order_no
  `),
  getStation: db.prepare(`
    SELECT * FROM course_stations WHERE id = ?
  `),
  stationLevels: db.prepare(`
    SELECT DISTINCT level FROM course_tasks WHERE station_id = ?
  `),
  stationMaterialKinds: db.prepare(`
    SELECT DISTINCT kind FROM course_materials WHERE station_id = ?
  `),
  tasksByStation: db.prepare(`
    SELECT * FROM course_tasks WHERE station_id = ? ORDER BY level, position, id
  `),
  tasksByStationLevel: db.prepare(`
    SELECT * FROM course_tasks WHERE station_id = ? AND level = ? ORDER BY position, id
  `),
  materialsByStation: db.prepare(`
    SELECT * FROM course_materials WHERE station_id = ? ORDER BY kind, position, id
  `),
  getMaterial: db.prepare(`
    SELECT * FROM course_materials WHERE id = ?
  `),
  progressForUser: db.prepare(`
    SELECT station_id, status, updated_at FROM course_progress WHERE user_id = ?
  `),
  upsertProgress: db.prepare(`
    INSERT INTO course_progress (user_id, station_id, status, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, station_id) DO UPDATE SET
      status = excluded.status, updated_at = excluded.updated_at
  `),
  getProgressRow: db.prepare(`
    SELECT station_id, status, updated_at FROM course_progress
    WHERE user_id = ? AND station_id = ?
  `),
}

// ── Row-Mapper (snake_case → camelCase, JSON parsen) ─────────────────
function mapStation(r) {
  if (!r) return null
  return {
    id:           r.id,
    orderNo:      r.order_no,
    title:        r.title,
    ipa:          r.ipa ?? null,
    category:     r.category ?? null,
    beamerConfig: parseJson(r.beamer_config_json, {}),
  }
}

function mapTask(r) {
  return {
    id:        r.id,
    stationId: r.station_id,
    format:    r.format,
    level:     r.level,
    source:    r.source,
    kern:      r.kern ?? null,
    // Genau eines von content/template ist gesetzt (CHECK in Migration 0017).
    content:   parseJson(r.content_json, null),
    template:  parseJson(r.template_json, null),
    // rubric (solution + feedback) wird mitgeliefert: der Kurs ist das eigene
    // Selbstlern-Material des Premium-Nutzers — keine Anti-Cheat-Grenze wie im
    // Klassenraum (Engine-Spec §7: interaktive Auto-Bewertung + Selbstkontrolle).
    rubric:    parseJson(r.rubric_json, null),
    position:  r.position,
  }
}

function mapMaterial(r) {
  return {
    id:        r.id,
    stationId: r.station_id,
    kind:      r.kind,
    level:     r.level ?? null,
    title:     r.title ?? null,
    source:    r.source,
    fileRef:   r.file_ref ?? null,
    template:  parseJson(r.template_json, null),
    position:  r.position,
  }
}

function mapProgress(r) {
  return { stationId: r.station_id, status: r.status, updatedAt: r.updated_at }
}

function sortByOrder(values, order) {
  return [...values].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b)
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
  })
}

// ── Öffentliche API ──────────────────────────────────────────────────

/** Alle Stationen des Lernpfads, nach order_no. */
export function listStations() {
  return stmts.listStations.all().map(mapStation)
}

/** Einzelne Station oder null. */
export function getStation(id) {
  return mapStation(stmts.getStation.get(id))
}

/** Niveaustufen, für die diese Station Items hat (DaZ→LK sortiert). */
export function getStationLevels(stationId) {
  const levels = stmts.stationLevels.all(stationId).map(r => r.level)
  return sortByOrder(levels, LEVEL_ORDER)
}

/** Material-Arten, die diese Station hat (Beamer/AB/Lösung/Entwurf sortiert). */
export function getStationMaterialKinds(stationId) {
  const kinds = stmts.stationMaterialKinds.all(stationId).map(r => r.kind)
  return sortByOrder(kinds, KIND_ORDER)
}

/**
 * Aufgaben-Items einer Station, optional nach Niveau und/oder Format gefiltert.
 * Nutzt den (station_id, level)-Index, wenn level gesetzt ist.
 */
export function listTasks(stationId, { level, format } = {}) {
  const rows = level
    ? stmts.tasksByStationLevel.all(stationId, level)
    : stmts.tasksByStation.all(stationId)
  const tasks = rows.map(mapTask)
  return format ? tasks.filter(t => t.format === format) : tasks
}

/** Einzelnes Material (für Download-Lookup) oder null. */
export function getMaterial(id) {
  const row = stmts.getMaterial.get(id)
  return row ? mapMaterial(row) : null
}

/** Material einer Station, optional nach Niveau und/oder Art gefiltert. */
export function listMaterials(stationId, { level, kind } = {}) {
  let materials = stmts.materialsByStation.all(stationId).map(mapMaterial)
  if (kind)  materials = materials.filter(m => m.kind === kind)
  // level NULL = level-übergreifend (Beamer/Entwurf): bei Level-Filter
  // immer mit einschließen, sonst verschwänden übergreifende Materialien.
  if (level) materials = materials.filter(m => m.level === level || m.level == null)
  return materials
}

/** Solo-Fortschritt eines Nutzers über alle Stationen. */
export function getProgressForUser(userId) {
  return stmts.progressForUser.all(userId).map(mapProgress)
}

/** Fortschritt für (user, station) anlegen/aktualisieren; gibt die Zeile zurück. */
export function upsertProgress({ userId, stationId, status }) {
  stmts.upsertProgress.run(userId, stationId, status, Date.now())
  return mapProgress(stmts.getProgressRow.get(userId, stationId))
}
