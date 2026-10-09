/*
  HANDELSREISE – Oberfläche im Gerät (Geschichte 8a/8e, G8.1, ASGSG Marl)
  Regeln und Daten: handelsreise-regeln.js · Karten: handelsreise-karten.js
  Stand im Gerät: localStorage. Mit Raumcode: Klassenmarkt über den Server
  (Socket.io, Namespace /handelsreise). Die Lehrkraft gibt die Runden frei und
  rechnet ab. Fällt der Server aus, spielt das Gerät mit Basiswerten weiter.
*/
import {
  RAEUME, KARTEN, HYPOTHESEN, RUNDEN, START_SILBER, EREIGNISSE, STANDARD_PLAN,
  neuesTeam, ereignisFuer, ziele, preisGruende, EIL_KOSTEN, preis, verkaufspreis, ladungSumme, laderaum,
  risiko, gefahrStufe, karteFuer, karteAnwenden, handeln, reiseAbrechnen,
  rundeAbschliessen, hatSchutz, ladungWert, eilLadung, reiseProbe,
} from './handelsreise-regeln.js'
import { siegel, raumKarte, orientierungsKarte } from './handelsreise-karten.js'

/* ================= EINSTELLUNGEN ================= */
const KEY = 'handelsreise-v1'
const ABGABE_URL = '/api/v1/unterricht/abgabe'   // leer: Abgabe nur als PDF

/* ================= Zustand ================= */
let team = null
let meldung = ''
let startMeldung = ''
let verbinde = false   // Doppeltipp beim Beitreten verhindern
const startWerte = { code: '', team: '', haus: '' }

// Spielstände, die älter als 12 Stunden sind, gehören zu einer anderen Stunde
// (geteilte iPads, Test am Vortag) und werden verworfen.
const MAX_ALTER_MS = 12 * 60 * 60 * 1000

function standGueltig(s) {
  if (!s || s.version !== 1 || !RAEUME[s.raum] || !RAEUME[s.raum].orte[s.ort]) return false
  if (!s.gespeichert || Date.now() - s.gespeichert > MAX_ALTER_MS) return false
  return true
}

function laden() {
  try {
    const r = localStorage.getItem(KEY)
    if (r) {
      const s = JSON.parse(r)
      if (standGueltig(s)) team = s
      else localStorage.removeItem(KEY)
    }
  } catch { /* privat oder gesperrt: ohne Speicher weiter */ }
}
function speichern() {
  if (!team) return
  team.gespeichert = Date.now()
  try { localStorage.setItem(KEY, JSON.stringify(team)) } catch { /* s. o. */ }
}

/* ================= Klassenmarkt ================= */
// team.online = { code, token, id, z } – z ist der letzte Zustand vom Server:
// { runde, status: lobby|laeuft|abgerechnet|ende, ereignisse, faktoren, abrechnung }
const netz = { socket: null, verbunden: false, getrenntSeit: null }
// Der Knopf „ohne Klassenmarkt“ erscheint erst nach längerer Trennung –
// sonst klicken Teams ihn beim Aufwachen des iPads versehentlich.
const OFFLINE_KNOPF_NACH_MS = 20 * 1000
const HINWEIS_NACH_MS = 5 * 1000

function ereignis() {
  const r = Math.min(team.runde, letzte())
  const id = (team.ereignisse || {})[r]
  if (id && EREIGNISSE[id]) return { id, ...EREIGNISSE[id] }
  return ereignisFuer(team.raum, r, STANDARD_PLAN)
}
// Letzte Runde: 5, oder früher, wenn die Lehrkraft das Spiel beendet hat
function letzte() { return (team && team.online && team.online.z && team.online.z.letzteRunde) || RUNDEN }
function faktorenOrt(ort) { return (((team.faktoren || {})[team.runde] || {})[ort]) || {} }

function kurz_getrennt() {
  return !netz.verbunden && netz.getrenntSeit && Date.now() - netz.getrenntSeit > HINWEIS_NACH_MS
}
function lange_getrennt() {
  return !netz.verbunden && netz.getrenntSeit && Date.now() - netz.getrenntSeit > OFFLINE_KNOPF_NACH_MS
}

function socketVerbinden(onConnect) {
  if (typeof window.io !== 'function') return false
  if (netz.socket) { if (onConnect) (netz.verbunden ? onConnect() : netz.socket.once('connect', onConnect)); return true }
  const s = window.io('/handelsreise', { path: '/socket.io', reconnectionDelayMax: 4000 })
  netz.socket = s
  s.on('connect', () => {
    netz.verbunden = true
    netz.getrenntSeit = null
    if (team && team.online) {
      s.emit('team:wieder', { code: team.online.code, token: team.online.token }, (res) => {
        if (res && res.ok) { nachholen(); abgleichen(res.zustand) }
        else if (res && res.fehler === 'unbekannt') { team.online.verloren = true; speichern(); zeichnen() }
      })
    }
    zeichnen()
  })
  s.on('disconnect', () => {
    netz.verbunden = false
    netz.getrenntSeit = Date.now()
    zeichnen()
    setTimeout(zeichnen, HINWEIS_NACH_MS + 500)
    setTimeout(zeichnen, OFFLINE_KNOPF_NACH_MS + 500)
  })
  // Abgewiesene Verbindung (z. B. kurz zu viele Geräte): socket.io gibt dann auf – selbst neu versuchen
  s.on('connect_error', () => { if (!s.active) setTimeout(() => { if (!s.connected) s.connect() }, 3000) })
  s.on('zustand', (z) => abgleichen(z))
  if (onConnect) s.once('connect', onConnect)
  return true
}

// Lebenszeichen: Das iPad fragt regelmäßig nach (und sofort beim Aufwachen).
// Antwortet der Server nicht, ist die Verbindung tot, auch wenn das iPad sie
// noch für offen hält (iPad hat geschlafen, WLAN gewechselt) – dann neu verbinden.
function pruefen() {
  const s = netz.socket
  if (!s || !team || !team.online || team.online.verloren) return
  if (!s.connected) { if (!s.active) s.connect(); return }
  s.timeout(5000).emit('team:wieder', { code: team.online.code, token: team.online.token }, (err, res) => {
    if (!team || !team.online) return
    if (err) { neuVerbinden(); return }
    if (res && res.ok) {
      if (JSON.stringify(res.zustand) !== JSON.stringify(team.online.z)) abgleichen(res.zustand)
    } else if (res && res.fehler === 'unbekannt') { team.online.verloren = true; speichern(); zeichnen() }
  })
}
function neuVerbinden() {
  if (!netz.socket) return socketVerbinden()
  netz.socket.disconnect()
  netz.socket.connect()
}
setInterval(pruefen, 15 * 1000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pruefen() })
window.addEventListener('pageshow', pruefen)
window.addEventListener('online', pruefen)

// Was während eines Funklochs nicht ankam, nach dem Wiederverbinden erneut senden.
// Der Server überschreibt Abgaben und Stände einfach, doppeltes Senden schadet nicht.
function nachholen() {
  if (!team || !team.online) return
  if (team.hypothese.wahl) senden('team:hypothese', { wahl: team.hypothese.wahl })
  if (team.phase === 'unterwegs' && team.reise && team.reise.abgabe) senden('team:abgabe', team.reise.abgabe)
  if (team.runde > letzte() && ['bilanz', 'bericht'].includes(team.phase)) standMelden(true)
}

const LAEUFT = ['ereignis', 'karte', 'markt', 'reise', 'unterwegs', 'warten']

/** Den Stand des Geräts mit dem Zustand des Klassenmarkts abgleichen. */
function abgleichen(z) {
  if (!team || !team.online || !z) return
  if (z.geloescht || z.entfernt) {
    // Spiel gelöscht oder Team entfernt: Gerät soll ohne Klassenmarkt weiterspielen können
    team.online.verloren = true
    netz.getrenntSeit = 0
    speichern(); return zeichnen()
  }
  team.online.z = z
  team.online.verloren = false
  const vorher = team.phase
  if (z.runde >= 1 && z.runde <= RUNDEN) {
    team.ereignisse = team.ereignisse || {}
    team.faktoren = team.faktoren || {}
    if (z.ereignisse && z.ereignisse[team.raum]) team.ereignisse[z.runde] = z.ereignisse[team.raum]
    if (z.faktoren && z.faktoren[team.raum]) team.faktoren[z.runde] = z.faktoren[team.raum]
  }
  // Lehrkraft hat das Spiel vorzeitig beendet: wartende Geräte direkt zum letzten Markttag
  if (team.phase === 'warten' && team.runde > letzte()) { team.phase = 'schlussmarkt'; netz.signal = true; speichern(); return zeichnen() }
  if (['raum', 'hypothese'].includes(team.phase) || team.runde > letzte() || !z.runde) { speichern(); return zeichnen() }

  // 1. Liegt die Abrechnung der eigenen Runde vor, gilt sie – auch wenn die
  //    Lehrkraft schon die nächste Runde freigegeben hat (iPad hat geschlafen).
  const ab = z.abrechnung
  if (ab && ab.runde === team.runde && LAEUFT.includes(team.phase)) {
    if (team.phase !== 'unterwegs') {
      team.reise = { ziel: team.ort, karawane: false }
      team.log.push({ runde: team.runde, art: 'regel', text: 'Ihr wart nicht rechtzeitig fertig und bleibt diese Runde, wo ihr seid.' })
    }
    abrechnenMitProbe(ab.seed, (ab.kontext || {})[team.raum] || {})
    team.phase = 'ergebnis'
    standMelden()
  }

  // 2. Weiter zurück (spät beigetreten, lange offline): vorspulen
  while (team.runde < z.runde && LAEUFT.includes(team.phase)) {
    if (team.phase !== 'warten') {
      team.reise = { ziel: team.ort }
      reiseAbrechnen(team, ereignis(), 'verpasst', {})
      team.log.push({ runde: team.runde, art: 'regel', text: 'Diese Runde habt ihr verpasst. Ihr seid geblieben, wo ihr wart.' })
    }
    rundeAbschliessen(team)
    team.phase = 'warten'
  }

  // 3. Freigabe der Runde, auf die das Gerät wartet
  if (team.runde === z.runde && team.phase === 'warten' && z.status === 'laeuft') team.phase = 'ereignis'
  // 4. Lehrkraft hat das Spiel vorzeitig beendet: direkt zum letzten Markttag
  if (team.phase === 'warten' && team.runde > letzte()) team.phase = 'schlussmarkt'

  if (vorher !== team.phase && ['ereignis', 'ergebnis'].includes(team.phase)) netz.signal = true
  speichern(); zeichnen()
}

// Reise abrechnen und für die Gegenprobe am Beamer festhalten, wie knapp es war
function abrechnenMitProbe(seed, kontext) {
  team.probe = reiseProbe(team, ereignis(), seed, kontext)
  return reiseAbrechnen(team, ereignis(), seed, kontext)
}

/** Gibt true zurück, wenn gesendet wurde. */
function senden(ereignisName, daten) {
  if (netz.socket && netz.verbunden && team.online) {
    netz.socket.emit(ereignisName, { code: team.online.code, token: team.online.token, ...daten })
    return true
  }
  return false
}

function standMelden(ende = false) {
  const unglueck = team.log.some((x) => x.runde === team.runde && x.art === 'unglueck')
  senden('team:stand', {
    runde: ende ? RUNDEN + 1 : team.runde, ort: team.ort, silber: team.silber,
    wert: team.silber + (ende ? 0 : ladungWert(team, null)), unglueck,
    schutz: hatSchutz(team), karawanen: team.log.filter((x) => x.art === 'schutz' && x.text.includes('Karawane')).length,
    probe: ende ? null : team.probe || null,
    ende,
  })
}

function offlineWeiter() {
  team.online = null
  team.log.push({ runde: team.runde, art: 'regel', text: 'Ohne Klassenmarkt weitergespielt: Preise und Gefahren gelten wie üblich, die anderen Häuser wirken nicht mehr auf euch.' })
  if (team.phase === 'warten') team.phase = 'ereignis'
  else if (team.phase === 'unterwegs') { reiseAbrechnen(team, ereignis(), 'geraet', {}); team.phase = 'ergebnis' }
  speichern(); zeichnen()
}

/* ================= Hilfen ================= */
const $ = (id) => document.getElementById(id)
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const raum = () => RAEUME[team.raum]
const ortName = (id) => raum().orte[id].name
const wareName = (id) => raum().waren[id].name
const initiale = () => ((team.haus || team.team || 'H').trim()[0] || 'H').toUpperCase()

// ▲/▼ gegenüber dem üblichen Preis
function pfeil(faktor) {
  if (faktor > 1.001) return ' <span class="auf" title="teurer als üblich">▲</span>'
  if (faktor < 0.999) return ' <span class="ab" title="billiger als üblich">▼</span>'
  return ''
}

function gefahrPunkte(r) {
  const s = gefahrStufe(r)
  if (!s) return '<span class="gefahr g0">keine Gefahr</span>'
  const namen = ['', 'geringe', 'mittlere', 'hohe']
  return `<span class="gefahr g${s}">${'●'.repeat(s)}${'○'.repeat(3 - s)} ${namen[s]} Gefahr</span>`
}

function kontext() {
  const ab = team.online && team.online.z && team.online.z.abrechnung
  // Vor der Abrechnung kennt niemand den Verkehr; Hanse-Anteil aus der Vorrunde, sonst 0.5
  return { hanseAnteil: ab && ab.kontext && ab.kontext.hanse ? ab.kontext.hanse.hanseAnteil : 0.5 }
}

/* ================= Kopfzeile ================= */
function kopf() {
  let netzAnzeige = ''
  if (team.online) {
    netzAnzeige = netz.verbunden
      ? `<span class="netz an" title="Klassenmarkt verbunden">● Klassenmarkt ${esc(team.online.code)}</span>`
      : '<span class="netz aus" title="Keine Verbindung">● keine Verbindung</span>'
  }
  return `<header class="kopf${netz.signal ? ' signal' : ''}">
    <div class="haus">${siegel(initiale(), 44)}<div><b>${esc(team.haus || 'Handelshaus')}</b><small>${esc(team.team)} · ${esc(raum().name)} ${netzAnzeige}</small></div></div>
    <div class="werte">
      <span class="wert"><small>Runde</small><b>${Math.min(team.runde, letzte())} / ${letzte()}</b></span>
      <span class="wert"><small>Silber</small><b>${team.silber}</b></span>
      <span class="wert"><small>Ladung</small><b>${ladungSumme(team)} / ${laderaum(team)}</b></span>
      <span class="wert"><small>Ort</small><b>${esc(ortName(team.ort))}</b></span>
    </div>
    <div class="knoepfe">
      <button type="button" class="kbtn" data-akt="kontorbuch">Kontorbuch</button>
      <button type="button" class="kbtn" data-akt="hilfe">So geht's</button>
    </div>
  </header>`
}

function schritte(aktiv) {
  const liste = [['ereignis', 'Nachricht'], ['karte', 'Entscheidung'], ['markt', 'Markt'], ['reise', 'Reise']]
  if (team && team.online) liste.push(['warten', 'Abrechnung'])
  return `<ol class="schritte">${liste.map(([id, name]) => `<li class="${id === aktiv ? 'an' : ''}">${name}</li>`).join('')}</ol>`
}

function spiel(inhalt, phase, kartenOpt = {}) {
  const karte = raumKarte(team.raum, { hier: team.ort, siegelAuf: [{ ort: team.ort, buchstabe: initiale() }], ...kartenOpt })
  return `${kopf()}<div class="spielflaeche">
    <section class="kartenfeld">${karte}
      <p class="ortinfo"><b>${esc(ortName(team.ort))}:</b> ${esc(raum().orte[team.ort].text)} <span class="beleg">${esc(raum().orte[team.ort].beleg)}</span></p>
      <details class="orientbox"><summary>Wo liegt das? Karte mit heutigen Umrissen</summary>${orientierungsKarte(team.raum)}
        <p class="klein">Heutige Küsten, stark vereinfacht – zur Orientierung, keine Karte aus dem Mittelalter. Rot: euer Handelsraum.</p></details>
    </section>
    <section class="tafel">${netzHinweis()}${phase ? schritte(phase) : ''}${inhalt}</section>
  </div>`
}

function netzHinweis() {
  if (!team || !team.online || team.online.verloren || !kurz_getrennt()) return ''
  return `<div class="netzhinweis" role="status"><b>Keine Verbindung zum Klassenmarkt.</b> Euer Spielstand ist sicher, das iPad versucht es weiter.
    ${lange_getrennt() ? 'Prüft das WLAN. Hilft das nicht: Seite neu laden – der Spielstand bleibt erhalten.' : ''}
    <button type="button" class="btn hell" data-akt="neuverbinden">Neu verbinden</button></div>`
}

/* ================= Ansichten ================= */
const ANSICHT = {
  start() {
    return `<section class="titelblatt">
      <div class="pergament">
        <p class="ueber">Geschichte 8 · Städte und Handel im Mittelalter</p>
        <h1>Handelsreise</h1>
        <p class="zeit">um 1350</p>
        <p class="leitfrage">Wer hat im Fernhandel Erfolg – wer die beste Lage hat, die wertvollste Ware oder wer sich Schutz sichert?</p>
        <div class="regeln">
          <p><b>Ihr seid ein Handelshaus.</b> Ihr reist fünf Runden lang von Stadt zu Stadt, kauft und verkauft Waren und entscheidet, wie viel Schutz ihr euch leistet.</p>
          <p>Die Karten erzählen, was im Buch steht. <b>Alle Zahlen sind Spielwerte</b> – Preise aus dem Mittelalter kennen wir dafür nicht. Die Karten und Räume stammen aus verschiedenen Jahrhunderten; das Spiel setzt sie „um 1350“ zusammen.</p>
          <p class="klein">Bitte nicht im privaten Safari-Fenster spielen – sonst geht euer Stand verloren.</p>
        </div>
        <label for="codeFeld">Raumcode von der Tafel</label>
        <input id="codeFeld" autocomplete="off" inputmode="numeric" maxlength="4" placeholder="z. B. 4821" value="${esc(startWerte.code)}">
        <label for="teamFeld">Eure Vornamen</label>
        <input id="teamFeld" autocomplete="off" maxlength="80" placeholder="z. B. Lea und Tom" value="${esc(startWerte.team)}">
        <label for="hausFeld">Name eures Handelshauses</label>
        <input id="hausFeld" autocomplete="off" maxlength="40" placeholder="z. B. Haus Morgenstern" value="${esc(startWerte.haus)}">
        <p class="meldung">${esc(startMeldung)}</p>
        <button type="button" class="btn-gross" data-akt="gruenden"${verbinde ? ' disabled' : ''}>${verbinde ? 'Verbinde …' : 'Handelshaus gründen'}</button>
      </div>
    </section>`
  },

  raum() {
    const R = raum()
    return spiel(`<div class="blattkarte">
      <p class="ueber">Euer Handelsraum, ausgelost</p>
      <h2>${esc(R.name)}</h2>
      <p class="unter">${esc(R.untertitel)}</p>
      <p>${esc((R.introStart || {})[team.ort] || R.intro)}</p>
      <p class="beleg">Im Buch: ${esc((R.introStartBeleg || {})[team.ort] || R.introBeleg)}</p>
      <p>Ihr startet in <b>${esc(ortName(team.ort))}</b> mit <b>${START_SILBER} Silber</b> und Platz für <b>${team.laderaum} Ladungen</b>.</p>
      <div class="orient-gross">${orientierungsKarte(team.raum)}<p class="klein">Wo liegt euer Handelsraum? Heutige Umrisse, zur Orientierung.</p></div>
      <div class="fussleiste"><button type="button" class="btn" data-akt="weiter-hypothese">Weiter</button></div>
    </div>`, null)
  },

  hypothese() {
    const h = team.hypothese
    return spiel(`<div class="blattkarte">
      <p class="ueber">Bevor ihr losreist</p>
      <h2>Was entscheidet über Erfolg im Fernhandel?</h2>
      <p>Tippt, was ihr vermutet. Am Ende prüft ihr, ob es gestimmt hat.</p>
      <div class="wahl4">${Object.entries(HYPOTHESEN).map(([id, t]) =>
        `<button type="button" class="wahlbtn${h.wahl === id ? ' an' : ''}" data-hyp="${id}">${esc(t)}</button>`).join('')}</div>
      <label for="hypText">Warum vermutet ihr das? (ein Satz)</label>
      <textarea id="hypText" maxlength="300" rows="2">${esc(h.text)}</textarea>
      <p class="meldung">${esc(meldung)}</p>
      <div class="fussleiste"><button type="button" class="btn" data-akt="los">Reise beginnen</button></div>
    </div>`, null)
  },

  warten() {
    const z = team.online && team.online.z
    const ohneNetz = team.online && (team.online.verloren || lange_getrennt())
    const text = team.runde === 1 && (!z || !z.runde)
      ? 'Alle Handelshäuser machen sich bereit. Gleich gibt eure Lehrkraft die erste Runde frei.'
      : `Die anderen Handelshäuser sind noch unterwegs. Gleich gibt eure Lehrkraft Runde ${team.runde} frei.`
    return spiel(`<div class="nachricht warten">
      <p class="ueber">Klassenmarkt · Raumcode ${esc(team.online ? team.online.code : '')}</p>
      <h2>Wartet auf die Freigabe</h2>
      <p>${text}</p>
      <p class="hinweis-gross">Nichts tippen – euer iPad springt von selbst weiter.</p>
      <p class="klein">Schaut solange ins Kontorbuch oder auf die Karte: Wo wollt ihr als Nächstes hin?</p>
      ${ohneNetz ? `<div class="buchstelle"><b>${team.online.verloren ? 'Dieses Spiel gibt es auf dem Server nicht mehr – oder euer Haus wurde entfernt.' : 'Seit einer Weile keine Verbindung zum Klassenmarkt.'}</b> Fragt eure Lehrkraft. Wenn sie es sagt:
        <div class="fussleiste"><button type="button" class="btn hell" data-akt="offline">Ohne Klassenmarkt weiterspielen</button></div></div>` : ''}
    </div>`, 'warten')
  },

  unterwegs() {
    const r = team.reise || {}
    const ohneNetz = (team.online && team.online.verloren) || lange_getrennt()
    const teile = [r.ziel === team.ort ? `Ihr bleibt in ${esc(ortName(team.ort))}` : `Ziel: ${esc(ortName(r.ziel))}`]
    if (r.ueber) teile.push(`Eilreise über ${esc(ortName(r.ueber))}`)
    if (r.karawane) teile.push('mit Karawane')
    else if (hatSchutz(team)) teile.push(`mit Schutz (${esc(raum().schutz.name)})`)
    else teile.push('ohne Schutz')
    return spiel(`<div class="nachricht warten">
      <p class="ueber">Runde ${team.runde} · unterwegs</p>
      <h2>${r.ziel === team.ort ? `Ihr wartet in ${esc(ortName(team.ort))}` : `Unterwegs nach ${esc(ortName(r.ziel))}`}</h2>
      <p class="schutz-an">Abgeschickt ✓ · ${teile.join(' · ')}</p>
      <p>Wenn alle so weit sind, rechnet eure Lehrkraft die Runde ab – dann erfahrt ihr, wie eure Reise ausgegangen ist.</p>
      <p class="hinweis-gross">Nichts tippen – euer iPad springt von selbst weiter.</p>
      <p class="klein">Ob es gefährlich wird, hängt auch davon ab, wie viele andere ohne Schutz dieselbe Strecke fahren.</p>
      ${ohneNetz ? `<div class="buchstelle"><b>${team.online && team.online.verloren ? 'Dieses Spiel gibt es auf dem Server nicht mehr – oder euer Haus wurde entfernt.' : 'Seit einer Weile keine Verbindung zum Klassenmarkt.'}</b> Fragt eure Lehrkraft. Wenn sie es sagt:
        <div class="fussleiste"><button type="button" class="btn hell" data-akt="offline">Ohne Klassenmarkt abrechnen</button></div></div>` : ''}
    </div>`, 'warten', { auswahl: r.ziel, ueber: r.ueber })
  },

  ereignis() {
    const e = ereignis()
    return spiel(`<div class="nachricht">
      <p class="ueber">Runde ${team.runde} · Nachricht</p>
      <h2>${esc(e.titel)}</h2>
      <p>${esc(e.text)}</p>
      ${e.beleg ? `<p class="beleg">Beleg: ${esc(e.beleg)}</p>` : ''}
      <div class="fussleiste"><button type="button" class="btn" data-akt="weiter-karte">Weiter</button></div>
    </div>`, 'ereignis')
  },

  karte() {
    const k = karteFuer(team)
    const wahl = team.karten[k.id]
    let unten
    if (!wahl) {
      // Zweistufig: erst auswählen (Hinweis auf mögliche Folgen), dann festlegen
      const vor = team.kartenVorwahl && team.kartenVorwahl.id === k.id ? team.kartenVorwahl.wahl : null
      const knopf = (w) => {
        const zuTeuer = kartenKosten(k, w) > team.silber
        return `<button type="button" class="wahlbtn${vor === w ? ' an' : ''}" data-wahl="${w}"${zuTeuer ? ' disabled' : ''}>${esc(k[w].text)}${zuTeuer ? '<small>Dafür reicht euer Silber nicht.</small>' : ''}</button>`
      }
      unten = `<div class="wahl2">${knopf('a')}${knopf('b')}</div>
      ${vor ? `<div class="vorwahl"><p><b>Möglich ist:</b> ${esc(k[vor].hinweis || '')}</p>
        <p class="klein">Besprecht euch. Noch könnt ihr umentscheiden.</p>
        <div class="fussleiste"><button type="button" class="btn" data-akt="karte-festlegen">Entscheidung festlegen</button></div></div>`
        : '<p class="klein">Tippt eine Möglichkeit an. Festgelegt wird erst danach.</p>'}`
    } else {
      unten = `<div class="folge"><p class="ueber">Ihr habt entschieden: ${esc(k[wahl].text)}</p><p>${esc(k[wahl].folgeText)}</p></div>
        <div class="buchstelle"><b>Das steht im Buch:</b> ${esc(k.beleg)}<br><i>Spielregel:</i> ${esc(k.spielregel)}</div>
        <div class="fussleiste"><button type="button" class="btn" data-akt="weiter-markt">Weiter zum Markt</button></div>`
    }
    return spiel(`<div class="spielkarte"><p class="ueber">Runde ${team.runde} · Entscheidung</p><h2>${esc(k.titel)}</h2><p>${esc(k.text)}</p>${unten}</div>`, 'karte')
  },

  markt(schluss = false) {
    const R = raum(), e = ereignis(), mf = faktorenOrt(team.ort)
    const angebot = R.orte[team.ort].angebot
    const bericht = []   // Marktbericht: warum Preise heute anders sind
    const zeilen = Object.keys(R.waren).map((w) => {
      const hat = team.ladung[w] || 0
      const kauf = angebot.includes(w) ? preis(team.raum, team.ort, w, e, mf[w] || 1) : null
      const verk = verkaufspreis(team, w, e, mf[w] || 1)
      const g = preisGruende(team.raum, team.ort, w, e, mf[w] || 1)
      for (const x of g.gruende) bericht.push({ ware: wareName(w), ...x })
      return `<tr>
        <th>${esc(wareName(w))}${angebot.includes(w) ? ' <span class="stern" title="hier im Angebot">★</span>' : ''}</th>
        <td class="zahl">${kauf != null ? kauf : '–'}${kauf != null ? pfeil(g.faktor) : ''}</td>
        <td class="zahl">${verk}${pfeil(g.faktor)}</td>
        <td class="zahl"><b>${hat}</b></td>
        <td class="aktion">
          ${!schluss && kauf != null ? `<button type="button" class="mbtn kauf" data-kauf="${w}" aria-label="1 ${esc(wareName(w))} kaufen"${team.silber < kauf || ladungSumme(team) >= laderaum(team) ? ' disabled' : ''}>+1</button>` : ''}
          ${hat ? `<button type="button" class="mbtn verk" data-verk="${w}" aria-label="1 ${esc(wareName(w))} verkaufen">−1</button><button type="button" class="mbtn verk alle" data-verkalle="${w}">alle</button>` : ''}
        </td></tr>`
    }).join('')
    const titel = schluss ? 'Letzter Markttag' : `Markt in ${esc(ortName(team.ort))}`
    const hinweis = schluss
      ? 'Die Reise ist vorbei. Verkauft, was ihr noch geladen habt – was übrig bleibt, zählt nicht mit.'
      : 'Kaufen könnt ihr nur Waren mit ★. Verkaufen könnt ihr alles, was ihr geladen habt.'
    const saettigung = bericht.length
      ? `<div class="marktbericht"><b>Marktbericht:</b><ul>${bericht.map((x) => `<li><span class="${x.richtung === 'auf' ? 'auf' : 'ab'}">${x.richtung === 'auf' ? '▲' : '▼'}</span> ${esc(x.ware)}: ${esc(x.text)}</li>`).join('')}</ul></div>`
      : '<p class="klein">Marktbericht: Heute gelten hier die üblichen Preise.</p>'
    return spiel(`<div class="markt">
      <p class="ueber">${schluss ? 'Ende der Reise' : `Runde ${team.runde} · Markt`}</p>
      <h2>${titel}</h2>
      <p class="klein">${hinweis}</p>
      ${schluss ? '' : `<p class="klein knapp">Noch ${team.silber} Silber · Platz für ${laderaum(team) - ladungSumme(team)} weitere Ladungen</p>`}
      <p class="meldung">${esc(meldung)}</p>
      <table class="preise"><thead><tr><th>Ware</th><th>Kaufen für</th><th>Verkaufen für</th><th>Geladen</th><th class="aktion">Handeln</th></tr></thead><tbody>${zeilen}</tbody></table>
      ${saettigung}
      ${schluss ? '' : anderswo()}
      <div class="fussleiste"><button type="button" class="btn" data-akt="${schluss ? 'bilanz' : 'weiter-reise'}">${schluss ? 'Bilanz ziehen' : 'Weiter zur Reise'}</button></div>
    </div>`, schluss ? null : 'markt')
  },

  reise() {
    const R = raum(), e = ereignis()
    const wahl = team.reise || { ziel: null, ueber: null, karawane: false }
    const tmp = { ...team, reise: wahl }
    const optionen = ziele(team.raum, team.ort).map(({ ort, ueber, strecken }) => {
      const r = risiko(tmp, ort, e, kontext(), ueber)
      const an = wahl.ziel === ort && (wahl.ueber || null) === ueber
      let titel, unter, gesperrt = false
      if (ort === team.ort) { titel = `In ${esc(ortName(ort))} bleiben`; unter = 'keine Reise · ihr hört euch um: nächste Runde kennt ihr die aktuellen Preise aller Orte' }
      else if (ueber) {
        gesperrt = ladungSumme(team) > eilLadung(team)
        titel = `Eilreise nach ${esc(ortName(ort))}`
        unter = `über ${esc(ortName(ueber))}, ohne Halt · kostet ${EIL_KOSTEN} Silber · höchstens ${eilLadung(team)} Ladungen · zwei Strecken = mehr Gefahr`
        if (gesperrt) unter += ' · <b>zu viel geladen</b>'
      }
      else { titel = `Nach ${esc(ortName(ort))}`; unter = esc(strecken[0].name) }
      return `<button type="button" class="zielbtn${ueber ? ' eil' : ''}${an ? ' an' : ''}" data-ziel="${ort}"${ueber ? ` data-ueber="${ueber}"` : ''}${gesperrt ? ' disabled' : ''}>
        <b>${titel}</b><small>${unter}</small>${gefahrPunkte(r)}</button>`
    }).join('')
    const sch = R.schutz
    let schutz
    if (sch.dauer === 'spiel') {
      schutz = team.flags[sch.id]
        ? `<p class="schutz-an">✓ ${esc(sch.name)} – gilt bis Spielende.</p>`
        : `<p>${esc(sch.text)}</p><button type="button" class="btn hell" data-akt="schutz-kaufen">${esc(sch.name)} für ${sch.kosten} Silber</button>`
    } else {
      schutz = `<p>${esc(sch.text)}</p><button type="button" class="btn hell${wahl.karawane ? ' an' : ''}" data-akt="karawane">${wahl.karawane ? '✓ ' : ''}${esc(sch.name)} (${sch.kosten} Silber)</button>`
    }
    const knopf = wahl.ziel === team.ort ? 'Runde beenden' : 'Losreisen'
    const kosten = reiseKosten(wahl)
    const zusammen = wahl.ziel ? `<p class="klein knapp">${wahl.ziel === team.ort ? 'Ihr bleibt.' : `Ziel ${esc(ortName(wahl.ziel))}${wahl.ueber ? ' (Eilreise)' : ''}`}${kosten ? ` · kostet zusammen ${kosten} Silber` : ''} · danach könnt ihr nichts mehr ändern.</p>` : ''
    return spiel(`<div class="reise">
      <p class="ueber">Runde ${team.runde} · Reise</p>
      <h2>Wohin geht die Reise?</h2>
      <p class="klein">Tippt auf ein Ziel<span class="nur-breit"> – hier oder auf der Karte</span>.${team.online ? ' Fahren viele ohne Schutz dieselbe Strecke, wird sie gefährlicher.' : ''}</p>
      <div class="ziele">${optionen}</div>
      <div class="schutzbox"><h3>Schutz</h3>${schutz}<p class="beleg">${esc(sch.beleg)}</p></div>
      <p class="meldung">${esc(meldung)}</p>
      ${zusammen}
      <div class="fussleiste">
        <button type="button" class="btn hell" data-akt="zurueck-markt">Zurück zum Markt</button>
        <button type="button" class="btn" data-akt="losreisen"${wahl.ziel ? '' : ' disabled'}>${knopf}</button>
      </div>
    </div>`, 'reise', { auswahl: wahl.ziel, ueber: wahl.ueber, klickbar: true })
  },

  ergebnis() {
    const eintraege = team.log.filter((x) => x.runde === team.runde && ['reise', 'unglueck', 'regel', 'abgabe'].includes(x.art))
    const liste = eintraege.map((x) => {
      let extra = ''
      if (x.verloren && Object.keys(x.verloren).length) extra = `<br><small>Verloren: ${Object.entries(x.verloren).map(([w, n]) => `${n} ${esc(wareName(w))}`).join(', ')}</small>`
      if (x.verkauft) extra = `<br><small>Verkauft: ${Object.entries(x.verkauft).map(([w, n]) => `${n} ${esc(wareName(w))}`).join(', ')}</small>`
      if (x.art === 'unglueck' && x.silber) extra += `<br><small>Ihr hattet keine Ladung – Räuber nehmen ${-x.silber} Silber.</small>`
      return `<li class="e-${x.art}">${esc(x.text)}${extra}</li>`
    }).join('')
    const istLetzte = team.runde >= letzte()
    return spiel(`<div class="ergebnis">
      <p class="ueber">Runde ${team.runde} · Abrechnung</p>
      <h2>${eintraege.some((x) => x.art === 'unglueck') ? 'Ein schwerer Schlag' : 'Die Runde ist vorbei'}</h2>
      <ul class="ereignisliste">${liste}</ul>
      <p>Ihr habt jetzt <b>${team.silber} Silber</b> und <b>${ladungSumme(team)} Ladungen</b> an Bord.</p>
      <div class="fussleiste"><button type="button" class="btn" data-akt="naechste">${istLetzte ? 'Zum letzten Markttag' : 'Weiter'}</button></div>
    </div>`, null)
  },

  schlussmarkt() { return ANSICHT.markt(true) },

  bilanz() {
    const b = bilanzDaten()
    const punkte = [...team.verlauf.map((v) => ({ name: v.runde === 0 ? 'Start' : `R${v.runde}`, wert: v.wert ?? v.silber })), { name: 'Ende', wert: team.silber }]
    const max = Math.max(...punkte.map((p) => p.wert), 1)
    const balken = punkte.map((p) => `<div class="balken"><b>${p.wert}</b><span style="height:${Math.round((p.wert / max) * 85)}%"></span><small>${p.name}</small></div>`).join('')
    return spiel(`<div class="bilanz">
      <p class="ueber">Ende der Reise</p>
      <h2>Bilanz eures Handelshauses</h2>
      <p class="gross">${START_SILBER} Silber → <b>${team.silber} Silber</b></p>
      <p class="klein">Wert eures Handelshauses nach jeder Runde: Silber in der Kasse plus Ladung zum üblichen Preis am Ort.</p>
      <div class="balkenreihe">${balken}</div>
      <ul class="fakten">
        <li>Unglücke unterwegs: <b>${b.unglueck}</b> von ${b.reisen} Reisen</li>
        <li>Schutz: <b>${esc(b.schutz)}</b></li>
        <li>Abgaben und Stapelrecht: <b>${b.abgaben} Silber</b></li>
        <li>Eure Vermutung am Anfang: <b>${esc(HYPOTHESEN[team.hypothese.wahl] || '–')}</b></li>
      </ul>
      <p class="klein">Das Spielergebnis wird nicht bewertet – es hat einen Glücksanteil. Bewertet wird euer Reisebericht.</p>
      <div class="fussleiste"><button type="button" class="btn" data-akt="bericht">Reisebericht schreiben</button></div>
    </div>`, null)
  },

  bericht() {
    const b = team.bericht
    const frage = (id, titel, hilfe) => `<label for="${id}"><b>${titel}</b><small>${hilfe}</small></label>
      <textarea id="${id}" data-bericht="${id}" maxlength="800" rows="4">${esc(b[id])}</textarea>`
    return spiel(`<div class="bericht">
      <p class="ueber">Reisebericht · ${esc(team.haus || '')} · ${esc(team.team)}</p>
      <h2>Euer Reisebericht</h2>
      <p class="klein">Belegt eure Antworten: Nennt eine Karte, eine Runde aus dem Kontorbuch oder eine Buchseite.</p>
      ${frage('f1', '1. Was hat euer Handelshaus gerettet oder ruiniert?', 'Belegt mit einer Karte, einer Runde oder einer Buchstelle.')}
      ${frage('f2', '2. Hat eure Vermutung vom Anfang gestimmt?', `Ihr habt vermutet: ${esc(HYPOTHESEN[team.hypothese.wahl] || '–')}. Begründet mit eurem Spiel und dem der Klasse.`)}
      ${frage('f3', '3. Wer hat die Regeln gemacht? Welche Spielregel hat entschieden, ob sich Schutz lohnt – und was fehlt im Spiel, das im Buch steht?', 'Denkt an die Seiten 24–33 und an „Woher stammt das?“ unten auf der Seite.')}
      <p class="meldung">${esc(meldung)}</p>
      <div class="fussleiste">
        <button type="button" class="btn hell" data-akt="kontorbuch">Kontorbuch ansehen</button>
        <button type="button" class="btn hell" data-akt="pdf" title="Am iPad: Im Druckfenster die Vorschau mit zwei Fingern aufziehen, dann Teilen → In Dateien sichern">Als PDF sichern</button>
        ${ABGABE_URL ? `<button type="button" class="btn gruen" data-akt="abschicken">${team.abgegeben ? 'Noch einmal schicken' : 'Bericht abschicken'}</button>` : ''}
      </div>
      <p class="klein">PDF am iPad: „Als PDF sichern“ tippen, im Druckfenster die Vorschau mit zwei Fingern aufziehen, dann oben „Teilen“ → „In Dateien sichern“ oder AirDrop.</p>
      ${team.abgegeben ? '<p class="schutz-an">Abgegeben ✓ – ihr könnt verbessern und noch einmal schicken, es zählt der letzte.</p>' : ''}
    </div>`, null)
  },
}

function anderswo() {
  const R = raum(), e = ereignis()
  const orte = Object.keys(R.orte).filter((o) => o !== team.ort)
  const aktuell = !!team.mods.info
  if (!aktuell) {
    // Ohne Neuigkeiten kennt ihr keine Preise – nur, was wo angeboten und gefragt ist
    const zeilen = orte.map((o) => `<li><b>${esc(ortName(o))}:</b> bietet ${R.orte[o].angebot.map((w) => esc(wareName(w))).join(', ')} · gefragt: ${gefragt(o).map((w) => esc(wareName(w))).join(', ')}</li>`).join('')
    return `<div class="anderswo"><p class="klein"><b>Andere Städte</b> – die Preise dort kennt ihr nicht. Wer in einer Stadt bleibt und sich umhört (oder im Kontor mitredet), erfährt sie für die nächste Runde.</p><ul class="klein orte-liste">${zeilen}</ul></div>`
  }
  const kopfzeile = orte.map((o) => `<th>${esc(ortName(o))}</th>`).join('')
  const zeilen = Object.keys(R.waren).map((w) => `<tr><th>${esc(wareName(w))}</th>${orte.map((o) => {
    const p = preis(team.raum, o, w, e, faktorenOrt(o)[w] || 1)
    const f = preisGruende(team.raum, o, w, e, faktorenOrt(o)[w] || 1).faktor
    return `<td class="zahl">${p}${R.orte[o].angebot.includes(w) ? '★' : ''}${pfeil(f)}</td>`
  }).join('')}</tr>`).join('')
  return `<details class="anderswo" open><summary>${team.mods.infoGrund === 'bleiben' ? 'Aktuelle Preise in den anderen Städten (ihr habt euch umgehört)' : 'Aktuelle Preise in den anderen Städten (aus dem Kontor)'}</summary>
    <table class="preise klein"><thead><tr><th></th>${kopfzeile}</tr></thead><tbody>${zeilen}</tbody></table></details>`
}

// Was eine Stadt besonders braucht: die zwei teuersten Waren, die sie nicht selbst anbietet
function gefragt(ort) {
  const R = raum()
  return Object.keys(R.waren).filter((w) => !R.orte[ort].angebot.includes(w))
    .sort((a, b) => R.preise[ort][b] - R.preise[ort][a]).slice(0, 2)
}

// Kosten einer Kartenwahl (für die Sperre bei zu wenig Silber)
function kartenKosten(k, w) {
  let f = k[w].folgen
  if (f.bedingt) f = team.flags[f.bedingt.flag] ? f.bedingt.ja : f.bedingt.nein
  return f.silber < 0 ? -f.silber : 0
}

// Was die gewählte Reise zusätzlich kostet
function reiseKosten(r) {
  if (!r || !r.ziel || r.ziel === team.ort) return 0
  return (r.karawane ? raum().schutz.kosten : 0) + (r.ueber ? EIL_KOSTEN : 0)
}

function bilanzDaten() {
  const reisen = team.log.filter((x) => x.art === 'reise' && x.risiko > 0).length + team.log.filter((x) => x.art === 'unglueck').length
  const unglueck = team.log.filter((x) => x.art === 'unglueck').length
  const abgaben = -team.log.filter((x) => x.art === 'abgabe').reduce((s, x) => s + x.silber, 0)
  const sch = []
  if (team.flags.hanse) sch.push('Mitglied der Hanse')
  if (team.flags.geleit) sch.push('Geleitbrief der Mongolen')
  const karawanen = team.log.filter((x) => x.art === 'schutz' && x.text.includes('Karawane')).length
  if (karawanen) sch.push(`${karawanen}× mit Karawane`)
  return { reisen, unglueck, abgaben, schutz: sch.join(', ') || 'keiner' }
}

/* ================= Overlays ================= */
function overlay(html) { $('ovBlatt').innerHTML = `<button type="button" class="zu" data-akt="zu" aria-label="Schließen">×</button>${html}`; $('ov').hidden = false }

function kontorbuchZeilen() {
  const runden = [...new Set(team.log.map((x) => x.runde))]
  const titel = (r) => (r === 0 ? 'Gründung' : r > letzte() ? 'Letzter Markttag' : `Runde ${r}`)
  const waren = (o) => Object.entries(o).map(([w, n]) => `${n} ${wareName(w)}`).join(', ')
  return runden.map((r) => ({
    titel: titel(r),
    zeilen: team.log.filter((x) => x.runde === r).map((x) => {
      let t
      if (x.art === 'kauf') t = `Kauf: ${x.menge} ${wareName(x.ware)} in ${ortName(x.ort)}`
      else if (x.art === 'verkauf') t = `Verkauf: ${x.menge} ${wareName(x.ware)} in ${ortName(x.ort)}`
      else if (x.art === 'nachricht') t = `Nachricht: ${x.text}`
      else {
        t = x.text
        if (x.verloren && Object.keys(x.verloren).length) t += ` Verloren: ${waren(x.verloren)}.`
        if (x.verkauft) t += ` (${waren(x.verkauft)})`
      }
      return { art: x.art, silber: x.silber || 0, text: t }
    }),
  }))
}

function kontorbuchHtml() {
  const runden = kontorbuchZeilen()
  if (!runden.length) return '<p>Noch keine Einträge.</p>'
  return runden.map((r) => `<h3>${r.titel}</h3><ul class="kontor">${r.zeilen.map((z) => {
    const betrag = z.silber ? `<span class="betrag ${z.silber > 0 ? 'plus' : 'minus'}">${z.silber > 0 ? '+' : ''}${z.silber}</span>` : '<span class="betrag"></span>'
    const kl = z.art === 'nachricht' ? 'k-nachricht' : z.art === 'unglueck' ? 'k-unglueck' : ''
    return `<li class="${kl}">${betrag}${esc(z.text)}</li>`
  }).join('')}</ul>`).join('')
}

function hilfeHtml() {
  return `<p class="ueber">So geht's</p><h2>Eine Runde hat vier Schritte</h2>
  <ol class="hilfe-liste">
    <li><b>Nachricht:</b> Was gerade in eurem Handelsraum passiert. Es gilt für diese Runde.</li>
    <li><b>Entscheidung:</b> Eine Karte mit zwei Möglichkeiten. Danach seht ihr, was im Buch dazu steht.</li>
    <li><b>Markt:</b> Kaufen (nur Waren mit ★) und verkaufen. Euer Laderaum ist begrenzt.</li>
    <li><b>Reise:</b> Ziel wählen, Schutz überlegen, losreisen. Je mehr Punkte ●, desto gefährlicher. Bei einem Unglück verliert ihr ein Drittel eurer Ladung. Eine Eilreise überspringt eine Stadt: teurer, gefährlicher und nur mit halber Ladung.</li>
  </ol>
  <p><b>Klassenmarkt:</b> Eure Lehrkraft gibt jede Runde frei und rechnet sie ab, wenn alle losgereist sind. Was die anderen tun, wirkt auf euch: Verkaufen viele dieselbe Ware am selben Ort, sinkt dort der Preis. Fahren viele ohne Schutz dieselbe Strecke, wird sie gefährlicher. Und die Hanse schützt umso besser, je mehr Handelshäuser Mitglied sind.</p>
  <p>Nach fünf Runden gibt es einen letzten Markttag. Dann zieht ihr Bilanz und schreibt euren Reisebericht.</p>
  <p><b>Bleiben:</b> Wer eine Runde in seiner Stadt bleibt, hört sich um und kennt in der nächsten Runde die Preise aller Städte. Sonst kennt ihr nur die Preise dort, wo ihr seid.</p>
  <p><b>iPad gesperrt oder Seite neu geladen?</b> Einfach weiterspielen – euer Stand ist im iPad gespeichert. Nur nicht im privaten Fenster spielen.</p>
  <div class="fussleiste"><button type="button" class="btn" data-akt="zu">Verstanden</button></div>`
}

function quellenHtml() {
  const imSpiel = new Set(Object.values(RAEUME).flatMap((R) => R.karten))
  const zeilen = Object.entries(KARTEN).filter(([id]) => imSpiel.has(id)).map(([, k]) => `<li><b>${esc(k.titel)}:</b> ${esc(k.beleg)} <i>${esc(k.spielregel)}</i></li>`).join('')
  const ereig = Object.values(EREIGNISSE).filter((e) => e.beleg).map((e) => `<li><b>${esc(e.titel)}:</b> ${esc(e.beleg)}</li>`).join('')
  return `<p class="ueber">Woher stammt das?</p><h2>Quellen der Karten</h2>
  <p>Das Spiel ist eine <b>Darstellung</b>: Jemand hat entschieden, was hineinkommt und was nicht. Die Texte der Karten stützen sich auf <i>Geschichte und Geschehen 2</i> (Klett), Seiten 24–33. <b>Alle Zahlen sind im Spiel ausgedacht.</b> Was ausgedacht ist, steht bei jeder Karte dabei. Und: Das Spiel lässt den Menschenhandel weg, obwohl das Buch ihn nennt (S. 31 VT7, S. 33 Q4).</p>
  <details class="quellen-details" open><summary><b>Entscheidungskarten</b></summary><ul class="quellen">${zeilen}</ul></details>
  <details class="quellen-details"><summary><b>Nachrichten</b></summary><ul class="quellen">${ereig}</ul></details>
  <h3>Waren, Orte und Karten</h3><p class="klein">Seidenstraße: S. 28 VT1. Samarkand: S. 29 D1. Hanse: S. 24 D1, S. 30 VT2. Sahara: S. 31 VT7 und D1, Sidschilmasa auf D1. Welche Ware an welchem Ort günstig ist, ist vereinfacht. Die Karten sind selbst gezeichnete Skizzen; die Orientierungskarte zeigt heutige Küsten.</p>`
}

/* ================= Druckfassung ================= */
function druckHtml() {
  const b = team.bericht
  return `<div class="druck">
    <h1>Reisebericht – Handelsreise</h1>
    <p><b>${esc(team.haus || 'Handelshaus')}</b> · ${esc(team.team)} · ${esc(raum().name)} · ${new Date().toLocaleDateString('de-DE')}</p>
    <p>Vermutung am Anfang: <b>${esc(HYPOTHESEN[team.hypothese.wahl] || '–')}</b> – ${esc(team.hypothese.text)}</p>
    <p>Bilanz: ${START_SILBER} → ${team.silber} Silber</p>
    <h2>1. Was hat euer Handelshaus gerettet oder ruiniert?</h2><p>${esc(b.f1).replace(/\n/g, '<br>')}</p>
    <h2>2. Hat eure Vermutung vom Anfang gestimmt?</h2><p>${esc(b.f2).replace(/\n/g, '<br>')}</p>
    <h2>3. Wer hat die Regeln gemacht – und was fehlt im Spiel?</h2><p>${esc(b.f3).replace(/\n/g, '<br>')}</p>
    <h2>Kontorbuch</h2>${kontorbuchHtml()}
    <p class="klein">ASGSG Marl · Geschichte 8 · G8.1 Handelsreise · Alle Zahlen sind Spielwerte</p>
  </div>`
}

/* ================= Abgabe ================= */
function nutzlast() {
  return {
    aufgabe: 'handelsreise',
    team: team.team,
    haus: team.haus || '',
    raum: team.raum,
    code: team.online ? team.online.code : '',
    hypothese: { wahl: team.hypothese.wahl, text: team.hypothese.text || '' },
    bericht: { f1: team.bericht.f1 || '', f2: team.bericht.f2 || '', f3: team.bericht.f3 || '' },
    bilanz: { start: START_SILBER, ende: team.silber, unglueck: bilanzDaten().unglueck, schutz: bilanzDaten().schutz },
    entscheidungen: Object.fromEntries(Object.entries(team.karten).map(([id, w]) => [id, w])),
    kontorbuch: kontorbuchZeilen().flatMap((r) => r.zeilen.map((z) => `${r.titel}: ${z.text}${z.silber ? ` (${z.silber > 0 ? '+' : ''}${z.silber})` : ''}`.slice(0, 140))).slice(-60),
  }
}

function abschicken() {
  meldung = 'Wird gesendet …'; zeichnen()
  fetch(ABGABE_URL, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'signifikation-app' },
    body: JSON.stringify(nutzlast()),
  }).then((r) => {
    if (r.status === 400) return r.json().then((j) => { meldung = `Der Bericht wurde nicht angenommen: ${j.error || 'ungültige Eingabe'}. Sagt eurer Lehrkraft Bescheid und sichert ihn als PDF.` })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    team.abgegeben = true; meldung = 'Abgegeben ✓'
  }).catch(() => {
    meldung = 'Senden hat nicht geklappt. Prüft das WLAN und versucht es noch einmal – oder sichert den Bericht als PDF.'
  }).finally(() => { speichern(); zeichnen() })
}

/* ================= Zeichnen ================= */
function zeichnen() {
  const phase = team ? team.phase : 'start'
  const fokus = document.activeElement && document.activeElement.id
  $('app').innerHTML = (ANSICHT[phase] || ANSICHT.start)()
  document.body.dataset.phase = phase
  if (fokus && $(fokus) && $(fokus).tagName === 'TEXTAREA') $(fokus).focus()
  meldung = ''
  netz.signal = false
}

function weiter(phase) { team.phase = phase; speichern(); zeichnen(); window.scrollTo(0, 0) }

/* ================= Aktionen ================= */
const AKTION = {
  gruenden() {
    const name = $('teamFeld').value.trim()
    const haus = $('hausFeld').value.trim()
    const code = $('codeFeld').value.trim()
    Object.assign(startWerte, { code, team: name, haus })
    if (!name) { startMeldung = 'Tragt zuerst eure Vornamen ein.'; return zeichnen() }
    if (!code) {
      // Ohne Code: allein im Gerät spielen (Ausweichweg)
      if (!confirm('Ohne Raumcode spielt ihr allein, ohne Klassenmarkt. Wirklich ohne Code?')) return
      const raeume = Object.keys(RAEUME)
      const raumId = raeume[Math.floor(Math.random() * raeume.length)]
      const starts = RAEUME[raumId].startorte
      team = neuesTeam({ team: name, haus, raum: raumId, ort: starts[Math.floor(Math.random() * starts.length)] })
      return weiter('raum')
    }
    if (!/^\d{4}$/.test(code)) { startMeldung = 'Der Raumcode hat vier Ziffern.'; return zeichnen() }
    if (verbinde) return
    verbinde = true
    startMeldung = 'Verbinde mit dem Klassenmarkt …'; zeichnen()
    const ok = socketVerbinden(() => {
      netz.socket.emit('team:beitreten', { code, name, haus }, (res) => {
        verbinde = false
        if (team) return   // spätes Ack nach erneutem Tippen: bestehendes Team nicht überschreiben
        if (!res || !res.ok) {
          startMeldung = ({ unbekannt: 'Diesen Raumcode gibt es nicht. Schaut noch einmal an die Tafel.', voll: 'Das Spiel ist voll. Sagt eurer Lehrkraft Bescheid.', ende: 'Dieses Spiel ist schon vorbei.', zuviele: 'Zu viele Versuche. Ladet die Seite neu und versucht es noch einmal.' })[res && res.fehler] || 'Beitreten hat nicht geklappt. Versucht es noch einmal.'
          return zeichnen()
        }
        team = neuesTeam({ team: name, haus, raum: res.raum, ort: res.ort })
        team.online = { code, token: res.token, id: res.id, z: null }
        team.seedId = res.id   // eigener Würfel, auch bei gleichen Vornamen
        team.phase = 'raum'
        abgleichen(res.zustand)
        window.scrollTo(0, 0)
      })
    })
    if (!ok) { verbinde = false; startMeldung = 'Der Klassenmarkt ist nicht erreichbar. Fragt eure Lehrkraft.'; zeichnen() }
    setTimeout(() => { if (!team && verbinde) { verbinde = false; startMeldung = 'Keine Verbindung zum Klassenmarkt. Prüft das WLAN und tippt noch einmal.'; zeichnen() } }, 8000)
  },
  'weiter-hypothese'() {
    weiter('hypothese')
    if (!team.hilfeGezeigt) { team.hilfeGezeigt = true; speichern(); overlay(hilfeHtml()) }
  },
  los() {
    team.hypothese.text = $('hypText').value.trim()
    if (!team.hypothese.wahl) { meldung = 'Wählt zuerst eine Vermutung.'; speichern(); return zeichnen() }
    team.log.push({ runde: 0, art: 'start', text: `Handelshaus gegründet in ${ortName(team.ort)} mit ${START_SILBER} Silber.` })
    senden('team:hypothese', { wahl: team.hypothese.wahl })
    if (team.online) { team.phase = 'warten'; abgleichen(team.online.z); window.scrollTo(0, 0) } else weiter('ereignis')
  },
  'weiter-karte'() {
    if (!team.log.some((x) => x.runde === team.runde && x.art === 'nachricht')) {
      team.log.push({ runde: team.runde, art: 'nachricht', ereignis: ereignis().id, text: ereignis().titel })
    }
    weiter(karteFuer(team) ? 'karte' : 'markt')
  },
  'karte-festlegen'() {
    const k = karteFuer(team)
    const v = team.kartenVorwahl
    if (!k || !v || v.id !== k.id || team.karten[k.id]) return
    team.log.push({ runde: team.runde, ...karteAnwenden(team, k.id, v.wahl) })
    delete team.kartenVorwahl
    speichern(); zeichnen()
  },
  'weiter-markt'() { weiter('markt') },
  'weiter-reise'() { if (!team.reise) team.reise = { ziel: null, ueber: null, karawane: false }; weiter('reise') },
  'zurueck-markt'() { weiter('markt') },
  'schutz-kaufen'() {
    const s = raum().schutz
    if (team.silber < s.kosten) { meldung = 'Dafür reicht euer Silber nicht.'; return zeichnen() }
    team.silber -= s.kosten
    team.flags[s.id] = true
    team.log.push({ runde: team.runde, art: 'schutz', silber: -s.kosten, text: s.name })
    speichern(); zeichnen()
  },
  karawane() { team.reise.karawane = !team.reise.karawane; speichern(); zeichnen() },
  losreisen() {
    const r = team.reise
    if (!r || !r.ziel) return
    const s = raum().schutz
    if (r.ziel === team.ort) { r.karawane = false; r.ueber = null }
    if (r.ueber && ladungSumme(team) > eilLadung(team)) { meldung = `Für die Eilreise habt ihr zu viel geladen (höchstens ${eilLadung(team)}).`; return zeichnen() }
    // Erst prüfen, ob alles zusammen bezahlbar ist – dann buchen
    if (team.silber < reiseKosten(r)) { meldung = `Dafür reicht euer Silber nicht (nötig: ${reiseKosten(r)}).`; return zeichnen() }
    if (r.karawane) {
      team.silber -= s.kosten
      team.log.push({ runde: team.runde, art: 'schutz', silber: -s.kosten, text: s.name })
    }
    if (r.ueber) {
      team.silber -= EIL_KOSTEN
      team.log.push({ runde: team.runde, art: 'schutz', silber: -EIL_KOSTEN, text: `Eilreise über ${ortName(r.ueber)}` })
    }
    if (team.online) {
      const verkaeufe = {}
      for (const x of team.log) if (x.runde === team.runde && x.art === 'verkauf' && x.ort === team.ort) verkaeufe[x.ware] = (verkaeufe[x.ware] || 0) + x.menge
      r.abgabe = { runde: team.runde, ort: team.ort, ziel: r.ziel, ueber: r.ueber || null, schutz: hatSchutz(team), verkaeufe }
      senden('team:abgabe', r.abgabe)   // geht bei Funkloch nach dem Wiederverbinden erneut raus
      team.phase = 'unterwegs'
      abgleichen(team.online.z)   // falls die Lehrkraft schon abgerechnet hat
      return window.scrollTo(0, 0)
    }
    reiseAbrechnen(team, ereignis(), 'geraet', kontext())
    weiter('ergebnis')
  },
  naechste() {
    rundeAbschliessen(team)
    if (team.runde > letzte()) return weiter('schlussmarkt')
    if (team.online) { team.phase = 'warten'; abgleichen(team.online.z); return window.scrollTo(0, 0) }
    weiter('ereignis')
  },
  bilanz() { standMelden(true); weiter('bilanz') },
  bericht() { weiter('bericht') },
  neuverbinden() { neuVerbinden(); zeichnen() },
  offline() {
    if (!confirm('Ohne Klassenmarkt weiterspielen? Das sollte eure Lehrkraft entscheiden. Zurück zum Klassenmarkt geht es danach nicht mehr.')) return
    offlineWeiter()
  },
  kontorbuch() { overlay(`<p class="ueber">${esc(team.haus || 'Handelshaus')} · ${esc(team.team)}</p><h2>Kontorbuch</h2>${kontorbuchHtml()}`) },
  hilfe() { overlay(hilfeHtml()) },
  zu() { $('ov').hidden = true },
  pdf() {
    let d = $('druck')
    if (!d) { d = document.createElement('div'); d.id = 'druck'; document.body.appendChild(d) }
    d.innerHTML = druckHtml()
    window.print()
  },
  abschicken() { abschicken() },
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-akt],[data-hyp],[data-wahl],[data-kauf],[data-verk],[data-verkalle],[data-ziel]')
  if (!t) { if (ev.target === $('ov')) $('ov').hidden = true; return }
  const d = t.dataset
  if (d.akt) return AKTION[d.akt] && AKTION[d.akt]()
  if (!team) return
  if (d.hyp) { team.hypothese.wahl = d.hyp; team.hypothese.text = $('hypText').value; speichern(); return zeichnen() }
  if (d.wahl) {
    const k = karteFuer(team)
    if (!team.karten[k.id]) team.kartenVorwahl = { id: k.id, wahl: d.wahl }
    speichern(); return zeichnen()
  }
  const e = ereignis(), mf = faktorenOrt(team.ort)
  if (d.kauf) { meldung = handeln(team, d.kauf, 1, e, mf) || ''; speichern(); return zeichnen() }
  if (d.verk) { meldung = handeln(team, d.verk, -1, e, mf) || ''; speichern(); return zeichnen() }
  if (d.verkalle) { meldung = handeln(team, d.verkalle, -(team.ladung[d.verkalle] || 0), e, mf) || ''; speichern(); return zeichnen() }
  if (d.ziel && team.phase === 'reise') { team.reise.ziel = d.ziel; team.reise.ueber = d.ueber || null; speichern(); return zeichnen() }
})

document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('g[data-ziel]')) {
    ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
})

document.addEventListener('input', (ev) => {
  if (!team) return
  const id = ev.target.dataset && ev.target.dataset.bericht
  if (id) { team.bericht[id] = ev.target.value; speichern() }
  if (ev.target.id === 'hypText') { team.hypothese.text = ev.target.value; speichern() }
})

$('quellenBtn').onclick = () => overlay(quellenHtml())
$('resetBtn').onclick = () => {
  if (!confirm('Wirklich neu anfangen? Euer ganzes Handelshaus ist dann weg.')) return
  if (!confirm('Ganz sicher? Das kann man nicht rückgängig machen.')) return
  try { localStorage.removeItem(KEY) } catch { /* s. o. */ }
  location.reload()
}

laden()
if (team && team.online) socketVerbinden()
zeichnen()
