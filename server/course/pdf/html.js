/**
 * server/course/pdf/html.js
 *
 * Reine HTML-Builder für die vier Kurs-Dokumente (Druck):
 *   - Arbeitsblatt          renderArbeitsblattHtml()
 *   - Lösung/Erwartungshor. renderLoesungHtml()
 *   - Unterrichtsentwurf    renderUnterrichtsentwurfHtml()  (Dreiklang + Verlauf)
 *   - Beamer-Folien         renderBeamerHtml()               (Querformat 16:9)
 *
 * KEINE Seiteneffekte: nimmt bereits AUFGELÖSTE Items (resolve.js) + Daten und
 * gibt HTML-Strings zurück. Font-/PDF-Schritt liegt getrennt in render.js.
 * Umsetzung der Didaktik-Standards §2 (Entwurfsschema) und §5 (AB-Gestaltung:
 * Worked Example zuerst, DM Sans ≥12 pt via theme.js, kein Deko, CD dezent,
 * Belege als Fußnoten, Bedeutung nie nur über Farbe → Labels tragen Text).
 */

import { documentCss, beamerCss } from './theme.js'
import { fmtLogDice, fmtFrequency } from '../resolve.js'
import { collectFootnotes, citationShort } from '../literatur.js'

const STATION_NUM = ['', '①', '②', '③', '④', '⑤']
const LEVEL_LABEL = {
  DaZ: 'DaZ / Sprachförderung',
  SekI: 'Sekundarstufe I',
  SekII: 'Sekundarstufe II',
  LK: 'Leistungskurs',
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function htmlDoc(title, css, body) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`
}

/** Fußnoten-Marker für die Beleg-Keys eines Items, gegen die globale Map. */
function sups(keys, fnMap) {
  const ns = (keys ?? []).map(b => fnMap.get(b.key)).filter(Boolean).sort((a, b) => a - b)
  if (!ns.length) return ''
  return `<span class="sup">${ns.join(',')}</span>`
}

function showLogDice(display) { return display?.metric === 'logDice' || display?.metric === 'both' }
function showFreq(display) { return display?.metric === 'frequency' || display?.metric === 'both' }

// ── Aufgaben-Renderer (Worksheet-Sicht, blanko) ──────────────────────

function renderF1(it) {
  const anchors = it.payload.anchors ?? []
  const candidates = it.payload.candidates ?? []
  return `
    <div class="match">
      <div>
        <div class="match-col-label">Wort</div>
        ${anchors.map(a => `<div class="match-row">${esc(a.label)}</div>`).join('')}
      </div>
      <div>
        <div class="match-col-label">Partner</div>
        <div class="candidates">
          ${candidates.map(c => `<span class="chip">${esc(c.label)}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="justify-hint">Verbinde jedes Wort mit seinem typischen Partner (Linie ziehen).</div>`
}

function renderF2(it) {
  const q = it.beleghinweis ? `<div class="beleg-quelle">Quelle: ${esc(it.beleghinweis)}</div>` : ''
  return `
    <div class="beleg-satz">${esc(it.payload.sentence ?? '')}</div>${q}
    <div class="justify-hint">Markiere im Satz die zusammengehörende Wortverbindung.</div>`
}

// Funktion zuweisen (S/P/O, Kopf/Dependent): Satz + Beschriftungsauftrag.
function renderLabel(it) {
  const q = it.beleghinweis ? `<div class="beleg-quelle">Quelle: ${esc(it.beleghinweis)}</div>` : ''
  const labels = (it.payload.labels ?? []).map(esc).join(' / ')
  return `
    <div class="beleg-satz">${esc(it.payload.sentence ?? '')}</div>${q}
    <div class="justify-hint">Weise jedem Satzteil seine Funktion zu (${labels}) und schreibe sie darunter.</div>`
}

// Verschiebeprobe am topologischen Feld (Feldermodell): Druckform zeigt den Satz
// als Rahmen + die verschiebbaren Satzglieder als Chips.
function renderVerschiebe(it) {
  const chunks = it.payload?.chunks ?? []
  const verb = it.payload?.verb?.text ?? ''
  const sentence = `___ ${verb} ${chunks.map(c => c.text).join(' ')}`.trim()
  const chips = chunks.map(c => `<span class="chip">${esc(c.text)}</span>`).join('')
  return `<div class="frame">${esc(sentence)}</div>
    <div class="candidates">${chips}</div>
    <div class="justify-hint">Verschiebeprobe: Setze nacheinander je ein Satzglied ins Vorfeld (vor das Verb). Welche Wortgruppen lassen sich als geschlossene Einheit verschieben?</div>`
}

// KWIC/Konkordanz: echte Belegzeilen + Optionen (das wiederkehrende Wort finden).
function renderKwic(it) {
  const lines = (it.payload.lines ?? []).map(l =>
    `<div class="beleg-satz">${esc(l.satz)}${l.quelle ? ` <span class="beleg-quelle">(${esc(l.quelle)})</span>` : ''}</div>`).join('')
  const opts = (it.payload.options ?? []).map(o => `<span class="chip">${esc(o.label)}</span>`).join('')
  return `${lines}<div class="candidates">${opts}</div>` +
    `<div class="justify-hint">Welches Wort steht in (fast) allen Belegen? Kreise es ein.</div>`
}

// Automatische Annotation: Satz mit Maschinen-Etiketten; das falsche finden.
function renderAnnotate(it) {
  const toks = (it.payload.annotations ?? []).map(a =>
    `${esc(a.text)} <span class="metric">(${esc(a.tag)})</span>`).join(' · ')
  return `<div class="beleg-satz">${toks}</div>` +
    `<div class="justify-hint">Ein Etikett ist falsch. Kreise das Wort mit dem Maschinenfehler ein.</div>`
}

// Erkennt Aufgaben, deren Renderer sich aus der Payload-Form (nicht dem Format-
// Etikett) ergibt — analog zum Frontend-Dispatcher (TaskPlayer).
function isLabelTask(it) {
  const mt = it.payload?.markTask
  return mt === 'S-P-O' || mt === 'kopf-dependent' || mt === 'felder' || mt === 'wortart'
}
function isKwicTask(it) { return Array.isArray(it.payload?.lines) }
function isAnnotateTask(it) { return Array.isArray(it.payload?.annotations) }
function isDataTask(it) {
  const p = it.payload ?? {}
  return Array.isArray(p.table) && Array.isArray(p.questions)
}
function isVerschiebeTask(it) {
  const p = it.payload ?? {}
  return Array.isArray(p.chunks) && !!p.verb
}

function variantCard(v, display) {
  const parts = []
  if (showFreq(display) && v.frequency != null) parts.push(`Frequenz ${fmtFrequency(v.frequency)}`)
  if (showLogDice(display) && v.logDice != null) parts.push(`logDice ${fmtLogDice(v.logDice)}`)
  const metric = parts.length ? `<div class="metric">${parts.join(' · ')}</div>` : ''
  return `<div class="variant"><div class="v-word">${esc(v.label)}</div>${metric}</div>`
}

function justifyBlock(requireJustification) {
  if (!requireJustification) return ''
  return `<div class="justify-line"></div><div class="justify-line"></div>` +
    `<div class="justify-hint">Begründe deine Wahl in einem Satz.</div>`
}

function renderF3(it) {
  const frame = it.payload.frame ? `<div class="frame">${esc(it.payload.frame)}</div>` : ''
  const variants = (it.payload.variants ?? []).map(v => variantCard(v, it.display)).join('')
  return `${frame}<div class="variants">${variants}</div>${justifyBlock(it.payload.requireJustification)}`
}

function renderF4(it) {
  const sentence = it.payload.sentence ? `<div class="frame">${esc(it.payload.sentence)}</div>` : ''
  const options = (it.payload.options ?? []).map(o => variantCard(o, it.display)).join('')
  return `${sentence}<div class="variants">${options}</div>${justifyBlock(it.payload.requireJustification)}`
}

function renderF5(it, ankerLemma) {
  const cols = it.payload.columns ?? ['verbindung', 'frequency', 'logDice']
  const showLd = showLogDice(it.display)
  const showF = showFreq(it.display)
  const head = ['<th>Verbindung</th>']
  if (cols.includes('frequency') && showF) head.push('<th class="num">Frequenz</th>')
  if (cols.includes('logDice') && showLd) head.push('<th class="num">logDice</th>')
  const rows = (it.payload.table ?? []).map(r => {
    const tds = [`<td>${esc(r.verbindung)}</td>`]
    if (cols.includes('frequency') && showF) tds.push(`<td class="num">${fmtFrequency(r.frequency)}</td>`)
    if (cols.includes('logDice') && showLd) tds.push(`<td class="num">${fmtLogDice(r.logDice)}</td>`)
    return `<tr>${tds.join('')}</tr>`
  }).join('')
  const caption = ankerLemma ? `<caption>Verbindungen zu „${esc(ankerLemma)}“</caption>` : ''
  const questions = (it.payload.questions ?? []).map((q, i) =>
    `<div class="question"><span class="q-no">${i + 1})</span> ${esc(q.text)}` +
    (q.kind === 'explain' ? `<div class="justify-line"></div><div class="justify-line"></div>` : '') +
    `</div>`,
  ).join('')
  return `<table class="data">${caption}<thead><tr>${head.join('')}</tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="questions">${questions}</div>`
}

function renderTaskBody(it, ankerLemma) {
  // Payload-Form hat Vorrang vor dem Format-Etikett (sonst rendern z. B. die als
  // F2 geführten Datenblick-/Label-Aufgaben leer).
  if (isAnnotateTask(it)) return renderAnnotate(it)
  if (isKwicTask(it)) return renderKwic(it)
  if (isLabelTask(it)) return renderLabel(it)
  if (isVerschiebeTask(it)) return renderVerschiebe(it)
  if (isDataTask(it)) return renderF5(it, ankerLemma)
  switch (it.format) {
    case 'F1': return renderF1(it)
    case 'F2': return renderF2(it)
    case 'F3': return renderF3(it)
    case 'F4': return renderF4(it)
    case 'F5': return renderF5(it, ankerLemma)
    default:   return `<div class="justify-line"></div>`
  }
}

// ── Worked Example (solved, §5: vor der ersten Übung) ─────────────────

function kwicSolutionText(it) {
  const byId = Object.fromEntries((it.payload.options ?? []).map(o => [o.id, o.label]))
  return `„${esc(byId[it.solution?.correctOptionId] ?? '—')}“`
}
function annotateSolutionText(it) {
  const wrong = (it.payload.annotations ?? []).find(a => a.wrong)
  if (!wrong) return ''
  return `„${esc(wrong.text)}“ — Maschine: ${esc(wrong.tag)}, richtig: ${esc(wrong.correctTag ?? '—')}`
}

function workedSolutionText(it) {
  // Modelliert die Lösung des ersten Items als nachvollziehbares Beispiel.
  if (isAnnotateTask(it)) return annotateSolutionText(it)
  if (isKwicTask(it)) return kwicSolutionText(it)
  if (isLabelTask(it)) {
    const parts = (it.solution?.spans ?? []).filter(s => s.text || s.label)
      .map(s => s.text ? `„${esc(s.text)}“ (${esc(s.label)})` : `(${esc(s.label)})`)
    return parts.length ? parts.join(' · ') : (it.feedback?.onCorrect ? esc(it.feedback.onCorrect) : '')
  }
  if (isVerschiebeTask(it)) {
    const byId = Object.fromEntries((it.payload?.chunks ?? []).map(c => [c.id, c.text]))
    return (it.solution?.validVorfeld ?? []).map(id => `„${esc(byId[id] ?? id)}“`).join(', ')
  }
  if (isDataTask(it)) {
    const a = it.solution?.answers ?? {}
    return Object.values(a).filter(v => typeof v === 'string').map(v => esc(v)).join(' · ')
  }
  switch (it.format) {
    case 'F1': {
      const byId = Object.fromEntries((it.payload.candidates ?? []).map(c => [c.id, c.label]))
      const anchById = Object.fromEntries((it.payload.anchors ?? []).map(a => [a.id, a.label]))
      const pairs = Object.entries(it.solution?.map ?? {})
        .map(([aid, cids]) => `„${esc(anchById[aid] ?? aid)} ${(Array.isArray(cids) ? cids : [cids]).map(c => esc(byId[c] ?? c)).join('/')}“`)
      return pairs.join(' · ')
    }
    case 'F3': {
      const byId = Object.fromEntries((it.payload.variants ?? []).map(v => [v.id, v.label]))
      const pref = (it.solution?.preferred ?? []).map(id => `„${esc(byId[id] ?? id)}“`)
      return pref.join(', ')
    }
    case 'F4': {
      const byId = Object.fromEntries((it.payload.options ?? []).map(o => [o.id, o.label]))
      return `„${esc(byId[it.solution?.correctOptionId] ?? '—')}“`
    }
    case 'F5': {
      const a = it.solution?.answers ?? {}
      return Object.values(a).filter(v => typeof v === 'string').map(v => esc(v)).join(' · ')
    }
    default:
      return it.feedback?.onCorrect ? esc(it.feedback.onCorrect) : ''
  }
}

function renderWorkedExample(it, ankerLemma) {
  const solution = workedSolutionText(it)
  const note = it.feedback?.onCorrect ?? it.feedback?.merksatz ?? ''
  return `
    <div class="worked">
      <div class="worked-label">Beispiel — so geht's</div>
      <div class="task-prompt">${esc(it.prompt)}</div>
      <div class="task-body">${renderTaskBody({ ...it, payload: { ...it.payload, requireJustification: false } }, ankerLemma)}</div>
      ${solution ? `<div class="worked-note"><span class="worked-solution">Lösung:</span> ${solution}</div>` : ''}
      ${note ? `<div class="worked-note">${esc(note)}</div>` : ''}
    </div>`
}

// ── Kopf / Fußnoten ──────────────────────────────────────────────────

function docHead(station, level, kind) {
  const st = STATION_NUM[station.orderNo] ?? ''
  const ipa = station.ipa ? ` <span class="doc-ipa">[${esc(station.ipa)}]</span>` : ''
  return `
    <div class="doc-head">
      <div class="doc-kicker">Signifikation · Kurs · Station ${st} · ${esc(kind)}</div>
      <div class="doc-title">${esc(station.title)}${ipa}</div>
      <div class="doc-sub">${esc(LEVEL_LABEL[level] ?? level)}</div>
      <hr class="gold-rule">
    </div>`
}

function footnotesHtml(footnotes) {
  if (!footnotes.length) return ''
  const items = footnotes.map(f => `<div class="fn"><span class="fn-n">${f.n}</span> ${esc(f.voll)}</div>`).join('')
  return `<div class="footnotes">${items}</div>`
}

function colophon() {
  return `<div class="colophon">Signifikation · korpusbasiertes Kursmaterial. ` +
    `Korpusdaten (Häufigkeit/Assoziationsstärke, Belegsätze) aus eigener Pipeline; Belegsätze CC-BY-SA. ` +
    `Erzeugt aus signifikation.de.</div>`
}

// ── 1) Arbeitsblatt ──────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.station   { orderNo, title, ipa }
 * @param {string} p.level
 * @param {Array}  p.items     aufgelöste Items (resolve.js)
 * @param {string} [p.ankerLemma]
 * @returns {string} HTML
 */
export function renderArbeitsblattHtml({ station, level, items, ankerLemma } = {}) {
  const footnotes = collectFootnotes(items)
  const fnMap = new Map(footnotes.map(f => [f.key, f.n]))
  const [first, ...rest] = items
  const exercises = rest.length ? rest : items // bei nur 1 Item: dieses auch als Übung

  const metas = [...new Set(items.flatMap(i => i.metasprache ?? []))]
  const metaLine = metas.length
    ? `<div class="doc-meta meta-list">Fachbegriffe: ${metas.map(esc).join(' · ')}</div>` : ''

  const worked = first ? renderWorkedExample(first, ankerLemma) : ''

  const tasks = exercises.map((it, i) => `
    <div class="task">
      <div class="task-head">
        <span class="task-no">${i + 1}</span>
        <span class="task-prompt">${esc(it.prompt)}${sups(it.beleg, fnMap)}</span>
        <span class="task-format">${esc(it.format)}</span>
      </div>
      <div class="task-body">${renderTaskBody(it, ankerLemma)}</div>
    </div>`).join('')

  const body = `
    ${docHead(station, level, 'Arbeitsblatt')}
    <div class="doc-meta">
      <span>Name: <b>&nbsp;</b>________________________</span>
      <span>Klasse: ________</span>
      <span>Datum: ________</span>
    </div>
    ${metaLine}
    ${worked}
    ${tasks}
    ${footnotesHtml(footnotes)}
    ${colophon()}`
  return htmlDoc(`Arbeitsblatt – ${station.title} (${level})`, documentCss(), body)
}

// ── 2) Lösung / Erwartungshorizont ───────────────────────────────────

function solutionDetail(it) {
  const out = []
  if (isAnnotateTask(it)) {
    const t = annotateSolutionText(it)
    if (t) out.push(t)
  } else if (isKwicTask(it)) {
    out.push(kwicSolutionText(it))
  } else if (isLabelTask(it)) {
    const parts = (it.solution?.spans ?? []).filter(s => s.text || s.label)
      .map(s => s.text ? `„${esc(s.text)}“ (${esc(s.label)})` : `(${esc(s.label)})`)
    if (parts.length) out.push(parts.join(' · '))
    else if (it.feedback?.onCorrect) out.push(esc(it.feedback.onCorrect))
  } else if (isVerschiebeTask(it)) {
    const byId = Object.fromEntries((it.payload?.chunks ?? []).map(c => [c.id, c.text]))
    const valid = (it.solution?.validVorfeld ?? []).map(id => `„${esc(byId[id] ?? id)}“`)
    if (valid.length) out.push(`verschiebbar ins Vorfeld: ${valid.join(', ')}`)
  } else if (isDataTask(it) && it.solution?.answers) {
    for (const [qid, ans] of Object.entries(it.solution.answers)) {
      if (typeof ans === 'string') out.push(`${esc(qid)}: „${esc(ans)}“`)
    }
  } else if (it.format === 'F1' && it.solution?.map) {
    const byId = Object.fromEntries((it.payload.candidates ?? []).map(c => [c.id, c.label]))
    const anchById = Object.fromEntries((it.payload.anchors ?? []).map(a => [a.id, a.label]))
    const pairs = Object.entries(it.solution.map).map(([aid, cids]) =>
      `„${esc(anchById[aid] ?? aid)} ${(Array.isArray(cids) ? cids : [cids]).map(c => esc(byId[c] ?? c)).join('/')}“`)
    out.push(pairs.join(' · '))
  } else if (it.format === 'F3' && it.solution?.preferred) {
    const byId = Object.fromEntries((it.payload.variants ?? []).map(v => [v.id, v.label]))
    out.push((it.solution.preferred).map(id => `„${esc(byId[id] ?? id)}“`).join(', '))
  } else if (it.format === 'F4' && it.solution?.correctOptionId) {
    const byId = Object.fromEntries((it.payload.options ?? []).map(o => [o.id, o.label]))
    out.push(`„${esc(byId[it.solution.correctOptionId] ?? '—')}“`)
  } else if (it.format === 'F5' && it.solution?.answers) {
    for (const [qid, ans] of Object.entries(it.solution.answers)) {
      if (typeof ans === 'string') out.push(`${esc(qid)}: „${esc(ans)}“`)
    }
  } else if (it.feedback?.onCorrect) {
    out.push(esc(it.feedback.onCorrect))
  }
  return out.filter(Boolean).join(' · ')
}

function rubricHtml(it) {
  // Erwartungshorizont aus allen rubric-Vorkommen (solution.rubric + answers[*].rubric).
  const rubrics = []
  if (it.solution?.rubric) rubrics.push(it.solution.rubric)
  for (const ans of Object.values(it.solution?.answers ?? {})) {
    if (ans && typeof ans === 'object' && ans.rubric) rubrics.push(ans.rubric)
  }
  if (!rubrics.length) return ''
  const blocks = rubrics.map(r => {
    const crit = (r.criteria ?? []).map(c => `<li>${esc(c)}</li>`).join('')
    const accepts = (r.accepts ?? []).length
      ? `<div class="minhits">Auch akzeptabel: ${r.accepts.map(esc).join('; ')}</div>` : ''
    const minhits = r.minHits ? `<div class="minhits">erfüllt ab ${r.minHits} Kriterium/Kriterien</div>` : ''
    return `<div class="rubric"><ul>${crit}</ul>${accepts}${minhits}</div>`
  })
  return blocks.join('')
}

export function renderLoesungHtml({ station, level, items, ankerLemma } = {}) {
  const footnotes = collectFootnotes(items)
  const sols = items.map((it, i) => {
    const detail = solutionDetail(it)
    const merksatz = it.feedback?.merksatz ? `<div class="sol-answer"><span class="label">Merksatz</span> ${esc(it.feedback.merksatz)}</div>` : ''
    return `
      <div class="sol">
        <div class="sol-head"><span class="task-no">${i + 1}</span><span class="task-prompt">${esc(it.prompt)}</span><span class="task-format">${esc(it.format)}</span></div>
        ${detail ? `<div class="sol-answer"><span class="label">Lösung</span> <span class="value">${detail}</span></div>` : ''}
        ${rubricHtml(it)}
        ${merksatz}
      </div>`
  }).join('')

  const body = `
    ${docHead(station, level, 'Lösung & Erwartungshorizont')}
    ${ankerLemma ? `<div class="doc-meta">Anker-Lemma: <b>${esc(ankerLemma)}</b></div>` : ''}
    ${sols}
    ${footnotesHtml(footnotes)}
    ${colophon()}`
  return htmlDoc(`Lösung – ${station.title} (${level})`, documentCss(), body)
}

// ── 3) Unterrichtsentwurf (Dreiklang + Verlauf, §2) ──────────────────

/**
 * @param {object} p
 * @param {object} p.entwurf  Stundenentwurf-Daten (lesson/station-*.js)
 * @returns {string} HTML
 */
export function renderUnterrichtsentwurfHtml({ entwurf } = {}) {
  const e = entwurf
  const footnotes = collectFootnotes((e.belege ?? []).map(key => ({ beleg: [{ key }] })))

  const klp = (list) => `<ul class="klp">${(list ?? []).map(k =>
    `<li class="${k.wesentlich ? 'bold' : ''}">${esc(k.text)}${k.quelle ? ` <span class="sup">${esc(citationShort(k.quelle))}</span>` : ''}</li>`).join('')}</ul>`

  const dreiklang = `
    <table class="dreiklang">
      <tr><th>Gegenstand</th><td>${esc(e.dreiklang.gegenstand)}</td></tr>
      <tr><th>Thema der Stunde</th><td>${esc(e.dreiklang.thema)}</td></tr>
      <tr><th>Schwerpunktlernziel</th><td>${esc(e.dreiklang.splz)}</td></tr>
      ${e.dreiklang.wwlz ? `<tr><th>weiteres wichtiges Lernziel</th><td>${esc(e.dreiklang.wwlz)}</td></tr>` : ''}
      <tr><th>Kompetenzbezug (KLP)</th><td>${esc(e.dreiklang.kompetenzbezug)}</td></tr>
    </table>`

  const phaseRows = e.verlauf.map(p => {
    const head = `<tr class="phase"><td colspan="4">${esc(p.phase)}${p.anteil ? ` · ${esc(p.anteil)}` : ''}</td></tr>`
    const steps = (p.schritte ?? []).map(s => `
      <tr>
        <td>${esc(s.schritt)}</td>
        <td>${esc(s.kommentar)}</td>
        <td>${esc(s.interaktion)}</td>
        <td>${esc(s.medien)}</td>
      </tr>`).join('')
    return head + steps
  }).join('')

  const verlauf = `
    <table class="verlauf">
      <thead><tr><th>Arbeitsschritt</th><th>Didaktischer Kurzkommentar</th><th>Interaktion</th><th>Medien</th></tr></thead>
      <tbody>${phaseRows}</tbody>
    </table>`

  const anhang = (e.anhang ?? []).length
    ? `<div class="section"><h2>III · Anhang</h2><ul class="klp">${e.anhang.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`
    : ''

  const station = { orderNo: e.stationNo, title: e.stundenthema, ipa: null }
  const body = `
    ${docHead(station, e.niveau ?? 'SekI', 'Unterrichtsentwurf')}
    <div class="doc-meta">
      <span>Unterrichtsvorhaben: <b>${esc(e.uv)}</b></span>
      <span>Sequenz: ${esc(e.sequenz)}</span>
      <span>Phasenmodell: ${esc(e.phasenmodell)}</span>
    </div>

    <div class="section">
      <h2>I · Längerfristige Zusammenhänge</h2>
      <h3>Intentionen/Ziele des UV (kompetenzorientiert, KLP)</h3>
      ${klp(e.uvZiele)}
      ${e.begruendung ? `<h3>Begründung der längerfristigen Zusammenhänge</h3><p>${esc(e.begruendung)}</p>` : ''}
    </div>

    <div class="section">
      <h2>II · Planung der Stunde</h2>
      <h3>Didaktischer Dreiklang</h3>
      ${dreiklang}
      ${e.begruendungStunde ? `<h3>Begründung didaktisch-methodischer Entscheidungen</h3><p>${esc(e.begruendungStunde)}</p>` : ''}
      <h3>Stundenverlauf (${esc(e.phasenmodell)})</h3>
      ${verlauf}
    </div>

    ${anhang}
    ${footnotesHtml(footnotes)}
    ${colophon()}`
  return htmlDoc(`Unterrichtsentwurf – ${e.stundenthema}`, documentCss(), body)
}

// ── 4) Beamer-Folien (Querformat 16:9) ───────────────────────────────

function renderSlide(slide, n, total) {
  const pageno = `<div class="pageno">${n} / ${total}</div>`
  const src = slide.quelle ? `<div class="src">${esc(slide.quelle)}</div>` : ''
  if (slide.kind === 'title') {
    return `<section class="slide">
      <div class="kicker">${esc(slide.kicker ?? 'Signifikation · Kurs')}</div>
      <h1>${esc(slide.title)}</h1>
      <hr class="accent-rule">
      ${slide.lead ? `<div class="lead">${esc(slide.lead)}</div>` : ''}
      ${pageno}${src}</section>`
  }
  if (slide.kind === 'bullets') {
    return `<section class="slide">
      ${slide.kicker ? `<div class="kicker">${esc(slide.kicker)}</div>` : ''}
      <h1>${esc(slide.title)}</h1>
      <ul>${(slide.bullets ?? []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      ${pageno}${src}</section>`
  }
  if (slide.kind === 'merksatz') {
    return `<section class="slide">
      <div class="kicker">Merksatz</div>
      <h1>${esc(slide.title)}</h1>
      <hr class="accent-rule">${pageno}${src}</section>`
  }
  if (slide.kind === 'data') {
    const cols = slide.columns ?? ['verbindung', 'frequency', 'logDice']
    const head = ['<th>Verbindung</th>']
    if (cols.includes('frequency')) head.push('<th class="num">Frequenz</th>')
    if (cols.includes('logDice')) head.push('<th class="num">logDice</th>')
    const rows = (slide.table ?? []).map(r => {
      const tds = [`<td>${esc(r.verbindung)}</td>`]
      if (cols.includes('frequency')) tds.push(`<td class="num">${fmtFrequency(r.frequency)}</td>`)
      if (cols.includes('logDice')) tds.push(`<td class="num">${fmtLogDice(r.logDice)}</td>`)
      return `<tr>${tds.join('')}</tr>`
    }).join('')
    return `<section class="slide">
      <div class="kicker">${esc(slide.kicker ?? 'Datenblick')}</div>
      <h1>${esc(slide.title)}</h1>
      <table class="bdata"><thead><tr>${head.join('')}</tr></thead><tbody>${rows}</tbody></table>
      ${pageno}${src}</section>`
  }
  // 'lead' / default
  return `<section class="slide">
    ${slide.kicker ? `<div class="kicker">${esc(slide.kicker)}</div>` : ''}
    ${slide.title ? `<h1>${esc(slide.title)}</h1>` : ''}
    ${slide.lead ? `<div class="lead">${esc(slide.lead)}</div>` : ''}
    ${pageno}${src}</section>`
}

/**
 * @param {object} p
 * @param {Array}  p.slides  Slide-Specs {kind,title,...}
 * @returns {string} HTML
 */
export function renderBeamerHtml({ slides } = {}) {
  const total = slides.length
  const body = slides.map((s, i) => renderSlide(s, i + 1, total)).join('')
  return htmlDoc('Beamer-Folien', beamerCss(), body)
}

export default {
  renderArbeitsblattHtml,
  renderLoesungHtml,
  renderUnterrichtsentwurfHtml,
  renderBeamerHtml,
}
