import { normalizeDatumToIso, berlinTag, plusTage, tageVonBis } from './date-utils.js'
import { parseJsonSafe as parseJson } from './json-safe.js'
import { SPIELMODI, WOCHE_SPIELE } from './spielmodi.js'

/**
 * Pro-Konto-Zeilen in `stats` älter als so viele Tage faltet die Verdichtung (compactOldUserStats, jobs/dataRetention)
 * in die anonyme Zeile (user_id = ''). Danach sind dort weder Konten noch Admin-Spiele mehr zu erkennen.
 */
export const STATS_KONTO_ZEILEN_TAGE = 180

// Erster Tag, der noch zu einem Fenster von `days` Tagen gehört (Berliner Kalendertag).
function computeSinceDate(days) {
  return plusTage(berlinTag(), -Number(days))
}

function createEmptyDistribution() {
  return Array(11).fill(0)
}

function normalizeDistribution(distRaw) {
  const parsed = typeof distRaw === 'string' ? parseJson(distRaw, []) : distRaw
  if (!Array.isArray(parsed)) return []

  const dist = createEmptyDistribution()
  for (let i = 0; i < 11; i += 1) {
    dist[i] = Number(parsed[i] || 0)
  }
  return dist
}

function aggregateStatsRows(rows, logger) {
  const result = {}

  for (const row of rows) {
    if (!result[row.datum]) result[row.datum] = {}

    const distEntries = parseJson(row.dist_list || '[]', [], logger, { datum: row.datum, field: 'stats.dist_list' })
    const mergedDist = createEmptyDistribution()

    for (const distRaw of distEntries) {
      const dist = normalizeDistribution(distRaw)
      for (let i = 0; i < 11; i += 1) {
        mergedDist[i] += Number(dist[i] || 0)
      }
    }

    result[row.datum][row.spiel] = {
      plays: row.plays,
      scoreSum: row.scoreSum,
      maxSum: row.maxSum,
      dist: mergedDist,
    }
  }

  return result
}

function mapStatsRows(rows) {
  return rows.map((row) => ({
    datum: row.datum,
    spiel: row.spiel,
    user_id: row.user_id || '',
    plays: Number(row.plays || 0),
    scoreSum: Number(row.scoreSum || 0),
    maxSum: Number(row.maxSum || 0),
    dist: normalizeDistribution(row.dist || '[]'),
  }))
}

function toNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function sanitizeStatsRow(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('Ungueltige Stats-Zeile im Backup')
  }

  const datum = String(row.datum || '').trim()
  const spiel = String(row.spiel || '').trim()
  if (!datum || !spiel) {
    throw new Error('Stats-Zeile ohne datum oder spiel im Backup')
  }

  const isoDatum = normalizeDatumToIso(datum)
  if (!isoDatum) {
    throw new Error('Stats-Zeile mit ungueltigem datum im Backup')
  }

  return {
    datum: isoDatum,
    spiel,
    user_id: String(row.user_id || ''),
    plays: toNonNegativeInt(row.plays),
    scoreSum: toNonNegativeInt(row.scoreSum),
    maxSum: toNonNegativeInt(row.maxSum),
    dist: JSON.stringify(Array.isArray(row.dist) ? row.dist : []),
  }
}

function getNormalizedScoreBucket(score, max) {
  return Math.min(10, Math.max(0, Math.round((score || 0) / (max || 1) * 10)))
}

export function createStatsStore({ db, stmts, logger }) {
  // Zwischenspeicher der Auswertung (siehe unten): Map je Zeitraum und Berliner Tag mit reiner TTL (5 min).
  // Das frühere Einzelfach wurde bei JEDEM recordStat geleert — unter Spiellast fiel die Auswertung praktisch
  // immer auf die volle Aggregation zurück (Review 2026-06-11, D-M5). Admin-Auswertungen dürfen 5 Minuten
  // nachgehen; recordStat leert bewusst nichts. Bulk-Replace (Wiederherstellung) und Verdichtung leeren die Map.
  const AUSWERTUNG_TTL_MS = 5 * 60 * 1000
  // „Spiele heute“ (days = 1, Planen › Woche) soll dem Spielgeschehen folgen: nur kurz im Speicher
  const AUSWERTUNG_TTL_HEUTE_MS = 30 * 1000
  const auswertungCache = new Map()

  const replaceStats = db.transaction((obj) => {
    stmts.deleteAllStats.run()
    for (const [datum, games] of Object.entries(obj)) {
      for (const [spiel, value] of Object.entries(games)) {
        stmts.upsertStats.run({
          datum,
          spiel,
          user_id: value.user_id ?? '',
          plays: value.plays ?? 0,
          scoreSum: value.scoreSum ?? 0,
          maxSum: value.maxSum ?? 0,
          dist: JSON.stringify(value.dist ?? []),
        })
      }
    }
    auswertungCache.clear()
  })

  const replaceStatsRows = db.transaction((rows) => {
    stmts.deleteAllStats.run()
    for (const row of rows) {
      stmts.upsertStats.run(sanitizeStatsRow(row))
    }
    auswertungCache.clear()
  })

  const recordStatTx = db.transaction(({ datum, spiel, userId, score, max }) => {
    const safeUserId = String(userId || '')
    const existing = stmts.getStatsByKey.get(datum, spiel, safeUserId)

    const dist = existing ? normalizeDistribution(existing.dist || '[]') : createEmptyDistribution()
    const normalized = getNormalizedScoreBucket(score, max)
    dist[normalized] += 1

    stmts.upsertStats.run({
      datum,
      spiel,
      user_id: safeUserId,
      plays: (existing?.plays || 0) + 1,
      scoreSum: (existing?.scoreSum || 0) + Math.max(0, Number(score || 0)),
      maxSum: (existing?.maxSum || 0) + Number(max || 0),
      dist: JSON.stringify(dist),
    })
    // Bewusst KEINE Cache-Invalidierung pro Spielzug — die TTL (5 min) reicht.
  })

  // Default bewusst gedeckelt (Review 2026-06-10): stats waechst unbegrenzt
  // (eine Zeile pro User × Spiel × Tag) — der alte Default 3650 aggregierte
  // faktisch die ganze Tabelle synchron im Event-Loop. 400 Tage decken alle
  // Admin-Ansichten und den Legacy-Export; das vollstaendige Archiv sichert
  // das Datei-Backup (jobs/sqliteBackup.js), Rohzugriff: loadStatsRows().
  function loadStats(days = 400) {
    const since = computeSinceDate(days)
    return aggregateStatsRows(stmts.getStatsAggregated.all({ since }), logger)
  }

  function loadStatsRows() {
    return mapStatsRows(stmts.getAllStats.all())
  }

  function recordStat({ datum, spiel, userId = '', score = 0, max = 0 }) {
    recordStatTx({ datum, spiel, userId, score, max })
  }

  // ── Auswertung › Spiele ───────────────────────────────────────────
  // Eine Abfrage (datum × spiel, samt Punkteverteilung) über den Zeitraum, eine kleine über den Vorzeitraum.
  // Zeitraum = Berliner Kalendertage inklusive heute, jeder Tag steht in der Antwort (Tage ohne Spiel mit 0).
  // Admin-Konten zählen nicht mit. Die Antwort kennt keine Konten, nur Summen. Das Ergebnis liegt 5 Minuten im
  // Speicher (ein Prozess, daher als Modulzustand), gemerkt je Zeitraum UND Berliner Tag, damit nach
  // Mitternacht nichts Altes stehen bleibt.
  // Gemessen (589 240 Zeilen): json_group_array + Zusammenzählen in JS ≈ 0,55 s für 12 Monate; json_each in SQL
  // war zehnmal langsamer (≈ 5,4 s). Backlog: Tagessummen-Tabelle statt Aggregation über alle Zeilen.
  const ohneAdmin = "user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')"
  const tageSpielStmt = db.prepare(`
    SELECT datum, spiel,
           SUM(plays)    AS spiele,
           SUM(scoreSum) AS punkte,
           SUM(maxSum)   AS max,
           SUM(CASE WHEN user_id != '' THEN plays ELSE 0 END) AS mitKonto,
           json_group_array(dist) AS dist_list
    FROM stats
    WHERE datum >= @von AND datum <= @bis AND ${ohneAdmin}
    GROUP BY datum, spiel
  `)
  const vorzeitraumStmt = db.prepare(`
    SELECT spiel, SUM(plays) AS spiele, SUM(scoreSum) AS punkte, SUM(maxSum) AS max
    FROM stats
    WHERE datum >= @von AND datum <= @bis AND ${ohneAdmin}
    GROUP BY spiel
  `)

  const leereSumme = () => ({ spiele: 0, punkte: 0, max: 0 })
  const SCHLUESSEL_REIHENFOLGE = [...SPIELMODI, ...WOCHE_SPIELE]

  function berechneAuswertungSpiele(days, heute) {
    const von = plusTage(heute, -(days - 1))
    const nachTag = new Map(tageVonBis(von, heute).map((datum) => [datum, {
      datum,
      teil: datum === heute,
      modi: Object.fromEntries(SPIELMODI.map((m) => [m, leereSumme()])),
    }]))
    // Konto-Zeilen gibt es nur an Tagen ab `kontoAb`; davor ist alles in der anonymen Zeile (siehe STATS_KONTO_ZEILEN_TAGE).
    // `mitKonto` und sein Nenner `kontoBasis` zählen deshalb nur die Tage ab `kontoAb`; `verdichtetBis` ist der letzte
    // verdichtete Tag im Zeitraum (null, wenn der Zeitraum nicht so weit zurückreicht). Dort sind auch Admin-Spiele nicht mehr herauszurechnen.
    const kontoAb = plusTage(heute, -STATS_KONTO_ZEILEN_TAGE)
    const verdichtetBis = von < kontoAb ? plusTage(kontoAb, -1) : null
    const summe = { ...leereSumme(), mitKonto: 0, kontoBasis: 0 }
    const woche = leereSumme()
    const verteilung = Object.fromEntries(SPIELMODI.map((m) => [m, createEmptyDistribution()]))
    const csv = []

    for (const r of tageSpielStmt.all({ von, bis: heute })) {
      const werte = { spiele: Number(r.spiele || 0), punkte: Number(r.punkte || 0), max: Number(r.max || 0) }
      const tag = nachTag.get(r.datum)
      if (!tag) continue
      if (SPIELMODI.includes(r.spiel)) {
        for (const k of Object.keys(werte)) { tag.modi[r.spiel][k] += werte[k]; summe[k] += werte[k] }
        if (r.datum >= kontoAb) {
          summe.mitKonto += Number(r.mitKonto || 0)
          summe.kontoBasis += werte.spiele
        }
        // Punkteverteilung nur der Tagesmodi (Wort der Woche ist eine eigene Gruppe)
        const dists = parseJson(r.dist_list || '[]', [], logger, { datum: r.datum, field: 'stats.dist_list' })
        for (const roh of dists) {
          const dist = normalizeDistribution(roh)
          for (let i = 0; i < 11; i += 1) verteilung[r.spiel][i] += Number(dist[i] || 0)
        }
      } else if (WOCHE_SPIELE.includes(r.spiel)) {
        for (const k of Object.keys(werte)) woche[k] += werte[k]
      } else {
        continue // unbekannter Schlüssel (z. B. aus einer alten Sicherung): nicht auswerten
      }
      csv.push({ datum: r.datum, spiel: r.spiel, ...werte })
    }

    // Vorzeitraum (gleich lang, direkt davor) nur bis 90 Tage: Bei 12 Monaten reicht die Statistik nicht weit genug zurück.
    // Er zählt wie die Summe nur die Tagesmodi.
    let vorher = null
    if (days <= 90) {
      vorher = leereSumme()
      for (const r of vorzeitraumStmt.all({ von: plusTage(von, -days), bis: plusTage(von, -1) })) {
        if (!SPIELMODI.includes(r.spiel)) continue
        vorher.spiele += Number(r.spiele || 0)
        vorher.punkte += Number(r.punkte || 0)
        vorher.max += Number(r.max || 0)
      }
    }

    csv.sort((a, b) => a.datum.localeCompare(b.datum) || SCHLUESSEL_REIHENFOLGE.indexOf(a.spiel) - SCHLUESSEL_REIHENFOLGE.indexOf(b.spiel))
    return {
      antwort: {
        zeitraum: { days, von, bis: heute, stand: new Date().toISOString(), verdichtetBis },
        tage: [...nachTag.values()],
        verteilung,
        summe,
        vorher,
        wortDerWoche: woche,
      },
      zeilen: csv,
    }
  }

  const ttlFuer = (days) => (days <= 1 ? AUSWERTUNG_TTL_HEUTE_MS : AUSWERTUNG_TTL_MS)

  // frisch: den Speicher übergehen und neu rechnen („neu laden“ im Admin); das Ergebnis ersetzt den Eintrag desselben Schlüssels
  function holeAuswertung(days, { frisch = false } = {}) {
    const heute = berlinTag()
    const key = `${days}|${heute}`
    const jetzt = Date.now()
    const hit = auswertungCache.get(key)
    if (!frisch && hit && jetzt - hit.ts < ttlFuer(days)) return hit.value
    const value = berechneAuswertungSpiele(days, heute)
    // Abgelaufene Einträge (anderer Tag, anderer Zeitraum) fallen heraus, die Map bleibt klein
    for (const [k, v] of auswertungCache) if (jetzt - v.ts >= ttlFuer(v.days)) auswertungCache.delete(k)
    auswertungCache.set(key, { value, ts: jetzt, days })
    return value
  }

  /** Antwort für GET /admin/auswertung/spiele (Form siehe berechneAuswertungSpiele). */
  function getAuswertungSpiele(days, opts) {
    return holeAuswertung(days, opts).antwort
  }

  /** Zeilen (Tag × Spielschlüssel, auch Wort der Woche) für den CSV-Export; gleicher Zeitraum, gleicher Speicher. */
  function getAuswertungZeilen(days, opts) {
    const { antwort, zeilen } = holeAuswertung(days, opts)
    return { zeitraum: antwort.zeitraum, zeilen }
  }

  // ── Stats-Retention (Review 2026-06-11, D-H1) ────────────────────
  // stats waechst eine Zeile pro User × Spiel × Tag. Aeltere per-User-
  // Zeilen tragen nur noch zu Aggregaten bei → in die anonyme Zeile
  // (user_id='') falten und loeschen. Batched (LIMIT) gegen Event-Loop-
  // Blockaden; idempotent (zweiter Lauf findet nichts mehr).
  const selectOldUserRowsStmt = db.prepare(`
    SELECT datum, spiel, user_id, plays, scoreSum, maxSum, dist
    FROM stats
    WHERE user_id != '' AND datum < ?
    LIMIT 2000
  `)
  const deleteStatsRowStmt = db.prepare(
    'DELETE FROM stats WHERE datum = ? AND spiel = ? AND user_id = ?'
  )

  const compactBatchTx = db.transaction((cutoff) => {
    const rows = selectOldUserRowsStmt.all(cutoff)
    for (const row of rows) {
      const anon = stmts.getStatsByKey.get(row.datum, row.spiel, '')
      const dist = anon ? normalizeDistribution(anon.dist || '[]') : createEmptyDistribution()
      const rowDist = normalizeDistribution(row.dist || '[]')
      for (let i = 0; i < 11; i += 1) dist[i] += rowDist[i]

      stmts.upsertStats.run({
        datum: row.datum,
        spiel: row.spiel,
        user_id: '',
        plays: (anon?.plays || 0) + Number(row.plays || 0),
        scoreSum: (anon?.scoreSum || 0) + Number(row.scoreSum || 0),
        maxSum: (anon?.maxSum || 0) + Number(row.maxSum || 0),
        dist: JSON.stringify(dist),
      })
      deleteStatsRowStmt.run(row.datum, row.spiel, row.user_id)
    }
    return rows.length
  })

  function compactOldUserStats(olderThanDays = STATS_KONTO_ZEILEN_TAGE) {
    const cutoff = computeSinceDate(olderThanDays)
    let total = 0
    for (;;) {
      const n = compactBatchTx(cutoff)
      total += n
      if (n < 2000) break
    }
    if (total > 0) auswertungCache.clear()
    return total
  }

  // Export ohne per-User-Aufloesung (Gist-Backup): aggregiert pro
  // datum × spiel — Summen/Verteilungen bleiben fuer die Admin-Statistik
  // exakt, pseudonyme User-IDs verlassen den Server nicht (D-M4).
  function loadStatsRowsAnonymized() {
    const rows = stmts.getAllStats.all()
    const byKey = new Map()
    for (const row of mapStatsRows(rows)) {
      const key = `${row.datum}|${row.spiel}`
      const agg = byKey.get(key) || {
        datum: row.datum, spiel: row.spiel, user_id: '',
        plays: 0, scoreSum: 0, maxSum: 0, dist: createEmptyDistribution(),
      }
      agg.plays += row.plays
      agg.scoreSum += row.scoreSum
      agg.maxSum += row.maxSum
      for (let i = 0; i < 11; i += 1) agg.dist[i] += Number(row.dist[i] || 0)
      byKey.set(key, agg)
    }
    return [...byKey.values()]
  }

  function getPercentile(datum, spiel, score, max) {
    const row = stmts.getStatsByDatumSpiel.get(datum, spiel)
    const totalPlays = Number(row?.plays || 0)
    if (totalPlays < 10) return null

    const distEntries = parseJson(row.dist_list || '[]', [], logger, { datum, spiel, field: 'stats.dist_list' })
    const merged = createEmptyDistribution()
    for (const d of distEntries) {
      const dist = normalizeDistribution(d)
      for (let i = 0; i < 11; i += 1) merged[i] += Number(dist[i] || 0)
    }

    const bucket = getNormalizedScoreBucket(score, max)
    const below = merged.slice(0, bucket).reduce((s, v) => s + v, 0)
    return { percentile: Math.round((below / totalPlays) * 100), plays: totalPlays }
  }

  return {
    loadStats,
    loadStatsRows,
    replaceStats,
    replaceStatsRows,
    recordStat,
    getAuswertungSpiele,
    getAuswertungZeilen,
    getPercentile,
    compactOldUserStats,
    loadStatsRowsAnonymized,
    invalidateWindowCache() {
      auswertungCache.clear()
    },
  }
}
