import { Capacitor } from '@capacitor/core'

export function isAppleNativeAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function signInWithAppleNative() {
  if (!isAppleNativeAvailable()) {
    throw new Error('Apple-Native-Login nicht verfügbar (kein iOS-Capacitor-Kontext)')
  }

  const { AppleSignIn, SignInScope } = await import('@capawesome/capacitor-apple-sign-in')

  // Auf iOS ist kein initialize() nötig – das System liest Bundle-ID und Capability
  // direkt aus den Entitlements. clientId/redirectUrl sind nur für Android/Web relevant.
  const result = await AppleSignIn.signIn({
    scopes: [SignInScope.Email, SignInScope.FullName],
  })

  if (!result?.idToken) {
    throw new Error('Apple lieferte kein identityToken zurück')
  }

  // Apple liefert givenName/familyName/email NUR beim allerersten Sign-in zurück.
  // Wir reichen sie ans Backend durch, damit better-auth den Namen beim Account-Anlegen
  // übernehmen kann. Bei späteren Logins sind die Felder null.
  const idTokenPayload = {
    token: result.idToken,
  }
  if (result.givenName || result.familyName || result.email) {
    idTokenPayload.user = {
      name: {
        firstName: result.givenName || undefined,
        lastName: result.familyName || undefined,
      },
      email: result.email || undefined,
    }
  }

  return idTokenPayload
}
