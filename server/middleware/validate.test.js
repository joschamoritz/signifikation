/**
 * Tests für Zod-Validierungs-Schemas (validate.js)
 */

import { describe, it, expect } from 'vitest'
import {
  statsSchema,
  belegeQuerySchema,
  archivQuerySchema,
  qQuerySchema,
  adminTagSchema,
  adminUsersBulkUpdateSchema,
  adminBulkDeleteCalendarSchema,
  analyzeKollQuerySchema,
  adminPreviewLemmaSchema,
  adminPreviewDayParamsSchema,
} from './validate.js'

// ── statsSchema ──────────────────────────────────────────────
describe('statsSchema', () => {
  const valid = { game: 'kollokationen', datum: '2026-03-15', score: 8, max: 10 }

  it('akzeptiert gültige Eingabe', () => {
    expect(statsSchema.safeParse(valid).success).toBe(true)
  })

  it('lehnt ungültiges game ab', () => {
    expect(statsSchema.safeParse({ ...valid, game: 'unbekannt' }).success).toBe(false)
  })

  it('akzeptiert alle gültigen games', () => {
    for (const game of ['kollokationen', 'wortzwilling', 'zeitenwende']) {
      expect(statsSchema.safeParse({ ...valid, game }).success).toBe(true)
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

describe('adminPreviewDayParamsSchema', () => {
  it('akzeptiert YYYY-MM-DD', () => {
    expect(adminPreviewDayParamsSchema.safeParse({ datum: '2026-03-15' }).success).toBe(true)
  })

  it('lehnt MM-DD ohne Jahr ab', () => {
    expect(adminPreviewDayParamsSchema.safeParse({ datum: '03-15' }).success).toBe(false)
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
