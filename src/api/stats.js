/**
 * API-Helfer für Spielstatistiken.
 *
 * postStat() ist eine fire-and-forget Funktion: Fehler werden still
 * ignoriert, da der Spielfluss nicht von Statistik-Übertragungen
 * abhängen soll.
 */
import { API } from '../config'

/**
 * Sendet ein Spielergebnis an den Stats-Endpunkt.
 * @param {string} game   Spielname, z. B. 'kollokationen', 'wortzwilling'
 * @param {string} datum  Tagesdatum YYYY-MM-DD
 * @param {number} score  Erreichte Punkte
 * @param {number} max    Maximale Punkte
 */
export function postStat(game, datum, score, max) {
  fetch(`${API}/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game, datum, score, max }),
    // keepalive: Ergebnis geht nicht verloren, wenn der Tab direkt nach
    // Spielende geschlossen wird / die Seite navigiert (F-N6-Minimalfix).
    keepalive: true,
  }).catch(() => {})
}
