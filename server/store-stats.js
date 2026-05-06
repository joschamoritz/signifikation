import { normalizeDatumToIso, sortDatumKeys } from './date-utils.js'

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
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

export function aggregateStatsRows(rows) {
  const result = {}

  for (const row of rows) {
    if (!result[row.datum]) result[row.datum] = {}

    const distEntries = parseJson(row.dist_list || '[]', [])
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

export function createStatsWindowCache(ttlMs) {
  return {
    ttlMs,
    key: null,
    value: null,
    ts: 0,
  }
}

export function getCachedStatsWindow(cache, stats, days) {
  const statsKeys = Object.keys(stats || {})
  const cacheKey = `${days}|${statsKeys.length}|${statsKeys.join(',')}`

  if (cache.key === cacheKey && Date.now() - cache.ts < cache.ttlMs) {
    return cache.value
  }

  const result = buildStatsWindow(stats, days)
  cache.key = cacheKey
  cache.value = result
  cache.ts = Date.now()
  return result
}

export function createStatsStore({ db, stmts, loadReadOnly }) {
  const statsWindowCache = createStatsWindowCache(30 * 1000)

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
    invalidateStatsWindowCache(statsWindowCache)
  })

  const replaceStatsRows = db.transaction((rows) => {
    stmts.deleteAllStats.run()
    for (const row of rows) {
      stmts.upsertStats.run(sanitizeStatsRow(row))
    }
    invalidateStatsWindowCache(statsWindowCache)
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

    invalidateStatsWindowCache(statsWindowCache)
  })

  function loadStats() {
    return aggregateStatsRows(stmts.getStatsAggregated.all())
  }

  function loadStatsRows() {
    return mapStatsRows(stmts.getAllStats.all())
  }

  function recordStat({ datum, spiel, userId = '', score = 0, max = 0 }) {
    recordStatTx({ datum, spiel, userId, score, max })
  }

  function getStatsWindow(days) {
    const stats = loadStats()
    return getCachedStatsWindow(statsWindowCache, stats, days)
  }

  function getStatsTimeline(days) {
    const stats = loadStats()
    return buildStatsTimeline(stats, days)
  }

  return {
    loadStats,
    loadStatsRows,
    replaceStats,
    replaceStatsRows,
    recordStat,
    getStatsWindow,
    getStatsTimeline,
    invalidateWindowCache() {
      invalidateStatsWindowCache(statsWindowCache)
    },
  }
}

export function buildStatsTimeline(stats, days) {
  const orderedDates = sortMmddKeys(Object.keys(stats || {}))
  return orderedDates.slice(-days).map((datum) => ({ datum, ...(stats[datum] || {}) }))
}

function invalidateStatsWindowCache(cache) {
  cache.key = null
  cache.value = null
  cache.ts = 0
}
