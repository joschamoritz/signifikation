// Der Worker rechnet buildLueckenfueller außerhalb des Hauptprozesses. Ohne Korpus-DB (Testumgebung) liefert
// die Berechnung null, wie im Hauptprozess; geprüft werden Hin- und Rückweg, Reihenfolge und das Beenden.
import { afterAll, describe, expect, it } from 'vitest'
import { buildLueckenfuellerImWorker, beendeLueckenfuellerWorker, leereLueckenfuellerWorkerCache } from './lueckenfuellerImWorker.js'

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
