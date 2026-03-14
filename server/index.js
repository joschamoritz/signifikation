import express         from 'express'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchBonusQuestion } from './dwds.js'
import { fetchZeitreise } from './diacollo.js'

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
function loadZeitreise()  { try { return load('zeitreise.json') } catch { return {} } }

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

/** GET /api/zeitreise → Zeitreise-Eintrag des Tages */
app.get('/api/zeitreise', (req, res) => {
  try {
    const datum    = req.query.datum || todayDatum()
    const zeitreise = loadZeitreise()
    const entry    = zeitreise[datum]
    if (!entry) return res.status(404).json({ error: `Kein Zeitreise-Eintrag für ${datum}` })
    res.json(entry)
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

    let queries
    if (rel === 'OBJ') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
      ]
    } else if (rel === 'KON') {
      queries = [
        `"${collocate} und ${lemma}"`,
        `"${lemma} und ${collocate}"`,
        `"${collocate} oder ${lemma}"`,
        `"${lemma} oder ${collocate}"`,
      ]
    } else if (rel === '~ATTR') {
      queries = [
        `"${lemma}e ${collocate}"`,
        `"${lemma}en ${collocate}"`,
        `"${lemma}er ${collocate}"`,
        `"${lemma} ${collocate}"`,
      ]
    } else if (rel === '~ADV') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
      ]
    } else if (rel === 'ADV') {
      queries = [
        `"${collocate} ${lemma}"`,
        `"${lemma} ${collocate}"`,
      ]
    } else {
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

/** GET /api/bonus – Bonusfrage für ein Lemma */
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

/** POST /admin/tag – Tageseintrag anlegen/überschreiben */
app.post('/admin/tag', requireAuth, async (req, res) => {
  const { datum, woerter, notizen = [], links = [], positionen = [], zeitreise_lemma = '' } = req.body
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

    // Zeitreise optional
    let zeitreiseOk = null
    if (zeitreise_lemma.trim()) {
      console.log(`  Lade DiaCollo-Daten für „${zeitreise_lemma}" …`)
      try {
        const zr = await fetchZeitreise(zeitreise_lemma.trim())
        const zeitreise = loadZeitreise()
        if (zr) {
          zeitreise[datum] = zr
          save('zeitreise.json', zeitreise)
          zeitreiseOk = true
          console.log(`  Zeitreise gespeichert: ${zr.paare.map(p => `${p.jahrzehnt}:${p.kollokat}`).join(', ')}`)
        } else {
          zeitreiseOk = false
          console.warn(`  Zeitreise: nicht genügend DiaCollo-Daten für „${zeitreise_lemma}"`)
        }
      } catch (err) {
        zeitreiseOk = false
        console.error(`  Zeitreise-Fehler: ${err.message}`)
      }
    }

    console.log(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)
    res.json({ ok: true, datum, ids, zeitreiseOk })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** GET /admin/kalender – alle Einträge (inkl. Zeitreise-Status) */
app.get('/admin/kalender', requireAuth, (req, res) => {
  const kalender  = load('kalender.json')
  const lemmataDB = load('lemmata.json')
  const zeitreise = loadZeitreise()
  const result = {}
  for (const [datum, ids] of Object.entries(kalender)) {
    result[datum] = {
      lemmata:     ids.map(id => {
        const l = lemmataDB.find(l => l.id === id)
        return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
      }),
      hasZeitreise: !!zeitreise[datum],
    }
  }
  res.json(result)
})

/** GET /admin/tag/:datum – Eintrag zum Bearbeiten laden */
app.get('/admin/tag/:datum', requireAuth, (req, res) => {
  const kalender  = load('kalender.json')
  const lemmataDB = load('lemmata.json')
  const zeitreise = loadZeitreise()
  const ids = kalender[req.params.datum]
  if (!ids) return res.status(404).json({ error: 'Kein Eintrag' })
  const lemmata = ids.map(id => lemmataDB.find(l => l.id === id)).filter(Boolean)
  res.json({
    datum:           req.params.datum,
    woerter:         lemmata.map(l => l.lemma),
    positionen:      lemmata.map(l => l.pos || 'Substantiv'),
    notizen:         lemmata.map(l => l.notiz || ''),
    links:           lemmata.map(l => l.link  || ''),
    zeitreise_lemma: zeitreise[req.params.datum]?.lemma || '',
  })
})

/** DELETE /admin/tag/:datum – Eintrag löschen */
app.delete('/admin/tag/:datum', requireAuth, (req, res) => {
  const kalender  = load('kalender.json')
  const zeitreise = loadZeitreise()
  delete kalender[req.params.datum]
  delete zeitreise[req.params.datum]
  save('kalender.json', kalender)
  save('zeitreise.json', zeitreise)
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
