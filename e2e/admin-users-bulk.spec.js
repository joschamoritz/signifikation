import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

test('Nutzer Bulk-UI: Auswahl + Role-Action sichtbar und nutzbar', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Nutzer')

  await expect(page.locator('#users-table-body')).toBeVisible()

  const firstCheckbox = page.locator('.user-select-checkbox').first()
  await expect(firstCheckbox).toBeVisible()
  await firstCheckbox.check()

  await expect(page.locator('#users-bulk-count')).not.toHaveText('0 ausgewählt')
  await expect(page.locator('#users-bulk-run-btn')).toBeEnabled()

  await page.locator('#users-bulk-action').selectOption('setRole')
  await expect(page.locator('#users-bulk-role-wrap')).toBeVisible()
  await expect(page.locator('#users-bulk-export-wrap')).toBeHidden()

  await page.locator('#users-bulk-action').selectOption('export')
  await expect(page.locator('#users-bulk-export-wrap')).toBeVisible()
})
