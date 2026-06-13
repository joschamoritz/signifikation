/**
 * server/__tests__/classroom.schemas.test.js
 *
 * Unit-Tests fuer die Classroom Zod-Schemas (T-6.1).
 * Prueft Edge-Cases, Boundary-Werte und Sicherheits-Invarianten
 * direkt auf Schema-Ebene — ohne HTTP-Overhead.
 */

import { describe, it, expect } from 'vitest'
import {
  classroomCreateSessionSchema,
  classroomCreateAssignmentSchema,
  classroomLemmataQuerySchema,
  classroomJoinSchema,
  classroomSubmitSchema,
  classroomStartSessionSchema,
  classroomFinishSessionSchema,
  classroomListSessionsQuerySchema,
} from '../middleware/validate.js'

// ── classroomCreateSessionSchema ────────────────────────────────────────

describe('classroomCreateSessionSchema', () => {
  it('akzeptiert leeres Objekt (title optional)', () => {
    expect(classroomCreateSessionSchema.safeParse({}).success).toBe(true)
  })

  it('akzeptiert validen Titel', () => {
    const r = classroomCreateSessionSchema.safeParse({ title: 'Deutschstunde 10b' })
    expect(r.success).toBe(true)
    expect(r.data.title).toBe('Deutschstunde 10b')
  })

  it('lehnt Titel > 120 Zeichen ab', () => {
    const r = classroomCreateSessionSchema.safeParse({ title: 'x'.repeat(121) })
    expect(r.success).toBe(false)
  })

  it('Titel genau 120 Zeichen ist valide', () => {
    expect(classroomCreateSessionSchema.safeParse({ title: 'x'.repeat(120) }).success).toBe(true)
  })

  it('settings default {} wenn nicht angegeben', () => {
    const r = classroomCreateSessionSchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data.settings).toEqual({})
  })
})

// ── classroomCreateAssignmentSchema ─────────────────────────────────────

describe('classroomCreateAssignmentSchema', () => {
  it('akzeptiert validen Modus mit 1 Lemma', () => {
    const r = classroomCreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: ['abc'] })
    expect(r.success).toBe(true)
  })

  it('akzeptiert alle 4 gueltigen Modi', () => {
    for (const mode of ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']) {
      expect(classroomCreateAssignmentSchema.safeParse({ mode, lemmaIds: ['x'] }).success).toBe(true)
    }
  })

  it('lehnt unbekannten Modus ab', () => {
    const r = classroomCreateAssignmentSchema.safeParse({ mode: 'hangman', lemmaIds: ['x'] })
    expect(r.success).toBe(false)
  })

  it('akzeptiert maximal 3 Lemmata (D3)', () => {
    const r = classroomCreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: ['a', 'b', 'c'] })
    expect(r.success).toBe(true)
  })

  it('lehnt 4 Lemmata ab (D3: max 3)', () => {
    const r = classroomCreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: ['a', 'b', 'c', 'd'] })
    expect(r.success).toBe(false)
    expect(r.error.errors[0].message).toMatch(/3/)
  })

  it('lehnt leeres lemmaIds-Array ab', () => {
    const r = classroomCreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: [] })
    expect(r.success).toBe(false)
  })

  it('lehnt LemmaId > 128 Zeichen ab', () => {
    const r = classroomCreateAssignmentSchema.safeParse({
      mode: 'kollokationen',
      lemmaIds: ['x'.repeat(129)],
    })
    expect(r.success).toBe(false)
  })

  it('lehnt leere LemmaId ("") ab', () => {
    const r = classroomCreateAssignmentSchema.safeParse({
      mode: 'kollokationen',
      lemmaIds: [''],
    })
    expect(r.success).toBe(false)
  })

  it('LemmaId genau 128 Zeichen ist valide', () => {
    const r = classroomCreateAssignmentSchema.safeParse({
      mode: 'kollokationen',
      lemmaIds: ['x'.repeat(128)],
    })
    expect(r.success).toBe(true)
  })
})

// ── classroomJoinSchema ─────────────────────────────────────────────────

describe('classroomJoinSchema', () => {
  it('akzeptiert validen Code ohne displayName', () => {
    const r = classroomJoinSchema.safeParse({ code: 'manuskript' })
    expect(r.success).toBe(true)
    expect(r.data.code).toBe('manuskript')
  })

  it('akzeptiert validen Code mit displayName', () => {
    const r = classroomJoinSchema.safeParse({ code: 'test-wort', displayName: 'Max M.' })
    expect(r.success).toBe(true)
    expect(r.data.displayName).toBe('Max M.')
  })

  it('normalisiert Code auf Kleinschreibung', () => {
    const r = classroomJoinSchema.safeParse({ code: 'MANUSKRIPT' })
    expect(r.success).toBe(true)
    expect(r.data.code).toBe('manuskript')
  })

  it('lehnt Code < 4 Zeichen ab', () => {
    const r = classroomJoinSchema.safeParse({ code: 'abc' })
    expect(r.success).toBe(false)
  })

  it('Code genau 4 Zeichen ist valide', () => {
    const r = classroomJoinSchema.safeParse({ code: 'wort' })
    expect(r.success).toBe(true)
  })

  it('lehnt Code > 30 Zeichen ab', () => {
    const r = classroomJoinSchema.safeParse({ code: 'a'.repeat(31) })
    expect(r.success).toBe(false)
  })

  it('Code genau 30 Zeichen ist valide', () => {
    const r = classroomJoinSchema.safeParse({ code: 'a'.repeat(30) })
    expect(r.success).toBe(true)
  })

  it('displayName > 20 Zeichen wird auf 20 gekürzt (max 20)', () => {
    // Zod .max(20) wirft Fehler, kein silentes Truncate
    const r = classroomJoinSchema.safeParse({ code: 'wort', displayName: 'x'.repeat(21) })
    expect(r.success).toBe(false)
  })

  it('displayName optional — fehlendes Feld ist valide', () => {
    const r = classroomJoinSchema.safeParse({ code: 'wort' })
    expect(r.success).toBe(true)
    expect(r.data.displayName).toBeUndefined()
  })
})

// ── classroomSubmitSchema ───────────────────────────────────────────────

describe('classroomSubmitSchema', () => {
  const validBase = {
    assignmentId: 'assign-1',
    lemmaId:      'lemma-1',
    rawAnswer:    { selected: ['stark'] },
  }

  it('akzeptiert valides Payload', () => {
    expect(classroomSubmitSchema.safeParse(validBase).success).toBe(true)
  })

  it('R6/D13: score-Feld darf nicht im Schema definiert sein', () => {
    const r = classroomSubmitSchema.safeParse({ ...validBase, score: 9999 })
    expect(r.success).toBe(true)
    // Zod mit default-Einstellung lässt unbekannte Keys durch, aber
    // score darf NICHT im geparsten Objekt erscheinen (Schema hat kein score)
    expect(r.data).not.toHaveProperty('score')
  })

  it('roundIndex default 0 wenn fehlt', () => {
    const r = classroomSubmitSchema.safeParse(validBase)
    expect(r.success).toBe(true)
    expect(r.data.roundIndex).toBe(0)
  })

  it('roundIndex 0 explizit gesetzt', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, roundIndex: 0 }).success).toBe(true)
  })

  it('roundIndex 99 (Obergrenze)', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, roundIndex: 99 }).success).toBe(true)
  })

  it('roundIndex 100 abgelehnt (max 99)', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, roundIndex: 100 }).success).toBe(false)
  })

  it('roundIndex -1 abgelehnt', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, roundIndex: -1 }).success).toBe(false)
  })

  it('fehlendes assignmentId abgelehnt', () => {
    const { assignmentId: _, ...rest } = validBase
    expect(classroomSubmitSchema.safeParse(rest).success).toBe(false)
  })

  it('fehlendes lemmaId abgelehnt', () => {
    const { lemmaId: _, ...rest } = validBase
    expect(classroomSubmitSchema.safeParse(rest).success).toBe(false)
  })

  it('rawAnswer default {} wenn fehlt', () => {
    const { rawAnswer: _, ...rest } = validBase
    const r = classroomSubmitSchema.safeParse(rest)
    expect(r.success).toBe(true)
    expect(r.data.rawAnswer).toEqual({})
  })

  it('leeres rawAnswer {} ist valide', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, rawAnswer: {} }).success).toBe(true)
  })

  it('clientMs 0 ist valide', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, clientMs: 0 }).success).toBe(true)
  })

  it('clientMs > 600000 abgelehnt', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, clientMs: 600_001 }).success).toBe(false)
  })

  it('clientMs negativ abgelehnt', () => {
    expect(classroomSubmitSchema.safeParse({ ...validBase, clientMs: -1 }).success).toBe(false)
  })
})

// ── classroomLemmataQuerySchema ─────────────────────────────────────────

describe('classroomLemmataQuerySchema', () => {
  it('leeres Query valide (alle optional)', () => {
    expect(classroomLemmataQuerySchema.safeParse({}).success).toBe(true)
  })

  it('limit coerced von String', () => {
    const r = classroomLemmataQuerySchema.safeParse({ limit: '10' })
    expect(r.success).toBe(true)
    expect(r.data.limit).toBe(10)
  })

  it('limit default 20', () => {
    const r = classroomLemmataQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data.limit).toBe(20)
  })

  it('limit > 50 abgelehnt', () => {
    expect(classroomLemmataQuerySchema.safeParse({ limit: '51' }).success).toBe(false)
  })

  it('limit 50 valide', () => {
    expect(classroomLemmataQuerySchema.safeParse({ limit: '50' }).success).toBe(true)
  })

  it('ungültiger pos-Wert abgelehnt', () => {
    expect(classroomLemmataQuerySchema.safeParse({ pos: 'Artikel' }).success).toBe(false)
  })

  it('ungültiger mode-Wert abgelehnt', () => {
    expect(classroomLemmataQuerySchema.safeParse({ mode: 'hangman' }).success).toBe(false)
  })

  it('valider mode kollokationen', () => {
    expect(classroomLemmataQuerySchema.safeParse({ mode: 'kollokationen' }).success).toBe(true)
  })
})

// ── classroomListSessionsQuerySchema ────────────────────────────────────

describe('classroomListSessionsQuerySchema', () => {
  it('leeres Query valide', () => {
    expect(classroomListSessionsQuerySchema.safeParse({}).success).toBe(true)
  })

  it('limit default 20', () => {
    const r = classroomListSessionsQuerySchema.safeParse({})
    expect(r.data.limit).toBe(20)
  })

  it('limit coerced von String "5"', () => {
    const r = classroomListSessionsQuerySchema.safeParse({ limit: '5' })
    expect(r.success).toBe(true)
    expect(r.data.limit).toBe(5)
  })

  it('limit > 50 abgelehnt', () => {
    expect(classroomListSessionsQuerySchema.safeParse({ limit: '51' }).success).toBe(false)
  })
})

// ── classroomStartSessionSchema + classroomFinishSessionSchema ────────────────

describe('classroomStartSessionSchema', () => {
  it('leeres Objekt valide (allowLateJoin default true)', () => {
    const r = classroomStartSessionSchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data.allowLateJoin).toBe(true)
  })

  it('allowLateJoin false setzbar', () => {
    const r = classroomStartSessionSchema.safeParse({ allowLateJoin: false })
    expect(r.success).toBe(true)
    expect(r.data.allowLateJoin).toBe(false)
  })
})

describe('classroomFinishSessionSchema', () => {
  it('leeres Objekt valide (reason optional)', () => {
    expect(classroomFinishSessionSchema.safeParse({}).success).toBe(true)
  })

  it('reason > 120 Zeichen abgelehnt', () => {
    expect(classroomFinishSessionSchema.safeParse({ reason: 'x'.repeat(121) }).success).toBe(false)
  })

  it('reason genau 120 Zeichen valide', () => {
    expect(classroomFinishSessionSchema.safeParse({ reason: 'x'.repeat(120) }).success).toBe(true)
  })
})
