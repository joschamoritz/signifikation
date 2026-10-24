/**
 * server/routes/admin-product-metrics.js
 *
 * Auswertung › Kennzahlen (Schritt 8): macht vorhandene Produkt-/Geschäftsdaten im Admin sichtbar.
 * KEINE neue Migration – alle Aggregate kommen aus bestehenden Tabellen.
 *
 * Endpunkte (alle requireAuth + adminLimiter + Zod-validate), Zeitraum = `days` Berliner Kalendertage
 * inklusive heute (Tage ohne Ereignis stehen mit 0 in der Antwort):
 *   GET /admin/payments/summary?days=      – Käufe und Einnahmen (payments), nach Weg und Preisstufe
 *   GET /admin/custom-lemma/summary?days=  – Eigenes Lemma (custom_lemma_usage), nach Basiszugang/Gesamtausgabe
 *   GET /admin/stats/retention?days=       – aktive Konten (heute/7/30 Tage) und Wiederkehr (stats + user)
 *
 * Lehrkräfte und Sitzungen: /admin/classroom/stats (admin-classroom.js, Telemetrie in classroom/telemetry.js).
 *
 * Admin-Konten zählen nirgends mit (Rolle 'admin'). isPremiumRole bleibt unberührt – es regelt Berechtigungen,
 * hier wird nur die Auswertung bereinigt. Datenschutz: NUR Aggregate; keine E-Mails, Namen oder Konto-IDs.
 */

import express from 'express'
import { isPremiumRole } from '../middleware/userAuth.js'
import db from '../db.js'
import { berlinTag, plusTage, tageVonBis, berlinMitternachtMs } from '../date-utils.js'
import { getAuswertungSpiele } from '../store.js'
import { STATS_KONTO_ZEILEN_TAGE } from '../store-stats.js'

/** Kleinste Kohorte, für die ein Anteil gezeigt wird (darunter verrät ein Prozentwert einzelne Konten). */
export const WIEDERKEHR_MINDEST_KOHORTE = 20
/** Wiederkehr = mindestens ein Spiel am 7. bis 13. Tag nach dem Registrierungstag. */
const WIEDERKEHR_AB_TAG = 7
const WIEDERKEHR_BIS_TAG = 13
/**
 * Pro-Konto-Zeilen in stats werden nach 180 Tagen in die anonyme Zeile gefaltet (STATS_KONTO_ZEILEN_TAGE; erhalten
 * bleibt jede Zeile mit datum >= heute - 180). Die Wiederkehr schaut auf die Tage 7 bis 13 nach der Registrierung,
 * der früheste ist Tag 7 = Registrierungstag + 7. Der muss noch >= heute - 180 liegen, also darf ein Konto höchstens
 * 180 + 7 = 187 Tage alt sein (Registrierungstag >= heute - 187). Ältere Kohorten würden still zu wenig zählen und
 * bleiben deshalb draußen. (Früher stand hier 173 = 180 - 7: falsch herum gerechnet, die Kohorte war 14 Tage zu kurz.)
 */
const KOHORTE_MAX_ALTER_TAGE = STATS_KONTO_ZEILEN_TAGE + WIEDERKEHR_AB_TAG

const round2 = (n) => Math.round(n * 100) / 100

// ── Zahlungen (payments) ─────────────────────────────────────────
// Spalten: id, user_id, amount (TEXT, z. B. "9.99"), currency, status, product, processed_at (Unix-ms).
// Eingefügt wird nur bei status='paid'. Mollie-Zahlungen haben IDs "tr_…", App-Store-Käufe die Transaktions-ID.
// Das Produkt ist immer 'gesamtausgabe' (deshalb keine Aufteilung danach).
const zahlungenStmt = db.prepare(`
  SELECT p.id, p.amount, p.processed_at AS ms
  FROM payments p
  LEFT JOIN user_profiles up ON up.user_id = p.user_id
  WHERE p.status = 'paid' AND p.processed_at >= @since AND COALESCE(up.role, 'user') <> 'admin'
`)

// ── Eigenes Lemma (custom_lemma_usage JOIN user_profiles.role) ───
// custom_lemma_usage: user_id, date (JJJJ-MM-TT, Berlin), count.
const lemmaTageStmt = db.prepare(`
  SELECT clu.date AS datum, COUNT(DISTINCT clu.user_id) AS konten, COALESCE(SUM(clu.count), 0) AS spiele
  FROM custom_lemma_usage clu
  LEFT JOIN user_profiles up ON up.user_id = clu.user_id
  WHERE clu.date >= @von AND clu.date <= @bis AND COALESCE(up.role, 'user') <> 'admin'
  GROUP BY clu.date
`)

const lemmaRollenStmt = db.prepare(`
  SELECT COALESCE(up.role, 'user') AS role, COUNT(DISTINCT clu.user_id) AS konten, COALESCE(SUM(clu.count), 0) AS spiele
  FROM custom_lemma_usage clu
  LEFT JOIN user_profiles up ON up.user_id = clu.user_id
  WHERE clu.date >= @von AND clu.date <= @bis AND COALESCE(up.role, 'user') <> 'admin'
  GROUP BY role
`)

// ── Aktive Konten und Wiederkehr (stats + user) ──────────────────
// Aktiv = angemeldete Konten (stats.user_id != '') mit mindestens einem Spiel im Fenster. Anonyme Spiele
// haben keine Kennung und fehlen deshalb; die Seite sagt das ausdrücklich.
const aktivStmt = db.prepare(`
  SELECT
    COUNT(DISTINCT CASE WHEN datum =  @d0  THEN user_id END) AS heute,
    COUNT(DISTINCT CASE WHEN datum >= @d6  THEN user_id END) AS tage7,
    COUNT(DISTINCT CASE WHEN datum >= @d29 THEN user_id END) AS tage30
  FROM stats
  WHERE user_id != '' AND datum >= @d29 AND datum <= @d0
    AND user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
`)

// Konten (ohne Admins) mit Anmeldung in einem groben UTC-Fenster; der genaue Berliner Tag wird in JS bestimmt
const neueKontenStmt = db.prepare(`
  SELECT u.id, u.createdAt
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE COALESCE(up.role, 'user') <> 'admin' AND u.createdAt >= @ab AND u.createdAt < @bis
`)

// Wie viele Konten der Kohorte haben im Fenster [von, bis] (je Konto eigenes Fenster) mindestens einmal gespielt
const wiedergekehrtStmt = db.prepare(`
  WITH kohorte AS (
    SELECT json_extract(value, '$.id') AS user_id, json_extract(value, '$.von') AS von, json_extract(value, '$.bis') AS bis
    FROM json_each(@kohorte)
  )
  SELECT COUNT(*) AS wieder
  FROM kohorte
  WHERE EXISTS (
    SELECT 1 FROM stats s
    WHERE s.user_id = kohorte.user_id AND s.datum >= kohorte.von AND s.datum <= kohorte.bis
  )
`)

function zeitraumVon(days, heute = berlinTag()) {
  return { days, von: plusTage(heute, -(days - 1)), bis: heute }
}

function ladeZahlungen(days) {
  const zeitraum = zeitraumVon(days)
  const rows = zahlungenStmt.all({ since: berlinMitternachtMs(zeitraum.von) })
  const nachTag = new Map(tageVonBis(zeitraum.von, zeitraum.bis).map((datum) => [datum, { datum, kaeufe: 0, betrag: 0, teil: datum === zeitraum.bis }]))
  const wege = { mollie: new Map(), apple: new Map() }
  let kaeufe = 0
  let betrag = 0
  for (const r of rows) {
    const wert = Number(r.amount)
    const tag = nachTag.get(berlinTag(Number(r.ms)))
    if (!tag || !Number.isFinite(wert)) continue // Zeitpunkte nach heute gibt es nicht; kaputte Beträge nicht mitzählen
    tag.kaeufe += 1
    tag.betrag += wert
    kaeufe += 1
    betrag += wert
    const stufen = String(r.id).startsWith('tr_') ? wege.mollie : wege.apple
    const stufe = wert.toFixed(2)
    stufen.set(stufe, (stufen.get(stufe) || 0) + 1)
  }
  return {
    zeitraum,
    kaeufe,
    betrag: round2(betrag),
    tage: [...nachTag.values()].map((t) => ({ ...t, betrag: round2(t.betrag) })),
    nachWeg: Object.entries(wege).map(([weg, stufen]) => ({
      weg,
      stufen: [...stufen].map(([b, n]) => ({ betrag: Number(b), kaeufe: n })).sort((a, b) => a.betrag - b.betrag),
    })),
  }
}

function ladeEigenesLemma(days) {
  const zeitraum = zeitraumVon(days)
  const range = { von: zeitraum.von, bis: zeitraum.bis }
  const nachTag = new Map(tageVonBis(zeitraum.von, zeitraum.bis).map((datum) => [datum, { datum, spiele: 0, konten: 0, teil: datum === zeitraum.bis }]))
  for (const r of lemmaTageStmt.all(range)) {
    const tag = nachTag.get(r.datum)
    if (tag) { tag.spiele = Number(r.spiele || 0); tag.konten = Number(r.konten || 0) }
  }
  const nachStufe = { basiszugang: { konten: 0, spiele: 0 }, gesamtausgabe: { konten: 0, spiele: 0 } }
  for (const r of lemmaRollenStmt.all(range)) {
    const stufe = isPremiumRole(r.role) ? nachStufe.gesamtausgabe : nachStufe.basiszugang
    stufe.konten += Number(r.konten || 0)
    stufe.spiele += Number(r.spiele || 0)
  }
  const tage = [...nachTag.values()]
  const heute = tage.at(-1)
  return {
    zeitraum,
    spiele: nachStufe.basiszugang.spiele + nachStufe.gesamtausgabe.spiele,
    konten: nachStufe.basiszugang.konten + nachStufe.gesamtausgabe.konten,
    nachStufe,
    heute: { spiele: heute.spiele, konten: heute.konten },
    tage,
  }
}

function ladeAktivitaet(days, { frisch = false } = {}) {
  const zeitraum = zeitraumVon(days)
  const heute = zeitraum.bis
  const aktiv = aktivStmt.get({ d0: heute, d6: plusTage(heute, -6), d29: plusTage(heute, -29) }) || {}

  // Kohorte: Konten, die zwischen Zeitraumbeginn und vor 14 Tagen angelegt wurden (so haben alle den 13. Tag erlebt)
  const ersterTag = Math.max(0, days - 1 - KOHORTE_MAX_ALTER_TAGE)
  const von = plusTage(zeitraum.von, ersterTag)
  const bis = plusTage(heute, -(WIEDERKEHR_BIS_TAG + 1))
  let kohorte = 0
  let wieder = 0
  if (von <= bis) {
    const mitglieder = []
    for (const r of neueKontenStmt.all({ ab: `${plusTage(von, -1)}T00:00:00.000Z`, bis: `${plusTage(bis, 2)}T00:00:00.000Z` })) {
      const ms = typeof r.createdAt === 'number' ? r.createdAt : Date.parse(r.createdAt)
      if (!Number.isFinite(ms)) continue
      const tag = berlinTag(ms)
      if (tag < von || tag > bis) continue
      mitglieder.push({ id: r.id, von: plusTage(tag, WIEDERKEHR_AB_TAG), bis: plusTage(tag, WIEDERKEHR_BIS_TAG) })
    }
    kohorte = mitglieder.length
    if (kohorte > 0) wieder = Number(wiedergekehrtStmt.get({ kohorte: JSON.stringify(mitglieder) })?.wieder || 0)
  }

  // Anteil der Spiele mit Konto im gewählten Zeitraum (aus der Spiele-Auswertung, gleicher Zwischenspeicher).
  // Verdichtete Tage (älter als 180 Tage) haben keine Konto-Zeilen mehr und zählen weder im Zähler noch im Nenner.
  const { summe, zeitraum: spieleZeitraum } = getAuswertungSpiele(days, { frisch })
  return {
    zeitraum,
    aktiv: { heute: Number(aktiv.heute || 0), tage7: Number(aktiv.tage7 || 0), tage30: Number(aktiv.tage30 || 0) },
    wiederkehr: {
      von,
      bis,
      kohorte,
      // Unter 20 Konten auch keine absolute Zahl der Wiederkehrer: Sie ergäbe mit der Kohorte zusammen den Anteil
      wieder: kohorte >= WIEDERKEHR_MINDEST_KOHORTE ? wieder : null,
      // Unter 20 Konten kein Anteil: Ein Prozentwert würde einzelne Konten verraten und springt bei jedem Konto um Punkte
      anteil: kohorte >= WIEDERKEHR_MINDEST_KOHORTE ? wieder / kohorte : null,
      mindestens: WIEDERKEHR_MINDEST_KOHORTE,
    },
    mitKontoAnteil: summe.kontoBasis > 0 ? summe.mitKonto / summe.kontoBasis : null,
    // Letzter Tag ohne Konto-Zeilen im Zeitraum (null: Anteil gilt für den ganzen Zeitraum)
    mitKontoVerdichtetBis: spieleZeitraum.verdichtetBis,
  }
}

export function createAdminProductMetricsRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminPaymentsSummaryQuerySchema,
  adminCustomLemmaSummaryQuerySchema,
  adminRetentionQuerySchema,
  adminError,
}) {
  const router = express.Router()

  router.get('/admin/payments/summary', adminLimiter, requireAuth, validate(adminPaymentsSummaryQuerySchema, 'query'), (req, res) => {
    try {
      res.json(ladeZahlungen(req.query.days))
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/custom-lemma/summary', adminLimiter, requireAuth, validate(adminCustomLemmaSummaryQuerySchema, 'query'), (req, res) => {
    try {
      res.json(ladeEigenesLemma(req.query.days))
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/stats/retention', adminLimiter, requireAuth, validate(adminRetentionQuerySchema, 'query'), (req, res) => {
    try {
      res.json(ladeAktivitaet(req.query.days, { frisch: req.query.frisch }))
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
