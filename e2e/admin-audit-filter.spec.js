import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage } from './helpers/admin.js'

test('Audit-Log Filter nach Aktion funktioniert', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'System')

  await expect(page.locator('#audit-table-body')).toBeVisible()
  await page.locator('#audit-action').selectOption('CREATE')

  const rows = page.locator('#audit-table-body tr')
  await expect(rows.first()).toBeVisible()

  const firstRowText = ((await rows.first().textContent()) || '').trim()
  if (firstRowText.includes('Noch keine Audit-Einträge vorhanden')) {
    await expect(page.locator('#audit-count')).toContainText('0 Einträge')
    return
  }

  const firstActionCell = rows.first().locator('td').nth(1)
  await expect(firstActionCell).toHaveText('CREATE')
})
