/**
 * server/classroom/modes/_format.js
 *
 * Kleine, reine Anzeige-/Normalisierungs-Helfer fuer die Modus-Reporting-
 * und Reveal-Funktionen. Frueher in store.js bzw. results/index.js;
 * hier als Leaf-Modul, damit die einzelnen modes/<mode>.js sie teilen, ohne
 * untereinander oder auf results/ zu zeigen.
 */

export function roundTypeLabel(type) {
  if (type === 'choice') return 'Auswahl'
  if (type === 'free') return 'Freie Eingabe'
  if (type === 'double') return 'Doppellücke'
  return type || ''
}

// logDice als Zahl normalisieren (Snapshot-Feld heisst `log_dice`).
export function lemmaLogDice(k) {
  const v = Number(k?.log_dice)
  return Number.isFinite(v) ? v : null
}

// logDice fuer die Anzeige formatieren: Dezimalpunkt → Komma (de-DE).
export function fmtDice(d) {
  return String(d).replace('.', ',')
}

export function zwPeriodLabel(p) {
  return p === 'pre' ? 'vor 2000' : p === 'post' ? 'nach 2000' : '—'
}

// Trefferquote-je-Item-Zeile (kind 'item') der Antwortverteilung.
// Geteilt von Wort-Zwilling / Zeitenwende / Lueckenfueller.
export function itemRow(agg, key, label, sub) {
  const it = agg.items.get(key)
  const answered = it?.answered || 0
  const correct = it?.correct || 0
  return { label, sub: sub || null, count: correct, pct: answered > 0 ? Math.round((correct / answered) * 100) : 0, kind: 'item' }
}
