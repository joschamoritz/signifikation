import { apiFetch } from './apiFetch'
import { IAP, USES_STORE_BILLING, restoreRequest } from '../plugins/iap.js'

// Käufe via StoreKit bzw. Google Play wiederherstellen und beim Server verifizieren.
// Liefert ein normalisiertes Resultat – die UI muss nur einen Status auswerten,
// statt zwei API-Aufrufe inkl. Fehlerbehandlung zu duplizieren.
//
// Rückgabe:
//   { ok: true,  unlocked: true  }  – Kauf gefunden + Freischaltung aktiv
//   { ok: false, reason: 'unsupported' | 'none' | 'not-found' | 'network', message? }
export async function restoreIapPurchases() {
  if (!USES_STORE_BILLING) {
    return { ok: false, reason: 'unsupported' }
  }
  try {
    const { transactions } = await IAP.restorePurchases()
    if (!transactions?.length) {
      return { ok: false, reason: 'none' }
    }
    const { url, body } = restoreRequest(transactions)
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, reason: 'network', message: data.error || 'Wiederherstellung fehlgeschlagen.' }
    }
    if (data.unlocked) return { ok: true, unlocked: true }
    return { ok: false, reason: 'not-found' }
  } catch (err) {
    return { ok: false, reason: 'network', message: err?.message || 'Netzwerkfehler.' }
  }
}
