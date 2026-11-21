// Kollokator-Korrekturen aus dem Admin (Tabelle kollokator_korrektur, Migration 0038).
//
// Der Grundbestand liegt im Code (server/kollokatorKorrektur.js); dieses Modul liest die
// DB-Einträge, legt sie per setzeDbKorrekturen() darüber und leert nach jeder Änderung
// die zwischengespeicherte Rangfolge (query-cache, Schlüssel `rang:<lemma>:<pos>`).
//
// Beim Import lädt es die Einträge einmal. Jeder Prozess, der die Rangfolge rechnet,
// muss dieses Modul importieren (Server über die Admin-Routen, Skripte wie
// scripts/kollokationen-neubau.mjs selbst), sonst gilt dort nur der Grundbestand.
import db from './db.js'
import logger from './logger.js'
import { loescheCacheEintraege } from './query-cache.js'
import { setzeDbKorrekturen, zerlegeSchluessel, grundbestand } from './kollokatorKorrektur.js'

const SPALTEN = `k.id, k.art, k.schluessel, k.ersatz, k.notiz, k.erstellt_am, k.geaendert_am, k.admin_user_id, u.name AS admin_name`

let _stmts = null
function stmts() {
  if (_stmts) return _stmts
  _stmts = {
    alleRoh: db.prepare('SELECT art, schluessel, ersatz FROM kollokator_korrektur'),
    liste: db.prepare(`SELECT ${SPALTEN} FROM kollokator_korrektur k LEFT JOIN user u ON u.id = k.admin_user_id ORDER BY k.geaendert_am DESC, k.id DESC`),
    nachId: db.prepare(`SELECT ${SPALTEN} FROM kollokator_korrektur k LEFT JOIN user u ON u.id = k.admin_user_id WHERE k.id = ?`),
    nachSchluessel: db.prepare('SELECT id FROM kollokator_korrektur WHERE art = ? AND schluessel = ?'),
    einfuegen: db.prepare(`
      INSERT INTO kollokator_korrektur (art, schluessel, ersatz, notiz, erstellt_am, geaendert_am, admin_user_id)
      VALUES (@art, @schluessel, @ersatz, @notiz, @jetzt, @jetzt, @adminUserId)`),
    aendern: db.prepare(`
      UPDATE kollokator_korrektur
         SET art = @art, schluessel = @schluessel, ersatz = @ersatz, notiz = @notiz,
             geaendert_am = @jetzt, admin_user_id = @adminUserId
       WHERE id = @id`),
    loeschen: db.prepare('DELETE FROM kollokator_korrektur WHERE id = ?'),
  }
  return _stmts
}

/** Liest alle DB-Einträge neu und legt sie über den Grundbestand. */
export function ladeKorrekturen() {
  try {
    const zeilen = stmts().alleRoh.all()
    setzeDbKorrekturen(zeilen)
    return zeilen.length
  } catch (err) {
    // Fehlt die Tabelle (Migration noch nicht gelaufen), gilt der Grundbestand allein.
    logger.warn({ err }, 'Kollokator-Korrekturen nicht geladen, nur Grundbestand aktiv')
    setzeDbKorrekturen([])
    return 0
  }
}

/** Basis aus einem Rangfolge-Schlüssel `rang:<lemma>:<pos>` (klein). */
const basisAusRangKey = (key) => key.slice(5, key.lastIndexOf(':')).toLowerCase()

/**
 * Leert die zwischengespeicherte Rangfolge, die eine Korrektur betrifft: bei einem Paar
 * nur die Basis, sonst alle Basen (Lemma-, Schreib-, Abkürzungs- und Partizip-Regeln
 * wirken bei jeder Basis).
 * @returns {number} gelöschte Einträge
 */
export function leereRangfolgeFuer(art, schluessel) {
  if (art === 'paar') {
    const { basis } = zerlegeSchluessel(art, schluessel)
    return loescheCacheEintraege((k) => k.startsWith('rang:') && basisAusRangKey(k) === basis)
  }
  return loescheCacheEintraege((k) => k.startsWith('rang:'))
}

const ausZeile = (z) => z && ({
  id: z.id,
  art: z.art,
  schluessel: z.schluessel,
  ...zerlegeSchluessel(z.art, z.schluessel),
  ersatz: z.ersatz,
  notiz: z.notiz ?? '',
  erstelltAm: z.erstellt_am,
  geaendertAm: z.geaendert_am,
  admin: z.admin_name ?? null,
})

/** Alle DB-Einträge, zuletzt geänderte zuerst. */
export function listeKorrekturen() {
  return stmts().liste.all().map(ausZeile)
}

export function holeKorrektur(id) {
  return ausZeile(stmts().nachId.get(id)) ?? null
}

/**
 * Grundbestand aus dem Code; `uebersteuert` = ein DB-Eintrag mit demselben Schlüssel gilt.
 * @param {Array<{ art: string, schluessel: string }>} [dbEintraege]
 */
export function listeGrundbestand(dbEintraege = listeKorrekturen()) {
  const inDb = new Set(dbEintraege.map((e) => `${e.art}\u0000${e.schluessel}`))
  return grundbestand().map((z) => ({
    ...z,
    ...zerlegeSchluessel(z.art, z.schluessel),
    uebersteuert: inDb.has(`${z.art}\u0000${z.schluessel}`),
  }))
}

function nachSchreiben(...schluessel) {
  ladeKorrekturen()
  for (const [art, s] of schluessel) leereRangfolgeFuer(art, s)
}

/**
 * Legt eine Korrektur an. Gibt es (art, schluessel) schon, wird der Eintrag ersetzt.
 * @param {{ art: string, schluessel: string, ersatz: string|null, notiz?: string, adminUserId?: string|null }} k
 * @returns {{ vorher: object|null, nachher: object }}
 */
export function speichereKorrektur({ art, schluessel, ersatz, notiz = '', adminUserId = null }) {
  const s = stmts()
  const jetzt = Date.now()
  const daId = s.nachSchluessel.get(art, schluessel)?.id
  const vorher = daId ? holeKorrektur(daId) : null
  let id = daId
  if (daId) s.aendern.run({ id: daId, art, schluessel, ersatz, notiz, jetzt, adminUserId })
  else id = Number(s.einfuegen.run({ art, schluessel, ersatz, notiz, jetzt, adminUserId }).lastInsertRowid)
  nachSchreiben([art, schluessel])
  return { vorher, nachher: holeKorrektur(id) }
}

/** Fehler, wenn eine Änderung einen Schlüssel träfe, den ein anderer Eintrag schon hat. */
export class KorrekturKonflikt extends Error {}

/**
 * Ändert eine Korrektur.
 * @returns {{ vorher: object, nachher: object } | null} null = unbekannte id
 */
export function aendereKorrektur(id, { art, schluessel, ersatz, notiz = '', adminUserId = null }) {
  const s = stmts()
  const vorher = holeKorrektur(id)
  if (!vorher) return null
  const andere = s.nachSchluessel.get(art, schluessel)?.id
  if (andere && andere !== id) throw new KorrekturKonflikt('Für dieses Wort gibt es schon einen Eintrag.')
  s.aendern.run({ id, art, schluessel, ersatz, notiz, jetzt: Date.now(), adminUserId })
  nachSchreiben([vorher.art, vorher.schluessel], [art, schluessel])
  return { vorher, nachher: holeKorrektur(id) }
}

/** @returns {object|null} der gelöschte Eintrag, null = unbekannte id */
export function loescheKorrektur(id) {
  const vorher = holeKorrektur(id)
  if (!vorher) return null
  stmts().loeschen.run(id)
  nachSchreiben([vorher.art, vorher.schluessel])
  return vorher
}

ladeKorrekturen()
