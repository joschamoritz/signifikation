/**
 * server/socialCards/entwuerfe.js
 *
 * Baut die Social-Card-Entwürfe eines Tages: welche Karten (Wochenplan), mit
 * welchen Daten (Kalender, Kollokatoren, Belege) und mit welcher Caption.
 * Gezeichnet wird hier nichts – das Ergebnis ist eine `spec` für
 * shared/socialCards.js#drawCard, die render.js später in ein PNG verwandelt.
 *
 * Wochenplan (Plan 2026-10-21, Variante a):
 *   täglich  T              Teaser mit den drei Lemmata des Tages
 *   Montag   A              Rätsel, Dienstag folgt die Auflösung (A-aufloesung)
 *   Mittwoch X              Zitat aus dem Korpus
 *   Freitag  B              Beleg mit Lücke, Samstag folgt die Auflösung (B-aufloesung)
 *
 * A, X und B nehmen das erste Lemma des VORTAGS: Mit dem Lemma des Tages
 * verriete das Rätsel die Lösung des laufenden Kollokationen-Spiels.
 *
 * Die Abhängigkeiten kommen als Parameter (Tests ersetzen sie).
 */

import { belegLueckentext, belegText, buildCaption, hashtagsFor, SUGGESTED_HASHTAG_SET } from '../../shared/socialCards.js'

export const SLOTS = {
  T:              { format: 'T', label: 'Teaser' },
  A:              { format: 'A', label: 'Rätsel' },
  'A-aufloesung': { format: 'A', label: 'Rätsel – Auflösung' },
  X:              { format: 'X', label: 'Zitat' },
  B:              { format: 'B', label: 'Beleg' },
  'B-aufloesung': { format: 'B', label: 'Beleg – Auflösung' },
}

// Wochentag (0 = Sonntag) → Slots, die an diesem Tag ENTSTEHEN. Die
// Auflösungen hängen am Rätseltag, damit beide dieselbe Antwortreihenfolge haben.
const WOCHENPLAN = { 1: ['A'], 3: ['X'], 5: ['B'] }

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
 */
function findeBeleg(lemma, kollokatoren, { fetchBelege, luecke }) {
  for (const { wort } of kollokatoren.slice(0, 5)) {
    for (const beleg of fetchBelege(lemma, wort, { limit: 5 })) {
      if (!erlaubteQuelle(beleg.quelle)) continue
      if (luecke) {
        const text = belegLueckentext(beleg.tokens, wort)
        if (text.includes('______') && text.length <= MAX_LUECKENTEXT) return { kollokator: wort, text, quelle: beleg.quelle }
      } else {
        const text = belegText(beleg.tokens)
        if (text.length <= MAX_ZITAT) return { kollokator: wort, text, quelle: beleg.quelle }
      }
    }
  }
  return null
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

async function raetsel(datum, lemma, deps) {
  const analyse = await deps.analyzeKollokationBest(lemma.lemma)
  const [antwort, ...rest] = analyse.kollokatoren
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
    {
      ...entwurf(aufloesung, 'A-aufloesung', { data, meta, reveal: true }, {}),
      caption: `Auflösung zum Rätsel von gestern: *${lemma.lemma}* – ${antwort.wort}.`,
    },
  ]
}

async function lueckenbeleg(datum, lemma, deps) {
  const { kollokatoren } = await deps.analyzeKollokationBest(lemma.lemma)
  const beleg = findeBeleg(lemma.lemma, kollokatoren, { ...deps, luecke: true })
  if (!beleg) return []
  const data = { quoteText: beleg.text, quelle: beleg.quelle, collocate: beleg.kollokator, showOptions: false, options: [] }
  const meta = { lemma: lemma.lemma, antwort: beleg.kollokator }
  const quote = beleg.text.length > 100 ? beleg.text.slice(0, 100) + '…' : beleg.text
  const aufloesung = verschiebeDatum(datum, 1)
  return [
    entwurf(datum, 'B', { data, meta }, { lemma: lemma.lemma, quote, source: beleg.quelle }),
    {
      ...entwurf(aufloesung, 'B-aufloesung', { data, meta, reveal: true }, {}),
      caption: `Auflösung zum Beleg von gestern: Gesucht war „${beleg.kollokator}“.\n\nQuelle: ${beleg.quelle}`,
    },
  ]
}

async function zitat(datum, lemma, deps) {
  const { kollokatoren } = await deps.analyzeKollokationBest(lemma.lemma)
  const beleg = findeBeleg(lemma.lemma, kollokatoren, { ...deps, luecke: false })
  if (!beleg) return []
  const data = { subtype: 'Zitat', xLemma: lemma.lemma, headline: beleg.quelle, body: beleg.text }
  return [entwurf(datum, 'X', { data, meta: { lemma: lemma.lemma } }, { ...data })]
}

/**
 * Alle Entwürfe, die am `datum` entstehen (inkl. Auflösung am Folgetag).
 * Leere Liste, wenn für den Tag nichts im Kalender steht.
 *
 * @param {string} datum 'YYYY-MM-DD'
 * @param {object} deps { loadKalender, getLemmataIndex, analyzeKollokationBest, fetchBelege, random? }
 * @param {object} [opts]
 * @param {Set<string>} [opts.vorhanden] 'datum|slot' bereits angelegter Entwürfe – die werden
 *   nicht neu gebaut (spart die Korpusabfragen beim täglichen Lauf)
 */
export async function baueEntwuerfe(datum, deps, { vorhanden = new Set() } = {}) {
  const d = { random: Math.random, ...deps }
  const heute = lemmataAm(datum, d)
  if (!heute.length) return []

  const ergebnis = []
  if (!vorhanden.has(`${datum}|T`)) {
    const lemmata = heute.slice(0, 3).map((l) => ({ lemma: l.lemma, pos: l.pos || '' }))
    ergebnis.push(entwurf(datum, 'T', { data: { lemmata } }, { lemmata }))
  }

  const slots = (WOCHENPLAN[wochentag(datum)] || []).filter((slot) => !vorhanden.has(`${datum}|${slot}`))
  if (!slots.length) return ergebnis
  const vortag = lemmataAm(verschiebeDatum(datum, -1), d)[0]
  if (!vortag) return ergebnis

  for (const slot of slots) {
    if (slot === 'A') ergebnis.push(...await raetsel(datum, vortag, d))
    if (slot === 'X') ergebnis.push(...await zitat(datum, vortag, d))
    if (slot === 'B') ergebnis.push(...await lueckenbeleg(datum, vortag, d))
  }
  return ergebnis
}
