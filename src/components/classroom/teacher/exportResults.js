// CSV-Export der Klassenraum-Auswertung.
//
// D7-konform: ausschließlich pseudonyme Aggregate pro Lemma (Ø-Punkte,
// Trefferquote, häufigste Fehlantwort) — KEINE Namen, keine Einzelantworten.
// Rein client-seitig (die Daten liegen im EndStep schon vor), ohne Dependency.

const MODE_LABEL = {
  kollokationen:  'Kollokationen',
  wortzwilling:   'Wort-Zwilling',
  zeitenwende:    'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

// Excel-freundlich: Semikolon-getrennt; Felder mit ; " oder Zeilenumbruch
// werden in Anführungszeichen gesetzt (RFC-4180-Quoting).
function csvCell(value) {
  const s = String(value ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvRow(cells) {
  return cells.map(csvCell).join(';')
}

function fmtDate(ts) {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts))
  } catch { return '' }
}

export function buildResultsCsv(results) {
  const session = results?.session || {}
  const totals  = results?.totals || {}
  const byLemma = Array.isArray(results?.byLemma) ? results.byLemma : []

  const lines = [
    csvRow(['Sitzung', session.title || '—']),
    csvRow(['Beendet', fmtDate(session.finishedAt)]),
    csvRow(['Teilnehmer', totals.participants ?? 0]),
    csvRow(['Antworten', totals.submissions ?? 0]),
    '',
    csvRow(['Modus', 'Lemma', 'Teilnehmer', 'Ø-Punkte', 'Max', 'Trefferquote %', 'Häufigste Fehlantwort', 'Anzahl']),
  ]
  for (const r of byLemma) {
    lines.push(csvRow([
      MODE_LABEL[r.mode] || r.mode || '',
      r.lemma,
      r.participants,
      r.avgScore,
      r.maxScore,
      r.hitRatePct,
      r.topDistractor?.label || '',
      r.topDistractor?.count ?? '',
    ]))
  }
  return lines.join('\r\n')
}

// Dateiname aus Titel + Datum, auf sichere Zeichen reduziert.
export function resultsCsvFilename(results) {
  const session = results?.session || {}
  const d = session.finishedAt ? new Date(session.finishedAt) : new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const titlePart = (session.title || 'Sitzung').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'Sitzung'
  return `Auswertung_${titlePart}_${stamp}.csv`
}

export function downloadCsv(filename, csv) {
  // UTF-8-BOM, damit Excel Umlaute korrekt erkennt.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
