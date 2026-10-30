// Der Worker rechnet buildLueckenfueller außerhalb des Hauptprozesses. Ohne Korpus-DB (Testumgebung) liefert
// die Berechnung null, wie im Hauptprozess; geprüft werden Hin- und Rückweg, Reihenfolge und das Beenden.
import { EventEmitter } from 'node:events'
import { afterAll, describe, expect, it } from 'vitest'
import { buildLueckenfuellerImWorker, beendeLueckenfuellerWorker, leereLueckenfuellerWorkerCache, setzeWorkerFuerTests } from './lueckenfuellerImWorker.js'

// Attrappe: merkt sich jeden Auftrag und antwortet erst auf antworte()
function attrappe() {
  const w = new EventEmitter()
  w.auftraege = []
  w.postMessage = (nachricht) => { if (nachricht.id) w.auftraege.push(nachricht) }
  w.antworte = () => { const a = w.auftraege.at(-1); w.emit('message', { id: a.id, runden: [a.lemma] }) }
  return w
}

describe('Warteschlange des Lückenfüller-Workers (Security-Audit run-2)', () => {
  afterAll(() => setzeWorkerFuerTests())

  it('schickt immer nur einen Auftrag; abgelaufene werden nie gerechnet', async () => {
    const w = attrappe()
    setzeWorkerFuerTests(() => w, { zeitlimitMs: 30 })
    const erster = buildLueckenfuellerImWorker('Eins', 'Substantiv')
    const zweiter = buildLueckenfuellerImWorker('Zwei', 'Substantiv')
    expect(w.auftraege.map((a) => a.lemma)).toEqual(['Eins'])
    await Promise.all([
      expect(erster).rejects.toThrow('zu lange'),
      expect(zweiter).rejects.toThrow('zu lange'),
    ])
    // Der erste lief schon und darf fertig rechnen; der abgelaufene zweite kommt nie beim Worker an
    w.antworte()
    expect(w.auftraege.map((a) => a.lemma)).toEqual(['Eins'])
  })

  it('hohe Aufträge kommen vor niedrigen, niedrige warten höchstens zu zehnt', async () => {
    const w = attrappe()
    setzeWorkerFuerTests(() => w, { zeitlimitMs: 5_000 })
    const laufend = buildLueckenfuellerImWorker('Laeuft', 'Substantiv', { prioritaet: 'niedrig' })
    const niedrige = Array.from({ length: 10 }, (_, i) => buildLueckenfuellerImWorker(`N${i}`, 'Substantiv', { prioritaet: 'niedrig' }))
    const zuViel = buildLueckenfuellerImWorker('Elf', 'Substantiv', { prioritaet: 'niedrig' })
    await expect(zuViel).rejects.toMatchObject({ code: 'LUECKENFUELLER_AUSGELASTET' })
    const hoch = buildLueckenfuellerImWorker('Admin', 'Substantiv')

    w.antworte()
    await expect(laufend).resolves.toEqual(['Laeuft'])
    expect(w.auftraege.at(-1).lemma).toBe('Admin')
    w.antworte()
    await expect(hoch).resolves.toEqual(['Admin'])
    for (let i = 0; i < 10; i++) w.antworte()
    await expect(Promise.all(niedrige)).resolves.toHaveLength(10)
  })
})

describe('buildLueckenfuellerImWorker', () => {
  afterAll(() => beendeLueckenfuellerWorker())

  it('liefert das Ergebnis aus dem Worker, auch für mehrere Aufträge gleichzeitig', async () => {
    const ergebnisse = await Promise.all(['Substantiv', 'Verb', 'Adjektiv'].map((pos) => buildLueckenfuellerImWorker('Gibtesnichtwort', pos)))
    expect(ergebnisse).toEqual([null, null, null])
    expect(() => leereLueckenfuellerWorkerCache()).not.toThrow()
  }, 30_000)

  it('lehnt offene Aufträge beim Beenden ab und startet beim nächsten Aufruf neu', async () => {
    const laufend = buildLueckenfuellerImWorker('Gibtesnichtwort', 'Substantiv')
    beendeLueckenfuellerWorker()
    await expect(laufend).rejects.toThrow('Lückenfüller-Worker beendet')
    await expect(buildLueckenfuellerImWorker('Gibtesnichtwort', 'Substantiv')).resolves.toBeNull()
  }, 30_000)
})
