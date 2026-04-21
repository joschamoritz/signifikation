export function createLoaders({
  loadLemmata,
  loadKalender,
  loadZeitreise,
  loadWortzwilling,
  loadZeitenwende,
  loadStats,
  loadStatsRows,
}) {
  return {
    'lemmata.json': loadLemmata,
    'kalender.json': loadKalender,
    'zeitreise.json': loadZeitreise,
    'wortzwilling.json': loadWortzwilling,
    'zeitenwende.json': loadZeitenwende,
    'stats.json': loadStats,
    'stats-rows.json': loadStatsRows,
  }
}

export function createSavers({
  saveLemmata,
  replaceKalender,
  replaceZeitreise,
  replaceWortzwilling,
  replaceZeitenwende,
  replaceStats,
  replaceStatsRows,
}) {
  return {
    'lemmata.json': saveLemmata,
    'kalender.json': (obj) => replaceKalender(obj),
    'zeitreise.json': (obj) => replaceZeitreise(obj),
    'wortzwilling.json': (obj) => replaceWortzwilling(obj),
    'zeitenwende.json': (obj) => replaceZeitenwende(obj),
    'stats.json': (obj) => replaceStats(obj),
    'stats-rows.json': (rows) => replaceStatsRows(Array.isArray(rows) ? rows : []),
  }
}
