import { IAP, USES_STORE_BILLING, verifyRequest } from '../plugins/iap.js'
import { apiFetch } from './apiFetch'
import { logError } from './logError'

/**
 * Ereignis, das nach einer erfolgreichen Freischaltung gefeuert wird. Die
 * Konto-Ansicht laedt daraufhin die Sitzung neu, damit der Premium-Status
 * sofort sichtbar wird.
 */
export const ENTITLEMENTS_CHANGED_EVENT = 'signifikation:entitlements-changed'

let started = false

/**
 * Registriert den `transactionUpdate`-Listener des Kauf-Plugins EINMAL beim App-Start.
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
 *
 * Android (IAPPlugin.java) meldet beim Start und bei jeder Rueckkehr in die App
 * alle bezahlten, unbestaetigten Play-Kaeufe – dort zusaetzlich wichtig, weil
 * Google unbestaetigte Kaeufe nach drei Tagen erstattet.
 */
export function initIapTransactionListener() {
  if (!USES_STORE_BILLING || started) return
  started = true

  IAP.addListener('transactionUpdate', async (data) => {
    try {
      const { url, body } = verifyRequest(data)
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) return

      // 200 allein genuegt nicht: Gehoert die Transaktion einem anderen Konto,
      // antwortet der Server `unlocked: false` und es wurde nichts
      // freigeschaltet. Dann unfinished lassen, damit Transaction.updates sie
      // nach einem Kontowechsel erneut liefert (Android: unbestaetigt lassen).
      const verifyResult = await res.json().catch(() => ({}))
      if (!verifyResult.unlocked) return

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
