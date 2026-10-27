import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/admin.js'

// Werkzeuge › Social Cards: Entwürfe prüfen und freigeben, „Selbst gestalten“ zeichnet im Browser.
// Die Entwürfe (zwei Textbeiträge, ohne Bild) legt e2e/start-server.js an.

// APIRequestContext schickt den CSRF-Header der Admin-Seite nicht von selbst mit
const HEADER = { 'X-Requested-With': 'signifikation-app' }

const berlin = (plus = 0) => {
  const jetzt = new Date(Date.now() + plus * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt)
}

// Fester Ausgangstext: Der Server behält geänderte Texte über Läufe hinweg (Neustart ist nicht nötig, `reuseExistingServer`)
const TB_TEXT = '„Wir haben eine ______ Debatte geführt.“\n\nWelches Wort fehlt? (Deutscher Bundestag · CC BY 4.0)'
const AUFLOESUNG_TEXT = 'Gesucht war „hitzige“.\n\nQuelle: Plenarprotokoll · CC BY 4.0'

async function setzeAusgangszustand(page) {
  for (const [slot, text] of [['TB', TB_TEXT], ['TB-aufloesung', AUFLOESUNG_TEXT]]) {
    const url = `/admin/social-cards/entwuerfe/${await entwurfId(page, slot)}`
    // erst öffnen (sonst ist der Text gesperrt), dann den festen Text setzen
    await page.request.post(url, { data: { status: 'offen' }, headers: HEADER })
    await page.request.post(url, { data: { caption: text }, headers: HEADER })
  }
}

async function oeffneEntwuerfe(page) {
  await loginAsAdmin(page)
  // Beide Entwürfe beginnen jeden Lauf offen und mit festem Text (die Prüfungen unten ändern und geben sie frei)
  await setzeAusgangszustand(page)
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge' })
  await expect(page.locator('#page-werkzeuge')).toHaveClass(/is-active/)
  await page.locator('#page-werkzeuge a.adm-tool[href="#werkzeuge/social-cards"]').click()
  await expect(page.locator('#page-social')).toHaveClass(/is-active/)
  await expect(page.locator('.so-entwurf').first()).toBeVisible()
}

async function entwurfId(page, slot) {
  const daten = await (await page.request.get('/admin/social-cards/entwuerfe')).json()
  return daten.entwuerfe.find((e) => e.slot === slot).id
}

test('Die Übersicht führt zu den Entwürfen, Reiter und Zählung stehen', async ({ page }) => {
  await oeffneEntwuerfe(page)
  await expect(page.locator('#page-tabs a[aria-current="page"]')).toHaveText('Entwürfe')
  await expect(page.locator('#page-tabs')).toHaveAttribute('aria-label', 'Ansichten: Social Cards')
  await expect(page.locator('#page-back-label')).toHaveText('Werkzeuge')
  await expect(page.locator('#so-pf-zahlen')).toContainText('Entwürfe offen')
  // Textbeiträge haben kein Bild
  await expect(page.locator('.so-bild--text').first()).toContainText('ohne Bild')
  // Die Übersicht nennt den Stand aus dem Speicher
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge' })
  await expect(page.locator('#wz-stand-social')).toContainText('offen')
})

test('Text ändern, zu lang sperrt „Freigeben“, danach freigeben', async ({ page }) => {
  await oeffneEntwuerfe(page)
  const heute = page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg$/ }) }).first()
  const feld = heute.locator('textarea')
  const alt = await feld.inputValue()

  await feld.fill(`${alt} Zusatz`)
  await expect(heute.locator('.in-geaendert')).toBeVisible()
  await expect(heute.locator('[data-action="so-speichern"]')).toBeVisible()

  await feld.fill('x'.repeat(320))
  await expect(heute.locator('.in-zaehler')).toContainText('zu viel')
  const freigeben = heute.locator('[data-action="so-freigeben"]')
  await expect(freigeben).toHaveAttribute('aria-disabled', 'true')
  await freigeben.click({ force: true })
  await expect(heute.locator('.li-meldung')).toContainText('Zu lang für Bluesky')
  await expect(heute).toHaveAttribute('data-status', 'offen')

  // Der Server lehnt Zu-langes ebenfalls ab
  const id = (await heute.getAttribute('id')).replace('so-e-', '')
  const abgelehnt = await page.request.post(`/admin/social-cards/entwuerfe/${id}`, { data: { caption: 'y'.repeat(320), status: 'freigegeben' }, headers: HEADER })
  expect(abgelehnt.status()).toBe(409)

  await feld.fill(`${alt} Zusatz`)
  await freigeben.click()
  await expect(heute).toHaveAttribute('data-status', 'freigegeben')
  await expect(heute.locator('.so-status')).toHaveText('freigegeben')
  await expect(heute.locator('textarea')).toHaveAttribute('readonly', '')
  await expect(heute.locator('textarea')).toHaveValue(`${alt} Zusatz`)
  await expect(heute.locator('.li-meldung')).toContainText('Freigegeben. Zum Posten: Text kopieren')
})

test('Rätsel und Auflösung gehören zusammen: „Neu erstellen …“ ist gesperrt, solange der Partner entschieden ist', async ({ page }) => {
  await oeffneEntwuerfe(page)
  const aufloesung = page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg – Auflösung$/ }) }).first()
  const beleg = page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg$/ }) }).first()
  // Textbeleg heute offen (oeffneEntwuerfe) → Auflösung morgen frei; nach Freigabe des Belegs gesperrt
  await expect(aufloesung.locator('[data-action="so-neu"]')).not.toHaveAttribute('aria-disabled', 'true')
  await beleg.locator('[data-action="so-freigeben"]').click()
  await expect(beleg).toHaveAttribute('data-status', 'freigegeben')
  await expect(aufloesung.locator('[data-action="so-neu"]')).toHaveAttribute('aria-disabled', 'true')
  await aufloesung.locator('[data-action="so-neu"]').click({ force: true })
  await expect(aufloesung.locator('.li-meldung')).toContainText('gehören zusammen')
  await expect(page.locator('#bestaetige-dialog')).not.toHaveAttribute('open', '')
  // Wieder öffnen löst die Sperre
  await beleg.locator('[data-action="so-oeffnen"]').click()
  await expect(aufloesung.locator('[data-action="so-neu"]')).not.toHaveAttribute('aria-disabled', 'true')
  // Die Rückfrage nennt beide Entwürfe
  await aufloesung.locator('[data-action="so-neu"]').click()
  await expect(page.locator('#bestaetige-dialog')).toHaveAttribute('open', '')
  await expect(page.locator('#bestaetige-titel')).toHaveText('Textbeleg und Auflösung neu erstellen?')
  await expect(page.locator('#bestaetige-liste li')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('#bestaetige-dialog')).not.toHaveAttribute('open', '')
})

test('Selbst gestalten: zeichnet die Karte, Vorlage steht in der Adresse, Download mit sprechendem Namen', async ({ page }) => {
  await oeffneEntwuerfe(page)
  await page.locator('#page-tabs a', { hasText: 'Selbst gestalten' }).click()
  await expect(page.locator('#page-social-editor')).toHaveClass(/is-active/)
  const canvas = page.locator('#so-canvas')
  // Der Textersatz entsteht erst, wenn das Zeichenmodul geladen und gezeichnet hat
  await expect(canvas).toHaveAttribute('aria-label', /^Rätsel-Karte, Hell, 4 : 5/)
  await expect.poll(() => canvas.evaluate((c) => [c.width, c.height])).toEqual([1080, 1350])
  const morgen = berlin(1)
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe(`#werkzeuge/social-cards/gestalten?datum=${morgen}&vorlage=A`)

  // Vorlage wechseln: Adresse folgt ohne neuen Verlaufseintrag
  const laenge = await page.evaluate(() => globalThis.history.length)
  await page.locator('input[name="so-vorlage"][value="B"]').check({ force: true })
  await expect(canvas).toHaveAttribute('aria-label', /^Beleg-Karte/)
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toContain('vorlage=B')
  expect(await page.evaluate(() => globalThis.history.length)).toBe(laenge)

  // Info-Karte mit Text; Story-Format; Download
  await page.locator('input[name="so-vorlage"][value="X"]').check({ force: true })
  await page.locator('#so-x-titel').fill('Eine Überschrift')
  await expect(canvas).toHaveAttribute('aria-label', /Eine Überschrift/)
  await page.locator('input[name="so-format"][value="9:16"]').check({ force: true })
  await expect.poll(() => canvas.evaluate((c) => c.height)).toBe(1920)
  await expect(page.locator('#so-karte-masse')).toHaveText('1080 × 1920 Pixel · Story')
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#so-ed-laden').click()])
  expect(download.suggestedFilename()).toBe(`signifikation-${morgen}-info-story.png`)

  // Zurück zu den Entwürfen: Der Reiter führt wieder zum letzten Zustand, die Zeichenfläche ist freigegeben
  await page.locator('#page-tabs a', { hasText: 'Entwürfe' }).click()
  await expect(page.locator('#page-social')).toHaveClass(/is-active/)
  await expect.poll(() => canvas.evaluate((c) => c.width)).toBe(0)
  await expect(page.locator('#page-tabs a', { hasText: 'Selbst gestalten' })).toHaveAttribute('href', /vorlage=X/)
})

test('Die alte Adresse /admin/social-cards leitet in den Admin um', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/social-cards')
  await expect(page.locator('#page-social')).toHaveClass(/is-active/)
  expect(new URL(page.url()).pathname).toBe('/admin')
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toBe('#werkzeuge/social-cards')
})

for (const breite of [375, 320]) {
  test(`Beide Social-Cards-Seiten scrollen bei ${breite} px nicht waagerecht`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 })
    await oeffneEntwuerfe(page)
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true)
    await page.locator('#page-tabs a', { hasText: 'Selbst gestalten' }).click()
    await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /Karte/)
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true)
    // Die Vorschau passt in die Breite (früher lag sie 176 px außerhalb des Bildschirms)
    const rechts = await page.locator('#so-canvas').evaluate((c) => c.getBoundingClientRect().right)
    expect(rechts).toBeLessThanOrEqual(breite)
  })
}

test('Neu erstellen sperrt auch den Partner, bis die Antwort da ist; danach ist alles wieder frei', async ({ page }) => {
  await oeffneEntwuerfe(page)
  const aufloesung = page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg – Auflösung$/ }) }).first()
  const beleg = page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg$/ }) }).first()

  // Antwort auf „/neu“ zurückhalten (und scheitern lassen: Der Ausgang ist egal, es geht um die Sperre)
  let freigeben
  const gehalten = new Promise((resolve) => { freigeben = resolve })
  await page.route('**/admin/social-cards/entwuerfe/*/neu', async (route) => {
    await gehalten
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Test: abgelehnt' }) })
  })
  await beleg.locator('[data-action="so-neu"]').click()
  await expect(page.locator('#bestaetige-dialog')).toHaveAttribute('open', '')
  await page.locator('#bestaetige-ok').focus()
  await page.keyboard.press('Enter')

  await expect(beleg).toHaveAttribute('aria-busy', 'true')
  await expect(aufloesung).toHaveAttribute('aria-busy', 'true')
  for (const li of [beleg, aufloesung]) {
    for (const aktion of ['so-freigeben', 'so-verwerfen', 'so-kopieren', 'so-neu']) {
      await expect(li.locator(`[data-action="${aktion}"]`)).toHaveAttribute('aria-disabled', 'true')
    }
    await expect(li.locator('textarea')).toHaveAttribute('readonly', '')
  }
  // Ein Klick auf das gesperrte „Freigeben“ des Partners bewirkt nichts
  await aufloesung.locator('[data-action="so-freigeben"]').click({ force: true })
  await expect(aufloesung).toHaveAttribute('data-status', 'offen')

  freigeben()
  await expect(beleg.locator('.li-meldung')).toContainText('Nicht neu erstellt: Test: abgelehnt')
  for (const li of [beleg, aufloesung]) {
    await expect(li).not.toHaveAttribute('aria-busy', 'true')
    await expect(li.locator('[data-action="so-freigeben"]')).not.toHaveAttribute('aria-disabled', 'true')
    await expect(li.locator('[data-action="so-verwerfen"]')).not.toHaveAttribute('aria-disabled', 'true')
    await expect(li.locator('textarea')).not.toHaveAttribute('readonly', '')
  }
})

test('Eine ältere Listenantwort überschreibt keine neuere Freigabe', async ({ page }) => {
  await oeffneEntwuerfe(page)
  const beleg = page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg$/ }) }).first()

  // „neu laden“: Die Antwort kommt mit dem alten Stand (Beleg offen), aber erst nach der Freigabe
  let freigeben
  const gehalten = new Promise((resolve) => { freigeben = resolve })
  await page.route('**/admin/social-cards/entwuerfe', async (route) => {
    const antwort = await route.fetch()
    await gehalten
    await route.fulfill({ response: antwort })
  })
  await page.locator('#so-pf-neu-laden').click()
  await beleg.locator('[data-action="so-freigeben"]').click()
  await expect(beleg).toHaveAttribute('data-status', 'freigegeben')
  freigeben()
  await expect(page.locator('#so-pf-liste')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.so-entwurf', { has: page.locator('.so-slot', { hasText: /^Textbeleg$/ }) }).first()).toHaveAttribute('data-status', 'freigegeben')
  await expect(page.locator('#so-pf-zahlen')).toContainText('1 freigegeben')
})

test('Fehlt die kleine Vorschau (404), kommt die große; fehlen beide, steht ein Platzhalter statt des Bildsymbols', async ({ page }) => {
  await loginAsAdmin(page)
  await setzeAusgangszustand(page)
  // Der Textbeleg bekommt für diesen Test ein Bild (nur in der Antwort, nicht auf dem Server)
  await page.route('**/admin/social-cards/entwuerfe', async (route) => {
    const daten = await (await route.fetch()).json()
    for (const e of daten.entwuerfe) {
      if (e.slot !== 'TB') continue
      e.spec = { theme: 'hell', ratio: '4:5', header: true, ...e.spec, format: 'T', data: { lemmata: [{ id: 'x', lemma: 'Debatte', pos: 'Substantiv' }] } }
      e.bildUrl = '/test-bild/gross.png'
      e.bildKleinUrl = '/test-bild/gross.png?groesse=klein'
    }
    await route.fulfill({ json: daten })
  })
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  const abgerufen = []
  let grossDa = true
  await page.route('**/test-bild/**', async (route) => {
    abgerufen.push(route.request().url().includes('groesse=klein') ? 'klein' : 'gross')
    if (route.request().url().includes('groesse=klein') || !grossDa) return route.fulfill({ status: 404, body: 'nein' })
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge/social-cards' })
  const bild = page.locator('.so-entwurf img').first()
  await expect(bild).toBeVisible()
  await expect.poll(() => bild.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
  expect(await bild.getAttribute('src')).toBe('/test-bild/gross.png')
  expect(abgerufen).toEqual(['klein', 'gross'])
  // Der Linkname bleibt, die Karte steht als Beschreibung daran
  const link = page.locator('.so-entwurf a.so-bild').first()
  await expect(link).toHaveAttribute('aria-describedby', /so-e-\d+-bildtext/)
  await expect(page.locator('.so-entwurf [id$="-bildtext"]').first()).toContainText('Teaser-Karte')

  // Auch die große fehlt: Platzhalter
  grossDa = false
  await page.locator('#so-pf-neu-laden').click()
  await expect(page.locator('.so-entwurf .so-bild--text', { hasText: 'Bild nicht verfügbar' })).toHaveCount(1)
  await expect(page.locator('.so-entwurf img')).toHaveCount(0)
})

test('Selbst gestalten: ohne Zeichenmodul sind „Bild herunterladen“ und „Text kopieren“ gesperrt und erklären es', async ({ page }) => {
  await loginAsAdmin(page)
  await page.route('**/admin/social-cards/karten.js', (route) => route.abort())
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge/social-cards/gestalten' })
  await expect(page.locator('#page-social-editor')).toHaveClass(/is-active/)
  await expect(page.locator('#so-ed-meldung')).toContainText('Das Zeichenmodul konnte nicht geladen werden')
  const laden = page.locator('#so-ed-laden')
  const kopieren = page.locator('#so-ed-kopieren')
  await expect(laden).toHaveAttribute('aria-disabled', 'true')
  await expect(kopieren).toHaveAttribute('aria-disabled', 'true')
  let heruntergeladen = false
  page.on('download', () => { heruntergeladen = true })
  await laden.click({ force: true })
  await expect(page.locator('#so-ed-vorschau-meldung')).toContainText('Zeichenmodul ist nicht geladen')
  await kopieren.click({ force: true })
  await expect(page.locator('#so-ed-text-meldung')).toContainText('Zeichenmodul ist nicht geladen')
  expect(heruntergeladen).toBe(false)
})

test('Selbst gestalten: Vorlagenwechsel fragt, bevor ein eigener Beitragstext verworfen wird', async ({ page }) => {
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge/social-cards/gestalten?vorlage=A' })
  await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /^Rätsel-Karte/)
  const text = page.locator('#so-text')
  // Ohne eigenen Text: kein Dialog
  await page.locator('input[name="so-vorlage"][value="T"]').check({ force: true })
  await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /^Teaser-Karte/)
  await expect(page.locator('#bestaetige-dialog')).not.toHaveAttribute('open', '')

  await text.fill('Mein eigener Text zum Teaser.')
  await page.locator('input[name="so-vorlage"][value="X"]').check({ force: true })
  await expect(page.locator('#bestaetige-dialog')).toHaveAttribute('open', '')
  await expect(page.locator('#bestaetige-titel')).toHaveText('Eigenen Beitragstext verwerfen?')
  // Abbrechen: alte Vorlage bleibt gewählt, der Text steht noch da
  await page.keyboard.press('Escape')
  await expect(page.locator('#bestaetige-dialog')).not.toHaveAttribute('open', '')
  await expect(page.locator('input[name="so-vorlage"][value="T"]')).toBeChecked()
  await expect(page.locator('input[name="so-vorlage"][value="X"]')).not.toBeChecked()
  await expect(text).toHaveValue('Mein eigener Text zum Teaser.')
  await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /^Teaser-Karte/)

  // Verwerfen: neue Vorlage, Text aus der Vorlage
  await page.locator('input[name="so-vorlage"][value="X"]').check({ force: true })
  await expect(page.locator('#bestaetige-dialog')).toHaveAttribute('open', '')
  await page.locator('#bestaetige-ok').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('input[name="so-vorlage"][value="X"]')).toBeChecked()
  await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /^Info-Karte/)
  await expect(text).not.toHaveValue('Mein eigener Text zum Teaser.')
})

test('Selbst gestalten: auch ein Vorlagenwechsel über die Adresse fragt; ein anderer Tag behält den eigenen Text', async ({ page }) => {
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge/social-cards/gestalten?vorlage=T' })
  await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /^Teaser-Karte/)
  const text = page.locator('#so-text')
  await text.fill('Mein eigener Text zum Teaser.')
  const datum = await page.locator('#so-datum').inputValue()

  // Andere Vorlage per Adresse: Rückfrage; Abbrechen lässt Vorlage, Text und Adresse beim alten Stand
  await page.evaluate((d) => { globalThis.location.hash = `#werkzeuge/social-cards/gestalten?datum=${d}&vorlage=X` }, datum)
  await expect(page.locator('#bestaetige-dialog')).toHaveAttribute('open', '')
  await expect(page.locator('#bestaetige-titel')).toHaveText('Eigenen Beitragstext verwerfen?')
  await page.keyboard.press('Escape')
  await expect(page.locator('input[name="so-vorlage"][value="T"]')).toBeChecked()
  await expect(text).toHaveValue('Mein eigener Text zum Teaser.')
  await expect.poll(() => page.evaluate(() => globalThis.location.hash)).toContain('vorlage=T')

  // Anderer Tag per Adresse, gleiche Vorlage: keine Rückfrage, der eigene Text bleibt (wie beim Datumsfeld)
  const anderer = new Date(Date.parse(`${datum}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  await page.evaluate((d) => { globalThis.location.hash = `#werkzeuge/social-cards/gestalten?datum=${d}&vorlage=T` }, anderer)
  await expect(page.locator('#so-datum')).toHaveValue(anderer)
  await expect(page.locator('#bestaetige-dialog')).not.toHaveAttribute('open', '')
  await expect(text).toHaveValue('Mein eigener Text zum Teaser.')
})

test('Selbst gestalten: Rückmeldungen erscheinen bei dem Knopf, der sie auslöst', async ({ page }) => {
  await loginAsAdmin(page)
  await page.evaluate(() => { globalThis.location.hash = '#werkzeuge/social-cards/gestalten?vorlage=A' })
  await expect(page.locator('#so-canvas')).toHaveAttribute('aria-label', /^Rätsel-Karte/)
  await page.locator('#so-ed-mischen').click()
  await expect(page.locator('#so-ed-vorschau-meldung')).toHaveText('Reihenfolge neu gemischt.')
  await expect(page.locator('#so-ed-meldung')).toHaveText('')
  await page.locator('#so-ed-kopieren').click()
  await expect(page.locator('#so-ed-text-meldung')).toHaveText(/kopiert|Kopieren ging nicht/)
  await expect(page.locator('#so-ed-meldung')).toHaveText('')
  // Eine Änderung macht die Rückmeldung zum Bild ungültig
  await page.locator('input[name="so-farbe"][value="dunkel"]').check({ force: true })
  await expect(page.locator('#so-ed-vorschau-meldung')).toHaveText('')
  // Über 300 Zeichen: Textfeld ist als fehlerhaft markiert
  await page.locator('#so-text').fill('x'.repeat(320))
  await expect(page.locator('#so-text')).toHaveAttribute('aria-invalid', 'true')
  await page.locator('#so-text').fill('kurz')
  await expect(page.locator('#so-text')).not.toHaveAttribute('aria-invalid', 'true')
})
