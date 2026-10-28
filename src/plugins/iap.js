import { Capacitor, registerPlugin } from '@capacitor/core'

const IAP = registerPlugin('IAP')

// StoreKit gibt es nur in der iOS-App (IAPPlugin.swift). Android hat bis zur
// Play-Billing-Anbindung keinen Kaufweg: Mollie in der App verbietet die
// Play-Richtlinie, also auch keinen Hinweis auf den Kauf im Web. Konten mit
// Web-Kauf behalten die Gesamtausgabe trotzdem.
const USES_STOREKIT = Capacitor.getPlatform() === 'ios'
const PURCHASE_AVAILABLE = Capacitor.getPlatform() !== 'android'

export { IAP, USES_STOREKIT, PURCHASE_AVAILABLE }
