import { normalizeDatumToIso, sortDatumKeys } from './date-utils.js'
import { parseJsonSafe as parseJson } from './json-safe.js'

function computeSinceDate(days) {
  const d = new Date()
  d.setDate(d.getDate() - Number(days))
  return d.toISOString().slice(0, 10)
}

export function createEmptyDistribution() {
  return Array(11).fill(0)
}

export function normalizeDistribution(distRaw) {
  const parsed = typeof distRaw === 'string' ? parseJson(distRaw, []) : distRaw
  if (!Array.isArray(parsed)) return []

  const dist = createEmptyDistribution()
  for (let i = 0; i < 11; i += 1) {
    dist[i] = Number(parsed[i] || 0)
  }
  return dist
}

export function aggregateStatsRows(rows, logger) {
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

export function mapStatsRows(rows) {
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

export function toNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export function sanitizeStatsRow(row) {
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

export function getNormalizedScoreBucket(score, max) {
  return Math.min(10, Math.max(0, Math.round((score || 0) / (max || 1) * 10)))
}

export function sortMmddKeys(keys) {
  return sortDatumKeys(keys)
}

export function buildStatsWindow(stats, days) {
  const orderedDates = sortMmddKeys(Object.keys(stats || {}))
  const selectedDates = orderedDates.slice(-days)

  const byGameMap = new Map()
  const scoreDistribution = createEmptyDistribution()
  let totalPlays = 0
  let totalScoreSum = 0
  let totalMaxSum = 0
  const rows = []

  for (const datum of selectedDates) {
    const games = stats[datum] || {}
    for (const [spiel, bucket] of Object.entries(games)) {
      const plays = Number(bucket?.plays || 0)
      const scoreSum = Number(bucket?.scoreSum || 0)
      const maxSum = Number(bucket?.maxSum || 0)
      const dist = Array.isArray(bucket?.dist) ? bucket.dist : []

      totalPlays += plays
      totalScoreSum += scoreSum
      totalMaxSum += maxSum

      for (let i = 0; i < 11; i += 1) {
        scoreDistribution[i] += Number(dist[i] || 0)
      }

      const prev = byGameMap.get(spiel) || { spiel, plays: 0, scoreSum: 0, maxSum: 0 }
      prev.plays += plays
      prev.scoreSum += scoreSum
      prev.maxSum += maxSum
      byGameMap.set(spiel, prev)

      rows.push({ datum, spiel, plays, scoreSum, maxSum })
    }
  }

  const byGame = [...byGameMap.values()]
    .map((row) => ({
      ...row,
      avg10: row.maxSum > 0 ? Number(((row.scoreSum / row.maxSum) * 10).toFixed(2)) : null,
    }))
    .sort((a, b) => b.plays - a.plays)

  return {
    days,
    selectedDates,
    rows,
    totals: {
      plays: totalPlays,
      scoreSum: totalScoreSum,
      maxSum: totalMaxSum,
      avg10: totalMaxSum > 0 ? Number(((totalScoreSum / totalMaxSum) * 10).toFixed(2)) : null,
    },
    byGame,
    scoreDistribution,
  }
}

export function createStatsStore({ db, stmts, logger }) {
  // Map pro days-Key mit reiner TTL (30 s): Das fruehere Single-Slot-Modell
  // wurde bei JEDEM recordStat invalidiert — unter Spiellast fiel das
  // Admin-Summary praktisch immer auf die volle Aggregation zurueck
  // (Review 2026-06-11, D-M5). Admin-Dashboards sind eventual-consistent;
  // 30 s Verzoegerung sind akzeptabel. Bulk-Replace (Restore) leert die Map.
  const STATS_WINDOW_TTL_MS = 30 * 1000
  const statsWindowCache = new Map()

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
    statsWindowCache.clear()
  })

  const replaceStatsRows = db.transaction((rows) => {
    stmts.deleteAllStats.run()
    for (const row of rows) {
      stmts.upsertStats.run(sanitizeStatsRow(row))
    }
    statsWindowCache.clear()
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
    // Bewusst KEINE Cache-Invalidierung pro Spielzug — TTL (30 s) reicht.
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

  function getStatsWindow(days) {
    const hit = statsWindowCache.get(days)
    if (hit && Date.now() - hit.ts < STATS_WINDOW_TTL_MS) {
      return hit.value
    }
    const result = buildStatsWindow(loadStats(days), days)
    statsWindowCache.set(days, { value: result, ts: Date.now() })
    return result
  }

  function getStatsTimeline(days) {
    const stats = loadStats(days)
    return buildStatsTimeline(stats, days)
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

  function compactOldUserStats(olderThanDays = 180) {
    const cutoff = computeSinceDate(olderThanDays)
    let total = 0
    for (;;) {
      const n = compactBatchTx(cutoff)
      total += n
      if (n < 2000) break
    }
    if (total > 0) statsWindowCache.clear()
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
    getStatsWindow,
    getStatsTimeline,
    getPercentile,
    compactOldUserStats,
    loadStatsRowsAnonymized,
    invalidateWindowCache() {
      statsWindowCache.clear()
    },
  }
}

export function buildStatsTimeline(stats, days) {
  const orderedDates = sortMmddKeys(Object.keys(stats || {}))
  return orderedDates.slice(-days).map((datum) => ({ datum, ...(stats[datum] || {}) }))
}
