import { WEEKDAYS, MONTHS } from './homeUtils'
import { getMedal } from './gameLogic'

const W       = 1080
const H       = 1920
const PAD_X   = 100
const ACCENT  = '#9b1c1c'
const BG      = '#faf9f7'
const TEXT    = '#2a2318'
const MUTED   = '#8a8070'
const BORDER_C  = '#cdc8bc'
const BAR_EMPTY = '#ddd8ce'
const SERIF = "'Gentium Plus', Georgia, serif"
const SANS  = "'DM Sans', system-ui, sans-serif"

// Doppellinie (Duden-Stil)
function rule(ctx, y) {
  const w = W - PAD_X * 2
  ctx.strokeStyle = BORDER_C
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(PAD_X, y);     ctx.lineTo(PAD_X + w, y);     ctx.stroke()
  ctx.beginPath(); ctx.moveTo(PAD_X, y + 6); ctx.lineTo(PAD_X + w, y + 6); ctx.stroke()
}

// Schätzt Texthöhe aus Fontgröße (konservativ)
function fh(size) { return size * 1.2 }

export async function generateShareImage(playedGames, zrPlayed, wzPlayed, streak, zwPlayed = null) {
  await document.fonts.ready

  // --- Zeilen berechnen (ohne Zeichnen) ---
  const rows = []
  if (playedGames.length > 0) {
    const total = playedGames.reduce((s, g) => s + g.total, 0)
    const max   = playedGames.reduce((s, g) => s + (g.max ?? 10), 0)
    rows.push({ label: 'Kollokationen', total, max, medal: getMedal(total, max) })
  }
  if (wzPlayed) rows.push({ label: 'Wort-Zwilling', total: wzPlayed.total, max: wzPlayed.max ?? 10, medal: wzPlayed.medal })
  if (zwPlayed) rows.push({ label: 'Zeitenwende',   total: zwPlayed.total, max: zwPlayed.max ?? 10, medal: zwPlayed.medal })
  if (zrPlayed) rows.push({ label: 'Zeitreise',     total: zrPlayed.total, max: zrPlayed.max ?? 20, medal: zrPlayed.medal })

  // --- Gesamthöhe des Inhalts berechnen für vertikale Zentrierung ---
  const TITLE_BLOCK  = fh(100) + 16 + fh(34)    // Titel + Gap + Tagline
  const RULE_BLOCK   = 40 + 6 + 40               // Gap + Doppellinie + Gap
  const DATE_BLOCK   = fh(36)
  const ROW_H        = fh(36) + 16 + 24          // Label + Gap + Balken
  const ROW_GAP      = 36
  const STREAK_BLOCK = streak > 0 ? 40 + fh(40) : 0
  const ORNAMENT     = fh(44)
  const ROWS_BLOCK   = rows.length > 0
    ? rows.length * ROW_H + (rows.length - 1) * ROW_GAP
    : 0

  const contentH =
    TITLE_BLOCK +
    RULE_BLOCK +
    DATE_BLOCK +
    RULE_BLOCK +
    ROWS_BLOCK +
    RULE_BLOCK +
    STREAK_BLOCK +
    ORNAMENT

  const BORDER_H = 18
  const MIN_TOP  = BORDER_H + 120
  const yStart   = Math.max(MIN_TOP, (H - contentH) / 2)

  // --- Canvas zeichnen ---
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Hintergrund
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Roter Rand oben/unten
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W, BORDER_H)
  ctx.fillRect(0, H - BORDER_H, W, BORDER_H)

  let y = yStart

  // Titel
  ctx.textAlign = 'center'
  ctx.fillStyle = ACCENT
  ctx.font = `bold 100px ${SERIF}`
  ctx.fillText('Signifikation', W / 2, y)
  y += 16

  // Tagline
  ctx.fillStyle = MUTED
  ctx.font = `400 34px ${SANS}`
  ctx.fillText('Tägliches Sprachquiz', W / 2, y + fh(34))
  y += fh(34) + 40

  rule(ctx, y); y += 6 + 40

  // Datum
  const d = new Date()
  ctx.fillStyle = TEXT
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(`${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, W / 2, y + fh(36))
  y += fh(36) + 40

  rule(ctx, y); y += 6 + 40

  // --- Score-Zeilen ---
  const labelX = PAD_X
  const barX   = PAD_X + 280
  const barW   = 400
  const barH   = 24
  const scoreX = barX + barW + 20
  const medalX = W - PAD_X

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const baseY = y + fh(36)

    // Label
    ctx.textAlign = 'left'
    ctx.fillStyle = TEXT
    ctx.font = `400 36px ${SANS}`
    ctx.fillText(row.label, labelX, baseY)

    // Balken
    const barTop = baseY + 16
    ctx.fillStyle = BAR_EMPTY
    ctx.fillRect(barX, barTop, barW, barH)
    const filled = Math.round((row.total / (row.max || 1)) * barW)
    ctx.fillStyle = ACCENT
    ctx.fillRect(barX, barTop, filled, barH)

    // Punktzahl
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTED
    ctx.font = `400 30px ${SANS}`
    ctx.fillText(`${row.total}/${row.max}`, scoreX, baseY)

    // Medaille
    ctx.textAlign = 'right'
    ctx.font = '40px sans-serif'
    ctx.fillText(row.medal?.emoji ?? '', medalX, baseY)

    y += ROW_H + (i < rows.length - 1 ? ROW_GAP : 0)
  }

  y += 40
  rule(ctx, y); y += 6 + 40

  // Streak
  if (streak > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = TEXT
    ctx.font = `400 40px ${SANS}`
    ctx.fillText(`🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge`, W / 2, y + fh(40))
    y += 40 + fh(40)
  }

  // Ornament
  ctx.textAlign = 'center'
  ctx.fillStyle = BORDER_C
  ctx.font = `italic 44px ${SERIF}`
  ctx.fillText('· · ·', W / 2, y + fh(44))

  // URL – fest 80px über dem unteren Rand
  ctx.fillStyle = MUTED
  ctx.font = `400 32px ${SANS}`
  ctx.fillText('signifikation.de', W / 2, H - BORDER_H - 48)

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
        }
      }

      // Fallback: PNG herunterladen
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
