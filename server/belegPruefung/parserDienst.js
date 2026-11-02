/**
 * Client für den Parser-Dienst des Satzkastens (G15, V1b): Die Belegprüfung lädt kein eigenes Modell
 * mehr (~1,7 GB), sondern holt Rohtokens über den internen Listener des Satzkastens
 * (`POST /satzanalyse/intern/v1/stapel`, nur 127.0.0.1, Bearer-Token). Die Prüflogik bleibt in
 * pruefe.py (`--roh` baut aus den Tokens die spaCy-Docs nach).
 *
 * Vertrag `satzanalyse-stapel/1` (Satzkasten: schema/analyse.zod.js, StapelAntwortSchema): 1–128 Sätze
 * je Anfrage, je Satz 1–500 Zeichen, keine Normalisierung; `docs[k]` gehört zu `saetze[k]` und ist
 * `{ tokens }` (docweit, `kopf: null` = Wurzel) oder `{ fehler }`.
 *
 * Datenschutz: Sätze und Token stehen nie in Fehlermeldungen oder im Log.
 */
import { z } from 'zod'

export const STAPEL_SCHEMA = 'satzanalyse-stapel/1'
export const SAETZE_JE_ANFRAGE = 128
// Grenze des Dienstes je Satz (JS-Länge); Korpussätze haben höchstens 400 Zeichen
const MAX_ZEICHEN = 500
// Der Dienst bricht selbst nach 120 s ab (504); etwas Puffer für die Übertragung
const ZEITLIMIT_MS = 150_000
// Wartezeit vor dem 2. und 3. Versuch einer Anfrage (Retry-After des Dienstes gilt, wenn länger)
const WIEDERHOLEN_JE_ANFRAGE_MS = [3_000, 10_000]

const TokenSchema = z.object({
  i: z.number().int().min(0),
  text: z.string(),
  start: z.number().int().min(0),
  ende: z.number().int().min(0),
  leer: z.boolean(),
  upos: z.string(),
  stts: z.string(),
  lemma: z.string(),
  morph: z.record(z.string(), z.string()),
  kopf: z.number().int().min(0).nullable(),
  rel: z.string(),
})

const AntwortSchema = z.object({
  schema: z.literal(STAPEL_SCHEMA),
  modell: z.object({
    name: z.string(),
    version: z.string(),
    spacy: z.string().optional(),
    vektoren: z.number().int().optional(),
  }).nullable(),
  ms: z.number(),
  docs: z.array(z.union([
    z.object({ tokens: z.array(TokenSchema) }),
    z.object({ fehler: z.string() }),
  ])),
})

/**
 * `art`: 'nicht-erreichbar' (Dienst aus, lädt, belegt oder zu langsam – später wiederholen) oder
 * 'konfiguration' (URL, Token oder Vertrag passen nicht – Wiederholen hilft nicht).
 */
export class DienstFehler extends Error {
  constructor(art, meldung) {
    super(meldung)
    this.name = 'DienstFehler'
    this.art = art
  }
}

const NICHT_ERREICHBAR = new Set([409, 500, 502, 503, 504])

export function dienstEingerichtet() {
  return Boolean(process.env.SATZANALYSE_INTERN_URL)
}

/** Kurzname des Modells für Status und Log, z. B. „de_zdl_lg 3.8.0 (200000 Vektoren)“. */
export function modellName(modell) {
  if (!modell) return null
  return `${modell.name} ${modell.version}${modell.vektoren ? ` (${modell.vektoren} Vektoren)` : ''}`
}

/** Ist die URL brauchbar? Fehlermeldungen von fetch zitieren URL und Header – und damit womöglich das Token. */
function pruefeEinrichtung(url, token) {
  if (!url || !token) throw new DienstFehler('konfiguration', 'SATZANALYSE_INTERN_URL oder SATZANALYSE_INTERN_TOKEN fehlt')
  let adresse
  try {
    adresse = new URL(url)
  } catch {
    throw new DienstFehler('konfiguration', 'SATZANALYSE_INTERN_URL ist keine gültige Adresse')
  }
  if (!['http:', 'https:'].includes(adresse.protocol)) throw new DienstFehler('konfiguration', 'SATZANALYSE_INTERN_URL braucht http oder https')
  if (!/^[\x21-\x7e]+$/.test(token)) throw new DienstFehler('konfiguration', 'SATZANALYSE_INTERN_TOKEN enthält ungültige Zeichen')
}

/** fetch mit Einordnung der Fehler; Meldungen ohne URL, Token oder Satz. */
async function rufe(url, { token, zeitlimitMs, ...init }) {
  let res
  try {
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(zeitlimitMs) })
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new DienstFehler('nicht-erreichbar', 'Parser-Dienst: keine Antwort im Zeitlimit')
    const code = err?.cause?.code || err?.code
    if (code === 'ERR_INVALID_URL' || (err instanceof TypeError && !err.cause)) {
      throw new DienstFehler('konfiguration', 'Parser-Dienst: Aufruf nicht möglich (URL oder Token ungültig)')
    }
    throw new DienstFehler('nicht-erreichbar', `Parser-Dienst nicht erreichbar (${/^[A-Z_]+$/.test(code ?? '') ? code : 'Netzwerk'})`)
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    const art = NICHT_ERREICHBAR.has(res.status) ? 'nicht-erreichbar' : 'konfiguration'
    const fehler = new DienstFehler(art, `Parser-Dienst antwortete mit HTTP ${res.status}`)
    fehler.wiederholenNachMs = Number(res.headers.get('retry-after')) * 1000 || 0
    throw fehler
  }
  return res
}

/** Antwortet der Dienst und ist bereit? Günstig, bevor ein Lauf Minuten mit der Kandidatensuche verbringt. */
export async function pruefeDienstBereit({
  url = process.env.SATZANALYSE_INTERN_URL,
  token = process.env.SATZANALYSE_INTERN_TOKEN,
  zeitlimitMs = 10_000,
} = {}) {
  pruefeEinrichtung(url, token)
  const res = await rufe(url.replace(/\/stapel\/?$/, '/health'), { token, zeitlimitMs })
  await res.body?.cancel().catch(() => {})
}

async function sende(saetze, { url, token, zeitlimitMs }) {
  const res = await rufe(url, {
    token,
    zeitlimitMs,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saetze }),
  })
  let json
  try {
    json = await res.json()
  } catch (err) {
    // Abbruch oder Zeitlimit beim Lesen ist vorübergehend, kaputtes JSON nicht
    if (err instanceof SyntaxError) throw new DienstFehler('konfiguration', 'Parser-Dienst: Antwort ist kein JSON')
    throw new DienstFehler('nicht-erreichbar', 'Parser-Dienst: Antwort abgebrochen')
  }
  const geprueft = AntwortSchema.safeParse(json)
  if (!geprueft.success) {
    const schema = typeof json?.schema === 'string' ? json.schema.slice(0, 40) : 'ohne Schema'
    throw new DienstFehler('konfiguration', `Parser-Dienst: Antwort passt nicht zu ${STAPEL_SCHEMA} (${schema})`)
  }
  const { docs, modell } = geprueft.data
  if (docs.length !== saetze.length) {
    throw new DienstFehler('konfiguration', `Parser-Dienst: ${docs.length} Docs für ${saetze.length} Sätze`)
  }
  return { docs, modell }
}

/** Ein vorübergehender Fehler (Worker-Neustart, kurz belegt) soll nicht den ganzen Lauf kosten. */
async function sendeMitWiederholung(saetze, { wartenMs, ...opts }) {
  for (let versuch = 0; ; versuch++) {
    try {
      return await sende(saetze, opts)
    } catch (err) {
      if (err.art !== 'nicht-erreichbar' || versuch >= wartenMs.length) throw err
      const warte = Math.min(Math.max(wartenMs[versuch], err.wiederholenNachMs ?? 0), 30_000)
      await new Promise((resolve) => setTimeout(resolve, warte))
    }
  }
}

/** Liegt das Doc auf genau diesem Satz? Sonst gehört es nicht dazu (vertauschte Reihenfolge, Normalisierung). */
function passtZumSatz(tokens, satz) {
  let text = ''
  for (const [k, t] of tokens.entries()) {
    // start/ende zählt der Dienst in Codepoints (Python), JS in UTF-16 – daher nur Text und Reihenfolge
    if (t.i !== k) return false
    text += t.text + (t.leer ? ' ' : '')
  }
  return text === satz
}

// Nur, was pruefe.py --roh liest; Kopf docweit, die Wurzel (null) zeigt dort auf sich selbst
const schlank = ({ text, leer, upos, stts, lemma, morph, kopf, rel }) => ({ text, leer, upos, stts, lemma, morph, kopf, rel })

/**
 * Parst Sätze über den Dienst: dedupliziert, teilt in Anfragen à 128 und schickt sie nacheinander
 * (der Dienst nimmt nur einen Stapel gleichzeitig an). Ein vorübergehender Fehler wird je Anfrage
 * kurz wiederholt (`wartenMs`), erst danach scheitert der Aufruf.
 *
 * @param {string[]} saetze
 * @returns {Promise<{roh: Array<[string, object[]|null]>, modell: object|null, fehlerhaft: number}>}
 *   `roh` je eindeutigem Satz die Tokens (nur die Felder für pruefe.py) oder `null` (Fehler im Dienst,
 *   Doc passt nicht zum Satz oder Satz zu lang für den Dienst).
 * @throws {DienstFehler}
 */
export async function parseUeberDienst(saetze, {
  url = process.env.SATZANALYSE_INTERN_URL,
  token = process.env.SATZANALYSE_INTERN_TOKEN,
  zeitlimitMs = ZEITLIMIT_MS,
  jeAnfrage = SAETZE_JE_ANFRAGE,
  wartenMs = WIEDERHOLEN_JE_ANFRAGE_MS,
} = {}) {
  pruefeEinrichtung(url, token)
  const texte = [...new Set(saetze)]
  // Der Dienst lehnt die ganze Anfrage ab, wenn ein Satz zu lang ist; solche Sätze bestehen einfach nicht
  const zuLang = texte.filter(s => s.length > MAX_ZEICHEN || !s.length)
  const senden = texte.filter(s => s.length <= MAX_ZEICHEN && s.length)
  const roh = zuLang.map(s => [s, null])
  let modell = null
  let fehlerhaft = zuLang.length
  for (let i = 0; i < senden.length; i += jeAnfrage) {
    const teil = senden.slice(i, i + jeAnfrage)
    const antwort = await sendeMitWiederholung(teil, { url, token, zeitlimitMs, wartenMs })
    modell = antwort.modell ?? modell
    for (const [k, doc] of antwort.docs.entries()) {
      const tokens = doc.tokens && passtZumSatz(doc.tokens, teil[k]) ? doc.tokens.map(schlank) : null
      if (!tokens) fehlerhaft++
      roh.push([teil[k], tokens])
    }
  }
  return { roh, modell, fehlerhaft }
}
