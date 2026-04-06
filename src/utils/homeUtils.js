import { lsGet, lsParse } from './storage'
import { getMedal } from './gameLogic'

export const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
export const MONTHS   = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function getISOWeek(d) {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

export function computeStreak() {
  const activity = lsParse(lsGet('sig_activity'), [])
  const legacy   = lsParse(lsGet('sig_history'), []).map(h => h.date)
  const dateSet  = new Set([...activity, ...legacy])
  if (!dateSet.size) return 0
  const msDay = 86_400_000
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr     = localDateStr(today)
  const yesterdayStr = localDateStr(new Date(today - msDay))
  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) return 0
  let d = dateSet.has(todayStr) ? new Date(today) : new Date(today - msDay)
  let streak = 0
  while (dateSet.has(localDateStr(d))) { streak++; d = new Date(d - msDay) }
  return streak
}

export function streakFlames(n) {
  if (n >= 30) return '🔥🔥🔥'
  if (n >= 7)  return '🔥🔥'
  return '🔥'
}

export const POS_LABEL = { 'Substantiv': 'Nomen', 'Verb': 'Verb', 'Adjektiv': 'Adj' }

export function buildShareText(playedGames, zrPlayed, wzPlayed, streak, zwPlayed = null) {
  const d = new Date()
  const dateStr = `${d.getDate()}. ${MONTHS[d.getMonth()]}`
  const streakPart = streak > 0 ? ` · 🔥${streak}` : ''

  function blocks(score, max) {
    const filled = Math.min(5, Math.round((score / (max || 1)) * 5))
    return '█'.repeat(filled) + '░'.repeat(5 - filled)
  }

  const lines = [`📖 Signifikation · ${dateStr}${streakPart}`, '']

  if (playedGames.length > 0) {
    const kollTotal = playedGames.reduce((s, g) => s + g.total, 0)
    const kollMax   = playedGames.length * 10
    const kollMedal = getMedal(kollTotal, kollMax)
    lines.push(`K  ${blocks(kollTotal, kollMax)}  ${kollTotal}/${kollMax}  ${kollMedal.emoji}`)
  }
  if (wzPlayed) {
    lines.push(`W  ${blocks(wzPlayed.total, 10)}   ${wzPlayed.total}/10  ${wzPlayed.medal?.emoji ?? ''}`)
  }
  if (zwPlayed) {
    lines.push(`Zw ${blocks(zwPlayed.total, 10)}   ${zwPlayed.total}/10  ${zwPlayed.medal?.emoji ?? ''}`)
  }
  if (zrPlayed) {
    const zrMax = zrPlayed.max ?? 20
    lines.push(`Z  ${blocks(zrPlayed.total, zrMax)}  ${zrPlayed.total}/${zrMax}  ${zrPlayed.medal?.emoji ?? ''}`)
  }

  lines.push('')
  lines.push('Schaffst du es besser? → signifikation.de')
  return lines.join('\n')
}
