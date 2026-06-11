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
