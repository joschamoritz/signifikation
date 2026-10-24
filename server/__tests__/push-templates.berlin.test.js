// Push-Vorlagen: „heute“ und der Wochentag zählen nach Berliner Zeit (Schritt 7b, F9).
// Zwischen 0 und 1/2 Uhr Berliner Zeit lag UTC noch auf dem Vortag: Vorschau und manueller Versand
// zeigten dann die Wörter von gestern.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import db from '../db.js'
import { buildContext, formatDatum, missingPlaceholders, renderTemplateById } from '../notifications/templates.js'

const SOMMER_TAG = '2026-10-24'   // Samstag, MESZ (UTC+2)
const WINTER_TAG = '2026-12-25'   // Freitag, MEZ (UTC+1)
const ids = []

beforeAll(() => {
  const ins = db.prepare('INSERT OR REPLACE INTO kalender (datum, ids, thema) VALUES (?, ?, ?)')
  ins.run(SOMMER_TAG, '[]', 'Thema Samstag')
  ins.run('2026-10-23', '[]', 'Thema Freitag')
  ins.run(WINTER_TAG, '[]', 'Thema Weihnachten')
  ins.run('2026-12-24', '[]', 'Thema Heiligabend')
})

afterAll(() => {
  db.prepare('DELETE FROM kalender WHERE datum IN (?, ?, ?, ?)').run(SOMMER_TAG, '2026-10-23', WINTER_TAG, '2026-12-24')
  for (const id of ids) db.prepare('DELETE FROM push_templates WHERE id = ?').run(id)
})

describe('Berliner Zeit in den Push-Vorlagen', () => {
  it('00:30 Uhr Berliner Sommerzeit (= 22:30 UTC am Vortag) gehört schon zum neuen Tag', () => {
    const zeitpunkt = new Date('2026-10-23T22:30:00Z')
    expect(formatDatum(zeitpunkt)).toBe(SOMMER_TAG)
    const ctx = buildContext(zeitpunkt)
    expect(ctx.wochentag).toBe('Samstag')
    expect(ctx.thema).toBe('Thema Samstag')
  })

  it('00:30 Uhr Berliner Winterzeit (= 23:30 UTC am Vortag) ebenso', () => {
    const zeitpunkt = new Date('2026-12-24T23:30:00Z')
    expect(formatDatum(zeitpunkt)).toBe(WINTER_TAG)
    expect(buildContext(zeitpunkt)).toMatchObject({ wochentag: 'Freitag', thema: 'Thema Weihnachten' })
  })

  it('kurz vor Mitternacht Berliner Zeit gilt noch der alte Tag', () => {
    const zeitpunkt = new Date('2026-10-24T21:59:00Z')   // 23:59 MESZ
    expect(formatDatum(zeitpunkt)).toBe(SOMMER_TAG)
    expect(buildContext(zeitpunkt).thema).toBe('Thema Samstag')
  })

  it('8:00 Uhr (der tägliche Versand) bleibt am selben Tag', () => {
    expect(formatDatum(new Date('2026-10-24T06:00:00Z'))).toBe(SOMMER_TAG)
    expect(formatDatum(new Date('2026-12-25T07:00:00Z'))).toBe(WINTER_TAG)
  })
})

describe('renderTemplateById nennt nicht befüllbare Platzhalter', () => {
  it('missing enthält die Lücken, gerendert würde „Heute: »«“', () => {
    const jetzt = Date.now()
    const id = db.prepare('INSERT INTO push_templates (title, body, enabled, category, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)')
      .run('Heute: »{lemma}«', 'Mit {thema} und {wochentag}', 'daily', jetzt, jetzt).lastInsertRowid
    ids.push(id)
    // Ein Tag ohne Wörter: nur Thema und Wochentag sind befüllbar
    const r = renderTemplateById(id, new Date('2026-12-24T11:00:00Z'))
    expect(r.title).toBe('Heute: »«')
    expect(r.body).toBe('Mit Thema Heiligabend und Donnerstag')
    expect(r.missing).toEqual(['lemma'])
    expect(r.category).toBe('daily')
  })

  it('missingPlaceholders zählt unbekannte Platzhalter als fehlend', () => {
    expect(missingPlaceholders({ title: '{wochentag}', body: '{gibtsnicht}' }, { wochentag: 'Montag' })).toEqual(['gibtsnicht'])
  })
})
