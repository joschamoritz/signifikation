import { getDailyMedal } from './gameLogic'
import { lsGet, lsParse, lsSet } from './storage'

export function makeDailyKeys(datum) {
  // datum ist YYYY-MM-DD
  return {
    todayKey: `sig_${datum}`,
    todayZRKey: `sig_zr_${datum}`,
    dateStr: datum,
  }
}

export function getPlayedToday(key) {
  const value = lsParse(lsGet(key), [])
  return Array.isArray(value) ? value : []
}

export function markActivity(dateStr) {
  const activity = lsParse(lsGet('sig_activity'), [])
  if (!activity.includes(dateStr)) {
    lsSet('sig_activity', JSON.stringify([dateStr, ...activity].slice(0, 365)))
  }
}

function saveHistory(storageKey, dateStr, medal, emoji) {
  const history = lsParse(lsGet(storageKey), [])
  const index = history.findIndex((entry) => entry.date === dateStr)
  const nextEntry = { date: dateStr, medal, emoji }
  if (index >= 0) history[index] = nextEntry
  else history.unshift(nextEntry)
  lsSet(storageKey, JSON.stringify(history.slice(0, 365)))
}

export function saveKollHistory(dateStr, medal, emoji) {
  saveHistory('sig_koll_history', dateStr, medal, emoji)
}

export function saveZRHistory(dateStr, medal, emoji) {
  saveHistory('sig_zr_history', dateStr, medal, emoji)
}

export function saveWZHistory(dateStr, medal, emoji) {
  saveHistory('sig_wz_history', dateStr, medal, emoji)
}

export function saveZWHistory(dateStr, medal, emoji) {
  saveHistory('sig_zw_history', dateStr, medal, emoji)
}

export function saveLFHistory(dateStr, medal, emoji) {
  saveHistory('sig_lf_history', dateStr, medal, emoji)
}

export function savePlayedGame({ keys, lemmaId, lemmaName, lemmaPos, total, medal, lemmataLength, scores }) {
  const played = getPlayedToday(keys.todayKey)
  const index = played.findIndex((entry) => entry.id === lemmaId)
  const nextEntry = { id: lemmaId, lemma: lemmaName, pos: lemmaPos, total, medal, scores }

  if (index >= 0) played[index] = nextEntry
  else played.push(nextEntry)

  lsSet(keys.todayKey, JSON.stringify(played))
  markActivity(keys.dateStr)

  if (lemmataLength && played.length >= lemmataLength) {
    const dailyTotal = played.reduce((sum, game) => sum + game.total, 0)
    const dailyMedal = getDailyMedal(dailyTotal)
    saveKollHistory(keys.dateStr, dailyMedal.label, dailyMedal.emoji)
  }
}
