/**
 * Client des Parser-Dienstes (Satzkasten, `satzanalyse-stapel/1`) gegen einen Fake-Server:
 * Aufteilung, Reihenfolge, Dedupe, Token und die Einordnung der Fehler.
 */
import http from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DienstFehler, STAPEL_SCHEMA, modellName, parseUeberDienst, pruefeDienstBereit } from '../belegPruefung/parserDienst.js'

const TOKEN = 'a'.repeat(64)
const MODELL = { name: 'de_zdl_lg', version: '3.8.0', spacy: '3.8.13', vektoren: 200000 }

// Tokens wie der Dienst: an Leerzeichen getrennt, ein Doc je Satz
function tokensVon(satz) {
  const teile = satz.split(' ')
  let start = 0
  return teile.map((text, i) => {
    const t = { i, text, start, ende: start + text.length, leer: i < teile.length - 1, upos: 'X', stts: 'XY', lemma: text.toLowerCase(), morph: {}, kopf: i ? 0 : null, rel: i ? 'dep' : 'ROOT' }
    start += text.length + 1
    return t
  })
}

let server
let url
let antworte   // (body, req) → { status, json }
const anfragen = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let roh = ''
    req.on('data', (d) => { roh += d })
    req.on('end', () => {
      const body = JSON.parse(roh || '{}')
      anfragen.push({ body, auth: req.headers.authorization })
      const { status = 200, json, roh: rohText, warte = 0, abbruch = false } = antworte(body, req)
      setTimeout(() => {
        // abbruch: Die Verbindung reißt mitten in der Antwort ab (Satzkasten stürzt ab)
        const text = abbruch ? '{"schema":' : (rohText ?? JSON.stringify(json))
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': abbruch ? 100_000 : Buffer.byteLength(text) })
        if (abbruch) return res.write(text, () => res.destroy())
        res.end(text)
      }, warte)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${server.address().port}/satzanalyse/intern/v1/stapel`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  anfragen.length = 0
  antworte = ({ saetze }, req) => (req.method === 'GET' ? { json: { status: 'ok' } } : { json: { schema: STAPEL_SCHEMA, modell: MODELL, ms: 1, docs: saetze.map(s => ({ tokens: tokensVon(s) })) } })
})

// Ohne Wartezeit zwischen Wiederholungen; die Wiederholung selbst prüft ein eigener Test
const parse = (saetze, opts = {}) => parseUeberDienst(saetze, { url, token: TOKEN, wartenMs: [], ...opts })

async function fehlerVon(versprechen) {
  try {
    await versprechen
  } catch (err) {
    return err
  }
  throw new Error('kein Fehler geworfen')
}

describe('parseUeberDienst', () => {
  it('schickt das Bearer-Token und liefert je Satz die Tokens in Eingabereihenfolge', async () => {
    const { roh, modell, fehlerhaft } = await parse(['Sie öffnete die Tür.', 'Ein süßer Traum.'])
    expect(anfragen).toHaveLength(1)
    expect(anfragen[0].auth).toBe(`Bearer ${TOKEN}`)
    expect(roh.map(([satz]) => satz)).toEqual(['Sie öffnete die Tür.', 'Ein süßer Traum.'])
    expect(roh[0][1].map(t => t.text)).toEqual(['Sie', 'öffnete', 'die', 'Tür.'])
    // Nur die Felder, die pruefe.py liest (spart Speicher bei 6 400 Sätzen je Lauf)
    expect(Object.keys(roh[0][1][0]).sort()).toEqual(['kopf', 'leer', 'lemma', 'morph', 'rel', 'stts', 'text', 'upos'])
    expect(modell).toEqual(MODELL)
    expect(fehlerhaft).toBe(0)
  })

  it('wiederholt eine Anfrage nach vorübergehendem Fehler, statt den Lauf zu verwerfen', async () => {
    let mal = 0
    const normal = antworte
    antworte = (body, req) => (++mal <= 2 ? { status: mal === 1 ? 503 : 409, json: { error: 'x' } } : normal(body, req))
    const { roh } = await parse(['Ein Satz.'], { wartenMs: [0, 0] })
    expect(anfragen).toHaveLength(3)
    expect(roh[0][1]).not.toBeNull()

    mal = 0
    anfragen.length = 0
    expect((await fehlerVon(parse(['Ein Satz.'], { wartenMs: [0] }))).art).toBe('nicht-erreichbar')
    expect(anfragen).toHaveLength(2)
  })

  it('Sätze über 500 Zeichen gehen nicht an den Dienst und bestehen nicht', async () => {
    const lang = 'x'.repeat(501)
    const { roh, fehlerhaft } = await parse([lang, 'Ein Satz.'])
    expect(anfragen[0].body.saetze).toEqual(['Ein Satz.'])
    expect(roh.find(([satz]) => satz === lang)[1]).toBeNull()
    expect(fehlerhaft).toBe(1)
  })

  it('Abbruch mitten in der Antwort: „nicht erreichbar“, nicht „Konfiguration“', async () => {
    antworte = () => ({ abbruch: true })
    const err = await fehlerVon(parse(['Ein Satz.']))
    expect(err.art).toBe('nicht-erreichbar')
  })

  it('ungültige URL oder Token mit Zeilenumbruch: „Konfiguration“, ohne Token in der Meldung', async () => {
    for (const [u, t] of [['kein url', TOKEN], ['ftp://127.0.0.1/x', TOKEN], [url, `${TOKEN}\n`], [url, 'geheim mit leerzeichen']]) {
      const err = await fehlerVon(parseUeberDienst(['Ein Satz.'], { url: u, token: t, wartenMs: [] }))
      expect(err.art).toBe('konfiguration')
      expect(err.message).not.toContain(TOKEN)
      expect(err.message).not.toContain('geheim')
    }
    expect(anfragen).toHaveLength(0)
  })

  it('dedupliziert und teilt in Anfragen à 128, nacheinander', async () => {
    const saetze = Array.from({ length: 300 }, (_, k) => `Satz ${k % 260}`)
    const { roh } = await parse(saetze)
    expect(anfragen.map(a => a.body.saetze.length)).toEqual([128, 128, 4])
    expect(roh).toHaveLength(260)
    expect(roh.map(([satz]) => satz)).toEqual(Array.from({ length: 260 }, (_, k) => `Satz ${k}`))
  })

  it('Fehler je Satz und Docs, die nicht zum Satz passen, werden null', async () => {
    antworte = ({ saetze }) => ({
      json: {
        schema: STAPEL_SCHEMA, modell: null, ms: 1,
        docs: [{ fehler: 'ValueError' }, { tokens: tokensVon('Etwas anderes.') }, { tokens: tokensVon(saetze[2]) }],
      },
    })
    const { roh, fehlerhaft } = await parse(['Eins zwei.', 'Drei vier.', 'Fünf sechs.'])
    expect(roh.map(([, tokens]) => tokens && tokens.length)).toEqual([null, null, 2])
    expect(fehlerhaft).toBe(2)
  })

  it('vertauschte Reihenfolge im Dienst fällt auf', async () => {
    antworte = ({ saetze }) => ({ json: { schema: STAPEL_SCHEMA, modell: null, ms: 1, docs: [...saetze].reverse().map(s => ({ tokens: tokensVon(s) })) } })
    const { roh, fehlerhaft } = await parse(['Erster Satz.', 'Zweiter Satz.'])
    expect(roh.every(([, tokens]) => tokens === null)).toBe(true)
    expect(fehlerhaft).toBe(2)
  })

  it.each([409, 500, 503, 504])('HTTP %i heißt „nicht erreichbar“', async (status) => {
    antworte = () => ({ status, json: { error: 'x' } })
    const err = await fehlerVon(parse(['Ein Satz.']))
    expect(err).toBeInstanceOf(DienstFehler)
    expect(err.art).toBe('nicht-erreichbar')
    expect(err.message).toContain(String(status))
  })

  it.each([400, 401, 403, 404])('HTTP %i heißt „Konfiguration“', async (status) => {
    antworte = () => ({ status, json: { error: 'x' } })
    const err = await fehlerVon(parse(['Ein Satz.']))
    expect(err.art).toBe('konfiguration')
  })

  it('kein Dienst am Port: „nicht erreichbar“', async () => {
    const leer = http.createServer()
    await new Promise((resolve) => leer.listen(0, '127.0.0.1', resolve))
    const port = leer.address().port
    await new Promise((resolve) => leer.close(resolve))
    const err = await fehlerVon(parseUeberDienst(['Ein Satz.'], { url: `http://127.0.0.1:${port}/x`, token: TOKEN, wartenMs: [] }))
    expect(err.art).toBe('nicht-erreichbar')
    expect(err.message).toMatch(/ECONNREFUSED/)
  })

  it('Zeitlimit: „nicht erreichbar“', async () => {
    antworte = () => ({ warte: 300, json: {} })
    const err = await fehlerVon(parse(['Ein Satz.'], { zeitlimitMs: 50 }))
    expect(err.art).toBe('nicht-erreichbar')
    expect(err.message).toMatch(/Zeitlimit/)
  })

  it('unbekanntes Schema, falsche Länge oder kein JSON: „Konfiguration“', async () => {
    antworte = ({ saetze }) => ({ json: { schema: 'satzanalyse-stapel/2', modell: null, ms: 1, docs: saetze.map(() => ({ fehler: 'x' })) } })
    expect((await fehlerVon(parse(['Ein Satz.']))).message).toMatch(/satzanalyse-stapel\/2/)

    antworte = () => ({ json: { schema: STAPEL_SCHEMA, modell: null, ms: 1, docs: [] } })
    expect((await fehlerVon(parse(['Ein Satz.']))).message).toMatch(/0 Docs für 1 Sätze/)

    antworte = () => ({ roh: '<html>' })
    expect((await fehlerVon(parse(['Ein Satz.']))).art).toBe('konfiguration')
  })

  it('ohne URL oder Token: „Konfiguration“, ohne Anfrage', async () => {
    const err = await fehlerVon(parseUeberDienst(['Ein Satz.'], { url, token: '' }))
    expect(err.art).toBe('konfiguration')
    expect(anfragen).toHaveLength(0)
  })

  it('Fehlermeldungen enthalten keinen Satz', async () => {
    antworte = () => ({ status: 503, json: { error: 'x' } })
    const err = await fehlerVon(parse(['Geheimer Schülersatz.']))
    expect(err.message).not.toContain('Schülersatz')
  })
})

describe('pruefeDienstBereit', () => {
  it('fragt …/health mit Token und ordnet die Antwort ein', async () => {
    await pruefeDienstBereit({ url, token: TOKEN })
    expect(anfragen[0].auth).toBe(`Bearer ${TOKEN}`)

    antworte = () => ({ status: 503, json: { status: 'laedt' } })
    expect((await fehlerVon(pruefeDienstBereit({ url, token: TOKEN }))).art).toBe('nicht-erreichbar')
    antworte = () => ({ status: 401, json: { error: 'x' } })
    expect((await fehlerVon(pruefeDienstBereit({ url, token: TOKEN }))).art).toBe('konfiguration')
  })
})

describe('modellName', () => {
  it('fasst Name, Version und Vektoren zusammen', () => {
    expect(modellName(MODELL)).toBe('de_zdl_lg 3.8.0 (200000 Vektoren)')
    expect(modellName({ name: 'de_zdl_lg', version: '3.8.0' })).toBe('de_zdl_lg 3.8.0')
    expect(modellName(null)).toBeNull()
  })
})
