import db from './db.js'

const stmts = {
  getAll:     db.prepare('SELECT * FROM spezialwochen ORDER BY von DESC'),
  getByWoche: db.prepare('SELECT * FROM spezialwochen WHERE woche = ?'),
  getByDatum: db.prepare('SELECT * FROM spezialwochen WHERE von <= ? AND bis >= ? LIMIT 1'),
  upsert:     db.prepare(`
    INSERT OR REPLACE INTO spezialwochen
      (woche, von, bis, lemma_id, zwilling_partner, zwilling_pos, zwilling_kollokatoren,
       zeitenwende_notiz, zeitenwende_link, lueckenfueller_id, notiz, link)
    VALUES
      (@woche, @von, @bis, @lemma_id, @zwilling_partner, @zwilling_pos, @zwilling_kollokatoren,
       @zeitenwende_notiz, @zeitenwende_link, @lueckenfueller_id, @notiz, @link)
  `),
  delete:     db.prepare('DELETE FROM spezialwochen WHERE woche = ?'),
}

function parseRow(row) {
  if (!row) return null
  return {
    woche:                  row.woche,
    von:                    row.von,
    bis:                    row.bis,
    lemma_id:               row.lemma_id,
    zwilling_partner:       row.zwilling_partner,
    zwilling_pos:           row.zwilling_pos,
    zwilling_kollokatoren:  (() => { try { return JSON.parse(row.zwilling_kollokatoren) } catch { return [] } })(),
    zeitenwende_notiz:      row.zeitenwende_notiz,
    zeitenwende_link:       row.zeitenwende_link,
    lueckenfueller_id:      row.lueckenfueller_id,
    notiz:                  row.notiz,
    link:                   row.link,
  }
}

export function loadSpezialwoche(datum) {
  return parseRow(stmts.getByDatum.get(datum, datum))
}

export function loadSpezialwocheByWoche(woche) {
  return parseRow(stmts.getByWoche.get(woche))
}

export function loadAllSpezialwochen() {
  return stmts.getAll.all().map(parseRow)
}

export function saveSpezialwoche(data) {
  stmts.upsert.run({
    woche:                  data.woche,
    von:                    data.von,
    bis:                    data.bis,
    lemma_id:               data.lemma_id,
    zwilling_partner:       data.zwilling_partner       ?? '',
    zwilling_pos:           data.zwilling_pos           ?? 'Substantiv',
    zwilling_kollokatoren:  JSON.stringify(data.zwilling_kollokatoren ?? []),
    zeitenwende_notiz:      data.zeitenwende_notiz      ?? '',
    zeitenwende_link:       data.zeitenwende_link       ?? '',
    lueckenfueller_id:      data.lueckenfueller_id      ?? '',
    notiz:                  data.notiz                  ?? '',
    link:                   data.link                   ?? '',
  })
}

export function deleteSpezialwoche(woche) {
  stmts.delete.run(woche)
}
