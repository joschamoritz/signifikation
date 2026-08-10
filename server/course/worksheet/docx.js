/**
 * server/course/worksheet/docx.js
 *
 * DOCX-Renderer für die Kurs-Arbeitsblätter (Bonus-Premium: editierbares Material).
 * Nimmt dasselbe Content-Modell wie render.js (worksheet/station-N.js) + eine
 * Niveaustufe und baut ein docx.Document. Bewusst "clean & editierbar" statt
 * CD-pixelgenau (Entscheidung planning/archive „Kurs-Material-Ueberarbeitung“ §2.3):
 * Standardfonts (Calibri), keine Web-/Custom-Fonts, einfache Fußnotenliste am
 * Dokumentende statt native Word-Fußnoten.
 *
 * Block-Dispatch + Inline-Markup (**fett**, *kursiv*, [^n]) spiegeln render.js;
 * Ausgabe sind TextRun-Arrays statt HTML-Strings.
 */

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, VerticalAlign, HeadingLevel,
} from 'docx'

import { LITERATUR } from '../literatur.js'

const RED = '9B1C1C'
const GOLD = 'C9A84C'
const INK = '2A2624'
const MUTED = '6B6560'
const RULE = 'D8D2C4'

const FONT = 'Calibri'

// ── Inline-Markup: **fett** / *kursiv* / [^n] → TextRun[] ─────────────

function inlineRuns(text, opts = {}) {
  const src = String(text ?? '')
  const runs = []
  // Reihenfolge: erst Fußnoten-Marker abspalten (hochgestellt), dann fett/kursiv
  // im Rest. Einfacher Tokenizer statt Regex-Ersetzung, damit Formate kombinieren.
  const tokenRe = /(\*\*.+?\*\*|\*.+?\*|\[\^\d+\])/g
  let last = 0
  let m
  while ((m = tokenRe.exec(src))) {
    if (m.index > last) runs.push(new TextRun({ text: src.slice(last, m.index), font: FONT, ...opts }))
    const token = m[0]
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, font: FONT, ...opts }))
    } else if (token.startsWith('[^')) {
      runs.push(new TextRun({ text: token.slice(2, -1), superScript: true, font: FONT, ...opts }))
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true, font: FONT, ...opts }))
    }
    last = tokenRe.lastIndex
  }
  if (last < src.length) runs.push(new TextRun({ text: src.slice(last), font: FONT, ...opts }))
  if (!runs.length) runs.push(new TextRun({ text: '', font: FONT, ...opts }))
  return runs
}

// ── Gemeinsame Bausteine ────────────────────────────────────────────

function blockLabel(text) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text: '◆ ', font: FONT, color: GOLD, bold: true }), new TextRun({ text, font: FONT, bold: true, color: RED, size: 20 })],
  })
}

function cellBorders(color = RULE) {
  const side = { style: BorderStyle.SINGLE, size: 4, color }
  return { top: side, bottom: side, left: side, right: side }
}

function noBorderCell(children, opts = {}) {
  return new TableCell({
    children,
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    verticalAlign: VerticalAlign.TOP,
    ...opts,
  })
}

// ── Block-Renderer (Content-Block → Paragraph/Table[]) ─────────────────

function renderWissen(b) {
  const out = [blockLabel(b.label)]
  for (const p of b.paras ?? []) {
    out.push(new Paragraph({ spacing: { after: 120 }, children: inlineRuns(p) }))
  }
  if (b.forward) {
    out.push(new Paragraph({
      spacing: { after: 120 },
      shading: { type: ShadingType.SOLID, color: 'F4F1EA' },
      children: inlineRuns(b.forward, { italics: true, color: MUTED, size: 20 }),
    }))
  }
  return out
}

function renderMerke(b) {
  return [new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: GOLD, space: 8 } },
    children: [new TextRun({ text: 'Merke  ', font: FONT, bold: true, color: RED }), ...inlineRuns(b.text)],
  })]
}

function renderSkala(b) {
  const out = [blockLabel(b.label)]
  const header = (b.axis ?? []).length
    ? new TableRow({ children: [
      noBorderCell([new Paragraph({ children: [new TextRun({ text: b.axis[0], font: FONT, italics: true, color: MUTED })] })]),
      noBorderCell([new Paragraph({})]),
      noBorderCell([new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: b.axis[1], font: FONT, italics: true, color: MUTED })] })]),
    ] })
    : null
  const rows = (b.stops ?? []).map(s => new TableRow({
    children: [
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' },
        children: [new Paragraph({ children: [new TextRun({ text: s.stufe, font: FONT, bold: true })] })] }),
      new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, borders: cellBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: s.bsp, font: FONT, italics: true })] })] }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders(),
        children: [new Paragraph({ children: inlineRuns(s.erkl) })] }),
    ],
  }))
  const tableRows = header ? [...rows] : rows
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }))
  return out
}

function renderFelder(b) {
  const out = [blockLabel(b.label)]
  const fields = b.fields ?? []
  const heads = fields.map(f => new TableCell({
    borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' },
    children: [new Paragraph({ children: [new TextRun({ text: f.label, font: FONT, bold: true, size: 18 })] })],
  }))
  const cells = fields.map(f => new TableCell({
    borders: cellBorders(),
    children: [new Paragraph({ children: [new TextRun({ text: f.text, font: FONT })] })],
  }))
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: heads }), new TableRow({ children: cells })] }))
  if (b.note) out.push(new Paragraph({ spacing: { before: 80 }, children: inlineRuns(b.note, { italics: true, color: MUTED, size: 20 }) }))
  return out
}

function renderSatzbau(b) {
  const out = []
  if (b.label) out.push(blockLabel(b.label))
  const parts = b.parts ?? []
  const cells = parts.map(p => new TableCell({
    borders: cellBorders(),
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.text, font: FONT, bold: true })] }),
      ...(p.rolle ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.rolle, font: FONT, italics: true, color: MUTED, size: 18 })] })] : []),
    ],
  }))
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] }))
  if (b.note) out.push(new Paragraph({ spacing: { before: 80 }, children: inlineRuns(b.note, { italics: true, color: MUTED, size: 20 }) }))
  return out
}

function renderPipeline(b) {
  const out = [blockLabel(b.label)]
  const steps = b.steps ?? []
  const cells = []
  steps.forEach((s, i) => {
    if (i > 0) cells.push(noBorderCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '→', font: FONT, color: GOLD, bold: true })] })], { width: { size: 6, type: WidthType.PERCENTAGE } }))
    cells.push(new TableCell({
      borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s.name, font: FONT, bold: true, size: 18 })] }),
        ...(s.sub ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s.sub, font: FONT, italics: true, color: MUTED, size: 16 })] })] : []),
      ],
    }))
  })
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] }))
  if (b.note) out.push(new Paragraph({ spacing: { before: 80 }, children: inlineRuns(b.note, { italics: true, color: MUTED, size: 20 }) }))
  return out
}

function renderKontrast(b) {
  const [okHead, noHead] = b.head ?? ['richtig ✓', 'falsch ✗']
  const out = [blockLabel(b.label)]
  const head = new TableRow({ children: [
    new TableCell({ borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' }, children: [new Paragraph({ children: [new TextRun({ text: okHead, font: FONT, bold: true })] })] }),
    new TableCell({ borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' }, children: [new Paragraph({ children: [new TextRun({ text: noHead, font: FONT, bold: true })] })] }),
  ] })
  const rows = (b.rows ?? []).map(row => new TableRow({ children: [
    new TableCell({ borders: cellBorders(), children: [new Paragraph({ children: [
      new TextRun({ text: '✓ ', font: FONT, color: '2E7D32', bold: true }),
      new TextRun({ text: row.ok, font: FONT }),
      ...(row.okNote ? inlineRuns(` ${row.okNote}`, { italics: true, color: MUTED, size: 18 }) : []),
    ] })] }),
    new TableCell({ borders: cellBorders(), children: [new Paragraph({ children: [
      new TextRun({ text: '✗ ', font: FONT, color: RED, bold: true }),
      new TextRun({ text: row.no, font: FONT }),
      ...(row.noNote ? inlineRuns(` ${row.noNote}`, { italics: true, color: MUTED, size: 18 }) : []),
    ] })] }),
  ] }))
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] }))
  return out
}

function renderDatablick(b) {
  const out = [blockLabel(b.label)]
  const head = new TableRow({ children: [
    new TableCell({ borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' }, children: [new Paragraph({ children: [new TextRun({ text: 'Verbindung', font: FONT, bold: true })] })] }),
    new TableCell({ borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Frequenz', font: FONT, bold: true })] })] }),
    new TableCell({ borders: cellBorders(), shading: { type: ShadingType.SOLID, color: 'F4F1EA' }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'logDice', font: FONT, bold: true })] })] }),
  ] })
  const rows = (b.rows ?? []).map(r => new TableRow({ children: [
    new TableCell({ borders: cellBorders(), shading: r.mark ? { type: ShadingType.SOLID, color: 'FBF3DD' } : undefined, children: [new Paragraph({ children: [new TextRun({ text: r.verb, font: FONT, bold: !!r.mark })] })] }),
    new TableCell({ borders: cellBorders(), shading: r.mark ? { type: ShadingType.SOLID, color: 'FBF3DD' } : undefined, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(r.frequency), font: FONT })] })] }),
    new TableCell({ borders: cellBorders(), shading: r.mark ? { type: ShadingType.SOLID, color: 'FBF3DD' } : undefined, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(r.logDice), font: FONT })] })] }),
  ] }))
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] }))
  if (b.caption) out.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: b.caption, font: FONT, italics: true, color: MUTED, size: 16 })] }))
  if (b.note) out.push(new Paragraph({ spacing: { before: 80 }, children: inlineRuns(b.note, { italics: true, color: MUTED, size: 20 }) }))
  return out
}

function renderTaskItem(item, i) {
  const out = [new Paragraph({
    spacing: { before: 160, after: 40 },
    children: [
      new TextRun({ text: `${i + 1}  `, font: FONT, bold: true, color: RED }),
      new TextRun({ text: `${item.op} `, font: FONT, bold: true }),
      ...inlineRuns(item.prompt),
    ],
  })]
  if ((item.chips ?? []).length) {
    out.push(new Paragraph({
      spacing: { after: 60 },
      children: item.chips.flatMap((c, idx) => [
        new TextRun({ text: idx > 0 ? '   ' : '', font: FONT }),
        new TextRun({ text: c, font: FONT, italics: !!item.chipsSerif, bold: true, color: INK }),
      ]),
    }))
  }
  if ((item.fields ?? []).length) {
    out.push(new Paragraph({
      spacing: { after: 60 },
      children: item.fields.flatMap((f, idx) => [
        new TextRun({ text: idx > 0 ? '     ' : '', font: FONT }),
        new TextRun({ text: `${f.label} `, font: FONT }),
        new TextRun({ text: '_______________', font: FONT, color: MUTED }),
      ]),
    }))
  }
  const answerLines = item.answerLines ?? 0
  for (let a = 0; a < answerLines; a++) {
    out.push(new Paragraph({
      spacing: { after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
      children: [new TextRun({ text: ' ', font: FONT })],
    }))
  }
  return out
}

function renderAufgaben(b) {
  const out = [new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text: b.head ?? 'Aufgaben', font: FONT, bold: true, color: RED, size: 22 })],
  })]
  ;(b.items ?? []).forEach((it, i) => out.push(...renderTaskItem(it, i)))
  return out
}

function renderTransfer(b) {
  return [new Paragraph({
    spacing: { before: 200, after: 120 },
    shading: { type: ShadingType.SOLID, color: 'F4F1EA' },
    children: [new TextRun({ text: `→ ${b.label ?? 'Transfer · in der App'}  `, font: FONT, bold: true, color: RED, size: 18 }), ...inlineRuns(b.text)],
  })]
}

const BLOCK = {
  wissen: renderWissen, merke: renderMerke, skala: renderSkala, felder: renderFelder,
  satzbau: renderSatzbau, pipeline: renderPipeline, kontrast: renderKontrast,
  datablick: renderDatablick, aufgaben: renderAufgaben, transfer: renderTransfer,
}

function renderBlock(b) {
  const fn = BLOCK[b.type]
  return fn ? fn(b) : []
}

// ── Kopf / Fußnotenliste / Dokument ────────────────────────────────────

const STATION_GLYPHS = ['', '①', '②', '③', '④', '⑤']

function renderHead(station, level, kind) {
  const glyph = STATION_GLYPHS[station.stationNo] ?? ''
  const out = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `Signifikation · Kurs · Station ${glyph} · ${kind}`, font: FONT, color: MUTED, size: 16 })] }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 40 },
      children: [new TextRun({ text: level.title ?? station.title, font: FONT, bold: true, color: INK, size: 32 })],
    }),
  ]
  if (level.sub) out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: level.sub, font: FONT, color: MUTED, size: 20 })] }))
  out.push(new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 4 } },
    children: [new TextRun({ text: 'Name: _______________     Klasse: _______     Datum: _______', font: FONT, color: MUTED, size: 18 })],
  }))
  return out
}

function renderFootnotes(belege) {
  if (!(belege ?? []).length) return []
  const out = [new Paragraph({
    spacing: { before: 280, after: 80 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
    children: [new TextRun({ text: 'Belege', font: FONT, bold: true, color: MUTED, size: 18 })],
  })]
  belege.forEach((key, i) => {
    const voll = LITERATUR[key]?.voll ?? key
    out.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `${i + 1}  `, font: FONT, bold: true, color: MUTED, size: 16 }), new TextRun({ text: voll, font: FONT, color: MUTED, size: 16 })],
    }))
  })
  return out
}

function colophon() {
  return [new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: 'Signifikation · korpusbasiertes Kursmaterial. Korpusdaten (Häufigkeit/Assoziationsstärke, Belegsätze) aus eigener Pipeline; Belegsätze CC-BY-SA. Erzeugt aus signifikation.de.',
      font: FONT, italics: true, color: MUTED, size: 14,
    })],
  })]
}

function requireLevel(station, levelKey) {
  const level = station.levels?.[levelKey]
  if (!level) throw new Error(`worksheet/docx: Niveau ${levelKey} für Station ${station.stationNo} fehlt`)
  return level
}

function docShell(children) {
  return new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children,
    }],
    styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
  })
}

/** Arbeitsblatt (blanko) als docx.Document. */
export function renderWorksheetDocx(station, levelKey) {
  const level = requireLevel(station, levelKey)
  const children = [
    ...renderHead(station, level, 'Arbeitsblatt'),
    ...(level.blocks ?? []).flatMap(renderBlock),
    ...renderFootnotes(level.belege),
    ...colophon(),
  ]
  return docShell(children)
}

/** Lösung & Erwartungshorizont als docx.Document. */
export function renderErwartungshorizontDocx(station, levelKey) {
  const level = requireLevel(station, levelKey)
  const tasks = (level.blocks ?? []).filter(b => b.type === 'aufgaben')
  const solChildren = []
  tasks.forEach(b => {
    ;(b.items ?? []).forEach((it, i) => {
      solChildren.push(new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [
          new TextRun({ text: `${i + 1}  `, font: FONT, bold: true, color: RED }),
          new TextRun({ text: `${it.op} `, font: FONT, bold: true }),
          ...inlineRuns(it.prompt),
        ],
      }))
      if (it.erwartung) {
        solChildren.push(new Paragraph({
          spacing: { after: 80 },
          shading: { type: ShadingType.SOLID, color: 'F4F1EA' },
          children: [new TextRun({ text: 'Erwartung  ', font: FONT, bold: true, color: RED, size: 18 }), ...inlineRuns(it.erwartung, { size: 20 })],
        }))
      }
    })
  })
  const children = [
    ...renderHead(station, level, 'Lösung & Erwartungshorizont'),
    ...solChildren,
    ...renderFootnotes(level.belege),
    ...colophon(),
  ]
  return docShell(children)
}

export default { renderWorksheetDocx, renderErwartungshorizontDocx, inlineRuns }
