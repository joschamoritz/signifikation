import { Capacitor } from '@capacitor/core'

// Nativer Google-Login über @capawesome/capacitor-google-sign-in (Android:
// Credential Manager). Vorerst nur Android – auf iOS braucht das Plugin
// GIDClientID und das URL-Schema des iOS-Clients in Info.plist, das kommt mit
// dem nächsten iOS-Build. Solange liefert der Server der iOS-App kein Google
// (auth-options ohne ?nativeGoogle=1).
export function isGoogleNativeAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

let initializedFor = null

/**
 * Startet die Google-Anmeldung und liefert das ID-Token für better-auths
 * idToken-Weg. clientId ist die WEB-Client-ID (vom Server über auth-options),
 * auch auf Android – das Plugin reicht sie als „server client ID“ weiter.
 * Die Nonce bindet das Token an genau diese Anmeldung; der Server prüft sie.
 */
export async function signInWithGoogleNative(clientId) {
  if (!isGoogleNativeAvailable()) {
    throw new Error('Google-Native-Login nicht verfügbar (kein Android-Capacitor-Kontext)')
  }
  if (!clientId) throw new Error('Google-Client-ID fehlt')

  const { GoogleSignIn } = await import('@capawesome/capacitor-google-sign-in')
  if (initializedFor !== clientId) {
    await GoogleSignIn.initialize({ clientId })
    initializedFor = clientId
  }

  const nonce = crypto.randomUUID()
  const result = await GoogleSignIn.signIn({ nonce })
  if (!result?.idToken) {
    throw new Error('Google lieferte kein idToken zurück')
  }
  return { idToken: { token: result.idToken, nonce } }
}
