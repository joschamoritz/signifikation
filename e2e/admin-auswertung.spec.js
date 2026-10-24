import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/admin.js'

// Auswertung (Schritt 8): Zeitraum in der Adresse, Diagramm per Tastatur, kein waagerechtes Scrollen.
// Die E2E-Datenbank (e2e/start-server.js) enthält Spiele der letzten 20 Tage, aber keine Sitzungen und Käufe.

const gehe = async (page, hash, seite) => {
  await page.evaluate((h) => { globalThis.location.hash = h }, hash)
  await expect(page.locator(`#page-${seite}`)).toHaveClass(/is-active/)
}

test('Zeitraum steht in der Adresse, gilt für alle Reiter und erzeugt keinen Verlaufseintrag', async ({ page }) => {
  await loginAsAdmin(page)
  await gehe(page, '#auswertung/spiele?zeitraum=90', 'stats')
  await expect(page.locator('#au-zeitraum-stats')).toHaveValue('90')
  await expect(page.locator('#page-tabs a[href="#auswertung/kennzahlen?zeitraum=90"]')).toBeVisible()

  const laenge = await page.evaluate(() => globalThis.history.length)
  await page.locator('#au-zeitraum-stats').selectOption('7')
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#auswertung/spiele?zeitraum=7')
  expect(await page.evaluate(() => globalThis.history.length)).toBe(laenge)
  await expect(page.locator('#page-tabs a[href="#auswertung/klassenraum?zeitraum=7"]')).toBeVisible()
  await expect(page.locator('#au-export-stats')).toHaveAttribute('href', '/admin/stats/export?days=7&format=csv')

  // Standard (30 Tage) steht nicht in der Adresse
  await page.locator('#au-zeitraum-stats').selectOption('30')
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#auswertung/spiele')

  // Reiterwechsel nimmt den Zeitraum mit; unbekannte Werte fallen auf 30 zurück
  await gehe(page, '#auswertung/kennzahlen?zeitraum=365', 'metrics')
  await expect(page.locator('#au-zeitraum-metrics')).toHaveValue('365')
  await gehe(page, '#auswertung/klassenraum?zeitraum=17', 'classroom')
  await expect(page.locator('#au-zeitraum-classroom')).toHaveValue('30')
  // … und die Adresse wird auf den tatsächlich gewählten Wert bereinigt (ohne ?zeitraum=17, ohne Verlaufseintrag)
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#auswertung/klassenraum')
  await expect(page.locator('#page-tabs a[href="#auswertung/spiele"]')).toBeVisible()
})

test('Spiele: Zahlen, Diagramm per Pfeiltaste ablesbar, Werte zusätzlich als Tabelle', async ({ page }) => {
  await loginAsAdmin(page)
  await gehe(page, '#auswertung/spiele', 'stats')
  await expect(page.locator('#au-inhalt-stats .au-zahlen')).toBeVisible()
  await expect(page.locator('#au-d-spiele svg')).toBeVisible()
  await expect(page.locator('#au-umfang-stats')).toContainText('ohne Admin-Konten')

  // Das Diagramm ist ein Schieberegler über die Tage; die Ablesezeile ist keine Live-Region
  const plot = page.locator('#au-d-spiele')
  await expect(plot).toHaveAttribute('role', 'slider')
  await expect(plot).toHaveAttribute('aria-valuemin', '1')
  await expect(plot).toHaveAttribute('aria-valuemax', '30')
  await expect(plot).toHaveAttribute('aria-valuetext', /^[A-Z][a-z] \d{2}\.\d{2}\.: \d+\sSpiele?$/)
  await expect(page.locator('#au-d-spiele-ablesen')).not.toHaveAttribute('aria-live', /./)
  const jetzt0 = Number(await plot.getAttribute('aria-valuenow'))

  // Die Ablesezeile zeigt zuerst den letzten vollen Tag, die Pfeiltaste wählt eine Säule
  const ablesen = page.locator('#au-d-spiele-ablesen')
  await expect(ablesen).toContainText('Zuletzt:')
  await page.locator('#au-d-spiele').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(ablesen).not.toContainText('Zuletzt:')
  const erste = await ablesen.innerText()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => ablesen.innerText()).not.toBe(erste)
  await expect(page.locator('#au-d-spiele .au-saeule.is-gewaehlt')).toHaveCount(1)
  // Die Wahl steht zusätzlich zur Farbe als Linie im Diagramm und im Wert für die Sprachausgabe
  await expect(page.locator('#au-d-spiele .au-wahl-linie')).toHaveCount(1)
  expect(Number(await plot.getAttribute('aria-valuenow'))).toBe(jetzt0 - 2)
  await page.keyboard.press('Home')
  await expect(ablesen).toContainText(/Spiele?/)

  // Alle vier Modi stehen in der Liste, auch Lückenfüller
  await expect(page.locator('section[aria-labelledby="au-spiele-modi-titel"] .tag-badge')).toHaveText(['Kollokationen', 'Wort-Zwilling', 'Zeitenwende', 'Lückenfüller'])
  await page.locator('#au-inhalt-stats details.au-werte > summary').first().click()
  await expect(page.locator('#au-inhalt-stats .au-tab').first()).toBeVisible()
})

test('Kennzahlen und Klassenraum: Abschnitte und Leerzustand ohne Daten', async ({ page }) => {
  await loginAsAdmin(page)
  await gehe(page, '#auswertung/kennzahlen', 'metrics')
  await expect(page.locator('#au-inhalt-metrics .tag-abschnitt-titel')).toHaveText(['Zahlungen', 'Eigenes Lemma', 'Aktive Konten und Wiederkehr'])
  await expect(page.locator('section[aria-labelledby="au-zahlungen-titel"]')).toContainText('Im Zeitraum wurde nichts gekauft.')
  await gehe(page, '#auswertung/klassenraum', 'classroom')
  await expect(page.locator('#au-inhalt-classroom .li-leer-titel')).toHaveText('Im Zeitraum gab es keine Sitzungen.')
})

test('Auf einem schmalen Telefon scrollt keine der drei Seiten waagerecht', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await loginAsAdmin(page)
  for (const [hash, seite] of [['#auswertung/spiele?zeitraum=365', 'stats'], ['#auswertung/kennzahlen?zeitraum=365', 'metrics'], ['#auswertung/klassenraum', 'classroom']]) {
    await gehe(page, hash, seite)
    await expect(page.locator(`#au-inhalt-${seite} > *`).first()).toBeVisible()
    await expect(page.locator(`#au-meldung-${seite}`)).toHaveText('')
    const breiten = await page.evaluate(() => ({ dok: globalThis.document.documentElement.scrollWidth, fenster: globalThis.document.documentElement.clientWidth }))
    expect(breiten.dok, hash).toBeLessThanOrEqual(breiten.fenster)
  }
})
