import { describe, expect, it } from 'vitest'
import { sanitizeBackupBundle } from './admin-backup-utils.js'

describe('admin calendar utils', () => {
  it('migriert Legacy-MM-DD im Backup auf YYYY-MM-DD', () => {
    const bundle = sanitizeBackupBundle({
      files: {
        'lemmata.json': [],
        'kalender.json': { '04-15': ['haus', 'baum', 'wort'] },
        'wortzwilling.json': { '04-15': { wortA: 'Tag', wortB: 'Nacht', pos: 'Substantiv', kollokatoren: [] } },
        'zeitenwende.json': { '04-15': { lemma: 'Zeit', words: [] } },
        'stats-rows.json': [{ datum: '04-15', spiel: 'kollokationen', plays: 1, scoreSum: 4, maxSum: 10, dist: [] }],
      },
    })

    const year = new Date().getFullYear()
    const isoDatum = `${year}-04-15`

    expect(bundle.kalender[isoDatum]).toEqual({ ids: ['haus', 'baum', 'wort'], thema: '', thema_kurz: '', thema_quelle: '' })
    expect(bundle.wortzwilling[isoDatum]).toBeTruthy()
    expect(bundle.zeitenwende[isoDatum]).toBeTruthy()
    expect(bundle.statsRows[0].datum).toBe(isoDatum)
  })

  it('leert Links ohne http(s) beim Wiederherstellen, gültige bleiben (Security-Audit run-1)', () => {
    const bundle = sanitizeBackupBundle({
      files: {
        'lemmata.json': [
          { id: 'a', link: 'https://www.dwds.de/wb/Haus' },
          { id: 'b', link: 'javascript:alert(1)' },
          { id: 'c', link: 'wetteronline.de/' },
          { id: 'd' },
        ],
        'kalender.json': {},
        'wortzwilling.json': { '2026-04-24': { wortA: 'Tag', link: 'katholisch.de/' } },
        'zeitenwende.json': { '2026-04-24': { lemma: 'Zeit', link: ' http://religion.de ' } },
      },
    })
    expect(bundle.lemmata.map((l) => l.link)).toEqual(['https://www.dwds.de/wb/Haus', '', '', undefined])
    expect(bundle.wortzwilling['2026-04-24'].link).toBe('')
    expect(bundle.zeitenwende['2026-04-24'].link).toBe('http://religion.de')
  })

  it('weist eine Datei ab, der ein Inhaltsteil fehlt (fehlend ist nicht leer)', () => {
    const files = { 'lemmata.json': [], 'kalender.json': {}, 'wortzwilling.json': {}, 'zeitenwende.json': {} }
    expect(() => sanitizeBackupBundle({ files })).not.toThrow()
    for (const teil of Object.keys(files)) {
      const ohne = { ...files }
      delete ohne[teil]
      expect(() => sanitizeBackupBundle({ files: ohne })).toThrow(`Datei unvollständig: ${teil} fehlt`)
    }
  })

  it('meldet keine Statistik als null, damit sie nicht als „leer“ ersetzt wird', () => {
    const files = { 'lemmata.json': [], 'kalender.json': {}, 'wortzwilling.json': {}, 'zeitenwende.json': {} }
    expect(sanitizeBackupBundle({ files }).statsRows).toBeNull()
  })
})
