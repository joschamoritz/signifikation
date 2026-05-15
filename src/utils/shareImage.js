import { Capacitor } from '@capacitor/core'
import { WEEKDAYS, MONTHS } from './homeUtils'
import { getMedal } from './gameLogic'

const W        = 1080
const H        = 1920
const BORDER_H = 18
const PAD_X    = 96

const ACCENT    = '#9b1c1c'
const GOLD      = '#c9a84c'
const BG        = '#faf9f7'
const TEXT      = '#1a1510'
const MUTED     = '#8a8070'
const BAR_EMPTY = '#ddd8ce'
const SERIF = "'Gentium Plus', Georgia, serif"
const SANS  = "'DM Sans', system-ui, sans-serif"

// Pixel-saubere Doppellinie
function rule(ctx, y) {
  const x = PAD_X, w = W - PAD_X * 2
  const y1 = Math.round(y) + 0.5
  ctx.strokeStyle = GOLD
  ctx.lineWidth   = 1.5
  ctx.beginPath(); ctx.moveTo(x, y1);     ctx.lineTo(x + w, y1);     ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y1 + 8); ctx.lineTo(x + w, y1 + 8); ctx.stroke()
}

// Höhe eines content-Blocks berechnen für vertikale Zentrierung
function contentHeight(rows, streak) {
  const ROWS_H = rows.length > 0
    ? rows.length * 76 + (rows.length - 1) * 40
    : 0
  const STREAK_H = streak > 0 ? 40 + 32 : 0
  return (
    28 + 20 +   // Overline + Gap
    100 + 44 +  // Titel + Gap
    8 + 36 +    // Regel + Gap
    36 + 44 +   // Datum + Gap
    8 + 52 +    // Regel + Gap
    ROWS_H + (rows.length > 0 ? 40 : 0) + // Zeilen + Abschluss-Gap
    8 + 52 +    // Regel + Gap
    STREAK_H +  // Streak (opt.)
    44 + 60 +   // Ornament + Gap
    28          // URL
  )
}

export async function generateShareImage(playedGames, wzPlayed, streak, zwPlayed = null, lfPlayed = null) {
  await document.fonts.ready

  // Zeilen aufbauen
  const rows = []
  if (playedGames.length > 0) {
    const total = playedGames.reduce((s, g) => s + g.total, 0)
    const max   = playedGames.reduce((s, g) => s + (g.max ?? 10), 0)
    rows.push({ label: 'Kollokationen', total, max, medal: getMedal(total, max) })
  }
  if (wzPlayed) rows.push({ label: 'Wort-Zwilling', total: wzPlayed.total, max: wzPlayed.max ?? 10,  medal: wzPlayed.medal })
  if (zwPlayed) rows.push({ label: 'Zeitenwende',   total: zwPlayed.total, max: zwPlayed.max ?? 10,  medal: zwPlayed.medal })
  if (lfPlayed) rows.push({ label: 'Lückenfüller',  total: lfPlayed.total, max: lfPlayed.max ?? 10,  medal: lfPlayed.medal })

  // Startposition: Inhalt vertikal zentrieren
  const cH     = contentHeight(rows, streak)
  const usable = H - BORDER_H * 2
  const yStart = BORDER_H + Math.max(80, Math.round((usable - cH) / 2))

  // Canvas
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'alphabetic'

  // Hintergrund
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Roter Rand oben / unten
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W, BORDER_H)
  ctx.fillRect(0, H - BORDER_H, W, BORDER_H)

  let y = yStart

  // ── Overline ─────────────────────────────────────────────
  ctx.textAlign    = 'center'
  ctx.fillStyle    = MUTED
  ctx.font         = `400 26px ${SANS}`
  ctx.letterSpacing = '3px'
  ctx.fillText('TÄGLICHES WORTSPIEL · LINGUISTIK', W / 2, y + 26)
  ctx.letterSpacing = '0px'
  y += 26 + 20

  // ── Titel "SIGNIFIKATION" ─────────────────────────────────
  ctx.fillStyle = TEXT
  ctx.font      = `bold 100px ${SERIF}`
  ctx.letterSpacing = '4px'
  ctx.fillText('SIGNIFIKATION', W / 2, y + 100)
  ctx.letterSpacing = '0px'
  y += 100 + 44

  // ── Regel ────────────────────────────────────────────────
  rule(ctx, y); y += 8 + 36

  // ── Datum ────────────────────────────────────────────────
  const d = new Date()
  ctx.fillStyle = MUTED
  ctx.font      = `400 36px ${SANS}`
  ctx.fillText(
    `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    W / 2, y + 36
  )
  y += 36 + 44

  // ── Regel ────────────────────────────────────────────────
  rule(ctx, y); y += 8 + 52

  // ── Score-Zeilen ─────────────────────────────────────────
  const labelX = PAD_X
  const barX   = PAD_X + 280
  const barW   = 400
  const barH   = 22
  const scoreX = barX + barW + 20
  const medalX = W - PAD_X

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i]
    const midY = y + 38  // vertikale Mitte der Zeile

    // Label (Baseline ~12px unterhalb Mittellinie)
    ctx.textAlign = 'left'
    ctx.fillStyle = TEXT
    ctx.font      = `400 34px ${SANS}`
    ctx.fillText(row.label, labelX, midY + 12)

    // Balken (vertikal zentriert auf midY)
    const barTop = midY - Math.round(barH / 2)
    ctx.fillStyle = BAR_EMPTY
    ctx.fillRect(barX, barTop, barW, barH)
    const filled = Math.round((row.total / (row.max || 1)) * barW)
    ctx.fillStyle = ACCENT
    ctx.fillRect(barX, barTop, filled, barH)

    // Punktzahl
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTED
    ctx.font      = `400 28px ${SANS}`
    ctx.fillText(`${row.total}/${row.max}`, scoreX, midY + 10)

    // Medaille
    ctx.textAlign = 'right'
    ctx.font      = '36px sans-serif'
    ctx.fillText(row.medal?.emoji ?? '', medalX, midY + 12)

    y += 76 + (i < rows.length - 1 ? 40 : 0)
  }

  if (rows.length > 0) y += 40

  // ── Regel ────────────────────────────────────────────────
  rule(ctx, y); y += 8 + 52

  // ── Streak ───────────────────────────────────────────────
  if (streak > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = TEXT
    ctx.font      = `400 40px ${SANS}`
    ctx.fillText(`🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} am Stück`, W / 2, y + 40)
    y += 40 + 32
  }

  // ── Ornament ─────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD
  ctx.font      = `italic 44px ${SERIF}`
  ctx.fillText('· · ·', W / 2, y + 44)
  y += 44 + 60

  // ── URL ──────────────────────────────────────────────────
  ctx.fillStyle = MUTED
  ctx.font      = `400 28px ${SANS}`
  ctx.fillText('signifikation.de', W / 2, y + 28)

  return canvas
}

export async function shareAsImage(playedGames, wzPlayed, streak, zwPlayed = null, lfPlayed = null) {
  const canvas = await generateShareImage(playedGames, wzPlayed, streak, zwPlayed, lfPlayed)

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Bild konnte nicht erstellt werden')); return }

      // Nativer Share-Sheet via Capacitor (iOS/Android)
      if (Capacitor.isNativePlatform()) {
        try {
          const { Share } = await import('@capacitor/share')
          const { Filesystem, Directory } = await import('@capacitor/filesystem')

          const reader = new FileReader()
          const base64 = await new Promise((res, rej) => {
            reader.onload  = () => res(reader.result.split(',')[1])
            reader.onerror = rej
            reader.readAsDataURL(blob)
          })

          const saved = await Filesystem.writeFile({
            path: `signifikation_${Date.now()}.png`,
            data: base64,
            directory: Directory.Cache,
          })

          await Share.share({ title: 'Signifikation', files: [saved.uri] })
          resolve('shared')
        } catch (e) {
          if (e?.name === 'AbortError' || e?.message?.includes('cancel')) {
            resolve('cancelled')
          } else {
            reject(e)
          }
        }
        return
      }

      // Web: native Share API
      const file = new File([blob], 'signifikation.png', { type: 'image/png' })
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
