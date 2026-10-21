import { beforeEach, describe, expect, it } from 'vitest'
import db from './db.js'
import { entscheideEntwurf, ladeEntwurf, ladeOffeneEntwuerfe, speichereEntwuerfe } from './store-entwuerfe.js'

const tag = (datum, nomen = 'Hörsaal') => ({ datum, woerter: [nomen, 'forschen', 'akademisch'] })

describe('store-entwuerfe', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM lemma_entwurf').run()
  })

  it('legt Entwürfe an und liefert offene nach Datum sortiert', () => {
    speichereEntwuerfe([tag('2026-11-03'), tag('2026-11-01')])
    const offene = ladeOffeneEntwuerfe()

    expect(offene.map((e) => e.datum)).toEqual(['2026-11-01', '2026-11-03'])
    expect(offene[0].tag.woerter[0]).toBe('Hörsaal')
  })

  it('ersetzt einen offenen Entwurf für dasselbe Datum, statt einen zweiten anzulegen', () => {
    speichereEntwuerfe([tag('2026-11-01', 'Hörsaal')])
    speichereEntwuerfe([tag('2026-11-01', 'Bibliothek')])
    const offene = ladeOffeneEntwuerfe()

    expect(offene).toHaveLength(1)
    expect(offene[0].tag.woerter[0]).toBe('Bibliothek')
  })

  it('lässt einen abgeschlossenen Entwurf stehen, wenn für das Datum neu gepusht wird', () => {
    speichereEntwuerfe([tag('2026-11-01')])
    const [erster] = ladeOffeneEntwuerfe()
    entscheideEntwurf(erster.id, 'uebernommen')

    speichereEntwuerfe([tag('2026-11-01', 'Bibliothek')])

    expect(ladeEntwurf(erster.id).status).toBe('uebernommen')
    expect(ladeOffeneEntwuerfe()).toHaveLength(1)
  })

  it('entscheidet einen Entwurf nur einmal', () => {
    speichereEntwuerfe([tag('2026-11-01')])
    const [entwurf] = ladeOffeneEntwuerfe()

    expect(entscheideEntwurf(entwurf.id, 'uebernommen')).toBe(true)
    expect(entscheideEntwurf(entwurf.id, 'verworfen')).toBe(false)
    expect(ladeEntwurf(entwurf.id).status).toBe('uebernommen')
    expect(ladeOffeneEntwuerfe()).toHaveLength(0)
  })

  it('speichert alles oder nichts', () => {
    // Ein Tag ohne Datum verletzt NOT NULL — der erste darf dann auch nicht bleiben.
    expect(() => speichereEntwuerfe([tag('2026-11-01'), { woerter: [] }])).toThrow()
    expect(ladeOffeneEntwuerfe()).toHaveLength(0)
  })

  it('liefert null für eine unbekannte ID', () => {
    expect(ladeEntwurf(999999)).toBeNull()
  })
})
