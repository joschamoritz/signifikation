// Werkzeuge › Wort der Woche (Schritt 7b): Speichern mit Prüfung (422), Von/Bis aus der ISO-Woche.
// Der Router bekommt alle Abhängigkeiten als Parameter; hier Attrappen statt Korpus-Datenbanken.
import express from 'express'
import { describe, expect, it, vi } from 'vitest'
import { createAdminSpezialwocheRouter } from '../routes/admin-spezialwoche.js'
import { validate, adminSpezialwocheSchema, adminSpezialwocheParamsSchema, analyzeWZQuerySchema } from '../middleware/validate.js'
import { isoWocheSpanne } from '../date-utils.js'

const durchlass = (_req, _res, next) => next()

function baue({ wz = { wortA: 'Laterne', wortB: 'Lampion', kollokatoren: [{ wort: 'hell', zuordnung: 'A' }, { wort: 'bunt', zuordnung: 'B' }] }, lemmata = [], gespeichert = new Map() } = {}) {
  const speichern = vi.fn((e) => { gespeichert.set(e.woche, e) })
  const audit = vi.fn()
  const aktualisiert = vi.fn()
  const fetchWortZwilling = vi.fn(async () => (wz instanceof Error ? Promise.reject(wz) : wz))
  const index = {
    byId: new Map(lemmata.map((l) => [l.id, l])),
    byLemma: new Map(lemmata.map((l) => [l.lemma, l])),
  }
  const app = express()
  app.use(express.json())
  app.use(createAdminSpezialwocheRouter({
    adminLimiter: durchlass,
    requireAuth: durchlass,
    validate,
    adminSpezialwocheSchema,
    adminSpezialwocheParamsSchema,
    analyzeWZQuerySchema,
    loadAllSpezialwochen: () => [...gespeichert.values()],
    loadSpezialwocheByWoche: (w) => gespeichert.get(w) ?? null,
    saveSpezialwoche: speichern,
    deleteSpezialwoche: (w) => gespeichert.delete(w),
    getLemmataIndex: () => index,
    lemmaExistsInWortprofil: (id) => !id.startsWith('nichtda'),
    fetchWortZwilling,
    toId: (w) => w.toLowerCase().replace(/ü/g, 'ue'),
    auditCreate: audit,
    auditUpdate: aktualisiert,
    auditDelete: audit,
    adminError: (res, _status, msg) => res.status(500).json({ error: String(msg) }),
    serverError: (res, err) => res.status(500).json({ error: String(err?.message ?? err) }),
    logger: { info() {}, warn() {}, error() {} },
  }))
  return { app, speichern, audit, aktualisiert, fetchWortZwilling, gespeichert }
}

async function mitServer(app, fn) {
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}
const post = (basis, body) => fetch(`${basis}/admin/spezialwoche`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /admin/spezialwoche', () => {
  it('rechnet Von/Bis aus der Woche und ignoriert abweichende Angaben', async () => {
    const { app, speichern } = baue()
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2026-W45', von: '2000-01-01', bis: '1999-12-31', lemma_id: 'Laterne', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, woche: '2026-W45', von: '2026-11-02', bis: '2026-11-08', ersetzt: false, lemmaName: 'Laterne' })
      expect(speichern).toHaveBeenCalledWith(expect.objectContaining({ von: '2026-11-02', bis: '2026-11-08', lemma_id: 'laterne' }))
    })
  })

  it('braucht von/bis nicht mehr', async () => {
    const { app } = baue()
    await mitServer(app, async (basis) => {
      expect((await post(basis, { woche: '2026-W46', lemma_id: 'Kürbis', zwilling_pos: 'Substantiv' })).status).toBe(200)
    })
  })

  it('lehnt eine Woche ab, die es nicht gibt (W53 in einem Jahr mit 52 Wochen)', async () => {
    const { app, speichern } = baue()
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2025-W53', lemma_id: 'Laterne', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Die Woche 2025-W53 gibt es nicht.')
      expect(speichern).not.toHaveBeenCalled()
    })
  })

  it('ungeeigneter Wort-Zwilling → 422 und nichts gespeichert', async () => {
    const { app, speichern, audit } = baue({ wz: null })
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', zwilling_partner: 'Glühbirne', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(422)
      const d = await res.json()
      expect(d.error).toBe('„Laterne“ und „Glühbirne“ sind als Wort-Zwilling nicht geeignet (zu wenige eigene Kollokatoren). Anderes Wort B wählen oder das Feld leeren.')
      expect(d.feld).toBe('zwilling_partner')
      expect(speichern).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })
  })

  it('geeigneter Wort-Zwilling wird mit seinen Kollokatoren gespeichert und gemeldet', async () => {
    const { app, speichern } = baue()
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', zwilling_partner: 'Lampion', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ wzKollokatoren: 2 })
      expect(speichern.mock.calls[0][0].zwilling_kollokatoren).toHaveLength(2)
    })
  })

  it('Abruffehler beim Wort-Zwilling: gespeichert ohne Zwilling, aber mit wzFehler: true', async () => {
    const { app, speichern } = baue({ wz: new Error('Datenbank weg') })
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', zwilling_partner: 'Lampion', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, wzFehler: true, wzKollokatoren: 0 })
      expect(speichern.mock.calls[0][0]).toMatchObject({ zwilling_partner: '', zwilling_kollokatoren: [] })
    })
  })

  it('Lückenfüller-Wort ohne erzeugte Runden → 422; mit Runden wird die Kennung gespeichert', async () => {
    const lemmata = [
      { id: 'kritik', lemma: 'Kritik', lueckenfueller: [{ type: 'choice' }] },
      { id: 'kuerbis', lemma: 'Kürbis' },   // Lemma ohne Runden
      { id: 'laterne', lemma: 'Laterne', lueckenfueller: [{ type: 'free' }] },
    ]
    const { app, speichern } = baue({ lemmata })
    await mitServer(app, async (basis) => {
      const ohne = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', lueckenfueller_id: 'Kürbis', zwilling_pos: 'Substantiv' })
      expect(ohne.status).toBe(422)
      expect((await ohne.json()).error).toMatch(/^„Kürbis“ hat noch keine Lückenfüller-Runden/)
      const unbekannt = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', lueckenfueller_id: 'Gibtsnicht', zwilling_pos: 'Substantiv' })
      expect(unbekannt.status).toBe(422)
      expect(speichern).not.toHaveBeenCalled()

      const mit = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', lueckenfueller_id: 'kritik', zwilling_pos: 'Substantiv' })
      expect(mit.status).toBe(200)
      expect(speichern).toHaveBeenCalledWith(expect.objectContaining({ lueckenfueller_id: 'kritik' }))
      // Wort statt Kennung („Laterne“) wird zur Kennung aufgelöst
      expect((await post(basis, { woche: '2026-W46', lemma_id: 'kritik', lueckenfueller_id: 'Laterne', zwilling_pos: 'Substantiv' })).status).toBe(200)
      expect(speichern.mock.calls.at(-1)[0].lueckenfueller_id).toBe('laterne')
    })
  })

  it('meldet ersetzt: true, wenn die Woche schon belegt ist', async () => {
    const { app } = baue()
    await mitServer(app, async (basis) => {
      await post(basis, { woche: '2026-W45', lemma_id: 'laterne', zwilling_pos: 'Substantiv' })
      const zweites = await post(basis, { woche: '2026-W45', lemma_id: 'kuerbis', zwilling_pos: 'Substantiv' })
      expect(await zweites.json()).toMatchObject({ ersetzt: true })
    })
  })

  it('unbekanntes Wort der Woche → 404 mit Feld, ohne Dateinamen, im Wortlaut von Wort prüfen', async () => {
    const { app } = baue()
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2026-W45', lemma_id: 'nichtda', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(404)
      const d = await res.json()
      expect(d.feld).toBe('lemma_id')
      expect(d.error).toBe('„nichtda“: Nicht geeignet, keine Kollokatoren im Korpus.')
      expect(d.error).not.toMatch(/wortprofil\.db/)
    })
  })

  it('unbekanntes Lückenfüller-Wort → 404 mit Feld lueckenfueller_id, ohne Dateinamen', async () => {
    const { app } = baue()
    await mitServer(app, async (basis) => {
      const res = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', lueckenfueller_id: 'nichtdaLF', zwilling_pos: 'Substantiv' })
      expect(res.status).toBe(404)
      const d = await res.json()
      expect(d.feld).toBe('lueckenfueller_id')
      expect(d.error).not.toMatch(/wortprofil\.db/)
    })
  })

  it('Links: nur leer oder http(s)://, Fehler mit Feld und deutscher Meldung', async () => {
    const { app, speichern } = baue()
    await mitServer(app, async (basis) => {
      for (const [feld, wert] of [['link', 'javascript:alert(1)'], ['zeitenwende_link', 'www.beispiel.de'], ['link', 'ftp://x.de'], ['link', 'https://']]) {
        const res = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', zwilling_pos: 'Substantiv', [feld]: wert })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'Der Link muss mit http:// oder https:// beginnen.', feld })
      }
      expect(speichern).not.toHaveBeenCalled()
      for (const wert of ['', 'https://example.org/a?b=1', 'HTTP://example.org']) {
        const res = await post(basis, { woche: '2026-W45', lemma_id: 'laterne', zwilling_pos: 'Substantiv', link: wert, zeitenwende_link: wert })
        expect(res.status).toBe(200)
      }
    })
  })

  it('Protokoll: Anlegen mit allen Feldern, Ersetzen mit vorher/nachher, Entfernen mit dem ganzen Eintrag', async () => {
    const { app, audit, aktualisiert } = baue()
    await mitServer(app, async (basis) => {
      await post(basis, {
        woche: '2026-W45', lemma_id: 'laterne', zwilling_partner: 'Lampion', zwilling_pos: 'Substantiv',
        zeitenwende_notiz: 'Vorher/Nachher', zeitenwende_link: 'https://example.org/zw', notiz: 'Erste Notiz', link: 'https://example.org/a',
      })
      expect(audit).toHaveBeenCalledTimes(1)
      const [res, id, daten] = audit.mock.calls[0]
      expect([res, id]).toEqual(['spezialwoche', '2026-W45'])
      expect(daten).toMatchObject({
        von: '2026-11-02', bis: '2026-11-08', lemma: 'laterne', zwilling_partner: 'Lampion', zwilling_pos: 'Substantiv',
        zeitenwende_notiz: 'Vorher/Nachher', zeitenwende_link: 'https://example.org/zw', lueckenfueller_id: '', notiz: 'Erste Notiz', link: 'https://example.org/a',
      })
      expect(daten.zwilling_kollokatoren).toHaveLength(2)

      await post(basis, { woche: '2026-W45', lemma_id: 'kuerbis', zwilling_pos: 'Substantiv', notiz: 'Zweite Notiz' })
      expect(audit).toHaveBeenCalledTimes(1)
      expect(aktualisiert).toHaveBeenCalledTimes(1)
      const [, , vorher, nachher] = aktualisiert.mock.calls[0]
      expect(vorher).toMatchObject({ lemma: 'laterne', notiz: 'Erste Notiz', zwilling_partner: 'Lampion', link: 'https://example.org/a' })
      expect(nachher).toMatchObject({ lemma: 'kuerbis', notiz: 'Zweite Notiz', zwilling_partner: '', link: '' })

      expect((await fetch(`${basis}/admin/spezialwoche/2026-W45`, { method: 'DELETE' })).status).toBe(200)
      expect(audit).toHaveBeenCalledTimes(2)
      const [dres, did, geloescht] = audit.mock.calls[1]
      expect([dres, did]).toEqual(['spezialwoche', '2026-W45'])
      expect(geloescht).toMatchObject({ lemma: 'kuerbis', notiz: 'Zweite Notiz', von: '2026-11-02', bis: '2026-11-08', zwilling_pos: 'Substantiv', lueckenfueller_id: '' })
    })
  })
})

describe('GET /admin/spezialwochen', () => {
  it('nennt den Anzeigenamen (erster Buchstabe groß) und den des Lückenfüller-Worts', async () => {
    const lemmata = [{ id: 'kuerbis', lemma: 'Kürbis', lueckenfueller: [{ type: 'free' }] }]
    const { app } = baue({ lemmata })
    await mitServer(app, async (basis) => {
      await post(basis, { woche: '2026-W45', lemma_id: 'laterne', lueckenfueller_id: 'Kürbis', zwilling_pos: 'Substantiv' })
      const d = await (await fetch(`${basis}/admin/spezialwochen`)).json()
      expect(d.entries[0]).toMatchObject({ woche: '2026-W45', lemmaName: 'Laterne', lueckenfuellerName: 'Kürbis', lueckenfueller_id: 'kuerbis' })
    })
  })
})

describe('isoWocheSpanne', () => {
  it('Montag bis Sonntag der ISO-Woche, auch über den Jahreswechsel', () => {
    expect(isoWocheSpanne('2026-W45')).toEqual({ von: '2026-11-02', bis: '2026-11-08' })
    expect(isoWocheSpanne('2026-W01')).toEqual({ von: '2025-12-29', bis: '2026-01-04' })
    expect(isoWocheSpanne('2026-W53')).toEqual({ von: '2026-12-28', bis: '2027-01-03' })
    expect(isoWocheSpanne('2024-W01')).toEqual({ von: '2024-01-01', bis: '2024-01-07' })
  })

  it('kennt Wochen nicht, die es nicht gibt', () => {
    expect(isoWocheSpanne('2025-W53')).toBeNull()
    expect(isoWocheSpanne('2026-W00')).toBeNull()
    expect(isoWocheSpanne('2026-W54')).toBeNull()
    expect(isoWocheSpanne('2026-45')).toBeNull()
    expect(isoWocheSpanne(undefined)).toBeNull()
  })
})
