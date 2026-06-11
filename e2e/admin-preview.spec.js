import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage, getAnyCalendarDate } from './helpers/admin.js'

test('Tageseintrag Vorschau: Lemma- und Tages-Vorschau rendern', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')

  const date = await getAnyCalendarDate(page)
  test.skip(!date, 'Keine Kalenderdaten verfügbar')

  // #w1 ist immer sichtbar – kein Aufklappen noetig (kein Kollokationen-Toggle-Button
  // in admin.html; der Text ist nur ein <span> ohne Button-Rolle).
  await expect(page.locator('#w1')).toBeVisible()

  // date ist bereits YYYY-MM-DD – direkt in das date-Input eintragen.
  await page.locator('#datum').fill(date)

  const lemma = await page.evaluate(async (datum) => {
    const res = await fetch(`/admin/preview/day/${encodeURIComponent(datum)}`)
    if (!res.ok) return ''
    const data = await res.json()
    return data?.lemmata?.[0]?.lemma || ''
  }, date)

  test.skip(!lemma, 'Kein Lemma für Preview gefunden')

  await page.locator('#w1').fill(lemma)
  await page.getByRole('button', { name: 'Lemma-Vorschau' }).click()
  await expect(page.locator('#entry-preview-output .entry-preview-card').first()).toBeVisible()

  await page.getByRole('button', { name: 'Tages-Vorschau' }).click()
  await expect(page.locator('#entry-preview-output')).toContainText('Tages-Vorschau')
})
