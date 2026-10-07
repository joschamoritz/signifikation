/*
  HANDELSREISE – Kartenzeichnungen (Gerät und Beamer)
  Alles selbst gezeichnet. Raumkarten: Skizzen, nicht maßstabsgetreu (Lage grob
  nach den Karten D1, S. 24/29/31). Orientierungskarte: heutige Küstenlinien,
  stark vereinfacht, Längen-/Breitengrade als Koordinaten.
*/
import { RAEUME, ziele as zieleVon, hash } from './handelsreise-regeln.js'

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/* ================= Siegel ================= */
export function siegel(buchstabe, groesse = 56, farbe = '') {
  const pkt = []
  for (let i = 0; i < 36; i++) {
    const w = (i / 36) * Math.PI * 2
    const r = i % 2 ? 46 : 50 - (hash(buchstabe + i) % 3)
    pkt.push(`${(50 + r * Math.cos(w)).toFixed(1)},${(50 + r * Math.sin(w)).toFixed(1)}`)
  }
  return `<svg class="siegel${farbe ? ' siegel-' + farbe : ''}" width="${groesse}" height="${groesse}" viewBox="0 0 100 100" aria-hidden="true">
    <polygon points="${pkt.join(' ')}" class="siegel-rand"/>
    <circle cx="50" cy="50" r="36" class="siegel-innen"/>
    <circle cx="50" cy="50" r="31" class="siegel-ring"/>
    <text x="50" y="62" text-anchor="middle" class="siegel-text">${esc(buchstabe)}</text>
  </svg>`
}

/* ================= Raumkarten ================= */
const DEKO = {
  hanse: `
    <path class="d-meer" d="M70 12 L180 12 C176 40 168 62 186 84 C196 98 176 112 158 116 C132 122 110 140 92 152 C80 140 76 120 66 104 C58 80 62 40 70 12 Z"/>
    <path class="d-meer" d="M212 104 C226 92 236 70 254 58 C268 46 286 40 300 22 C312 14 326 14 334 22 C322 34 312 46 318 60 C322 74 300 90 280 100 C262 110 236 116 212 104 Z"/>
    <text x="118" y="60" class="d-name">Nordsee</text><text x="262" y="82" class="d-name">Ostsee</text>
    <path class="d-fluss" d="M140 225 C150 205 128 196 136 176 C142 162 120 150 104 150"/>
    <text x="150" y="196" class="d-klein">Rhein</text>`,
  seide: `
    <path class="d-meer" d="M14 118 C40 108 70 122 96 132 C118 140 134 150 142 164 C136 180 112 186 86 182 C62 178 40 194 20 190 L14 190 Z"/>
    <text x="70" y="166" class="d-name">Mittelmeer</text>
    <path class="d-meer" d="M170 262 C180 230 220 214 270 214 C310 214 336 200 370 196 C382 196 390 200 392 206 L392 262 Z"/>
    <text x="230" y="250" class="d-name">Indischer Ozean</text>
    <g class="d-berg"><path d="M180 128 l9 -14 l9 14 Z"/><path d="M194 128 l11 -18 l11 18 Z"/></g>
    <ellipse cx="318" cy="78" rx="34" ry="12" class="d-wueste"/>
    <text x="318" y="82" class="d-klein">Taklamakan</text>
    <text x="300" y="44" class="d-name">Mongolenreich</text>`,
  sahara: `
    <path class="d-meer" d="M12 12 L392 12 L392 22 C300 26 200 20 120 24 C70 26 30 22 12 30 Z"/>
    <text x="250" y="22" class="d-klein">Mittelmeer</text>
    <g class="d-berg"><path d="M40 62 l8 -12 l8 12 Z"/><path d="M54 62 l10 -16 l10 16 Z"/><path d="M128 50 l8 -12 l8 12 Z"/></g>
    <text x="34" y="78" class="d-klein">Atlas</text>
    <g class="d-duene">${Array.from({ length: 18 }, (_, i) => {
      const x = 60 + ((i * 53) % 300), y = 80 + ((i * 37) % 90)
      return `<path d="M${x} ${y} q8 -7 16 0"/>`
    }).join('')}</g>
    <text x="300" y="120" class="d-name">Sahara</text>
    <path class="d-niger" d="M30 262 C70 252 110 248 140 238 C170 228 210 204 250 195 C290 188 320 206 340 232 C350 246 356 256 364 264"/>
    <text x="320" y="214" class="d-klein">Niger</text>`,
}

/**
 * Raumkarte. siegelAuf: [{ ort, buchstabe, farbe }] – Siegel an Orten (Gerät: eines, Beamer: alle Teams).
 * hier/auswahl/klickbar nur im Gerät.
 */
export function raumKarte(raumId, { hier = null, auswahl = null, ueber = null, klickbar = false, siegelAuf = [] } = {}) {
  const R = RAEUME[raumId]
  // Anklickbar: direkte Ziele und Eilreise-Ziele (die Karte wählt bei Eilreise die Zwischenstation mit)
  const zielListe = klickbar && hier ? zieleVon(raumId, hier).filter((z) => z.ort !== hier) : []
  const ziele = zielListe.map((z) => z.ort)
  const legs = auswahl && hier && auswahl !== hier ? (ueber ? [[hier, ueber], [ueber, auswahl]] : [[hier, auswahl]]) : []
  let s = `<svg class="weltkarte" viewBox="0 0 400 270" role="img" aria-label="Karte: ${esc(R.name)}">`
  s += `<g class="deko">${DEKO[raumId] || ''}</g>`
  s += '<rect x="4" y="4" width="392" height="262" class="k-rahmen"/><rect x="10" y="10" width="380" height="250" class="k-rahmen2"/>'
  s += '<g class="k-rose" transform="translate(360 228)"><path d="M0 -18 L4 0 L0 18 L-4 0 Z"/><path d="M-18 0 L0 4 L18 0 L0 -4 Z"/><text y="-21" text-anchor="middle">N</text></g>'
  for (const st of R.strecken) {
    const a = R.orte[st.a], b = R.orte[st.b]
    const aktiv = legs.some(([x, y]) => (st.a === x && st.b === y) || (st.a === y && st.b === x))
    // Seewege um Land herum als Kurve (kurve = Kontrollpunkt)
    const [mx, my] = st.kurve ? [(a.x + 2 * st.kurve[0] + b.x) / 4, (a.y + 2 * st.kurve[1] + b.y) / 4] : [(a.x + b.x) / 2, (a.y + b.y) / 2]
    s += st.kurve
      ? `<path d="M${a.x} ${a.y} Q${st.kurve[0]} ${st.kurve[1]} ${b.x} ${b.y}" class="k-weg k-${st.art}${aktiv ? ' k-aktiv' : ''}"/>`
      : `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="k-weg k-${st.art}${aktiv ? ' k-aktiv' : ''}"/>`
    const zeichen = { see: '≈', land: '⁂', wueste: '∴', fluss: '≈' }[st.art]
    s += `<text x="${mx}" y="${my - 6}" text-anchor="middle" class="k-zeichen">${zeichen}</text>`
  }
  for (const [id, o] of Object.entries(R.orte)) {
    const ziel = ziele.includes(id)
    const zEintrag = zielListe.find((z) => z.ort === id)
    s += `<g class="k-ort${ziel ? ' k-ziel' : ''}${auswahl === id ? ' k-gewaehlt' : ''}"${ziel ? ` data-ziel="${id}"${zEintrag.ueber ? ` data-ueber="${zEintrag.ueber}"` : ''} role="button" tabindex="0" aria-label="Nach ${esc(o.name)}"` : ''}>`
    if (ziel) s += `<circle cx="${o.x}" cy="${o.y}" r="22" class="k-treffer"/>`
    s += `<circle cx="${o.x}" cy="${o.y}" r="7" class="k-punkt"/>`
    s += `<text x="${o.x}" y="${o.y < 200 ? o.y + 24 : o.y - 14}" text-anchor="middle" class="k-name">${esc(o.name)}</text></g>`
  }
  // Mehrere Siegel am selben Ort leicht versetzen
  const proOrt = {}
  for (const sg of siegelAuf) {
    const o = R.orte[sg.ort]
    if (!o) continue
    const i = (proOrt[sg.ort] = (proOrt[sg.ort] || 0) + 1) - 1
    const dx = (i % 3) * 30 - 30, dy = Math.floor(i / 3) * 26 - 15
    s += `<g transform="translate(${o.x + dx} ${o.y + dy})">${siegel(sg.buchstabe, 30, sg.farbe).replace('<svg ', '<svg x="0" y="0" ')}</g>`
  }
  return s + '</svg>'
}

/* ================= Orientierungskarte (heutige Umrisse) ================= */
// Punkte als [Längengrad, Breitengrad]; gezeichnet wird x = Länge, y = −Breite.
const LAND = [[-9, 37], [-9, 43], [-2, 43.5], [-1, 46], [-4.5, 48], [2, 51], [4, 52], [8, 54], [8.5, 57], [10, 57.5], [10.5, 55], [12, 54], [14, 54], [18, 54.5], [21, 55], [21, 57], [24, 57], [23, 59], [28, 59.5], [30, 60], [25, 60.3], [22, 60.5], [21, 63], [25, 65.5], [21, 66], [17, 62], [19, 59.5], [16, 56], [13, 55.5], [11, 58], [5, 58], [5, 62], [14, 68],
  [130, 68], [130, 42], [122, 40], [120, 36], [122, 30], [120, 24], [110, 20], [108, 21], [109, 12], [105, 9], [100, 13], [100, 8], [104, 1], [98, 8], [98, 16], [92, 22], [87, 21], [80, 15], [77, 8], [73, 17], [72, 21], [67, 24], [57, 25], [56, 26], [58, 22], [55, 17], [45, 13], [43, 13],
  [43, 12], [51, 11], [48, 5], [40, -2], [40, -5], [12, -5], [9, 4], [5, 5], [-5, 5], [-12, 8], [-17, 15], [-17, 21], [-10, 30], [-6, 36]]
const MEERE = [
  // Mittelmeer
  [[-5.5, 36], [-2, 37], [0, 39], [3, 43], [8, 44], [10, 44], [12, 42], [15.5, 40], [16, 38], [18, 40], [14, 42], [12.3, 45.4], [14, 45.5], [19, 42], [20, 40], [23, 38], [23, 40.5], [26, 40.5], [27, 37], [30, 36.3], [36, 36.5], [35, 33], [34, 31.5], [32, 31.2], [29, 30.8], [25, 31.8], [20, 32], [19, 30.5], [15, 32], [10, 34], [10, 37], [3, 36.8], [-2, 35.3], [-5.5, 35.8]],
  [[28, 41], [29, 45], [33, 46], [37, 47], [41, 42], [36, 41.5], [31, 41.2]],               // Schwarzes Meer
  [[47, 44], [50, 47], [53, 46], [54, 41], [53, 37], [50, 37], [49, 40]],                   // Kaspisches Meer
  [[32.5, 30], [35, 28], [39, 21], [43, 13], [43, 12.5], [42, 15], [38, 19], [33.5, 27]],   // Rotes Meer
  [[48, 30], [51, 27.5], [56, 26.5], [56, 24.5], [52, 24], [50, 26], [48, 29]],             // Persischer Golf
]
const INSELN = [
  [[-5, 50], [1.5, 51], [1.7, 52.8], [0, 53.5], [-1.5, 55], [-2, 57], [-3.5, 58.6], [-5, 58.5], [-6, 56.5], [-4.8, 55], [-3, 54], [-4.5, 53], [-4.5, 51.5]], // Britannien
  [[-6, 52], [-6, 54.5], [-8, 55.2], [-10, 54], [-10, 51.6]],                                // Irland
]
// Lage der Spielorte (heutige Koordinaten, gerundet)
const GEO = {
  venedig: [12.3, 45.4], bagdad: [44.4, 33.3], quinsai: [120.2, 30.3],
  london: [-0.1, 51.5], koeln: [7, 50.9], luebeck: [10.7, 53.9], nowgorod: [31.3, 58.5],
  sidschilmasa: [-4.3, 31.3], taghaza: [-4.9, 23.6], timbuktu: [-3, 16.8], djenne: [-4.6, 13.9], samarkand: [67, 39.7],
}
const pfad = (pkt) => 'M' + pkt.map(([x, y]) => `${x} ${-y}`).join(' L') + ' Z'

export function orientierungsKarte(eigenerRaum = null) {
  let s = '<svg class="orient" viewBox="-20 -68 150 73" role="img" aria-label="Orientierungskarte mit heutigen Umrissen">'
  s += '<rect x="-20" y="-68" width="150" height="73" class="o-wasser"/>'
  s += `<path d="${pfad(LAND)}" class="o-land"/>`
  for (const m of MEERE) s += `<path d="${pfad(m)}" class="o-wasser o-rand"/>`
  for (const i of INSELN) s += `<path d="${pfad(i)}" class="o-land"/>`
  for (const [raumId, R] of Object.entries(RAEUME)) {
    const eigen = raumId === eigenerRaum
    for (const st of R.strecken) {
      const [x1, y1] = GEO[st.a], [x2, y2] = GEO[st.b]
      s += `<line x1="${x1}" y1="${-y1}" x2="${x2}" y2="${-y2}" class="o-weg${eigen ? ' o-eigen' : ''}"/>`
    }
    for (const id of Object.keys(R.orte)) {
      const [x, y] = GEO[id]
      s += `<circle cx="${x}" cy="${-y}" r="${eigen ? 1.3 : 0.9}" class="o-ort${eigen ? ' o-eigen' : ''}"/>`
    }
  }
  const beschr = [['Hanse', 2, -61.5], ['Seidenstraße', 70, -38], ['Sahara', -14, -27]]
  for (const [name, x, y] of beschr) s += `<text x="${x}" y="${y}" class="o-name">${name}</text>`
  s += '<text x="40" y="-60" class="o-kont">EUROPA</text><text x="85" y="-55" class="o-kont">ASIEN</text><text x="15" y="-8" class="o-kont">AFRIKA</text>'
  return s + '</svg>'
}
