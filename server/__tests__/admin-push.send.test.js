// Werkzeuge › Benachrichtigungen (Schritt 7b): Sicherungen des Versands und Protokoll der Vorlagen.
// Der Sender ist hier IMMER gemockt: Kein Test darf je eine echte Benachrichtigung auslösen.
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../notifications/sender.js', async (importOriginal) => {
  const echt = await importOriginal()
  return {
    ...echt,
    sendPushToAll: vi.fn(),
    sendPushToUser: vi.fn(),
    getSubscriberCount: vi.fn(() => 7),
    pushStatus: vi.fn(() => ({ web: true, ios: false, geraete: 7 })),
  }
})

const { sendPushToAll, sendPushToUser } = await import('../notifications/sender.js')
const { default: adminRouter } = await import('../routes/admin.js')
const { default: db } = await import('../db.js')

const PREFIX = `push-send-${Date.now()}`
const adminId = `${PREFIX}-admin`
const angelegt = []   // ids der Vorlagen, die dieser Test angelegt hat

const headers = (token) => ({ 'content-type': 'application/json', cookie: `better-auth.session_token=${token}` })

describe('admin push: Versand und Vorlagen (Sender gemockt)', () => {
  let server
  let basis
  let token
  const post = (pfad, body) => fetch(`${basis}${pfad}`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
  const put = (pfad, body) => fetch(`${basis}${pfad}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(body) })
  const vorlageAnlegen = async (body) => {
    const res = await post('/admin/push/templates', body)
    expect(res.status).toBe(201)
    const { id } = await res.json()
    angelegt.push(id)
    return id
  }
  const auditAktionen = (id) => db.prepare("SELECT action FROM audit_log WHERE resource = 'push_vorlage' AND resource_id = ? ORDER BY id").all(String(id)).map((r) => r.action)

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    basis = `http://127.0.0.1:${server.address().port}`

    const jetzt = new Date().toISOString()
    db.prepare('INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 1, NULL, ?, ?)').run(adminId, 'Push Send Test', `${adminId}@example.test`, jetzt, jetzt)
    db.prepare('INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)').run(adminId, 'admin', Date.now(), Date.now())
    token = randomUUID()
    db.prepare('INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', jetzt, jetzt)
  })

  beforeEach(() => {
    sendPushToAll.mockReset()
    sendPushToUser.mockReset()
  })

  afterAll(async () => {
    for (const id of angelegt) db.prepare('DELETE FROM push_templates WHERE id = ?').run(id)
    db.prepare("DELETE FROM audit_log WHERE resource = 'push_vorlage' AND resource_id IN (" + angelegt.map(() => '?').join(',') + ')').run(...angelegt.map(String))
    db.prepare("DELETE FROM audit_log WHERE resource = 'push' AND changes_json LIKE '%Sendetest%'").run()
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(adminId)
    db.prepare('DELETE FROM session WHERE userId = ?').run(adminId)
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(adminId)
    db.prepare('DELETE FROM user WHERE id = ?').run(adminId)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  describe('Versand an alle', () => {
    it('ein zweiter Versand während des ersten bekommt 409 und sendet nichts; danach ist die Sperre frei', async () => {
      let fertig
      sendPushToAll.mockImplementationOnce(() => new Promise((resolve) => { fertig = () => resolve({ sent: 3, failed: 1, total: 4 }) }))

      const erster = post('/admin/push/send', { mode: 'free', title: 'Sendetest eins', body: 'Erster Versand' })
      await vi.waitFor(() => expect(sendPushToAll).toHaveBeenCalledTimes(1))

      const zweiter = await post('/admin/push/send', { mode: 'free', title: 'Sendetest zwei', body: 'Zweiter Versand' })
      expect(zweiter.status).toBe(409)
      expect((await zweiter.json()).error).toMatch(/^Es läuft schon ein Versand an alle\./)
      expect(sendPushToAll).toHaveBeenCalledTimes(1)

      fertig()
      const antwort = await erster
      expect(antwort.status).toBe(200)
      expect(await antwort.json()).toMatchObject({ ok: true, sent: 3, failed: 1, total: 4 })

      sendPushToAll.mockResolvedValueOnce({ sent: 1, failed: 0, total: 1 })
      const dritter = await post('/admin/push/send', { mode: 'free', title: 'Sendetest drei', body: 'Dritter Versand' })
      expect(dritter.status).toBe(200)
    })

    it('ein fehlgeschlagener Versand gibt die Sperre wieder frei', async () => {
      sendPushToAll.mockRejectedValueOnce(new Error('Gateway kaputt'))
      const kaputt = await post('/admin/push/send', { mode: 'free', title: 'Sendetest kaputt', body: 'Fehler' })
      expect(kaputt.status).toBe(500)

      sendPushToAll.mockResolvedValueOnce({ sent: 0, failed: 0, total: 0 })
      expect((await post('/admin/push/send', { mode: 'free', title: 'Sendetest danach', body: 'Wieder frei' })).status).toBe(200)
    })

    it('protokolliert den Versand und nennt ihn beim nächsten Laden als letzten Versand', async () => {
      sendPushToAll.mockResolvedValueOnce({ sent: 5, failed: 2, total: 7 })
      expect((await post('/admin/push/send', { mode: 'free', title: 'Sendetest Protokoll', body: 'Text' })).status).toBe(200)
      const liste = await (await fetch(`${basis}/admin/push/templates`, { headers: headers(token) })).json()
      expect(liste.letzterVersand).toMatchObject({ titel: 'Sendetest Protokoll', sent: 5, total: 7 })
      expect(typeof liste.letzterVersand.zeit).toBe('string')
    })

    it('lehnt Freitext mit {platzhalter} ab (er ginge wörtlich hinaus) – an alle und als Test', async () => {
      for (const body of [
        { mode: 'free', title: 'Heute: {lemma}', body: 'Was passt dazu?' },
        { mode: 'free', title: 'Heute', body: 'Mit {wortA} und {wortB}' },
        { mode: 'self', title: 'Heute: {lemma}', body: 'Test' },
      ]) {
        const res = await post('/admin/push/send', body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await res.json()).error).toMatch(/Platzhalter nicht ersetzt/)
      }
      expect(sendPushToAll).not.toHaveBeenCalled()
      expect(sendPushToUser).not.toHaveBeenCalled()
    })

    it('Vorlage mit heute nicht befüllbarem Platzhalter wird nicht gesendet (400)', async () => {
      // {streak} ist in täglichen Vorlagen nie befüllt
      const id = await vorlageAnlegen({ title: 'Serie {streak}', body: 'Nie heute' })
      const res = await post('/admin/push/send', { mode: 'template', templateId: id })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Heute nicht versendbar: {streak} ist heute nicht befüllt.')
      expect(sendPushToAll).not.toHaveBeenCalled()
    })

    it('Streak-Vorlagen gehen nie an alle', async () => {
      const id = await vorlageAnlegen({ title: 'Abends {streak}', body: 'Weiter', category: 'streak' })
      const res = await post('/admin/push/send', { mode: 'template', templateId: id })
      expect(res.status).toBe(400)
      expect(sendPushToAll).not.toHaveBeenCalled()
    })
  })

  describe('Test an die eigenen Geräte', () => {
    it('mode self mit templateId rendert die Vorlage wie der tägliche Versand', async () => {
      const id = await vorlageAnlegen({ title: 'Sendetest {wochentag}', body: 'Heute ist {wochentag}.' })
      sendPushToUser.mockResolvedValueOnce({ sent: 2, failed: 0 })
      const res = await post('/admin/push/send', { mode: 'self', templateId: id })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, sent: 2, failed: 0, total: 2 })
      const [userId, payload] = sendPushToUser.mock.calls[0]
      expect(userId).toBe(adminId)
      expect(payload.title).toMatch(/^Sendetest (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)$/)
      expect(payload.body).toMatch(/^Heute ist \w+\.$/)
      expect(sendPushToAll).not.toHaveBeenCalled()
    })

    it('Streak-Vorlage im Test mit Beispielserie 5', async () => {
      const id = await vorlageAnlegen({ title: 'Serie {streak}', body: 'Ein Wort genügt.', category: 'streak' })
      sendPushToUser.mockResolvedValueOnce({ sent: 1, failed: 0 })
      const res = await post('/admin/push/send', { mode: 'self', templateId: id })
      expect(res.status).toBe(200)
      expect(sendPushToUser.mock.calls[0][1].title).toBe('Serie 5')
    })

    it('mode self mit nicht befüllbarer Vorlage → 400, nichts gesendet', async () => {
      const id = await vorlageAnlegen({ title: 'Nie {streak}', body: 'x' })
      const res = await post('/admin/push/send', { mode: 'self', templateId: id })
      expect(res.status).toBe(400)
      expect(sendPushToUser).not.toHaveBeenCalled()
    })

    it('ohne Gerät auf dem Konto: deutsche Meldung', async () => {
      sendPushToUser.mockResolvedValueOnce({ sent: 0, failed: 0 })
      const res = await post('/admin/push/send', { mode: 'self', title: 'Test', body: 'Ohne Gerät' })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/^Auf deinem Konto ist kein Gerät angemeldet/)
    })

    it('GET nennt die eigenen Geräte, den Tageskontext und das heutige Datum (Berlin)', async () => {
      db.prepare('INSERT INTO push_subscriptions (id, user_id, platform, endpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`${PREFIX}-sub`, adminId, 'web', `https://push.example.test/${PREFIX}`, Date.now(), Date.now())
      const liste = await (await fetch(`${basis}/admin/push/templates`, { headers: headers(token) })).json()
      expect(liste.eigeneGeraete).toBe(1)
      expect(liste.subscriberCount).toBe(7)
      expect(liste.push).toEqual({ web: true, ios: false, geraete: 7 })
      expect(liste.heute).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(liste.kontext).toHaveProperty('wochentag')
      expect(liste.kontext.streak).toBeNull()
    })
  })

  describe('Vorlagen', () => {
    it('lehnen unbekannte Platzhalter ab (sie würden jeden Tag übersprungen)', async () => {
      const neu = await post('/admin/push/templates', { title: 'Hallo {unbekannt}', body: 'x' })
      expect(neu.status).toBe(400)
      expect((await neu.json()).error).toMatch(/^Unbekannter Platzhalter: \{unbekannt\}/)

      const id = await vorlageAnlegen({ title: 'Gut {lemma}', body: 'x' })
      const aendern = await put(`/admin/push/templates/${id}`, { title: 'Schlecht {gibtsnicht}', body: 'x' })
      expect(aendern.status).toBe(400)
    })

    it('nehmen beim Anlegen die Kategorie (daily oder streak)', async () => {
      const abends = await vorlageAnlegen({ title: 'Abend {streak}', body: 'x', category: 'streak' })
      const tags = await vorlageAnlegen({ title: 'Tag', body: 'x' })
      expect(db.prepare('SELECT category FROM push_templates WHERE id = ?').get(abends).category).toBe('streak')
      expect(db.prepare('SELECT category FROM push_templates WHERE id = ?').get(tags).category).toBe('daily')
      const ungueltig = await post('/admin/push/templates', { title: 'x', body: 'y', category: 'oft' })
      expect(ungueltig.status).toBe(400)
    })

    it('Anlegen, Ändern und Löschen stehen im Änderungsprotokoll', async () => {
      const id = await vorlageAnlegen({ title: 'Protokoll eins', body: 'Text eins' })
      expect((await put(`/admin/push/templates/${id}`, { title: 'Protokoll zwei', body: 'Text zwei', enabled: false })).status).toBe(200)
      const del = await fetch(`${basis}/admin/push/templates/${id}`, { method: 'DELETE', headers: headers(token) })
      expect(del.status).toBe(200)
      expect(auditAktionen(id)).toEqual(['CREATE', 'UPDATE', 'DELETE'])

      const aendern = db.prepare("SELECT changes_json FROM audit_log WHERE resource = 'push_vorlage' AND resource_id = ? AND action = 'UPDATE'").get(String(id))
      expect(JSON.parse(aendern.changes_json)).toMatchObject({ before: { title: 'Protokoll eins', enabled: true }, after: { title: 'Protokoll zwei', enabled: false } })
      const loeschen = db.prepare("SELECT changes_json FROM audit_log WHERE resource = 'push_vorlage' AND resource_id = ? AND action = 'DELETE'").get(String(id))
      expect(JSON.parse(loeschen.changes_json).before).toMatchObject({ title: 'Protokoll zwei' })
    })
  })
})
