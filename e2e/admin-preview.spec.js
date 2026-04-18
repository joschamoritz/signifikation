import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage, getAnyCalendarDate } from './helpers/admin.js'

test('Tageseintrag Vorschau: Lemma- und Tages-Vorschau rendern', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')

  const date = await getAnyCalendarDate(page)
  test.skip(!date, 'Keine Kalenderdaten verfügbar')

  const [mm, dd] = date.split('-')
  const year = new Date().getFullYear()
  const isoDate = `${year}-${mm}-${dd}`

  // Eingabefelder liegen im kollabierten Bereich, daher zuerst aufklappen.
  await page.getByRole('button', { name: /Kollokationen/ }).click()
  await expect(page.locator('#w1')).toBeVisible()

  await page.locator('#datum').fill(isoDate)

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
