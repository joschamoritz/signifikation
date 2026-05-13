import { describe, expect, it } from 'vitest'
import {
  loadKalenderRows,
  loadWortzwillingRows,
  loadZeitenwendeRows,
  normalizeKalenderShape,
  toWortzwillingRow,
  toZeitenwendeRow,
} from './store-daily-content.js'

// ── normalizeKalenderShape ─────────────────────────────────────────

describe('normalizeKalenderShape', () => {
  it('normalisiert Array-Werte auf neue Shape', () => {
    const result = normalizeKalenderShape({ '2025-01-01': ['haus', 'baum'] })
    expect(result['2025-01-01']).toEqual({
      ids: ['haus', 'baum'],
      thema: '',
      thema_kurz: '',
      thema_quelle: '',
    })
  })

  it('behält bereits normalisierte Einträge bei', () => {
    const result = normalizeKalenderShape({
      '2025-01-01': { ids: ['haus'], thema: 'Natur', thema_kurz: 'N', thema_quelle: 'q' },
    })
    expect(result['2025-01-01'].thema).toBe('Natur')
    expect(result['2025-01-01'].ids).toEqual(['haus'])
  })

  it('überspringt Einträge ohne ids-Array', () => {
    const result = normalizeKalenderShape({ '2025-01-01': { thema: 'x' } })
    expect(result['2025-01-01']).toBeUndefined()
  })

  it('gibt leeres Objekt zurück für null', () => {
    expect(normalizeKalenderShape(null)).toEqual({})
    expect(normalizeKalenderShape(undefined)).toEqual({})
  })
})

// ── loadKalenderRows ───────────────────────────────────────────────

describe('loadKalenderRows', () => {
  it('parst JSON-ids und gibt korrektes Objekt zurück', () => {
    const rows = [{ datum: '2025-01-01', ids: '["haus","baum"]', thema: 'T', thema_kurz: 'k', thema_quelle: 'q', lueckenfueller_id: '' }]
    const result = loadKalenderRows(rows)
    expect(result['2025-01-01'].ids).toEqual(['haus', 'baum'])
    expect(result['2025-01-01'].thema).toBe('T')
  })

  it('fällt auf leeres Array zurück bei kaputtem JSON', () => {
    const rows = [{ datum: '2025-01-01', ids: 'KEIN_JSON', thema: '', thema_kurz: '', thema_quelle: '', lueckenfueller_id: '' }]
    const result = loadKalenderRows(rows)
    expect(result['2025-01-01'].ids).toEqual([])
  })

  it('gibt leeres Objekt zurück für leere Rows', () => {
    expect(loadKalenderRows([])).toEqual({})
  })
})

// ── toWortzwillingRow / loadWortzwillingRows ───────────────────────

describe('toWortzwillingRow', () => {
  it('serialisiert kollokatoren als JSON-String', () => {
    const row = toWortzwillingRow('2025-01-01', {
      wortA: 'Tag', wortB: 'Nacht', pos: 'Substantiv',
      kollokatoren: [{ wort: 'hell', zuordnung: 'A', score: 5 }],
    })
    expect(row.datum).toBe('2025-01-01')
    expect(JSON.parse(row.kollokatoren)).toHaveLength(1)
    expect(JSON.parse(row.kollokatoren)[0].score).toBe(5)
  })

  it('setzt Defaults für fehlende Felder', () => {
    const row = toWortzwillingRow('2025-01-01', {})
    expect(row.wortA).toBe('')
    expect(row.pos).toBe('Substantiv')
    expect(JSON.parse(row.kollokatoren)).toEqual([])
  })
})

describe('loadWortzwillingRows', () => {
  it('parst kollokatoren aus JSON zurück', () => {
    const rows = [{
      datum: '2025-01-01',
      wortA: 'Tag', wortB: 'Nacht', pos: 'Substantiv',
      kollokatoren: '[{"wort":"hell","zuordnung":"A"}]',
      notiz: '', link: '',
    }]
    const result = loadWortzwillingRows(rows)
    expect(result['2025-01-01'].kollokatoren).toHaveLength(1)
    expect(result['2025-01-01'].kollokatoren[0].wort).toBe('hell')
  })

  it('fällt auf leeres Array zurück bei kaputtem JSON', () => {
    const rows = [{
      datum: '2025-01-01',
      wortA: 'Tag', wortB: 'Nacht', pos: 'Substantiv',
      kollokatoren: 'KEIN_JSON',
      notiz: '', link: '',
    }]
    const result = loadWortzwillingRows(rows)
    expect(result['2025-01-01'].kollokatoren).toEqual([])
  })
})

// ── toZeitenwendeRow / loadZeitenwendeRows ────────────────────────

describe('toZeitenwendeRow', () => {
  it('serialisiert Zeitenwende-Objekt als JSON-String', () => {
    const entry = { lemma: 'Test', words: [{ word: 'alt', freq: 5 }] }
    const row = toZeitenwendeRow('2025-01-01', entry)
    expect(row.datum).toBe('2025-01-01')
    expect(JSON.parse(row.data).lemma).toBe('Test')
    expect(JSON.parse(row.data).words).toHaveLength(1)
  })
})

describe('loadZeitenwendeRows', () => {
  it('parst data-JSON zurück', () => {
    const rows = [{ datum: '2025-01-01', data: '{"lemma":"Test","words":[]}' }]
    const result = loadZeitenwendeRows(rows)
    expect(result['2025-01-01'].lemma).toBe('Test')
  })

  it('gibt null zurück bei kaputtem JSON', () => {
    const rows = [{ datum: '2025-01-01', data: 'KEIN_JSON' }]
    const result = loadZeitenwendeRows(rows)
    expect(result['2025-01-01']).toBeNull()
  })
})
