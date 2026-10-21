/**
 * shared/socialCards.js
 *
 * Zeichenlogik der Social Cards – die SINGLE SOURCE für beide Seiten:
 *   - Admin-Editor (server/social-cards.html) lädt die Datei per dynamic import
 *     über GET /admin/social-cards/karten.js
 *   - Server-Renderer (server/socialCards/render.js) spielt sie in eine
 *     Playwright-Seite ein und zeichnet dort dieselben Karten
 *
 * Keine DOM-Zugriffe und keine Node-Imports: Alles, was eine Karte braucht,
 * steht in der `spec` (siehe drawCard). Zufall gibt es hier nicht – die
 * Reihenfolge der Antwortoptionen und Chips legt der Aufrufer fest, damit
 * Rätsel- und Auflösungskarte dieselbe Reihenfolge zeigen.
 */

export const SANS  = "'DM Sans', system-ui, sans-serif"
export const SERIF = "'Gentium Plus', Georgia, serif"
const PAD = 96, BORDER = 18

export const THEMES = {
  hell: {
    BG: '#faf9f7',  TEXT_COL: '#1a1510',  MUTED_COL: '#8a8070',
    ACCENT: '#9b1c1c',  GOLD: '#c9a84c',
    BADGE_BG: '#ede8e0',  SEP_COL: '#e4ddd4',  POLL_COL: '#c8c0b4',
    CORPUS_BG: '#2a2218',  CORPUS_TEXT: '#c8c0b4',  CHIP_SEP: '#ddd8ce',
    BORDER_STRIPE: '#9b1c1c',
  },
  dunkel: {
    BG: '#1a1510',  TEXT_COL: '#f0ebe4',  MUTED_COL: '#8a8070',
    ACCENT: '#9b1c1c',  GOLD: '#c9a84c',
    BADGE_BG: '#2a2018',  SEP_COL: '#3a3028',  POLL_COL: '#8a8070',
    CORPUS_BG: '#0d0b08',  CORPUS_TEXT: '#8a8070',  CHIP_SEP: '#3a3028',
    BORDER_STRIPE: '#9b1c1c',
  },
  rot: {
    BG: '#9b1c1c',  TEXT_COL: '#faf9f7',  MUTED_COL: '#e8d5c4',
    ACCENT: '#c9a84c',  GOLD: '#c9a84c',
    BADGE_BG: '#7a1515',  SEP_COL: '#7a1515',  POLL_COL: '#e8d5c4',
    CORPUS_BG: '#5a0f0f',  CORPUS_TEXT: '#e8d5c4',  CHIP_SEP: '#7a1515',
    BORDER_STRIPE: '#1a1510',
  },
}

// Alle Schnitte, die die Karten benutzen. Canvas lädt Webfonts nicht von
// selbst nach – wer zeichnet, wartet vorher auf document.fonts.load() für jeden
// Eintrag (siehe loadCardFonts).
export const CARD_FONTS = [
  `400 26px ${SANS}`, `600 24px ${SANS}`,
  `400 38px ${SERIF}`, `bold 100px ${SERIF}`, `italic 36px ${SERIF}`,
]

/** Wartet, bis alle Kartenschriften geladen sind (Browser und Playwright-Seite). */
export async function loadCardFonts(fontFaceSet) {
  await Promise.all(CARD_FONTS.map((f) => fontFaceSet.load(f, 'ÄÖÜäöüß')))
  await fontFaceSet.ready
}

export function cardDims(ratio) {
  return ratio === '9:16' ? { W: 1080, H: 1920 } : { W: 1080, H: 1350 }
}

// ── Helfer ────────────────────────────────────────────────────────────────────
function drawRule(ctx, t, y, W) {
  const x1 = PAD, x2 = W - PAD
  ctx.strokeStyle = t.GOLD; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x1, Math.round(y)+.5); ctx.lineTo(x2, Math.round(y)+.5); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x1, Math.round(y)+8.5); ctx.lineTo(x2, Math.round(y)+8.5); ctx.stroke()
}

function wrapLines(ctx, text, maxW) {
  if (!text) return []
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word }
    else line = test
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r)
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r)
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r)
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r)
  ctx.closePath()
}

function drawOptions(ctx, t, W, y, opts) {
  const optRowH = 72, optGap = 12
  opts.forEach((opt, i) => {
    const ry = y + i * (optRowH + optGap)
    const midY = ry + optRowH / 2
    if (i > 0) {
      ctx.strokeStyle = t.SEP_COL; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD, ry - 1); ctx.lineTo(W-PAD, ry - 1); ctx.stroke()
    }
    const badgeR = 22, badgeX = PAD + badgeR
    ctx.fillStyle = t.BADGE_BG
    ctx.beginPath(); ctx.arc(badgeX, midY, badgeR, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = t.TEXT_COL; ctx.font = `600 24px ${SANS}`; ctx.textAlign = 'center'
    ctx.fillText('ABC'[i], badgeX, midY + 9)
    ctx.textAlign = 'left'; ctx.fillStyle = t.TEXT_COL; ctx.font = `400 38px ${SERIF}`
    ctx.fillText(opt.text || '–', PAD + badgeR*2 + 20, midY + 14)
    ctx.strokeStyle = t.POLL_COL; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(W - PAD - 20, midY, 18, 0, Math.PI*2); ctx.stroke()
  })
  return y + opts.length * (optRowH + optGap) - optGap
}

// ── Kopf / Fuß ────────────────────────────────────────────────────────────────
const HEADER_H = (26+24) + (100+44) + (8+36) + (36+44) + (8+52)
const FOOTER_H = (8+52) + (44+48) + 28
const WDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const MONS  = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function drawHeader(ctx, t, W, yStart, datumStr) {
  let y = yStart
  ctx.textAlign = 'center'; ctx.fillStyle = t.MUTED_COL; ctx.font = `400 26px ${SANS}`; ctx.letterSpacing = '3px'
  ctx.fillText('TÄGLICHES WORTSPIEL · LINGUISTIK', W/2, y+26); ctx.letterSpacing = '0px'; y += 26+24
  ctx.fillStyle = t.TEXT_COL; ctx.font = `bold 100px ${SERIF}`; ctx.letterSpacing = '4px'
  ctx.fillText('SIGNIFIKATION', W/2, y+100); ctx.letterSpacing = '0px'; y += 100+44
  drawRule(ctx, t, y, W); y += 8+36
  let d
  if (datumStr) {
    const [yr, mo, dy] = datumStr.split('-').map(Number)
    d = new Date(yr, mo - 1, dy)
  } else {
    d = new Date()
  }
  ctx.fillStyle = t.MUTED_COL; ctx.font = `400 36px ${SANS}`
  ctx.fillText(`${WDAYS[d.getDay()]}, ${d.getDate()}. ${MONS[d.getMonth()]} ${d.getFullYear()}`, W/2, y+36)
  y += 36+44; drawRule(ctx, t, y, W); y += 8+52
  return y
}

function drawFooter(ctx, t, W, y) {
  drawRule(ctx, t, y, W); y += 8+52
  ctx.textAlign = 'center'; ctx.fillStyle = t.GOLD; ctx.font = `italic 44px ${SERIF}`
  ctx.fillText('· · ·', W/2, y+44); y += 44+48
  ctx.fillStyle = t.MUTED_COL; ctx.font = `400 28px ${SANS}`
  ctx.fillText('signifikation.de', W/2, y+28)
}

// ── Format A – Rätsel ─────────────────────────────────────────────────────────
function contentHeightA() {
  return 180+48 + 28+32 + 3*(72+12)
}

function drawFormatA(ctx, t, W, y, data, reveal) {
  const { lemma, pos, ipa, options = [] } = data

  const boxW = W - PAD*2, boxH = 180, boxR = 12
  ctx.strokeStyle = t.ACCENT; ctx.lineWidth = 3
  roundRect(ctx, PAD, y, boxW, boxH, boxR); ctx.stroke()
  ctx.fillStyle = t.MUTED_COL; ctx.font = `400 22px ${SANS}`; ctx.letterSpacing = '2px'; ctx.textAlign = 'center'
  ctx.fillText((pos || 'Substantiv').toUpperCase(), W/2, y+34); ctx.letterSpacing = '0px'
  ctx.fillStyle = t.TEXT_COL
  const lemmaSize = (lemma||'').length > 14 ? 52 : (lemma||'').length > 10 ? 64 : 76
  ctx.font = `bold ${lemmaSize}px ${SERIF}`
  ctx.fillText(lemma || 'LEMMA', W/2, y + boxH/2 + lemmaSize*0.36)
  if (ipa) {
    ctx.fillStyle = t.MUTED_COL; ctx.font = `400 24px ${SANS}`
    ctx.fillText(`[${ipa}]`, W/2, y + boxH - 20)
  }
  y += boxH + 48

  ctx.textAlign = 'center'; ctx.fillStyle = t.MUTED_COL; ctx.font = `400 28px ${SANS}`
  ctx.fillText('Typische Kollokation im Deutschen', W/2, y+28); y += 28+32

  if (!reveal) return drawOptions(ctx, t, W, y, options)

  const optRowH = 72, optGap = 12
  options.forEach((opt, i) => {
    const ry = y + i * (optRowH + optGap)
    const midY = ry + optRowH / 2
    if (i > 0) {
      ctx.strokeStyle = t.SEP_COL; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD, ry-1); ctx.lineTo(W-PAD, ry-1); ctx.stroke()
    }
    ctx.globalAlpha = opt.correct ? 1 : 0.28
    const badgeR = 22, badgeX = PAD + badgeR
    ctx.fillStyle = opt.correct ? t.ACCENT : t.BADGE_BG
    ctx.beginPath(); ctx.arc(badgeX, midY, badgeR, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = opt.correct ? '#fff' : t.TEXT_COL
    ctx.font = `600 24px ${SANS}`; ctx.textAlign = 'center'
    ctx.fillText('ABC'[i], badgeX, midY+9)
    ctx.textAlign = 'left'
    ctx.fillStyle = opt.correct ? t.ACCENT : t.TEXT_COL
    ctx.font = opt.correct ? `bold 40px ${SERIF}` : `400 38px ${SERIF}`
    ctx.fillText(opt.text || '–', PAD + badgeR*2 + 20, midY+14)
    const pollX = W - PAD - 20
    if (opt.correct) {
      ctx.fillStyle = t.ACCENT
      ctx.beginPath(); ctx.arc(pollX, midY, 20, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `600 26px ${SANS}`; ctx.textAlign = 'center'
      ctx.fillText('✓', pollX, midY+9)
    } else {
      ctx.strokeStyle = t.POLL_COL; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(pollX, midY, 18, 0, Math.PI*2); ctx.stroke()
    }
    ctx.globalAlpha = 1
  })
  return y + options.length * (optRowH + optGap) - optGap
}

// ── Format B – Beleg ──────────────────────────────────────────────────────────
function contentHeightB(quoteText, W, showOpts) {
  const approxCharsPerLine = Math.floor((W - PAD*2 - 32) / 22)
  const estLines = Math.ceil((quoteText||'').length / approxCharsPerLine) + 1
  const quoteH = 40 + estLines * 54 + 32
  const badgeH = 44 + 32
  const qH = 34
  const optsH = showOpts ? 32 + 3*(72+12) : 0
  return quoteH + 32 + badgeH + qH + optsH
}

function drawFormatB(ctx, t, W, y, data, reveal) {
  const { quoteText, quelle, showOptions, options = [], collocate } = data

  // Auflösung: die Lücke bekommt das gesuchte Wort zurück
  const displayText = reveal
    ? (quoteText || '—').replace(/______/g, collocate || '?')
    : (quoteText || '—')

  const textX = PAD + 32, maxW = W - PAD*2 - 32
  ctx.font = `italic 36px ${SERIF}`
  const lines = wrapLines(ctx, displayText, maxW)
  const blockH = lines.length * 54 + 32
  ctx.fillStyle = t.ACCENT; ctx.fillRect(PAD, y, 4, blockH)
  ctx.fillStyle = t.TEXT_COL; ctx.textAlign = 'left'
  lines.forEach((line, i) => ctx.fillText(line, textX, y + 42 + i * 54))
  y += blockH

  ctx.fillStyle = t.MUTED_COL; ctx.font = `italic 28px ${SANS}`
  ctx.fillText('[Hervorh. d. Red.]', textX, y + 32); y += 32 + 24

  // Korpus-Badge – bricht bei langen Quellenangaben um
  const badgeTxt = quelle || 'Korpus CC BY-SA'
  ctx.font = `400 24px ${SANS}`
  const badgeMaxW = W - PAD*2
  const badgeLines = wrapLines(ctx, badgeTxt, badgeMaxW - 40)
  const badgeLineH = 34, badgePadV = 14
  const badgeH = badgeLines.length * badgeLineH + badgePadV * 2
  const badgeR = badgeLines.length > 1 ? 8 : badgeH / 2
  ctx.fillStyle = t.CORPUS_BG
  roundRect(ctx, PAD, y, badgeMaxW, badgeH, badgeR); ctx.fill()
  ctx.fillStyle = t.CORPUS_TEXT; ctx.textAlign = 'left'
  badgeLines.forEach((l, i) => ctx.fillText(l, PAD + 20, y + badgePadV + badgeLineH * (i + 0.85)))
  y += badgeH + 32

  if (reveal) {
    ctx.textAlign = 'center'
    ctx.fillStyle = t.MUTED_COL; ctx.font = `400 30px ${SANS}`
    ctx.fillText('Das gesuchte Wort', W/2, y+30); y += 30 + 16
    ctx.fillStyle = t.ACCENT; ctx.font = `bold 72px ${SERIF}`; ctx.letterSpacing = '2px'
    ctx.fillText(collocate || '—', W/2, y+72); ctx.letterSpacing = '0px'; y += 72
  } else {
    ctx.textAlign = 'center'; ctx.fillStyle = t.MUTED_COL; ctx.font = `400 34px ${SANS}`
    ctx.fillText('Welches Wort fehlt im Zitat?', W/2, y+34); y += 34
    if (showOptions) {
      y += 32
      y = drawOptions(ctx, t, W, y, options)
    }
  }

  return y
}

// ── Format C – Wort-Zwilling ──────────────────────────────────────────────────
function contentHeightC() {
  return 120 + 40 + 12 + 60 + 32 + 38
}

function drawFormatC(ctx, t, W, y, data, reveal) {
  const { wortA, wortB, chips = [] } = data
  const col = Math.floor((W - PAD*2 - 60) / 2)
  const boxH = 120, boxR = 10, boxY = y

  ctx.strokeStyle = t.ACCENT; ctx.lineWidth = 2.5
  roundRect(ctx, PAD, boxY, col, boxH, boxR); ctx.stroke()
  ctx.textAlign = 'center'; ctx.fillStyle = t.TEXT_COL
  const sA = (wortA||'').length > 10 ? 42 : 52; ctx.font = `bold ${sA}px ${SERIF}`
  ctx.fillText(wortA || 'Wort A', PAD + col/2, boxY + boxH/2 + sA*0.36)

  ctx.fillStyle = t.GOLD; ctx.font = `400 40px ${SANS}`
  ctx.fillText('◆', PAD + col + 30, boxY + boxH/2 + 14)

  const boxBX = PAD + col + 60
  ctx.strokeStyle = t.ACCENT; ctx.lineWidth = 2.5
  roundRect(ctx, boxBX, boxY, col, boxH, boxR); ctx.stroke()
  ctx.fillStyle = t.TEXT_COL
  const sB = (wortB||'').length > 10 ? 42 : 52; ctx.font = `bold ${sB}px ${SERIF}`
  ctx.fillText(wortB || 'Wort B', boxBX + col/2, boxY + boxH/2 + sB*0.36)

  y += boxH + 40
  ctx.strokeStyle = t.CHIP_SEP; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W-PAD, y); ctx.stroke(); y += 12

  // Chips: Rätsel = Reihenfolge wie übergeben (Aufrufer mischt), Auflösung = nach Wort gruppiert
  const shown = reveal
    ? [...chips.filter(c => c.owner === 'A'), ...chips.filter(c => c.owner !== 'A')]
    : chips

  ctx.font = `400 30px ${SANS}`
  const chipH = 52, chipPadX = 28, chipGap = 16
  const rows = [[]]
  let rowW = 0
  const maxRowW = W - PAD*2
  for (const chip of shown) {
    const cw = ctx.measureText(chip.w).width + chipPadX*2
    if (rowW + cw + (rows[rows.length-1].length > 0 ? chipGap : 0) > maxRowW && rows[rows.length-1].length > 0) {
      rows.push([chip]); rowW = cw
    } else {
      rows[rows.length-1].push(chip); rowW += cw + (rows[rows.length-1].length > 1 ? chipGap : 0)
    }
  }
  rows.forEach(row => {
    const totalW = row.reduce((s,c) => s + ctx.measureText(c.w).width + chipPadX*2, 0) + chipGap*(row.length-1)
    let cx = (W - totalW) / 2
    row.forEach(chip => {
      const cw = ctx.measureText(chip.w).width + chipPadX*2
      ctx.fillStyle = reveal ? (chip.owner === 'A' ? t.ACCENT : t.GOLD) : t.BADGE_BG
      roundRect(ctx, cx, y, cw, chipH, chipH/2); ctx.fill()
      ctx.fillStyle = reveal ? '#fff' : t.TEXT_COL
      ctx.textAlign = 'center'; ctx.fillText(chip.w, cx+cw/2, y+chipH/2+11)
      cx += cw + chipGap
    })
    y += chipH + 10
  })
  y += 22

  ctx.font = `400 34px ${SANS}`
  if (reveal) {
    // Legende: ■ Wort A  ·  ■ Wort B
    const legY = y + 34
    const sqW   = ctx.measureText('■').width
    const txtAW = ctx.measureText(wortA || 'Wort A').width
    const txtBW = ctx.measureText(wortB || 'Wort B').width
    const gap = 10, sep = 48
    const totalW = sqW + gap + txtAW + sep + sqW + gap + txtBW
    let lx = (W - totalW) / 2
    ctx.textAlign = 'left'
    ctx.fillStyle = t.ACCENT;   ctx.fillText('■', lx, legY); lx += sqW + gap
    ctx.fillStyle = t.TEXT_COL; ctx.fillText(wortA || 'Wort A', lx, legY); lx += txtAW + sep
    ctx.fillStyle = t.GOLD;     ctx.fillText('■', lx, legY); lx += sqW + gap
    ctx.fillStyle = t.TEXT_COL; ctx.fillText(wortB || 'Wort B', lx, legY)
  } else {
    ctx.fillStyle = t.MUTED_COL; ctx.textAlign = 'center'
    ctx.fillText('Ordne die Kollokationen den Wörtern zu.', W/2, y+34)
  }
  y += 34
  return y
}

// ── Format X – Info / Zitat ───────────────────────────────────────────────────
function contentHeightX(headline, body, subtype) {
  if (subtype === 'Zitat') {
    const estLines = Math.ceil((body||'').length / 38) + 1
    return 40+40 + 130 + estLines*58 + 40 + 60 + 40
  }
  const estH = Math.ceil((headline||'').length / 25) + 1
  const estB = Math.ceil((body||'').length / 45) + 1
  return 50+32 + estH*80 + 32 + estB*52
}

function drawPill(ctx, t, W, y, text) {
  ctx.font = `600 22px ${SANS}`
  const pillW = ctx.measureText(text).width + 40
  ctx.fillStyle = t.ACCENT; roundRect(ctx, (W-pillW)/2, y, pillW, 40, 20); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.letterSpacing = '2px'
  ctx.fillText(text, W/2, y+27); ctx.letterSpacing = '0px'
}

function drawFormatX(ctx, t, W, y, data) {
  const { subtype, xLemma, headline, body } = data

  if (subtype === 'Zitat') {
    drawPill(ctx, t, W, y, 'ZITAT'); y += 40+40

    ctx.fillStyle = t.ACCENT; ctx.font = `bold 130px ${SERIF}`; ctx.textAlign = 'left'
    ctx.fillText('„', PAD, y+90); y += 40

    const lineX = PAD + 14
    const textX = lineX + 26
    const textW = W - textX - PAD
    ctx.font = `italic 42px ${SERIF}`; ctx.fillStyle = t.TEXT_COL; ctx.textAlign = 'left'
    const qLines = wrapLines(ctx, body || '—', textW)
    const quoteH = qLines.length * 58
    ctx.strokeStyle = t.ACCENT; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(lineX, y); ctx.lineTo(lineX, y + quoteH); ctx.stroke()
    qLines.forEach((l, i) => ctx.fillText(l, textX, y + 42 + i * 58))
    y += quoteH + 40

    if (headline) {
      // Lange Quellenangaben (Dokument · Korpus · Lizenz) umbrechen statt überlaufen
      ctx.fillStyle = t.MUTED_COL; ctx.font = `400 28px ${SANS}`; ctx.textAlign = 'right'
      const sLines = wrapLines(ctx, '— ' + headline, W - PAD*2)
      sLines.forEach((l, i) => ctx.fillText(l, W - PAD, y + 28 + i * 38))
      y += sLines.length * 38 + 18
    }

    if (xLemma) {
      ctx.fillStyle = t.MUTED_COL; ctx.font = `italic 30px ${SERIF}`; ctx.textAlign = 'center'
      ctx.fillText(xLemma, W/2, y + 30); y += 30
    }
    return y
  }

  drawPill(ctx, t, W, y, (subtype || 'WORTGESCHICHTE').toUpperCase()); y += 40+32

  if (xLemma) {
    ctx.fillStyle = t.TEXT_COL; ctx.font = `bold 80px ${SERIF}`; ctx.textAlign = 'center'
    ctx.fillText(xLemma, W/2, y+80); y += 80+28
    ctx.strokeStyle = t.ACCENT; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(PAD, y+.5); ctx.lineTo(W-PAD, y+.5); ctx.stroke(); y += 1+32
  }

  if (headline) {
    ctx.fillStyle = t.TEXT_COL; ctx.font = `italic 48px ${SERIF}`; ctx.textAlign = 'center'
    const hL = wrapLines(ctx, headline, W-PAD*2)
    hL.forEach((l,i) => ctx.fillText(l, W/2, y+48+i*60)); y += hL.length*60+24
  }

  if (body) {
    ctx.fillStyle = t.TEXT_COL; ctx.font = `400 36px ${SANS}`; ctx.textAlign = 'center'
    const bL = wrapLines(ctx, body, W-PAD*2)
    bL.forEach((l,i) => ctx.fillText(l, W/2, y+36+i*50)); y += bL.length*50
  }

  return y
}

// ── Format T – Teaser ─────────────────────────────────────────────────────────
function contentHeightT() {
  return 26 + 32 + 3 * 124 + 2 * 24
}

function drawFormatT(ctx, t, W, y, data) {
  ctx.textAlign = 'center'; ctx.fillStyle = t.MUTED_COL
  ctx.font = `400 26px ${SANS}`; ctx.letterSpacing = '3px'
  ctx.fillText('HEUTE IM SPIEL', W/2, y + 26)
  ctx.letterSpacing = '0px'; y += 26 + 32

  const rowH = 124, rowGap = 24
  const entries = (data.lemmata || []).slice(0, 3)

  entries.forEach((l, i) => {
    if (i > 0) {
      ctx.strokeStyle = t.SEP_COL; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD, y - rowGap/2 + 0.5); ctx.lineTo(W - PAD, y - rowGap/2 + 0.5); ctx.stroke()
    }

    const midY = y + rowH / 2

    const circR = 28, circX = PAD + circR
    ctx.fillStyle = t.ACCENT
    ctx.beginPath(); ctx.arc(circX, midY, circR, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = t.BG; ctx.font = `600 28px ${SANS}`; ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), circX, midY + 10)

    const textX = PAD + circR * 2 + 28
    const lemmaStr = l.lemma || '—'
    const lemmaSize = lemmaStr.length > 14 ? 52 : lemmaStr.length > 10 ? 64 : 74
    ctx.textAlign = 'left'; ctx.fillStyle = t.TEXT_COL
    ctx.font = `700 ${lemmaSize}px ${SERIF}`
    ctx.fillText(lemmaStr, textX, midY + 10)

    ctx.fillStyle = t.MUTED_COL; ctx.font = `400 24px ${SANS}`; ctx.letterSpacing = '1px'
    ctx.fillText((l.pos || '').toUpperCase(), textX, midY + 10 + 34)
    ctx.letterSpacing = '0px'

    y += rowH + rowGap
  })

  return y - rowGap
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────
/**
 * Zeichnet eine Karte auf einen Canvas, dessen Größe der Aufrufer schon auf
 * cardDims(spec.ratio) gesetzt hat.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec
 *   format: 'A' | 'B' | 'C' | 'X' | 'T'
 *   theme:  'hell' | 'dunkel' | 'rot'   (Standard: hell)
 *   ratio:  '4:5' | '9:16'               (Standard: 4:5)
 *   header: boolean                       (Kopf mit SIGNIFIKATION + Datum, Standard: true)
 *   reveal: boolean                       (Auflösung, nur A/B/C)
 *   datum:  'YYYY-MM-DD'                  (Datum im Kopf)
 *   data:   je Format
 *     A: { lemma, pos, ipa, options: [{ text, correct }] }      – Reihenfolge = A/B/C
 *     B: { quoteText, quelle, collocate, showOptions, options }  – Lücke als „______“
 *     C: { wortA, wortB, chips: [{ w, owner: 'A' | 'B' }] }
 *     X: { subtype, xLemma, headline, body }
 *     T: { lemmata: [{ lemma, pos }] }
 */
export function drawCard(ctx, spec) {
  const t = THEMES[spec.theme] || THEMES.hell
  const { W, H } = cardDims(spec.ratio)
  const data = spec.data || {}
  const fmt = spec.format
  const reveal = !!spec.reveal
  const showHeader = spec.header !== false

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = t.BG; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = t.BORDER_STRIPE; ctx.fillRect(0, 0, W, BORDER); ctx.fillRect(0, H-BORDER, W, BORDER)

  let contentH = 400
  if (fmt === 'A') contentH = contentHeightA()
  else if (fmt === 'B') contentH = contentHeightB(data.quoteText, W, data.showOptions)
  else if (fmt === 'C') contentH = contentHeightC()
  else if (fmt === 'X') contentH = contentHeightX(data.headline, data.body, data.subtype)
  else if (fmt === 'T') contentH = contentHeightT()

  const effectiveHeaderH = showHeader ? HEADER_H : 0
  const yStart = BORDER + Math.max(60, Math.round((H - BORDER*2 - effectiveHeaderH - contentH - FOOTER_H) / 2))
  let y = showHeader ? drawHeader(ctx, t, W, yStart, spec.datum) : yStart

  if (fmt === 'A') y = drawFormatA(ctx, t, W, y, data, reveal)
  else if (fmt === 'B') y = drawFormatB(ctx, t, W, y, data, reveal)
  else if (fmt === 'C') y = drawFormatC(ctx, t, W, y, data, reveal)
  else if (fmt === 'X') y = drawFormatX(ctx, t, W, y, data)
  else if (fmt === 'T') y = drawFormatT(ctx, t, W, y, data)

  drawFooter(ctx, t, W, y + 40)
}

// ── Textposts (Bluesky) ───────────────────────────────────────────────────────
export const BLUESKY_MAX_ZEICHEN = 300

/** Zeichen, wie Bluesky sie zählt (Grapheme: „ä“ oder ein Emoji = 1). */
export function zeichenZahl(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0
    for (const _ of new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text || '')) n++
    return n
  }
  return [...(text || '')].length
}

// ── Belegtexte (Tokens aus fetchBelege: { w, ws, hl }) ────────────────────────
export function belegText(tokens) {
  let text = ''
  for (const t of tokens) {
    if (t.ws && text) text += ' '
    text += t.w
  }
  return text
}

// Token in Satzzeichen davor, Wort, Satzzeichen danach zerlegen
const zerlege = (w) => w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)

// Die Hervorhebung kommt aus der Lemma-Suche: „Weißen“ passt zum Kollokator „weiß“.
function istLuecke(t, colLow) {
  const wordLow = zerlege(t.w)[2].toLowerCase()
  return t.hl && (wordLow === colLow || wordLow.startsWith(colLow))
}

/**
 * Belegsatz mit „______“ an der Stelle des hervorgehobenen Kollokators.
 * Satzzeichen am Token („hoch.“) bleiben stehen, nur das Wort wird zur Lücke.
 */
export function belegLueckentext(tokens, collocate) {
  const colLow = collocate.toLowerCase()
  let text = ''
  for (const t of tokens) {
    if (t.ws && text) text += ' '
    if (istLuecke(t, colLow)) {
      const [, vor, , nach] = zerlege(t.w)
      text += `${vor}______${nach}`
    } else text += t.w
  }
  return text
}

/** Die Wortform, die in der Lücke steht („Weißen“ statt der Grundform „weiß“). */
export function belegLueckenwort(tokens, collocate) {
  const t = tokens.find((tok) => istLuecke(tok, collocate.toLowerCase()))
  return t ? zerlege(t.w)[2] : collocate
}

// ── Captions & Hashtags ───────────────────────────────────────────────────────
export const HASHTAGS = {
  primary:    '#signifikation #deutschesprache #linguistik #wortgeschichte #sprachliebe',
  bildung:    '#deutschunterricht #daf #germanistik #sprachdidaktik #lehrkraefte',
  wortkultur: '#etymologie #sprachgeschichte #wortschatz #duden #korpuslinguistik',
  quiz:       '#sprachraetsel #quiz #kollokation #wortwissen #sprachtest',
  akademisch: '#dwds #sprachwissenschaft #semantik #pragmatik #textlinguistik',
}

export const POSTING_HINTS = {
  A: '<strong>Montag</strong> · 07:15 Uhr · Format A – Quiz',
  B: '<strong>Freitag</strong> · 17:00 Uhr · Format B – Beleg',
  C: '<strong>Freitag</strong> · 17:00 Uhr · Format C – Zwilling',
  X: '<strong>Mittwoch</strong> · 12:30 Uhr · Format X – Info',
  T: '<strong>Täglich</strong> · 06:45 Uhr · Format T – Teaser (vor dem Quiz)',
}

export const SUGGESTED_HASHTAG_SET = { A: 'quiz', B: 'bildung', C: 'quiz', X: 'wortkultur', T: 'primary' }

/** Hashtag-Zeilen eines Sets (immer mit den primären vorneweg). */
export function hashtagsFor(set) {
  return HASHTAGS.primary + '\n' + (set === 'primary' ? '' : (HASHTAGS[set] || ''))
}

const CAPTION_TEMPLATES = {
  A: [
    s => `*${s.lemma}* – und was kommt danach?\n\nDrei Möglichkeiten, eine passt. Welche?\n\nAuflösung morgen früh in der Story.`,
    s => `Manche Verbindungen klingen selbstverständlich – bis man sie hinterfragt.\n\n*${s.lemma}* + ?\n\nKommentiere deine Antwort, bevor du weiterscrollst.`,
    s => `Im heutigen Rätsel geht es um *${s.lemma}*.\n\nKannst du den häufigsten Kollokator nennen?\n\n${HASHTAGS.primary}\n${HASHTAGS.quiz}`,
  ],
  B: [
    s => `Aus einem echten Text – welches Wort fehlt?\n\n„${s.quote}“\n\nAuflösung morgen früh in der Story.`,
    s => `Echte Sprache ist oft präziser als Lehrbuchsprache.\n\n„${s.quote}“\n\nWelches Wort hat der Autor gewählt?`,
    s => `*${s.lemma}* in der Praxis – ein Beleg aus unserem Korpus.\n\n„${s.quote}“\n\nQuelle: ${s.source}\n\n${HASHTAGS.primary}\n${HASHTAGS.bildung}`,
  ],
  C: [
    s => `Zwei Wörter. Scheinbar ähnlich, tatsächlich verschieden.\n\n*${s.wortA}* und *${s.wortB}* – welche Kollokatoren gehören zu welchem?\n\nAuflösung: morgen.`,
    s => `Der Unterschied zwischen *${s.wortA}* und *${s.wortB}* ist subtil – aber er ist da.\n\nDie Kollokatoren verraten ihn. Kannst du sie zuordnen?`,
    s => `Ein klassischer Verwechslungsfall.\n\n*${s.wortA}* vs. *${s.wortB}* – für den Unterricht: Welche Beispiele würdest du wählen?\n\n${HASHTAGS.primary}\n${HASHTAGS.quiz}`,
  ],
  X: [
    s => `${s.headline}\n\n${s.body}`,
    s => `*${s.xLemma || 'Wort'}* – ${s.headline}\n\n${s.body}\n\nWas von der alten Bedeutung ist noch spürbar?`,
    s => `Aus der Sprachgeschichte:\n\n${s.body}\n\n${HASHTAGS.primary}\n${HASHTAGS.wortkultur}`,
  ],
  T: [
    s => {
      const namen = (s.lemmata || []).slice(0,3).map(l => `→ ${l.lemma}`).join('\n')
      return `Das Tagesrätsel ist online.\n\nHeute drei Wörter:\n${namen}\n\nWelche Kollokationen stecken dahinter?\nsignifikation.de`
    },
    s => {
      const namen = (s.lemmata || []).slice(0,3).map(l => l.lemma).join(', ')
      return `Heute spielen wir mit: ${namen}.\n\nDrei Wörter, vier Spiele, täglich neu.\n\n${HASHTAGS.primary}`
    },
  ],
}

/**
 * Caption aus Vorlage. `state` enthält die Platzhalter:
 * lemma, wortA, wortB, quote, source, xLemma, headline, body, lemmata.
 */
export function buildCaption(format, variant, state) {
  const templates = CAPTION_TEMPLATES[format] || CAPTION_TEMPLATES.X
  const fn = templates[Math.min(Math.max(0, variant | 0), templates.length - 1)]
  return fn(state)
}
