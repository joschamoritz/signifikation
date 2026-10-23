import { test, expect } from '@playwright/test'
import { loginAsAdmin, openNavPage, getAnyCalendarDate } from './helpers/admin.js'

test('Tagesseite: Wort-Vorschau rendert den Wörterbuch-Eintrag', async ({ page }) => {
  await loginAsAdmin(page)
  await openNavPage(page, 'Tageseinträge')

  const date = await getAnyCalendarDate(page)
  test.skip(!date, 'Keine Kalenderdaten verfügbar')

  // #w1 ist immer sichtbar – kein Aufklappen nötig.
  await expect(page.locator('#w1')).toBeVisible()

  // Ein Wort eines vorhandenen Tages aus dem Kalender (die frühere Tages-Vorschau
  // und ihr Endpunkt werden von der Seite nicht mehr aufgerufen).
  const lemma = await page.evaluate(async (datum) => {
    const res = await fetch('/admin/kalender')
    if (!res.ok) return ''
    const data = await res.json()
    return data?.[datum]?.lemmata?.[0]?.lemma || ''
  }, date)

  test.skip(!lemma, 'Kein Lemma für Preview gefunden')

  await page.locator('#w1').fill(lemma)
  // Der Vorschau-Knopf trägt das eingetragene Wort.
  const vorschauKnopf = page.locator('#tag-vorschau-1')
  await expect(vorschauKnopf.locator('.tag-vorschau-text')).toHaveText(lemma)
  await vorschauKnopf.click()
  const eintrag = page.locator('#entry-preview-output .tag-vorschau-eintrag')
  await expect(eintrag).toBeVisible()
  await expect(eintrag).toContainText(lemma)
})
