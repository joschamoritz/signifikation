/**
 * pruefe.py --roh: baut aus den Rohtokens des Parser-Dienstes die spaCy-Docs nach und prüft sie
 * unverändert. Die Fixture stammt aus dem echten Dienst (de_zdl_lg, gekürzt), `erwartet` aus dem
 * alten Pfad mit vollem Modell auf denselben Sätzen. Braucht nur spaCy, kein Modell; ohne Python
 * mit spaCy (BELEGPRUEFUNG_TEST_PYTHON, sonst BELEGPRUEFUNG_PYTHON) wird übersprungen.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SKRIPT = fileURLToPath(new URL('../belegPruefung/pruefe.py', import.meta.url))
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/belegpruefung-roh.json', import.meta.url), 'utf8'))
const PYTHON = process.env.BELEGPRUEFUNG_TEST_PYTHON || process.env.BELEGPRUEFUNG_PYTHON
const mitSpacy = Boolean(PYTHON) && spawnSync(PYTHON, ['-I', '-c', 'import spacy'], { timeout: 60_000 }).status === 0

function pruefeRoh(eingabe) {
  const lauf = spawnSync(PYTHON, ['-I', SKRIPT, '--roh'], { input: JSON.stringify(eingabe), timeout: 60_000 })
  if (lauf.status !== 0) throw new Error(lauf.stderr.toString().trim().split('\n').pop())
  return JSON.parse(lauf.stdout.toString('utf8'))
}

const kopie = () => JSON.parse(JSON.stringify(FIXTURE))
const ergebnisFuer = (antwort, schluessel) => antwort.paare.find(p => p.schluessel === schluessel)

// Python mit spaCy-Import braucht unter Last (volle Testsuite, CI mit Coverage) mehr als die 5 s Standard
describe.skipIf(!mitSpacy)('pruefe.py --roh', { timeout: 30_000 }, () => {
  it('urteilt auf den Rohtokens wie der alte Pfad mit Modell (Relation und Position)', () => {
    const antwort = pruefeRoh(FIXTURE)
    expect(antwort.paare).toEqual(FIXTURE.erwartet)
    expect(antwort.saetze).toBe(FIXTURE.roh.length)
    expect(antwort.fehlerhaft).toBe(0)
  })

  it('ein falsches Leerzeichen-Flag ergibt einen anderen Text: Satz fehlerhaft, besteht nicht', () => {
    const eingabe = kopie()
    const eintrag = eingabe.roh.find(([satz]) => satz === 'Sie öffnete die Tür.')
    eintrag[1][0].leer = false
    const antwort = pruefeRoh(eingabe)
    expect(antwort.fehlerhaft).toBe(1)
    expect(ergebnisFuer(antwort, 'tuer|oeffnen').bestanden).toEqual([])
    // Die übrigen Paare bleiben, wie sie waren
    expect(ergebnisFuer(antwort, 'traum|suess')).toEqual(FIXTURE.erwartet.find(p => p.schluessel === 'traum|suess'))
  })

  it('Fehler im Dienst (null), ungültiger Kopf oder fehlender Satz: besteht nicht, kein Absturz', () => {
    const eingabe = kopie()
    eingabe.roh.find(([satz]) => satz === 'Er hatte einen süßen Traum.')[1] = null
    eingabe.roh.find(([satz]) => satz === 'Sie legte das Buch auf den Tisch.')[1][0].kopf = 999
    eingabe.roh = eingabe.roh.filter(([satz]) => satz !== 'Er tischte uns eine wilde Geschichte auf.')
    const antwort = pruefeRoh(eingabe)
    expect(antwort.fehlerhaft).toBe(2)
    expect(ergebnisFuer(antwort, 'traum|suess').bestanden).toEqual([])
    expect(ergebnisFuer(antwort, 'tisch|legen').bestanden).toEqual([])
    expect(ergebnisFuer(antwort, 'geschichte|auftischen').bestanden).toEqual([])
    expect(ergebnisFuer(antwort, 'mandat|niederlegen').bestanden).toEqual([7])
  })
})
