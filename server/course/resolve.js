/**
 * server/course/resolve.js
 *
 * Inhalts-Auflösung für die DRUCK-Ausspielung (AP5). Nimmt ein Kurs-Item
 * (Engine-Spec-Shape: `static` ODER `corpus-template`) und liefert ein voll
 * aufgelöstes, render-fertiges Item: alle Engine-Direktiven (`@from:bindings…`)
 * und Template-Platzhalter (`{{top.lemma}}`, `{{logDice:1.logDice}}` …) sind
 * ersetzt, Korpus-Werte (logDice/Frequenz/Belegsatz) eingespielt.
 *
 * BEWUSST OHNE DB-Import: der Korpus-Zugang wird als `corpus`-Adapter
 * hereingereicht (queryRelation + fetchBeleg). Damit ist die gesamte
 * Auflösungslogik rein/unit-testbar (Fake-Korpus im Test), und die echte
 * wortprofil.db/belege.db-Anbindung lebt nur in pdf/generate.js.
 *
 * Druck-Kontext-Eigenheiten (vs. interaktiv, AP8):
 *   - `{{selected.*}}`/`{{chosen.*}}` existieren im Druck nicht → onChoice/
 *     selected-abhängiges Feedback wird verworfen, der Erwartungshorizont
 *     (solution.rubric + onCorrect) trägt die Lösung.
 *   - Kandidaten/Optionen werden DETERMINISTISCH geordnet (alphabetisch), nicht
 *     gemischt: reproduzierbare PDFs, und die Lösung steht nie an fester Stelle.
 *
 * Rang-Referenz-Grammatik (Engine-Spec §4):
 *   N (Ganzzahl)  → logDice-Rang N (Ergebnis ist ORDER BY logDice DESC)
 *   "logDice:N"   → logDice-Rang N · "logDice:last" → schwächster im Pool
 *   "freq:N"      → Frequenz-Rang N (derselbe Pool, nach frequency DESC) · "freq:last"
 *   "top" / "rank:N" → in Platzhaltern Alias für logDice:1 bzw. logDice:N
 */

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g

/** logDice → "11,5" (eine Nachkommastelle, deutsches Dezimalkomma). */
export function fmtLogDice(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(1).replace('.', ',')
}

/** Frequenz → "2.047" (deutsche Tausendertrennung). */
export function fmtFrequency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('de-DE')
}

/** Pool nach Frequenz absteigend (stabile Kopie; logDice-Reihenfolge bleibt im Original). */
function sortedByFreq(pool) {
  return [...pool].sort((a, b) => b.frequency - a.frequency)
}

/**
 * Löst eine einzelne Rang-Referenz gegen die beiden Pool-Sichten auf.
 * @returns {object|null} corpusRow {lemma, frequency, logDice} oder null
 */
function resolveRef(ref, byLogDice, byFreq) {
  if (ref == null) return null
  if (typeof ref === 'number') return byLogDice[ref - 1] ?? null

  const s = String(ref).trim()
  const m = /^(logDice|freq):(\d+|last)$/.exec(s)
  if (m) {
    const view = m[1] === 'freq' ? byFreq : byLogDice
    const idx = m[2] === 'last' ? view.length - 1 : Number(m[2]) - 1
    return view[idx] ?? null
  }
  // blanker Ganzzahl-String
  if (/^\d+$/.test(s)) return byLogDice[Number(s) - 1] ?? null
  return null
}

/** Liste von Referenzen → Liste von Rows (null gefiltert). */
function resolveRefs(refs, byLogDice, byFreq) {
  return (refs ?? [])
    .map(r => resolveRef(r, byLogDice, byFreq))
    .filter(Boolean)
}

/**
 * Baut den Platzhalter-Kontext (top/rank:N/logDice:N/freq:N + lemma) aus den
 * Pools. Wird für die String-Ersetzung in prompt/feedback/solution genutzt.
 */
function buildPlaceholderContext({ byLogDice, byFreq, lemma }) {
  return { byLogDice, byFreq, lemma }
}

/** Wert eines Platzhalter-Pfads wie "top.lemma" / "logDice:1.logDice" / "lemma". */
function placeholderValue(path, ctx) {
  const [head, field] = path.split('.')
  if (head === 'lemma' && !field) return ctx.lemma ?? ''

  // selected/chosen sind interaktiv-only → im Druck nicht auflösbar
  if (head === 'selected' || head === 'chosen') return null

  let ref = head
  if (head === 'top') ref = 'logDice:1'
  else if (head.startsWith('rank:')) ref = `logDice:${head.slice(5)}`

  const row = resolveRef(ref, ctx.byLogDice, ctx.byFreq)
  if (!row) return null
  if (field === 'lemma' || !field) return row.lemma
  if (field === 'logDice') return fmtLogDice(row.logDice)
  if (field === 'frequency') return fmtFrequency(row.frequency)
  return null
}

/**
 * Ersetzt {{…}} in einem String. Enthält der String einen Platzhalter, der im
 * Druck nicht auflösbar ist (selected/chosen), gibt die Funktion null zurück —
 * der Aufrufer verwirft solche Texte (z. B. onChoice).
 */
export function fillString(str, ctx) {
  if (typeof str !== 'string') return str
  let dropped = false
  const out = str.replace(PLACEHOLDER_RE, (_, expr) => {
    const val = placeholderValue(expr, ctx)
    if (val == null) { dropped = true; return '' }
    return String(val)
  })
  return dropped ? null : out
}

/** Tiefes Füllen aller Strings in einer (JSON-artigen) Struktur. */
function fillDeep(value, ctx) {
  if (typeof value === 'string') {
    const filled = fillString(value, ctx)
    return filled == null ? undefined : filled // undefined ⇒ Schlüssel fällt weg
  }
  if (Array.isArray(value)) return value.map(v => fillDeep(v, ctx)).filter(v => v !== undefined)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const filled = fillDeep(v, ctx)
      if (filled !== undefined) out[k] = filled
    }
    return out
  }
  return value
}

const ALPHA = (a, b) => String(a).localeCompare(String(b), 'de')

/**
 * Erzeugt die Kandidaten-/Options-Liste aus den Bindings (`@from:bindings`):
 * Lösung(en) + Distraktoren aus near/mid, deterministisch alphabetisch sortiert.
 * Markiert jede Karte mit `isAnswer`, vergibt stabile Ids c1…cn.
 */
function buildCandidates({ bindings, byLogDice, byFreq }) {
  const answers = resolveRefs(bindings.answer ?? [1], byLogDice, byFreq)
  const answerSet = new Set(answers.map(r => r.lemma))

  const sliceRange = range => {
    if (!range || range.length !== 2) return []
    const [a, b] = range
    return byLogDice.slice(a - 1, b)
  }
  const near = sliceRange(bindings.near?.rankRange)
  const mid = sliceRange(bindings.mid?.rankRange)

  // Lösungen + Distraktoren zusammenführen, nach lemma deduplizieren
  const seen = new Set()
  const pool = []
  for (const r of [...answers, ...near, ...mid]) {
    if (seen.has(r.lemma)) continue
    seen.add(r.lemma)
    pool.push(r)
  }
  pool.sort((a, b) => ALPHA(a.lemma, b.lemma))
  return pool.map((r, i) => ({
    id: `c${i + 1}`,
    label: r.lemma,
    logDice: r.logDice,
    frequency: r.frequency,
    isAnswer: answerSet.has(r.lemma),
  }))
}

/** Variantenpaar aus contrastPair (F3): zwei Vergleichsoptionen. */
function buildContrastVariants({ bindings, byLogDice, byFreq }) {
  const pair = resolveRefs(bindings.contrastPair ?? [], byLogDice, byFreq)
  const answers = resolveRefs(bindings.answer ?? [1], byLogDice, byFreq)
  const answerSet = new Set(answers.map(r => r.lemma))
  return pair.map((r, i) => ({
    id: `v${i + 1}`,
    label: r.lemma,
    logDice: r.logDice,
    frequency: r.frequency,
    typical: answerSet.has(r.lemma),
  }))
}

/** Datentabelle aus tableRows (F5). `verbindung` = Partnerlemma (Anker im Caption). */
function buildTable({ bindings, byLogDice, byFreq }) {
  const rows = resolveRefs(bindings.tableRows ?? [], byLogDice, byFreq)
  // nach logDice absteigend für eine ruhige Leserichtung
  return rows.map(r => ({
    verbindung: r.lemma,
    frequency: r.frequency,
    logDice: r.logDice,
  }))
}

/**
 * Ersetzt @from:bindings-Direktiven im payload durch konkrete Strukturen.
 * Unbekannte/literale Werte bleiben unangetastet (static-Items, kuratierte
 * Tabellen etc.).
 */
function resolvePayloadDirectives(payload, bindCtx) {
  const out = { ...payload }
  if (out.candidates === '@from:bindings') out.candidates = buildCandidates(bindCtx)
  if (out.options === '@from:bindings') out.options = buildCandidates(bindCtx)
  if (out.variants === '@from:bindings.contrastPair') out.variants = buildContrastVariants(bindCtx)
  if (out.table === '@from:bindings.tableRows') out.table = buildTable(bindCtx)
  return out
}

/**
 * Löst die solution-Direktiven auf (answer-Ids, contrastPair-Antworten) –
 * relativ zu den schon aufgelösten payload-Optionen.
 */
function resolveSolution(solution, { payload, bindCtx }) {
  if (!solution) return null
  const sol = JSON.parse(JSON.stringify(solution))
  const { byLogDice, byFreq } = bindCtx

  // F1: map { aX: '@from:bindings.answer' } → korrekte candidate-Ids
  if (sol.map) {
    const answerLemmas = new Set(resolveRefs(bindCtx.bindings.answer ?? [1], byLogDice, byFreq).map(r => r.lemma))
    const candById = payload.candidates ?? []
    const answerIds = candById.filter(c => c.isAnswer || answerLemmas.has(c.label)).map(c => c.id)
    for (const k of Object.keys(sol.map)) {
      if (sol.map[k] === '@from:bindings.answer') sol.map[k] = answerIds
    }
  }
  // F3: preferred = '@from:bindings.answer' → variant-Ids, die typisch sind
  if (sol.preferred === '@from:bindings.answer') {
    sol.preferred = (payload.variants ?? []).filter(v => v.typical).map(v => v.id)
  }
  // F4: correctOptionId = '@from:bindings.answer' → erste Antwort-Option-Id
  if (sol.correctOptionId === '@from:bindings.answer') {
    sol.correctOptionId = (payload.options ?? []).find(o => o.isAnswer)?.id ?? null
  }
  // F5: answers mit contrastPair-Referenzen
  if (sol.answers) {
    for (const [qid, ans] of Object.entries(sol.answers)) {
      if (ans === '@from:bindings.contrastPair[freq]') {
        sol.answers[qid] = resolveRef('freq:1', byLogDice, byFreq)?.lemma ?? null
      } else if (ans === '@from:bindings.contrastPair[logDice]') {
        sol.answers[qid] = resolveRef('logDice:1', byLogDice, byFreq)?.lemma ?? null
      }
    }
  }
  return sol
}

/**
 * Liest die für das Item-Niveau passenden Feedbacktexte (onCorrect/merksatz)
 * und füllt deren Platzhalter. onChoice/onWrong mit {{selected}} fallen im
 * Druck weg (nicht auflösbar) – der Erwartungshorizont trägt die Lösung.
 */
function resolveFeedback(feedback, level, ctx) {
  if (!feedback) return null
  const tier = feedback.byLevel?.[level] ?? {}
  const onCorrect = fillString(tier.onCorrect, ctx)
  const merksatz = fillString(feedback.merksatz, ctx)
  return {
    onCorrect: onCorrect ?? null,
    merksatz: merksatz ?? null,
  }
}

/**
 * Hauptfunktion. Löst ein Item für den Druck auf.
 *
 * @param {object} item  Engine-Spec-Item (aus content/* oder DB-gemappt)
 * @param {object} deps
 * @param {object} deps.corpus  Adapter: { queryRelation(q)→rows[], fetchBeleg(lemma,partner)→{satz,quelle}|null }
 * @param {string} [deps.lemma] Anker-Lemma im „Eigenes Lemma"-Modus (überschreibt corpusQuery.lemma)
 * @returns {object} resolved item: { id, format, level, prompt, payload, solution, feedback, beleg, display, beleghinweis }
 */
export function resolveItem(item, { corpus, lemma } = {}) {
  // ── static: keine Korpus-Abfrage, keine Direktiven ──────────────────
  if (item.source === 'static') {
    const emptyCtx = buildPlaceholderContext({ byLogDice: [], byFreq: [], lemma: null })
    return {
      id: item.id,
      format: item.format,
      level: item.level,
      kern: item.kern ?? null,
      prompt: item.prompt,
      metasprache: item.metasprache ?? [],
      payload: item.payload,
      solution: item.solution ?? null,
      feedback: resolveFeedback(item.feedback, item.level, emptyCtx),
      display: item.display ?? { metric: 'none' },
      beleg: item.beleg ?? [],
      beleghinweis: null,
    }
  }

  // ── corpus-template: Korpus abfragen + füllen ───────────────────────
  const q = { ...item.corpusQuery }
  const ankerLemma = lemma ?? q.lemma
  q.lemma = ankerLemma
  const rows = (corpus?.queryRelation?.(q) ?? []).map(r => ({
    lemma: r.lemma,
    frequency: Number(r.frequency),
    logDice: Number(r.logDice),
  }))

  const byLogDice = rows // queryRelation liefert bereits ORDER BY logDice DESC
  const byFreq = sortedByFreq(rows)
  const ctx = buildPlaceholderContext({ byLogDice, byFreq, lemma: ankerLemma })
  const bindCtx = { bindings: item.bindings ?? {}, byLogDice, byFreq }

  // payload: erst Direktiven, dann Platzhalter
  let payload = resolvePayloadDirectives(item.payload, bindCtx)
  payload = fillDeep(payload, ctx)

  // Belegsatz (F2/F4): belegQuery → echter Satz aus belege.db
  let beleghinweis = null
  if (payload.belegQuery && corpus?.fetchBeleg) {
    const partner = payload.belegQuery.partner // bereits gefüllt (z. B. „treffen")
    const beleg = corpus.fetchBeleg(ankerLemma, partner)
    if (beleg) {
      payload.sentence = beleg.satz
      beleghinweis = beleg.quelle
    }
    delete payload.belegQuery
  }

  const solution = resolveSolution(item.solution, { payload, bindCtx })
  // Platzhalter auch im Erwartungshorizont (rubric.criteria etc.) füllen
  const solutionFilled = fillDeep(solution, ctx)

  return {
    id: item.id,
    format: item.format,
    level: item.level,
    kern: item.kern ?? null,
    prompt: fillString(item.prompt, ctx) ?? item.prompt,
    metasprache: item.metasprache ?? [],
    payload,
    solution: solutionFilled,
    feedback: resolveFeedback(item.feedback, item.level, ctx),
    display: item.display ?? { metric: 'none' },
    beleg: item.beleg ?? [],
    beleghinweis,
  }
}

/** Mehrere Items eines Niveaus auflösen (Reihenfolge bleibt erhalten). */
export function resolveItems(items, deps) {
  return items.map(it => resolveItem(it, deps))
}

// ════════════════════════════════════════════════════════════════════
// Interaktive Auflösung (AP8)
//
// Unterschied zur Druck-Auflösung: `{{selected.*}}`/`{{chosen.*}}` bleiben als
// Platzhalter ERHALTEN (der Client füllt sie aus der Lernenden-Auswahl), und
// die auswahlabhängigen Feedbacktexte (onWrong, onChoice) werden mitgeliefert.
// Korpus-Werte (top/rank/logDice/freq) werden serverseitig gefüllt.
// ════════════════════════════════════════════════════════════════════

const KEEP_PLACEHOLDER = Symbol('keep')

/** Wie placeholderValue, aber selected/chosen → KEEP (Client füllt). */
function placeholderValueInteractive(path, ctx) {
  const head = String(path).split('.')[0]
  if (head === 'selected' || head === 'chosen') return KEEP_PLACEHOLDER
  const value = placeholderValue(path, ctx)
  return value == null ? '—' : value
}

/**
 * Füllt {{…}} in einem String für den interaktiven Kontext: selected/chosen
 * bleiben literal stehen, alle anderen Platzhalter werden ersetzt (unauflösbare
 * → „—", damit nie ein Platzhalter „durchleckt").
 */
export function fillStringInteractive(str, ctx) {
  if (typeof str !== 'string') return str
  return str.replace(PLACEHOLDER_RE, (whole, expr) => {
    const val = placeholderValueInteractive(expr.trim(), ctx)
    return val === KEEP_PLACEHOLDER ? whole : String(val)
  })
}

/** Feedbacktier des Item-Niveaus inkl. onWrong/onChoice, Platzhalter gefüllt. */
function resolveFeedbackInteractive(feedback, level, ctx) {
  if (!feedback) return null
  const tier = feedback.byLevel?.[level] ?? {}
  const out = {
    onCorrect:  tier.onCorrect != null ? fillStringInteractive(tier.onCorrect, ctx) : null,
    onWrong:    tier.onWrong   != null ? fillStringInteractive(tier.onWrong, ctx)   : null,
    merksatz:   feedback.merksatz != null ? fillStringInteractive(feedback.merksatz, ctx) : null,
    tonalitaet: feedback.tonalitaet ?? null,
  }
  if (tier.onChoice && typeof tier.onChoice === 'object') {
    out.onChoice = {}
    for (const [k, v] of Object.entries(tier.onChoice)) {
      out.onChoice[k] = fillStringInteractive(v, ctx)
    }
  }
  return out
}

/**
 * Löst ein Item für die INTERAKTIVE Ausspielung auf (Selbstlerner, Sofort-
 * Feedback). Gleiche Korpus-Auflösung wie der Druck, aber selektionsabhängige
 * Feedbacktexte bleiben erhalten und `{{selected.*}}` wird NICHT entfernt.
 */
export function resolveItemInteractive(item, { corpus, lemma } = {}) {
  if (item.source === 'static') {
    const emptyCtx = buildPlaceholderContext({ byLogDice: [], byFreq: [], lemma: null })
    return {
      id: item.id,
      format: item.format,
      level: item.level,
      kern: item.kern ?? null,
      prompt: item.prompt,
      metasprache: item.metasprache ?? [],
      payload: item.payload,
      solution: item.solution ?? null,
      feedback: resolveFeedbackInteractive(item.feedback, item.level, emptyCtx),
      display: item.display ?? { metric: 'none' },
      beleg: item.beleg ?? [],
      beleghinweis: null,
    }
  }

  const q = { ...item.corpusQuery }
  const ankerLemma = lemma ?? q.lemma
  q.lemma = ankerLemma
  const rows = (corpus?.queryRelation?.(q) ?? []).map(r => ({
    lemma: r.lemma,
    frequency: Number(r.frequency),
    logDice: Number(r.logDice),
  }))

  const byLogDice = rows
  const byFreq = sortedByFreq(rows)
  const ctx = buildPlaceholderContext({ byLogDice, byFreq, lemma: ankerLemma })
  const bindCtx = { bindings: item.bindings ?? {}, byLogDice, byFreq }

  // payload: Direktiven + (nicht-selected) Platzhalter — payload trägt nie selected.
  let payload = resolvePayloadDirectives(item.payload, bindCtx)
  payload = fillDeep(payload, ctx)

  // F2-Belegsatz (belege.db) + Zielwörter für die clientseitige Markier-Prüfung.
  let beleghinweis = null
  if (payload.belegQuery) {
    const partner = payload.belegQuery.partner
    if (corpus?.fetchBeleg) {
      const beleg = corpus.fetchBeleg(ankerLemma, partner)
      if (beleg) { payload.sentence = beleg.satz; beleghinweis = beleg.quelle }
    }
    // Zielwörter (Anker + stärkster Partner): der Client matcht tolerant, weil
    // exakte Token-Indizes im flektierten Belegsatz nicht vorliegen (Spec §11.2).
    payload.targetWords = [ankerLemma, partner].filter(Boolean)
    delete payload.belegQuery
  }

  const solution = fillDeep(resolveSolution(item.solution, { payload, bindCtx }), ctx)

  return {
    id: item.id,
    format: item.format,
    level: item.level,
    kern: item.kern ?? null,
    prompt: fillStringInteractive(item.prompt, ctx),
    metasprache: item.metasprache ?? [],
    payload,
    solution,
    feedback: resolveFeedbackInteractive(item.feedback, item.level, ctx),
    display: item.display ?? { metric: 'none' },
    beleg: item.beleg ?? [],
    beleghinweis,
  }
}

/** Mehrere Items interaktiv auflösen (Reihenfolge bleibt erhalten). */
export function resolveItemsInteractive(items, deps) {
  return items.map(it => resolveItemInteractive(it, deps))
}

export default resolveItem
