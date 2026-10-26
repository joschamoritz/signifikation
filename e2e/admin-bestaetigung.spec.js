import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

// Gemeinsame Rückfrage (#bestaetige-dialog) statt window.confirm: Fokus, Esc, Hash-Zurücksetzen im Router.
// Eine window-Rückfrage würde hier hängen bleiben: page.on('dialog') ist absichtlich nicht gesetzt.

const dialog = (page) => page.locator('#bestaetige-dialog')
const hash = (page) => page.evaluate(() => globalThis.location.hash)

// Der Knopf der Aktion nimmt Mausklicks erst nach einer kurzen Sperre an (Doppelklick auf den Auslöser): erst warten.
async function bestaetige(page) {
  await expect(dialog(page)).toBeVisible()
  await page.waitForTimeout(500)
  await page.locator('#bestaetige-ok').click()
  await expect(dialog(page)).toBeHidden()
}

test('Tagesformular: Verlassen mit ungespeicherten Änderungen fragt im Dialog, Esc bleibt, „Verlassen“ geht', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')
  await page.locator('#w1').fill('Ungespeichert')
  await expect(page.locator('#entry-dirty-indicator')).toHaveText('Ungespeicherte Änderungen')

  await page.evaluate(() => { globalThis.location.hash = '#planen' })
  await expect(dialog(page)).toBeVisible()
  await expect(page.locator('#bestaetige-titel')).toHaveText('Es gibt ungespeicherte Änderungen. Wirklich die Seite verlassen?')
  await expect(page.locator('#bestaetige-ok')).toHaveText('Verlassen')
  await expect(page.locator('#bestaetige-abbrechen')).toBeFocused()
  // Die Adresse ist schon zurückgesetzt, die Seite bleibt, wie sie ist
  expect(await hash(page)).toBe('#planen/tag/neu')

  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  expect(await hash(page)).toBe('#planen/tag/neu')
  await expect(page.locator('#w1')).toHaveValue('Ungespeichert')

  // Die Sperre gilt nur für Mausklicks und wird im Seitenkontext geprüft, ohne Abhängigkeit von der Laufzeit des
  // Tests: Ein Mausklick (detail 1) unmittelbar nach dem Öffnen zählt nicht, ein Tastaturklick (detail 0) sofort.
  const sofort = await page.evaluate(async () => {
    const dlg = globalThis.document.getElementById('bestaetige-dialog')
    const ok = globalThis.document.getElementById('bestaetige-ok')
    globalThis.location.hash = '#planen'
    while (!dlg.open) await new Promise((fertig) => setTimeout(fertig, 0))
    ok.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true, detail: 1 }))
    const nachMaus = dlg.open
    ok.click()
    return { nachMaus, nachTastatur: dlg.open }
  })
  expect(sofort).toEqual({ nachMaus: true, nachTastatur: false })
  await expect.poll(() => hash(page)).toBe('#planen')
  await expect(page.locator('#page-dashboard')).toHaveClass(/is-active/)
})

test('Tagesformular: Browser-Zurück fragt ebenfalls und springt bei „Verlassen“ genau einen Schritt zurück', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')
  await page.locator('#w1').fill('Ungespeichert')
  await expect(page.locator('#entry-dirty-indicator')).toHaveText('Ungespeicherte Änderungen')

  await page.goBack()
  await expect(dialog(page)).toBeVisible()
  expect(await hash(page)).toBe('#planen/tag/neu')

  await page.locator('#bestaetige-abbrechen').click()
  await expect(dialog(page)).toBeHidden()
  expect(await hash(page)).toBe('#planen/tag/neu')

  await page.goBack()
  await bestaetige(page)
  await expect.poll(() => hash(page)).toBe('#planen')

  // Vorwärts zurück ins Formular: Der angefangene neue Tag bleibt erhalten, ohne neue Rückfrage
  await page.goForward()
  await expect.poll(() => hash(page)).toBe('#planen/tag/neu')
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('#w1')).toHaveValue('Ungespeichert')
})

test('Tagesformular: „Änderungen verwerfen“ fragt im Dialog und setzt erst bei Bestätigung zurück', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')
  await page.locator('#w1').fill('Ungespeichert')

  const reset = page.locator('#entry-reset-btn')
  await reset.click()
  await expect(page.locator('#bestaetige-titel')).toHaveText('Ungespeicherte Änderungen verwerfen?')
  await expect(page.locator('#bestaetige-text')).toHaveText('Der zuletzt gespeicherte Stand kommt zurück.')
  await expect(page.locator('#bestaetige-ok')).toHaveText('Verwerfen')
  await page.locator('#bestaetige-abbrechen').click()
  await expect(dialog(page)).toBeHidden()
  await expect(reset).toBeFocused()
  await expect(page.locator('#w1')).toHaveValue('Ungespeichert')

  await reset.click()
  await bestaetige(page)
  await expect(page.locator('#w1')).toHaveValue('')
})

test('Nutzer: „Konten löschen“ fragt im Dialog; Abbrechen sendet nichts und gibt den Fokus zurück', async ({ page }) => {
  const anfragen = []
  page.on('request', (r) => { if (r.method() !== 'GET') anfragen.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await loginAsAdmin(page)
  await openNavPage(page, 'Nutzer')
  await expect(page.locator('#users-table-body .nu-liste')).toBeVisible()
  await page.locator('.user-select-checkbox').first().check()
  await expect(page.locator('#users-sammel')).toBeVisible()

  const anzahl = anfragen.length
  await page.locator('#users-bulk-delete-btn').click()
  await expect(page.locator('#bestaetige-titel')).toHaveText('1 Konto löschen?')
  await expect(page.locator('#bestaetige-ok')).toHaveText('Löschen')
  await expect(page.locator('#bestaetige-ok')).toHaveClass(/li-loeschen/)
  await expect(page.locator('#bestaetige-liste li').last()).toHaveText('Das lässt sich nicht rückgängig machen.')

  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('#users-bulk-delete-btn')).toBeFocused()
  expect(anfragen.length).toBe(anzahl)
})

test('Tagesformular: Ein Hash-Link fragt vor dem Navigieren; „Abbrechen“ hinterlässt keinen Verlaufseintrag', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')
  await page.locator('#w1').fill('Ungespeichert')
  await expect(page.locator('#entry-dirty-indicator')).toHaveText('Ungespeicherte Änderungen')
  const laenge = await page.evaluate(() => globalThis.history.length)

  const link = page.locator('.adm-nav-item[href="#planen"]').first()
  await link.click()
  await expect(dialog(page)).toBeVisible()
  // Die Adresse hat sich nie geändert: Es gibt nichts zurückzunehmen
  expect(await hash(page)).toBe('#planen/tag/neu')
  await page.locator('#bestaetige-abbrechen').click()
  await expect(dialog(page)).toBeHidden()
  await expect(link).toBeFocused()
  expect(await page.evaluate(() => globalThis.history.length)).toBe(laenge)
  await expect(page.locator('#w1')).toHaveValue('Ungespeichert')

  // Vorwärts gibt es nicht: nichts geschieht, keine Rückfrage
  await page.goForward()
  expect(await hash(page)).toBe('#planen/tag/neu')
  await expect(dialog(page)).toBeHidden()

  await link.click()
  await bestaetige(page)
  await expect.poll(() => hash(page)).toBe('#planen')
  await expect(page.locator('#page-dashboard')).toHaveClass(/is-active/)
})

// Verbraucht das Konto „e2e-loesch-konto“ aus start-server.js: Bei einem wiederverwendeten Server (reuseExistingServer)
// vor dem nächsten Lauf neu starten, sonst fehlt das Konto.
test('Nutzer: Konto löschen sendet DELETE mit JSON-Kopfzeile und entfernt das Konto wirklich', async ({ page }) => {
  const anfragen = []
  page.on('request', (r) => { if (r.method() === 'DELETE') anfragen.push({ pfad: new URL(r.url()).pathname, typ: r.headers()['content-type'], csrf: r.headers()['x-requested-with'] }) })
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#nutzer/e2e-loesch-konto' })
  await expect(page.locator('#page-user')).toHaveClass(/is-active/)
  await expect(page.locator('#user-delete-btn')).toBeVisible()

  await page.locator('#user-delete-btn').click()
  await expect(page.locator('#bestaetige-titel')).toHaveText('Konto von E2E Loeschen löschen?')
  await bestaetige(page)

  await expect.poll(() => hash(page)).toBe('#nutzer')
  await expect(page.locator('#users-status')).toHaveText('Konto gelöscht.')
  expect(anfragen).toEqual([{ pfad: '/admin/users/e2e-loesch-konto', typ: 'application/json', csrf: 'signifikation-app' }])
  const status = await page.evaluate(async () => (await fetch('/admin/users/e2e-loesch-konto')).status)
  expect(status).toBe(404)
})

test('Nutzer: Ein Adresswechsel schließt eine offene Rückfrage, gelöscht wird nichts', async ({ page }) => {
  const anfragen = []
  page.on('request', (r) => { if (r.method() !== 'GET') anfragen.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await loginAsAdmin(page)
  await openNavPage(page, 'Nutzer')
  await expect(page.locator('#users-table-body .nu-liste')).toBeVisible()
  await page.locator('.nu-name', { hasText: 'E2E Probe' }).click()
  await expect(page.locator('#page-user')).toHaveClass(/is-active/)
  await expect(page.locator('#user-delete-btn')).toBeVisible()
  const anzahl = anfragen.length

  await page.locator('#user-delete-btn').click()
  await expect(dialog(page)).toBeVisible()
  await page.goBack()
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('#page-users')).toHaveClass(/is-active/)
  expect(anfragen.length).toBe(anzahl)
})
