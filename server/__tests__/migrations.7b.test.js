// Migrationen aus Schritt 7b: 0026 (Bonus-Tage ohne Wirkung) und 0027 (Texte der Standard-Vorlagen).
// Je Migration eine kleine In-Memory-Datenbank mit nur den betroffenen Tabellen.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const sql = (name) => readFileSync(join(dir, name), 'utf8')

describe('0026_bonus_tage_ohne_wirkung', () => {
  it('entfernt Bonus-Tage mit 0 Spielen und lässt die übrigen stehen', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE free_days (date TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT \'\', bonus_count INTEGER NOT NULL DEFAULT 0)')
    const ins = db.prepare('INSERT INTO free_days (date, label, bonus_count) VALUES (?, ?, ?)')
    ins.run('2026-10-03', 'Einheit', 3)
    ins.run('2026-10-10', 'ohne Wirkung', 0)
    ins.run('2026-10-11', '', 0)
    ins.run('2026-12-24', 'Heiligabend', 5)
    db.exec(sql('0026_bonus_tage_ohne_wirkung.sql'))
    expect(db.prepare('SELECT date FROM free_days ORDER BY date').all().map((r) => r.date)).toEqual(['2026-10-03', '2026-12-24'])
    // ein zweiter Lauf ändert nichts
    db.exec(sql('0026_bonus_tage_ohne_wirkung.sql'))
    expect(db.prepare('SELECT COUNT(*) AS n FROM free_days').get().n).toBe(2)
  })
})

describe('0027_push_vorlagen_texte', () => {
  const ALT1 = ['Heute: »{lemma}«', 'Welche Wörter treten am häufigsten gemeinsam auf?']
  const ALT2 = ['{lemma} wartet auf dich', 'Kennst du seine stärksten Kollokationen?']

  function neueDb() {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE push_templates (id INTEGER PRIMARY KEY, title TEXT, body TEXT, enabled INTEGER DEFAULT 1, category TEXT DEFAULT \'daily\', created_at INTEGER, updated_at INTEGER)')
    return db
  }
  const zeile = (db, id) => db.prepare('SELECT title, body, updated_at FROM push_templates WHERE id = ?').get(id)

  it('ändert die beiden Texte, wenn sie noch exakt dem Standard entsprechen', () => {
    const db = neueDb()
    const ins = db.prepare('INSERT INTO push_templates (id, title, body, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    ins.run(1, ...ALT1)
    ins.run(2, ...ALT2)
    ins.run(3, 'Thema heute: {thema}', 'Unverändert')
    db.exec(sql('0027_push_vorlagen_texte.sql'))
    expect(zeile(db, 1)).toMatchObject({ title: 'Heute: »{lemma}«', body: 'Welche Wörter verbinden sich am stärksten damit?' })
    expect(zeile(db, 2)).toMatchObject({ title: '{lemma} wartet auf dich', body: 'Kennst du die stärksten Kollokatoren?' })
    expect(zeile(db, 1).updated_at).toBeGreaterThan(1)
    expect(zeile(db, 3)).toEqual({ title: 'Thema heute: {thema}', body: 'Unverändert', updated_at: 1 })
  })

  it('lässt von Hand geänderte Vorlagen unberührt (Titel oder Text weicht ab)', () => {
    const db = neueDb()
    const ins = db.prepare('INSERT INTO push_templates (id, title, body, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    ins.run(1, ALT1[0], 'Welche Wörter treten am häufigsten gemeinsam auf? Finde sie!')   // Text angepasst
    ins.run(2, 'Anderer Titel', ALT1[1])                                                    // Titel angepasst
    ins.run(3, ALT2[0], 'Eigener Text')
    db.exec(sql('0027_push_vorlagen_texte.sql'))
    expect(zeile(db, 1).body).toBe('Welche Wörter treten am häufigsten gemeinsam auf? Finde sie!')
    expect(zeile(db, 2)).toMatchObject({ title: 'Anderer Titel', body: ALT1[1], updated_at: 1 })
    expect(zeile(db, 3)).toMatchObject({ body: 'Eigener Text', updated_at: 1 })
  })

  it('ist wiederholbar: ein zweiter Lauf ändert nichts mehr', () => {
    const db = neueDb()
    db.prepare('INSERT INTO push_templates (id, title, body, created_at, updated_at) VALUES (1, ?, ?, 1, 1)').run(...ALT1)
    db.exec(sql('0027_push_vorlagen_texte.sql'))
    const nachErstem = zeile(db, 1)
    db.exec(sql('0027_push_vorlagen_texte.sql'))
    expect(zeile(db, 1)).toEqual(nachErstem)
  })
})
