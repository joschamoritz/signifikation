// Datenzugriff für die Social-Card-Entwürfe (Tabelle social_card_entwurf, Migration 0026).
import db from '../db.js'

const stmts = {
  slotsImFenster: db.prepare(`SELECT datum, slot FROM social_card_entwurf WHERE datum BETWEEN ? AND ?`),
  einfuegen:      db.prepare(`
    INSERT OR IGNORE INTO social_card_entwurf (datum, slot, spec, caption, hashtags, erstellt_am, aktualisiert_am)
    VALUES (@datum, @slot, @spec, @caption, @hashtags, @jetzt, @jetzt)
  `),
  imFenster:      db.prepare(`SELECT * FROM social_card_entwurf WHERE datum BETWEEN ? AND ? ORDER BY datum, id`),
  ab:             db.prepare(`SELECT * FROM social_card_entwurf WHERE datum >= ? ORDER BY datum, id`),
  holen:          db.prepare(`SELECT * FROM social_card_entwurf WHERE id = ?`),
  ohneBild:       db.prepare(`SELECT * FROM social_card_entwurf WHERE bild IS NULL AND status <> 'verworfen' AND datum >= ? ORDER BY datum, id`),
  setzeBild:      db.prepare(`UPDATE social_card_entwurf SET bild = ?, aktualisiert_am = ? WHERE id = ?`),
  setzeCaption:   db.prepare(`UPDATE social_card_entwurf SET caption = ?, aktualisiert_am = ? WHERE id = ? AND status = 'offen'`),
  setzeStatus:    db.prepare(`UPDATE social_card_entwurf SET status = ?, entschieden_am = ?, aktualisiert_am = ? WHERE id = ?`),
  ersetzeInhalt:  db.prepare(`
    UPDATE social_card_entwurf SET spec = @spec, caption = @caption, hashtags = @hashtags, bild = NULL, aktualisiert_am = @jetzt
    WHERE datum = @datum AND slot = @slot AND status = 'offen'
  `),
  alteBilder:     db.prepare(`SELECT id, bild FROM social_card_entwurf WHERE datum < ?`),
  alteLoeschen:   db.prepare(`DELETE FROM social_card_entwurf WHERE datum < ?`),
}

function zeile(row) {
  if (!row) return null
  return {
    id: row.id,
    datum: row.datum,
    slot: row.slot,
    spec: JSON.parse(row.spec),
    caption: row.caption,
    hashtags: row.hashtags,
    bild: row.bild,
    status: row.status,
    erstelltAm: row.erstellt_am,
    aktualisiertAm: row.aktualisiert_am,
    entschiedenAm: row.entschieden_am,
  }
}

const params = (e, jetzt) => ({ datum: e.datum, slot: e.slot, spec: JSON.stringify(e.spec), caption: e.caption, hashtags: e.hashtags, jetzt })

/** 'datum|slot' aller vorhandenen Entwürfe im Fenster (auch verworfene). */
export function vorhandeneSlots(von, bis) {
  return new Set(stmts.slotsImFenster.all(von, bis).map((r) => `${r.datum}|${r.slot}`))
}

const _speichereTx = db.transaction((liste, jetzt) => {
  let neu = 0
  for (const e of liste) neu += stmts.einfuegen.run(params(e, jetzt)).changes
  return neu
})

/** Legt Entwürfe an; vorhandene (datum, slot) bleiben unberührt. Liefert die Zahl neuer Zeilen. */
export function speichereEntwuerfe(liste, jetzt = new Date().toISOString()) {
  return _speichereTx(liste, jetzt)
}

/** Ersetzt Inhalt eines OFFENEN Entwurfs (Bild wird neu gezeichnet). false, wenn schon entschieden. */
export function ersetzeEntwurf(e, jetzt = new Date().toISOString()) {
  return stmts.ersetzeInhalt.run(params(e, jetzt)).changes === 1
}

export function ladeEntwuerfe(von, bis) {
  return stmts.imFenster.all(von, bis).map(zeile)
}

/** Alle Entwürfe ab `datum` (ohne obere Grenze). */
export function ladeEntwuerfeAb(datum) {
  return stmts.ab.all(datum).map(zeile)
}

export function ladeEntwurf(id) {
  return zeile(stmts.holen.get(id))
}

/** Entwürfe ab `abDatum`, deren Bild noch fehlt (neu oder nach „Neu erzeugen“). */
export function entwuerfeOhneBild(abDatum) {
  return stmts.ohneBild.all(abDatum).map(zeile)
}

export function setzeBild(id, datei, jetzt = new Date().toISOString()) {
  stmts.setzeBild.run(datei, jetzt, id)
}

/** Caption nur bei offenen Entwürfen änderbar. */
export function setzeCaption(id, caption, jetzt = new Date().toISOString()) {
  return stmts.setzeCaption.run(caption, jetzt, id).changes === 1
}

/** Freigeben, verwerfen oder zurück auf offen. */
export function setzeStatus(id, status, jetzt = new Date().toISOString()) {
  const entschieden = status === 'offen' ? null : jetzt
  return stmts.setzeStatus.run(status, entschieden, jetzt, id).changes === 1
}

/**
 * Löscht Entwürfe vor `datum` und liefert je gelöschtem Entwurf die Dateinamen der vollen Bilder
 * zum Aufräumen. Sie folgen der ID (entwurf-<id>.png) – nicht nur der `bild`-Spalte: Nach „Neu
 * erstellen“ oder einem abgebrochenen Zeichnen kann eine Datei liegen, auf die keine Spalte zeigt.
 * Weicht die Spalte vom ID-Namen ab, ist auch dieser Name dabei.
 * @returns {string[][]} je Entwurf die Liste der Dateinamen (voll; die kleine Fassung leitet sich ab)
 */
export function loescheAlteEntwuerfe(datum) {
  const zeilen = stmts.alteBilder.all(datum)
  stmts.alteLoeschen.run(datum)
  return zeilen.map((r) => {
    const namen = [`entwurf-${r.id}.png`]
    if (r.bild && r.bild !== namen[0]) namen.push(r.bild)
    return namen
  })
}
