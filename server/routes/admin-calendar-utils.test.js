import { describe, expect, it } from 'vitest'
import { parseCalendarBulkImport } from './admin-calendar-utils.js'
import { sanitizeBackupBundle } from './admin-backup-utils.js'

describe('admin calendar utils', () => {
  it('normalisiert CSV-Import auf YYYY-MM-DD', () => {
    expect(parseCalendarBulkImport('date,lemma1,lemma2,lemma3\n2026-12-24,Haus,Baum,Wort')).toEqual([
      { datum: '2026-12-24', woerter: ['Haus', 'Baum', 'Wort'] },
    ])
  })

  it('migriert Legacy-MM-DD im Backup auf YYYY-MM-DD', () => {
    const bundle = sanitizeBackupBundle({
      files: {
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
})
