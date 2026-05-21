// PWA-Update-Steuerung: Verbindet `virtual:pwa-register` mit dem
// UpdateBanner-Component. vite-plugin-pwa erkennt einen neuen Service Worker
// im Hintergrund und ruft `onNeedRefresh` auf – wir reichen das per Listener
// an die UI weiter. Der User entscheidet, wann reloaded wird.
//
// Ablauf:
//   1. SW v2 wird beim normalen Seitenladen vom Browser entdeckt und installiert.
//   2. SW v2 bleibt in `waiting`, weil v1 noch Clients kontrolliert.
//   3. registerSW({ onNeedRefresh }) feuert → UpdateBanner wird sichtbar.
//   4. User klickt "Aktualisieren" → triggerUpdate() ruft updateSW(true) →
//      postMessage('SKIP_WAITING') an SW v2 → v2 aktiviert sich →
//      `controllerchange` → location.reload().
//
// In Dev ist devOptions.enabled per default aus → registerSW ist No-op.

import { registerSW } from 'virtual:pwa-register'

let triggerUpdateFn = null
const listeners = new Set()

export function onPwaUpdateAvailable(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function triggerUpdate() {
  if (triggerUpdateFn) triggerUpdateFn()
}

export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      triggerUpdateFn = () => updateSW(true)
      listeners.forEach((cb) => cb())
    },
    onRegisterError(err) {
      // Registrierung kann z. B. an Quota oder älteren Browsern scheitern –
      // die App funktioniert trotzdem, also nur warnen, nicht abbrechen.
      // eslint-disable-next-line no-console
      console.warn('PWA-Registrierung fehlgeschlagen', err)
    },
  })
}
