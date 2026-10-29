/**
 * fcm.js – Android-Push über Firebase Cloud Messaging (HTTP-v1-API)
 *
 * Bewusst ohne firebase-admin: Wir brauchen nur „eine Nachricht an ein Token
 * senden“. Das OAuth-Zugriffstoken holen wir selbst per Dienstkonto-JWT
 * (jose ist ohnehin Abhängigkeit) und cachen es bis kurz vor Ablauf.
 *
 * Konfiguration: FCM_SERVICE_ACCOUNT_PATH zeigt auf die Dienstkonto-JSON aus
 * der Firebase-Konsole (Projekteinstellungen › Dienstkonten). Fehlt sie oder
 * ist sie unlesbar, bleibt Android-Push aus – der Modul-Load darf NIE werfen
 * (Boot-Abbruch, siehe push-sender.test.js).
 */
import { createAccessTokenSource, loadServiceAccount as ladeDienstkonto } from '../google/dienstkonto.js'

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
// Kanal-ID wie in src/hooks/usePushNotifications.js (createChannel)
export const ANDROID_CHANNEL_ID = 'erinnerungen'

/** Liest und prüft die Dienstkonto-JSON; liefert null statt zu werfen. */
export function loadServiceAccount(path, log) {
  return ladeDienstkonto(path, log, 'FCM')
}

/** FCM-Nachricht im HTTP-v1-Format. url landet in data für den Klick-Handler. */
export function buildMessage(token, payload) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: String(payload.url) } : {},
      android: {
        ttl: '3600s',
        notification: { channel_id: ANDROID_CHANNEL_ID },
      },
    },
  }
}

/**
 * Token, das FCM nicht mehr kennt (App deinstalliert, Token erneuert) →
 * Subscription löschen. Nur bei eindeutigem UNREGISTERED: ein allgemeines
 * INVALID_ARGUMENT kann auch an unserer Nachricht liegen und darf nicht alle
 * Android-Geräte auf einmal löschen.
 *
 * SENDER_ID_MISMATCH: Das Token gehört zu einem anderen Firebase-Projekt –
 * z. B. nach dem Umzug von signifikation-bb04d nach signifikation (29.10.).
 * Mit dem aktuellen Dienstkonto ist es nie wieder zustellbar; die App meldet
 * sich nach dem Update mit einem neuen Token selbst wieder an.
 */
export function isUnregistered(status, body) {
  const details = body?.error?.details || []
  const code = details.find((d) => d?.errorCode)?.errorCode
  return code === 'UNREGISTERED'
    || code === 'SENDER_ID_MISMATCH'
    || (status === 404 && body?.error?.status === 'NOT_FOUND')
}

/**
 * Erzeugt einen Sender. fetchImpl und now sind für Tests austauschbar.
 * Rückgabe: { enabled, send(token, payload) → { ok, unregistered, status } }
 */
export function createFcmSender(sa, { fetchImpl = fetch, now = () => Date.now(), timeoutMs = 10_000 } = {}) {
  if (!sa) return { enabled: false, send: async () => ({ ok: false, unregistered: false, status: 0 }) }

  const sendUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  const zugriff = createAccessTokenSource(sa, { scope: SCOPE, fetchImpl, now, timeoutMs, zweck: 'FCM' })

  async function send(token, payload) {
    const res = await fetchImpl(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await zugriff.get()}` },
      body: JSON.stringify(buildMessage(token, payload)),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok) return { ok: true, unregistered: false, status: res.status }
    // Abgelaufenes Zugriffstoken: beim nächsten Versand neu holen
    if (res.status === 401) zugriff.invalidate()
    const body = await res.json().catch(() => null)
    return { ok: false, unregistered: isUnregistered(res.status, body), status: res.status }
  }

  return { enabled: true, send }
}
