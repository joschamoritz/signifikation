/**
 * server/routes/admin-stats.js
 *
 * Auswertung › Spiele (Schritt 8). Zeitraum = Berliner Kalendertage inklusive heute, Admin-Konten zählen nicht.
 * Die Antworten enthalten nur Summen – keine Konto-IDs, Namen oder E-Mail-Adressen.
 *
 *   GET /admin/auswertung/spiele?days=   – Tage, Verteilung, Summen (5 Minuten Zwischenspeicher, für days=1 30 Sekunden;
 *                                          `&frisch=1` übergeht ihn, store-stats.js)
 *   GET /admin/stats/export?days=        – CSV (Semikolon, deutsche Spalten, Dezimalkomma, BOM)
 */
import express from 'express'
import { toCsvCell } from './csv-utils.js'

const SPIEL_NAMEN = {
  kollokationen: 'Kollokationen',
  wortzwilling: 'Wort-Zwilling',
  zeitenwende: 'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
  woche_wortzwilling: 'Wort der Woche: Wort-Zwilling',
  woche_zeitenwende: 'Wort der Woche: Zeitenwende',
  woche_lueckenfueller: 'Wort der Woche: Lückenfüller',
}

const KOPF = ['Tag', 'Spielmodus', 'Spiele', 'Punkte', 'Höchstpunkte', 'Durchschnitt']

/** Durchschnitt in Punkten von 10 mit Komma: „6,4“; ohne Wertung leer. */
function durchschnittDe(punkte, max) {
  return max > 0 ? ((punkte / max) * 10).toFixed(1).replace('.', ',') : ''
}

/** `2026-09-25` → `25.09.2026` (Excel liest das deutsche Datum als Datum). */
function datumDe(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

/**
 * CSV für deutsches Excel: Semikolon als Trenner, Dezimalkomma, UTF-8 mit BOM, Zeilenende CRLF.
 * Jede Zelle geht durch toCsvCell (Schutz vor Formel-Einschleusung). Zahlen bleiben Zahlen.
 */
export function buildSpieleCsv(zeilen) {
  const lines = [KOPF.map(toCsvCell).join(';')]
  for (const r of zeilen) {
    lines.push([
      toCsvCell(datumDe(r.datum)),
      toCsvCell(SPIEL_NAMEN[r.spiel] || r.spiel),
      toCsvCell(r.spiele),
      toCsvCell(r.punkte),
      toCsvCell(r.max),
      toCsvCell(durchschnittDe(r.punkte, r.max)),
    ].join(';'))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function createAdminStatsRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminAuswertungSpieleQuerySchema,
  adminStatsExportQuerySchema,
  getAuswertungSpiele,
  getAuswertungZeilen,
  adminError,
}) {
  const router = express.Router()

  router.get('/admin/auswertung/spiele', adminLimiter, requireAuth, validate(adminAuswertungSpieleQuerySchema, 'query'), (req, res) => {
    try {
      res.json(getAuswertungSpiele(req.query.days, { frisch: req.query.frisch }))
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/stats/export', adminLimiter, requireAuth, validate(adminStatsExportQuerySchema, 'query'), (req, res) => {
    try {
      const { zeitraum, zeilen } = getAuswertungZeilen(req.query.days)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="signifikation-spiele-${zeitraum.von}-bis-${zeitraum.bis}.csv"`)
      return res.send(buildSpieleCsv(zeilen))
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
