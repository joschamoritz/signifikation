/**
 * Social Cards, Stufe 2: Bluesky-Client (Facetten, Anmeldung, Bild, Antwort,
 * Token-Erneuerung) und Posting-Job (Schalter, Zeitfenster, nur freigegebene,
 * keine Doppelposts, Auflösung als Antwort, Fehlversuche). Bluesky selbst wird
 * nie aufgerufen – fetch bzw. der Client sind nachgebaut.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { facetten, webUrl, createBlueskyClient, MAX_BILD_BYTES } from '../socialCards/bluesky.js'
import { postFaellige, imPostfenster, postenModus, posttext, MAX_VERSUCHE } from '../jobs/socialPosting.js'
import { speichereEntwuerfe, ladeEntwuerfe, setzeStatus, ladePost } from '../socialCards/store.js'

const bytes = (s) => Buffer.byteLength(s, 'utf8')

describe('facetten', () => {
  it('markiert Hashtags und Links mit Byte-Bereichen (Umlaute zählen doppelt)', () => {
    const text = 'Rätsel für „Gedächtnis“ – mehr: signifikation.de/wort/gedaechtnis.\n\n#Linguistik #Sprachrätsel'
    const f = facetten(text)
    const link = f.find((x) => x.features[0].$type.endsWith('#link'))
    expect(link.features[0].uri).toBe('https://signifikation.de/wort/gedaechtnis')
    const vorLink = text.slice(0, text.indexOf('signifikation.de'))
    expect(link.index.byteStart).toBe(bytes(vorLink))
    expect(link.index.byteEnd).toBe(bytes(vorLink) + bytes('signifikation.de/wort/gedaechtnis')) // ohne Schlusspunkt

    const tags = f.filter((x) => x.features[0].$type.endsWith('#tag')).map((x) => x.features[0].tag)
    expect(tags).toEqual(['Linguistik', 'Sprachrätsel'])
    const sr = f.find((x) => x.features[0].tag === 'Sprachrätsel')
    expect(Buffer.from(text).subarray(sr.index.byteStart, sr.index.byteEnd).toString()).toBe('#Sprachrätsel')
  })

  it('kodiert Links mit Umlauten als gültige URI, lässt aber den Text lesbar', () => {
    const text = 'Quelle: Mord im Weißen Haus. Wikipedia. https://de.wikipedia.org/wiki/Mord_im_Weißen_Haus · CC BY-SA 4.0'
    const [link] = facetten(text)
    expect(link.features[0].uri).toBe('https://de.wikipedia.org/wiki/Mord_im_Wei%C3%9Fen_Haus')
    expect(Buffer.from(text).subarray(link.index.byteStart, link.index.byteEnd).toString()).toBe('https://de.wikipedia.org/wiki/Mord_im_Weißen_Haus')
  })

  it('macht aus Abkürzungen und Zahlen keine Links', () => {
    expect(facetten('z. B. Plenarprotokoll 19/123 und o. Ä.')).toEqual([])
  })

  it('webUrl übersetzt at://-Adressen in Links der Bluesky-App', () => {
    expect(webUrl('at://did:plc:abc/app.bsky.feed.post/3kx')).toBe('https://bsky.app/profile/did:plc:abc/post/3kx')
    expect(webUrl('kaputt')).toBeNull()
  })
})

// Nachgebautes Bluesky: antwortet je Methode, merkt sich jeden Aufruf
function fakeFetch({ ablaufBeiErstemPost = false } = {}) {
  const aufrufe = []
  let abgelaufen = ablaufBeiErstemPost
  const f = vi.fn(async (url, init) => {
    const methode = url.split('/xrpc/')[1]
    aufrufe.push({ methode, init })
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body })
    if (methode === 'com.atproto.server.createSession') return json(200, { accessJwt: 'a1', refreshJwt: 'r1', did: 'did:plc:test' })
    if (methode === 'com.atproto.server.refreshSession') return json(200, { accessJwt: 'a2', refreshJwt: 'r2', did: 'did:plc:test' })
    if (methode === 'com.atproto.repo.uploadBlob') return json(200, { blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/png', size: 3 } })
    if (methode === 'com.atproto.repo.createRecord') {
      if (abgelaufen) { abgelaufen = false; return json(400, { error: 'ExpiredToken', message: 'Token has expired' }) }
      return json(200, { uri: `at://did:plc:test/app.bsky.feed.post/${aufrufe.length}`, cid: `cid${aufrufe.length}` })
    }
    return json(404, { error: 'NotFound' })
  })
  return { f, aufrufe }
}
const ENV = { BLUESKY_HANDLE: 'signifikation.de', BLUESKY_APP_PASSWORD: 'geheim-test' }

describe('createBlueskyClient', () => {
  it('meldet sich einmal an, lädt das Bild hoch und legt den Beitrag mit Alt-Text, Facetten und Sprache an', async () => {
    const { f, aufrufe } = fakeFetch()
    const client = createBlueskyClient({ fetch: f, env: ENV })
    const bild = { bytes: Buffer.from('png'), alt: 'Rätselkarte', breite: 1080, hoehe: 1350 }
    const r = await client.poste({ text: 'Hallo #Linguistik', bild, jetzt: new Date('2099-03-03T17:30:00Z') })
    expect(r.uri).toMatch(/^at:\/\/did:plc:test\//)
    expect(aufrufe.map((a) => a.methode)).toEqual(['com.atproto.server.createSession', 'com.atproto.repo.uploadBlob', 'com.atproto.repo.createRecord'])
    expect(JSON.parse(aufrufe[0].init.body)).toEqual({ identifier: 'signifikation.de', password: 'geheim-test' })
    const record = JSON.parse(aufrufe[2].init.body).record
    expect(record).toMatchObject({ text: 'Hallo #Linguistik', langs: ['de'], createdAt: '2099-03-03T17:30:00.000Z' })
    expect(record.embed.images[0]).toMatchObject({ alt: 'Rätselkarte', aspectRatio: { width: 1080, height: 1350 } })
    expect(record.facets[0].features[0]).toEqual({ $type: 'app.bsky.richtext.facet#tag', tag: 'Linguistik' })

    await client.poste({ text: 'Zweiter' })
    expect(aufrufe.filter((a) => a.methode === 'com.atproto.server.createSession')).toHaveLength(1)
  })

  it('hängt Antworten an den Faden und erneuert ein abgelaufenes Token', async () => {
    const { f, aufrufe } = fakeFetch({ ablaufBeiErstemPost: true })
    const client = createBlueskyClient({ fetch: f, env: ENV })
    const antwortAuf = { root: { uri: 'at://r', cid: 'rc' }, parent: { uri: 'at://p', cid: 'pc' } }
    await client.poste({ text: 'Auflösung', antwortAuf })
    expect(aufrufe.map((a) => a.methode)).toContain('com.atproto.server.refreshSession')
    const letzte = aufrufe.filter((a) => a.methode === 'com.atproto.repo.createRecord').at(-1)
    expect(JSON.parse(letzte.init.body).record.reply).toEqual(antwortAuf)
    expect(letzte.init.headers.Authorization).toBe('Bearer a2')
  })

  it('verweigert zu große Bilder und fehlenden Zugang', async () => {
    const { f } = fakeFetch()
    const client = createBlueskyClient({ fetch: f, env: ENV })
    await expect(client.poste({ text: 'x', bild: { bytes: Buffer.alloc(MAX_BILD_BYTES + 1), alt: '', breite: 1, hoehe: 1 } })).rejects.toThrow(/zu groß/)
    await expect(createBlueskyClient({ fetch: f, env: {} }).poste({ text: 'x' })).rejects.toThrow(/nicht eingerichtet/)
  })
})

describe('Postfenster und Schalter', () => {
  it('postet nur zwischen 18:30 und 22:00 Berliner Zeit', () => {
    // März 2099: MEZ = UTC+1
    expect(imPostfenster(new Date('2099-03-03T17:29:00Z'))).toBe(false)
    expect(imPostfenster(new Date('2099-03-03T17:30:00Z'))).toBe(true)
    expect(imPostfenster(new Date('2099-03-03T20:59:00Z'))).toBe(true)
    expect(imPostfenster(new Date('2099-03-03T21:00:00Z'))).toBe(false)
  })

  it('kennt nur on, test und aus', () => {
    expect(postenModus({ SOCIAL_POSTEN: 'on' })).toBe('on')
    expect(postenModus({ SOCIAL_POSTEN: 'TEST' })).toBe('test')
    expect(postenModus({ SOCIAL_POSTEN: 'ja' })).toBe('aus')
    expect(postenModus({})).toBe('aus')
  })
})

describe('postFaellige', () => {
  // Di 2099-03-03 Textbeleg, Mi 2099-03-04 dessen Auflösung; dazu ein offener Entwurf am Dienstag
  const DI = '2099-03-03', MI = '2099-03-04'
  const UM_18_40 = (datum) => new Date(`${datum}T17:40:00Z`)
  const bildDir = mkdtempSync(join(tmpdir(), 'social-posting-test-'))
  const bildDatei = join(bildDir, 'karte.png')
  writeFileSync(bildDatei, Buffer.from('png'))
  const bildPfad = vi.fn(async () => bildDatei)

  function anlegen() {
    speichereEntwuerfe([
      { datum: DI, slot: 'TB', spec: { format: 'text', data: {} }, caption: '„Satz mit ______.“', hashtags: '#Linguistik' },
      { datum: MI, slot: 'TB-aufloesung', spec: { format: 'text', data: {} }, caption: 'Gesucht war „Wort“.', hashtags: '' },
      { datum: DI, slot: 'A', spec: { format: 'A', ratio: '4:5', data: { lemma: 'Haus', options: [{ text: 'a', correct: true }, { text: 'b' }, { text: 'c' }] } }, caption: 'Rätsel', hashtags: '' },
    ])
    const alle = [...ladeEntwuerfe(DI, MI)]
    const finde = (slot) => alle.find((e) => e.slot === slot)
    return { tb: finde('TB'), aufl: finde('TB-aufloesung'), raetsel: finde('A') }
  }
  const fakeClient = () => {
    let n = 0
    return { poste: vi.fn(async () => { n += 1; return { uri: `at://did:plc:test/app.bsky.feed.post/${n}`, cid: `cid${n}` } }) }
  }

  afterEach(() => {
    db.prepare(`DELETE FROM social_post WHERE entwurf_id IN (SELECT id FROM social_card_entwurf WHERE datum BETWEEN ? AND ?)`).run(DI, MI)
    db.prepare(`DELETE FROM social_card_entwurf WHERE datum BETWEEN ? AND ?`).run(DI, MI)
  })
  afterAll(() => rmSync(bildDir, { recursive: true, force: true }))

  it('tut nichts, solange SOCIAL_POSTEN aus ist oder es vor 18:30 ist', async () => {
    const { tb } = anlegen()
    setzeStatus(tb.id, 'freigegeben')
    const client = fakeClient()
    expect((await postFaellige({ now: UM_18_40(DI), env: {}, client, bildPfad })).modus).toBe('aus')
    await postFaellige({ now: new Date(`${DI}T16:00:00Z`), env: { SOCIAL_POSTEN: 'on', ...ENV }, client, bildPfad })
    expect(client.poste).not.toHaveBeenCalled()
  })

  it('postet nur freigegebene Entwürfe von heute, genau einmal – auch bei erneutem Lauf', async () => {
    const { tb, raetsel } = anlegen()
    setzeStatus(tb.id, 'freigegeben') // Rätsel bleibt offen
    const client = fakeClient()
    const env = { SOCIAL_POSTEN: 'on', ...ENV }
    const r = await postFaellige({ now: UM_18_40(DI), env, client, bildPfad })
    expect(r).toMatchObject({ gepostet: 1, fehler: 0 })
    expect(client.poste).toHaveBeenCalledTimes(1)
    expect(client.poste.mock.calls[0][0]).toMatchObject({ text: '„Satz mit ______.“\n\n#Linguistik' })
    expect(client.poste.mock.calls[0][0].bild).toBeUndefined()
    expect(ladePost(tb.id).uri).toMatch(/^at:\/\//)
    expect(ladePost(raetsel.id)).toBeNull()

    await postFaellige({ now: UM_18_40(DI), env, client, bildPfad })
    expect(client.poste).toHaveBeenCalledTimes(1)
  })

  it('Bildkarten gehen mit Bild und Alt-Text raus', async () => {
    const { raetsel } = anlegen()
    setzeStatus(raetsel.id, 'freigegeben')
    const client = fakeClient()
    await postFaellige({ now: UM_18_40(DI), env: { SOCIAL_POSTEN: 'on', ...ENV }, client, bildPfad })
    const { bild } = client.poste.mock.calls[0][0]
    expect(bild).toMatchObject({ breite: 1080, hoehe: 1350 })
    expect(bild.alt).toContain('Welches Wort ist am stärksten mit „Haus“ verbunden?')
  })

  it('Auflösung erscheint als Antwort auf den Beitrag vom Vortag – ohne ihn bleibt sie liegen', async () => {
    const { tb, aufl } = anlegen()
    setzeStatus(aufl.id, 'freigegeben')
    const client = fakeClient()
    const env = { SOCIAL_POSTEN: 'on', ...ENV }

    // Beitrag vom Dienstag nicht gepostet → Auflösung wartet
    expect((await postFaellige({ now: UM_18_40(MI), env, client, bildPfad })).uebersprungen).toBe(1)
    expect(client.poste).not.toHaveBeenCalled()

    // Dienstag freigeben und posten, dann Mittwoch
    setzeStatus(tb.id, 'freigegeben')
    await postFaellige({ now: UM_18_40(DI), env, client, bildPfad })
    const beitrag = ladePost(tb.id)
    await postFaellige({ now: UM_18_40(MI), env, client, bildPfad })
    expect(client.poste.mock.calls[1][0].antwortAuf).toEqual({
      root: { uri: beitrag.uri, cid: beitrag.cid },
      parent: { uri: beitrag.uri, cid: beitrag.cid },
    })
    expect(ladePost(aufl.id)).toMatchObject({ rootUri: beitrag.uri })
  })

  it('zählt Fehlversuche und gibt nach dem dritten auf', async () => {
    const { tb } = anlegen()
    setzeStatus(tb.id, 'freigegeben')
    const client = { poste: vi.fn(async () => { throw new Error('Bluesky 503: Upstream') }) }
    const env = { SOCIAL_POSTEN: 'on', ...ENV }
    for (let i = 0; i < MAX_VERSUCHE + 1; i++) await postFaellige({ now: UM_18_40(DI), env, client, bildPfad })
    expect(client.poste).toHaveBeenCalledTimes(MAX_VERSUCHE)
    expect(ladePost(tb.id)).toMatchObject({ uri: null, versuche: MAX_VERSUCHE, fehler: 'Bluesky 503: Upstream' })
  })

  it('Testmodus ruft Bluesky nicht auf und schreibt nichts in die Datenbank', async () => {
    const { tb } = anlegen()
    setzeStatus(tb.id, 'freigegeben')
    const client = fakeClient()
    const r = await postFaellige({ now: UM_18_40(DI), env: { SOCIAL_POSTEN: 'test' }, client, bildPfad })
    expect(r.modus).toBe('test')
    expect(client.poste).not.toHaveBeenCalled()
    expect(ladePost(tb.id)).toBeNull()
  })

  it('posttext hängt Hashtags mit Leerzeile an, sonst nur den Text', () => {
    expect(posttext({ caption: 'A', hashtags: '#B' })).toBe('A\n\n#B')
    expect(posttext({ caption: 'A', hashtags: '' })).toBe('A')
  })
})
