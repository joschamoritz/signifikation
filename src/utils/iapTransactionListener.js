import { Capacitor } from '@capacitor/core'
import { API } from '../config'
import { IAP } from '../plugins/iap.js'
import { apiFetch } from './apiFetch'
import { logError } from './logError'

const IS_NATIVE = Capacitor.isNativePlatform()

/**
 * Ereignis, das nach einer erfolgreichen Freischaltung gefeuert wird. Die
 * Konto-Ansicht laedt daraufhin die Sitzung neu, damit der Premium-Status
 * sofort sichtbar wird.
 */
export const ENTITLEMENTS_CHANGED_EVENT = 'signifikation:entitlements-changed'

let started = false

/**
 * Registriert den StoreKit-`transactionUpdate`-Listener EINMAL beim App-Start.
 *
 * Vorher hing der Listener am Konto-Tab, der erst beim ersten Besuch lazy
 * geladen wird. `Transaction.updates` emittiert unfertige Transaktionen aber
 * direkt beim Kaltstart, und `notifyListeners` verwirft Ereignisse ohne
 * registrierten Empfaenger. Damit gingen genau die Faelle verloren, fuer die
 * der Listener existiert:
 *
 *   - Ask-to-Buy / Familienfreigabe: Eltern geben frei, die App bekommt es nie
 *     mit, der Kauf wird nie verifiziert und nie `finish()`ed.
 *   - Abbruch zwischen Apple-Belastung und Server-Bestaetigung.
 *
 * In beiden Faellen blieb dem Nutzer nur der manuelle Restore-Knopf, ohne dass
 * ihn etwas dorthin gefuehrt haette.
 */
export function initIapTransactionListener() {
  if (!IS_NATIVE || started) return
  started = true

  IAP.addListener('transactionUpdate', async (data) => {
    try {
      const res = await apiFetch(`${API}/iap/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jwsRepresentation: data.jwsRepresentation,
          productId: data.productId,
        }),
      })
      if (!res.ok) return

      // Erst nach der Server-Bestaetigung abschliessen — sonst gilt der Kauf
      // bei Apple als erledigt, waehrend er bei uns nie ankam.
      await IAP.finishTransaction({ transactionId: data.transactionId }).catch((err) => {
        logError('iapTransactionListener.finishTransaction', err)
      })
      window.dispatchEvent(new CustomEvent(ENTITLEMENTS_CHANGED_EVENT))
    } catch (err) {
      logError('iapTransactionListener.verify', err)
    }
  }).catch((err) => {
    logError('iapTransactionListener.addListener', err)
  })
}
