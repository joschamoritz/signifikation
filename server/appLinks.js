// Android App Links: /.well-known/assetlinks.json erlaubt der Android-App,
// https://signifikation.de/c/<code> (Klassenraum-QR) selbst zu öffnen –
// Gegenstück zur Apple-AASA in server/index.js.
//
// Android prüft die Datei gegen den SHA-256-Fingerabdruck des Zertifikats,
// mit dem die installierte App signiert ist. Für Play-Installationen ist das
// der App-Signaturschlüssel von Google (Play Console → App-Integrität), NICHT
// der Upload-Key. Mehrere Fingerabdrücke (z. B. zusätzlich der lokale
// Debug-Key) kommagetrennt in ANDROID_CERT_SHA256.

const PACKAGE_NAME = 'de.signifikation.app'
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

/**
 * Baut den assetlinks.json-Inhalt aus ANDROID_CERT_SHA256 oder liefert null,
 * wenn kein gültiger Fingerabdruck konfiguriert ist (→ 404, Android öffnet
 * den Link dann im Browser wie bisher). Ungültige Einträge fallen still raus,
 * damit ein Tippfehler nicht die übrigen Fingerabdrücke mitreißt.
 */
export function buildAssetLinks(value) {
  const fingerprints = String(value || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => FINGERPRINT.test(s))
  if (!fingerprints.length) return null
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}
