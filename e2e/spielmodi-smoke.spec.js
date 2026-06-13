/**
 * Spielmodi-Smoketests
 *
 * Toleriert leere oder beliebige DB-Inhalte. Prüft nur Rendering und
 * Navigation, damit Refactors an Home.jsx, GameEntry oder TabBar
 * mindestens "die Seite kommt hoch und alle vier Modi sind sichtbar"
 * nicht stillschweigend brechen.
 *
 * Nicht im Scope: vollständiger Spielablauf inkl. Submit (würde
 * tagesaktuelle Lemma-/Wortprofil-Daten brauchen).
 */
import { test, expect } from '@playwright/test'

test.describe('Home – Spielmodi-Rendering', () => {
  test('Home zeigt Header und alle vier Spielmodi', async ({ page }) => {
    await page.goto('/')
    // Titel der App
    await expect(page.locator('.test-title')).toContainText('Signifikation')

    // Snap-Nav-Buttons der vier Modi (① Kollokationen, ② Wort-Zwilling,
    // ③ Zeitenwende, ④ Lückenfüller) – nur auf Mobile sichtbar (< 768px).
    // Auf Desktop ist die snap-nav per CSS ausgeblendet; dort prüfen wir
    // stattdessen die Eintrags-Liste.
    const { width } = page.viewportSize()
    if (width < 768) {
      const snapNav = page.locator('nav[aria-label="Spielmodus-Navigation"]')
      await expect(snapNav).toBeVisible()
      await expect(snapNav.getByRole('button', { name: /Kollokationen/ })).toBeVisible()
      await expect(snapNav.getByRole('button', { name: /Wort-Zwilling/ })).toBeVisible()
      await expect(snapNav.getByRole('button', { name: /Zeitenwende/ })).toBeVisible()
      await expect(snapNav.getByRole('button', { name: /Lückenfüller/ })).toBeVisible()
    } else {
      // Desktop: Spielmodi über Eintrags-Liste erreichbar
      await expect(page.locator('.test-entry').first()).toBeVisible()
    }
  })

  test('Home: Tab-Bar hat alle Haupt-Tabs', async ({ page }) => {
    await page.goto('/')
    const tabbar = page.locator('nav[aria-label="Hauptnavigation"]')
    await expect(tabbar).toBeVisible()
    await expect(tabbar.getByRole('button', { name: /Spielmodi/ })).toBeVisible()
    await expect(tabbar.getByRole('button', { name: /Klassenraum/ })).toBeVisible()
    await expect(tabbar.getByRole('button', { name: /Kurs/ })).toBeVisible()
    await expect(tabbar.getByRole('button', { name: /Konto/ })).toBeVisible()
  })

  test('Wort-Zwilling ist frei spielbar – kein Gesamtausgabe-Schloss mehr', async ({ page }) => {
    await page.goto('/')
    // Seit dem Premium-Umbau sind alle vier Modi dauerhaft frei. Der
    // Wort-Zwilling-Eintrag darf daher keinen Lock-CTA mehr zeigen, sondern
    // entweder den Spielen-CTA oder (mangels Tagesdaten) den deaktivierten
    // Platzhalter.
    const wzHeadword = page.locator('.test-headword', { hasText: 'Wort-Zwilling' })
    await expect(wzHeadword).toBeVisible()
    const wzEntry = wzHeadword.locator('xpath=ancestor::li[contains(@class, "test-entry")]')
    await expect(wzEntry.locator('.test-cta--locked')).toHaveCount(0)
    await expect(wzEntry.locator('.test-cta').first()).toBeVisible()
  })

  test('Klassenraum-Tab öffnet ohne Fehler', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Klassenraum$/ }).click()
    // Lazy-Loaded – kann kurz dauern.
    // text= wuerde zuerst den .test-raster-Span matchen, der auf Mobile
    // (max-width:767px) per CSS display:none ist → data-testid statt text=.
    await expect(page.locator('[data-testid="classroom-kiosk-code-input"]')).toBeVisible({ timeout: 10_000 })
  })

  test('Konto-Tab öffnet ohne Fehler', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Konto$/ }).click()
    // Lazy-Loaded.
    // Gleiche Falle wie Klassenraum: text=/Konto/ trifft den .test-raster-Span
    // (display:none auf Mobile) bevor die sichtbaren .test-entry-Kacheln erscheinen.
    await expect(page.locator('.test-entry').first()).toBeVisible({ timeout: 10_000 })
  })
})
