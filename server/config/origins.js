// Bewusst KEIN Import aus middleware/auth.js: das wuerde db + audit in
// jeden Origins-Consumer ziehen (u.a. auth/index.js) und Zyklen riskieren.
const IS_PROD = process.env.NODE_ENV === 'production'

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
  : IS_PROD
    ? ['https://signifikation.de']
    : ['http://localhost:5173', 'http://localhost:3001']

// Capacitor-Origins:
// - iOS WKWebView läuft unter capacitor://localhost
// - Android WebView läuft unter https://localhost (Capacitor 8 default: androidScheme=https)
// - http://localhost ist nur in Non-Prod erlaubt (Browser-Dev). In Prod würde diese Origin
//   lokaler Schadsoftware das Mitführen unseres SameSite=None-Cookies erlauben.
const PROD_CAPACITOR_ORIGINS = ['capacitor://localhost', 'https://localhost']
const DEV_CAPACITOR_ORIGINS = [...PROD_CAPACITOR_ORIGINS, 'http://localhost']

export const CAPACITOR_ORIGINS = IS_PROD ? PROD_CAPACITOR_ORIGINS : DEV_CAPACITOR_ORIGINS

export function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.includes(origin) || CAPACITOR_ORIGINS.includes(origin)
}

// „Mit Apple anmelden“ im Web: Apple schickt das Ergebnis als Formular-POST (response_mode form_post) von
// appleid.apple.com an den Callback. Das ist eine Seitennavigation, kein Script-Zugriff – die CORS-Prüfung
// darf sie nicht mit 403 abweisen, setzt aber auch keine CORS-Header. Die Echtheit prüft better-auth über
// den gespeicherten state und leitet auf den GET-Callback um.
export const APPLE_CALLBACK_PFAD = '/api/v1/auth/callback/apple'
export const APPLE_ORIGIN = 'https://appleid.apple.com'

export function istAppleFormPost(req) {
  return req.method === 'POST' && req.path === APPLE_CALLBACK_PFAD && req.headers.origin === APPLE_ORIGIN
}

/** CORS-Middleware, die nur Apples Formular-POST an den Callback durchlässt (ohne CORS-Header). */
export function corsAusserAppleCallback(corsMiddleware) {
  return (req, res, next) => (istAppleFormPost(req) ? next() : corsMiddleware(req, res, next))
}
