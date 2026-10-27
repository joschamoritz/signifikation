/**
 * Links im Tag-Editor erscheinen in der App (LemmaSelection → ExternalLink):
 * nur leer oder http(s)://…, wie beim Wort der Woche.
 */
import { describe, expect, it } from 'vitest'
import { adminTagSchema, lemmaEntwurfPushSchema } from '../middleware/validate.js'

const tag = (felder) => ({ datum: '2026-11-02', woerter: ['Haus', 'Baum', 'Weg'], ...felder })

describe('adminTagSchema – Links', () => {
  it('nimmt leere und http(s)-Links an und schneidet Leerzeichen ab', () => {
    const r = adminTagSchema.safeParse(tag({
      links: ['', ' https://www.dwds.de/wb/Haus ', 'http://beispiel.de'],
      zwilling_link: 'https://de.wikipedia.org/wiki/Baum',
      zeitenwende_link: '',
    }))
    expect(r.success).toBe(true)
    expect(r.data.links).toEqual(['', 'https://www.dwds.de/wb/Haus', 'http://beispiel.de'])
  })

  for (const [feld, wert] of [
    ['links', ['javascript:alert(1)', '', '']],
    ['links', ['', 'www.beispiel.de', '']],
    ['zwilling_link', 'ftp://x.de'],
    ['zeitenwende_link', 'https://'],
  ]) {
    it(`lehnt ${JSON.stringify(wert)} in ${feld} ab`, () => {
      const r = adminTagSchema.safeParse(tag({ [feld]: wert }))
      expect(r.success).toBe(false)
      expect(r.error.errors[0].message).toBe('Der Link muss mit http:// oder https:// beginnen.')
      expect(r.error.errors[0].path[0]).toBe(feld)
    })
  }

  it('prüft auch Entwürfe aus dem Lemma-Push', () => {
    const r = lemmaEntwurfPushSchema.safeParse({ tage: [tag({ links: ['data:text/html,x', '', ''] })] })
    expect(r.success).toBe(false)
  })
})
