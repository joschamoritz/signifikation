import { lsGet, lsParse } from './storage'

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

export function buildShareText(playedGames, zrPlayed, wzPlayed, wortzwilling) {
  const d = new Date()
  const dateStr = `${d.getDate()}. ${MONTHS[d.getMonth()]}`
  function blocks(score) {
    const filled = Math.round((score / 10) * 5)
    return '█'.repeat(filled) + '░'.repeat(5 - filled)
  }
  const lines = [`📖 Signifikation · ${dateStr}`, '']
  for (const g of playedGames) {
    const lbl = POS_LABEL[g.pos] || 'Wort'
    lines.push(`[${lbl}] ${g.lemma}  ${blocks(g.total)}  ${g.total}/10`)
  }
  if (playedGames.length > 0) lines.push('')
  if (zrPlayed) {
    lines.push(`[500 Jahre] ${zrPlayed.lemma}  ${blocks(zrPlayed.total)}  ${zrPlayed.total}/10`)
    lines.push('')
  }
  if (wzPlayed && wortzwilling) {
    lines.push(`[Wort-Zwilling] ${wortzwilling.wortA}/${wortzwilling.wortB}  ${blocks(wzPlayed.total)}  ${wzPlayed.total}/10`)
    lines.push('')
  }
  lines.push('💬 Schaffst du es besser? → signifikation.de')
  return lines.join('\n')
}
