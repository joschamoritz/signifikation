import { Capacitor, registerPlugin } from '@capacitor/core'
import { API } from '../config'

// Natives Kauf-Plugin mit gleicher Schnittstelle auf beiden Plattformen:
// ios/App/App/IAPPlugin.swift (StoreKit) und
// android/app/src/main/java/de/signifikation/app/IAPPlugin.java (Google Play Billing).
const IAP = registerPlugin('IAP')

// Kaufweg der App: 'apple' (iOS), 'google' (Android), im Web null (Mollie).
// In der Android-App gibt es nur Google Play – Mollie und jeder Hinweis auf
// den Kauf im Web sind dort nach der Play-Richtlinie verboten.
const PLATFORM = Capacitor.getPlatform()
const STORE = PLATFORM === 'ios' ? 'apple' : PLATFORM === 'android' ? 'google' : null
const USES_STOREKIT = STORE === 'apple'
const USES_STORE_BILLING = STORE !== null

/**
 * Server-Prüfung für einen Kauf aus dem Plugin (purchase() oder transactionUpdate).
 * Apple schickt das signierte JWS, Google das purchaseToken.
 */
function verifyRequest(tx) {
  if (STORE === 'google') {
    return { url: `${API}/iap/play/verify`, body: { purchaseToken: tx.purchaseToken, productId: tx.productId } }
  }
  return { url: `${API}/iap/verify`, body: { jwsRepresentation: tx.jwsRepresentation, productId: tx.productId } }
}

/** Server-Prüfung für die Ergebnisse von restorePurchases(). */
function restoreRequest(transactions) {
  if (STORE === 'google') {
    return {
      url: `${API}/iap/play/restore`,
      body: { transactions: transactions.map(({ purchaseToken, productId }) => ({ purchaseToken, productId })) },
    }
  }
  return { url: `${API}/iap/restore`, body: { transactions } }
}

export { IAP, STORE, USES_STOREKIT, USES_STORE_BILLING, verifyRequest, restoreRequest }
