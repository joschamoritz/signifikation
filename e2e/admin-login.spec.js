import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/admin.js'

test('Admin Login zeigt Dashboard nach erfolgreichem Login', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.locator('#wo-heute')).toBeVisible()
  await expect(page.locator('#dashboard-calendar-preview .wo-tag')).toHaveCount(7)
})

test('Admin-Limit beim Laden: Hinweis statt stummer Anmeldung, danach geht es von selbst weiter', async ({ page }) => {
  await loginAsAdmin(page)
  // Sitzung gültig, aber die erste Prüfung trifft das Admin-Limit
  let erste = true
  await page.route('**/admin/kalender', (route) => {
    if (!erste) return route.continue()
    erste = false
    return route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, contentType: 'application/json', body: '{"error":"Zu viele Admin-Anfragen, bitte kurz warten."}' })
  })
  await page.reload()
  await expect(page.locator('#login-error')).toContainText('Zu viele Admin-Anfragen')
  await expect(page.locator('#login-error')).toContainText('Neuer Versuch in')
  await expect(page.locator('#main-container')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#login-overlay')).toBeHidden()
})
