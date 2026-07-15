/**
 * server/archive/netzLayout.js
 *
 * Pures, framework-unabhängiges Layout für das Musternetz (Archiv, Variante B).
 * Wird von ZWEI Rendern genutzt, damit App-Tab und SSR-Seite nie auseinander-
 * driften:
 *   - src/components/archiv/MusterNetz.jsx (React/interaktiv)
 *   - server/archive/render.js             (SSR/statisch)
 *
 * Keine Abhängigkeiten, keine Seiteneffekte – nur Geometrie. Ergebnis ist ein
 * Satz Knoten/Kanten/Sektoren mit fertigen Koordinaten; die Renderer setzen das
 * nur noch in SVG (React-Elemente bzw. String) um.
 */

// Relation (Roh-Code aus der collocations-Tabelle) → grammatischer Sektor.
// Nur nicht-leere Sektoren werden gezeichnet; die kanonische Reihenfolge legt
// die Anordnung rund ums Stichwort fest (im Uhrzeigersinn ab oben).
export const REL_GROUP = {
  ATTR: 'Attribut', '~ATTR': 'Attribut',
  OBJA: 'Objekt/Subjekt', '~OBJA': 'Objekt/Subjekt',
  OBJD: 'Objekt/Subjekt', '~OBJD': 'Objekt/Subjekt',
  SUBJA: 'Objekt/Subjekt', '~SUBJA': 'Objekt/Subjekt',
  KON: 'Koordination',
  GMOD: 'Genitiv', '~GMOD': 'Genitiv', PP: 'Genitiv',
  ADV: 'Adverbial',
  PRED: 'Prädikativ',
}
export const GROUP_ORDER = ['Attribut', 'Objekt/Subjekt', 'Koordination', 'Genitiv', 'Adverbial', 'Prädikativ']

const DEG = Math.PI / 180
function polar(cx, cy, r, deg) {
  return [cx + r * Math.cos(deg * DEG), cy + r * Math.sin(deg * DEG)]
}

/**
 * Berechnet das komplette Netz-Layout.
 * @param {Array}  patterns  fetchSyntagmaticPatterns()-Einträge (mit relation, logDice, kollokator …)
 * @param {Array}  netz      fetchSecondaryCollocates()-Einträge ({ base, collocates })
 * @param {number} maxNodes  wie viele Partnerwörter maximal (mobil weniger)
 * @returns {{ W, H, cx, cy, nodes, edges, sectors }}
 */
export function computeNetzLayout({ patterns = [], netz = [], maxNodes = 6 } = {}) {
  const W = 460, H = 360, cx = W / 2, cy = H / 2 + 2
  const R = 86 // Primärradius (Knotenmitten)

  const shown = patterns.slice(0, maxNodes)
  const byGroup = new Map()
  for (const p of shown) {
    const g = REL_GROUP[p.relation] || 'Adverbial'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g).push(p)
  }
  const groups = GROUP_ORDER.filter((g) => byGroup.has(g))
  const G = groups.length || 1

  const lds = shown.map((p) => p.logDice)
  const minLd = Math.min(...lds, 0), maxLd = Math.max(...lds, 1)
  const nodeR = (ld) => 6 + (maxLd > minLd ? (ld - minLd) / (maxLd - minLd) : 0.5) * 6

  const nodes = []
  const edges = []
  const sectors = []
  const netzByBase = new Map(netz.map((n) => [n.base.toLowerCase(), n.collocates]))

  groups.forEach((g, gi) => {
    const items = byGroup.get(g)
    const groupAngle = -90 + gi * (360 / G) // ab oben, im Uhrzeigersinn
    const span = Math.min((360 / G) * 0.72, Math.max(items.length - 1, 0) * 26)
    sectors.push({ label: g, angle: groupAngle })

    items.forEach((p, i) => {
      const a = items.length === 1 ? groupAngle : groupAngle - span / 2 + i * (span / (items.length - 1))
      // Radius bei vollen Sektoren (≥3) staffeln → benachbarte Labels trennen.
      const rr = R + (items.length >= 3 ? (i % 2) * 20 : 0)
      const [x, y] = polar(cx, cy, rr, a)
      const r = nodeR(p.logDice)
      const strength = maxLd > minLd ? (p.logDice - minLd) / (maxLd - minLd) : 0.7
      edges.push({ x1: cx, y1: cy, x2: x, y2: y, opacity: 0.4 + strength * 0.5, w: 1.6 + strength * 1.1 })
      // Label radial nach außen entlang der Speiche (minimiert Überlappung).
      const [lx, ly] = polar(cx, cy, rr + r + 8, a)
      const cosA = Math.cos(a * DEG)
      const anchor = cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle'
      nodes.push({ id: p.kollokator, x, y, r, angle: a, kind: 'primary', p, lx, ly, anchor })

      // graue Satelliten fürs Wortnetz (nur an Basen, die im Netz vorkommen)
      const sat = netzByBase.get(p.kollokator.toLowerCase())
      if (sat && sat.length) {
        const take = sat.slice(0, 3)
        const satSpan = 26
        take.forEach((c, j) => {
          const sa = take.length === 1 ? a : a - satSpan / 2 + j * (satSpan / (take.length - 1))
          const [sx, sy] = polar(cx, cy, rr + 30, sa)
          edges.push({ x1: x, y1: y, x2: sx, y2: sy, opacity: 0.5, w: 1.2, gray: true })
          nodes.push({ id: p.kollokator + '/' + c.kollokator, x: sx, y: sy, r: 3.4, kind: 'secondary', label: c.kollokator, base: p.kollokator })
        })
      }
    })
  })

  // Sektor-Labels außen, Winkel um 14° versetzt → sitzen nicht auf einer
  // Knoten-Speiche (sonst kollidiert das Sektor- mit dem Knoten-Label).
  for (const s of sectors) {
    const la = s.angle - 14
    const [x, y] = polar(cx, cy, R + 60, la)
    const cosA = Math.cos(la * DEG)
    s.anchor = cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle'
    s.x = Math.max(10, Math.min(W - 10, x))
    s.y = Math.max(14, Math.min(H - 6, y))
  }

  return { W, H, cx, cy, nodes, edges, sectors }
}
