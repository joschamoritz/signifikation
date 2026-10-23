import { describe, expect, it } from 'vitest'
import { toCsvCell } from '../routes/csv-utils.js'
import { toCsvCell as toCsvCellUsers } from '../routes/admin-users-data.js'

describe('toCsvCell', () => {
  it('lässt normale Werte unverändert', () => {
    expect(toCsvCell('Mara Beispiel')).toBe('Mara Beispiel')
    expect(toCsvCell('mara@example.test')).toBe('mara@example.test')
    expect(toCsvCell('2026-10-23')).toBe('2026-10-23')
    expect(toCsvCell('')).toBe('')
    expect(toCsvCell(null)).toBe('')
    expect(toCsvCell(undefined)).toBe('')
  })

  it('belässt echte Zahlen, auch negative', () => {
    expect(toCsvCell(7)).toBe('7')
    expect(toCsvCell(0)).toBe('0')
    expect(toCsvCell(-1)).toBe('-1')
  })

  it('setzt Zellen mit Komma, Anführungszeichen oder Zeilenumbruch in Anführungszeichen', () => {
    expect(toCsvCell('a,b')).toBe('"a,b"')
    expect(toCsvCell('sie sagte "hi"')).toBe('"sie sagte ""hi"""')
    expect(toCsvCell('zwei\nZeilen')).toBe('"zwei\nZeilen"')
    expect(toCsvCell('mit\rCR mittendrin')).toBe('"mit\rCR mittendrin"')
  })

  it.each([
    ['=1+1', "'=1+1"],
    ['+49 170 000', "'+49 170 000"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
    ['\tTab am Anfang', "'\tTab am Anfang"],
  ])('entschärft %j mit vorangestelltem Apostroph', (eingabe, erwartet) => {
    expect(toCsvCell(eingabe)).toBe(erwartet)
  })

  it('entschärft CR am Anfang und setzt die Zelle zusätzlich in Anführungszeichen', () => {
    expect(toCsvCell('\rCR')).toBe(`"'\rCR"`)
  })

  it('entschärft zuerst und quotet danach (Formel mit Komma)', () => {
    expect(toCsvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`)
  })

  it('entschärft nur den Anfang, nicht Zeichen mitten im Wert', () => {
    expect(toCsvCell('a=b')).toBe('a=b')
    expect(toCsvCell('max-mustermann@example.test')).toBe('max-mustermann@example.test')
  })

  it('entschärft Formeln hinter Semikolon, Komma und Tab (deutsches Excel teilt dort)', () => {
    expect(toCsvCell('x;=1+1;y')).toBe(`"x;'=1+1;y"`)
    expect(toCsvCell('x; =1+1')).toBe(`"x; '=1+1"`)
    expect(toCsvCell('a,-2')).toBe(`"a,'-2"`)
    expect(toCsvCell('a\t@SUM(A1)')).toBe(`a\t'@SUM(A1)`)
    expect(toCsvCell('=a;=b')).toBe(`"'=a;'=b"`)
  })

  it('entschärft Formeln auch hinter Anführungszeichen und Leerzeichen', () => {
    expect(toCsvCell('x;"=1+1')).toBe(`"x;""'=1+1"`)
    expect(toCsvCell('x; "=1+1')).toBe(`"x; ""'=1+1"`)
    expect(toCsvCell(' =1+1')).toBe(`' =1+1`)
    expect(toCsvCell('  "+cmd')).toBe(`"'  ""+cmd"`)
    expect(toCsvCell('a,\t-2')).toBe(`"a,\t'-2"`)
  })

  it('behandelt Anführungszeichen und Semikolon zusammen', () => {
    // Eingabe: ";=1+1;"  (mit den Anführungszeichen als Teil des Werts)
    expect(toCsvCell('";=1+1;"')).toBe('"""' + ";'=1+1;" + '"""')
  })

  it('setzt Zellen mit Semikolon in Anführungszeichen, ohne sie zu verändern', () => {
    expect(toCsvCell('a;b')).toBe('"a;b"')
  })

  it('lässt Bindestriche und Pluszeichen mitten im Wort in Ruhe', () => {
    expect(toCsvCell('max-mustermann+tag@example.test')).toBe('max-mustermann+tag@example.test')
    expect(toCsvCell('a; b-c')).toBe('"a; b-c"')
  })

  it('ist in Nutzer- und Statistik-Export dieselbe Funktion', () => {
    expect(toCsvCellUsers).toBe(toCsvCell)
  })
})
