import express         from 'express'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchBonusQuestion } from './dwds.js'
import { fetchZeitreise, debugDiaCollo, clearCorporaCache } from './diacollo.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA      = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

const ADMIN_KEY = process.env.ADMIN_KEY || 'signifikation-admin'
const PORT      = process.env.PORT      || 3001
if (!process.env.ADMIN_KEY) console.warn('⚠️  ADMIN_KEY nicht gesetzt – Standard-Passwort aktiv!')

const app = express()
app.use(express.json())

// ── Helpers ─────────────────────────────────────────────────
const fileCache = {}
function load(file) {
  if (!fileCache[file]) fileCache[file] = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
  return fileCache[file]
}
function save(file, data) {
  writeFileSync(join(DATA, file), JSON.stringify(data, null, 2))
  fileCache[file] = data
}
function loadZeitreise()  { try { return load('zeitreise.json') } catch { return {} } }

function requireAuth(req, res, next) {
  // API-Calls nutzen Header; nur GET /admin (Browser) akzeptiert zusätzlich query.key
  const key = req.headers['x-admin-key'] || (req.path === '/admin' ? req.query.key : undefined)
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
  const { collocate, lemma, rel, corpus, year } = req.query
  if (!collocate || !lemma) return res.status(400).json({ error: 'collocate und lemma erforderlich' })

  // Korpora die DWDS /r/ als Filter akzeptiert (DiaCollo-IDs ≠ /r/-IDs für manche)
  const VALID_R_CORPORA = new Set(['kern', 'dta', 'dtae', 'dtak', 'ddr', 'politische_reden', 'bundestag', 'reichstag'])
  const corpusForR = corpus && VALID_R_CORPORA.has(corpus) ? corpus : null

  // Build optional corpus + date suffix for DWDS search
  function corpusSuffix() {
    let s = ''
    if (corpusForR) s += `&corpus=${encodeURIComponent(corpusForR)}`
    if (year) {
      const y = parseInt(year)
      if (!isNaN(y)) s += `&date=${y - 15}:${y + 15}`  // ±15 Jahre um das Jahrzehnt
    }
    return s
  }

  async function tryQuery(q, extra = '') {
    const url = `https://www.dwds.de/r/?q=${encodeURIComponent(q)}&view=json&limit=10${extra}`
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

    // @Wort = Lemmasuche (alle Flexionsformen), wichtig für flektierte Formen im Korpus
    const L = `@${lemma}`
    const C = `@${collocate}`

    let queries
    if (rel === 'OBJ') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
        `${C} #10 ${L}`,
        `${L} #10 ${C}`,
      ]
    } else if (rel === 'KON') {
      // KON = Koordination: Flexionsformen über @ matchen, weites Fenster für Listenkoordination
      queries = [
        `"${collocate} und ${lemma}"`,
        `"${lemma} und ${collocate}"`,
        `"${collocate} oder ${lemma}"`,
        `"${lemma} oder ${collocate}"`,
        `${C} #15 ${L}`,
        `${L} #15 ${C}`,
        `${C} #30 ${L}`,
        `${L} #30 ${C}`,
      ]
    } else if (rel === '~ATTR') {
      queries = [
        `"${lemma}e ${collocate}"`,
        `"${lemma}en ${collocate}"`,
        `"${lemma}er ${collocate}"`,
        `"${lemma} ${collocate}"`,
        `${C} #5 ${L}`,
        `${L} #5 ${C}`,
      ]
    } else if (rel === '~OBJ') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
        `${C} #10 ${L}`,
        `${L} #10 ${C}`,
      ]
    } else if (rel === '~ADV') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
        `${C} #5 ${L}`,
        `${L} #5 ${C}`,
      ]
    } else if (rel === 'ADV') {
      queries = [
        `"${collocate} ${lemma}"`,
        `"${lemma} ${collocate}"`,
        `${C} #5 ${L}`,
        `${L} #5 ${C}`,
      ]
    } else {
      // Zeitreise: kein fester Relationstyp – Kollokation = Co-Vorkommen im Kontextfenster,
      // nicht notwendigerweise direkt nebeneinander.
      // Reihenfolge: exakte Phrase → Nähe (#10 = innerhalb 10 Wörter) → loose AND
      queries = [
        `"${collocate} ${lemma}"`,              // direkt benachbart
        `"${lemma} ${collocate}"`,
        `${C} #10 ${L}`,                        // Lemmasuche, innerhalb 10 Wörter
        `${L} #10 ${C}`,
        `${C} #20 ${L}`,                        // etwas weiter
        `${L} #20 ${C}`,
      ]
    }

    const extra = corpusSuffix()
    const corpusOnly = corpusForR ? `&corpus=${encodeURIComponent(corpusForR)}` : ''
    const dateOnly   = year ? `&date=${parseInt(year)}:${parseInt(year) + 30}` : ''
    let results = []

    // Zeitreise: Korpus + Datum → Korpus-only → Datum-only (Fallback für nicht-/r/-Korpora)
    if (corpus) {
      for (const q of queries) {
        results = await tryQuery(q, extra)           // Korpus + Datum
        if (results.length >= 2) break
      }
      if (results.length === 0 && corpusForR) {
        for (const q of queries) {
          results = await tryQuery(q, corpusOnly)    // Korpus ohne Datum
          if (results.length >= 2) break
        }
      }
      if (results.length === 0 && year) {
        for (const q of queries) {
          results = await tryQuery(q, dateOnly)      // Datum-only (Korpus nicht verfügbar in /r/)
          if (results.length >= 2) break
        }
      }
    } else {
      // Normaler Kollokationen-Modus: alle Queries durchlaufen
      for (const q of queries) {
        results = await tryQuery(q, extra)
        if (results.length >= 2) break
      }
    }
    // Prefer non-Wikipedia sources; fall back if too few results
    const noWiki = results.filter(item => !(item.bibl_string || '').toLowerCase().includes('wikipedia'))
    const final  = noWiki.length >= 2 ? noWiki : results
    res.json(final.slice(0, 5).map(parseItem))
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

/** GET /admin/diacollo-config – Korpus-Konfiguration laden */
app.get('/admin/diacollo-config', requireAuth, (req, res) => {
  try {
    const cfg = JSON.parse(readFileSync(join(DATA, 'diacollo-config.json'), 'utf8'))
    res.json(cfg)
  } catch {
    res.status(404).json({ error: 'Keine Konfiguration gefunden' })
  }
})

/** POST /admin/diacollo-config – Korpus-Konfiguration speichern */
app.post('/admin/diacollo-config', requireAuth, (req, res) => {
  const { corpora } = req.body
  if (!Array.isArray(corpora)) return res.status(400).json({ error: 'corpora-Array erforderlich' })
  try {
    const cfg = JSON.parse(readFileSync(join(DATA, 'diacollo-config.json'), 'utf8'))
    // Nur enabled-Flag übernehmen, Rest (label, zeitraum, slice) bleibt erhalten
    for (const item of corpora) {
      const entry = cfg.corpora.find(c => c.id === item.id)
      if (entry) entry.enabled = !!item.enabled
    }
    writeFileSync(join(DATA, 'diacollo-config.json'), JSON.stringify(cfg, null, 2))
    clearCorporaCache()
    res.json({ ok: true, active: cfg.corpora.filter(c => c.enabled).map(c => c.id) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** GET /admin/debug-diacollo?q=Wort – roher DiaCollo-Test */
app.get('/admin/debug-diacollo', requireAuth, async (req, res) => {
  const q = req.query.q
  if (!q) return res.status(400).json({ error: 'q= erforderlich' })
  try {
    const result = await debugDiaCollo(q)
    res.json({ q, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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

// ── Globaler Fehler-Handler ───────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unbehandelter Fehler:', err)
  res.status(500).json({ error: err.message || 'Interner Serverfehler' })
})

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Signifikation-Server läuft auf http://localhost:${PORT}`)
  console.log(`Admin: http://localhost:${PORT}/admin`)
})
