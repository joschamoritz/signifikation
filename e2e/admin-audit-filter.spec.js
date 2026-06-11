import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

test('Audit-Log Filter nach Aktion funktioniert', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'System')

  await expect(page.locator('#audit-table-body')).toBeVisible()
  await page.locator('#audit-action').selectOption('CREATE')

  const rows = page.locator('#audit-table-body tr')
  await expect(rows.first()).toBeVisible()

  // Kein Early-Return mehr noetig: e2e/start-server.js seedet deterministisch
  // einen CREATE-Eintrag (frueher testete die Spec bei leerer DB faktisch nichts).
  const firstActionCell = rows.first().locator('td').nth(1)
  await expect(firstActionCell).toHaveText('CREATE')
})
