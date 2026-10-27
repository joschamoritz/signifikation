// Datenzugriff für die Social-Card-Entwürfe (Tabelle social_card_entwurf, Migration 0028; Beiträge in social_post, Migration 0029).
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
  amSlot:         db.prepare(`SELECT * FROM social_card_entwurf WHERE datum = ? AND slot = ?`),
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
  offenLoeschen:  db.prepare(`DELETE FROM social_card_entwurf WHERE id = ? AND status = 'offen' RETURNING id, bild`),
  // ── Veröffentlichte Beiträge (Migration 0029) ──
  post:           db.prepare(`SELECT * FROM social_post WHERE entwurf_id = ?`),
  postsFuer:      db.prepare(`SELECT p.* FROM social_post p JOIN social_card_entwurf e ON e.id = p.entwurf_id WHERE e.datum BETWEEN ? AND ?`),
  faellig:        db.prepare(`
    SELECT e.* FROM social_card_entwurf e LEFT JOIN social_post p ON p.entwurf_id = e.id
    WHERE e.datum = ? AND e.status = 'freigegeben' AND p.uri IS NULL AND COALESCE(p.versuche, 0) < ?
    ORDER BY e.id
  `),
  postGelungen:   db.prepare(`
    INSERT INTO social_post (entwurf_id, uri, cid, root_uri, root_cid, gepostet_am, versuche, fehler)
    VALUES (@entwurfId, @uri, @cid, @rootUri, @rootCid, @jetzt, 1, NULL)
    ON CONFLICT(entwurf_id) DO UPDATE SET uri = excluded.uri, cid = excluded.cid, root_uri = excluded.root_uri,
      root_cid = excluded.root_cid, gepostet_am = excluded.gepostet_am, versuche = social_post.versuche + 1, fehler = NULL
  `),
  postFehler:     db.prepare(`
    INSERT INTO social_post (entwurf_id, versuche, fehler) VALUES (?, 1, ?)
    ON CONFLICT(entwurf_id) DO UPDATE SET versuche = social_post.versuche + 1, fehler = excluded.fehler
    RETURNING versuche
  `),
}

function postZeile(r) {
  if (!r) return null
  return {
    entwurfId: r.entwurf_id, uri: r.uri, cid: r.cid, rootUri: r.root_uri, rootCid: r.root_cid,
    gepostetAm: r.gepostet_am, versuche: r.versuche, fehler: r.fehler,
  }
}

// Dateinamen der vollen Bilder eines Entwurfs: nach ID, dazu die `bild`-Spalte, falls sie abweicht
function bildNamen(r) {
  const namen = [`entwurf-${r.id}.png`]
  if (r.bild && r.bild !== namen[0]) namen.push(r.bild)
  return namen
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
  return zeilen.map(bildNamen)
}

const _loescheOffeneTx = db.transaction((ids) => ids.map((id) => stmts.offenLoeschen.get(id)).filter(Boolean))

/**
 * Löscht die Entwürfe mit diesen IDs, sofern sie noch offen sind (Entschiedenes bleibt).
 * @returns {string[][]} je gelöschtem Entwurf die Dateinamen wie bei loescheAlteEntwuerfe
 */
export function loescheOffeneEntwuerfe(ids) {
  return _loescheOffeneTx(ids).map(bildNamen)
}

/**
 * Legt eigene Entwürfe (Platz E, ggf. E-aufloesung) an oder ersetzt sie. Belegte Plätze werden nur mit
 * `ersetzen` überschrieben und nur, solange sie offen und nicht gepostet sind. `entfernen`: weitere
 * Plätze ('datum|slot'), die beim Ersetzen wegfallen (alte Auflösung, wenn die neue Fassung keine hat).
 * @returns {{ ok: true, ids: number[], geloescht: string[][] } | { ok: false, belegt: object, ersetzbar: boolean }}
 *   geloescht: Bildnamen entfernter Entwürfe (für das Aufräumen der Dateien)
 */
export const legeEigeneEntwuerfeAb = db.transaction((liste, { ersetzen = false, entfernen = [], jetzt = new Date().toISOString() } = {}) => {
  const vorhanden = liste.map((e) => zeile(stmts.amSlot.get(e.datum, e.slot))).filter(Boolean)
  const gesperrt = vorhanden.find((v) => v.status !== 'offen' || stmts.post.get(v.id)?.uri)
  if (gesperrt) return { ok: false, belegt: gesperrt, ersetzbar: false }
  if (vorhanden.length && !ersetzen) return { ok: false, belegt: vorhanden[0], ersetzbar: true }
  for (const e of liste) {
    if (!stmts.einfuegen.run(params(e, jetzt)).changes) stmts.ersetzeInhalt.run(params(e, jetzt))
  }
  const geloescht = []
  if (ersetzen) {
    for (const schluessel of entfernen) {
      const [datum, slot] = schluessel.split('|')
      const alt = stmts.amSlot.get(datum, slot)
      if (alt && !stmts.post.get(alt.id)?.uri) {
        const weg = stmts.offenLoeschen.get(alt.id)
        if (weg) geloescht.push(bildNamen(weg))
      }
    }
  }
  return { ok: true, ids: liste.map((e) => stmts.amSlot.get(e.datum, e.slot).id), geloescht }
})

// ── Veröffentlichte Beiträge ───────────────────────────────────────────────────

/** Beitrag zu einem Entwurf (gepostet oder mit Fehlversuchen) – oder null. */
export function ladePost(entwurfId) {
  return postZeile(stmts.post.get(entwurfId))
}

/** Beiträge der Entwürfe im Fenster, als Map entwurfId → Beitrag. */
export function ladePostsFuer(von, bis) {
  return new Map(stmts.postsFuer.all(von, bis).map((r) => [r.entwurf_id, postZeile(r)]))
}

/** Freigegebene Entwürfe des Tages, die noch nicht gepostet sind und weniger als `maxVersuche` Fehlversuche haben. */
export function faelligeEntwuerfe(datum, maxVersuche) {
  return stmts.faellig.all(datum, maxVersuche).map(zeile)
}

export function merkePost({ entwurfId, uri, cid, rootUri, rootCid }, jetzt = new Date().toISOString()) {
  stmts.postGelungen.run({ entwurfId, uri, cid, rootUri, rootCid, jetzt })
}

/** Zählt einen Fehlversuch; liefert die Zahl der Versuche bisher. */
export function merkePostFehler(entwurfId, fehler) {
  return stmts.postFehler.get(entwurfId, String(fehler).slice(0, 500)).versuche
}
