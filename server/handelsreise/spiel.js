/**
 * server/handelsreise/spiel.js – Klassenmarkt der „Handelsreise“ (Unterrichtstool G8.1)
 *
 * Reine Spiellogik ohne Socket: Spiele anlegen, Teams aufnehmen, Runden
 * freigeben und abrechnen. Die Regeln (Räume, Ereignisse, Sättigung, Verkehr)
 * kommen aus derselben Datei wie im Gerät: public/unterricht/handelsreise-regeln.js.
 *
 * Bewusst nur im Speicher (SINGLE-NODE wie der Klassenraum): Ein Spiel dauert
 * eine Schulstunde. Startet der Server neu, melden die Geräte „Spiel unbekannt“
 * und spielen auf Ansage ohne Klassenmarkt weiter. Gespeichert werden nur
 * Vornamen und Spielstände, keine IP; Spiele verfallen nach 6 Stunden.
 */
import { randomBytes, randomInt } from 'node:crypto'
import {
  RAEUME, EREIGNISSE, STANDARD_PLAN, RUNDEN, START_SILBER,
  abrechnungsKontext, neueFaktoren, ereignisPasst, hat,
} from '../../public/unterricht/handelsreise-regeln.js'

export const MAX_TEAMS = 40
export const LEBENSDAUER_MS = 6 * 60 * 60 * 1000

const spiele = new Map()

// Verfallene Spiele regelmäßig entfernen (nicht nur beim Anlegen eines neuen)
setInterval(() => aufraeumen(), 15 * 60 * 1000).unref()

function neuerCode() {
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(1000, 10000))
    if (!spiele.has(code)) return code
  }
  throw new Error('Kein freier Raumcode')
}

export function aufraeumen(jetzt = Date.now()) {
  for (const [code, s] of spiele) if (jetzt - s.aktiv > LEBENSDAUER_MS) spiele.delete(code)
}

export function spielAnlegen() {
  aufraeumen()
  const code = neuerCode()
  const s = {
    code,
    erstellt: Date.now(),
    aktiv: Date.now(),
    runde: 0,
    status: 'lobby',            // lobby | laeuft | abgerechnet | ende
    plan: STANDARD_PLAN.map((z) => ({ ...z })),
    faktoren: {},               // Marktfaktoren für die nächste Runde (aus der letzten Abrechnung)
    faktorenRunde: {},          // eingefroren für die laufende Runde
    abrechnung: null,           // { runde, seed, kontext }
    teams: new Map(),
    naechsteNr: 1,              // Teamnummern bleiben eindeutig, auch nach Entfernen
  }
  spiele.set(code, s)
  return s
}

export function spielHolen(code) {
  const s = spiele.get(String(code))
  if (s) s.aktiv = Date.now()
  return s || null
}

export function spielLoeschen(code) { spiele.delete(String(code)) }

export function teamEntfernen(s, id) { return s.teams.delete(id) }

export function teamsJeRaum(s) {
  const z = Object.fromEntries(Object.keys(RAEUME).map((r) => [r, 0]))
  for (const t of s.teams.values()) z[t.raum]++
  return z
}

/** Raum gleichmäßig verteilen: kleinster Raum, bei Gleichstand Zufall. */
function raumZuteilen(s) {
  const z = teamsJeRaum(s)
  const min = Math.min(...Object.values(z))
  const kandidaten = Object.keys(z).filter((r) => z[r] === min)
  return kandidaten[randomInt(kandidaten.length)]
}

export function teamBeitreten(s, { name, haus, socketId = null }) {
  // Gleiche Vornamen + gleiches Haus = dasselbe Team (Doppeltipp, iPad zurückgesetzt)
  const schluessel = (n, h) => `${String(n).trim().toLowerCase()}|${String(h || '').trim().toLowerCase()}`
  if (s.status === 'ende') return { fehler: 'ende' }
  for (const t of s.teams.values()) {
    if (schluessel(t.name, t.haus) !== schluessel(name, haus)) continue
    if (t.socketId && t.socketId === socketId) return { team: t, wieder: true }
    if (!t.verbunden) {
      // Wiedereinstieg (iPad zurückgesetzt): neues Token, das alte Gerät verliert den Zugang
      t.token = randomBytes(18).toString('base64url')
      return { team: t, wieder: true }
    }
  }
  if (s.teams.size >= MAX_TEAMS) return { fehler: 'voll' }
  const raum = raumZuteilen(s)
  const starts = RAEUME[raum].startorte
  const imRaum = [...s.teams.values()].filter((t) => t.raum === raum).length
  const team = {
    id: randomBytes(6).toString('hex'),
    token: randomBytes(18).toString('base64url'),
    name: String(name).trim().slice(0, 80),
    haus: String(haus || '').trim().slice(0, 40),
    nr: s.naechsteNr++,
    raum,
    ort: starts[imRaum % starts.length],
    hypothese: null,
    abgaben: {},                // runde → { ort, ziel, schutz, verkaeufe }
    staende: {},                // runde → { ort, silber, wert, unglueck, schutz, karawanen }
    verbunden: true,
    socketId,
  }
  s.teams.set(team.id, team)
  return { team }
}

export function teamPerToken(s, token) {
  for (const t of s.teams.values()) if (t.token === token) return t
  return null
}

/** Ereignis für einen Raum in der nächsten (noch nicht freigegebenen) oder laufenden Runde setzen. */
export function ereignisSetzen(s, runde, raum, ereignisId) {
  if (!hat(RAEUME, raum) || !hat(EREIGNISSE, ereignisId)) return false
  if (!ereignisPasst(EREIGNISSE[ereignisId], raum)) return false
  if (!Number.isInteger(runde) || runde < 1 || runde > RUNDEN) return false
  if (runde < s.runde || (runde === s.runde && s.status !== 'lobby')) return false   // laufende Runde nicht mehr ändern
  s.plan[runde - 1][raum] = ereignisId
  return true
}

export function rundeFreigeben(s) {
  if (s.status === 'laeuft') return { fehler: 'laeuft' }
  if (s.status === 'ende' || s.runde >= (s.letzteRunde || RUNDEN)) return { fehler: 'ende' }
  s.runde += 1
  s.status = 'laeuft'
  // Marktfaktoren dieser Runde einfrieren (die Abrechnung berechnet schon die der nächsten)
  s.faktorenRunde = JSON.parse(JSON.stringify(s.faktoren))
  return { ok: true }
}

export function abgabeSpeichern(s, team, d) {
  if (s.status !== 'laeuft' || d.runde !== s.runde) return false
  const R = RAEUME[team.raum]
  if (!hat(R.orte, d.ort) || !hat(R.orte, d.ziel)) return false
  const ueber = hat(R.orte, d.ueber) ? d.ueber : null
  const verkaeufe = {}
  for (const [w, n] of Object.entries(d.verkaeufe || {})) {
    if (hat(R.waren, w) && Number.isInteger(n) && n > 0 && n <= 50) verkaeufe[w] = n
  }
  team.abgaben[s.runde] = { ort: d.ort, ziel: d.ziel, ueber, schutz: !!d.schutz, verkaeufe }
  team.ort = d.ort
  return true
}

export function standSpeichern(s, team, d) {
  const runde = d.ende ? RUNDEN + 1 : d.runde
  if (!Number.isInteger(runde) || runde < 1 || runde > RUNDEN + 1) return false
  const zahl = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(100000, Math.round(x))) : 0)
  team.staende[runde] = {
    ort: hat(RAEUME[team.raum].orte, d.ort) ? d.ort : team.ort,
    silber: zahl(d.silber), wert: zahl(d.wert),
    unglueck: !!d.unglueck, schutz: !!d.schutz, karawanen: zahl(d.karawanen),
    probe: probePruefen(d.probe),
  }
  if (!d.ende) team.ort = team.staende[runde].ort
  return true
}

// Gegenprobe: Würfel und Gefahr mit/ohne Schutz – nur Zahlen zwischen 0 und 1, Ladungswert begrenzt
function probePruefen(p) {
  if (!p || typeof p !== 'object') return null
  const anteil = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : null)
  const wurf = anteil(p.wurf), rMit = anteil(p.rMit), rOhne = anteil(p.rOhne)
  if (wurf == null || rMit == null || rOhne == null) return null
  return { wurf, rMit, rOhne, ladung: Number.isFinite(p.ladung) ? Math.max(0, Math.min(10000, Math.round(p.ladung))) : 0 }
}

export function abrechnen(s) {
  if (s.status !== 'laeuft') return { fehler: 'nicht-laufend' }
  const abgaben = [...s.teams.values()]
    .filter((t) => t.abgaben[s.runde])
    .map((t) => ({ raum: t.raum, ...t.abgaben[s.runde] }))
  const zahl = teamsJeRaum(s)
  s.abrechnung = { runde: s.runde, seed: randomBytes(8).toString('hex'), kontext: abrechnungsKontext(abgaben, zahl) }
  s.faktoren = neueFaktoren(s.faktoren, abgaben, zahl)   // gelten ab der nächsten Runde
  s.status = s.runde >= (s.letzteRunde || RUNDEN) ? 'ende' : 'abgerechnet'
  return { ok: true }
}

/** Wenn die Zeit reißt: nach der zuletzt abgerechneten Runde Schluss. */
export function vorzeitigBeenden(s) {
  if (s.status !== 'abgerechnet') return { fehler: s.status === 'laeuft' ? 'laeuft' : 'ende' }
  s.letzteRunde = s.runde
  s.status = 'ende'
  return { ok: true }
}

/** Was die Geräte sehen. Marktfaktoren: in der laufenden Runde die der Vorrunde. */
export function zustandFuerTeams(s) {
  const runde = s.runde
  return {
    code: s.code,
    runde,
    status: s.status,
    ereignisse: runde ? { ...s.plan[runde - 1] } : {},
    faktoren: s.faktorenRunde || {},
    abrechnung: s.abrechnung,
    letzteRunde: s.letzteRunde || RUNDEN,
  }
}

/** Was die Spielleitung (Beamer) sieht. */
export function zustandFuerLeitung(s) {
  const teams = [...s.teams.values()].map((t) => {
    const letzte = Object.keys(t.staende).map(Number).sort((a, b) => b - a)[0]
    const st = letzte ? t.staende[letzte] : null
    return {
      id: t.id, nr: t.nr, name: t.name, haus: t.haus, raum: t.raum,
      ort: st ? st.ort : t.ort,
      silber: st ? st.silber : START_SILBER,
      wert: st ? st.wert : START_SILBER,
      fertig: !!t.abgaben[s.runde],
      hypothese: t.hypothese,
      verbunden: t.verbunden,
      staende: t.staende,
      abgaben: t.abgaben,
      ende: !!t.staende[RUNDEN + 1],
    }
  })
  return { ...zustandFuerTeams(s), plan: s.plan, teams }
}

// Für Tests
export function _alleLoeschen() { spiele.clear() }
