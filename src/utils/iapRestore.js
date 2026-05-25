import { Capacitor } from '@capacitor/core'
import { API } from '../config'
import { apiFetch } from './apiFetch'
import { IAP } from '../plugins/iap.js'

// Käufe via StoreKit wiederherstellen und beim Server verifizieren.
// Liefert ein normalisiertes Resultat – die UI muss nur einen Status auswerten,
// statt zwei API-Aufrufe inkl. Fehlerbehandlung zu duplizieren.
//
// Rückgabe:
//   { ok: true,  unlocked: true  }  – Kauf gefunden + Freischaltung aktiv
//   { ok: false, reason: 'unsupported' | 'none' | 'not-found' | 'network', message? }
export async function restoreIapPurchases() {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: 'unsupported' }
  }
  try {
    const { transactions } = await IAP.restorePurchases()
    if (!transactions?.length) {
      return { ok: false, reason: 'none' }
    }
    const res = await apiFetch(`${API}/iap/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ transactions }),
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
