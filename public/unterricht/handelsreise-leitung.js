/*
  HANDELSREISE – Spielleitung (Beamer). Socket.io-Namespace /handelsreise.
  Ablauf: Spiel anlegen → Code an die Tafel → Runde freigeben → wenn alle
  losgereist sind: abrechnen → … → nach Runde 5: Auswertung.
*/
import { RAEUME, EREIGNISSE, RUNDEN, START_SILBER, HYPOTHESEN, ereignisPasst } from './handelsreise-regeln.js'
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
let probeVariante = 'ohne' // Gegenprobe: ohne | alle | doppelt

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
    if (res && !res.ok) meldung = ({ laeuft: 'Die Runde läuft schon.', ende: 'Das Spiel ist beendet.', login: 'Nicht angemeldet.', unbekannt: 'Spiel nicht gefunden.' })[res.fehler] || 'Hat nicht geklappt.'
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
    steuerung = `<button class="btn" data-akt="freigeben"${z.teams.length ? '' : ' disabled'}>Runde ${naechste} freigeben</button>${z.status === 'abgerechnet' ? ' <button class="btn hell" data-akt="schluss">Spiel hier beenden</button>' : ''}`
  } else {
    steuerung = `<span class="status">${z.letzteRunde < RUNDEN ? `Nach Runde ${z.letzteRunde} beendet.` : 'Alle fünf Runden gespielt.'}</span>`
  }
  const statusText = { lobby: 'Teams treten bei', laeuft: `Runde ${z.runde} läuft`, abgerechnet: `Runde ${z.runde} abgerechnet`, ende: 'Spiel beendet' }[z.status]
  return `<header class="lkopf">
    <img class="qr" src="handelsreise-qr.svg" alt="QR-Code zur Spielseite" width="120" height="120"><div class="code"><small>Raumcode</small><b>${esc(z.code)}</b><span>signifikation.de/unterricht/handelsreise.html</span></div>
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
  const optionen = Object.entries(EREIGNISSE).filter(([, e]) => ereignisPasst(e, raumId))
    .map(([id, e]) => `<option value="${id}"${id === aktuell ? ' selected' : ''}>${esc(e.titel)}</option>`).join('')
  return `<label class="ewahl">${offen ? `Nachricht für Runde ${runde}` : `Nachricht Runde ${runde}`}
    <select data-raum="${raumId}" data-runde="${runde}"${offen ? '' : ' disabled'}>${optionen}</select></label>`
}

function spielAnsicht() {
  const spalten = Object.entries(RAEUME).map(([raumId, R]) => {
    const teams = z.teams.filter((t) => t.raum === raumId).sort((a, b) => b.wert - a.wert)
    const siegelAuf = teams.map((t) => ({ ort: t.ort, buchstabe: String(t.nr), farbe: t.fertig && z.status === 'laeuft' ? 'gruen' : '' }))
    const zeilen = teams.map((t) => `<li class="${t.verbunden ? '' : 'getrennt'}">
      <span class="nr">${t.nr}</span><span class="tn">${zeigeName(t)}<small>${esc(R.orte[t.ort] ? R.orte[t.ort].name : '')}${!t.verbunden && t.getrenntSeit ? ` · getrennt seit ${new Date(t.getrenntSeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}</small></span>
      <span class="tw" title="Wert = Silber + Ladung zum üblichen Preis">${t.wert}<small>davon Silber ${t.silber}</small></span>${z.status === 'laeuft' ? `<span class="tf">${t.fertig ? '✓' : '…'}</span>` : ''}${namenZeigen ? `<button class="tx" data-akt="entfernen" data-id="${esc(t.id)}" title="Team entfernen">×</button>` : ''}</li>`).join('')
    return `<section class="lraum">
      <h2>${esc(R.name)} <small>${teams.length} Häuser</small></h2>
      ${raumKarte(raumId, { siegelAuf })}
      ${ereignisWahl(raumId)}
      <ul class="lteams">${zeilen || '<li class="leer">noch niemand</li>'}</ul>
    </section>`
  }).join('')
  return `<div class="lraeume">${spalten}</div>
    <p class="klein lhinweis">Zahl = Wert des Handelshauses: Silber plus Ladung zum üblichen Preis am Ort (darunter das Silber in der Kasse). Grünes Siegel = losgereist. Grau = Gerät gerade nicht verbunden – meist hilft: iPad entsperren, auf „Neu verbinden“ tippen oder die Seite neu laden (der Spielstand bleibt).</p>`
}

function mittel(xs) { return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : '–' }

function auswertungAnsicht() {
  const teams = z.teams
  const endwert = (t) => (t.staende[RUNDEN + 1] ? t.staende[RUNDEN + 1].silber : t.wert)
  // Reisen eines Hauses (Bleiben zählt nicht) mit der Angabe, ob der Schutz auf DIESER Reise galt
  const reisen = (t) => Object.entries(t.abgaben || {})
    .map(([r, ab]) => ({ r, ab, st: t.staende[r] }))
    .filter((x) => x.ab.ziel !== x.ab.ort && x.st)
  // „Geschützt“ ist ein Haus, wenn es auf mindestens der Hälfte seiner Reisen Schutz hatte
  const geschuetzt = (t) => { const rs = reisen(t); return rs.length > 0 && rs.filter((x) => x.ab.schutz).length * 2 >= rs.length }
  const quote = (u, n) => (n ? `${Math.round((u / n) * 100)} % <small>(${u} von ${n})</small>` : '–')

  const zeile = (name, ts) => {
    let rm = 0, um = 0, ro = 0, uo = 0
    for (const t of ts) for (const x of reisen(t)) {
      if (x.ab.schutz) { rm++; if (x.st.unglueck) um++ } else { ro++; if (x.st.unglueck) uo++ }
    }
    const mit = ts.filter(geschuetzt), ohne = ts.filter((t) => !geschuetzt(t))
    return `<tr><th>${name}</th><td>${mittel(mit.map(endwert))} <small>(${mit.length})</small></td><td>${mittel(ohne.map(endwert))} <small>(${ohne.length})</small></td><td>${quote(um, rm)}</td><td>${quote(uo, ro)}</td></tr>`
  }
  const raumZeilen = Object.entries(RAEUME).map(([id, R]) => zeile(esc(R.name), teams.filter((t) => t.raum === id))).join('')
  const schutzTab = `<table class="ltab"><thead><tr><th>Raum</th><th>Wert am Ende<br><small>mit Schutz (Häuser)</small></th><th>Wert am Ende<br><small>ohne Schutz (Häuser)</small></th><th>Unglücke auf Reisen<br><small>mit Schutz</small></th><th>Unglücke auf Reisen<br><small>ohne Schutz</small></th></tr></thead><tbody>${raumZeilen}${zeile('<i>alle</i>', teams)}</tbody></table>`

  const verlaufZeilen = Object.entries(RAEUME).map(([id, R]) => {
    const ts = teams.filter((t) => t.raum === id)
    const verlauf = Array.from({ length: RUNDEN }, (_, i) => mittel(ts.map((t) => (t.staende[i + 1] ? t.staende[i + 1].wert : null)).filter((x) => x != null)))
    return `<tr><th>${esc(R.name)}</th><td>${ts.length}</td><td>${START_SILBER}</td>${verlauf.map((v) => `<td>${v}</td>`).join('')}<td><b>${mittel(ts.map(endwert))}</b></td></tr>`
  }).join('')
  const verlaufTab = `<table class="ltab"><thead><tr><th>Raum</th><th>Häuser</th><th>Start</th>${Array.from({ length: RUNDEN }, (_, i) => `<th>R${i + 1}</th>`).join('')}<th>Ende</th></tr></thead><tbody>${verlaufZeilen}</tbody></table>`

  const hyp = Object.entries(HYPOTHESEN).map(([id, txt]) => {
    const ts = teams.filter((t) => t.hypothese === id)
    return `<tr><th>${esc(txt)}</th><td>${ts.length}</td><td>${mittel(ts.map(endwert))}</td></tr>`
  }).join('')

  // Bestenliste je Raum – die Räume haben unterschiedliche Preise, ein Gesamtranking wäre unfair
  const rang = Object.entries(RAEUME).map(([id, R]) => {
    const besten = teams.filter((t) => t.raum === id).sort((x, y) => endwert(y) - endwert(x)).slice(0, 2)
    return `<li><b>${esc(R.name)}:</b> ${besten.map((t) => `${zeigeName(t)} – ${endwert(t)}`).join(' · ') || '–'}</li>`
  }).join('')

  return `<div class="lauswertung">
    <section><h2>Hat sich Schutz gelohnt?</h2>${schutzTab}
      <p class="klein">„Mit Schutz“: Haus hatte auf mindestens der Hälfte seiner Reisen Schutz (Hanse, Geleitbrief, Karawane). Unglücke zählen nur auf Reisen, und nur so, wie der Schutz auf genau dieser Reise war. <b>Kleine Zahlen:</b> Ein Unglück mehr oder weniger verändert die Prozente stark – Glück spielt mit.</p></section>
    <section><h2>Die drei Handelsräume</h2>${verlaufTab}<p class="klein">Mittlerer Wert der Häuser nach jeder Runde. Die Räume haben verschiedene Waren und Preise – ihre Werte lassen sich nur grob vergleichen.</p></section>
    <section class="lzwei"><div><h2>Eure Vermutungen am Anfang</h2><table class="ltab"><thead><tr><th>Was entscheidet?</th><th>Häuser</th><th>Wert am Ende</th></tr></thead><tbody>${hyp}</tbody></table></div>
      <div><h2>Die erfolgreichsten Häuser je Raum</h2><ul class="lrang">${rang}</ul></div></section>
    ${gegenprobe(teams, endwert, geschuetzt)}
    <section class="lfrage"><h2>Und jetzt die eigentliche Frage</h2>
      <p>Die Zahlen zeigen, was die <b>Spielregeln</b> belohnt haben. Wer hat die Regeln gemacht? Steht im Buch, dass Schutz sich so lohnt – oder erklärt das Buch Köln und Timbuktu nicht gerade über ihre <b>Lage</b>?</p>
      <p>Und: Im Buch steht „Salz gegen Gold <b>und Sklaven</b>“. Was verändert es, dass das Spiel die Menschen weglässt?</p></section>
  </div>`
}

/**
 * Gegenprobe: dieselben Würfel, dieselben Entscheidungen – nur eine Regel anders.
 * Jedes Gerät meldet je Reise den Würfel und die Gefahr mit und ohne Schutz.
 * Wert am Ende ist geschätzt: Ein Unglück kostet ein Drittel der Ladung.
 */
function gegenprobe(teams, endwert, geschuetzt) {
  const VARIANTEN = {
    ohne: { name: 'Schutz wirkt nicht', gefahr: (p) => p.rOhne },
    alle: { name: 'Alle haben Schutz', gefahr: (p) => p.rMit },
    doppelt: { name: 'Alle Wege doppelt so gefährlich', gefahr: (p, gespielt) => Math.min(0.9, gespielt * 2) },
  }
  const v = VARIANTEN[probeVariante] || VARIANTEN.ohne
  let ungGespielt = 0, ungVariante = 0, reisen = 0
  const neu = new Map()
  for (const t of teams) {
    let delta = 0
    for (const [r, ab] of Object.entries(t.abgaben || {})) {
      const st = t.staende[r]
      if (!st || !st.probe || ab.ziel === ab.ort) continue
      const p = st.probe
      const gespielt = ab.schutz ? p.rMit : p.rOhne
      const vorher = !!st.unglueck
      const nachher = p.wurf < v.gefahr(p, gespielt)
      reisen++
      if (vorher) ungGespielt++
      if (nachher) ungVariante++
      const verlust = Math.round(p.ladung / 3)
      if (vorher && !nachher) delta += verlust
      if (!vorher && nachher) delta -= verlust
    }
    neu.set(t.id, Math.max(0, endwert(t) + delta))
  }
  if (!reisen) return '<section><h2>Gegenprobe</h2><p class="klein">Noch keine Reisen mit Daten für die Gegenprobe.</p></section>'
  const zeilen = Object.entries(RAEUME).map(([id, R]) => {
    const ts = teams.filter((x) => x.raum === id)
    const mit = ts.filter(geschuetzt), ohne = ts.filter((x) => !geschuetzt(x))
    const bester = (werte) => { const b = [...ts].sort((a, c) => werte(c) - werte(a))[0]; return b ? esc(b.haus || 'Haus ' + b.nr) : '–' }
    return `<tr><th>${esc(R.name)}</th>
      <td>${mittel(mit.map(endwert))} → <b>${mittel(mit.map((x) => neu.get(x.id)))}</b></td>
      <td>${mittel(ohne.map(endwert))} → <b>${mittel(ohne.map((x) => neu.get(x.id)))}</b></td>
      <td>${bester(endwert)} → <b>${bester((x) => neu.get(x.id))}</b></td></tr>`
  }).join('')
  const knoepfe = Object.entries(VARIANTEN).map(([k, x]) => `<button class="btn ${k === probeVariante ? '' : 'hell'}" data-akt="probe" data-v="${k}">${x.name}</button>`).join(' ')
  return `<section class="lprobe"><h2>Gegenprobe: Was wäre, wenn die Regel anders wäre?</h2>
    <p>Dieselben Würfel, dieselben Entscheidungen – nur eine Regel anders. ${knoepfe}</p>
    <p class="gross">Unglücke auf ${reisen} Reisen: gespielt <b>${ungGespielt}</b> → mit „${v.name}“ <b>${ungVariante}</b></p>
    <table class="ltab"><thead><tr><th>Raum</th><th>Wert am Ende<br><small>Häuser mit Schutz</small></th><th>Wert am Ende<br><small>Häuser ohne Schutz</small></th><th>Bestes Haus</th></tr></thead><tbody>${zeilen}</tbody></table>
    <p class="klein">Geschätzt: Ein Unglück kostet ein Drittel der Ladung; Folgen für spätere Runden sind nicht nachgerechnet. Die Regel hat die Lehrkraft gemacht – und man kann sie ändern.</p></section>`
}

function zeichnen() {
  let html
  if (login === null) html = '<section class="lmitte"><p>Verbinde …</p></section>'
  else if (!login) html = `<section class="lmitte pergament"><h1>Handelsreise</h1><p>Die Spielleitung braucht den Admin-Login.</p><p><a href="/admin" class="btn">Zum Admin-Login</a></p><p class="klein">Nach dem Anmelden diese Seite neu laden.</p><p class="meldung">${esc(meldung)}</p></section>`
  else if (!z) html = `<section class="lmitte pergament"><h1>Handelsreise</h1><p class="zeit">Spielleitung</p>
    <p>Legt ein neues Spiel an. Der Raumcode erscheint groß oben – die Teams geben ihn auf der Startseite ein.</p>
    <button class="btn-gross" data-akt="neu">Neues Spiel anlegen</button>
    <p class="klein" style="margin-top:22px">Oder ein laufendes Spiel öffnen (z. B. auf einem anderen Gerät):</p>
    <p class="oeffnen"><input id="codeOeffnen" inputmode="numeric" maxlength="4" placeholder="Raumcode"> <button class="btn hell" data-akt="oeffnen">Öffnen</button></p>
    <p class="meldung">${esc(meldung)}</p></section>`
  else html = kopf() + (ansicht === 'spiel' ? spielAnsicht() : auswertungAnsicht()) +
    `<p class="klein lende"><button class="linkbtn" data-akt="neu-fragen">Neues Spiel anlegen</button> · <button class="linkbtn" data-akt="anderes">Anderes Spiel öffnen</button> · <button class="linkbtn" data-akt="loeschen">Spiel beenden und löschen</button></p>`
  $('app').innerHTML = html
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-akt]')
  if (!t) return
  const a = t.dataset.akt
  if (a === 'neu') befehl('leitung:neu')
  if (a === 'oeffnen') {
    const code = ($('codeOeffnen').value || '').trim()
    socket.emit('leitung:oeffnen', { code }, (r) => {
      if (r && r.ok) { z = r.zustand; codeMerken(z.code); meldung = '' } else meldung = 'Ein Spiel mit diesem Code gibt es nicht (mehr).'
      zeichnen()
    })
  }
  if (a === 'anderes') { z = null; codeMerken(null); zeichnen() }
  if (a === 'probe') { probeVariante = t.dataset.v; zeichnen() }
  if (a === 'neu-fragen' && confirm('Ein neues Spiel anlegen? Das laufende bleibt noch bis heute Abend erreichbar.')) befehl('leitung:neu')
  if (a === 'freigeben') befehl('leitung:freigeben')
  if (a === 'schluss' && confirm(`Spiel nach Runde ${z.runde} beenden? Die iPads gehen direkt zum letzten Markttag.`)) befehl('leitung:schluss')
  if (a === 'abrechnen') {
    const offen = z.teams.filter((x) => !x.fertig).length
    if (offen && !confirm(`${offen} Handelshäuser sind noch nicht losgereist. Sie bleiben dann diese Runde, wo sie sind. Trotzdem abrechnen?`)) return
    befehl('leitung:abrechnen')
  }
  if (a === 'entfernen') {
    const team = z.teams.find((x) => x.id === t.dataset.id)
    if (team && confirm(`„${hausName(team)}“ (${team.name}) aus dem Spiel entfernen? Das iPad erfährt es sofort und kann ohne Klassenmarkt weiterspielen.`)) befehl('leitung:entfernen', { id: team.id })
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
