/**
 * server/course/worksheet/render.js
 *
 * Renderer für die neuen Kurs-Arbeitsblätter: nimmt das Content-Modell
 * (worksheet/station-N.js) + eine Niveaustufe und baut das Druck-HTML.
 * KEINE Seiteneffekte außer dem Lesen des Beleg-Registers (literatur.js).
 *
 * Inline-Markup in Texten (bewusst minimal, damit Content autorenfreundlich bleibt):
 *   **fett**  → Fachbegriff (.term)      *kursiv* → Beispiel/Betonung (.em)
 *   [^n]      → Fußnoten-Marker (.sup)    Rest wird HTML-escaped
 *
 * Fußnoten kommen aus `level.belege` (Keys → literatur.js `voll`), in Reihenfolge
 * durchnummeriert; die [^n]-Marker im Text referenzieren diese Nummern.
 */

import { LITERATUR } from '../literatur.js'
import { worksheetCss } from './theme.js'

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Minimal-Markup → HTML (auf bereits escaptem Text). */
export function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<span class="term">$1</span>')
    .replace(/\*(.+?)\*/g, '<span class="em">$1</span>')
    .replace(/\[\^(\d+)\]/g, '<span class="sup">$1</span>')
    .replace(/\n/g, '<br>')
}

const STATION_GLYPHS = ['', '①', '②', '③', '④', '⑤']

// ── Block-Renderer ───────────────────────────────────────────────────

function renderWissen(b) {
  const paras = (b.paras ?? []).map(p => `<p>${inline(p)}</p>`).join('')
  const fwd = b.forward ? `<div class="fwd">${inline(b.forward)}</div>` : ''
  return `<section class="wissen"><div class="block-label"><span class="ico">◆</span>${esc(b.label)}</div>${paras}${fwd}</section>`
}

function renderMerke(b) {
  return `<div class="merke"><span class="tag">Merke</span><span class="txt">${inline(b.text)}</span></div>`
}

function renderSkala(b) {
  const cls = b.variant === 'faerbung' ? 'skala-wrap faerbung' : 'skala-wrap'
  const cells = (b.stops ?? []).map(s =>
    `<div class="cell"><div class="stufe">${esc(s.stufe)}</div><div class="bsp">${esc(s.bsp)}</div><div class="erkl">${inline(s.erkl)}</div></div>`).join('')
  // Achse optional: mit Achse = Skala (frei→fest, negativ→positiv); ohne = reiner
  // 3-Spalten-Baukasten (z. B. Wortarten: Nomen/Verb/Adjektiv).
  const axis = b.axis
    ? `<div class="skala-axis"><span>${esc(b.axis[0])}</span><span class="bar"></span><span>${esc(b.axis[1])}</span></div>`
    : ''
  return `<section class="${cls}"><div class="block-label"><span class="ico">◆</span>${esc(b.label)}</div>` +
    `<div class="skala">${cells}</div>${axis}</section>`
}

// Topologisches Feldermodell: N Spalten (Feld-Label als Kopf, Satzteil als Zelle).
function renderFelder(b) {
  const heads = (b.fields ?? []).map(c => `<th>${esc(c.label)}</th>`).join('')
  const cells = (b.fields ?? []).map(c => `<td>${esc(c.text)}</td>`).join('')
  const note = b.note ? `<div class="felder-note">${inline(b.note)}</div>` : ''
  return `<section class="felder-wrap"><div class="block-label"><span class="ico">◆</span>${esc(b.label)}</div>` +
    `<table class="felder"><thead><tr>${heads}</tr></thead><tbody><tr>${cells}</tr></tbody></table>${note}</section>`
}

function renderKontrast(b) {
  const [okHead, noHead] = b.head ?? ['richtig ✓', 'falsch ✗']
  const rows = (b.rows ?? []).map(row => {
    const okNote = row.okNote ? ` <span class="note">${inline(row.okNote)}</span>` : ''
    const noNote = row.noNote ? ` <span class="note">${inline(row.noNote)}</span>` : ''
    return `<tr><td><span class="mark ok">✓</span><span class="verb">${esc(row.ok)}</span>${okNote}</td>` +
      `<td class="no"><span class="mark no">✗</span><span class="verb">${esc(row.no)}</span>${noNote}</td></tr>`
  }).join('')
  return `<section class="kontrast-wrap"><div class="block-label"><span class="ico">◆</span>${esc(b.label)}</div>` +
    `<table class="kontrast"><thead><tr><th>${esc(okHead)}</th><th>${esc(noHead)}</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function renderDatablick(b) {
  const rows = (b.rows ?? []).map(r =>
    `<tr${r.mark ? ' class="mark"' : ''}><td class="verb">${esc(r.verb)}</td>` +
    `<td class="num">${esc(r.frequency)}</td><td class="num">${esc(r.logDice)}</td></tr>`).join('')
  const caption = b.caption ? `<caption>${esc(b.caption)}</caption>` : ''
  const note = b.note ? `<div class="data-note">${inline(b.note)}</div>` : ''
  return `<section class="datablick"><div class="block-label"><span class="ico">◆</span>${esc(b.label)}</div>` +
    `<table class="data">${caption}<thead><tr><th>Verbindung</th><th class="num">Frequenz</th><th class="num">logDice</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>${note}</section>`
}

function renderTask(item, i) {
  const answers = Array.from({ length: item.answerLines ?? 0 }, () => '<div class="answer"></div>').join('')
  const fields = (item.fields ?? []).map(f =>
    `<div class="field">${esc(f.label)} <span class="fill" style="min-width:${f.width ?? 120}pt"></span></div>`).join('')
  const chips = (item.chips ?? []).length
    ? `<div class="chips">${item.chips.map(c => `<span class="chip${item.chipsSerif ? ' serif' : ''}">${esc(c)}</span>`).join('')}</div>` : ''
  const extra = item.extraHtml ?? '' // seltener Sonderfall (z. B. Sprech-Zeile)
  return `<div class="task"><div class="task-no">${i + 1}</div><div class="task-body">` +
    `<div class="prompt"><span class="op">${esc(item.op)}</span>${inline(item.prompt)}</div>` +
    `${chips}${fields}${extra}${answers}</div></div>`
}

function renderAufgaben(b) {
  const tasks = (b.items ?? []).map((it, i) => renderTask(it, i)).join('')
  return `<section class="tasks"><div class="tasks-head">${esc(b.head ?? 'Aufgaben')}</div>${tasks}</section>`
}

function renderTransfer(b) {
  return `<div class="transfer"><div class="block-label"><span class="ico">→</span>${esc(b.label ?? 'Transfer · in der App')}</div>` +
    `<div>${inline(b.text)}</div></div>`
}

const BLOCK = {
  wissen: renderWissen, merke: renderMerke, skala: renderSkala, felder: renderFelder,
  kontrast: renderKontrast, datablick: renderDatablick, aufgaben: renderAufgaben, transfer: renderTransfer,
}

function renderBlock(b) {
  const fn = BLOCK[b.type]
  return fn ? fn(b) : ''
}

// ── Kopf / Fußnoten / Dokument ───────────────────────────────────────

function renderHead(station, level, kind = 'Arbeitsblatt') {
  const glyph = STATION_GLYPHS[station.stationNo] ?? ''
  const ipa = level.ipa ? ` <span class="doc-ipa">[${esc(level.ipa)}]</span>` : ''
  return `<header><div class="doc-kicker">Signifikation · Kurs · Station ${glyph} · ${esc(kind)}</div>` +
    `<div class="doc-title">${esc(level.title ?? station.title)}${ipa}</div>` +
    `<div class="doc-sub">${esc(level.sub ?? '')}</div><hr class="gold-rule">` +
    `<div class="meta"><span>Name: <span class="line"></span></span>` +
    `<span>Klasse: <span class="line sm"></span></span><span>Datum: <span class="line sm"></span></span></div></header>`
}

function renderFootnotes(belege) {
  if (!(belege ?? []).length) return ''
  const items = belege.map((key, i) => {
    const voll = LITERATUR[key]?.voll ?? key
    return `<div class="fn"><span class="n">${i + 1}</span>${esc(voll)}</div>`
  }).join('')
  return `<div class="footnotes">${items}</div>`
}

function colophon() {
  return `<div class="colophon">Signifikation · korpusbasiertes Kursmaterial. ` +
    `Korpusdaten (Häufigkeit/Assoziationsstärke, Belegsätze) aus eigener Pipeline; Belegsätze CC-BY-SA. ` +
    `Erzeugt aus signifikation.de.</div>`
}

const WEBFONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
  `<link href="https://fonts.googleapis.com/css2?family=Gentium+Plus:ital,wght@0,400;0,700;1,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">`

/**
 * @param {object} station  worksheet/station-N.js default export
 * @param {string} levelKey 'DaZ' | 'SekI' | 'SekII' | 'LK'
 * @param {object} [opts]
 * @param {boolean} [opts.web]           Web-Vorschau: Google-Fonts + .sheet-Rahmen
 * @param {string}  [opts.fontFaceCss]   @font-face (Base64) fürs PDF
 * @returns {string} vollständiges HTML-Dokument
 */
function docShell(titleText, bodyInner, { web = false, fontFaceCss = '' } = {}) {
  const inner = web ? `<div class="sheet">${bodyInner}</div>` : bodyInner
  const head = `<meta charset="utf-8"><title>${esc(titleText)}</title>` +
    (web ? WEBFONTS : '') + `<style>${worksheetCss(fontFaceCss)}</style>`
  const bg = web ? ` style="background:#e7e2d8;padding:24px"` : ''
  return `<!DOCTYPE html><html lang="de"><head>${head}</head><body${bg}>${inner}</body></html>`
}

function requireLevel(station, levelKey) {
  const level = station.levels?.[levelKey]
  if (!level) throw new Error(`worksheet: Niveau ${levelKey} für Station ${station.stationNo} fehlt`)
  return level
}

/** Arbeitsblatt (blanko). */
export function renderWorksheetHtml(station, levelKey, opts = {}) {
  const level = requireLevel(station, levelKey)
  const body = renderHead(station, level, 'Arbeitsblatt') +
    (level.blocks ?? []).map(renderBlock).join('') +
    renderFootnotes(level.belege) + colophon()
  return docShell(`Arbeitsblatt – ${level.title ?? station.title} (${levelKey})`, body, opts)
}

/** Lösung & Erwartungshorizont: Aufgaben-Prompts + erwartete Antwort/Kriterien. */
export function renderErwartungshorizontHtml(station, levelKey, opts = {}) {
  const level = requireLevel(station, levelKey)
  const sols = (level.blocks ?? []).filter(b => b.type === 'aufgaben').map(b =>
    (b.items ?? []).map((it, i) =>
      `<div class="sol"><div class="sol-head"><span class="task-no">${i + 1}</span>` +
      `<span class="prompt"><span class="op">${esc(it.op)}</span>${inline(it.prompt)}</span></div>` +
      (it.erwartung ? `<div class="sol-erw"><span class="lbl">Erwartung</span>${inline(it.erwartung)}</div>` : '') +
      `</div>`).join(''),
  ).join('')
  const body = renderHead(station, level, 'Lösung & Erwartungshorizont') +
    `<div class="tasks">${sols}</div>` + renderFootnotes(level.belege) + colophon()
  return docShell(`Lösung – ${level.title ?? station.title} (${levelKey})`, body, opts)
}

export default { renderWorksheetHtml, renderErwartungshorizontHtml, inline, esc }
