import { expect } from '@playwright/test'

export async function loginAsAdmin(page, adminKey = process.env.ADMIN_KEY || 'dev-only') {
  await page.goto('/admin')
  await expect(page.locator('#login-overlay')).toBeVisible()
  await page.locator('#login-key').fill(adminKey)
  await page.locator('#login-btn').click()
  await expect(page.locator('#main-container')).toBeVisible()
  await expect(page.locator('#page-title')).toContainText('Dashboard')
}

export async function openNavPage(page, label) {
  await page.getByRole('button', { name: label }).click()
}

export async function getAnyCalendarDate(page) {
  return page.evaluate(async () => {
    const res = await fetch('/admin/kalender')
    if (!res.ok) return null
    const data = await res.json()
    const keys = Object.keys(data || {})
    if (!keys.length) return null
    return keys[0]
  })
}
