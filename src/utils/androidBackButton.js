// Android-Zurück-Taste (Hardware-Taste oder Zurück-Geste).
//
// Ohne Listener schließt Capacitor die App beim ersten Zurück sofort – auch
// mitten im Spiel oder aus einer Kursstation heraus. Mit Listener übernimmt
// die App jeden Schritt selbst, in dieser Reihenfolge:
//
//   1. offener Dialog → per Escape schließen (Sheet, Kiosk-Modal, QR-Scanner)
//   2. Hauptansicht (setBackHandler aus App.jsx): Spiel verlassen,
//      Kursstation schließen, zurück auf den Tab „Spielmodi“
//   3. Klassenraum-Beitritt (/c) → zurück in die App
//   4. sonst App minimieren – NICHT beenden, damit ein laufendes Kiosk-Quiz
//      oder ein halbes Spiel beim Zurückholen noch da ist
//
// Bewusst nicht über die WebView-History: Spiele legen beim Start einen
// History-Eintrag an, räumen ihn beim Verlassen per Button aber nicht ab.
// `canGoBack` ist deshalb oft true, obwohl es sichtbar nichts zurückzugehen
// gibt – der Nutzer müsste mehrfach drücken.

import { Capacitor } from '@capacitor/core'
import { matchClassroomRoute, navigate } from '../components/classroom/routing'

let appHandler = null

/**
 * Registriert den Zurück-Schritt der Hauptansicht. Der Handler liefert true,
 * wenn er etwas getan hat. Rückgabe: Abmelde-Funktion.
 */
export function setBackHandler(fn) {
  appHandler = fn
  return () => { if (appHandler === fn) appHandler = null }
}

function closeOpenDialog() {
  if (!document.querySelector('[aria-modal="true"]')) return false
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return true
}

export async function initAndroidBackButton() {
  try {
    if (Capacitor.getPlatform() !== 'android') return
  } catch { return }
  try {
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', () => {
      if (closeOpenDialog()) return
      if (appHandler?.()) return
      if (matchClassroomRoute(window.location.pathname).match === 'join') {
        navigate('/')
        return
      }
      App.minimizeApp().catch(() => {})
    })
  } catch {
    // Plugin nicht verfügbar → Android-Standard (App schließt).
  }
}
