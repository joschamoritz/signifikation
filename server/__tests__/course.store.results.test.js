/**
 * server/__tests__/course.store.results.test.js
 *
 * Unit-Tests für die Aufgaben-Persistenz im Kurs-Store (course_task_result,
 * Migration 0018): recordTaskResult (Versuche/bestes Resultat, Auto-Status),
 * getResultsForUser, getCourseSummary, resetCourseProgress.
 *
 * Echter SQLite (keine Mocks), eigene Test-Station mit hoher order_no.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import db from '../db.js'
import {
  recordTaskResult,
  getResultsForUser,
  getCourseSummary,
  resetCourseProgress,
  getProgressForUser,
} from '../course/store.js'

const PREFIX = `tstore-${randomUUID().slice(0, 8)}`
const USER = `${PREFIX}-user`
const STATION = `${PREFIX}-s1`

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function insertStation(id, orderNo) {
  db.prepare(`
    INSERT OR REPLACE INTO course_stations (id, order_no, title, beamer_config_json, created_at)
    VALUES (?, ?, 'Store-Test', '{}', ?)
  `).run(id, orderNo, Date.now())
}

function insertTask(id, { level, format = 'F1' }) {
  db.prepare(`
    INSERT OR REPLACE INTO course_tasks
      (id, station_id, format, level, source, content_json, rubric_json, position, created_at)
    VALUES (?, ?, ?, ?, 'static', '{}', '{}', 0, ?)
  `).run(id, STATION, format, level, Date.now())
}

describe('course/store – Aufgaben-Ergebnisse', () => {
  const T1 = `${STATION}-t1` // DaZ
  const T2 = `${STATION}-t2` // DaZ
  const T3 = `${STATION}-t3` // SekI

  beforeAll(() => {
    ensureUser(USER)
    insertStation(STATION, 8501)
    insertTask(T1, { level: 'DaZ' })
    insertTask(T2, { level: 'DaZ' })
    insertTask(T3, { level: 'SekI' })
  })

  afterAll(() => {
    // Station-Delete kaskadiert auf tasks/results/progress.
    db.prepare(`DELETE FROM course_stations WHERE id LIKE '${PREFIX}%'`).run()
    db.prepare('DELETE FROM "user" WHERE id = ?').run(USER)
  })

  it('record: erste richtige Abgabe → correct true, attempts 1', () => {
    const r = recordTaskResult({ userId: USER, stationId: STATION, taskId: T1, level: 'DaZ', correct: true })
    expect(r).toMatchObject({ taskId: T1, correct: true, attempts: 1 })
  })

  it('record: mehrfache Abgabe zählt attempts hoch (Sperre ist clientseitig)', () => {
    let r
    for (let i = 1; i <= 5; i++) {
      r = recordTaskResult({ userId: USER, stationId: STATION, taskId: T2, level: 'DaZ', correct: false })
      expect(r.attempts).toBe(i)
      expect(r.correct).toBe(false)
    }
  })

  it('record: richtig nach falsch hält das beste Resultat', () => {
    recordTaskResult({ userId: USER, stationId: STATION, taskId: T3, level: 'SekI', correct: false })
    const r = recordTaskResult({ userId: USER, stationId: STATION, taskId: T3, level: 'SekI', correct: true })
    expect(r).toMatchObject({ correct: true, attempts: 2 })
    // Erneut falsch macht es nicht wieder falsch.
    const r2 = recordTaskResult({ userId: USER, stationId: STATION, taskId: T3, level: 'SekI', correct: false })
    expect(r2.correct).toBe(true)
  })

  it('record: Selbstkontrolle (null) → correct null', () => {
    // T1 ist schon belegt → eigene Aufgabe in eigener Station, um null zu testen.
    const sid = `${PREFIX}-s2`
    insertStation(sid, 8502)
    db.prepare(`
      INSERT OR REPLACE INTO course_tasks (id, station_id, format, level, source, content_json, rubric_json, position, created_at)
      VALUES (?, ?, 'F5', 'DaZ', 'static', '{}', '{}', 0, ?)
    `).run(`${sid}-t`, sid, Date.now())
    const r = recordTaskResult({ userId: USER, stationId: sid, taskId: `${sid}-t`, level: 'DaZ', correct: null })
    expect(r).toMatchObject({ correct: null, attempts: 1 })
  })

  it('Auto-Stationsstatus: in-progress, solange nicht alle gelöst', () => {
    // Isolierte Station mit zwei Aufgaben: nur eine gelöst → in-progress.
    const sid = `${PREFIX}-s4`
    insertStation(sid, 8504)
    db.prepare(`
      INSERT OR REPLACE INTO course_tasks (id, station_id, format, level, source, content_json, rubric_json, position, created_at)
      VALUES (?, ?, 'F1', 'DaZ', 'static', '{}', '{}', 0, ?)
    `).run(`${sid}-a`, sid, Date.now())
    db.prepare(`
      INSERT OR REPLACE INTO course_tasks (id, station_id, format, level, source, content_json, rubric_json, position, created_at)
      VALUES (?, ?, 'F1', 'DaZ', 'static', '{}', '{}', 1, ?)
    `).run(`${sid}-b`, sid, Date.now())
    recordTaskResult({ userId: USER, stationId: sid, taskId: `${sid}-a`, level: 'DaZ', correct: true })
    const prog = getProgressForUser(USER).find(p => p.stationId === sid)
    expect(prog.status).toBe('in-progress')
  })

  it('Auto-Stationsstatus: done, sobald alle Aufgaben der Stufe gelöst sind', () => {
    // Isolierte Station mit nur einer Aufgabe → ein Treffer reicht für done.
    const sid = `${PREFIX}-s3`
    insertStation(sid, 8503)
    db.prepare(`
      INSERT OR REPLACE INTO course_tasks (id, station_id, format, level, source, content_json, rubric_json, position, created_at)
      VALUES (?, ?, 'F1', 'DaZ', 'static', '{}', '{}', 0, ?)
    `).run(`${sid}-t`, sid, Date.now())
    recordTaskResult({ userId: USER, stationId: sid, taskId: `${sid}-t`, level: 'DaZ', correct: true })
    const prog = getProgressForUser(USER).find(p => p.stationId === sid)
    expect(prog.status).toBe('done')
  })

  it('getResultsForUser: Filter auf Station', () => {
    const all = getResultsForUser(USER)
    const onlyS1 = getResultsForUser(USER, STATION)
    expect(onlyS1.every(r => r.stationId === STATION)).toBe(true)
    expect(all.length).toBeGreaterThan(onlyS1.length) // s2 (null-Test) ist dabei
  })

  it('getCourseSummary: total/solved je (Station, Niveau)', () => {
    const summary = getCourseSummary(USER)
    const daz = summary.find(s => s.stationId === STATION && s.level === 'DaZ')
    expect(daz).toMatchObject({ total: 2, solved: 1, attempted: 2 }) // T1 gelöst, T2 nur falsch
    const sek1 = summary.find(s => s.stationId === STATION && s.level === 'SekI')
    expect(sek1).toMatchObject({ total: 1, solved: 1 })
  })

  it('resetCourseProgress: Station gezielt zurücksetzen', () => {
    const removed = resetCourseProgress({ userId: USER, stationId: STATION })
    expect(removed).toBeGreaterThan(0)
    expect(getResultsForUser(USER, STATION)).toEqual([])
    // Andere Station bleibt.
    expect(getResultsForUser(USER, `${PREFIX}-s2`)).toHaveLength(1)
  })

  it('resetCourseProgress: alles zurücksetzen', () => {
    resetCourseProgress({ userId: USER })
    expect(getResultsForUser(USER)).toEqual([])
    expect(getProgressForUser(USER)).toEqual([])
  })
})
