import { Capacitor } from '@capacitor/core'

// Bundle-ID der iOS-App – das ist der `aud`-Claim, den Apple in das identityToken
// schreibt, wenn der Sign-in über die native iOS-API läuft. Das Backend (better-auth)
// akzeptiert sowohl Services-ID als auch Bundle-ID als Audience.
const NATIVE_CLIENT_ID = 'de.signifikation.app'

// Apple verlangt einen redirectURI, der zwar bei der nativen ASAuthorization nicht
// wirklich genutzt wird, aber im Plugin-Aufruf vorhanden sein muss.
const NATIVE_REDIRECT_URI = 'https://signifikation.de/api/v1/auth/callback/apple'

export function isAppleNativeAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function signInWithAppleNative() {
  if (!isAppleNativeAvailable()) {
    throw new Error('Apple-Native-Login nicht verfügbar (kein iOS-Capacitor-Kontext)')
  }

  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')

  const result = await SignInWithApple.authorize({
    clientId: NATIVE_CLIENT_ID,
    redirectURI: NATIVE_REDIRECT_URI,
    scopes: 'email name',
  })

  const response = result?.response
  if (!response?.identityToken) {
    throw new Error('Apple lieferte kein identityToken zurück')
  }

  // Apple liefert givenName/familyName/email NUR beim allerersten Sign-in zurück.
  // Wir reichen sie ans Backend durch, damit better-auth den Namen beim Account-Anlegen
  // übernehmen kann. Bei späteren Logins sind die Felder null.
  const idTokenPayload = {
    token: response.identityToken,
  }
  if (response.givenName || response.familyName || response.email) {
    idTokenPayload.user = {
      name: {
        firstName: response.givenName || undefined,
        lastName: response.familyName || undefined,
      },
      email: response.email || undefined,
    }
  }

  return idTokenPayload
}
