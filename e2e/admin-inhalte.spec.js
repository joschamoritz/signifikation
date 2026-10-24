import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

// Werkzeuge › Inhalte (Schritt 7b). Kein Test sendet je etwas: Der Versand wird im Browser abgefangen.

// Ein Server ohne Schlüssel hätte „nicht eingerichtet“ gemeldet und die Knöpfe gesperrt: Die Vorlagen-Antwort
// wird deshalb so ergänzt, als wären Geräte angemeldet. Alles andere bleibt, wie der Server es liefert.
async function mitGeraeten(page, gesendet) {
  await page.route('**/admin/push/send', async (route) => {
    gesendet.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent: 1, failed: 0, total: 1 }) })
  })
  await page.route('**/admin/push/templates', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const antwort = await route.fetch()
    const daten = await antwort.json()
    await route.fulfill({ response: antwort, json: { ...daten, push: { web: true, ios: false, geraete: 5 }, subscriberCount: 5, eigeneGeraete: 1 } })
  })
}

test('An alle senden: Dialog öffnet, Senden bleibt bis zum Häkchen gesperrt, Esc schließt – ohne Versand', async ({ page }) => {
  const gesendet = []
  await mitGeraeten(page, gesendet)
  await loginAsAdmin(page)
  await openNavPage(page, 'Benachrichtigungen')
  await expect(page.locator('#push-stand')).toContainText('5 Geräte angemeldet')

  await page.locator('#push-send-title').fill('Neue Woche, neue Wörter')
  await page.locator('#push-send-body').fill('Ab Montag gibt es ein neues Wort der Woche.')
  await page.locator('#push-alle').click()

  const dialog = page.locator('#push-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#push-dialog-titel')).toHaveText('An alle 5 Geräte senden?')
  await expect(page.locator('#push-dialog-abbrechen')).toBeFocused()
  // Ohne Test: das Häkchen sagt es
  await expect(page.locator('#push-dialog-ok-text')).toContainText('Ohne Test senden')

  // Gesperrt: Der Klick führt zum Häkchen und sendet nichts
  await expect(page.locator('#push-dialog-senden')).toHaveAttribute('aria-disabled', 'true')
  await page.locator('#push-dialog-senden').click({ force: true })
  await expect(page.locator('#push-dialog-ok')).toBeFocused()
  expect(gesendet).toHaveLength(0)

  await page.locator('#push-dialog-ok').check()
  await expect(page.locator('#push-dialog-senden')).not.toHaveAttribute('aria-disabled', 'true')

  // Esc schließt, der Fokus kehrt zu „An alle senden …“ zurück
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('#push-alle')).toBeFocused()
  expect(gesendet).toHaveLength(0)
})

test('Freie Nachricht mit {platzhalter} öffnet keinen Dialog', async ({ page }) => {
  const gesendet = []
  await mitGeraeten(page, gesendet)
  await loginAsAdmin(page)
  await openNavPage(page, 'Benachrichtigungen')

  await page.locator('#push-send-title').fill('Heute: {lemma}')
  await page.locator('#push-send-body').fill('Was passt dazu?')
  await expect(page.locator('#push-platzhalter-hinweis')).toBeVisible()
  await page.locator('#push-alle').click()
  await expect(page.locator('#push-dialog')).toBeHidden()
  await expect(page.locator('#push-send-msg')).toContainText('Platzhalter ausschreiben')
  await page.locator('#push-test').click()
  expect(gesendet).toHaveLength(0)
})

test('Bonus-Tage: vergangener Tag und 0 Spiele werden vor dem Absenden abgelehnt', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Bonus-Tage')

  await page.locator('#freeday-date').fill('2020-01-02')
  await expect(page.locator('#freeday-date-hinweis')).toHaveText('Der Tag liegt in der Vergangenheit.')
  await page.locator('#freeday-bonus').fill('3')
  await page.locator('#bonus-start').click()
  await expect(page.locator('#freeday-date')).toBeFocused()

  const morgen = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await page.locator('#freeday-date').fill(morgen)
  await page.locator('#freeday-bonus').fill('0')
  await page.locator('#bonus-start').click()
  await expect(page.locator('#freeday-bonus-hinweis')).toHaveText('Bitte eine ganze Zahl von 1 bis 50 eintragen.')
  await expect(page.locator('#freeday-bonus')).toBeFocused()
})

test('Wort der Woche: erste freie Woche ist vorgewählt, Von und Bis gibt es nicht mehr', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Wort der Woche')
  await expect(page.locator('#sw-woche option')).toHaveCount(13)
  await expect(page.locator('#sw-woche')).toHaveValue(/^\d{4}-W\d{2}$/)
  await expect(page.locator('#sw-von, #sw-bis')).toHaveCount(0)
})

test('Klassenraum-Demo: ein zu kurzer Wortlisten-Eintrag wird am Feld auf Deutsch gemeldet', async ({ page }) => {
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge/klassenraum-demo' })
  await expect(page.locator('#page-klassenraum-demo')).toHaveClass(/is-active/)
  await expect(page.locator('#demo-kol-lemma')).not.toHaveValue('')
  await page.locator('#demo-wz-words').fill('tief\noffen')
  await expect(page.locator('#demo-wz-words-zahl')).toHaveText('2 Wörter · erlaubt 4 bis 12')
  await page.locator('#demo-start').click()
  await expect(page.locator('#demo-wz-words-fehler')).toHaveText('Mindestens 4 Wörter (jetzt 2).')
  await expect(page.locator('#demo-wz-words')).toBeFocused()
})

test('Enter im Titelfeld sendet nichts: „Test an meine Geräte“ ist kein Absende-Knopf', async ({ page }) => {
  const gesendet = []
  await mitGeraeten(page, gesendet)
  await loginAsAdmin(page)
  await openNavPage(page, 'Benachrichtigungen')
  await expect(page.locator('#push-test')).toHaveAttribute('type', 'button')

  await page.locator('#push-send-title').fill('Nur ein Titel')
  await page.locator('#push-send-body').fill('Und ein Text')
  await page.locator('#push-send-title').press('Enter')
  await page.waitForTimeout(400)
  expect(gesendet).toHaveLength(0)
})

test('Vorlage löschen und „Rückgängig“ doppelt geklickt: je eine Anfrage', async ({ page }) => {
  const gesendet = []
  const angelegt = []
  const geloescht = []
  await mitGeraeten(page, gesendet)
  // Schreibende Antworten gemockt: Die Test-Datenbank bleibt unverändert
  await page.route('**/admin/push/templates', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    angelegt.push(route.request().postDataJSON())
    await new Promise((r) => setTimeout(r, 400))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 9999 }) })
  })
  await page.route('**/admin/push/templates/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    geloescht.push(route.request().url())
    await new Promise((r) => setTimeout(r, 300))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await loginAsAdmin(page)
  await openNavPage(page, 'Benachrichtigungen')

  const erste = page.locator('#push-templates-list .in-vorlage').first()
  await erste.locator('.in-vorlage-zeile').click()
  await erste.locator('[data-action="push-delete-template"]').dblclick()
  await expect(page.locator('#push-template-msg [data-action="push-rueckgaengig"]')).toBeVisible()
  expect(geloescht).toHaveLength(1)

  await page.locator('#push-template-msg [data-action="push-rueckgaengig"]').dblclick()
  await expect(page.locator('#push-template-msg')).toContainText('Vorlage wiederhergestellt')
  expect(angelegt).toHaveLength(1)
  expect(gesendet).toHaveLength(0)
})

test('Bonus-Tag ersetzen: Hinweis und Knopf „Ersetzen“ am Formular, kein zusätzlicher Dialog', async ({ page }) => {
  const tag = '2099-12-24'
  const gespeichert = []
  await page.route('**/admin/free-days', async (route) => {
    const r = route.request()
    if (r.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [{ date: tag, label: 'Heiligabend', bonus_count: 3 }] }) })
    gespeichert.push(r.postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ersetzt: true }) })
  })
  await loginAsAdmin(page)
  await openNavPage(page, 'Bonus-Tage')
  await expect(page.locator('#bonus-dialog')).toHaveCount(0)

  await page.locator('#freeday-date').fill(tag)
  await page.locator('#freeday-bonus').fill('2')
  await expect(page.locator('#freeday-date-hinweis')).toContainText('Eintragen ersetzt ihn')
  await expect(page.locator('#bonus-start')).toContainText('Ersetzen')
  await page.locator('#bonus-start').click()
  await expect(page.locator('#freeday-msg')).toContainText('ersetzt: 2 zusätzliche Spiele')
  expect(gespeichert).toEqual([{ date: tag, label: '', bonus_count: 2 }])
})

test('Wort der Woche: ein ungültiger Link wird am Link-Feld gemeldet (Server prüft, nichts wird gespeichert)', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Wort der Woche')
  await page.locator('#sw-lemma-id').fill('Haus')
  await page.locator('[data-target="sw-neben"]').click()
  await page.locator('#sw-link').fill('javascript:alert(1)')
  await page.locator('#sw-start').click()
  await expect(page.locator('#sw-link-fehler')).toHaveText('Der Link muss mit http:// oder https:// beginnen.')
  await expect(page.locator('#sw-link')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#sw-link')).toBeFocused()
})
