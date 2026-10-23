import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/admin.js'

// Bis Schritt 7a lagen Zustand, Sicherung, Kursmaterial und Protokoll auf einer Seite (#werkzeuge/system?abschnitt=…).
// Alte Lesezeichen müssen auf die neuen Unterseiten führen – ohne zusätzlichen Verlaufseintrag.
const FAELLE = [
  { alt: '#werkzeuge/system?abschnitt=sicherung', neu: '#werkzeuge/sicherung', seite: 'sicherung' },
  { alt: '#werkzeuge/system?abschnitt=kursmaterial', neu: '#werkzeuge/kursmaterial', seite: 'kursmaterial' },
  { alt: '#werkzeuge/system?abschnitt=protokoll', neu: '#werkzeuge/protokoll', seite: 'protokoll' },
  { alt: '#werkzeuge/system?abschnitt=zustand', neu: '#werkzeuge/system', seite: 'system' },
  { alt: '#werkzeuge/system?abschnitt=unbekannt', neu: '#werkzeuge/system', seite: 'system' },
]

for (const { alt, neu, seite } of FAELLE) {
  test(`${alt} führt auf ${neu}, ohne Verlaufseintrag`, async ({ page }) => {
    await loginAsAdmin(page)
    const laenge = await page.evaluate(() => globalThis.history.length)

    await page.evaluate((hash) => { globalThis.location.hash = hash }, alt)
    await expect(page.locator(`#page-${seite}`)).toHaveClass(/is-active/)
    await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe(neu)
    // Der Sprung selbst ist ein Eintrag; die Weiterleitung ersetzt ihn nur (kein zweiter).
    expect(await page.evaluate(() => globalThis.history.length)).toBe(laenge + 1)

    // Zurück führt hinter den Sprung, nicht auf die alte Adresse
    await page.goBack()
    await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#planen')
  })
}

test('Die Übersicht verlinkt die vier Betriebsseiten', async ({ page }) => {
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge' })
  await expect(page.locator('#page-werkzeuge')).toHaveClass(/is-active/)
  for (const hash of ['#werkzeuge/system', '#werkzeuge/sicherung', '#werkzeuge/kursmaterial', '#werkzeuge/protokoll']) {
    await expect(page.locator(`#page-werkzeuge a.adm-tool[href="${hash}"]`)).toBeVisible()
  }
})
