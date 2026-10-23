import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

test('Änderungsprotokoll: Filter nach Vorgang funktioniert', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Protokoll')

  await expect(page.locator('#audit-liste')).toBeVisible()
  await page.locator('#audit-action').selectOption('CREATE')

  // Kein Early-Return mehr noetig: e2e/start-server.js seedet deterministisch
  // einen CREATE-Eintrag (frueher testete die Spec bei leerer DB faktisch nichts).
  // Der Seed traegt den Status „OK“; er bleibt sichtbar, weil nur „FAIL“ als fehlgeschlagen gilt.
  const eintraege = page.locator('#audit-liste .pr-eintrag')
  await expect(eintraege.first()).toBeVisible()
  await expect(eintraege.first()).toHaveAttribute('data-aktion', 'CREATE')
  await expect(eintraege.first().locator('.pr-satz')).toContainText('gespeichert')
})

test('Änderungsprotokoll: Einzelheiten klappen erst auf Klick auf', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Protokoll')

  const zeile = page.locator('#audit-liste .pr-zeile').first()
  await expect(zeile).toBeVisible()
  await expect(zeile).toHaveAttribute('aria-expanded', 'false')
  const detail = page.locator(`#${await zeile.getAttribute('aria-controls')}`)
  await expect(detail).toBeHidden()

  await zeile.click()
  await expect(zeile).toHaveAttribute('aria-expanded', 'true')
  await expect(detail).toBeVisible()
  await zeile.click()
  await expect(detail).toBeHidden()
})
