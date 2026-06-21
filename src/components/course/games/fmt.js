// Geteilte Helfer für die interaktiven Kurs-Aufgaben (F1–F5).
//
// Zahlenformate spiegeln server/course/resolve.js (deutsches Dezimalkomma,
// Tausenderpunkt), damit Feedback serverseitig (top/logDice) und clientseitig
// (selected) identisch aussieht.

/** logDice → "11,5". */
export function fmtLogDice(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(1).replace('.', ',')
}

/** Frequenz → "2.047". */
export function fmtFrequency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('de-DE')
}

/**
 * Füllt die clientseitigen Platzhalter {{selected.*}} / {{chosen.*}} aus der
 * gewählten Option. Serverseitig sind alle übrigen Platzhalter (top/rank/
 * logDice/freq) bereits ersetzt.
 *
 * @param {string} text
 * @param {{label?:string, logDice?:number, frequency?:number}|null} selected
 */
export function fillSelected(text, selected) {
  if (typeof text !== 'string') return text
  return text.replace(/\{\{\s*(selected|chosen)\.(lemma|logDice|frequency)\s*\}\}/g, (_, _scope, field) => {
    if (!selected) return '—'
    if (field === 'lemma')     return selected.label ?? '—'
    if (field === 'logDice')   return fmtLogDice(selected.logDice)
    if (field === 'frequency') return fmtFrequency(selected.frequency)
    return '—'
  })
}

/** Sichtbare Metrik laut item.display (Niveau-Steuerung, Engine-Spec §5). */
export function showsMetric(display, which) {
  if (!display || display.showMetrics === false) return false
  const m = display.metric
  if (which === 'logDice')   return m === 'logDice' || m === 'both'
  if (which === 'frequency') return m === 'frequency' || m === 'both'
  return false
}

/** Kurzes Metrik-Label „logDice 8,5 · f 1.177" je nach display. */
export function metricLabel(display, row) {
  const parts = []
  if (showsMetric(display, 'logDice') && row.logDice != null) parts.push(`logDice ${fmtLogDice(row.logDice)}`)
  if (showsMetric(display, 'frequency') && row.frequency != null) parts.push(`f ${fmtFrequency(row.frequency)}`)
  return parts.join(' · ')
}
