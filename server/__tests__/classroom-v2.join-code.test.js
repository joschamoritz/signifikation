import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import db from '../db.js'
import { generateUniqueJoinCode } from '../classroom-v2/join-code.js'
import { randomUUID } from 'crypto'

const TEACHER_ID = `test-teacher-${randomUUID()}`

function ensureTeacher() {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test Teacher', ?, 0, ?, ?)
  `).run(TEACHER_ID, `${TEACHER_ID}@test.local`, now, now)
}

function insertSession({ code, status = 'lobby' }) {
  const id = randomUUID()
  db.prepare(`
    INSERT INTO cr2_session (id, code, teacher_user_id, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, code, TEACHER_ID, status, Date.now())
  return id
}

function cleanCr2Sessions() {
  db.prepare(`DELETE FROM cr2_session WHERE teacher_user_id = ?`).run(TEACHER_ID)
}

describe('generateUniqueJoinCode', () => {
  beforeAll(() => {
    ensureTeacher()
  })
  beforeEach(() => {
    cleanCr2Sessions()
  })

  it('liefert einen normalisierten Code aus der Default-Wortliste', () => {
    const code = generateUniqueJoinCode()
    expect(typeof code).toBe('string')
    expect(code).toMatch(/^[a-z]+-[a-z]+$/)
    expect(code).toBe(code.toLowerCase())
  })

  it('weicht aus, wenn der Default-Code aktiv vergeben ist', () => {
    let calls = 0
    const generator = () => {
      calls += 1
      return calls === 1 ? 'test-belegt' : 'test-frei'
    }
    insertSession({ code: 'test-belegt', status: 'lobby' })
    const code = generateUniqueJoinCode({ generate: generator })
    expect(code).toBe('test-frei')
    expect(calls).toBe(2)
  })

  it('darf einen Code wiederverwenden, dessen Session "finished" ist', () => {
    insertSession({ code: 'test-recycle', status: 'finished' })
    const code = generateUniqueJoinCode({ generate: () => 'test-recycle' })
    expect(code).toBe('test-recycle')
  })

  it('darf einen Code wiederverwenden, dessen Session "aborted" ist', () => {
    insertSession({ code: 'test-aborted', status: 'aborted' })
    const code = generateUniqueJoinCode({ generate: () => 'test-aborted' })
    expect(code).toBe('test-aborted')
  })

  it('wirft, wenn die maximale Anzahl Versuche ueberschritten wird', () => {
    insertSession({ code: 'test-immer', status: 'running' })
    expect(() => generateUniqueJoinCode({
      generate: () => 'test-immer',
      maxAttempts: 5,
    })).toThrow(/maximaler Anzahl/i)
  })

  it('haelt 40-Versuche-Budget ein', () => {
    let calls = 0
    const generator = () => {
      calls += 1
      return 'test-still-blocked'
    }
    insertSession({ code: 'test-still-blocked', status: 'lobby' })
    expect(() => generateUniqueJoinCode({ generate: generator })).toThrow()
    expect(calls).toBe(40)
  })

  it('normalisiert Whitespace und Grossschreibung des Kandidaten', () => {
    const code = generateUniqueJoinCode({ generate: () => ' Test Normal ' })
    expect(code).toBe('test-normal')
  })
})
