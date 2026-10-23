import { expect } from '@playwright/test'

export async function loginAsAdmin(
  page,
  email    = process.env.ADMIN_EMAIL    || 'admin@signifikation.de',
  password = process.env.ADMIN_PASSWORD || 'dev-only',
) {
  await page.goto('/admin')
  await expect(page.locator('#login-overlay')).toBeVisible()
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.locator('#login-btn').click()
  await expect(page.locator('#main-container')).toBeVisible()
  // Startseite ist „Planen“ (Reiter Woche) – der Seitentitel lautet „Woche“.
  await expect(page.locator('#page-title')).toContainText('Woche')
  // Startroute prüfen: richtige Seite aktiv und Adresse auf #planen normalisiert.
  await expect(page.locator('#page-dashboard')).toHaveClass(/is-active/)
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#planen')
}

// Frühere Menüpunkte → neue Adresse (Hash-Routing) und die Seite, die dann aktiv sein muss.
// Die Specs benutzen weiterhin die alten Bezeichnungen.
const NAV_PAGES = {
  'Dashboard': { route: '#planen', page: 'dashboard' },
  'Tageseinträge': { route: '#planen/tag/neu', page: 'entry' },
  'Vorschläge': { route: '#vorschlaege', page: 'vorschlaege' },
  'Kalender': { route: '#planen/monat', page: 'calendar' },
  'Analysen': { route: '#werkzeuge/pruefen', page: 'analytics' },
  'Statistiken': { route: '#auswertung/spiele', page: 'stats' },
  'Kennzahlen': { route: '#auswertung/kennzahlen', page: 'metrics' },
  'Nutzer': { route: '#nutzer', page: 'users' },
  'Bonus-Tage': { route: '#werkzeuge/bonus-tage', page: 'freedays' },
  'Wort der Woche': { route: '#werkzeuge/wort-der-woche', page: 'spezialwoche' },
  'Benachrichtigungen': { route: '#werkzeuge/benachrichtigungen', page: 'push' },
  'Klassenraum': { route: '#auswertung/klassenraum', page: 'classroom' },
  'System': { route: '#werkzeuge/system', page: 'system' },
  'Sicherung': { route: '#werkzeuge/sicherung', page: 'sicherung' },
  'Kursmaterial': { route: '#werkzeuge/kursmaterial', page: 'kursmaterial' },
  'Protokoll': { route: '#werkzeuge/protokoll', page: 'protokoll' },
}

export async function openNavPage(page, label) {
  const target = NAV_PAGES[label]
  if (!target) throw new Error(`openNavPage: unbekannte Seite „${label}“`)
  // Über den Hash statt per Klick: Die Unterseiten (System, Tag …) haben keinen
  // eigenen Menüpunkt mehr, und auf schmalen Viewports blendet die Leiste unten
  // bei Unterseiten aus.
  await page.evaluate((hash) => { globalThis.location.hash = hash }, target.route)
  await expect(page.locator(`#page-${target.page}`)).toHaveClass(/is-active/)
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
