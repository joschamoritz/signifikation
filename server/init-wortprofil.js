import { createWriteStream, existsSync, unlinkSync, statSync } from 'fs'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { dirname } from 'path'
import { mkdirSync } from 'fs'
import logger from './logger.js'

// Auto-Download nur, wo er gebraucht wird: Railway-Legacy oder explizit per
// WORTPROFIL_AUTODOWNLOAD=1. Auf dem Hetzner-Setup liegt die DB im Deploy.
const IS_RAILWAY = !!process.env.RAILWAY_PROJECT_ID
const AUTODOWNLOAD = IS_RAILWAY || process.env.WORTPROFIL_AUTODOWNLOAD === '1'

// Pfade aus Env statt hartkodiert /app/... (Railway-Altlast, B-M4).
const DB_PATH = process.env.WORTPROFIL_DB_PATH || '/app/server/data/wortprofil.db'
const GZ_PATH = `${DB_PATH}.gz`
const DOWNLOAD_URL = process.env.WORTPROFIL_DOWNLOAD_URL
  || 'https://github.com/joschamoritz/signifikation/releases/download/v1.0-wortprofil/wortprofil.db.gz'

/**
 * Stellt sicher, dass wortprofil.db existiert (Auto-Download-Setups).
 *
 * Vollstaendig async (fetch + Stream-Gunzip): die fruehere
 * execSync(curl/gunzip)-Variante blockierte den Event-Loop — der
 * 130-s-Promise.race-Timeout in index.js konnte waehrend des Blocks gar
 * nicht feuern und gunzip einer 2-GB-Datei war unbegrenzt blockierend.
 */
export async function ensureWortprofilDb() {
  if (!AUTODOWNLOAD) return

  if (existsSync(DB_PATH)) {
    const stats = statSync(DB_PATH)
    // Wenn Datei > 100MB, nehmen wir an sie ist gültig
    if (stats.size > 100_000_000) {
      logger.info('wortprofil.db existiert und ist gültig, kein Download nötig')
      return
    }
    logger.warn('wortprofil.db existiert aber ist zu klein oder korrupt, lösche...')
    unlinkSync(DB_PATH)
  }

  logger.info({ url: DOWNLOAD_URL }, 'wortprofil.db nicht gefunden, lade herunter...')
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true })

    const res = await fetch(DOWNLOAD_URL, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok || !res.body) {
      throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`)
    }

    // Direkt streamend entpacken: Download → gunzip → Datei,
    // ohne die .gz zwischenzuspeichern und ohne den Event-Loop zu blockieren.
    await pipeline(
      Readable.fromWeb(res.body),
      createGunzip(),
      createWriteStream(DB_PATH)
    )

    if (!existsSync(DB_PATH) || statSync(DB_PATH).size === 0) {
      throw new Error('Entpacken fehlgeschlagen (leere Zieldatei)')
    }
    logger.info('✓ wortprofil.db erfolgreich installiert')
  } catch (err) {
    logger.error({ err }, 'Fehler beim wortprofil.db Download/Entpacken')
    // Aufraeumen, damit der naechste Versuch sauber startet
    for (const f of [GZ_PATH, DB_PATH]) {
      try { if (existsSync(f)) unlinkSync(f) } catch { /* best effort */ }
    }
    // Nicht fatal – App startet trotzdem (Queries werden fehlen, aber Server läuft)
  }
}
