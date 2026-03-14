import express         from 'express'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchBonusQuestion } from './dwds.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA      = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

const ADMIN_KEY = process.env.ADMIN_KEY || 'signifikation-admin'
const PORT      = process.env.PORT      || 3001

const app = express()
app.use(express.json())

// ── Helpers ─────────────────────────────────────────────────
function load(file)       { return JSON.parse(readFileSync(join(DATA, file), 'utf8')) }
function save(file, data) { writeFileSync(join(DATA, file), JSON.stringify(data, null, 2)) }

function requireAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Nicht autorisiert' })
  next()
}

function todayDatum() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Public API ───────────────────────────────────────────────

/** GET /api/heute → die 3 Lemmata des Tages */
app.get('/api/heute', (req, res) => {
  try {
    const datum     = req.query.datum || todayDatum()
    const kalender  = load('kalender.json')
    const lemmataDB = load('lemmata.json')

    const ids = kalender[datum]
    if (!ids) return res.status(404).json({ error: `Kein Eintrag für ${datum}` })

    const lemmata = ids.map(id => lemmataDB.find(l => l.id === id)).filter(Boolean)
    res.json(lemmata)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** GET /api/belege – Korpusbelege für ein Kollokationspaar */
app.get('/api/belege', async (req, res) => {
  const { collocate, lemma, rel } = req.query
  if (!collocate || !lemma) return res.status(400).json({ error: 'collocate und lemma erforderlich' })

  async function tryQuery(q) {
    const url = `https://www.dwds.de/r/?q=${encodeURIComponent(q)}&view=json&limit=5`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`DWDS HTTP ${r.status}`)
    const data = await r.json()
    return Array.isArray(data) ? data.filter(item => Array.isArray(item.ctx_?.[1])) : []
  }

  function parseItem(item) {
    const raw = item.ctx_[1]
    const tokens = raw.map(t => ({ w: t.w, ws: t.ws === '1', hl: t.hl_ === 1 }))
    return { tokens, quelle: item.bibl_string || '' }
  }

  try {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

    // Je nach Relation unterschiedliche Phrasen-Varianten probieren
    let queries
    if (rel === 'OBJ') {
      // Verb-Objekt: lemma=Verb, collocate=Nomen
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
      ]
    } else if (rel === 'KON') {
      // Koordination: typischerweise mit "und"/"oder" verbunden
      queries = [
        `"${collocate} und ${lemma}"`,
        `"${lemma} und ${collocate}"`,
        `"${collocate} oder ${lemma}"`,
        `"${lemma} oder ${collocate}"`,
      ]
    } else if (rel === '~ATTR') {
      // Adjektiv attributiv vor Nomen: lemma=Adjektiv, collocate=Nomen
      // Adjektiv flektiert vor dem Nomen → mehrere Endungen versuchen
      queries = [
        `"${lemma}e ${collocate}"`,
        `"${lemma}en ${collocate}"`,
        `"${lemma}er ${collocate}"`,
        `"${lemma} ${collocate}"`,
      ]
    } else if (rel === '~ADV') {
      // Adjektiv als Adverb zu einem Verb: lemma=Adjektiv, collocate=Verb
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
      ]
    } else if (rel === 'ADV') {
      // Verb + Adverb: lemma=Verb, collocate=Adverb
      queries = [
        `"${collocate} ${lemma}"`,
        `"${lemma} ${collocate}"`,
      ]
    } else {
      // ATTR: Adjektiv vor Nomen (lemma=Nomen, collocate=Adjektiv) – auch großgeschrieben versuchen
      queries = [
        `"${collocate} ${lemma}"`,
        `"${cap(collocate)} ${lemma}"`,
      ]
    }

    let results = []
    for (const q of queries) {
      results = await tryQuery(q)
      if (results.length >= 2) break
    }
    res.json(results.slice(0, 5).map(parseItem))
  } catch (err) {
    console.error('Belege-Fehler:', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** GET /api/bonus – Bonusfrage für ein Lemma (PRED-Relation) */
app.get('/api/bonus', async (req, res) => {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id erforderlich' })
  try {
    const lemmataDB = load('lemmata.json')
    const l = lemmataDB.find(l => l.id === id)
    if (!l) return res.json(null)
    const bonus = await fetchBonusQuestion(l.lemma, l.pos || 'Substantiv')
    res.json(bonus)
  } catch {
    res.json(null)
  }
})

// ── Admin API ────────────────────────────────────────────────

/** POST /admin/tag – Tageseintrag anlegen/überschreiben
 *  Body: { datum: "MM-DD", woerter: ["Wort1", "Wort2", "Wort3"] }
 */
app.post('/admin/tag', requireAuth, async (req, res) => {
  const { datum, woerter, notizen = [], links = [], positionen = [] } = req.body
  if (!datum || !Array.isArray(woerter) || woerter.length !== 3) {
    return res.status(400).json({ error: 'datum (MM-DD) und woerter (3 Einträge) erforderlich' })
  }

  try {
    const lemmataDB = load('lemmata.json')
    const kalender  = load('kalender.json')
    const ids       = []

    for (const [i, wort] of woerter.entries()) {
      const pos = (positionen?.[i] || 'Substantiv')
      console.log(`  Lade DWDS-Daten für „${wort}" (${pos}) …`)
      const entry   = await fetchLemma(wort, pos)
      entry.notiz   = notizen[i] || ''
      entry.link    = links[i]   || ''
      const idx     = lemmataDB.findIndex(l => l.id === entry.id)
      if (idx >= 0) lemmataDB[idx] = entry
      else lemmataDB.push(entry)
      ids.push(entry.id)
    }

    kalender[datum] = ids
    save('lemmata.json', lemmataDB)
    save('kalender.json', kalender)

    console.log(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)
    res.json({ ok: true, datum, ids })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** GET /admin/kalender – alle Einträge anzeigen (angereichert mit Lemma-Daten) */
app.get('/admin/kalender', requireAuth, (req, res) => {
  const kalender  = load('kalender.json')
  const lemmataDB = load('lemmata.json')
  const result = {}
  for (const [datum, ids] of Object.entries(kalender)) {
    result[datum] = ids.map(id => {
      const l = lemmataDB.find(l => l.id === id)
      return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
    })
  }
  res.json(result)
})

/** GET /admin/tag/:datum – Eintrag zum Bearbeiten laden */
app.get('/admin/tag/:datum', requireAuth, (req, res) => {
  const kalender  = load('kalender.json')
  const lemmataDB = load('lemmata.json')
  const ids = kalender[req.params.datum]
  if (!ids) return res.status(404).json({ error: 'Kein Eintrag' })
  const lemmata = ids.map(id => lemmataDB.find(l => l.id === id)).filter(Boolean)
  res.json({
    datum:      req.params.datum,
    woerter:    lemmata.map(l => l.lemma),
    positionen: lemmata.map(l => l.pos || 'Substantiv'),
    notizen:    lemmata.map(l => l.notiz || ''),
    links:      lemmata.map(l => l.link  || ''),
  })
})

/** DELETE /admin/tag/:datum – Eintrag löschen */
app.delete('/admin/tag/:datum', requireAuth, (req, res) => {
  const kalender = load('kalender.json')
  delete kalender[req.params.datum]
  save('kalender.json', kalender)
  res.json({ ok: true })
})

/** GET /admin – Admin-Oberfläche */
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(join(__dirname, 'admin.html'))
})

// ── Statisches Frontend (Produktions-Build) ──────────────────
import { existsSync } from 'fs'
const DIST = join(__dirname, '../dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.use((req, res) => res.sendFile(join(DIST, 'index.html')))
}

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Signifikation-Server läuft auf http://localhost:${PORT}`)
  console.log(`Admin: http://localhost:${PORT}/admin?key=${ADMIN_KEY}`)
})
