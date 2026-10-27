/**
 * server/socialCards/entwuerfe.js
 *
 * Baut die Social-Card-Entwürfe eines Tages: welche Karten (Wochenplan), mit
 * welchen Daten (Kalender, Kollokatoren, Belege) und mit welcher Caption.
 * Gezeichnet wird hier nichts – das Ergebnis ist eine `spec` für
 * shared/socialCards.js#drawCard, die render.js später in ein PNG verwandelt.
 *
 * Wochenplan „Plan A“ (Entscheidung Nutzer 2026-10-26: höchstens 3 Beiträge
 * pro Woche, nur die spannenden Formate – tägliche Teaser wirken auf Bluesky
 * wie Spam). Auflösungen erscheinen am Folgetag als Antwort auf den Post:
 *   Dienstag   A     Rätsel (Bild), Mittwoch die Auflösung (A-aufloesung)
 *   Donnerstag TB    Textbeleg: echter Satz mit Lücke, ohne Bild; Freitag die Auflösung
 *   Samstag    B/X   im Wochenwechsel nach ISO-Kalenderwoche des Samstags:
 *                    gerade KW → B Beleg mit Lücke (Bild), Sonntag die Auflösung (B-aufloesung)
 *                    ungerade KW → X Zitat aus dem Korpus (Bild), ohne Auflösung
 *                    (nach einer KW 53 folgt KW 1: dann zweimal hintereinander X)
 *
 * Teaser (T) entstehen nicht mehr automatisch; die Karte bleibt im Editor
 * („Selbst gestalten“). Alte T-Entwürfe zeigt der Admin weiter an.
 *
 * Alle Slots nehmen das erste Lemma des VORTAGS: Mit dem Lemma des Tages
 * verriete das Rätsel die Lösung des laufenden Kollokationen-Spiels. Steht für
 * den Vortag nichts im Kalender, entstehen keine Entwürfe.
 *
 * Die Abhängigkeiten kommen als Parameter (Tests ersetzen sie).
 */

import {
  belegLueckentext, belegLueckenwort, belegText, buildCaption, hashtagsFor, SUGGESTED_HASHTAG_SET,
  zeichenZahl, BLUESKY_MAX_ZEICHEN,
} from '../../shared/socialCards.js'
import { slugifyLemma } from '../archive/render.js'

// format 'text' = reiner Textpost ohne Bild; die caption IST der Post.
// T entsteht nicht mehr (Plan A), bleibt aber für ältere Entwürfe bekannt.
export const SLOTS = {
  T:               { format: 'T', label: 'Teaser' },
  A:               { format: 'A', label: 'Rätsel' },
  'A-aufloesung':  { format: 'A', label: 'Rätsel – Auflösung' },
  X:               { format: 'X', label: 'Zitat' },
  B:               { format: 'B', label: 'Beleg' },
  'B-aufloesung':  { format: 'B', label: 'Beleg – Auflösung' },
  TB:              { format: 'text', label: 'Textbeleg' },
  'TB-aufloesung': { format: 'text', label: 'Textbeleg – Auflösung' },
}

// Wochentag (0 = Sonntag) → Slots, die an diesem Tag ENTSTEHEN; der Samstag hängt
// an der Kalenderwoche. Die Auflösungen hängen am Rätseltag, damit beide dieselbe
// Antwortreihenfolge haben.
const WOCHENPLAN = {
  2: ['A'],
  4: ['TB'],
  6: (kw) => (kw % 2 === 0 ? ['B'] : ['X']),
}
const AUFLOESUNG = '-aufloesung'

// Belege aus diesen Quellen kommen nicht auf öffentliche Karten: Die Leipziger
// Wortschatz-Korpora bestehen aus Zeitungssätzen; ob deren Rechte die CC-BY-
// Angabe tragen, ist offen (Plan 2026-10-21, Punkt 6).
const AUSGESCHLOSSENE_QUELLEN = [/wortschatz\.uni-leipzig\.de/i]

const MAX_LUECKENTEXT = 220
const MAX_ZITAT = 240
const KARTE = { theme: 'hell', ratio: '4:5', header: true }

/** 'YYYY-MM-DD' ± n Tage (kalendarisch, ohne Zeitzonen-Effekte). */
export function verschiebeDatum(datum, tage) {
  const [y, m, d] = datum.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + tage)).toISOString().slice(0, 10)
}

function wochentag(datum) {
  const [y, m, d] = datum.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** ISO-8601-Kalenderwoche (Woche mit dem ersten Donnerstag des Jahres = KW 1). */
export function kalenderwoche(datum) {
  const [y, m, d] = datum.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))   // Donnerstag derselben Woche
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
}

/** Slots, die laut Wochenplan am `datum` entstehen (ohne Auflösungen). */
export function slotsAm(datum) {
  const plan = WOCHENPLAN[wochentag(datum)] ?? []
  return typeof plan === 'function' ? plan(kalenderwoche(datum)) : plan
}

/** Passt ein Entwurf (datum, slot) zum aktuellen Wochenplan? Auflösungen gehören zum Vortag. */
export function gehoertZumPlan(datum, slot) {
  if (!SLOTS[slot]) return false
  if (slot.endsWith(AUFLOESUNG)) return slotsAm(verschiebeDatum(datum, -1)).includes(slot.slice(0, -AUFLOESUNG.length))
  return slotsAm(datum).includes(slot)
}

function lemmataAm(datum, { loadKalender, getLemmataIndex }) {
  const entry = loadKalender()[datum]
  const ids = entry?.ids ?? (Array.isArray(entry) ? entry : [])
  const { byId } = getLemmataIndex()
  return ids.map((id) => byId.get(id)).filter(Boolean)
}

function mischen(arr, random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function erlaubteQuelle(quelle) {
  return !AUSGESCHLOSSENE_QUELLEN.some((re) => re.test(quelle || ''))
}

/**
 * Erster brauchbarer Beleg zu den stärksten Kollokatoren. Mit `luecke` muss
 * der Kollokator im Satz hervorgehoben sein, sonst gäbe es keine Lücke.
 * `passt` kann Kandidaten zusätzlich ablehnen (z. B. zu lang für einen Post).
 */
function findeBeleg(lemma, kollokatoren, { fetchBelege, luecke, passt = () => true }) {
  for (const { wort } of kollokatoren.slice(0, 5)) {
    for (const beleg of fetchBelege(lemma, wort, { limit: 5 })) {
      if (!erlaubteQuelle(beleg.quelle)) continue
      const voll = belegText(beleg.tokens)
      const kandidat = { kollokator: wort, quelle: beleg.quelle, voll }
      if (luecke) {
        const text = belegLueckentext(beleg.tokens, wort)
        const mitWortform = { ...kandidat, text, wortform: belegLueckenwort(beleg.tokens, wort) }
        if (text.includes('______') && text.length <= MAX_LUECKENTEXT && passt(mitWortform)) return mitWortform
      } else if (voll.length <= MAX_ZITAT && passt({ ...kandidat, text: voll })) {
        return { ...kandidat, text: voll }
      }
    }
  }
  return null
}

// Kurzname des Korpus für Posts; die volle Angabe steht in der Auflösung.
const KORPUS_NAMEN = [
  [/wikipedia/i, 'Wikipedia'], [/wikibooks/i, 'Wikibooks'], [/wikivoyage/i, 'Wikivoyage'],
  [/Deutsches Textarchiv/i, 'Deutsches Textarchiv'], [/Reichstag/i, 'Reichstagsprotokolle'],
  [/Bundestag/i, 'Deutscher Bundestag'], [/DiBiLit/i, 'DiBiLit'], [/DiBiPhil/i, 'DiBiPhil'],
]

/** „Korpus · Lizenz“ aus der Quellenangabe von fetchBelege („Dokument · Korpus · Lizenz“). */
export function kurzQuelle(quelle) {
  const teile = (quelle || '').split(' · ')
  const lizenz = teile.length > 1 ? teile[teile.length - 1] : ''
  const name = KORPUS_NAMEN.find(([re]) => re.test(quelle || ''))?.[1]
    ?? (teile[teile.length > 2 ? 1 : 0] || 'Korpus').split(/ – |\. /)[0].slice(0, 40)
  return lizenz ? `${name} · ${lizenz}` : name
}

/** „Dokument · Lizenz“ – mit Link zum Dokument, wo die Quelle einen hat (lesbar dekodiert). */
function dokumentQuelle(quelle) {
  const teile = (quelle || '').split(' · ')
  const text = teile.length > 2 ? `${teile[0]} · ${teile[teile.length - 1]}` : quelle
  return text.replace(/https?:\/\/\S+/g, (url) => { try { return decodeURI(url) } catch { return url } })
}

const passtInPost = (text) => zeichenZahl(text) <= BLUESKY_MAX_ZEICHEN
const mitTags = (text, tags) => (tags ? `${text}\n\n${tags}` : text)
const TEXTBELEG_TAGS = hashtagsFor(SUGGESTED_HASHTAG_SET.text)
const textbelegPost = (b) => `„${b.text}“\n\nWelches Wort fehlt? (${kurzQuelle(b.quelle)})`

/**
 * Archivseite des Lemmas, wie sie am Tag `abDatum` erreichbar ist – oder null.
 * Regel wie server/archive/index.js: Ist das Lemma an diesem oder einem
 * späteren Tag noch einmal geplant, bleibt die Seite gesperrt (Lösungsschutz).
 */
function archivLink(lemma, abDatum, { loadKalender, getLemmataIndex }) {
  const slug = slugifyLemma(lemma)
  if (!slug) return null
  const { byId } = getLemmataIndex()
  for (const [datum, entry] of Object.entries(loadKalender())) {
    if (datum < abDatum) continue
    const ids = entry?.ids ?? (Array.isArray(entry) ? entry : [])
    if (ids.some((id) => slugifyLemma(byId.get(id)?.lemma) === slug)) return null
  }
  return `signifikation.de/wort/${slug}`
}

function raetselAufloesung(data, antwort, link) {
  const buchstabe = 'ABC'[data.options.findIndex((o) => o.correct)]
  const satz = `Auflösung: Am stärksten mit „${data.lemma}“ verbunden ist „${antwort}“ (${buchstabe}).`
  return link ? `${satz}\n\nMehr Verbindungen: ${link}` : satz
}

/** Auflösung eines Belegs (Text- und Bildpost): Wortform, Satz, Dokumentquelle – so viel, wie in einen Post passt. */
// CC BY-SA verlangt, Änderungen kenntlich zu machen: Im Beitrag fehlte ein Wort (Lizenzhinweis-Entscheidung 2026-10-26)
const BEARBEITET = ' (für das Rätsel mit Lücke bearbeitet)'

function belegAufloesung(b) {
  const varianten = [
    `Gesucht war „${b.wortform}“:\n„${b.voll}“\n\nQuelle: ${dokumentQuelle(b.quelle)}${BEARBEITET}`,
    `Gesucht war „${b.wortform}“.\n\nQuelle: ${dokumentQuelle(b.quelle)}${BEARBEITET}`,
    `Gesucht war „${b.wortform}“.\n\nQuelle: ${kurzQuelle(b.quelle)}${BEARBEITET}`,
  ]
  return varianten.find(passtInPost) ?? varianten[varianten.length - 1]
}

function entwurf(datum, slot, spec, captionState, captionVariante = 0) {
  const format = SLOTS[slot].format
  return {
    datum,
    slot,
    spec: { ...KARTE, format, datum, ...spec },
    caption: buildCaption(format, captionVariante, captionState),
    hashtags: hashtagsFor(SUGGESTED_HASHTAG_SET[format]),
  }
}

// Kollokatoren auf dem Spielweg (Wortart des Kalender-Lemmas); ohne Eignung fürs Spiel gibt es keinen Entwurf
async function kollokatorenFuer(lemma, deps) {
  const analyse = await deps.analyzeKollokationen(lemma.lemma, lemma.pos || '')
  return analyse?.usable ? analyse.kollokatoren : []
}

async function raetsel(datum, lemma, deps) {
  const [antwort, ...rest] = await kollokatorenFuer(lemma, deps)
  if (!antwort || rest.length < 2) return []
  // Köder wie im Editor vorbelegt: Rang ~5 und ~10, sonst die nächsten
  const koeder1 = rest[3] ?? rest[0]
  const koeder2 = rest[8] ?? rest[1]
  const options = mischen([
    { text: antwort.wort, correct: true },
    { text: koeder1.wort },
    { text: koeder2.wort },
  ], deps.random)
  const data = { lemma: lemma.lemma, pos: lemma.pos || '', ipa: lemma.ipa || '', options }
  const meta = { lemma: lemma.lemma, antwort: antwort.wort }
  const aufloesung = verschiebeDatum(datum, 1)
  return [
    entwurf(datum, 'A', { data, meta }, { lemma: lemma.lemma }),
    // Auflösungen erscheinen als Antwort auf den Post vom Vortag – ohne Tags
    {
      ...entwurf(aufloesung, 'A-aufloesung', { data, meta, reveal: true }, {}),
      caption: raetselAufloesung(data, antwort.wort, archivLink(lemma.lemma, aufloesung, deps)),
      hashtags: '',
    },
  ]
}

async function lueckenbeleg(datum, lemma, deps) {
  const kollokatoren = await kollokatorenFuer(lemma, deps)
  const beleg = findeBeleg(lemma.lemma, kollokatoren, { ...deps, luecke: true })
  if (!beleg) return []
  const data = { quoteText: beleg.text, quelle: beleg.quelle, collocate: beleg.wortform, showOptions: false, options: [] }
  const meta = { lemma: lemma.lemma, antwort: beleg.kollokator }
  const quote = beleg.text.length > 100 ? beleg.text.slice(0, 100) + '…' : beleg.text
  const aufloesung = verschiebeDatum(datum, 1)
  return [
    entwurf(datum, 'B', { data, meta }, { lemma: lemma.lemma, quote, source: beleg.quelle }),
    {
      ...entwurf(aufloesung, 'B-aufloesung', { data, meta, reveal: true }, {}),
      caption: belegAufloesung(beleg),
      hashtags: '',
    },
  ]
}

/** Textpost für Bluesky: echter Satz mit Lücke; Auflösung am Folgetag als Antwort. */
async function textbeleg(datum, lemma, deps) {
  const kollokatoren = await kollokatorenFuer(lemma, deps)
  const beleg = findeBeleg(lemma.lemma, kollokatoren, { ...deps, luecke: true, passt: (b) => passtInPost(mitTags(textbelegPost(b), TEXTBELEG_TAGS)) })
  if (!beleg) return []
  const spec = {
    format: 'text',
    data: { quoteText: beleg.text, volltext: beleg.voll, collocate: beleg.wortform, quelle: beleg.quelle },
    meta: { lemma: lemma.lemma, antwort: beleg.kollokator },
  }
  const aufloesung = verschiebeDatum(datum, 1)
  return [
    { datum, slot: 'TB', spec: { datum, ...spec }, caption: textbelegPost(beleg), hashtags: TEXTBELEG_TAGS },
    { datum: aufloesung, slot: 'TB-aufloesung', spec: { datum: aufloesung, ...spec, reveal: true }, caption: belegAufloesung(beleg), hashtags: '' },
  ]
}

async function zitat(datum, lemma, deps) {
  const kollokatoren = await kollokatorenFuer(lemma, deps)
  const beleg = findeBeleg(lemma.lemma, kollokatoren, { ...deps, luecke: false })
  if (!beleg) return []
  const data = { subtype: 'Zitat', xLemma: lemma.lemma, headline: beleg.quelle, body: beleg.text }
  return [entwurf(datum, 'X', { data, meta: { lemma: lemma.lemma } }, { ...data })]
}

/**
 * Alle Entwürfe, die am `datum` entstehen (inkl. Auflösung am Folgetag).
 * Leere Liste an Tagen ohne Plan-Slot und wenn für den Vortag nichts im
 * Kalender steht (dessen erstes Lemma tragen alle Slots); der Kalender des
 * Tages selbst spielt keine Rolle.
 *
 * @param {string} datum 'YYYY-MM-DD'
 * @param {object} deps { loadKalender, getLemmataIndex, analyzeKollokationen, fetchBelege, random? }
 * @param {object} [opts]
 * @param {Set<string>} [opts.vorhanden] 'datum|slot' bereits angelegter Entwürfe – die werden
 *   nicht neu gebaut (spart die Korpusabfragen beim täglichen Lauf)
 */
export async function baueEntwuerfe(datum, deps, { vorhanden = new Set() } = {}) {
  const d = { random: Math.random, ...deps }
  const slots = slotsAm(datum).filter((slot) => !vorhanden.has(`${datum}|${slot}`))
  if (!slots.length) return []
  const vortag = lemmataAm(verschiebeDatum(datum, -1), d)[0]
  if (!vortag) return []

  const ergebnis = []
  for (const slot of slots) {
    if (slot === 'A') ergebnis.push(...await raetsel(datum, vortag, d))
    if (slot === 'X') ergebnis.push(...await zitat(datum, vortag, d))
    if (slot === 'B') ergebnis.push(...await lueckenbeleg(datum, vortag, d))
    if (slot === 'TB') ergebnis.push(...await textbeleg(datum, vortag, d))
  }
  return ergebnis
}
