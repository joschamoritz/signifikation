// Klartext-Fassung der Nutzungsbedingungen für den Anhang der
// Bestellbestätigung. Geprüft wird gegen die echte Datei aus public/, damit
// eine Umgestaltung der Seite den Anhang nicht still leert oder Markup
// durchlässt.
import { describe, expect, it } from 'vitest'
import { htmlZuText, nutzungsbedingungenAlsText } from '../nutzungsbedingungenText.js'

describe('nutzungsbedingungenAlsText', () => {
  const text = nutzungsbedingungenAlsText()

  it('enthält alle Abschnitte und den Stand', () => {
    expect(text).toMatch(/^Signifikation – Nutzungsbedingungen\n/)
    expect(text).toMatch(/Stand: \S+ \d{4}/)
    for (const abschnitt of ['1. Geltungsbereich', 'Widerrufsrecht', 'Muster-Widerrufsformular', '8. Gewährleistung und Haftung', '10. Ergänzende Bestimmungen für die iOS-App']) {
      expect(text).toContain(abschnitt)
    }
  })

  it('lässt weder Markup noch Entitäten noch Navigation stehen', () => {
    expect(text).not.toMatch(/<[a-z/]/i)
    expect(text).not.toMatch(/&[a-z#0-9]+;/i)
    expect(text).not.toContain('­')
    expect(text).not.toContain('Zurück zur App')
    expect(text).not.toContain('Zur App')
    expect(text).not.toContain('Rechtliche Angaben')
  })

  it('setzt Zeilenumbrüche, Listenpunkte und Sonderzeichen um', () => {
    const html = '<div class="wrapper"><a class="back" href="/">← Zurück</a><h2>Kopf</h2>' +
      '<p>Zeile&nbsp;1<br />Zeile 2 &amp; mehr</p><ul><li>Punkt</li></ul>' +
      '<footer><nav>Links</nav></footer></div>\n</body>'
    expect(htmlZuText(html)).toBe('Kopf\n\nZeile 1\nZeile 2 & mehr\n\n– Punkt\n')
  })

  it('bricht bei 76 Zeichen um und rückt Listenpunkte ein', () => {
    const lang = Array.from({ length: 30 }, (_, i) => `Wort${i}`).join(' ')
    const zeilen = htmlZuText(`<div class="wrapper"><ul><li>${lang}</li></ul></div></body>`).trimEnd().split('\n')
    expect(zeilen.length).toBeGreaterThan(1)
    expect(Math.max(...zeilen.map((z) => z.length))).toBeLessThanOrEqual(76)
    expect(zeilen[0]).toMatch(/^– Wort0 /)
    expect(zeilen.slice(1).every((z) => z.startsWith('  Wort'))).toBe(true)
  })
})
