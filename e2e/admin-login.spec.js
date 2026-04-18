import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/admin.js'

test('Admin Login zeigt Dashboard nach erfolgreichem Login', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.locator('#metric-calendar-days')).toBeVisible()
  await expect(page.locator('#metric-health')).toBeVisible()
})
