/*
  HANDELSREISE – Oberfläche im Gerät (Geschichte 8a/8e, G8.1, ASGSG Marl)
  Regeln und Daten: handelsreise-regeln.js. Stand im Gerät: localStorage.
*/
import {
  RAEUME, KARTEN, HYPOTHESEN, RUNDEN, START_SILBER, EREIGNISSE, STANDARD_PLAN,
  neuesTeam, ereignisFuer, nachbarn, preis, verkaufspreis, ladungSumme, laderaum,
  risiko, gefahrStufe, karteFuer, karteAnwenden, handeln, reiseAbrechnen,
  rundeAbschliessen, hash,
} from './handelsreise-regeln.js'

/* ================= EINSTELLUNGEN ================= */
const KEY = 'handelsreise-v1'
const ABGABE_URL = ''   // leer: Abgabe nur als PDF (Klassenmarkt und Abgabe folgen)

/* ================= Zustand ================= */
let team = null
let meldung = ''

function laden() {
  try {
    const r = localStorage.getItem(KEY)
    if (r) { const s = JSON.parse(r); if (s && s.version === 1) team = s }
  } catch { /* privat oder gesperrt: ohne Speicher weiter */ }
}
function speichern() {
  try { localStorage.setItem(KEY, JSON.stringify(team)) } catch { /* s. o. */ }
}

/* ================= Klassenmarkt (später Server) ================= */
// Ohne Server: Standardplan der Ereignisse, keine Sättigung.
const markt = {
  verbunden: false,
  plan: STANDARD_PLAN,
  faktoren: {},          // { ort: { ware: Faktor } } aus der Abrechnung der Vorrunde
  hanseAnteil: 0.5,
}
function ereignis() { return ereignisFuer(team.raum, Math.min(team.runde, RUNDEN), markt.plan) }
function faktorenHier() { return (markt.faktoren[team.ort]) || {} }

/* ================= Hilfen ================= */
const $ = (id) => document.getElementById(id)
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const raum = () => RAEUME[team.raum]
const ortName = (id) => raum().orte[id].name
const wareName = (id) => raum().waren[id].name
const silberTxt = (n) => `${n} Silber`

function gefahrPunkte(r) {
  const s = gefahrStufe(r)
  if (!s) return '<span class="gefahr g0">keine Gefahr</span>'
  const namen = ['', 'geringe', 'mittlere', 'hohe']
  return `<span class="gefahr g${s}" title="${namen[s]} Gefahr">${'●'.repeat(s)}${'○'.repeat(3 - s)} ${namen[s]} Gefahr</span>`
}

/* ================= Siegel (selbst gezeichnet) ================= */
function siegel(buchstabe, groesse = 56) {
  const pkt = []
  for (let i = 0; i < 36; i++) {
    const w = (i / 36) * Math.PI * 2
    const r = i % 2 ? 46 : 50 - (hash(buchstabe + i) % 3)
    pkt.push(`${(50 + r * Math.cos(w)).toFixed(1)},${(50 + r * Math.sin(w)).toFixed(1)}`)
  }
  return `<svg class="siegel" width="${groesse}" height="${groesse}" viewBox="0 0 100 100" aria-hidden="true">
    <polygon points="${pkt.join(' ')}" class="siegel-rand"/>
    <circle cx="50" cy="50" r="36" class="siegel-innen"/>
    <circle cx="50" cy="50" r="31" class="siegel-ring"/>
    <text x="50" y="62" text-anchor="middle" class="siegel-text">${esc(buchstabe)}</text>
  </svg>`
}
const initiale = () => ((team.haus || team.team || 'H').trim()[0] || 'H').toUpperCase()

/* ================= Karte des Handelsraums ================= */
// Selbst gezeichnete Skizzen, nicht maßstabsgetreu (Lage grob nach den Karten D1, S. 24/29/31)
const DEKO = {
  hanse: `
    <path class="d-meer" d="M70 12 L180 12 C176 40 168 62 186 84 C196 98 176 112 158 116 C132 122 110 140 92 152 C80 140 76 120 66 104 C58 80 62 40 70 12 Z"/>
    <path class="d-meer" d="M212 104 C226 92 236 70 254 58 C268 46 286 40 300 22 C312 14 326 14 334 22 C322 34 312 46 318 60 C322 74 300 90 280 100 C262 110 236 116 212 104 Z"/>
    <text x="118" y="60" class="d-name">Nordsee</text><text x="262" y="82" class="d-name">Ostsee</text>
    <path class="d-fluss" d="M140 225 C150 205 128 196 136 176 C142 162 120 150 104 150"/>
    <text x="150" y="196" class="d-klein">Rhein</text>`,
  seide: `
    <path class="d-meer" d="M40 120 C70 112 96 132 120 140 C140 146 156 152 172 166 C170 182 150 190 124 186 C100 182 78 196 52 190 C34 186 22 170 26 150 C28 136 32 124 40 120 Z"/>
    <text x="70" y="166" class="d-name">Mittelmeer</text>
    <g class="d-berg"><path d="M232 150 l10 -16 l10 16 Z"/><path d="M248 150 l12 -20 l12 20 Z"/><path d="M266 150 l9 -14 l9 14 Z"/></g>
    <text x="254" y="166" class="d-klein">Gebirge</text>
    <text x="250" y="60" class="d-name">Mongolenreich</text>
    <path class="d-meer" d="M372 70 C384 100 380 150 368 196 L392 196 L392 70 Z"/>`,
  sahara: `
    <g class="d-duene">${Array.from({ length: 18 }, (_, i) => {
      const x = 40 + ((i * 53) % 300), y = 40 + ((i * 37) % 110)
      return `<path d="M${x} ${y} q8 -7 16 0"/>`
    }).join('')}</g>
    <text x="270" y="110" class="d-name">Sahara</text>
    <path class="d-niger" d="M20 262 C60 250 96 246 120 236 C150 224 186 196 222 186 C262 176 300 196 322 228 C332 244 340 256 350 264"/>
    <text x="300" y="214" class="d-klein">Niger</text>
    <path class="d-meer" d="M12 40 L34 40 C28 80 30 120 22 160 L12 160 Z"/>
    <text x="16" y="34" class="d-klein">Atlantik</text>`,
}

function karteSvg({ auswahl = null, klickbar = false } = {}) {
  const R = raum()
  const ziele = klickbar ? nachbarn(team.raum, team.ort).map((n) => n.ort) : []
  let s = `<svg class="weltkarte" viewBox="0 0 400 270" role="img" aria-label="Karte: ${esc(R.name)}">`
  s += `<g class="deko">${DEKO[team.raum] || ''}</g>`
  s += '<rect x="4" y="4" width="392" height="262" class="k-rahmen"/><rect x="10" y="10" width="380" height="250" class="k-rahmen2"/>'
  // Windrose
  s += '<g class="k-rose" transform="translate(360 228)"><path d="M0 -18 L4 0 L0 18 L-4 0 Z"/><path d="M-18 0 L0 4 L18 0 L0 -4 Z"/><text y="-21" text-anchor="middle">N</text></g>'
  for (const st of R.strecken) {
    const a = R.orte[st.a], b = R.orte[st.b]
    const aktiv = auswahl && ((st.a === team.ort && st.b === auswahl) || (st.b === team.ort && st.a === auswahl))
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="k-weg k-${st.art}${aktiv ? ' k-aktiv' : ''}"/>`
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    const zeichen = { see: '≈', land: '⁂', wueste: '∴', fluss: '≈' }[st.art]
    s += `<text x="${mx}" y="${my - 6}" text-anchor="middle" class="k-zeichen">${zeichen}</text>`
  }
  for (const [id, o] of Object.entries(R.orte)) {
    const ziel = ziele.includes(id)
    s += `<g class="k-ort${ziel ? ' k-ziel' : ''}${auswahl === id ? ' k-gewaehlt' : ''}"${ziel ? ` data-ziel="${id}" role="button" tabindex="0"` : ''}>`
    if (ziel) s += `<circle cx="${o.x}" cy="${o.y}" r="22" class="k-treffer"/>`
    s += `<circle cx="${o.x}" cy="${o.y}" r="7" class="k-punkt"/>`
    const unten = o.y < 200
    s += `<text x="${o.x}" y="${unten ? o.y + 24 : o.y - 14}" text-anchor="middle" class="k-name">${esc(o.name)}</text></g>`
  }
  const hier = R.orte[team.ort]
  s += `<g transform="translate(${hier.x - 15} ${hier.y - 15})" class="k-siegel">${siegel(initiale(), 30).replace('<svg ', '<svg x="0" y="0" ')}</g>`
  s += '</svg>'
  return s
}

/* ================= Kopfzeile ================= */
function kopf() {
  const lr = laderaum(team)
  return `<header class="kopf">
    <div class="haus">${siegel(initiale(), 44)}<div><b>${esc(team.haus || 'Handelshaus')}</b><small>${esc(team.team)} · ${esc(raum().name)}</small></div></div>
    <div class="werte">
      <span class="wert"><small>Runde</small><b>${Math.min(team.runde, RUNDEN)} / ${RUNDEN}</b></span>
      <span class="wert"><small>Silber</small><b>${team.silber}</b></span>
      <span class="wert"><small>Ladung</small><b>${ladungSumme(team)} / ${lr}</b></span>
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
  return `<ol class="schritte">${liste.map(([id, name]) => `<li class="${id === aktiv ? 'an' : ''}">${name}</li>`).join('')}</ol>`
}

function spiel(inhalt, phase, kartenOpt) {
  return `${kopf()}<div class="spielflaeche">
    <section class="kartenfeld">${karteSvg(kartenOpt)}<p class="ortinfo"><b>${esc(ortName(team.ort))}:</b> ${esc(raum().orte[team.ort].text)} <span class="beleg">${esc(raum().orte[team.ort].beleg)}</span></p></section>
    <section class="tafel">${phase ? schritte(phase) : ''}${inhalt}</section>
  </div>`
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
        </div>
        <label for="teamFeld">Eure Vornamen</label>
        <input id="teamFeld" autocomplete="off" maxlength="80" placeholder="z. B. Lea und Tom">
        <label for="hausFeld">Name eures Handelshauses</label>
        <input id="hausFeld" autocomplete="off" maxlength="40" placeholder="z. B. Haus Morgenstern">
        <p class="meldung">${esc(meldung)}</p>
        <button type="button" class="btn-gross" data-akt="gruenden">Handelshaus gründen</button>
      </div>
    </section>`
  },

  raum() {
    const R = raum()
    return spiel(`<div class="blattkarte">
      <p class="ueber">Euer Handelsraum, ausgelost</p>
      <h2>${esc(R.name)}</h2>
      <p class="unter">${esc(R.untertitel)}</p>
      <p>${esc(R.intro)}</p>
      <p class="beleg">Im Buch: ${esc(R.introBeleg)}</p>
      <p>Ihr startet in <b>${esc(ortName(team.ort))}</b> mit <b>${START_SILBER} Silber</b> und Platz für <b>${team.laderaum} Ladungen</b>.</p>
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
      unten = `<div class="wahl2">
        <button type="button" class="wahlbtn" data-wahl="a">${esc(k.a.text)}</button>
        <button type="button" class="wahlbtn" data-wahl="b">${esc(k.b.text)}</button>
      </div>`
    } else {
      unten = `<div class="folge"><p class="ueber">Ihr habt entschieden: ${esc(k[wahl].text)}</p><p>${esc(k[wahl].folgeText)}</p></div>
        <div class="buchstelle"><b>Das steht im Buch:</b> ${esc(k.beleg)}<br><i>Spielregel:</i> ${esc(k.spielregel)}</div>
        <div class="fussleiste"><button type="button" class="btn" data-akt="weiter-markt">Weiter zum Markt</button></div>`
    }
    return spiel(`<div class="spielkarte"><p class="ueber">Runde ${team.runde} · Entscheidung</p><h2>${esc(k.titel)}</h2><p>${esc(k.text)}</p>${unten}</div>`, 'karte')
  },

  markt(schluss = false) {
    const R = raum(), e = ereignis(), mf = faktorenHier()
    const angebot = R.orte[team.ort].angebot
    const zeilen = Object.keys(R.waren).map((w) => {
      const hat = team.ladung[w] || 0
      const kauf = angebot.includes(w) ? preis(team.raum, team.ort, w, e, mf[w] || 1) : null
      const verk = verkaufspreis(team, w, e, mf[w] || 1)
      return `<tr>
        <th>${esc(wareName(w))}${angebot.includes(w) ? ' <span class="stern" title="hier im Angebot">★</span>' : ''}</th>
        <td class="zahl">${kauf != null ? kauf : '–'}</td>
        <td class="zahl">${verk}</td>
        <td class="zahl"><b>${hat}</b></td>
        <td class="aktion">
          ${!schluss && kauf != null ? `<button type="button" class="mbtn kauf" data-kauf="${w}" aria-label="1 ${esc(wareName(w))} kaufen">+1</button>` : ''}
          ${hat ? `<button type="button" class="mbtn verk" data-verk="${w}" aria-label="1 ${esc(wareName(w))} verkaufen">−1</button><button type="button" class="mbtn verk alle" data-verkalle="${w}">alle</button>` : ''}
        </td></tr>`
    }).join('')
    const titel = schluss ? 'Letzter Markttag' : `Markt in ${esc(ortName(team.ort))}`
    const hinweis = schluss
      ? 'Die Reise ist vorbei. Verkauft, was ihr noch geladen habt – was übrig bleibt, zählt nicht mit.'
      : 'Kaufen könnt ihr nur Waren mit ★. Verkaufen könnt ihr alles, was ihr geladen habt.'
    return spiel(`<div class="markt">
      <p class="ueber">${schluss ? 'Ende der Reise' : `Runde ${team.runde} · Markt`}</p>
      <h2>${titel}</h2>
      <p class="klein">${hinweis}</p>
      <table class="preise"><thead><tr><th>Ware</th><th>Kaufen für</th><th>Verkaufen für</th><th>Geladen</th><th class="aktion">Handeln</th></tr></thead><tbody>${zeilen}</tbody></table>
      <p class="meldung">${esc(meldung)}</p>
      ${schluss ? '' : anderswo()}
      <div class="fussleiste"><button type="button" class="btn" data-akt="${schluss ? 'bilanz' : 'weiter-reise'}">${schluss ? 'Bilanz ziehen' : 'Weiter zur Reise'}</button></div>
    </div>`, schluss ? null : 'markt')
  },

  reise() {
    const R = raum(), e = ereignis()
    const wahl = team.reise || { ziel: null, karawane: false }
    const ziele = [{ ort: team.ort, strecke: null }, ...nachbarn(team.raum, team.ort)]
    const tmp = { ...team, reise: wahl }
    const optionen = ziele.map(({ ort, strecke }) => {
      const r = risiko(tmp, ort, e, { hanseAnteil: markt.hanseAnteil })
      return `<button type="button" class="zielbtn${wahl.ziel === ort ? ' an' : ''}" data-ziel="${ort}">
        <b>${ort === team.ort ? `In ${esc(ortName(ort))} bleiben` : `Nach ${esc(ortName(ort))}`}</b>
        <small>${strecke ? esc(strecke.name) : 'keine Reise'}</small>
        ${gefahrPunkte(r)}</button>`
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
    return spiel(`<div class="reise">
      <p class="ueber">Runde ${team.runde} · Reise</p>
      <h2>Wohin geht die Reise?</h2>
      <p class="klein">Tippt auf ein Ziel – hier oder auf der Karte.</p>
      <div class="ziele">${optionen}</div>
      <div class="schutzbox"><h3>Schutz</h3>${schutz}<p class="beleg">${esc(sch.beleg)}</p></div>
      <p class="meldung">${esc(meldung)}</p>
      <div class="fussleiste">
        <button type="button" class="btn hell" data-akt="zurueck-markt">Zurück zum Markt</button>
        <button type="button" class="btn" data-akt="losreisen"${wahl.ziel ? '' : ' disabled'}>${wahl.ziel === team.ort ? 'Runde beenden' : 'Losreisen'}</button>
      </div>
    </div>`, 'reise', { auswahl: wahl.ziel, klickbar: true })
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
    const letzte = team.runde >= RUNDEN
    return spiel(`<div class="ergebnis">
      <p class="ueber">Runde ${team.runde} · Abrechnung</p>
      <h2>${eintraege.some((x) => x.art === 'unglueck') ? 'Ein schwerer Schlag' : 'Die Runde ist vorbei'}</h2>
      <ul class="ereignisliste">${liste}</ul>
      <p>Ihr habt jetzt <b>${silberTxt(team.silber)}</b> und <b>${ladungSumme(team)} Ladungen</b> an Bord.</p>
      <div class="fussleiste"><button type="button" class="btn" data-akt="naechste">${letzte ? 'Zum letzten Markttag' : `Runde ${team.runde + 1} beginnen`}</button></div>
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
      ${frage('f3', '3. Was fehlt im Spiel, das im Buch steht?', 'Denkt an die Seiten 24–33.')}
      <p class="meldung">${esc(meldung)}</p>
      <div class="fussleiste">
        <button type="button" class="btn hell" data-akt="kontorbuch">Kontorbuch ansehen</button>
        <button type="button" class="btn hell" data-akt="pdf">Als PDF sichern</button>
        ${ABGABE_URL ? `<button type="button" class="btn gruen" data-akt="abschicken">${team.abgegeben ? 'Noch einmal schicken' : 'Bericht abschicken'}</button>` : ''}
      </div>
    </div>`, null)
  },
}

function anderswo() {
  const R = raum(), e = ereignis()
  const orte = Object.keys(R.orte).filter((o) => o !== team.ort)
  const aktuell = !!team.mods.info
  const kopfzeile = orte.map((o) => `<th>${esc(ortName(o))}</th>`).join('')
  const zeilen = Object.keys(R.waren).map((w) => `<tr><th>${esc(wareName(w))}</th>${orte.map((o) => {
    const p = aktuell ? preis(team.raum, o, w, e, (markt.faktoren[o] || {})[w] || 1) : R.preise[o][w]
    return `<td class="zahl">${p}${R.orte[o].angebot.includes(w) ? '★' : ''}</td>`
  }).join('')}</tr>`).join('')
  return `<details class="anderswo"${aktuell ? ' open' : ''}><summary>${aktuell ? 'Aktuelle Preise in den anderen Städten (aus dem Kontor)' : 'Preise in den anderen Städten (Stand: letzte Reise, ohne Neuigkeiten)'}</summary>
    <table class="preise klein"><thead><tr><th></th>${kopfzeile}</tr></thead><tbody>${zeilen}</tbody></table></details>`
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

function kontorbuchHtml() {
  const runden = [...new Set(team.log.map((x) => x.runde))]
  if (!runden.length) return '<p>Noch keine Einträge.</p>'
  const titel = (r) => (r === 0 ? 'Gründung' : r > RUNDEN ? 'Letzter Markttag' : `Runde ${r}`)
  return runden.map((r) => `<h3>${titel(r)}</h3><ul class="kontor">${team.log.filter((x) => x.runde === r).map(zeile).join('')}</ul>`).join('')
  function zeile(x) {
    const betrag = x.silber ? `<span class="betrag ${x.silber > 0 ? 'plus' : 'minus'}">${x.silber > 0 ? '+' : ''}${x.silber}</span>` : '<span class="betrag"></span>'
    const waren = (o) => Object.entries(o).map(([w, n]) => `${n} ${esc(wareName(w))}`).join(', ')
    if (x.art === 'kauf') return `<li>${betrag}Kauf: ${x.menge} ${esc(wareName(x.ware))} in ${esc(ortName(x.ort))}</li>`
    if (x.art === 'verkauf') return `<li>${betrag}Verkauf: ${x.menge} ${esc(wareName(x.ware))} in ${esc(ortName(x.ort))}</li>`
    if (x.art === 'nachricht') return `<li class="k-nachricht">${betrag}Nachricht: ${esc(x.text)}</li>`
    let t = esc(x.text)
    if (x.verloren && Object.keys(x.verloren).length) t += ` Verloren: ${waren(x.verloren)}.`
    if (x.verkauft) t += ` (${waren(x.verkauft)})`
    return `<li class="${x.art === 'unglueck' ? 'k-unglueck' : ''}">${betrag}${t}</li>`
  }
}

function hilfeHtml() {
  return `<p class="ueber">So geht's</p><h2>Eine Runde hat vier Schritte</h2>
  <ol class="hilfe-liste">
    <li><b>Nachricht:</b> Was gerade in eurem Handelsraum passiert. Es gilt für diese Runde.</li>
    <li><b>Entscheidung:</b> Eine Karte mit zwei Möglichkeiten. Danach seht ihr, was im Buch dazu steht.</li>
    <li><b>Markt:</b> Kaufen (nur Waren mit ★) und verkaufen. Euer Laderaum ist begrenzt.</li>
    <li><b>Reise:</b> Ziel wählen, Schutz überlegen, losreisen. Je mehr Punkte ●, desto gefährlicher. Bei einem Unglück verliert ihr die Hälfte eurer Ladung.</li>
  </ol>
  <p>Nach fünf Runden gibt es einen letzten Markttag. Dann zieht ihr Bilanz und schreibt euren Reisebericht.</p>
  <p><b>Seite nicht schließen und nicht neu laden.</b> Euer Stand ist im iPad gespeichert.</p>
  <div class="fussleiste"><button type="button" class="btn" data-akt="zu">Verstanden</button></div>`
}

function quellenHtml() {
  const zeilen = Object.entries(KARTEN).map(([, k]) => `<li><b>${esc(k.titel)}:</b> ${esc(k.beleg)} <i>${esc(k.spielregel)}</i></li>`).join('')
  const ereig = Object.entries(EREIGNISSE).filter(([, e]) => e.beleg).map(([, e]) => `<li><b>${esc(e.titel)}:</b> ${esc(e.beleg)}</li>`).join('')
  return `<p class="ueber">Woher stammt das?</p><h2>Quellen der Karten</h2>
  <p>Das Spiel ist eine <b>Darstellung</b>: Jemand hat entschieden, was hineinkommt und was nicht. Die Texte der Karten stützen sich auf <i>Geschichte und Geschehen 2</i> (Klett), Seiten 24–33. <b>Alle Zahlen sind Spielwerte.</b> Was nur Spielregel ist, steht bei jeder Karte dabei.</p>
  <h3>Entscheidungskarten</h3><ul class="quellen">${zeilen}</ul>
  <h3>Nachrichten</h3><ul class="quellen">${ereig}</ul>
  <h3>Waren und Orte</h3><p class="klein">Seidenstraße: S. 28 VT1. Hanse: S. 24 D1, S. 30 VT2. Sahara: S. 31 VT7 und D1. Welche Ware an welchem Ort günstig ist, ist vereinfacht.</p>`
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
    <h2>3. Was fehlt im Spiel, das im Buch steht?</h2><p>${esc(b.f3).replace(/\n/g, '<br>')}</p>
    <h2>Kontorbuch</h2>${kontorbuchHtml()}
    <p class="klein">ASGSG Marl · Geschichte 8 · G8.1 Handelsreise · Alle Zahlen sind Spielwerte</p>
  </div>`
}

/* ================= Zeichnen ================= */
function zeichnen() {
  const phase = team ? team.phase : 'start'
  $('app').innerHTML = (ANSICHT[phase] || ANSICHT.start)()
  document.body.dataset.phase = phase
  meldung = ''
}

function weiter(phase) { team.phase = phase; speichern(); zeichnen(); window.scrollTo(0, 0) }

/* ================= Aktionen ================= */
const AKTION = {
  gruenden() {
    const name = $('teamFeld').value.trim()
    if (!name) { meldung = 'Tragt zuerst eure Vornamen ein.'; return zeichnen() }
    const haus = $('hausFeld').value.trim()
    const raeume = Object.keys(RAEUME)
    const raumId = raeume[Math.floor(Math.random() * raeume.length)]
    const starts = RAEUME[raumId].startorte
    team = neuesTeam({ team: name, haus, raum: raumId, ort: starts[Math.floor(Math.random() * starts.length)] })
    weiter('raum')
  },
  'weiter-hypothese'() { weiter('hypothese') },
  los() {
    team.hypothese.text = $('hypText').value.trim()
    if (!team.hypothese.wahl) { meldung = 'Wählt zuerst eine Vermutung.'; speichern(); return zeichnen() }
    team.log.push({ runde: 0, art: 'start', text: `Handelshaus gegründet in ${ortName(team.ort)} mit ${START_SILBER} Silber.` })
    weiter('ereignis')
  },
  'weiter-karte'() {
    if (!team.log.some((x) => x.runde === team.runde && x.art === 'nachricht')) {
      team.log.push({ runde: team.runde, art: 'nachricht', ereignis: ereignis().id, text: ereignis().titel })
    }
    weiter(karteFuer(team) ? 'karte' : 'markt')
  },
  'weiter-markt'() { weiter('markt') },
  'weiter-reise'() { if (!team.reise) team.reise = { ziel: null, karawane: false }; weiter('reise') },
  'zurueck-markt'() { weiter('markt') },
  'schutz-kaufen'() {
    const s = raum().schutz
    if (team.silber < s.kosten) { meldung = 'Dafür reicht euer Silber nicht.'; return zeichnen() }
    team.silber -= s.kosten
    team.flags[s.id] = true
    team.log.push({ runde: team.runde, art: 'schutz', silber: -s.kosten, text: s.name })
    speichern(); zeichnen()
  },
  karawane() {
    team.reise.karawane = !team.reise.karawane
    speichern(); zeichnen()
  },
  losreisen() {
    const r = team.reise
    if (!r || !r.ziel) return
    const s = raum().schutz
    if (r.karawane && r.ziel !== team.ort) {
      if (team.silber < s.kosten) { meldung = 'Für die Karawane reicht euer Silber nicht.'; return zeichnen() }
      team.silber -= s.kosten
      team.log.push({ runde: team.runde, art: 'schutz', silber: -s.kosten, text: s.name })
    } else r.karawane = false
    reiseAbrechnen(team, ereignis(), 'geraet', { hanseAnteil: markt.hanseAnteil })
    weiter('ergebnis')
  },
  naechste() {
    rundeAbschliessen(team)
    weiter(team.runde > RUNDEN ? 'schlussmarkt' : 'ereignis')
  },
  bilanz() { weiter('bilanz') },
  bericht() { weiter('bericht') },
  kontorbuch() { overlay(`<p class="ueber">${esc(team.haus || 'Handelshaus')} · ${esc(team.team)}</p><h2>Kontorbuch</h2>${kontorbuchHtml()}`) },
  hilfe() { overlay(hilfeHtml()) },
  zu() { $('ov').hidden = true },
  pdf() {
    let d = $('druck')
    if (!d) { d = document.createElement('div'); d.id = 'druck'; document.body.appendChild(d) }
    d.innerHTML = druckHtml()
    window.print()
  },
  abschicken() { /* folgt mit der Server-Abgabe */ },
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-akt],[data-hyp],[data-wahl],[data-kauf],[data-verk],[data-verkalle],[data-ziel]')
  if (!t) { if (ev.target === $('ov')) $('ov').hidden = true; return }
  const d = t.dataset
  if (d.akt) return AKTION[d.akt] && AKTION[d.akt]()
  if (d.hyp) { team.hypothese.wahl = d.hyp; team.hypothese.text = $('hypText').value; speichern(); return zeichnen() }
  if (d.wahl) {
    const k = karteFuer(team)
    if (!team.karten[k.id]) team.log.push({ runde: team.runde, ...karteAnwenden(team, k.id, d.wahl) })
    speichern(); return zeichnen()
  }
  const e = ereignis()
  if (d.kauf) { meldung = handeln(team, d.kauf, 1, e, faktorenHier()) || ''; speichern(); return zeichnen() }
  if (d.verk) { meldung = handeln(team, d.verk, -1, e, faktorenHier()) || ''; speichern(); return zeichnen() }
  if (d.verkalle) { meldung = handeln(team, d.verkalle, -(team.ladung[d.verkalle] || 0), e, faktorenHier()) || ''; speichern(); return zeichnen() }
  if (d.ziel && team.phase === 'reise') { team.reise.ziel = d.ziel; speichern(); return zeichnen() }
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
zeichnen()
