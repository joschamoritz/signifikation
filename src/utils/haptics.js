import { Capacitor } from '@capacitor/core'

// Haptisches Feedback plattformübergreifend.
// iOS: nutzt das Capacitor-Haptics-Plugin (Taptic Engine).
// Android/Web: fällt auf navigator.vibrate zurück (auf iOS-Safari nicht verfügbar).
// Fehler werden geschluckt – Haptik ist immer ein "nice to have", nie kritisch.

const IS_NATIVE = Capacitor.isNativePlatform()

let pluginPromise = null
function loadPlugin() {
  if (!IS_NATIVE) return Promise.resolve(null)
  if (!pluginPromise) pluginPromise = import('@capacitor/haptics').catch(() => null)
  return pluginPromise
}

export async function hapticLight() {
  if (IS_NATIVE) {
    const mod = await loadPlugin()
    if (mod) await mod.Haptics.impact({ style: mod.ImpactStyle.Light }).catch(() => {})
    return
  }
  navigator.vibrate?.(12)
}

export async function hapticMedium() {
  if (IS_NATIVE) {
    const mod = await loadPlugin()
    if (mod) await mod.Haptics.impact({ style: mod.ImpactStyle.Medium }).catch(() => {})
    return
  }
  navigator.vibrate?.([8, 30, 8])
}

export async function hapticSuccess() {
  if (IS_NATIVE) {
    const mod = await loadPlugin()
    if (mod) await mod.Haptics.notification({ type: mod.NotificationType.Success }).catch(() => {})
    return
  }
  navigator.vibrate?.([6, 20, 6])
}
