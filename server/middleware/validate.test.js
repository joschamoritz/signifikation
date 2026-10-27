/**
 * Tests für Zod-Validierungs-Schemas (validate.js)
 */

import { describe, it, expect } from 'vitest'
import { berlinTag, plusTage } from '../date-utils.js'
import {
  validate,
  statsSchema,
  belegeQuerySchema,
  archivQuerySchema,
  qQuerySchema,
  adminTagSchema,
  adminUsersBulkUpdateSchema,
  adminBulkDeleteCalendarSchema,
  analyzeKollQuerySchema,
  adminPreviewLemmaSchema,
} from './validate.js'

// ── validate()-Middleware ────────────────────────────────────
describe('validate() middleware', () => {
  function runMiddleware(schema, source, input) {
    const req = { [source]: input }
    let statusCode = null
    let jsonBody = null
    const res = {
      status(code) { statusCode = code; return this },
      json(body) { jsonBody = body; return this },
    }
    let nextCalled = false
    validate(schema, source)(req, res, () => { nextCalled = true })
    return { req, statusCode, jsonBody, nextCalled }
  }

  it('entfernt nicht-deklarierte Query-Params von req.query (Ersetzen statt Mergen)', () => {
    const { req, nextCalled } = runMiddleware(qQuerySchema, 'query', {
      q: 'Wasser',
      evil: 'nicht-deklariert',
    })
    expect(nextCalled).toBe(true)
    expect(req.query.q).toBe('Wasser')
    expect('evil' in req.query).toBe(false)
  })

  it('behält validierte Werte und antwortet 400 bei ungültiger Eingabe', () => {
    const { statusCode, jsonBody, nextCalled } = runMiddleware(qQuerySchema, 'query', {})
    expect(nextCalled).toBe(false)
    expect(statusCode).toBe(400)
    expect(jsonBody.error).toBeTruthy()
  })
})

// ── statsSchema ──────────────────────────────────────────────
describe('statsSchema', () => {
  const valid = { game: 'kollokationen', datum: berlinTag(), score: 8, max: 10 }

  it('akzeptiert gültige Eingabe', () => {
    expect(statsSchema.safeParse(valid).success).toBe(true)
  })

  it('lehnt ungültiges game ab', () => {
    expect(statsSchema.safeParse({ ...valid, game: 'unbekannt' }).success).toBe(false)
  })

  it('akzeptiert alle gültigen games', () => {
    for (const game of ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']) {
      expect(statsSchema.safeParse({ ...valid, game }).success).toBe(true)
    }
  })

  it('akzeptiert die Schlüssel für Spiele zum Wort der Woche, aber keine erfundenen', () => {
    for (const game of ['woche_wortzwilling', 'woche_zeitenwende', 'woche_lueckenfueller']) {
      expect(statsSchema.safeParse({ ...valid, game }).success).toBe(true)
    }
    // Kollokationen gibt es zum Wort der Woche nicht
    expect(statsSchema.safeParse({ ...valid, game: 'woche_kollokationen' }).success).toBe(false)
    expect(statsSchema.safeParse({ ...valid, game: 'woche_' }).success).toBe(false)
  })

  it('lehnt score > max ab (sonst hebt ein manipulierter Aufruf den Durchschnitt über 10)', () => {
    expect(statsSchema.safeParse({ ...valid, score: 100, max: 1 }).success).toBe(false)
    expect(statsSchema.safeParse({ ...valid, score: 11, max: 10 }).success).toBe(false)
    expect(statsSchema.safeParse({ ...valid, score: 10, max: 10 }).success).toBe(true)
    expect(statsSchema.safeParse({ ...valid, score: 0, max: 10 }).success).toBe(true)
  })

  it('nimmt nur Tage ab dem Montag dieser Woche bzw. gestern bis morgen an (Berliner Zeit)', () => {
    const heute = berlinTag()
    // Montag der laufenden Woche: ältere App-Versionen melden das Wort der Woche dorthin
    const montag = plusTage(heute, -((new Date(`${heute}T00:00:00Z`).getUTCDay() + 6) % 7))
    for (const datum of [montag, plusTage(heute, -1), heute, plusTage(heute, 1)]) {
      expect(statsSchema.safeParse({ ...valid, datum }).success, datum).toBe(true)
    }
    const davor = montag < plusTage(heute, -1) ? plusTage(montag, -1) : plusTage(heute, -2)
    for (const datum of [davor, plusTage(heute, -8), plusTage(heute, 2), '2099-01-15', '2001-01-01']) {
      const r = statsSchema.safeParse({ ...valid, datum })
      expect(r.success, datum).toBe(false)
      expect(r.error.errors[0].message).toBe('datum muss zwischen dem Montag dieser Woche bzw. gestern und morgen liegen')
    }
  })

  it('lehnt Tage ab, die es nicht gibt', () => {
    for (const datum of ['2026-02-31', '2026-13-01', '2026-00-10', '0000-01-01']) {
      const r = statsSchema.safeParse({ ...valid, datum })
      expect(r.success, datum).toBe(false)
      expect(r.error.errors[0].message).toBe('datum ist kein gültiger Kalendertag')
    }
  })

  it('lehnt ungültiges datum-Format ab', () => {
    expect(statsSchema.safeParse({ ...valid, datum: '03-15' }).success).toBe(false)
    expect(statsSchema.safeParse({ ...valid, datum: '3-15' }).success).toBe(false)
  })

  it('lehnt negativen score ab', () => {
    expect(statsSchema.safeParse({ ...valid, score: -1 }).success).toBe(false)
  })

  it('lehnt score > 100 ab', () => {
    expect(statsSchema.safeParse({ ...valid, score: 101 }).success).toBe(false)
  })

  it('lehnt max = 0 ab', () => {
    expect(statsSchema.safeParse({ ...valid, max: 0 }).success).toBe(false)
  })

  it('lehnt fehlende Felder ab', () => {
    expect(statsSchema.safeParse({}).success).toBe(false)
    expect(statsSchema.safeParse({ game: 'kollokationen' }).success).toBe(false)
  })
})


// ── belegeQuerySchema ────────────────────────────────────────
describe('belegeQuerySchema', () => {
  const valid = { lemma: 'Wasser', collocate: 'trinken' }

  it('akzeptiert gültige Eingabe', () => {
    expect(belegeQuerySchema.safeParse(valid).success).toBe(true)
  })

  it('akzeptiert Umlaute', () => {
    expect(belegeQuerySchema.safeParse({ lemma: 'Größe', collocate: 'ähnlich' }).success).toBe(true)
  })

  it('lehnt Leerzeichen im lemma ab', () => {
    expect(belegeQuerySchema.safeParse({ ...valid, lemma: 'zwei Wörter' }).success).toBe(false)
  })

  it('lehnt SQL-ähnliche Zeichen ab', () => {
    expect(belegeQuerySchema.safeParse({ ...valid, lemma: "drop'; table" }).success).toBe(false)
  })

  it('lehnt zu langes lemma (> 100) ab', () => {
    expect(belegeQuerySchema.safeParse({ ...valid, lemma: 'a'.repeat(101) }).success).toBe(false)
  })

  it('year muss 4-stellig sein', () => {
    expect(belegeQuerySchema.safeParse({ ...valid, year: '99' }).success).toBe(false)
    expect(belegeQuerySchema.safeParse({ ...valid, year: '2000' }).success).toBe(true)
  })
})

// ── archivQuerySchema ────────────────────────────────────────
describe('archivQuerySchema', () => {
  it('akzeptiert YYYY-MM-DD', () => {
    expect(archivQuerySchema.safeParse({ date: '2024-03-15' }).success).toBe(true)
  })

  it('lehnt MM-DD ohne Jahr ab', () => {
    expect(archivQuerySchema.safeParse({ date: '03-15' }).success).toBe(false)
  })

  it('lehnt fehlendes date ab', () => {
    expect(archivQuerySchema.safeParse({}).success).toBe(false)
  })
})

// ── qQuerySchema ─────────────────────────────────────────────
describe('qQuerySchema', () => {
  it('akzeptiert nicht-leeren String', () => {
    expect(qQuerySchema.safeParse({ q: 'Wasser' }).success).toBe(true)
  })

  it('lehnt leeren String ab', () => {
    expect(qQuerySchema.safeParse({ q: '' }).success).toBe(false)
  })

  it('lehnt fehlendes q ab', () => {
    expect(qQuerySchema.safeParse({}).success).toBe(false)
  })
})

// ── adminTagSchema ───────────────────────────────────────────
describe('adminTagSchema', () => {
  const valid = {
    datum: '2026-03-15',
    woerter: ['wandern', 'heilig', 'grün'],
    zwilling_pos: 'Substantiv',
  }

  it('akzeptiert minimale gültige Eingabe', () => {
    expect(adminTagSchema.safeParse(valid).success).toBe(true)
  })

  it('woerter müssen genau 3 sein', () => {
    expect(adminTagSchema.safeParse({ ...valid, woerter: ['nur-zwei', 'einträge'] }).success).toBe(false)
    expect(adminTagSchema.safeParse({ ...valid, woerter: ['eins', 'zwei', 'drei', 'vier'] }).success).toBe(false)
  })

  it('woerter dürfen nicht länger als 100 Zeichen sein', () => {
    expect(adminTagSchema.safeParse({
      ...valid,
      woerter: ['a'.repeat(101), 'b', 'c'],
    }).success).toBe(false)
  })

  it('notizen-Einträge dürfen nicht länger als 500 Zeichen sein', () => {
    expect(adminTagSchema.safeParse({
      ...valid,
      notizen: ['x'.repeat(501)],
    }).success).toBe(false)
  })

  it('definitionen-Einträge dürfen nicht länger als 2000 Zeichen sein', () => {
    expect(adminTagSchema.safeParse({
      ...valid,
      definitionen: ['x'.repeat(2001)],
    }).success).toBe(false)
  })

  it('pos muss Enum-Wert sein', () => {
    expect(adminTagSchema.safeParse({ ...valid, zwilling_pos: 'Adverb' }).success).toBe(false)
  })
})

// ── Phase-5 Schemas ─────────────────────────────────────────
describe('adminBulkDeleteCalendarSchema', () => {
  it('akzeptiert gueltige Datumsliste', () => {
    expect(adminBulkDeleteCalendarSchema.safeParse({ dates: ['2026-03-15', '2026-03-16'] }).success).toBe(true)
  })

  it('lehnt leere Listen ab', () => {
    expect(adminBulkDeleteCalendarSchema.safeParse({ dates: [] }).success).toBe(false)
  })

  it('lehnt ungueltige Datumswerte ab', () => {
    expect(adminBulkDeleteCalendarSchema.safeParse({ dates: ['03-15'] }).success).toBe(false)
  })
})

describe('adminPreviewLemmaSchema', () => {
  it('akzeptiert lemma mit optionaler wortart', () => {
    expect(adminPreviewLemmaSchema.safeParse({ lemma: 'haus', pos: 'Substantiv' }).success).toBe(true)
  })

  it('setzt Default-Wortart auf Substantiv', () => {
    const parsed = adminPreviewLemmaSchema.parse({ lemma: 'laufen' })
    expect(parsed.pos).toBe('Substantiv')
  })

  it('lehnt leeres lemma ab', () => {
    expect(adminPreviewLemmaSchema.safeParse({ lemma: ' ' }).success).toBe(false)
  })
})

describe('analyzeKollQuerySchema', () => {
  it('akzeptiert q ohne wortart', () => {
    expect(analyzeKollQuerySchema.safeParse({ q: 'haus' }).success).toBe(true)
  })

  it('akzeptiert q mit wortart', () => {
    expect(analyzeKollQuerySchema.safeParse({ q: 'haus', pos: 'Substantiv' }).success).toBe(true)
  })
})

describe('adminUsersBulkUpdateSchema', () => {
  it('akzeptiert setRole mit role und IDs', () => {
    expect(adminUsersBulkUpdateSchema.safeParse({
      action: 'setRole',
      role: 'premium',
      userIds: ['u1', 'u2'],
    }).success).toBe(true)
  })

  it('lehnt setRole ohne role ab', () => {
    expect(adminUsersBulkUpdateSchema.safeParse({
      action: 'setRole',
      userIds: ['u1'],
    }).success).toBe(false)
  })

  it('akzeptiert delete ohne role', () => {
    expect(adminUsersBulkUpdateSchema.safeParse({
      action: 'delete',
      userIds: ['u1'],
    }).success).toBe(true)
  })

  it('setzt export-Format default auf json', () => {
    const parsed = adminUsersBulkUpdateSchema.parse({
      action: 'export',
      userIds: ['u1'],
    })
    expect(parsed.format).toBe('json')
  })
})
