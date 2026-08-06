/**
 * register.js – Registerprofil („Typisch für").
 *
 * Reine Rechenlogik ohne DB: die Korpus-Summen kommen als Parameter herein.
 * Das ist der Grund, warum `baueProfil` und `fasseSummenZusammen` getrennt von
 * der Abfrage liegen — die Metrik ist der Teil, der leise falsch sein kann.
 */
import { describe, expect, it } from 'vitest'
import {
  REGISTER, AUSGESCHLOSSEN, MIN_FAKTOR, MIN_FREQ_REGISTER,
  registerFuer, pruefeVollstaendigkeit, fasseSummenZusammen, baueProfil, faktorText,
} from '../register.js'

/** Zwei gleich große Register à 1 Mio. Token, plus ein ausgeschlossenes. */
const SUMMEN_ROH = [
  { quelle: 'deu_news', f: 1_000_000 },        // → Presse
  { quelle: 'gesetze', f: 1_000_000 },         // → Recht
  { quelle: 'ref_mhd', f: 1_000_000 },         // ausgeschlossen
]

describe('Zuordnung', () => {
  it('ordnet jedes Korpus genau einem Register zu', () => {
    const alle = Object.values(REGISTER).flat()
    expect(new Set(alle).size).toBe(alle.length)
  })

  it('überschneidet sich nicht mit der Ausschlussliste', () => {
    const alle = new Set(Object.values(REGISTER).flat())
    for (const k of AUSGESCHLOSSEN) expect(alle.has(k)).toBe(false)
  })

  it('meldet Korpora, die keinem Register zugeordnet sind', () => {
    const { fehlend } = pruefeVollstaendigkeit(['deu_news', 'gibt_es_nicht'])
    expect(fehlend).toEqual(['gibt_es_nicht'])
  })

  it('meldet zugeordnete Korpora, die die DB nicht kennt', () => {
    const { unbekannt } = pruefeVollstaendigkeit(['deu_news'])
    expect(unbekannt).toContain('wikipedia')
  })

  it('gibt für ausgeschlossene Korpora kein Register zurück', () => {
    expect(registerFuer('ref_mhd')).toBeNull()
    expect(registerFuer('deu_news')).toBe('Presse')
  })
})

describe('fasseSummenZusammen', () => {
  it('zählt ausgeschlossene Korpora nicht in die Gesamtsumme', () => {
    const { proRegister, gesamt } = fasseSummenZusammen(SUMMEN_ROH)
    expect(gesamt).toBe(2_000_000)          // ref_mhd fehlt bewusst
    expect(proRegister.get('Presse')).toBe(1_000_000)
    expect(proRegister.has('Historische Textsammlung')).toBe(false)
  })

  it('addiert mehrere Korpora desselben Registers', () => {
    const { proRegister } = fasseSummenZusammen([
      { quelle: 'deu_news', f: 700 }, { quelle: 'deu_newscrawl', f: 300 },
    ])
    expect(proRegister.get('Presse')).toBe(1000)
  })
})

describe('faktorText – die Kennzahl in Worten', () => {
  it('rundet auf ganze Zahlen', () => {
    // 8,9× hat eine Nachkommastelle, die die Daten nicht hergeben.
    expect(faktorText(8.9)).toBe('9-mal so oft wie üblich')
    expect(faktorText(2.4)).toBe('2-mal so oft wie üblich')
    expect(faktorText(16.6)).toBe('17-mal so oft wie üblich')
  })

  it('bleibt an der Schwelle bei einer sinnvollen Angabe', () => {
    expect(faktorText(MIN_FAKTOR)).toBe('2-mal so oft wie üblich')
  })

  it('nennt keine Zahl mit Komma', () => {
    for (const f of [2.0, 2.5, 3.7, 8.9, 20.4]) {
      expect(faktorText(f)).not.toMatch(/[.,]\d/)
    }
  })
})

describe('baueProfil – Auffälligkeit', () => {
  const summen = fasseSummenZusammen(SUMMEN_ROH)

  it('erkennt ein Wort, das nur in einem Register vorkommt', () => {
    // 1000 Treffer, alle in Presse. Erwartet wären 500 (halbes Korpus) → 2×.
    const profil = baueProfil([{ quelle: 'deu_news', freq: 1000 }], summen)
    expect(profil).toEqual([{ register: 'Presse', frequenz: 1000, faktor: 2 }])
  })

  it('liefert für ein gleichmäßig verteiltes Wort gar kein Profil', () => {
    const profil = baueProfil(
      [{ quelle: 'deu_news', freq: 500 }, { quelle: 'gesetze', freq: 500 }], summen)
    expect(profil).toEqual([])              // beide 1,0× → unter MIN_FAKTOR
  })

  // Eigene Größen: Bei zwei gleich großen Registern ist 2,0× das rechnerische
  // Maximum (alle Treffer in einem), zwei Einträge über der Schwelle sind dort
  // gar nicht möglich. Für den Sortiertest braucht es ungleiche Register.
  it('sortiert absteigend nach Faktor', () => {
    const ungleich = fasseSummenZusammen([
      { quelle: 'deu_news', f: 1_000_000 },   // Presse, groß
      { quelle: 'gesetze', f: 100_000 },      // Recht, klein
      { quelle: 'dibilit', f: 50_000 },       // Literatur, sehr klein
    ])
    const profil = baueProfil(
      [{ quelle: 'gesetze', freq: 100 }, { quelle: 'dibilit', freq: 100 }], ungleich)
    expect(profil.map(r => r.register)).toEqual(['Literatur', 'Recht'])
    expect(profil[0].faktor).toBeGreaterThan(profil[1].faktor)
    expect(profil[1].faktor).toBeGreaterThanOrEqual(MIN_FAKTOR)
  })

  it('ignoriert ausgeschlossene Korpora vollständig', () => {
    // Ohne Ausschluss würde ref_mhd den Erwartungswert verschieben.
    const mit = baueProfil(
      [{ quelle: 'deu_news', freq: 1000 }, { quelle: 'ref_mhd', freq: 9000 }], summen)
    const ohne = baueProfil([{ quelle: 'deu_news', freq: 1000 }], summen)
    expect(mit).toEqual(ohne)
  })

  it('blendet Register unter der Mindesthäufigkeit aus', () => {
    // Sehr hoher Faktor, aber zu wenige Belege → Schutz vor Klein-Korpus-Rauschen.
    const profil = baueProfil([{ quelle: 'deu_news', freq: MIN_FREQ_REGISTER - 1 }], summen)
    expect(profil).toEqual([])
  })

  it('hält das limit ein', () => {
    const profil = baueProfil([{ quelle: 'deu_news', freq: 1000 }], summen, { limit: 0 })
    expect(profil).toEqual([])
  })

  it('kommt mit leeren Eingaben klar', () => {
    expect(baueProfil([], summen)).toEqual([])
    expect(baueProfil([{ quelle: 'deu_news', freq: 100 }],
      { proRegister: new Map(), gesamt: 0 })).toEqual([])
  })
})
