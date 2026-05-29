/**
 * server/__tests__/classroom.schemas.test.js
 *
 * Unit-Tests fuer die Classroom Zod-Schemas (T-6.1).
 * Prueft Edge-Cases, Boundary-Werte und Sicherheits-Invarianten
 * direkt auf Schema-Ebene — ohne HTTP-Overhead.
 */

import { describe, it, expect } from 'vitest'
import {
  cr2CreateSessionSchema,
  cr2CreateAssignmentSchema,
  cr2LemmataQuerySchema,
  cr2JoinSchema,
  cr2SubmitSchema,
  cr2StartSessionSchema,
  cr2FinishSessionSchema,
  cr2ListSessionsQuerySchema,
} from '../middleware/validate.js'

// ── cr2CreateSessionSchema ────────────────────────────────────────

describe('cr2CreateSessionSchema', () => {
  it('akzeptiert leeres Objekt (title optional)', () => {
    expect(cr2CreateSessionSchema.safeParse({}).success).toBe(true)
  })

  it('akzeptiert validen Titel', () => {
    const r = cr2CreateSessionSchema.safeParse({ title: 'Deutschstunde 10b' })
    expect(r.success).toBe(true)
    expect(r.data.title).toBe('Deutschstunde 10b')
  })

  it('lehnt Titel > 120 Zeichen ab', () => {
    const r = cr2CreateSessionSchema.safeParse({ title: 'x'.repeat(121) })
    expect(r.success).toBe(false)
  })

  it('Titel genau 120 Zeichen ist valide', () => {
    expect(cr2CreateSessionSchema.safeParse({ title: 'x'.repeat(120) }).success).toBe(true)
  })

  it('settings default {} wenn nicht angegeben', () => {
    const r = cr2CreateSessionSchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data.settings).toEqual({})
  })
})

// ── cr2CreateAssignmentSchema ─────────────────────────────────────

describe('cr2CreateAssignmentSchema', () => {
  it('akzeptiert validen Modus mit 1 Lemma', () => {
    const r = cr2CreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: ['abc'] })
    expect(r.success).toBe(true)
  })

  it('akzeptiert alle 4 gueltigen Modi', () => {
    for (const mode of ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']) {
      expect(cr2CreateAssignmentSchema.safeParse({ mode, lemmaIds: ['x'] }).success).toBe(true)
    }
  })

  it('lehnt unbekannten Modus ab', () => {
    const r = cr2CreateAssignmentSchema.safeParse({ mode: 'hangman', lemmaIds: ['x'] })
    expect(r.success).toBe(false)
  })

  it('akzeptiert maximal 3 Lemmata (D3)', () => {
    const r = cr2CreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: ['a', 'b', 'c'] })
    expect(r.success).toBe(true)
  })

  it('lehnt 4 Lemmata ab (D3: max 3)', () => {
    const r = cr2CreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: ['a', 'b', 'c', 'd'] })
    expect(r.success).toBe(false)
    expect(r.error.errors[0].message).toMatch(/3/)
  })

  it('lehnt leeres lemmaIds-Array ab', () => {
    const r = cr2CreateAssignmentSchema.safeParse({ mode: 'kollokationen', lemmaIds: [] })
    expect(r.success).toBe(false)
  })

  it('lehnt LemmaId > 128 Zeichen ab', () => {
    const r = cr2CreateAssignmentSchema.safeParse({
      mode: 'kollokationen',
      lemmaIds: ['x'.repeat(129)],
    })
    expect(r.success).toBe(false)
  })

  it('lehnt leere LemmaId ("") ab', () => {
    const r = cr2CreateAssignmentSchema.safeParse({
      mode: 'kollokationen',
      lemmaIds: [''],
    })
    expect(r.success).toBe(false)
  })

  it('LemmaId genau 128 Zeichen ist valide', () => {
    const r = cr2CreateAssignmentSchema.safeParse({
      mode: 'kollokationen',
      lemmaIds: ['x'.repeat(128)],
    })
    expect(r.success).toBe(true)
  })
})

// ── cr2JoinSchema ─────────────────────────────────────────────────

describe('cr2JoinSchema', () => {
  it('akzeptiert validen Code ohne displayName', () => {
    const r = cr2JoinSchema.safeParse({ code: 'manuskript' })
    expect(r.success).toBe(true)
    expect(r.data.code).toBe('manuskript')
  })

  it('akzeptiert validen Code mit displayName', () => {
    const r = cr2JoinSchema.safeParse({ code: 'test-wort', displayName: 'Max M.' })
    expect(r.success).toBe(true)
    expect(r.data.displayName).toBe('Max M.')
  })

  it('normalisiert Code auf Kleinschreibung', () => {
    const r = cr2JoinSchema.safeParse({ code: 'MANUSKRIPT' })
    expect(r.success).toBe(true)
    expect(r.data.code).toBe('manuskript')
  })

  it('lehnt Code < 4 Zeichen ab', () => {
    const r = cr2JoinSchema.safeParse({ code: 'abc' })
    expect(r.success).toBe(false)
  })

  it('Code genau 4 Zeichen ist valide', () => {
    const r = cr2JoinSchema.safeParse({ code: 'wort' })
    expect(r.success).toBe(true)
  })

  it('lehnt Code > 30 Zeichen ab', () => {
    const r = cr2JoinSchema.safeParse({ code: 'a'.repeat(31) })
    expect(r.success).toBe(false)
  })

  it('Code genau 30 Zeichen ist valide', () => {
    const r = cr2JoinSchema.safeParse({ code: 'a'.repeat(30) })
    expect(r.success).toBe(true)
  })

  it('displayName > 20 Zeichen wird auf 20 gekürzt (max 20)', () => {
    // Zod .max(20) wirft Fehler, kein silentes Truncate
    const r = cr2JoinSchema.safeParse({ code: 'wort', displayName: 'x'.repeat(21) })
    expect(r.success).toBe(false)
  })

  it('displayName optional — fehlendes Feld ist valide', () => {
    const r = cr2JoinSchema.safeParse({ code: 'wort' })
    expect(r.success).toBe(true)
    expect(r.data.displayName).toBeUndefined()
  })
})

// ── cr2SubmitSchema ───────────────────────────────────────────────

describe('cr2SubmitSchema', () => {
  const validBase = {
    assignmentId: 'assign-1',
    lemmaId:      'lemma-1',
    rawAnswer:    { selected: ['stark'] },
  }

  it('akzeptiert valides Payload', () => {
    expect(cr2SubmitSchema.safeParse(validBase).success).toBe(true)
  })

  it('R6/D13: score-Feld darf nicht im Schema definiert sein', () => {
    const r = cr2SubmitSchema.safeParse({ ...validBase, score: 9999 })
    expect(r.success).toBe(true)
    // Zod mit default-Einstellung lässt unbekannte Keys durch, aber
    // score darf NICHT im geparsten Objekt erscheinen (Schema hat kein score)
    expect(r.data).not.toHaveProperty('score')
  })

  it('roundIndex default 0 wenn fehlt', () => {
    const r = cr2SubmitSchema.safeParse(validBase)
    expect(r.success).toBe(true)
    expect(r.data.roundIndex).toBe(0)
  })

  it('roundIndex 0 explizit gesetzt', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, roundIndex: 0 }).success).toBe(true)
  })

  it('roundIndex 99 (Obergrenze)', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, roundIndex: 99 }).success).toBe(true)
  })

  it('roundIndex 100 abgelehnt (max 99)', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, roundIndex: 100 }).success).toBe(false)
  })

  it('roundIndex -1 abgelehnt', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, roundIndex: -1 }).success).toBe(false)
  })

  it('fehlendes assignmentId abgelehnt', () => {
    const { assignmentId: _, ...rest } = validBase
    expect(cr2SubmitSchema.safeParse(rest).success).toBe(false)
  })

  it('fehlendes lemmaId abgelehnt', () => {
    const { lemmaId: _, ...rest } = validBase
    expect(cr2SubmitSchema.safeParse(rest).success).toBe(false)
  })

  it('rawAnswer default {} wenn fehlt', () => {
    const { rawAnswer: _, ...rest } = validBase
    const r = cr2SubmitSchema.safeParse(rest)
    expect(r.success).toBe(true)
    expect(r.data.rawAnswer).toEqual({})
  })

  it('leeres rawAnswer {} ist valide', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, rawAnswer: {} }).success).toBe(true)
  })

  it('clientMs 0 ist valide', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, clientMs: 0 }).success).toBe(true)
  })

  it('clientMs > 600000 abgelehnt', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, clientMs: 600_001 }).success).toBe(false)
  })

  it('clientMs negativ abgelehnt', () => {
    expect(cr2SubmitSchema.safeParse({ ...validBase, clientMs: -1 }).success).toBe(false)
  })
})

// ── cr2LemmataQuerySchema ─────────────────────────────────────────

describe('cr2LemmataQuerySchema', () => {
  it('leeres Query valide (alle optional)', () => {
    expect(cr2LemmataQuerySchema.safeParse({}).success).toBe(true)
  })

  it('limit coerced von String', () => {
    const r = cr2LemmataQuerySchema.safeParse({ limit: '10' })
    expect(r.success).toBe(true)
    expect(r.data.limit).toBe(10)
  })

  it('limit default 20', () => {
    const r = cr2LemmataQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data.limit).toBe(20)
  })

  it('limit > 50 abgelehnt', () => {
    expect(cr2LemmataQuerySchema.safeParse({ limit: '51' }).success).toBe(false)
  })

  it('limit 50 valide', () => {
    expect(cr2LemmataQuerySchema.safeParse({ limit: '50' }).success).toBe(true)
  })

  it('ungültiger pos-Wert abgelehnt', () => {
    expect(cr2LemmataQuerySchema.safeParse({ pos: 'Artikel' }).success).toBe(false)
  })

  it('ungültiger mode-Wert abgelehnt', () => {
    expect(cr2LemmataQuerySchema.safeParse({ mode: 'hangman' }).success).toBe(false)
  })

  it('valider mode kollokationen', () => {
    expect(cr2LemmataQuerySchema.safeParse({ mode: 'kollokationen' }).success).toBe(true)
  })
})

// ── cr2ListSessionsQuerySchema ────────────────────────────────────

describe('cr2ListSessionsQuerySchema', () => {
  it('leeres Query valide', () => {
    expect(cr2ListSessionsQuerySchema.safeParse({}).success).toBe(true)
  })

  it('limit default 20', () => {
    const r = cr2ListSessionsQuerySchema.safeParse({})
    expect(r.data.limit).toBe(20)
  })

  it('limit coerced von String "5"', () => {
    const r = cr2ListSessionsQuerySchema.safeParse({ limit: '5' })
    expect(r.success).toBe(true)
    expect(r.data.limit).toBe(5)
  })

  it('limit > 50 abgelehnt', () => {
    expect(cr2ListSessionsQuerySchema.safeParse({ limit: '51' }).success).toBe(false)
  })
})

// ── cr2StartSessionSchema + cr2FinishSessionSchema ────────────────

describe('cr2StartSessionSchema', () => {
  it('leeres Objekt valide (allowLateJoin default true)', () => {
    const r = cr2StartSessionSchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data.allowLateJoin).toBe(true)
  })

  it('allowLateJoin false setzbar', () => {
    const r = cr2StartSessionSchema.safeParse({ allowLateJoin: false })
    expect(r.success).toBe(true)
    expect(r.data.allowLateJoin).toBe(false)
  })
})

describe('cr2FinishSessionSchema', () => {
  it('leeres Objekt valide (reason optional)', () => {
    expect(cr2FinishSessionSchema.safeParse({}).success).toBe(true)
  })

  it('reason > 120 Zeichen abgelehnt', () => {
    expect(cr2FinishSessionSchema.safeParse({ reason: 'x'.repeat(121) }).success).toBe(false)
  })

  it('reason genau 120 Zeichen valide', () => {
    expect(cr2FinishSessionSchema.safeParse({ reason: 'x'.repeat(120) }).success).toBe(true)
  })
})
