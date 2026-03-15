// ── DiaCollo API – öffentlich zugängliche DWDS-Korpora ───────
// JSON-Endpunkt: ddc.dwds.de/dstar/<korpus>/diacollo/profile.perl?fmt=json
// Die Haupt-URL (diacollo/) gibt nur HTML zurück – immer profile.perl direkt nutzen!
// Aktive Korpora werden aus server/data/diacollo-config.json gelesen.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data')

const BASE = 'https://ddc.dwds.de/dstar'

// Fallback falls Config-Datei fehlt
const CORPORA_DEFAULT = [
  { id: 'dta',              slice: 50 },
  { id: 'kern',             slice: 20 },
  { id: 'ddr',              slice: 10 },
  { id: 'politische_reden', slice: 10 },
]

let _corporaCache = null
export function clearCorporaCache() { _corporaCache = null }

function getActiveCorpora() {
  if (_corporaCache) return _corporaCache
  try {
    const cfg = JSON.parse(readFileSync(join(DATA, 'diacollo-config.json'), 'utf8'))
    const active = cfg.corpora.filter(c => c.enabled)
    _corporaCache = active.length ? active : CORPORA_DEFAULT
  } catch {
    _corporaCache = CORPORA_DEFAULT
  }
  return _corporaCache
}

/** Ruft ein einzelnes Korpus ab und taggt jedes Profil mit `_korpus`. */
async function fetchKorpus({ id, slice }, lemma) {
  const qs  = `q=${encodeURIComponent(lemma)}&slice=${slice}&kbest=20&fmt=json`
  const url = `${BASE}/${id}/diacollo/profile.perl?${qs}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`DiaCollo/${id} HTTP ${res.status}`)
  const data = await res.json()
  return (data.profiles || []).map(p => ({ ...p, _korpus: id }))
}

/**
 * Holt alle aktiven Korpora parallel, merged die Profile chronologisch.
 * Bei gleichem Jahres-Label gewinnt das Profil mit höherem f1 (mehr Daten).
 */
async function fetchAllProfiles(lemma) {
  const results = await Promise.allSettled(getActiveCorpora().map(k => fetchKorpus(k, lemma)))
  const byYear  = new Map()
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn(' DiaCollo:', r.reason.message)
      continue
    }
    for (const p of r.value) {
      const existing = byYear.get(p.label)
      if (!existing || p.f1 > existing.f1) byYear.set(p.label, p)
    }
  }
  return [...byYear.values()].sort((a, b) => Number(a.label) - Number(b.label))
}

/** Debug-Endpunkt: zeigt alle aktiven Korpora + merged Timeline für ein Lemma. */
export async function debugDiaCollo(lemma) {
  const activeCorpora = getActiveCorpora()
  // Einzelne Korpora-Infos
  const settled = await Promise.allSettled(activeCorpora.map(k => fetchKorpus(k, lemma)))
  const corpora = {}
  for (let i = 0; i < activeCorpora.length; i++) {
    const r = settled[i]
    if (r.status === 'rejected') { corpora[activeCorpora[i].id] = { error: r.reason.message }; continue }
    const profiles = r.value
    corpora[activeCorpora[i].id] = {
      total:   profiles.length,
      passing: profiles.filter(p => p.f1 >= 5 && p.ld && Object.keys(p.ld).length >= 3).length,
      labels:  profiles.map(p => p.label),
    }
  }

  // Merged Timeline
  const byYear = new Map()
  for (const r of settled) {
    if (r.status === 'rejected') continue
    for (const p of r.value) {
      const existing = byYear.get(p.label)
      if (!existing || p.f1 > existing.f1) byYear.set(p.label, p)
    }
  }
  const merged  = [...byYear.values()].sort((a, b) => Number(a.label) - Number(b.label))
  const summary = merged.map(p => ({
    label:   p.label,
    korpus:  p._korpus,
    f1:      p.f1,
    ldCount: p.ld ? Object.keys(p.ld).length : 0,
    pass:    !!(p.f1 >= 5 && p.ld && Object.keys(p.ld).length >= 3),
    top: p.ld
      ? Object.entries(p.ld)
          .map(([k, v]) => ({ wort: k.split('\t')[0], pos: k.split('\t')[1] || '', score: Number(v) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
      : [],
  }))
  const passing = summary.filter(s => s.pass).length
  return { corpora, total: merged.length, passing, ok: passing >= 5, summary }
}

/** Produktiv-Funktion: gibt 5 Kollokat-Periode-Paare zurück oder null. */
export async function fetchZeitreise(lemma) {
  const profiles = await fetchAllProfiles(lemma)
  return extractPaare(lemma, profiles)
}

/**
 * Nomen und Adjektive bevorzugen – semantisch informativer als Verben.
 * Duplikate sind erlaubt: dominiert dasselbe Wort mehrere Perioden, ist das
 * ein legitimes Ergebnis (geringe lexikalische Variation in dem Bereich).
 */
const POS_RANK = { NN: 0, ADJA: 0, ADJD: 0, NE: 1 }  // Verben/Sonstiges = 2

function getBestCollokat(profile, lemmaLower, usedWords = new Set()) {
  // Stamm des Lemmas (erste 4 Zeichen) für Stammvarianten-Filter
  const lemmaStamm = lemmaLower.slice(0, 4)
  const valid = Object.entries(profile.ld)
    .map(([key, score]) => {
      const [wort, pos = ''] = key.split('\t')
      return { wort, pos, score: Number(score) }
    })
    .filter(c => {
      const w = c.wort.toLowerCase().trim()
      return (
        w !== lemmaLower &&                      // Lemma selbst
        !w.startsWith(lemmaStamm) &&             // Stammvarianten (z.B. „irisch" bei Lemma „irisch")
        !c.wort.includes(' ') &&                 // keine Phrasen
        !c.wort.endsWith('-') &&                 // keine abgeschnittenen Formen (z.B. „schott-")
        c.wort.length > 2 &&
        !usedWords.has(w)
      )
    })
    .sort((a, b) => {
      const ra = POS_RANK[a.pos] ?? 2
      const rb = POS_RANK[b.pos] ?? 2
      if (ra !== rb) return ra - rb
      return b.score - a.score
    })
  return valid[0] || null
}

/**
 * Wählt 5 gleichmäßig verteilte Perioden aus dem gemergten Profil-Array.
 * Gibt alle passenden Perioden als `perioden` zurück (für Visualisierung)
 * sowie die 5 ausgewählten Spielperioden als `paare`.
 * Gibt null zurück, wenn nicht genügend Daten vorhanden sind.
 */
function extractPaare(lemma, raw) {
  const profiles = raw.filter(p => p.f1 >= 5 && p.ld && Object.keys(p.ld).length >= 3)
  if (profiles.length < 5) return null

  const lemmaLower = lemma.toLowerCase()

  // perioden: ALLE passenden Perioden mit bestem Kollokator (für Visualisierung)
  const perioden = profiles.flatMap(profile => {
    const best = getBestCollokat(profile, lemmaLower)
    if (!best) return []
    return [{ jahrzehnt: profile.label, kollokat: best.wort, korpus: profile._korpus, score: best.score }]
  })

  // paare: 5 Quintile – innerhalb jedes Quintils die Periode mit dem höchsten logDice-Score
  const n = profiles.length
  const paare = []
  const usedWords = new Set()
  const selected = [0, 1, 2, 3, 4].map(i => {
    const from = Math.round(i * (n - 1) / 4)
    const to   = Math.round((i + 1) * (n - 1) / 4)
    // Alle Perioden im Quintil, bestes logDice (des gefilterten Top-Kollokatoren) gewinnt
    let best = null, bestScore = -Infinity
    for (let j = from; j <= to; j++) {
      const candidate = getBestCollokat(profiles[j], lemmaLower, usedWords)
      if (candidate && candidate.score > bestScore) {
        bestScore = candidate.score
        best = profiles[j]
      }
    }
    return best ?? profiles[Math.round(i * (n - 1) / 4)]  // Fallback auf mittlere Position
  })
  for (const profile of selected) {
    const best = getBestCollokat(profile, lemmaLower, usedWords)
    if (!best) {
      console.warn(`  DiaCollo: Keine gültigen Kollokatoren für ${profile.label} [${profile._korpus}]`)
      return null
    }
    usedWords.add(best.wort.toLowerCase())
    paare.push({ jahrzehnt: profile.label, kollokat: best.wort, korpus: profile._korpus, score: best.score })
  }

  if (paare.length < 5) return null
  return { lemma, paare, perioden }
}
