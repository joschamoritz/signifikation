import { WEEKDAYS, MONTHS } from './homeUtils'
import { getMedal } from './gameLogic'

const W = 1080
const H = 1350
const ACCENT    = '#9b1c1c'
const BG        = '#faf9f7'
const TEXT      = '#2a2318'
const MUTED     = '#8a8070'
const BORDER_C  = '#cdc8bc'
const BAR_EMPTY = '#ddd8ce'

const SERIF = "'Gentium Plus', Georgia, serif"
const SANS  = "'DM Sans', system-ui, sans-serif"

// Doppelte Linie (Duden-Stil)
function rule(ctx, y, padX = 90) {
  const w = W - padX * 2
  ctx.strokeStyle = BORDER_C
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(padX, y);     ctx.lineTo(padX + w, y);     ctx.stroke()
  ctx.beginPath(); ctx.moveTo(padX, y + 5); ctx.lineTo(padX + w, y + 5); ctx.stroke()
}

export async function generateShareImage(playedGames, zrPlayed, wzPlayed, streak, zwPlayed = null) {
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Hintergrund
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Roter Rahmen oben/unten
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W, 14)
  ctx.fillRect(0, H - 14, W, 14)

  let y = 14 + 108

  // Titel
  ctx.textAlign = 'center'
  ctx.fillStyle = ACCENT
  ctx.font = `bold 84px ${SERIF}`
  ctx.fillText('Signifikation', W / 2, y)
  y += 28

  // Tagline
  ctx.fillStyle = MUTED
  ctx.font = `400 28px ${SANS}`
  ctx.fillText('Tägliches Sprachquiz', W / 2, y)
  y += 48

  rule(ctx, y); y += 5 + 44

  // Datum
  const d = new Date()
  ctx.fillStyle = TEXT
  ctx.font = `400 33px ${SANS}`
  ctx.fillText(`${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, W / 2, y)
  y += 52

  rule(ctx, y); y += 5 + 64

  // --- Score-Zeilen ---
  const rows = []
  if (playedGames.length > 0) {
    const total = playedGames.reduce((s, g) => s + g.total, 0)
    const max   = playedGames.length * 10
    rows.push({ label: 'Kollokationen', total, max, medal: getMedal(total, max) })
  }
  if (wzPlayed) rows.push({ label: 'Wort-Zwilling', total: wzPlayed.total,  max: 10,                  medal: wzPlayed.medal })
  if (zwPlayed) rows.push({ label: 'Zeitenwende',   total: zwPlayed.total,  max: 10,                  medal: zwPlayed.medal })
  if (zrPlayed) rows.push({ label: 'Zeitreise',     total: zrPlayed.total,  max: zrPlayed.max ?? 20,  medal: zrPlayed.medal })

  const labelX = 90
  const barX   = 390
  const barW   = 430
  const barH   = 22
  const scoreX = barX + barW + 20
  const medalX = W - 90

  for (const row of rows) {
    // Label
    ctx.textAlign = 'left'
    ctx.fillStyle = TEXT
    ctx.font = `400 32px ${SANS}`
    ctx.fillText(row.label, labelX, y)

    // Balken
    const barTop = y - 22
    ctx.fillStyle = BAR_EMPTY
    ctx.fillRect(barX, barTop, barW, barH)
    const filled = Math.round((row.total / (row.max || 1)) * barW)
    ctx.fillStyle = ACCENT
    ctx.fillRect(barX, barTop, filled, barH)

    // Punktzahl
    ctx.fillStyle = MUTED
    ctx.font = `400 28px ${SANS}`
    ctx.fillText(`${row.total}/${row.max}`, scoreX, y)

    // Medaille
    ctx.textAlign = 'right'
    ctx.font = '36px sans-serif'
    ctx.fillText(row.medal?.emoji ?? '', medalX, y)

    y += 92
  }

  y += 12
  rule(ctx, y); y += 5 + 60

  // Streak
  if (streak > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = TEXT
    ctx.font = `400 38px ${SANS}`
    ctx.fillText(`🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge`, W / 2, y)
    y += 64
  }

  // Ornament
  ctx.textAlign = 'center'
  ctx.fillStyle = BORDER_C
  ctx.font = `italic 40px ${SERIF}`
  ctx.fillText('· · ·', W / 2, y)

  // URL (fest unten)
  ctx.fillStyle = MUTED
  ctx.font = `400 30px ${SANS}`
  ctx.fillText('signifikation.de', W / 2, H - 14 - 46)

  return canvas
}

export async function shareAsImage(playedGames, zrPlayed, wzPlayed, streak, zwPlayed = null) {
  const canvas = await generateShareImage(playedGames, zrPlayed, wzPlayed, streak, zwPlayed)

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Bild konnte nicht erstellt werden')); return }

      const file = new File([blob], 'signifikation.png', { type: 'image/png' })

      // Native Share Sheet (iOS/Android) – unterstützt Bild-Dateien
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Signifikation' })
          resolve('shared')
          return
        } catch (e) {
          if (e.name === 'AbortError') { resolve('cancelled'); return }
          // Kein Datei-Share → Fallback Download
        }
      }

      // Fallback: Bild herunterladen
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = 'signifikation.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      resolve('downloaded')
    }, 'image/png')
  })
}
