// Datenzugriff für das Entwurfs-Postfach (Tabelle lemma_entwurf, Migration 0025).
import db from './db.js'

const stmts = {
  loescheOffenen: db.prepare(`DELETE FROM lemma_entwurf WHERE datum = ? AND status = 'offen'`),
  einfuegen:      db.prepare(`INSERT INTO lemma_entwurf (datum, payload, erstellt_am) VALUES (?, ?, ?)`),
  offene:         db.prepare(`SELECT id, datum, payload, erstellt_am FROM lemma_entwurf WHERE status = 'offen' ORDER BY datum`),
  holen:          db.prepare(`SELECT id, datum, payload, status FROM lemma_entwurf WHERE id = ?`),
  entscheiden:    db.prepare(`
    UPDATE lemma_entwurf SET status = ?, entschieden_am = ?
    WHERE id = ? AND status = 'offen'
  `),
}

const _speichereTx = db.transaction((tage, jetzt) => {
  for (const tag of tage) {
    stmts.loescheOffenen.run(tag.datum)
    stmts.einfuegen.run(tag.datum, JSON.stringify(tag), jetzt)
  }
})

/** Legt Entwürfe an; ein offener Entwurf für dasselbe Datum wird ersetzt. Alles oder nichts. */
export function speichereEntwuerfe(tage, jetzt = new Date().toISOString()) {
  _speichereTx(tage, jetzt)
  return tage.length
}

export function ladeOffeneEntwuerfe() {
  return stmts.offene.all().map((row) => ({
    id: row.id,
    datum: row.datum,
    erstelltAm: row.erstellt_am,
    tag: JSON.parse(row.payload),
  }))
}

export function ladeEntwurf(id) {
  const row = stmts.holen.get(id)
  return row ? { id: row.id, datum: row.datum, status: row.status, tag: JSON.parse(row.payload) } : null
}

/**
 * Schließt einen offenen Entwurf ab. Liefert false, wenn er nicht (mehr) offen
 * ist — so kann ein doppelter Klick einen Entwurf nicht zweimal übernehmen.
 */
export function entscheideEntwurf(id, status, jetzt = new Date().toISOString()) {
  return stmts.entscheiden.run(status, jetzt, id).changes === 1
}
