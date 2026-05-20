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
    // ③ Zeitenwende, ④ Lückenfüller) – ⑤ ist "in Vorbereitung"
    const snapNav = page.locator('nav[aria-label="Spielmodus-Navigation"]')
    await expect(snapNav).toBeVisible()
    await expect(snapNav.getByRole('button', { name: /Kollokationen/ })).toBeVisible()
    await expect(snapNav.getByRole('button', { name: /Wort-Zwilling/ })).toBeVisible()
    await expect(snapNav.getByRole('button', { name: /Zeitenwende/ })).toBeVisible()
    await expect(snapNav.getByRole('button', { name: /Lückenfüller/ })).toBeVisible()
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

  test('Premium-Modi zeigen Lock-CTA oder Unlock-Button ohne Gesamtausgabe', async ({ page }) => {
    await page.goto('/')
    // Wort-Zwilling-Eintrag muss entweder "Gesamtausgabe freischalten"
    // (nicht eingeloggt / kein Premium) oder einen Spielen-CTA zeigen.
    const wzHeadword = page.locator('.test-headword', { hasText: 'Wort-Zwilling' })
    await expect(wzHeadword).toBeVisible()
    const wzEntry = wzHeadword.locator('xpath=ancestor::li[contains(@class, "test-entry")]')
    const cta = wzEntry.locator('.test-cta, .test-cta--locked').first()
    await expect(cta).toBeVisible()
  })

  test('Klassenraum-Tab öffnet ohne Fehler', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Klassenraum$/ }).click()
    // Lazy-Loaded – kann kurz dauern
    await expect(page.locator('text=/Klassenraum|Teilnehmer|Code/i').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Konto-Tab öffnet ohne Fehler', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Konto$/ }).click()
    // Lazy-Loaded
    await expect(page.locator('text=/Anmeld|Konto|Email/i').first()).toBeVisible({ timeout: 10_000 })
  })
})
