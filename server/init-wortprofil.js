import { execSync } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import logger from './logger.js'

const IS_RAILWAY = !!process.env.RAILWAY_PROJECT_ID
const DB_PATH = '/app/server/data/wortprofil.db'
const GZ_PATH = '/app/server/data/wortprofil.db.gz'

/**
 * Stellt sicher, dass wortprofil.db auf Railway existiert.
 * Wenn nicht vorhanden: lädt von GitHub herunter und entpackt.
 */
export async function ensureWortprofilDb() {
  // Nur auf Railway notwendig
  if (!IS_RAILWAY) return

  // Wenn DB bereits existiert, alles ok
  if (existsSync(DB_PATH)) {
    logger.info('wortprofil.db existiert, kein Download nötig')
    return
  }

  logger.info('wortprofil.db nicht gefunden, lade von GitHub Release herunter...')
  try {
    // Download der .gz-Datei von GitHub Releases
    const downloadUrl = 'https://github.com/joschamoritz/signifikation/releases/download/v1.0-wortprofil/wortprofil.db.gz'

    // Mit curl oder wget herunterladen
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${GZ_PATH}'"`, {
        stdio: 'inherit',
      })
    } else {
      execSync(`curl -L -o ${GZ_PATH} ${downloadUrl}`, { stdio: 'inherit' })
    }

    logger.info('Download abgeschlossen, entpacke...')

    // Entpacken mit gunzip
    if (process.platform === 'win32') {
      execSync(`powershell -Command "gzip -d '${GZ_PATH}'"`, { stdio: 'inherit' })
    } else {
      execSync(`gunzip ${GZ_PATH}`, { stdio: 'inherit' })
    }

    // Prüfen ob erfolgreich entpackt
    if (existsSync(DB_PATH)) {
      logger.info('✓ wortprofil.db erfolgreich installiert')
    } else {
      throw new Error('Entpacken fehlgeschlagen')
    }

    // Cleanup: .gz Datei löschen
    if (existsSync(GZ_PATH)) {
      unlinkSync(GZ_PATH)
    }
  } catch (err) {
    logger.error({ err }, 'Fehler beim wortprofil.db Download/Entpacken')
    // Nicht fatal – App startet trotzdem (Queries werden fehlen, aber Server läuft)
  }
}
