/**
 * server/classroom/nickname-filter.js
 *
 * Moderations-Blockliste für Schüler-Spitznamen (Audit-Finding H2, 2026-06-13).
 *
 * Bewusst KLEIN + konservativ: nur unmissverständliche Beleidigungen/Slurs,
 * Abgleich gegen NORMALISIERTE exakte Token bzw. die normalisierte
 * Gesamt-Zeichenkette — KEIN Teilwort-Matching. Damit werden „f u c k“,
 * „f4ck“, „F.U.C.K“, „Arsch-Loch“ erkannt, aber legitime Namen wie „Cassie“
 * (enthält „ass“) oder „Klassenfuchs“ NICHT fälschlich blockiert
 * („Scunthorpe-Problem“ vermieden). Kreative Varianten fängt die Lehrkraft per
 * Kick ab — der Filter soll nur das Schlimmste vom Beamer fernhalten.
 *
 * Liste bewusst hier inline (das Repo ist privat). Erweitern bei Bedarf.
 */

// Normalisierte (lowercase, leet→Buchstabe, ohne Trenner) Sperrbegriffe.
const BLOCKLIST = new Set([
  // Sexuelle/vulgäre Beleidigungen (DE)
  'arschloch', 'arsch', 'fotze', 'fotzen', 'hure', 'huren', 'hurensohn',
  'nutte', 'nutten', 'wichser', 'wixer', 'schlampe', 'missgeburt', 'penner',
  // Slurs (DE)
  'schwuchtel', 'schwuchtl', 'neger', 'judensau', 'spast', 'spasti', 'spack',
  'mongo', 'kanake', 'kanacke', 'zigeuner', 'untermensch',
  // Profanität/Slurs (EN)
  'fuck', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt',
  'asshole', 'dick', 'cock', 'pussy', 'whore', 'slut', 'nigger', 'nigga',
  'faggot', 'fag', 'retard', 'rape', 'rapist',
  // Hass/Extremismus
  'hitler', 'nazi', 'siegheil', 'hakenkreuz',
])

// Leetspeak → Buchstabe. Wird VOR dem Entfernen von Nicht-Buchstaben angewandt.
const LEET = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't',
  '8': 'b', '9': 'g', '@': 'a', '$': 's', '€': 'e', '!': 'i', '|': 'i',
}

// Auf Match-Form bringen: lowercase → Leet ersetzen → alles außer Buchstaben
// (inkl. Trenner, Ziffernreste, Emoji) entfernen.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[0-9@$€!|]/g, (c) => LEET[c] ?? '')
    .replace(/[^a-zäöüß]/g, '')
}

/**
 * true, wenn der Spitzname gesperrt ist. Prüft (1) die komplett normalisierte
 * Zeichenkette (fängt „f u c k“, „arsch.loch“) und (2) jedes an Trennern
 * gesplittete Token einzeln normalisiert (fängt „du idiot HURE“).
 */
export function isBlockedNickname(name) {
  if (!name) return false
  const whole = normalize(name)
  if (whole && BLOCKLIST.has(whole)) return true
  for (const token of String(name).split(/[\s._-]+/)) {
    const n = normalize(token)
    if (n && BLOCKLIST.has(n)) return true
  }
  return false
}

/**
 * Gleicher Abgleich, sprechender Name für Nicht-Namensfelder — etwa die
 * Freitext-Antworten im Lückenfüller, die in der Ergebnisansicht (ggf. am
 * Beamer) als „Häufigste Fehlantwort“ auftauchen.
 */
export const isBlockedText = isBlockedNickname

// Nur für Tests.
export { BLOCKLIST as __BLOCKLIST }
