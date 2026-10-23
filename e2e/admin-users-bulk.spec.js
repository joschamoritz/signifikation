import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

// Nutzer (#nutzer) und Konto (#nutzer/<id>): Auswahl mit Sammelaktionen erst bei Auswahl,
// Linien-Liste statt Tabelle, Konto als Unterseite mit Rückleiste.
// Voraussetzung: start-server.js legt ein normales Konto an (Admin-Konten haben kein Auswahlkästchen).

test('Nutzer: Auswahl zeigt die Sammelaktionen, Aufheben blendet sie aus', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Nutzer')

  await expect(page.locator('#users-table-body .nu-liste')).toBeVisible()
  // Ohne Auswahl keine Sammelaktionen: Suche und Liste stehen vorn.
  await expect(page.locator('#users-sammel')).toBeHidden()

  const firstCheckbox = page.locator('.user-select-checkbox').first()
  await expect(firstCheckbox).toBeVisible()
  await firstCheckbox.check()

  await expect(page.locator('#users-bulk-count')).toHaveText('1 ausgewählt')
  await expect(page.locator('#users-sammel')).toBeVisible()
  await expect(page.locator('#users-bulk-delete-text')).toHaveText('1 Konto löschen …')

  await page.locator('#users-clear-selection').click()
  await expect(page.locator('#users-sammel')).toBeHidden()
  await expect(page.locator('#users-bulk-count')).toHaveText('')
})

test('Nutzer: Admin-Konten haben kein Auswahlkästchen', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Nutzer')
  await expect(page.locator('#users-table-body .nu-liste')).toBeVisible()

  const adminZeilen = page.locator('.nu-zeile', { has: page.locator('.nu-rolle[data-rolle="admin"]') })
  await expect(adminZeilen.first()).toBeVisible()
  await expect(adminZeilen.first().locator('input[type="checkbox"]')).toHaveCount(0)
})

test('Nutzer: Name öffnet das Konto, die Rückleiste führt zum selben Namen zurück', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Nutzer')
  await expect(page.locator('#users-table-body .nu-liste')).toBeVisible()

  const name = page.locator('.nu-name').first()
  const href = await name.getAttribute('href')
  expect(href).toMatch(/^#nutzer\/[A-Za-z0-9_-]+$/)
  await name.click()

  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe(href)
  await expect(page.locator('#page-user')).toHaveClass(/is-active/)
  await expect(page.locator('#user-detail .tag-abschnitt-titel', { hasText: 'Kauf und Premium' })).toBeVisible()
  // Adresse und Titel enthalten weder Name noch E-Mail
  expect(await page.title()).not.toContain('@')
  expect(await page.title()).toBe('Konto · Nutzer – Signifikation Admin')

  await page.locator('#page-back').click()
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#nutzer')
  await expect(page.locator('#page-users')).toHaveClass(/is-active/)
  await expect(page.locator(`.nu-name[href="${href}"]`)).toBeFocused()
})

test('Nutzer: unbekannte Konto-Adresse zeigt „gibt es nicht (mehr)“', async ({ page }) => {
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#nutzer/gibt-es-nicht-123' })
  await expect(page.locator('#page-user')).toHaveClass(/is-active/)
  await expect(page.locator('#user-detail .li-leer-titel')).toHaveText('Dieses Konto gibt es nicht (mehr)')
})
