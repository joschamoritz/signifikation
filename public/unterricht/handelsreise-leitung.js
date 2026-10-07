/*
  HANDELSREISE – Spielleitung (Beamer). Socket.io-Namespace /handelsreise.
  Ablauf: Spiel anlegen → Code an die Tafel → Runde freigeben → wenn alle
  losgereist sind: abrechnen → … → nach Runde 5: Auswertung.
*/
import { RAEUME, EREIGNISSE, RUNDEN, START_SILBER, HYPOTHESEN } from './handelsreise-regeln.js'
import { raumKarte } from './handelsreise-karten.js'

const KEY = 'handelsreise-leitung-v1'
const $ = (id) => document.getElementById(id)
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

let z = null              // Zustand vom Server
let ansicht = 'spiel'     // spiel | auswertung
let namenZeigen = false
let meldung = ''
let socket = null
let login = null          // null = unbekannt, true/false

function codeMerken(code) { try { code ? localStorage.setItem(KEY, code) : localStorage.removeItem(KEY) } catch { /* egal */ } }
function codeGemerkt() { try { return localStorage.getItem(KEY) } catch { return null } }

function verbinden() {
  if (typeof window.io !== 'function') { login = false; meldung = 'Socket.io fehlt – läuft der Server?'; return zeichnen() }
  socket = window.io('/handelsreise', { path: '/socket.io' })
  socket.on('connect', () => {
    socket.emit('leitung:hallo', {}, (res) => {
      login = !!(res && res.ok)
      const code = codeGemerkt()
      if (login && code) {
        socket.emit('leitung:oeffnen', { code }, (r) => { if (r && r.ok) z = r.zustand; else codeMerken(null); zeichnen() })
      } else zeichnen()
    })
  })
  socket.on('disconnect', () => { meldung = 'Verbindung zum Server unterbrochen …'; zeichnen() })
  socket.on('leitung:zustand', (neu) => { z = neu; meldung = ''; zeichnen() })
}

function befehl(name, daten = {}) {
  socket.emit(name, { code: z && z.code, ...daten }, (res) => {
    if (res && res.ok && res.zustand) { z = res.zustand; codeMerken(z.code) }
    if (res && !res.ok) meldung = ({ laeuft: 'Die Runde läuft schon.', ende: 'Alle Runden sind gespielt.', login: 'Nicht angemeldet.', unbekannt: 'Spiel nicht gefunden.' })[res.fehler] || 'Hat nicht geklappt.'
    zeichnen()
  })
}

/* ================= Ansichten ================= */
const hausName = (t) => (t.haus || `Handelshaus ${t.nr}`)
const zeigeName = (t) => esc(hausName(t)) + (namenZeigen ? ` <small>(${esc(t.name)})</small>` : '')

function kopf() {
  const naechste = z.status === 'laeuft' ? z.runde : z.runde + 1
  const fertig = z.teams.filter((t) => t.fertig).length
  let steuerung = ''
  if (z.status === 'laeuft') {
    steuerung = `<button class="btn" data-akt="abrechnen">Runde ${z.runde} abrechnen <small>(${fertig}/${z.teams.length} losgereist)</small></button>`
  } else if (z.runde < RUNDEN) {
    steuerung = `<button class="btn" data-akt="freigeben"${z.teams.length ? '' : ' disabled'}>Runde ${naechste} freigeben</button>`
  } else {
    steuerung = '<span class="status">Alle fünf Runden gespielt.</span>'
  }
  const statusText = { lobby: 'Teams treten bei', laeuft: `Runde ${z.runde} läuft`, abgerechnet: `Runde ${z.runde} abgerechnet`, ende: 'Spiel beendet' }[z.status]
  return `<header class="lkopf">
    <div class="code"><small>Raumcode</small><b>${esc(z.code)}</b><span>signifikation.de/unterricht/handelsreise.html</span></div>
    <div class="lstatus"><b>${statusText}</b><span>${z.teams.length} Handelshäuser</span></div>
    <div class="lsteuer">${steuerung}
      <button class="btn hell" data-akt="ansicht">${ansicht === 'spiel' ? 'Auswertung' : 'Zurück zum Spiel'}</button>
      <button class="btn hell" data-akt="namen">${namenZeigen ? 'Vornamen ausblenden' : 'Vornamen zeigen'}</button>
    </div>
  </header>${meldung ? `<p class="meldung lmeldung">${esc(meldung)}</p>` : ''}`
}

function ereignisWahl(raumId) {
  const runde = z.status === 'laeuft' ? z.runde : z.runde + 1
  if (runde > RUNDEN) return ''
  const aktuell = z.plan[runde - 1][raumId]
  const offen = z.status !== 'laeuft'
  const optionen = Object.entries(EREIGNISSE).filter(([, e]) => e.raum === 'alle' || e.raum === raumId)
    .map(([id, e]) => `<option value="${id}"${id === aktuell ? ' selected' : ''}>${esc(e.titel)}</option>`).join('')
  return `<label class="ewahl">${offen ? `Nachricht für Runde ${runde}` : `Nachricht Runde ${runde}`}
    <select data-raum="${raumId}" data-runde="${runde}"${offen ? '' : ' disabled'}>${optionen}</select></label>`
}

function spielAnsicht() {
  const spalten = Object.entries(RAEUME).map(([raumId, R]) => {
    const teams = z.teams.filter((t) => t.raum === raumId).sort((a, b) => b.wert - a.wert)
    const siegelAuf = teams.map((t) => ({ ort: t.ort, buchstabe: String(t.nr), farbe: t.fertig && z.status === 'laeuft' ? 'gruen' : '' }))
    const zeilen = teams.map((t) => `<li class="${t.verbunden ? '' : 'getrennt'}">
      <span class="nr">${t.nr}</span><span class="tn">${zeigeName(t)}<small>${esc(R.orte[t.ort] ? R.orte[t.ort].name : '')}</small></span>
      <span class="tw">${t.wert}</span>${z.status === 'laeuft' ? `<span class="tf">${t.fertig ? '✓' : '…'}</span>` : ''}${namenZeigen ? `<button class="tx" data-akt="entfernen" data-id="${esc(t.id)}" title="Team entfernen">×</button>` : ''}</li>`).join('')
    return `<section class="lraum">
      <h2>${esc(R.name)} <small>${teams.length} Häuser</small></h2>
      ${raumKarte(raumId, { siegelAuf })}
      ${ereignisWahl(raumId)}
      <ul class="lteams">${zeilen || '<li class="leer">noch niemand</li>'}</ul>
    </section>`
  }).join('')
  return `<div class="lraeume">${spalten}</div>
    <p class="klein lhinweis">Zahl = Wert des Handelshauses (Silber + Ladung). Grünes Siegel = losgereist. Grau = Gerät gerade nicht verbunden.</p>`
}

function mittel(xs) { return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : '–' }

function auswertungAnsicht() {
  const teams = z.teams
  const endwert = (t) => (t.staende[RUNDEN + 1] ? t.staende[RUNDEN + 1].silber : t.wert)
  const mitSchutz = (t) => Object.values(t.abgaben || {}).some((a) => a.schutz) || Object.values(t.staende || {}).some((s) => s.schutz)

  // Reisen mit und ohne Schutz: wie oft ein Unglück?
  let reisenMit = 0, unglMit = 0, reisenOhne = 0, unglOhne = 0
  for (const t of teams) {
    for (const [r, a] of Object.entries(t.abgaben || {})) {
      if (a.ziel === a.ort) continue
      const st = t.staende[r]
      if (!st) continue
      if (a.schutz) { reisenMit++; if (st.unglueck) unglMit++ } else { reisenOhne++; if (st.unglueck) unglOhne++ }
    }
  }
  const quote = (u, n) => (n ? `${Math.round((u / n) * 100)} %` : '–')

  const schutzZeile = `<table class="ltab"><thead><tr><th></th><th>Handelshäuser</th><th>Wert am Ende (Mittel)</th><th>Reisen</th><th>davon mit Unglück</th></tr></thead><tbody>
    <tr><th>mit Schutz</th><td>${teams.filter(mitSchutz).length}</td><td>${mittel(teams.filter(mitSchutz).map(endwert))}</td><td>${reisenMit}</td><td>${quote(unglMit, reisenMit)}</td></tr>
    <tr><th>ohne Schutz</th><td>${teams.filter((t) => !mitSchutz(t)).length}</td><td>${mittel(teams.filter((t) => !mitSchutz(t)).map(endwert))}</td><td>${reisenOhne}</td><td>${quote(unglOhne, reisenOhne)}</td></tr>
  </tbody></table>`

  const raumZeilen = Object.entries(RAEUME).map(([id, R]) => {
    const ts = teams.filter((t) => t.raum === id)
    const verlauf = Array.from({ length: RUNDEN }, (_, i) => mittel(ts.map((t) => (t.staende[i + 1] ? t.staende[i + 1].wert : null)).filter((x) => x != null)))
    return `<tr><th>${esc(R.name)}</th><td>${ts.length}</td><td>${START_SILBER}</td>${verlauf.map((v) => `<td>${v}</td>`).join('')}<td><b>${mittel(ts.map(endwert))}</b></td></tr>`
  }).join('')
  const raumTab = `<table class="ltab"><thead><tr><th>Raum</th><th>Häuser</th><th>Start</th>${Array.from({ length: RUNDEN }, (_, i) => `<th>R${i + 1}</th>`).join('')}<th>Ende</th></tr></thead><tbody>${raumZeilen}</tbody></table>`

  const hyp = Object.entries(HYPOTHESEN).map(([id, txt]) => {
    const n = teams.filter((t) => t.hypothese === id).length
    const w = mittel(teams.filter((t) => t.hypothese === id).map(endwert))
    return `<tr><th>${esc(txt)}</th><td>${n}</td><td>${w}</td></tr>`
  }).join('')

  const rang = [...teams].sort((a, b) => endwert(b) - endwert(a)).slice(0, 5)
    .map((t) => `<li>${zeigeName(t)} <small>${esc(RAEUME[t.raum].name)}</small> – ${endwert(t)}</li>`).join('')

  return `<div class="lauswertung">
    <section><h2>Hat sich Schutz gelohnt?</h2>${schutzZeile}
      <p class="klein">Schutz: Hanse-Mitglied, Geleitbrief oder mindestens einmal mit Karawane. Unglücke zählen nur bei Reisen, nicht beim Bleiben.</p></section>
    <section><h2>Die drei Handelsräume</h2>${raumTab}<p class="klein">Mittlerer Wert der Handelshäuser nach jeder Runde.</p></section>
    <section class="lzwei"><div><h2>Eure Vermutungen am Anfang</h2><table class="ltab"><thead><tr><th>Was entscheidet?</th><th>Häuser</th><th>Wert am Ende</th></tr></thead><tbody>${hyp}</tbody></table></div>
      <div><h2>Die reichsten Häuser</h2><ol class="lrang">${rang}</ol></div></section>
    <section class="lfrage"><h2>Und jetzt die eigentliche Frage</h2>
      <p>Die Zahlen zeigen, was die <b>Spielregeln</b> belohnt haben. Wer hat die Regeln gemacht – und was fehlt im Spiel, das im Buch steht?</p></section>
  </div>`
}

function zeichnen() {
  let html
  if (login === null) html = '<section class="lmitte"><p>Verbinde …</p></section>'
  else if (!login) html = `<section class="lmitte pergament"><h1>Handelsreise</h1><p>Die Spielleitung braucht den Admin-Login.</p><p><a href="/admin" class="btn">Zum Admin-Login</a></p><p class="klein">Nach dem Anmelden diese Seite neu laden.</p><p class="meldung">${esc(meldung)}</p></section>`
  else if (!z) html = `<section class="lmitte pergament"><h1>Handelsreise</h1><p class="zeit">Spielleitung</p>
    <p>Legt ein neues Spiel an. Der Raumcode erscheint groß oben – die Teams geben ihn auf der Startseite ein.</p>
    <button class="btn-gross" data-akt="neu">Neues Spiel anlegen</button><p class="meldung">${esc(meldung)}</p></section>`
  else html = kopf() + (ansicht === 'spiel' ? spielAnsicht() : auswertungAnsicht()) +
    `<p class="klein lende"><button class="linkbtn" data-akt="neu-fragen">Neues Spiel anlegen</button> · <button class="linkbtn" data-akt="loeschen">Spiel beenden und löschen</button></p>`
  $('app').innerHTML = html
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-akt]')
  if (!t) return
  const a = t.dataset.akt
  if (a === 'neu') befehl('leitung:neu')
  if (a === 'neu-fragen' && confirm('Ein neues Spiel anlegen? Das laufende bleibt noch bis heute Abend erreichbar.')) befehl('leitung:neu')
  if (a === 'freigeben') befehl('leitung:freigeben')
  if (a === 'abrechnen') {
    const offen = z.teams.filter((x) => !x.fertig).length
    if (offen && !confirm(`${offen} Handelshäuser sind noch nicht losgereist. Sie bleiben dann diese Runde, wo sie sind. Trotzdem abrechnen?`)) return
    befehl('leitung:abrechnen')
  }
  if (a === 'entfernen') {
    const team = z.teams.find((x) => x.id === t.dataset.id)
    if (team && confirm(`„${hausName(team)}“ (${team.name}) aus dem Spiel entfernen? Das Gerät spielt dann ohne Klassenmarkt weiter.`)) befehl('leitung:entfernen', { id: team.id })
  }
  if (a === 'ansicht') { ansicht = ansicht === 'spiel' ? 'auswertung' : 'spiel'; zeichnen() }
  if (a === 'namen') { namenZeigen = !namenZeigen; zeichnen() }
  if (a === 'loeschen' && confirm('Spiel wirklich beenden und löschen? Die Geräte verlieren den Klassenmarkt.')) {
    befehl('leitung:loeschen'); z = null; codeMerken(null)
  }
})

document.addEventListener('change', (ev) => {
  const s = ev.target
  if (s.matches('select[data-raum]')) befehl('leitung:ereignis', { raum: s.dataset.raum, runde: Number(s.dataset.runde), ereignis: s.value })
})

zeichnen()
verbinden()
