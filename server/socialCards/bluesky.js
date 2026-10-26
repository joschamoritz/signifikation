/**
 * server/socialCards/bluesky.js
 *
 * Schlanker Bluesky-Client (AT Protocol über fetch, ohne Zusatzpaket) für die
 * Social-Card-Beiträge: anmelden, Bild hochladen, Beitrag oder Antwort anlegen.
 *
 * Zugang kommt nur aus der Server-.env (Entscheidung 2026-10-21):
 *   BLUESKY_HANDLE        z. B. signifikation.de
 *   BLUESKY_APP_PASSWORD  App-Passwort ohne Zugriff auf Direktnachrichten
 *   BLUESKY_SERVICE       optional, Standard https://bsky.social
 * Das Passwort wird nie geloggt und verlässt den Server nur Richtung Bluesky.
 *
 * Die Sitzung bleibt im Speicher und wird bei Ablauf erneuert: Bluesky erlaubt
 * nur 30 Anmeldungen je 5 Minuten bzw. 300 am Tag – bei höchstens sechs
 * Beiträgen pro Woche reicht eine Anmeldung je Serverstart.
 */

const STANDARD_SERVICE = 'https://bsky.social'
// Bluesky lehnt Bilder über 976,56 KB ab; etwas Abstand für Kopfdaten
export const MAX_BILD_BYTES = 950_000

// ── Facetten: Links und Hashtags klickbar machen ──────────────────────────────
// Bluesky zählt Bereiche in UTF-8-Bytes, nicht in Zeichen.
const bytes = (text) => Buffer.byteLength(text, 'utf8')

// Vollständige URLs und nackte Domains mit Pfad oder bekannter Endung (signifikation.de/wort/…)
const LINK = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:de|org|com|net|eu|social|app)(?:\/[^\s]*)?/giu
const ENDE_SATZZEICHEN = /[.,;:!?)\]“”"'»«]+$/u
const HASHTAG = /(^|\s)(#[\p{L}\p{N}_]+)/gu

// Im Text stehen Links lesbar („Weißen“), die Facette braucht eine gültige URI
function alsUri(url) {
  try { return encodeURI(decodeURI(url)) } catch { return url }
}

/** Facetten (Links, Hashtags) für einen Beitragstext, Bereiche in Bytes. */
export function facetten(text) {
  const liste = []
  for (const m of text.matchAll(LINK)) {
    const roh = m[0].replace(ENDE_SATZZEICHEN, '')
    const start = bytes(text.slice(0, m.index))
    liste.push({
      index: { byteStart: start, byteEnd: start + bytes(roh) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: alsUri(/^https?:\/\//i.test(roh) ? roh : `https://${roh}`) }],
    })
  }
  for (const m of text.matchAll(HASHTAG)) {
    const idx = m.index + m[1].length
    const start = bytes(text.slice(0, idx))
    liste.push({
      index: { byteStart: start, byteEnd: start + bytes(m[2]) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2].slice(1) }],
    })
  }
  return liste.sort((a, b) => a.index.byteStart - b.index.byteStart)
}

/** at://did/app.bsky.feed.post/rkey → Adresse in der Bluesky-Web-App. */
export function webUrl(atUri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(atUri || '')
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null
}

export function blueskyKonfiguriert(env = process.env) {
  return !!(env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD)
}

class BlueskyFehler extends Error {
  constructor(status, body) {
    super(`Bluesky ${status}: ${body?.error || ''} ${body?.message || ''}`.trim())
    this.status = status
    this.code = body?.error
  }
}

/**
 * @param {object} [opts]
 * @param {Function} [opts.fetch]   für Tests ersetzbar
 * @param {object}   [opts.env]     Quelle für Handle/Passwort/Service (Standard process.env)
 */
export function createBlueskyClient({ fetch: f = globalThis.fetch, env = process.env } = {}) {
  const service = (env.BLUESKY_SERVICE || STANDARD_SERVICE).replace(/\/+$/, '')
  let sitzung = null // { accessJwt, refreshJwt, did }

  async function rufe(methode, { body, token, typ = 'application/json', roh = false } = {}) {
    const antwort = await f(`${service}/xrpc/${methode}`, {
      method: 'POST',
      headers: { 'Content-Type': typ, ...(token && { Authorization: `Bearer ${token}` }) },
      body: roh ? body : JSON.stringify(body ?? {}),
    })
    const daten = await antwort.json().catch(() => ({}))
    if (!antwort.ok) throw new BlueskyFehler(antwort.status, daten)
    return daten
  }

  async function anmelden() {
    if (!blueskyKonfiguriert(env)) throw new Error('Bluesky nicht eingerichtet: BLUESKY_HANDLE und BLUESKY_APP_PASSWORD fehlen in der .env')
    const d = await rufe('com.atproto.server.createSession', {
      body: { identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_APP_PASSWORD },
    })
    sitzung = { accessJwt: d.accessJwt, refreshJwt: d.refreshJwt, did: d.did }
  }

  async function erneuern() {
    try {
      const d = await rufe('com.atproto.server.refreshSession', { token: sitzung.refreshJwt })
      sitzung = { accessJwt: d.accessJwt, refreshJwt: d.refreshJwt, did: d.did }
    } catch {
      await anmelden()
    }
  }

  /** Aufruf mit Sitzung; bei abgelaufenem Token einmal erneuern und wiederholen. */
  async function mitSitzung(methode, opts) {
    if (!sitzung) await anmelden()
    try {
      return await rufe(methode, { ...opts, token: sitzung.accessJwt })
    } catch (err) {
      if (err.status !== 400 && err.status !== 401) throw err
      if (err.code !== 'ExpiredToken' && err.code !== 'InvalidToken') throw err
      await erneuern()
      return rufe(methode, { ...opts, token: sitzung.accessJwt })
    }
  }

  /**
   * Legt einen Beitrag an.
   * @param {object} p
   * @param {string} p.text
   * @param {{ bytes: Buffer, alt: string, breite: number, hoehe: number }} [p.bild]
   * @param {{ root: {uri,cid}, parent: {uri,cid} }} [p.antwortAuf]
   * @returns {Promise<{ uri: string, cid: string }>}
   */
  async function poste({ text, bild, antwortAuf, jetzt = new Date() }) {
    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: jetzt.toISOString(),
      langs: ['de'],
    }
    const f = facetten(text)
    if (f.length) record.facets = f
    if (antwortAuf) record.reply = antwortAuf
    if (bild) {
      if (bild.bytes.length > MAX_BILD_BYTES) throw new Error(`Bild zu groß für Bluesky (${bild.bytes.length} Bytes)`)
      const { blob } = await mitSitzung('com.atproto.repo.uploadBlob', { body: bild.bytes, typ: 'image/png', roh: true })
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: [{ alt: bild.alt, image: blob, aspectRatio: { width: bild.breite, height: bild.hoehe } }],
      }
    }
    if (!sitzung) await anmelden()
    const { uri, cid } = await mitSitzung('com.atproto.repo.createRecord', {
      body: { repo: sitzung.did, collection: 'app.bsky.feed.post', record },
    })
    return { uri, cid }
  }

  return { poste }
}
