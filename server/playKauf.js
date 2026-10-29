/**
 * playKauf.js – Google Play Developer API für Einmalkäufe (Android)
 *
 * Zwei Aufrufe genügen: purchases.products.get (Kauf zum purchaseToken lesen)
 * und purchases.products.acknowledge (Kauf bestätigen – unbestätigte Käufe
 * erstattet Google nach drei Tagen von selbst).
 *
 * Konfiguration: PLAY_SERVICE_ACCOUNT_PATH zeigt auf die Schlüsseldatei des
 * Dienstkontos play-kauf@signifikation.iam.gserviceaccount.com. In der Play
 * Console braucht es für die App „Finanzdaten ansehen“ und „Bestellungen und
 * Abos verwalten“ (Einrichtung: OPS.md). Fehlt die Datei, bleibt die
 * Kaufprüfung aus und /iap/play/* antwortet mit 503.
 */
import { createAccessTokenSource, loadServiceAccount } from './google/dienstkonto.js'
import logger from './logger.js'

export const PLAY_PACKAGE_NAME = 'de.signifikation.app'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE_NAME}/purchases/products`

/** Google kennt den Kauf nicht (Token ungültig, fremde App, falsches Produkt). */
export class PlayKaufUnbekannt extends Error {}

/**
 * @returns {{ enabled: boolean, holeKauf: (productId: string, token: string) => Promise<object>,
 *             bestaetige: (productId: string, token: string) => Promise<void> }}
 */
export function createPlayApi(sa, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (!sa) {
    const aus = async () => { throw new Error('Play-Kaufprüfung nicht konfiguriert') }
    return { enabled: false, holeKauf: aus, bestaetige: aus }
  }
  const zugriff = createAccessTokenSource(sa, { scope: SCOPE, fetchImpl, timeoutMs, zweck: 'Play' })

  // Ein abgelaufenes Zugriffstoken (401) einmal erneuern und wiederholen
  async function rufe(url, init = {}) {
    for (let versuch = 0; ; versuch++) {
      const res = await fetchImpl(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${await zugriff.get()}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status === 401 && versuch === 0) { zugriff.invalidate(); continue }
      return res
    }
  }

  const pfad = (productId, token) => `${API}/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`

  async function holeKauf(productId, token) {
    const res = await rufe(pfad(productId, token))
    if (res.ok) return res.json()
    // 400/404/410: Token passt nicht zu App und Produkt – endgültig, kein Serverfehler
    if ([400, 404, 410].includes(res.status)) throw new PlayKaufUnbekannt(`Play: HTTP ${res.status}`)
    const body = await res.json().catch(() => null)
    throw new Error(`Play purchases.products.get: HTTP ${res.status} ${body?.error?.status ?? ''}`.trim())
  }

  async function bestaetige(productId, token) {
    const res = await rufe(`${pfad(productId, token)}:acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (res.ok) return
    const body = await res.json().catch(() => null)
    throw new Error(`Play purchases.products.acknowledge: HTTP ${res.status} ${body?.error?.status ?? ''}`.trim())
  }

  return { enabled: true, holeKauf, bestaetige }
}

const playApi = createPlayApi(loadServiceAccount(process.env.PLAY_SERVICE_ACCOUNT_PATH?.trim(), logger, 'Play-Kaufprüfung'))

if (playApi.enabled) logger.info('Play-Dienstkonto geladen – Kaufprüfung für Android aktiv')
else logger.warn('PLAY_SERVICE_ACCOUNT_PATH nicht gesetzt oder unlesbar – Kauf auf Android deaktiviert')

export default playApi
