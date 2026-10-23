// ── CSRF-Header für State-Changing-Requests ───────────────
// Das Backend (server/middleware/auth.js) verlangt für POST/PUT/DELETE/PATCH
// den Header X-Requested-With: signifikation-app. Cross-Origin-Scripts können
// diesen Custom-Header ohne CORS-Preflight nicht setzen → echter CSRF-Schutz.
//
// Pendant in der React-App: src/utils/installCsrfFetch.js. Hier ist alles
// same-origin (Admin-Panel und API laufen unter derselben Origin), deshalb
// reicht die schlanke Variante ohne Backend-Origins-Allowlist.
;(function installAdminCsrfFetch() {
  if (!window.fetch || window.fetch.__sigAdminCsrfWrapped) return
  const CSRF_HEADER_VALUE = 'signifikation-app'
  const STATE_CHANGING = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])
  const originalFetch = window.fetch.bind(window)
  function methodOf(input, init) {
    if (init && init.method) return String(init.method).toUpperCase()
    if (input instanceof Request) return String(input.method || 'GET').toUpperCase()
    return 'GET'
  }
  const wrapped = function patchedFetch(input, init) {
    const method = methodOf(input, init)
    if (!STATE_CHANGING.has(method)) return originalFetch(input, init)
    if (init || !(input instanceof Request)) {
      const next = { ...(init || {}) }
      const headers = new Headers(next.headers)
      if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', CSRF_HEADER_VALUE)
      next.headers = headers
      return originalFetch(input, next)
    }
    const headers = new Headers(input.headers)
    if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', CSRF_HEADER_VALUE)
    return originalFetch(new Request(input, { headers }))
  }
  wrapped.__sigAdminCsrfWrapped = true
  window.fetch = wrapped
})()

// ── Auth: httpOnly-Cookie ─────────────────────────────────
// Token wird als httpOnly-Cookie gesetzt und vom Browser automatisch
// bei jedem Request mitgesendet. Kein Token in sessionStorage nötig.
// credentials: 'same-origin' ist der Browser-Standard für same-origin Requests.
function clearToken() { /* noop – Cookie wird serverseitig via /admin/logout gelöscht */ }

function showMainContainer() {
  const container = document.getElementById('main-container')
  if (!container) return
  container.classList.remove('is-hidden')
  container.style.display = ''
}

function hideMainContainer() {
  const container = document.getElementById('main-container')
  if (!container) return
  container.classList.add('is-hidden')
  container.style.display = 'none'
}

// ── XSS-Schutz ───────────────────────────────────────────
// Escapt HTML-Text-Kontext (Tag-Inhalt, doppelt-/einfach-gequotete Attribute).
// Backtick wird ebenfalls escapt, damit Werte auch in Template-Literal-
// Kontexten (z.B. inline JS via onclick) sicher bleiben – aktuell nicht
// genutzt, aber Vorsorge.
// NICHT geeignet für: URL-Attribute (href/src – könnten javascript:-URLs
// enthalten, deshalb wird im Admin-Frontend bewusst keine URL aus
// Nutzer-Eingabe direkt in href/src interpoliert), CSS-Kontext, JSON.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;')
}

let usersLoaded = false
let selectedCalendarDate = ''
let selectedUserId = ''
let dashboardWeekOffset = 0
let selectedDashboardDate = ''
const selectedEntryDates = new Set()
let sessionRefreshTimer = null
let usersSearchTimer = null
let entrySearchTimer = null
let entryTablePage = 1
let entryPageSize = 25
let usersOverviewAbortController = null
const USERS_PAGE_SIZE = 50
let usersOffset = 0
let currentAuditEntries = []
let freeDaysData = []
let entryFormSnapshot = null
let entryFormDirty = false

const ENTRY_FIELD_IDS = [
  'datum', 'thema', 'thema-kurz', 'thema-quelle',
  'w1', 'w2', 'w3', 'p1', 'p2', 'p3',
  'n1', 'n2', 'n3', 'l1', 'l2', 'l3',
  'wza', 'wzb', 'wzpos', 'wz-notiz', 'wz-link',
  'zw-lemma', 'zw-notiz', 'zw-link', 'lf-id',
]

function getCurrentDate() {
  return new Date()
}

// Kalendertag in lokaler Zeit (nicht UTC): toISOString() würde zwischen 0 und
// 1 Uhr (Winterzeit) bzw. 0 und 2 Uhr (Sommerzeit) noch den Vortag liefern.
function toLocalIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getTodayIso() {
  return toLocalIso(getCurrentDate())
}

// Tage auf ein ISO-Datum addieren (rechnet in lokaler Zeit, Sommer-/Winterzeit-fest).
function addTageIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return toLocalIso(new Date(y, m - 1, d + n))
}

function scheduleSessionRefresh() {
  if (sessionRefreshTimer) {
    window.clearTimeout(sessionRefreshTimer)
    sessionRefreshTimer = null
  }

  sessionRefreshTimer = window.setTimeout(async () => {
    try {
      const response = await fetch('/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      scheduleSessionRefresh()
    } catch {
      doLogout()
    }
  }, 7 * 60 * 60 * 1000)
}

// ── Navigation / Router ───────────────────────────────────
// Jede Ansicht hat eine Adresse im URL-Hash (#planen, #werkzeuge/system …).
// Dadurch funktionieren Neuladen, Lesezeichen und Browser-Zurück.
//
// Ablauf: Ein Klick auf einen Link (oder navigate()) setzt nur den Hash →
// 'hashchange' → handleHashChange() prüft den Entwurfsschutz →
// renderRoute() zeigt Seite, Kopf, Reiter und lädt die Daten.
// renderRoute() setzt nie selbst einen Hash (nur Weiterleitungen per
// replaceState), deshalb gibt es keine Schleifen.

const AREA_LABELS = {
  planen: 'Planen',
  vorschlaege: 'Vorschläge',
  nutzer: 'Nutzer',
  auswertung: 'Auswertung',
  werkzeuge: 'Werkzeuge',
}

const AREA_TABS = {
  planen: [
    { key: 'woche', label: 'Woche', hash: '#planen' },
    { key: 'monat', label: 'Monat', hash: '#planen/monat' },
    { key: 'liste', label: 'Liste', hash: '#planen/liste' },
  ],
  auswertung: [
    { key: 'spiele', label: 'Spiele', hash: '#auswertung/spiele' },
    { key: 'kennzahlen', label: 'Kennzahlen', hash: '#auswertung/kennzahlen' },
    { key: 'klassenraum', label: 'Klassenraum', hash: '#auswertung/klassenraum' },
  ],
}

const PARENT_PLANEN = { hash: '#planen', label: 'Planen', area: 'planen' }
const PARENT_WERKZEUGE = { hash: '#werkzeuge', label: 'Werkzeuge', area: 'werkzeuge' }

// Startseite je Bereich (Pfad ohne '#'). Unbekannte Unterrouten eines Bereichs
// leiten hierhin um; ein Bereichslink gilt nur hier als „exakt aktiv“.
const AREA_START = {
  planen: 'planen',
  vorschlaege: 'vorschlaege',
  nutzer: 'nutzer',
  auswertung: 'auswertung/spiele',
  werkzeuge: 'werkzeuge',
}

// Pfad (ohne '#') → Seite. 'parent' kennzeichnet Unterseiten mit Rückleiste.
const ROUTE_TABLE = {
  'planen': { page: 'dashboard', area: 'planen', tab: 'woche' },
  'planen/monat': { page: 'calendar', area: 'planen', tab: 'monat' },
  'planen/liste': { page: 'liste', area: 'planen', tab: 'liste' },
  'vorschlaege': { page: 'vorschlaege', area: 'vorschlaege' },
  'nutzer': { page: 'users', area: 'nutzer' },
  'auswertung/spiele': { page: 'stats', area: 'auswertung', tab: 'spiele' },
  'auswertung/kennzahlen': { page: 'metrics', area: 'auswertung', tab: 'kennzahlen' },
  'auswertung/klassenraum': { page: 'classroom', area: 'auswertung', tab: 'klassenraum' },
  'werkzeuge': { page: 'werkzeuge', area: 'werkzeuge' },
  'werkzeuge/pruefen': { page: 'analytics', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/bonus-tage': { page: 'freedays', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/benachrichtigungen': { page: 'push', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/wort-der-woche': { page: 'spezialwoche', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/system': { page: 'system', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/klassenraum-demo': { page: 'klassenraum-demo', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
}

// Alte data-page-Werte (Schnellzugriffe auf dem Dashboard, Kalender) →
// neue Adressen. switchPage() bleibt als dünne Hülle dafür bestehen.
const LEGACY_PAGE_ROUTES = {
  dashboard: '#planen',
  entry: '#planen/tag/neu',
  vorschlaege: '#vorschlaege',
  calendar: '#planen/monat',
  analytics: '#werkzeuge/pruefen',
  stats: '#auswertung/spiele',
  metrics: '#auswertung/kennzahlen',
  users: '#nutzer',
  freedays: '#werkzeuge/bonus-tage',
  spezialwoche: '#werkzeuge/wort-der-woche',
  push: '#werkzeuge/benachrichtigungen',
  classroom: '#auswertung/klassenraum',
  system: '#werkzeuge/system',
}

let routerActive = false
let currentRouteHash = null
let currentRoute = null
let routeRenderToken = 0
// Verlaufsindex: Jeder gerenderte Eintrag trägt { admIdx } in history.state.
// Damit lassen sich abgebrochene Navigationen sauber zurückrollen und die
// „‹“-Schaltfläche weiß, ob der vorherige Eintrag wirklich der Elternbereich ist.
let currentIdx = 0
const routeHashByIdx = new Map()
let suppressHashChange = false
let suppressTimer = null
// Elternadresse → Link, über den man die Unterseite betreten hat (Fokus bei Rückkehr).
const focusMemory = new Map()
// 'new'   = Formular zeigt einen leeren/neuen Tag,
// 'edit'  = ein bestehender Tag ist geladen,
// 'loading' / 'error' = Tag wird geladen bzw. konnte nicht geladen werden (Speichern gesperrt).
let entryFormMode = 'new'

function isValidIsoDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function isEntryRouteHash(hash) {
  return /^#planen\/tag\//.test(String(hash || ''))
}

// Liefert die Route zum Hash, { redirect } für Weiterleitungen oder null für
// unbekannte Adressen.
function parseRoute(rawHash) {
  const raw = String(rawHash || '').replace(/^#\/?/, '')
  const [pathPart, queryPart = ''] = raw.split('?')
  const path = pathPart.replace(/\/+$/, '')

  if (path === '') return { redirect: '#planen' }

  if (path === 'planen/tag/neu') {
    return { page: 'entry', area: 'planen', parent: PARENT_PLANEN, entry: 'neu', key: path }
  }
  const dayMatch = /^planen\/tag\/([^/]+)$/.exec(path)
  if (dayMatch) {
    if (!isValidIsoDay(dayMatch[1])) return { redirect: `#${AREA_START.planen}` }
    return { page: 'entry', area: 'planen', parent: PARENT_PLANEN, entry: 'edit', date: dayMatch[1], key: path }
  }

  // Object.hasOwn: sonst würden #constructor oder #__proto__ Prototyp-Einträge treffen.
  if (Object.hasOwn(ROUTE_TABLE, path)) {
    const section = new URLSearchParams(queryPart).get('abschnitt') || ''
    return { ...ROUTE_TABLE[path], key: path, section: /^[a-z-]+$/.test(section) ? section : '' }
  }

  // Alte Adressen (#calendar, #stats …) auf die neue Route umleiten.
  if (Object.hasOwn(LEGACY_PAGE_ROUTES, path)) return { redirect: LEGACY_PAGE_ROUTES[path] }

  // Unbekannte Unterroute eines bekannten Bereichs → Start dieses Bereichs.
  const firstSegment = path.split('/')[0]
  if (Object.hasOwn(AREA_START, firstSegment)) return { redirect: `#${AREA_START[firstSegment]}` }

  return null
}

function setPageMeta({ title = '', subtitle = '', overline = '' } = {}) {
  const titleEl = document.getElementById('page-title')
  const subtitleEl = document.getElementById('page-subtitle')
  const overlineEl = document.getElementById('page-overline')
  if (titleEl) titleEl.textContent = title
  if (subtitleEl) subtitleEl.textContent = subtitle
  if (overlineEl) {
    overlineEl.textContent = overline
    // Keine Überzeile, wenn sie nur den Titel wiederholen würde.
    overlineEl.classList.toggle('is-hidden', !overline || overline === title)
  }
  // „Bonus-Tage · Werkzeuge – Signifikation Admin“; bei Titel = Bereich nur einmal.
  const context = overline && overline !== title ? ` · ${overline}` : ''
  document.title = title ? `${title}${context} – Signifikation Admin` : 'Signifikation – Admin'
}

function headActionsHtml(route) {
  if (route.area === 'planen' && !route.parent) {
    return '<a class="adm-cta" href="#planen/tag/neu">Tag anlegen <span aria-hidden="true">→</span></a>'
      + '<button type="button" class="adm-link" data-action="refresh-dashboard">neu laden</button>'
  }
  if (route.page === 'vorschlaege') {
    // Zähler und Sperre setzt aktualisiereVorschlagHinweise() (nach jedem Kopf-Neuaufbau).
    return '<button type="button" class="adm-cta is-hidden" data-action="vorschlaege-alle" id="vorschlaege-alle-btn">'
      + '<span id="vorschlaege-alle-text">Alle übernehmen</span> <span aria-hidden="true">→</span></button>'
      + '<button type="button" class="adm-link" data-action="vorschlaege-laden">neu laden</button>'
  }
  return ''
}

// Setzt Seite, Kopf, Reiter, Rückleiste und Navigation – ohne Daten zu laden.
function applyRouteChrome(route) {
  const pageEl = document.getElementById(`page-${route.page}`)
  document.querySelectorAll('.admin-page').forEach((page) => {
    page.classList.toggle('is-active', page === pageEl)
  })

  let title = pageEl?.dataset.title || ''
  let subtitle = pageEl?.dataset.subtitle || ''
  if (route.entry === 'neu') {
    title = 'Neuer Tag'
  } else if (route.entry === 'edit') {
    title = 'Tag bearbeiten'
    subtitle = `Tagesinhalt für den ${formatIsoDate(route.date)} bearbeiten und mit Datenquellen anreichern.`
  }

  const areaLabel = AREA_LABELS[route.area] || ''
  // In Unterseiten steht der Elternbereich über dem Titel, sonst der Bereich.
  setPageMeta({ title, subtitle, overline: route.parent ? route.parent.label : areaLabel })

  const root = document.getElementById('main-container')
  if (root) root.classList.toggle('has-takeover', !!route.parent)

  const backEl = document.getElementById('page-back')
  if (backEl) {
    backEl.classList.toggle('is-hidden', !route.parent)
    if (route.parent) {
      backEl.setAttribute('href', route.parent.hash)
      backEl.setAttribute('aria-label', `Zurück zu ${route.parent.label}`)
      const labelEl = document.getElementById('page-back-label')
      if (labelEl) labelEl.textContent = route.parent.label
    }
  }

  const actionsEl = document.getElementById('page-actions')
  if (actionsEl) actionsEl.innerHTML = headActionsHtml(route)
  // Der Kopf wurde neu gezeichnet: Zähler und Sperre von „Alle übernehmen“ nachziehen.
  if (route.page === 'vorschlaege') aktualisiereVorschlagHinweise()

  const tabsEl = document.getElementById('page-tabs')
  if (tabsEl) {
    const tabs = AREA_TABS[route.area]
    const showTabs = !!tabs && !route.parent
    tabsEl.classList.toggle('is-hidden', !showTabs)
    tabsEl.setAttribute('aria-label', `Ansichten: ${areaLabel}`)
    tabsEl.innerHTML = showTabs
      ? tabs.map((tab) => `<a class="adm-tab" href="${tab.hash}"${tab.key === route.tab ? ' aria-current="page"' : ''}>${esc(tab.label)}</a>`).join('')
      : ''
  }

  // „page“ nur auf der Startseite des Bereichs; auf Unterseiten und anderen
  // Reitern markiert „true“ lediglich, in welchem Bereich man sich befindet.
  const isAreaStart = route.key === AREA_START[route.area]
  document.querySelectorAll('.adm-nav-item').forEach((item) => {
    if (item.dataset.area !== route.area) item.removeAttribute('aria-current')
    else item.setAttribute('aria-current', isAreaStart ? 'page' : 'true')
  })
}

// Daten je Route laden (früher in switchPage).
function runRouteLoaders(route) {
  switch (route.page) {
    case 'users':
      // Beim ersten Öffnen laden; danach bleibt die Liste samt Filtern stehen.
      if (!usersLoaded) loadUsersOverview()
      break
    case 'stats':
      // Lädt bei jedem Öffnen frisch (inkl. Diagramme und Zusammenfassung).
      loadStats()
      break
    case 'system':
      // Zustand und Performance lädt die Seite selbst (früher hingen sie am Start der Woche).
      loadHealth()
      loadPerformance()
      loadAuditLog()
      loadCoursePdfStatus()
      break
    case 'freedays':
      loadFreeDays()
      break
    case 'vorschlaege':
      loadVorschlaege()
      break
    case 'spezialwoche':
      loadSpezialwochen()
      break
    case 'push':
      loadPushTemplates()
      break
    case 'classroom':
      loadClassroomStats()
      break
    case 'klassenraum-demo':
      loadDemoEditor()
      break
    case 'metrics':
      loadProductMetrics()
      break
    case 'liste':
      renderEntryTable()
      break
    case 'calendar':
      renderCalendar()
      updateCalendarDetails(selectedCalendarDate)
      break
    default:
      break
  }
}

// Ein Wort zum Zustand des Formulars, links in der klebenden Leiste.
function aktualisiereStand() {
  const el = document.getElementById('entry-dirty-indicator')
  if (!el) return
  let text
  if (entryFormMode === 'loading') text = 'Tag wird geladen …'
  else if (entryFormMode === 'error') text = 'Speichern gesperrt'
  else if (entryFormDirty) text = 'Ungespeicherte Änderungen'
  else text = entryFormMode === 'edit' ? 'Keine Änderungen' : 'Noch nicht gespeichert'
  el.textContent = text
  el.classList.toggle('is-dirty', entryFormDirty && (entryFormMode === 'new' || entryFormMode === 'edit'))
}

// Speichern sperren (Fehler/Laden) oder als „läuft“ markieren. aria-disabled statt
// disabled: Der Knopf behält den Fokus, der Klickverteiler ignoriert ihn.
function setSpeichernGesperrt(gesperrt, { busy = false } = {}) {
  const btn = document.getElementById('save-btn')
  if (!btn) return
  if (gesperrt || busy) btn.setAttribute('aria-disabled', 'true')
  else btn.removeAttribute('aria-disabled')
  btn.classList.toggle('is-busy', busy)
  const text = document.getElementById('save-btn-text')
  if (text) text.textContent = busy ? 'Speichert …' : 'Speichern'
}

// Läuft gerade ein Speichern bzw. Löschen? Dann bleibt „Speichern“ bis zum Ende gesperrt,
// auch wenn setEntryMode zwischendurch (z. B. nach dem Speichern, vor dem Kalender-Neuladen) läuft.
let speichertGerade = false
let loeschtGerade = false

// Zustand des Tagesformulars: Modus setzen und Knöpfe passend sperren.
// Speichern ist nur im Modus 'new'/'edit' möglich, Löschen nur bei 'edit'
// (der Abschnitt „Tag löschen“ blendet sich bei gesperrtem Knopf per CSS aus).
function setEntryMode(mode) {
  entryFormMode = mode
  const page = document.getElementById('page-entry')
  if (page) page.dataset.modus = mode                       // CSS: blass beim Laden
  const form = document.getElementById('tag-formular')
  if (form) form.inert = mode === 'loading'                 // altes Formular nicht bedienbar
  setSpeichernGesperrt(mode === 'error' || mode === 'loading' || speichertGerade || loeschtGerade, { busy: speichertGerade })
  const deleteBtn = document.getElementById('delete-btn')
  if (deleteBtn) deleteBtn.disabled = mode !== 'edit'
  aktualisiereStand()
  aktualisiereDatumHinweis()
}

// Warnt, wenn Speichern einen anderen bestehenden Tag ersetzen oder einen zweiten
// anlegen würde. Nur Anzeige, die Speicherlogik bleibt unverändert.
function aktualisiereDatumHinweis() {
  const el = document.getElementById('tag-datum-hinweis')
  if (!el) return
  el.textContent = ''
  el.removeAttribute('data-tone')
  const datum = document.getElementById('datum')?.value || ''
  if (!isValidIsoDay(datum) || kalenderStatus !== 'ok') return
  if (entryFormMode !== 'new' && entryFormMode !== 'edit') return
  const belegt = !!kalenderData[datum]
  const geladen = entryFormMode === 'edit' ? selectedCalendarDate : ''
  if (geladen && datum !== geladen) {
    el.textContent = belegt
      ? `Für ${datumKurz(datum)} gibt es schon einen Tag. Speichern ersetzt ihn; ${datumKurz(geladen)} bleibt unverändert.`
      : `Speichern legt den Tag zusätzlich am ${datumKurz(datum)} an; ${datumKurz(geladen)} bleibt unverändert.`
  } else if (!geladen && belegt) {
    el.append(`Für ${datumKurz(datum)} gibt es schon einen Tag. Speichern ersetzt ihn. `)
    const link = document.createElement('a')
    link.className = 'adm-link'
    link.href = `#planen/tag/${datum}`
    link.textContent = 'Diesen Tag öffnen'
    el.append(link)
  } else return
  el.dataset.tone = 'warn'
}

// Meldung oben auf der Tagesseite. Leerer Text blendet sie aus.
function setEntryLoadError(message) {
  const el = document.getElementById('entry-load-error')
  if (!el) return
  el.textContent = ''
  if (!message) {
    el.className = 'tag-meldung'
    delete el.dataset.tone
    return
  }
  el.className = 'tag-meldung'
  el.dataset.tone = 'error'
  const text = document.createElement('span')
  text.textContent = message
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'adm-link'
  retry.dataset.action = 'retry-entry-route'
  retry.textContent = 'Erneut versuchen'
  el.append(text, ' ', retry)
}

function describeEntryLoadError(status, data) {
  if (status === 401 || status === 403) return 'Die Sitzung ist abgelaufen. Bitte neu anmelden.'
  if (status === 429) return 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.'
  if (status >= 500) return `Der Server meldet einen Fehler (HTTP ${status}).`
  if (data && typeof data.error === 'string' && data.error) return data.error
  return `Unerwartete Antwort vom Server (HTTP ${status}).`
}

async function renderEntryRoute(route, token) {
  if (route.entry === 'neu') {
    // Ein bereits angefangener neuer Tag bleibt erhalten (wie früher beim
    // „Neuer Tag“-Knopf); ein geladener bestehender Tag wird dagegen geleert,
    // sonst würde „Neuer Tag“ versehentlich diesen Tag überschreiben.
    // Ohne Snapshot (erster Besuch) gäbe es keine Dirty-Erkennung – dann einmal
    // initialisieren. keepDraft: ein gespeicherter Entwurf bleibt zur Wiederherstellung.
    if (entryFormMode !== 'new' || !entryFormSnapshot) {
      // Der Formularinhalt gehört jetzt „Neuer Tag“; dessen Entwurf wird angeboten.
      entryDraftBasis = 'neu'
      prefillDate(getTodayIso(), { force: true, keepDraft: true })
      offerEntryDraft()
    }
    return
  }

  // Bestehender Tag? Direkt beim Server fragen statt aus dem Kalender zu raten:
  // 200 = bearbeiten, 404 = neuer Tag, alles andere = Fehler (nie als „neu“ anbieten,
  // sonst könnte ein bestehender Tag überschrieben werden).
  setEntryMode('loading')
  setEntryLoadError('')
  hideEntryDraftBanner()
  const result = await editTag(route.date, { token })
  if (result.state === 'stale' || token !== routeRenderToken) return
  // Der Formularinhalt gehört jetzt diesem Tag; sein Entwurf (und nur seiner) wird angeboten.
  entryDraftBasis = route.date

  if (result.state === 'ok') {
    offerEntryDraft()
    return
  }
  if (result.state === 'missing') {
    prefillDate(route.date, { force: true, keepDraft: true })
    setEntryHead('neu', route.date)
    offerEntryDraft()
    return
  }
  if (result.state === 'error') {
    prefillDate(route.date, { force: true, keepDraft: true })
    setEntryMode('error')
    setEntryLoadError(`Der Tag ${formatIsoDate(route.date)} konnte nicht geladen werden: ${result.reason} Speichern ist gesperrt, damit kein bestehender Tag überschrieben wird.`)
    // Der Grund steht schon in der Meldung; der Untertitel wiederholt ihn nicht.
    setPageMeta({ title: 'Tag konnte nicht geladen werden', subtitle: '', overline: PARENT_PLANEN.label })
  }
}

// Kopf der Tagesseite an den Zustand des Formulars anpassen (nach Löschen/Speichern).
function setEntryHead(kind, isoDate) {
  if (kind === 'neu') {
    setPageMeta({
      title: 'Neuer Tag',
      subtitle: `Neuen Tageseintrag für den ${formatIsoDate(isoDate)} anlegen.`,
      overline: PARENT_PLANEN.label,
    })
    return
  }
  setPageMeta({
    title: 'Tag bearbeiten',
    subtitle: `Tagesinhalt für den ${formatIsoDate(isoDate)} bearbeiten und mit Datenquellen anreichern.`,
    overline: PARENT_PLANEN.label,
  })
}

// history.state mit dem Verlaufsindex des aktuellen Eintrags versehen.
function stampHistory(hash) {
  const base = window.history.state && typeof window.history.state === 'object' ? window.history.state : {}
  window.history.replaceState({ ...base, admIdx: currentIdx }, '', hash)
  routeHashByIdx.set(currentIdx, hash)
}

// Fokus nach einer vom Nutzer ausgelösten Navigation: Zielabschnitt, der Link,
// über den man von der Unterseite zurückkehrt, sonst die Seitenüberschrift.
function focusAfterNavigation(route, hash, { fromChild }) {
  const titleEl = document.getElementById('page-title')
  let target = null
  let preventScroll = true

  if (route.section) {
    const sectionEl = document.getElementById(`system-${route.section}`)
    const headingHost = sectionEl?.matches('h2') ? sectionEl : (sectionEl?.closest('.card') || sectionEl)
    const heading = headingHost?.matches('h2') ? headingHost : headingHost?.querySelector('h2')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      target = heading
    }
  } else if (fromChild) {
    const href = focusMemory.get(hash)
    if (href) {
      target = Array.from(document.querySelectorAll('#adm-main a[href]')).find((a) => a.getAttribute('href') === href) || null
      preventScroll = false
    }
  }

  const focusTarget = target || titleEl
  focusTarget?.focus({ preventScroll: target ? preventScroll : true })
  // Verdeckter oder nicht fokussierbarer Link → auf die Überschrift ausweichen.
  if (target && document.activeElement !== target) titleEl?.focus({ preventScroll: true })
}

async function renderRoute({ userInitiated = false } = {}) {
  let hash = window.location.hash
  let route = parseRoute(hash)
  if (route?.redirect) {
    hash = route.redirect
    route = parseRoute(hash)
  }
  if (!route || route.redirect) {
    hash = `#${AREA_START.planen}`
    route = parseRoute(hash)
  }

  const token = ++routeRenderToken
  const leavingRoute = currentRoute
  currentRouteHash = hash
  currentRoute = route
  // Weiterleitungen und Index in einem Schritt in den Verlauf schreiben (ohne neuen Eintrag).
  stampHistory(hash)

  applyRouteChrome(route)

  if (route.section) {
    document.getElementById(`system-${route.section}`)?.scrollIntoView({ block: 'start' })
  } else if (userInitiated && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0)
  }
  if (userInitiated) {
    focusAfterNavigation(route, hash, { fromChild: !!leavingRoute?.parent && leavingRoute.parent.hash === hash })
  }

  if (route.page === 'entry') await renderEntryRoute(route, token)
  else runRouteLoaders(route)
}

// Entwurfsschutz am Formular: nachfragen, wenn ungespeicherte Änderungen verloren
// gehen würden – beim Verlassen der Tagesseite UND beim Öffnen eines anderen Tages
// (auch aus Monat/Liste, wo das Formular im Hintergrund noch den Entwurf hält).
// Der Browser-eigene Schutz beim Schließen/Neuladen des Tabs fehlt bewusst
// (kein beforeunload); dort greift nur das Zwischenspeichern des Entwurfs.
function confirmLeaveEntryRoute(nextHash) {
  if (!entryFormDirty) return true
  const leaving = isEntryRouteHash(currentRouteHash)
  const entering = isEntryRouteHash(nextHash)
  // „Neuer Tag“ behält ein angefangenes neues Formular – nichts geht verloren.
  if (nextHash === '#planen/tag/neu' && entryFormMode === 'new') return true
  if (!leaving && !entering) return true
  const ok = confirmDiscardEntryChanges(entering ? 'verwerfen' : 'die Seite verlassen')
  // Bewusst verworfen: den gespeicherten Entwurf nicht beim nächsten Start anbieten.
  if (ok && entering) clearEntryDraft()
  return ok
}

function suppressNextHashChange() {
  suppressHashChange = true
  if (suppressTimer) window.clearTimeout(suppressTimer)
  // Sicherheitsnetz: feuert kein hashchange (gleiche Adresse), Flag nicht hängen lassen.
  suppressTimer = window.setTimeout(() => { suppressHashChange = false }, 1000)
}

function handleHashChange() {
  if (suppressHashChange) {
    suppressHashChange = false
    return
  }
  if (!routerActive) return

  // Neuer Eintrag (Link, Hash gesetzt) trägt noch keinen Index; Zurück/Vor-
  // Sprünge landen auf einem Eintrag mit admIdx.
  const stateIdx = window.history.state?.admIdx
  const isTraversal = Number.isInteger(stateIdx)

  if (!confirmLeaveEntryRoute(window.location.hash)) {
    // Abbruch: genau den Schritt rückgängig machen, ohne zu rendern.
    suppressNextHashChange()
    if (isTraversal) window.history.go(currentIdx - stateIdx)
    else window.history.back()
    return
  }
  currentIdx = isTraversal ? stateIdx : currentIdx + 1
  void renderRoute({ userInitiated: true })
}

// Programmatische Navigation. Bei gleicher Adresse feuert 'hashchange' nicht –
// dann wird direkt neu gerendert (z. B. zweimal derselbe Tag).
function navigate(hash) {
  const target = String(hash || '').startsWith('#') ? String(hash) : `#${hash}`
  if (target !== window.location.hash) {
    window.location.hash = target
    return
  }
  if (!routerActive || !confirmLeaveEntryRoute(target)) return
  void renderRoute({ userInitiated: true })
}

// Klick auf einen Hash-Link zur bereits aktiven Adresse → neu rendern.
function handleRouteLinkClick(event) {
  const link = event.target.closest?.('a[href^="#"]')
  if (!link || link.dataset.action) return
  if (!routerActive || event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = link.getAttribute('href')
  // Link merken, über den eine Unterseite betreten wird: Bei der Rückkehr
  // bekommt genau dieser Link den Fokus.
  const targetRoute = parseRoute(target)
  if (targetRoute?.parent) focusMemory.set(targetRoute.parent.hash, target)
  if (target !== window.location.hash) return
  event.preventDefault()
  navigate(target)
}

// „‹“ der Rückleiste. history.back() nur, wenn der vorherige App-Eintrag wirklich
// der Elternbereich ist (sonst stünde „‹ Werkzeuge“ vor einem Sprung zum Monat);
// andernfalls direkt zum Elternbereich.
function goBackFromSubpage() {
  const parent = currentRoute?.parent
  if (!parent) return
  if (currentIdx > 0) {
    const previousHash = routeHashByIdx.get(currentIdx - 1)
    const previousRoute = previousHash ? parseRoute(previousHash) : null
    if (previousRoute && !previousRoute.redirect && !previousRoute.parent && previousRoute.area === parent.area) {
      window.history.back()
      return
    }
  }
  navigate(parent.hash)
}

// Ändert die Adresse ohne Neurendern (z. B. nach dem Speichern eines neuen Tages).
function replaceRouteHashSilently(hash) {
  currentRouteHash = hash
  currentRoute = parseRoute(hash) || currentRoute
  stampHistory(hash)
}

function startRouter() {
  routerActive = true
  // Nach einem Neuladen trägt der Eintrag seinen Index noch in history.state.
  const existingIdx = window.history.state?.admIdx
  currentIdx = Number.isInteger(existingIdx) ? existingIdx : 0
  routeHashByIdx.clear()
  void renderRoute({ userInitiated: false })
}

function stopRouter() {
  routerActive = false
  currentRouteHash = null
  currentRoute = null
  routeRenderToken++
  routeHashByIdx.clear()
}

window.addEventListener('hashchange', handleHashChange)

// Die mobile Leiste wächst bei großer Schrift mit (Labels brechen um). Ihre echte
// Höhe als CSS-Variable bereitstellen, damit .adm-main genug Platz darunter lässt.
function observeNavBarHeight() {
  const nav = document.querySelector('.adm-nav')
  if (!nav || typeof ResizeObserver === 'undefined') return
  const apply = () => {
    document.documentElement.style.setProperty('--bar-h-actual', `${Math.ceil(nav.getBoundingClientRect().height)}px`)
  }
  new ResizeObserver(apply).observe(nav)
  apply()
}
observeNavBarHeight()

// Dünne Hülle für alte data-page-Werte.
function switchPage(pageId) {
  if (Object.hasOwn(LEGACY_PAGE_ROUTES, pageId)) navigate(LEGACY_PAGE_ROUTES[pageId])
}

// „neu laden“ in Planen › Woche: nur, was die Woche zeigt. Die übrigen Seiten
// laden beim Öffnen selbst (runRouteLoaders).
function refreshDashboard() {
  loadKalender()
  loadVorschlaege({ silent: true })
  loadFreeDays({ silent: true })
  loadHeuteSpiele()
  loadHealth()
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function readEntryFormState() {
  return ENTRY_FIELD_IDS.reduce((acc, id) => {
    const el = document.getElementById(id)
    acc[id] = normalizeText(el?.value || '')
    return acc
  }, {})
}

function setEntryDirtyState(isDirty) {
  entryFormDirty = !!isDirty
  aktualisiereStand()
  const resetBtn = document.getElementById('entry-reset-btn')
  if (resetBtn) resetBtn.disabled = !entryFormDirty
}

// options.keepDraft: ein gespeicherter Entwurf bleibt erhalten. Gilt für das
// Laden durch den Router – sonst würde ein Direktaufruf von #planen/tag/<datum>
// den Entwurf löschen, bevor „Wiederherstellen“ angeklickt werden kann.
// Gelöscht wird er nur nach dem Speichern, bewusstem Verwerfen/Zurücksetzen
// oder wenn der Nutzer ihn ablehnt.
// options.state: der Stand, der tatsächlich gespeichert wurde (nicht der aktuelle Formularinhalt –
// was während des Speicherns getippt wurde, bleibt ungespeichert).
function captureEntryFormSnapshot({ keepDraft = false, state = null } = {}) {
  entryFormSnapshot = state || readEntryFormState()
  setEntryDirtyState(false)
  if (!keepDraft) {
    // Gespeichert bzw. bewusst zurückgesetzt: auch ein wartender Entwurf ist erledigt.
    clearEntryDraft({ auchAngebotenen: true })
    hideEntryDraftBanner()
  }
}

function updateEntryDirtyState() {
  if (!entryFormSnapshot) {
    setEntryDirtyState(false)
    return
  }
  const current = readEntryFormState()
  const isDirty = ENTRY_FIELD_IDS.some((id) => current[id] !== entryFormSnapshot[id])
  setEntryDirtyState(isDirty)
  if (isDirty) scheduleEntryDraftSave()
  else clearEntryDraft()
}

// ── Entwurfsschutz für den Tageseintrag ───────────────────
// Mobile Browser beenden Hintergrund-Tabs regelmäßig. Ohne
// Zwischenspeicher wären die bis zu 25 ausgefüllten Felder dann
// ersatzlos verloren – ein In-App-confirm() greift dabei nicht.
// Ein Schlüssel je Tag („…:2026-11-10“, „…:neu“): Der Entwurf eines Tages
// erscheint nur auf dessen Seite und überschreibt nie den eines anderen.
const ENTRY_DRAFT_PREFIX = 'sig-admin-entry-draft:'
const ENTRY_DRAFT_LEGACY_KEY = 'sig-admin-entry-draft'   // ein Schlüssel für alles (bis zu diesem Umbau)
const ENTRY_DRAFT_MAX_TAGE = 30
let entryDraftTimer = null
let entryDraftBasis = 'neu'     // wem der Formularinhalt gehört: 'neu' oder das Datum der Route
let entryDraftAngeboten = null  // Basis, deren Entwurf gerade im Banner wartet

const draftKey = (basis = entryDraftBasis) => ENTRY_DRAFT_PREFIX + basis

function readStoredEntryDraft() {
  try {
    const raw = window.localStorage.getItem(draftKey())
    if (!raw) return null
    const draft = JSON.parse(raw)
    return draft && typeof draft === 'object' && draft.fields ? draft : null
  } catch {
    return null
  }
}

// Nur im Modus „neu“/„bearbeiten“ gehört der Formularinhalt dem Tag; bei Lade- oder
// Fehlerzustand würde Tippen sonst den echten Entwurf dieses Tages überschreiben/löschen.
const entryFormGehoertTag = () => entryFormMode === 'new' || entryFormMode === 'edit'

function persistEntryDraft() {
  if (!entryFormGehoertTag()) return
  // Ein wartender Entwurf wird nie überschrieben, bevor er behandelt ist.
  if (entryDraftAngeboten === entryDraftBasis) return
  try {
    window.localStorage.setItem(draftKey(), JSON.stringify({
      savedAt: Date.now(),
      basis: entryDraftBasis,
      fields: readEntryFormState(),
    }))
  } catch {
    // Privater Modus oder Speicher voll – der Entwurfsschutz ist optional.
  }
}

function scheduleEntryDraftSave() {
  if (entryDraftTimer) window.clearTimeout(entryDraftTimer)
  entryDraftTimer = window.setTimeout(persistEntryDraft, 800)
}

// auchAngebotenen: auch ein im Banner wartender Entwurf wird entfernt
// (nach dem Speichern, beim bewussten Verwerfen). Sonst bleibt er stehen.
function clearEntryDraft({ auchAngebotenen = false } = {}) {
  if (entryDraftTimer) {
    window.clearTimeout(entryDraftTimer)
    entryDraftTimer = null
  }
  if (!entryFormGehoertTag()) return
  if (!auchAngebotenen && entryDraftAngeboten === entryDraftBasis) return
  try {
    window.localStorage.removeItem(draftKey())
  } catch {
    // nichts zu tun
  }
}

function hideEntryDraftBanner() {
  const banner = document.getElementById('entry-draft-banner')
  if (banner) banner.hidden = true
  entryDraftAngeboten = null
}

// Bietet den Entwurf an, der zu genau diesem Tag (bzw. „Neuer Tag“) gehört –
// und nur, wenn er sich vom geladenen Stand unterscheidet.
function offerEntryDraft() {
  hideEntryDraftBanner()
  if (entryFormMode !== 'new' && entryFormMode !== 'edit') return
  const draft = readStoredEntryDraft()
  const banner = document.getElementById('entry-draft-banner')
  if (!draft || !banner) return

  const aktuell = readEntryFormState()
  const anzahl = ENTRY_FIELD_IDS.filter((id) => (draft.fields[id] || '') !== (aktuell[id] || '')).length
  if (!anzahl) {
    clearEntryDraft({ auchAngebotenen: true })   // nichts, was fehlt
    return
  }

  const d = new Date(draft.savedAt || Date.now())
  const wann = `${d.getDate()}. ${MONTHS_DE[d.getMonth()]}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
  entryDraftAngeboten = entryDraftBasis
  // Erst einblenden, dann den Text setzen: So kündigt die Statusregion ihn zuverlässig an.
  banner.hidden = false
  const textEl = document.getElementById('entry-draft-text')
  if (textEl) {
    textEl.textContent = `Ungespeicherte Änderungen ${entryDraftBasis === 'neu' ? 'an einem neuen Tag' : 'an diesem Tag'} vom ${wann} (${anzahl} ${anzahl === 1 ? 'Feld' : 'Felder'}).`
  }
}

function restoreEntryDraft() {
  const draft = readStoredEntryDraft()
  if (!draft) {
    hideEntryDraftBanner()
    return
  }
  // Seit dem Öffnen Getipptes würde durch den Entwurf ersetzt: vorher fragen.
  if (entryFormDirty && !window.confirm('Es gibt ungespeicherte Änderungen im Formular. Der Entwurf ersetzt sie. Wirklich wiederherstellen?')) return
  entryDraftAngeboten = null   // vor dem Einsetzen: der Entwurf ist behandelt und darf wieder fortgeschrieben werden
  applyEntryFields(draft.fields)
  // Gehört der Entwurf zu einem anderen Tag als dem geladenen (z. B. nach einem
  // Direktaufruf von #planen/tag/<datum>), darf „Löschen“ nicht den geladenen Tag treffen.
  const draftDate = draft.fields.datum || ''
  if (entryFormMode === 'edit' && draftDate !== selectedCalendarDate) {
    selectedCalendarDate = ''
    setEntryMode('new')
    if (currentRoute?.entry && isValidIsoDay(draftDate)) setEntryHead('neu', draftDate)
  }
  updateEntryDirtyState()
  hideEntryDraftBanner()
  aktualisiereDatumHinweis()
  // Der Knopf verschwindet mit dem Banner: Fokus zum Stand, Ergebnis in der Leiste melden.
  setStatus('Entwurf wiederhergestellt.', 'ok')
  document.getElementById('entry-dirty-indicator')?.focus()
}

function discardEntryDraft() {
  clearEntryDraft({ auchAngebotenen: true })
  hideEntryDraftBanner()
  setStatus('Entwurf verworfen.', 'ok')
  document.getElementById('entry-dirty-indicator')?.focus()
}

// Einmalig: alten Sammelschlüssel auf den Tag umziehen; alte Entwürfe entfernen.
// Der alte Entwurf landet beim Datum, das in ihm steht (auch wenn er unter
// „Neuer Tag“ entstand – unterscheidbar ist das nicht).
function entwuerfeAufraeumen() {
  try {
    const grenze = Date.now() - ENTRY_DRAFT_MAX_TAGE * 86400000
    const alt = window.localStorage.getItem(ENTRY_DRAFT_LEGACY_KEY)
    if (alt) {
      let draft = null
      try { draft = JSON.parse(alt) } catch { /* defekt → unten entfernt */ }
      if (draft?.fields && typeof draft.fields === 'object') {
        const basis = isValidIsoDay(draft.fields.datum) ? draft.fields.datum : 'neu'
        // Hat der Tag schon einen eigenen Entwurf, bleibt der neuere (savedAt) erhalten.
        let vorhanden = null
        try { vorhanden = JSON.parse(window.localStorage.getItem(draftKey(basis)) || 'null') } catch { /* defekt → ersetzen */ }
        if (!vorhanden || (Number(draft.savedAt) || 0) > (Number(vorhanden.savedAt) || 0)) {
          window.localStorage.setItem(draftKey(basis), JSON.stringify({ ...draft, basis }))
        }
      }
      window.localStorage.removeItem(ENTRY_DRAFT_LEGACY_KEY)
    }
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith(ENTRY_DRAFT_PREFIX)) continue
      let d = null
      try { d = JSON.parse(window.localStorage.getItem(key) || 'null') } catch { /* defekt → entfernen */ }
      if (!d?.savedAt || d.savedAt < grenze) window.localStorage.removeItem(key)
    }
  } catch {
    // Privater Modus o. Ä. – der Entwurfsschutz ist optional.
  }
}

// Setzt alle Ergebnisse, Meldungen und Hinweise des Formulars zurück (neuer Inhalt geladen).
function clearInlineAnalysisOutputs() {
  ;['entry-koll-analysis-output', 'entry-wz-analysis-output', 'entry-zw-analysis-output', 'entry-lf-analysis-output', 'entry-preview-output'].forEach((id) => {
    const el = document.getElementById(id)
    if (!el) return
    el.innerHTML = ''
    el.classList.remove('is-veraltet')
  })
  ;['koll', 'wz', 'zw', 'lf'].forEach((modus) => {
    const live = document.getElementById(`entry-${modus}-live`)
    if (live) live.textContent = ''
  })
  ;['wz', 'zw', 'lf'].forEach((modus) => setModusMeldung(modus, ''))
  const lfStatus = document.getElementById('lf-generate-status')
  if (lfStatus) {
    lfStatus.textContent = ''
    lfStatus.removeAttribute('data-tone')
  }
  loescheAlleFeldFehler()
}

function applyEntryFields(fields) {
  ENTRY_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.value = fields[id] || ''
  })
  hideAllExtraFields()
  if (fields.n1 || fields.l1) showExtraFields('koll-extras-1')
  if (fields.n2 || fields.l2) showExtraFields('koll-extras-2')
  if (fields.n3 || fields.l3) showExtraFields('koll-extras-3')
  if (fields['wz-notiz'] || fields['wz-link']) showExtraFields('wz-extras')
  if (fields['zw-notiz'] || fields['zw-link']) showExtraFields('zw-extras')
  updateModeIndicators()
}

function restoreEntryFormSnapshot() {
  if (!entryFormSnapshot) return
  applyEntryFields(entryFormSnapshot)
  setEntryDirtyState(false)
  clearEntryDraft()
  aktualisiereDatumHinweis()
}

function confirmDiscardEntryChanges(contextLabel = 'fortfahren') {
  if (!entryFormDirty) return true
  return window.confirm(`Es gibt ungespeicherte Änderungen. Wirklich ${contextLabel}?`)
}

function isSundayIso(iso) {
  if (!iso) return false
  const [year, month, day] = iso.split('-').map(Number)
  const value = new Date(year, (month || 1) - 1, day || 1)
  return value.getDay() === 0
}

function getFreeDayInfo(iso) {
  if (!iso) return null
  const explicit = freeDaysData.find((item) => item?.date === iso) || null
  if (explicit) {
    const bonus = Number(explicit.bonus_count) || 0
    return {
      date: iso,
      label: explicit.label || '',
      bonus,
      source: 'manual',
      displayLabel: `Bonus: +${bonus} Eigene-Lemma-Spiele für Basic${explicit.label ? ` · ${explicit.label}` : ''}`,
    }
  }
  return null
}

function isFreeAccessDay(iso) {
  return !!getFreeDayInfo(iso)
}

function buildConfirmList(items) {
  if (!Array.isArray(items) || !items.length) return ''
  return `\n\n${items.map((item) => `- ${item}`).join('\n')}`
}

function confirmAction(message, details = []) {
  return window.confirm(`${message}${buildConfirmList(details)}`)
}

function createTemporaryDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Inline-Meldung im System-Bereich – ersetzt blockierende alert()-Dialoge,
// die auf Mobilgeräten die Tastatur schließen und den Viewport umbauen.
function setSystemMessage(message, tone = 'info') {
  const msgEl = document.getElementById('system-msg')
  if (!msgEl) return
  msgEl.textContent = message || ''
  msgEl.classList.remove('is-hidden', 'is-error', 'is-success')
  if (!message) {
    msgEl.classList.add('is-hidden')
    return
  }
  if (tone === 'error') msgEl.classList.add('is-error')
  if (tone === 'success') msgEl.classList.add('is-success')
}

function setFreeDayMessage(message, tone = 'info') {
  const msgEl = document.getElementById('freeday-msg')
  if (!msgEl) return
  msgEl.textContent = message || ''
  msgEl.classList.remove('is-hidden', 'is-error', 'is-success')
  if (!message) {
    msgEl.classList.add('is-hidden')
    return
  }
  if (tone === 'error') msgEl.classList.add('is-error')
  if (tone === 'success') msgEl.classList.add('is-success')
}

function formatIsoDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

// Zerlegt ein ISO-Datum; wt = Wochentag-Index mit Montag = 0.
function datumTeile(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d, wt: (new Date(y, m - 1, d).getDay() + 6) % 7 }
}

// „Do 22.10.“
function datumKurz(iso) {
  const t = datumTeile(iso)
  return `${DAYS_DE[t.wt]} ${String(t.d).padStart(2, '0')}.${String(t.m).padStart(2, '0')}.`
}

// „Donnerstag, 22. Oktober“ (jahr: true → „… 2026“)
function datumLang(iso, { jahr = false } = {}) {
  const t = datumTeile(iso)
  return `${WOCHENTAGE_LANG[t.wt]}, ${t.d}. ${MONTHS_DE[t.m - 1]}${jahr ? ` ${t.y}` : ''}`
}

// „9.–15. November 2026“ · „26. Oktober – 1. November 2026“ · „29. Dezember 2026 – 4. Januar 2027“
function wochenSpanne(montagIso) {
  const a = datumTeile(montagIso)
  const e = datumTeile(addTageIso(montagIso, 6))
  if (a.y !== e.y) return `${a.d}. ${MONTHS_DE[a.m - 1]} ${a.y} – ${e.d}. ${MONTHS_DE[e.m - 1]} ${e.y}`
  if (a.m !== e.m) return `${a.d}. ${MONTHS_DE[a.m - 1]} – ${e.d}. ${MONTHS_DE[e.m - 1]} ${e.y}`
  return `${a.d}.–${e.d}. ${MONTHS_DE[e.m - 1]} ${e.y}`
}

// „A“, „A und B“, „A, B und C“
function aufzaehlung(namen) {
  return namen.length < 2 ? namen.join('') : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`
}

function toIsoFromMMDD(mmdd) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(mmdd || ''))) return String(mmdd)
  // Verwendet immer das aktuelle Jahr – kein Vorwärts-Raten, da Einträge jahreslos sind
  const [mm, dd] = String(mmdd || '').split('-').map(Number)
  if (!mm || !dd) return ''
  const year = getCurrentDate().getFullYear()
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function formatMmdd(datum) {
  // Akzeptiert YYYY-MM-DD oder MM-DD, gibt ein menschenlesbares Datum zurück
  if (!datum) return ''
  const parts = datum.split('-')
  if (parts.length === 3) {
    // YYYY-MM-DD
    const [y, m, d] = parts.map(Number)
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
  }
  // Fallback MM-DD (Legacy)
  const [mm, dd] = parts.map(Number)
  return `${String(dd).padStart(2, '0')}.${String(mm).padStart(2, '0')}.`
}

function parseCalendarDate(mmdd) {
  const iso = toIsoFromMMDD(mmdd)
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function modeChips(entry) {
  const chips = ['<span class="entry-chip mode-koll">Kollokation</span>']
  if (entry?.hasWortZwilling) chips.push('<span class="entry-chip mode-wortzwilling">Wort-Zwilling</span>')
  if (entry?.hasZeitenwende) chips.push('<span class="entry-chip mode-zeitenwende">Zeitenwende</span>')
  if (entry?.hasLueckenfueller) chips.push('<span class="entry-chip mode-lueckenfueller">Lückenfüller</span>')
  return chips.join('')
}

function sortCalendarEntries(entries) {
  return [...entries].sort((a, b) => a.datum.localeCompare(b.datum))
}

function getCalendarEntries() {
  return sortCalendarEntries(
    Object.entries(kalenderData || {}).map(([datum, entry]) => ({
      datum,
      iso: toIsoFromMMDD(datum),
      dateObj: parseCalendarDate(datum),
      entry,
    }))
  )
}

function getModeGroups(entry) {
  return Array.isArray(entry?.modeGroups) ? entry.modeGroups.filter((group) => Array.isArray(group?.items) && group.items.length) : []
}

// Reihenfolge = Marken, Legende und Detail-Raster (wie Tagesformular, Vorschläge und Server-modeGroups)
const MODI = [
  { key: 'kollokationen',  marke: 'k', buchstabe: 'K', label: 'Kollokationen' },
  { key: 'wortzwilling',   marke: 'w', buchstabe: 'W', label: 'Wort-Zwilling' },
  { key: 'zeitenwende',    marke: 'z', buchstabe: 'Z', label: 'Zeitenwende' },
  { key: 'lueckenfueller', marke: 'l', buchstabe: 'L', label: 'Lückenfüller' },
]

/**
 * Planungsstand eines Kalendertags – überall gleich: vollständig = alle vier Modi.
 * Grundlage: modeGroups aus GET /admin/kalender (nur Gruppen mit Inhalt).
 * Genutzt von Woche und Monat (renderCalendar).
 * @param {object|null|undefined} entry Kalendereintrag oder leer, wenn der Tag fehlt
 * @returns {{ modi: Array, anzahl: number, fehlend: Array, zustand: 'leer'|'teilweise'|'vollstaendig' }}
 */
function tagesStand(entry) {
  const vorhanden = new Map(getModeGroups(entry).map((g) => [g.key, g.items]))
  const modi = MODI.map((m) => ({ ...m, geplant: vorhanden.has(m.key), items: vorhanden.get(m.key) || [] }))
  const anzahl = modi.filter((m) => m.geplant).length
  return {
    modi,
    anzahl,
    fehlend: modi.filter((m) => !m.geplant),
    zustand: anzahl === 0 ? 'leer' : anzahl === MODI.length ? 'vollstaendig' : 'teilweise',
  }
}

function istVollstaendig(entry) {
  return tagesStand(entry).zustand === 'vollstaendig'
}

// „Lückenfüller fehlt“ · „Wort-Zwilling und Zeitenwende fehlen“ · „nur Kollokationen geplant“ · „nichts geplant“
function fehltText(stand) {
  if (stand.zustand === 'leer') return 'nichts geplant'
  if (stand.anzahl === 1) return `nur ${stand.modi.find((m) => m.geplant).label} geplant`
  const namen = stand.fehlend.map((m) => m.label)
  return `${aufzaehlung(namen)} ${namen.length === 1 ? 'fehlt' : 'fehlen'}`
}

function modeGroupKeyToClass(key) {
  if (key === 'wortzwilling') return 'mode-wortzwilling'
  if (key === 'zeitenwende') return 'mode-zeitenwende'
  if (key === 'lueckenfueller') return 'mode-lueckenfueller'
  return 'mode-koll'
}

function renderModeGroupSummary(entry, { emptyText = 'Keine Inhalte' } = {}) {
  const groups = getModeGroups(entry)
  if (!groups.length) return `<span class="entry-empty">${esc(emptyText)}</span>`

  return groups.map((group) => {
    const items = group.items.map((item) => `<span class="entry-chip">${esc(item)}</span>`).join('')
    return `<div class="mode-summary-group">
      <span class="entry-chip ${modeGroupKeyToClass(group.key)}">${esc(group.label)}</span>
      <div class="entry-chip-wrap">${items}</div>
    </div>`
  }).join('')
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'premium') return 'Premium'
  return 'User'
}

/**
 * Leer-/Lade-/Fehlerzeile für die Karten-Tabellen (Einträge, Nutzer, Audit).
 * `role` + `.table-message`, damit die Zeile auch im Karten-Layout (≤560px)
 * über die volle Breite läuft und ohne Feldlabel bleibt. `text` muss bereits
 * escaped sein.
 */
function tableMessageRow(colspan, cls, text) {
  return `<tr role="row"><td role="cell" colspan="${colspan}" class="${cls} table-message">${text}</td></tr>`
}

function getSelectedUserIdsFromTable() {
  const boxes = document.querySelectorAll('.user-select-checkbox:checked')
  return [...boxes].map((el) => String(el.dataset.userId || '').trim()).filter(Boolean)
}

function syncUsersSelectAllState() {
  const master = document.getElementById('users-select-all')
  if (!master) return

  const boxes = [...document.querySelectorAll('.user-select-checkbox')]
  if (!boxes.length) {
    master.checked = false
    master.indeterminate = false
    master.disabled = true
    return
  }

  const checkedCount = boxes.filter((box) => box.checked).length
  master.disabled = false
  master.checked = checkedCount === boxes.length
  master.indeterminate = checkedCount > 0 && checkedCount < boxes.length
}

function updateUsersBulkState() {
  const countEl = document.getElementById('users-bulk-count')
  const actionSelect = document.getElementById('users-bulk-action')
  const runBtn = document.getElementById('users-bulk-run-btn')
  const roleWrap = document.getElementById('users-bulk-role-wrap')
  const exportWrap = document.getElementById('users-bulk-export-wrap')
  const selectedIds = getSelectedUserIdsFromTable()
  const action = actionSelect?.value || 'setRole'

  syncUsersSelectAllState()

  if (countEl) countEl.textContent = `${selectedIds.length} ausgewählt`
  if (runBtn) runBtn.disabled = selectedIds.length === 0
  // classList statt style.display – .is-hidden hat display:none !important,
  // das inline-style nicht ueberschreiben kann.
  if (roleWrap) roleWrap.classList.toggle('is-hidden', action !== 'setRole')
  if (exportWrap) exportWrap.classList.toggle('is-hidden', action !== 'export')
}

function toggleAllUsersSelection(checked) {
  const boxes = document.querySelectorAll('.user-select-checkbox')
  boxes.forEach((box) => {
    box.checked = !!checked
  })
  updateUsersBulkState()
}

function clearUsersBulkSelection() {
  const boxes = document.querySelectorAll('.user-select-checkbox')
  boxes.forEach((box) => {
    box.checked = false
  })
  updateUsersBulkState()
}

async function runUsersBulkAction() {
  const ids = getSelectedUserIdsFromTable()
  if (!ids.length) return

  const actionSelect = document.getElementById('users-bulk-action')
  const roleSelect = document.getElementById('users-bulk-role')
  const formatSelect = document.getElementById('users-bulk-format')
  const runBtn = document.getElementById('users-bulk-run-btn')
  const summary = document.getElementById('users-summary')
  const action = actionSelect?.value || 'setRole'
  const role = roleSelect?.value || 'user'
  const format = formatSelect?.value === 'csv' ? 'csv' : 'json'

  const actionLabel = action === 'delete' ? 'löschen' : action === 'export' ? `als ${format.toUpperCase()} exportieren` : `auf Rolle ${role}`
  const ok = confirmAction(`${ids.length} Nutzer wirklich ${actionLabel}?`, [
    `Auswahl: ${ids.length} Nutzer`,
    action === 'setRole' ? `Neue Rolle: ${roleLabel(role)}` : `Aktion: ${actionLabel}`,
  ])
  if (!ok) return

  if (runBtn) runBtn.disabled = true
  try {
    const payload = { action, userIds: ids }
    if (action === 'setRole') payload.role = role
    if (action === 'export') payload.format = format

    const response = await fetch('/admin/users/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    let data = null
    if (format === 'csv' && action === 'export') {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }
      const csvText = await response.text()
      const exportedHeader = Number.parseInt(response.headers.get('x-exported-count') || '', 10)
      const skippedHeader = Number.parseInt(response.headers.get('x-skipped-count') || '', 10)
      const csvLines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)
      const fallbackExported = Math.max(csvLines.length - 1, 0)
      const exportedCount = Number.isFinite(exportedHeader) && exportedHeader >= 0 ? exportedHeader : fallbackExported
      const skippedCount = Number.isFinite(skippedHeader) && skippedHeader >= 0 ? skippedHeader : 0
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
      createTemporaryDownload(blob, `signifikation-users-bulk-${new Date().toISOString().slice(0, 10)}.csv`)
      if (summary) summary.textContent = `${exportedCount} Nutzer als CSV exportiert (${skippedCount} übersprungen).`
      data = {}
    } else {
      data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    }

    if (action === 'export') {
      if (format === 'json') {
        const exportUsers = Array.isArray(data.users) ? data.users : []
        const blob = new Blob([JSON.stringify(exportUsers, null, 2)], { type: 'application/json' })
        createTemporaryDownload(blob, `signifikation-users-bulk-${new Date().toISOString().slice(0, 10)}.json`)
        if (summary) summary.textContent = `${exportUsers.length} Nutzer exportiert (${data.skipped?.length || 0} übersprungen).`
      }
    } else if (action === 'delete') {
      if (summary) summary.textContent = `${data.deletedCount || 0} Nutzer gelöscht (${data.skipped?.length || 0} übersprungen).`
    } else {
      if (summary) summary.textContent = `${data.changedCount || 0} Nutzer aktualisiert (${data.skipped?.length || 0} übersprungen).`
    }

    clearUsersBulkSelection()
    await loadUsersOverview()
  } catch (err) {
    if (summary) summary.textContent = `Bulk-Aktion fehlgeschlagen: ${err.message}`
  } finally {
    if (runBtn) runBtn.disabled = getSelectedUserIdsFromTable().length === 0
  }
}

function summarizeAuditChanges(changes) {
  if (!changes || typeof changes !== 'object') return '—'
  const beforeKeys = changes.before && typeof changes.before === 'object' ? Object.keys(changes.before) : []
  const afterKeys = changes.after && typeof changes.after === 'object' ? Object.keys(changes.after) : []
  const merged = [...new Set([...beforeKeys, ...afterKeys])]
  if (!merged.length) return 'Keine Felder protokolliert'
  return merged.slice(0, 6).join(', ')
}

function showAuditEntryDetails(entry) {
  const pre = document.getElementById('audit-detail-json')
  if (!pre) return
  pre.textContent = JSON.stringify(entry, null, 2)
}

function showAuditEntryDetailsByIndex(index) {
  const entry = currentAuditEntries[index]
  if (!entry) return
  showAuditEntryDetails(entry)
}

// ── Login / Logout ────────────────────────────────────────
async function doLogin() {
  const emailInput = document.getElementById('login-email')
  const passwordInput = document.getElementById('login-password')
  const errEl = document.getElementById('login-error')
  const btn = document.getElementById('login-btn')

  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) return

  btn.disabled = true
  btn.textContent = '…'
  errEl.style.display = 'none'

  try {
    const r = await fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (r.ok) {
      document.getElementById('login-overlay').classList.add('hidden')
      showMainContainer()
      scheduleSessionRefresh()
      initDashboard()
    } else {
      const body = await r.json().catch(() => ({}))
      errEl.textContent = body.error || `Login fehlgeschlagen (${r.status})`
      errEl.style.display = 'block'
      passwordInput.value = ''
      passwordInput.focus()
    }
  } catch {
    errEl.textContent = 'Verbindungsfehler.'
    errEl.style.display = 'block'
  }
  btn.disabled = false
  btn.textContent = 'Anmelden'
}

async function downloadBackup() {
  setSystemMessage('')
  const r = await fetch('/admin/backup')
  if (!r.ok) {
    setSystemMessage('Backup fehlgeschlagen.', 'error')
    return
  }
  const blob = await r.blob()
  createTemporaryDownload(blob, `signifikation-backup-${new Date().toISOString().slice(0,10)}.json`)
  setSystemMessage('Backup heruntergeladen.', 'success')
}

function triggerBackupRestore() {
  const input = document.getElementById('backup-restore-input')
  if (input) input.click()
}

async function restoreBackupFile(event) {
  const file = event?.target?.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const restoredCounts = [
      ['Lemmata', payload?.lemmata?.length],
      ['Kalender', payload?.kalender ? Object.keys(payload.kalender).length : 0],
      ['Wortzwilling', payload?.wortzwilling ? Object.keys(payload.wortzwilling).length : 0],
      ['Zeitenwende', payload?.zeitenwende ? Object.keys(payload.zeitenwende).length : 0],
    ].filter(([, count]) => Number(count) > 0).map(([label, count]) => `${label}: ${count}`)
    const ok = confirmAction('Backup wirklich wiederherstellen? Der aktuelle Datenbestand wird überschrieben.', [
      `Datei: ${file.name}`,
      ...restoredCounts,
    ])
    if (!ok) return

    const response = await fetch('/admin/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, confirm: true }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const restored = data.restored || {}
    setSystemMessage(`Backup wiederhergestellt: ${restored.lemmata || 0} Lemmata, ${restored.kalender || 0} Kalendertage.`, 'success')
    refreshDashboard()
    loadPerformance()   // liegt auf derselben Seite (Werkzeuge › System)
  } catch (err) {
    setSystemMessage(`Backup-Restore fehlgeschlagen: ${err.message}`, 'error')
  } finally {
    event.target.value = ''
  }
}

function triggerCalendarCsvImport() {
  const input = document.getElementById('calendar-csv-input')
  if (input) input.click()
}

async function importCalendarCsv(event) {
  const file = event?.target?.files?.[0]
  if (!file) return

  try {
    const csv = await file.text()
    const lineCount = csv.split(/\r?\n/).filter((line) => line.trim().length > 0).length
    const ok = confirmAction('CSV-Import jetzt ausführen?', [
      `Datei: ${file.name}`,
      `Zeilen erkannt: ${Math.max(lineCount - 1, 0)}`,
      'Bestehende Einträge am selben Datum werden ersetzt.',
    ])
    if (!ok) return

    const response = await fetch('/admin/kalender/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    setListStatus(`${data.importedCount || 0} Einträge per CSV importiert, ${data.replacedCount || 0} ersetzt.`, 'ok')
    await loadKalender()
  } catch (err) {
    setListStatus(`CSV-Import fehlgeschlagen: ${err.message}`, 'error')
  } finally {
    event.target.value = ''
  }
}

async function doLogout() {
  if (sessionRefreshTimer) {
    window.clearTimeout(sessionRefreshTimer)
    sessionRefreshTimer = null
  }
  clearToken()
  stopRouter()
  await fetch('/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  hideMainContainer()
  document.getElementById('login-overlay').classList.remove('hidden')
  const emailInput = document.getElementById('login-email')
  const passwordInput = document.getElementById('login-password')
  const errorEl = document.getElementById('login-error')
  if (emailInput) emailInput.value = ''
  if (passwordInput) passwordInput.value = ''
  if (errorEl) errorEl.style.display = 'none'
}

// ── Beim Laden: Cookie prüfen (Browser sendet ihn automatisch) ──
fetch('/admin/kalender').then(r => {
  if (r.ok) {
    document.getElementById('login-overlay').classList.add('hidden')
    showMainContainer()
    scheduleSessionRefresh()
    initDashboard()
  }
  // Kein Cookie oder abgelaufen → Login-Overlay bleibt sichtbar
}).catch(() => {})

function initDashboard() {
  // Vor dem Router: Er bietet den Entwurf des geöffneten Tages an, dafür muss ein
  // alter Sammelschlüssel schon umgezogen sein.
  entwuerfeAufraeumen()
  startRouter()
  loadKalender()
  loadVorschlaege({ silent: true })
  loadFreeDays({ silent: true })   // Bonus in Woche und Monat
  loadHeuteSpiele()                // „Spiele heute“ in der Heute-Zeile
  loadHealth()                     // ein Wort in der Heute-Zeile
  // Alle übrigen Seiten (Nutzer, Spiele, System …) laden beim Öffnen selbst (runRouteLoaders).
}


// ── System-Zustand ────────────────────────────────────────────────────────────
function systemInOrdnung(data) {
  return data?.wortprofilDb === 'ok' && data?.belegeDb === 'ok'
}

// Füllt den Link in Planen › Woche (ein Wort) und die System-Seite (alle Werte).
// Jedes Ziel ist optional: fehlt eines, wird das andere trotzdem gefüllt.
async function loadHealth() {
  let data = null
  let fehler = ''
  try {
    const res = await fetch('/admin/health')
    data = await res.json().catch(() => null)
    if (!res.ok || !data) throw new Error(data?.error || `HTTP ${res.status}`)
  } catch (err) {
    data = null
    fehler = err.message || 'unbekannter Fehler'
  }

  const link = document.getElementById('wo-system')
  if (link) {
    if (!data) { link.textContent = 'Systemzustand unbekannt'; link.removeAttribute('data-tone') }
    // Unsichtbares Präfix: „System läuft“ allein sagt als Link nicht, wohin er führt
    else if (systemInOrdnung(data)) { link.innerHTML = '<span class="adm-visually-hidden">Systemzustand: </span>System läuft'; link.removeAttribute('data-tone') }
    else { link.innerHTML = '<span class="adm-visually-hidden">Systemzustand: </span>System prüfen'; link.dataset.tone = 'warn' }
  }

  const json = document.getElementById('system-health-json')
  if (json) json.textContent = data ? JSON.stringify(data, null, 2) : `Zustand konnte nicht abgerufen werden: ${fehler}`
}

// Notiz und Link: Zustand steht in aria-expanded; das +/− zeichnet die CSS.
function setzeNebenfelder(targetId, offen) {
  const el = document.getElementById(targetId)
  if (!el) return
  el.classList.toggle('is-hidden', !offen)
  const btn = document.querySelector(`[data-target="${targetId}"]`)
  if (!btn) return
  btn.setAttribute('aria-expanded', String(offen))
  // „· ausgefüllt“ am zugeklappten Schalter (CSS)
  btn.toggleAttribute('data-gefuellt', [...el.querySelectorAll('input, textarea')].some((f) => f.value.trim()))
}

function toggleExtraFields(targetId) {
  const el = document.getElementById(targetId)
  if (el) setzeNebenfelder(targetId, el.classList.contains('is-hidden'))
}

function showExtraFields(targetId) {
  setzeNebenfelder(targetId, true)
}

function hideAllExtraFields() {
  ;['koll-extras-1', 'koll-extras-2', 'koll-extras-3', 'wz-extras', 'zw-extras'].forEach((id) => setzeNebenfelder(id, false))
}

// Kopfwort je Modus: zeigt, was eingetragen ist (leer: „nicht geplant“, bei Kollokationen „Pflicht, noch leer“).
function updateModeIndicators() {
  const wert = (id) => normalizeText(document.getElementById(id)?.value || '')
  const setze = (id, text, leer) => {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = text || leer
    el.classList.toggle('is-leer', !text)
  }
  const koll = ['w1', 'w2', 'w3'].map(wert)
  setze('koll-indicator', koll.some(Boolean) ? koll.map((w) => w || '–').join(' · ') : '', 'Pflicht, noch leer')
  const a = wert('wza')
  const b = wert('wzb')
  setze('wz-indicator', a || b ? `${a || '–'} / ${b || '–'}` : '', 'nicht geplant')
  setze('zw-indicator', wert('zw-lemma'), 'nicht geplant')
  setze('lf-indicator', wert('lf-id'), 'nicht geplant')
  // Die Vorschau-Knöpfe tragen das jeweilige Wort.
  ;[1, 2, 3].forEach((n) => {
    const btn = document.getElementById(`tag-vorschau-${n}`)
    if (!btn) return
    const w = wert(`w${n}`)
    const text = btn.querySelector('.tag-vorschau-text') || btn
    text.textContent = w || `Wort ${n}`
    if (w) btn.removeAttribute('aria-disabled')
    else btn.setAttribute('aria-disabled', 'true')
  })
}

let kalenderData = {}
// Zustand des Kalender-Abrufs: Die Woche zeigt bei 'fehler' eine Meldung statt
// „nichts geplant“ an jedem Tag.
let kalenderStatus = 'laden'     // 'laden' | 'ok' | 'fehler'
let kalenderGeladenUm = null
let kalenderLaedtNeu = false     // „Erneut versuchen“ läuft
let calYear, calMonth

const initialNow = getCurrentDate()
calYear  = initialNow.getFullYear()
calMonth = initialNow.getMonth()

document.getElementById('datum').value = getTodayIso()

// Indikatoren beim Tippen aktualisieren
document.getElementById('page-entry')?.addEventListener('input', () => updateModeIndicators())

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const DAYS_DE   = ['Mo','Di','Mi','Do','Fr','Sa','So']

// Meldung in der klebenden Leiste der Tagesseite (neben „Speichern“).
// type: 'loading' | 'ok' | 'warn' | 'error'; ohne Text oder Typ wird der Ton entfernt.
function setStatus(msg, type) {
  const el = document.getElementById('status')
  if (!el) return
  el.textContent = ''
  if (msg) {
    // Eigenes Element für den Text: mobil schneidet CSS ihn auf eine Zeile, „ansehen“ bleibt sichtbar.
    const text = document.createElement('span')
    text.className = 'tag-status-text'
    text.textContent = msg
    text.title = msg
    el.append(text)
  }
  if (msg && type) el.dataset.tone = type
  else el.removeAttribute('data-tone')
}

// Meldung mit Sprung zur Stelle, um die es geht (z. B. „… nicht übernommen. ansehen“).
// modus: unsichtbarer Zusatz, damit der Knopf auch allein verständlich ist („ansehen: Wort-Zwilling“).
function setStatusMitSprung(msg, type, zielId, modus = '') {
  setStatus(msg, type)
  const el = document.getElementById('status')
  const ziel = document.getElementById(zielId)
  if (!el || !ziel) return
  const link = document.createElement('button')
  link.type = 'button'
  link.className = 'adm-link'
  link.append('ansehen')
  if (modus) {
    const zusatz = document.createElement('span')
    zusatz.className = 'adm-visually-hidden'
    zusatz.textContent = `: ${modus}`
    link.append(zusatz)
  }
  link.addEventListener('click', () => {
    ziel.setAttribute('tabindex', '-1')
    ziel.scrollIntoView({ block: 'center' })
    ziel.focus({ preventScroll: true })
  })
  el.append(' ', link)
}

// Meldung eines Modus (Wort-Zwilling, Zeitenwende, Lückenfüller) unter dessen Feldern.
function setModusMeldung(modus, text, tone) {
  const el = document.getElementById(`tag-meldung-${modus}`)
  if (!el) return
  el.textContent = text || ''
  if (text && tone) el.dataset.tone = tone
  else el.removeAttribute('data-tone')
}

// Statuswerte aus lueckenfuellerAutoGen.js (+ 'fehler'); 'vorhanden' = nichts zu melden
function lueckenfuellerModusMeldung(status) {
  switch (status) {
    case 'erzeugt':           return { text: 'Runden beim Speichern erzeugt.', tone: 'ok' }
    case 'zu-wenig-material': return { text: 'Nicht übernommen: Zu wenig Material im Korpus. Anderes Wort wählen.', tone: 'warn' }
    case 'unbekannt':         return { text: 'Nicht übernommen: Das Wort gehört nicht zu diesem Tag und hat noch keine Runden. Erst „Runden erzeugen“, dann speichern.', tone: 'warn' }
    case 'mehrdeutig':        return { text: 'Nicht übernommen: Die Kennung dieses Wortes gehört schon zu einem anderen Wort. Bitte das vorhandene Wort verwenden.', tone: 'warn' }
    case 'fehler':            return { text: 'Die Runden konnten nicht erzeugt werden. Bitte im Server-Protokoll nachsehen.', tone: 'error' }
    default:                  return null
  }
}

// Meldungen der Listenansicht (CSV-Import, Massenlöschen): eigene Zeile in
// #page-liste, da #status zur Tagesseite gehört und dort unsichtbar bliebe.
function setListStatus(msg, type) {
  const el = document.getElementById('liste-status')
  if (!el) return
  el.textContent = msg
  el.className = `status ${type}`
}


function renderCalendar() {
  const title = document.getElementById('cal-title')
  const grid  = document.getElementById('cal-grid')
  title.textContent = `${MONTHS_DE[calMonth]} ${calYear}`

  let html = DAYS_DE.map(d => `<div class="cal-dow">${d}</div>`).join('')

  const firstDate   = new Date(calYear, calMonth, 1)
  const firstDow    = (firstDate.getDay() + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()

  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty-slot"></div>`

  const todayIso = getTodayIso()

  for (let d = 1; d <= daysInMonth; d++) {
    const mm  = String(calMonth + 1).padStart(2, '0')
    const dd  = String(d).padStart(2, '0')
    const key = `${calYear}-${mm}-${dd}`   // YYYY-MM-DD – direkte DB-Key
    const entry       = kalenderData[key]
    const freeDayInfo = getFreeDayInfo(key)
    const isTodayCell = key === todayIso
    const isFreeDay   = !!freeDayInfo

    // Vollständig = alle vier Modi (tagesStand, gleiche Regel wie in der Woche);
    // pro geplantem Modus ein Punkt (K, W, Z, L).
    const stand       = tagesStand(entry)
    const hasEntry    = !!entry
    const hasAny      = stand.zustand !== 'leer'
    const isComplete  = stand.zustand === 'vollstaendig'
    const stateClass  = isComplete ? 'is-complete' : hasEntry ? 'has-entry' : 'no-entry'

    const isSelected = key === selectedCalendarDate
    const classes = ['cal-day', stateClass, isTodayCell ? 'is-today' : '', isSelected ? 'is-selected' : '', isFreeDay ? 'is-free-day' : ''].filter(Boolean).join(' ')

    let dots = ''
    if (hasAny || isFreeDay) {
      const dotClass = { k: 'koll', w: 'wz', z: 'zw', l: 'l' }
      dots = `<div class="cal-dots">` +
        stand.modi.filter((m) => m.geplant).map((m) => `<div class="cal-dot ${dotClass[m.marke]}"></div>`).join('') +
        (isFreeDay ? '<div class="cal-dot free"></div>' : '') +
        `</div>`
    }

    // Ein vorhandener Kalendereintrag wird geöffnet (auch ohne Modi, z. B. ids: []), sonst vorausgefüllt
    const opens = hasEntry || isFreeDay
    const action = opens ? 'select-calendar-date' : 'prefill-date'
    html += `<button type="button" class="${classes}" data-action="${action}" data-value="${esc(key)}" aria-label="${opens ? `Datum ${formatIsoDate(key)} öffnen` : `Datum ${formatIsoDate(key)} vorausfüllen`}">${d}${dots}</button>`
  }

  grid.innerHTML = html
}

function selectCalendarDate(datum) {
  selectedCalendarDate = datum
  renderCalendar()
  updateCalendarDetails(datum)
}

function changeMonth(delta) {
  calMonth += delta
  if (calMonth > 11) { calMonth = 0;  calYear++ }
  if (calMonth < 0)  { calMonth = 11; calYear-- }
  renderCalendar()
}

// Leert das Tagesformular und setzt das Datum. Die Seite selbst zeigt der
// Router (#planen/tag/…); options.force überspringt die Rückfrage, weil der
// Router sie beim Seitenwechsel schon gestellt hat. options.keepDraft lässt einen
// gespeicherten Entwurf bestehen (Router-Pfad). Gibt zurück, ob zurückgesetzt wurde.
function prefillDate(isoDate, options = {}) {
  if (!options.force && !confirmDiscardEntryChanges('verwerfen')) return false
  setEntryMode('new')
  setEntryLoadError('')
  selectedCalendarDate = ''
  renderCalendar()
  document.getElementById('datum').value = isoDate
  ;['w1','w2','w3','n1','n2','n3','l1','l2','l3','thema','thema-kurz','thema-quelle','zr','zr-notiz','zr-link','zw-lemma','zw-notiz','zw-link','wz-notiz','wz-link','lf-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  document.getElementById('p1').value    = 'Substantiv'
  document.getElementById('p2').value    = 'Verb'
  document.getElementById('p3').value    = 'Adjektiv'
  document.getElementById('wza').value   = ''
  document.getElementById('wzb').value   = ''
  document.getElementById('wzpos').value = 'Substantiv'
  // Meldung leeren; deleteCurrentTag setzt seine Bestätigung danach
  setStatus('', '')
  hideAllExtraFields()
  clearInlineAnalysisOutputs()
  updateModeIndicators()
  captureEntryFormSnapshot({ keepDraft: !!options.keepDraft })
  aktualisiereDatumHinweis()
  scrollNachOben()
  return true
}

// Weiches Scrollen nur, wenn der Nutzer keine reduzierte Bewegung wünscht.
function scrollNachOben() {
  if (typeof window.scrollTo !== 'function') return
  const weich = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  window.scrollTo({ top: 0, behavior: weich ? 'smooth' : 'auto' })
}

// Statuswerte aus server/lueckenfuellerAutoGen.js (plus 'fehler' aus admin-calendar.js)
function lueckenfuellerMeldung(status) {
  switch (status) {
    case 'erzeugt':           return 'Runden erzeugt'
    case 'vorhanden':         return 'OK'
    case 'zu-wenig-material': return 'zu wenig Material im Korpus, Wort tauschen'
    case 'unbekannt':         return 'ID passt zu keinem Wort dieses Tages'
    case 'mehrdeutig':        return 'Kennung gehört schon zu einem anderen Wort, nicht übernommen'
    case 'fehler':            return 'Fehler beim Erzeugen, Server-Log prüfen'
    default:                  return 'unbekannter Status'
  }
}

// Fehler je Feld: aria-invalid, kurzer Text unter dem Feld und aria-describedby darauf.
function setzeFeldFehler(id, text) {
  const el = document.getElementById(id)
  if (!el) return
  el.setAttribute('aria-invalid', 'true')
  const fehlerId = `${id}-fehler`
  let p = document.getElementById(fehlerId)
  if (!p) {
    p = document.createElement('p')
    p.id = fehlerId
    p.className = 'tag-feld-fehler'
    ;(el.closest('.tag-wert') || el.parentElement).append(p)
  }
  p.textContent = text
  if (el.dataset.beschreibung === undefined) el.dataset.beschreibung = el.getAttribute('aria-describedby') || ''
  el.setAttribute('aria-describedby', [el.dataset.beschreibung, fehlerId].filter(Boolean).join(' '))
}

function loescheFeldFehler(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.removeAttribute('aria-invalid')
  document.getElementById(`${id}-fehler`)?.remove()
  if (el.dataset.beschreibung !== undefined) {
    if (el.dataset.beschreibung) el.setAttribute('aria-describedby', el.dataset.beschreibung)
    else el.removeAttribute('aria-describedby')
    delete el.dataset.beschreibung
  }
}

function loescheAlleFeldFehler() {
  document.querySelectorAll('#page-entry [aria-invalid]').forEach((el) => loescheFeldFehler(el.id))
}

async function saveTag() {
  // Läuft schon, lädt noch, löscht gerade oder der Tag konnte nicht geladen werden: nichts tun (Strg+S eingeschlossen).
  if (speichertGerade || loeschtGerade) return
  if (document.getElementById('save-btn')?.getAttribute('aria-disabled') === 'true') return
  const datum = document.getElementById('datum').value
  const w1    = document.getElementById('w1').value.trim()
  const w2    = document.getElementById('w2').value.trim()
  const w3    = document.getElementById('w3').value.trim()
  const p1    = document.getElementById('p1').value
  const p2    = document.getElementById('p2').value
  const p3    = document.getElementById('p3').value
  const n1    = document.getElementById('n1').value.trim()
  const n2    = document.getElementById('n2').value.trim()
  const n3    = document.getElementById('n3').value.trim()
  const l1    = document.getElementById('l1').value.trim()
  const l2    = document.getElementById('l2').value.trim()
  const l3    = document.getElementById('l3').value.trim()
  const thema       = document.getElementById('thema').value.trim()
  const themaKurz   = document.getElementById('thema-kurz').value.trim()
  const themaQuelle = document.getElementById('thema-quelle').value.trim()
  const wza       = document.getElementById('wza').value.trim()
  const wzb       = document.getElementById('wzb').value.trim()
  const wzpos     = document.getElementById('wzpos').value
  const wzNotiz   = document.getElementById('wz-notiz').value.trim()
  const wzLink    = document.getElementById('wz-link').value.trim()
  const zwLemma   = document.getElementById('zw-lemma').value.trim()
  const zwNotiz   = document.getElementById('zw-notiz').value.trim()
  const zwLink    = document.getElementById('zw-link').value.trim()
  const lfId      = document.getElementById('lf-id').value.trim()

  // Pflichtfelder: fehlende benennen, rot unterstreichen und das erste fokussieren
  const fehlend = [['datum', 'Datum'], ['w1', 'Wort 1'], ['w2', 'Wort 2'], ['w3', 'Wort 3']]
    .filter(([id]) => !normalizeText(document.getElementById(id)?.value || ''))
  loescheAlleFeldFehler()
  if (fehlend.length) {
    fehlend.forEach(([id, name]) => setzeFeldFehler(id, `${name} fehlt.`))
    document.getElementById(fehlend[0][0])?.focus()
    return setStatus(`Nicht gespeichert: Es ${fehlend.length === 1 ? 'fehlt' : 'fehlen'} ${aufzaehlung(fehlend.map(([, name]) => name))}.`, 'error')
  }

  // Speichern ersetzt einen bestehenden Tag, wenn das Datum nicht der geladene Tag ist
  // (Neuer Tag mit belegtem Datum, geändertes Datum): vorher bestätigen lassen.
  const geladenerTag = entryFormMode === 'edit' ? selectedCalendarDate : ''
  if (kalenderStatus === 'ok' && kalenderData[datum] && datum !== geladenerTag
      && !confirmAction(`Für ${datumKurz(datum)} gibt es schon einen Tag. Ersetzen?`)) return

  // Speichern dauert (die Spieldaten werden berechnet). Kopf, Adresse und Auswahl
  // nur nachziehen, wenn der Nutzer währenddessen nicht weiternavigiert ist
  // und im Formular noch derselbe Tag steht.
  const saveToken = routeRenderToken
  const stillOnSavedDay = () => saveToken === routeRenderToken && document.getElementById('datum')?.value === datum
  // Der Stand, der gesendet wird: Was während des Speicherns noch getippt wird, gilt danach nicht als gespeichert.
  const gesendet = readEntryFormState()

  speichertGerade = true
  setSpeichernGesperrt(true, { busy: true })
  ;['wz', 'zw', 'lf'].forEach((modus) => setModusMeldung(modus, ''))
  setStatus('Die Spieldaten werden aus dem Korpus berechnet. Das kann einen Moment dauern.', 'loading')

  try {
    const res = await fetch('/admin/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datum, woerter: [w1, w2, w3], positionen: [p1, p2, p3],
        notizen: [n1, n2, n3], links: [l1, l2, l3],
        definitionen: ['', '', ''],
        thema,
        thema_kurz:    themaKurz,
        thema_quelle:  themaQuelle,
        zwilling_paar:     wza && wzb ? [wza, wzb] : null,
        zwilling_pos:      wzpos,
        zwilling_notiz:    wzNotiz,
        zwilling_link:     wzLink,
        zeitenwende_lemma: zwLemma,
        zeitenwende_notiz: zwNotiz,
        zeitenwende_link:  zwLink,
        lueckenfueller_id: lfId,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      // Kennungs-Kollision (409): Der Server nennt das betroffene Wortfeld; markieren wie ein Pflichtfeld.
      if (res.status === 409 && Number.isInteger(data.feld) && data.feld >= 0 && data.feld < 3) {
        setzeFeldFehler(`w${data.feld + 1}`, data.error)
        document.getElementById(`w${data.feld + 1}`)?.focus()
      }
      throw new Error(data.error || `HTTP ${res.status}`)
    }

    // Der Tag ist gespeichert; was der Server davon nicht übernommen hat, steht
    // bei dem betroffenen Modus (Warnung, kein Fehler).
    const uhr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    const probleme = []   // [Modusname, Meldungs-ID]
    if ((wza && !wzb) || (!wza && wzb)) {
      setModusMeldung('wz', 'Nicht übernommen: Der Wort-Zwilling braucht beide Wörter.', 'warn')
      probleme.push(['Wort-Zwilling', 'tag-meldung-wz'])
    } else if (wza && wzb && data.zwillingOk === false) {
      setModusMeldung('wz', 'Nicht übernommen: Für dieses Paar gibt es zu wenige eigene Kollokatoren (mindestens 5 je Wort). Anderes Paar wählen oder beide Felder leeren.', 'warn')
      probleme.push(['Wort-Zwilling', 'tag-meldung-wz'])
    }
    if (zwLemma && data.zeitenwendeOk === false) {
      setModusMeldung('zw', 'Nicht übernommen: Zu wenige Kollokatoren unterscheiden sich vor und nach 2000. Anderes Wort wählen oder Feld leeren.', 'warn')
      probleme.push(['Zeitenwende', 'tag-meldung-zw'])
    }
    const lf = lfId ? lueckenfuellerModusMeldung(data.lueckenfuellerStatus) : null
    if (lf) setModusMeldung('lf', lf.text, lf.tone)
    if (lfId && data.lueckenfuellerOk === false) probleme.push(['Lückenfüller', 'tag-meldung-lf'])
    if (!probleme.length) setStatus(`Gespeichert um ${uhr} Uhr.`, 'ok')
    else setStatusMitSprung(`Gespeichert um ${uhr} Uhr – ${aufzaehlung(probleme.map(([name]) => name))} nicht übernommen.`, 'warn', probleme[0][1], probleme[0][0])
    if (stillOnSavedDay()) {
      selectedCalendarDate = datum
      setEntryMode('edit')
      // Der Tag existiert jetzt: Adresse und Kopf entsprechend nachziehen (ohne Neurendern).
      if (currentRoute?.entry && isValidIsoDay(datum)) {
        setEntryHead('edit', datum)
        if (currentRouteHash !== `#planen/tag/${datum}`) replaceRouteHashSilently(`#planen/tag/${datum}`)
      }
    }
    await loadKalender()
    // Nur den Snapshot erneuern, wenn das Formular noch den gespeicherten Tag zeigt –
    // sonst würde ein inzwischen geöffneter anderer Tag fälschlich als „gespeichert“ gelten.
    if (stillOnSavedDay()) {
      // Ein im Banner wartender Entwurf wird nur mit erledigt, wenn er zum gespeicherten Datum gehört;
      // sonst bleibt er für das nächste „Neuer Tag“ erhalten.
      const wartend = entryDraftAngeboten === entryDraftBasis ? readStoredEntryDraft() : null
      const behalten = !!wartend && (wartend.fields.datum || '') !== datum
      const basisWechsel = entryDraftBasis !== datum
      captureEntryFormSnapshot({ keepDraft: true, state: gesendet })
      if (!behalten) {
        clearEntryDraft({ auchAngebotenen: true })
        hideEntryDraftBanner()
      } else if (basisWechsel) {
        hideEntryDraftBanner()
      }
      // Der Formularinhalt gehört jetzt diesem Tag; ein alter Entwurf unter diesem Datum ist überholt.
      if (basisWechsel) {
        entryDraftBasis = datum
        clearEntryDraft({ auchAngebotenen: true })
      }
      // Hat sich das Formular seit dem Absenden geändert, gilt das wieder als ungespeichert.
      updateEntryDirtyState()
    }
  } catch (err) {
    setStatus(`Nicht gespeichert: ${err.message}`, 'error')
  } finally {
    speichertGerade = false
    // Nicht entsperren, falls inzwischen ein Tag lädt oder nicht geladen werden konnte (oder ein Löschen läuft).
    setSpeichernGesperrt(entryFormMode === 'error' || entryFormMode === 'loading' || loeschtGerade)
  }
}

// Lädt einen bestehenden Tag ins Formular. Aufgerufen vom Router
// (#planen/tag/<datum>), der Rückfrage und Seitenwechsel schon erledigt hat.
// options.token: veraltete Antworten (Nutzer ist inzwischen weiternavigiert) verwerfen.
// Rückgabe: { state: 'ok' } | { state: 'missing' } (404, Tag existiert nicht) |
// { state: 'error', reason } | { state: 'stale' }. Das Formular wird nur bei 'ok' verändert.
async function editTag(datum, options = {}) {
  let res
  try {
    res = await fetch(`/admin/tag/${datum}`, {})
  } catch {
    if (options.token != null && options.token !== routeRenderToken) return { state: 'stale' }
    return { state: 'error', reason: 'Keine Verbindung zum Server.' }
  }
  const data = await res.json().catch(() => null)
  if (options.token != null && options.token !== routeRenderToken) return { state: 'stale' }
  if (res.status === 404 && data?.error === 'Kein Eintrag') return { state: 'missing' }
  if (!res.ok || !data || !Array.isArray(data.woerter) || !Array.isArray(data.notizen) || !Array.isArray(data.links)) {
    return { state: 'error', reason: describeEntryLoadError(res.status, data) }
  }
  selectedCalendarDate = datum
  setEntryMode('edit')
  setEntryLoadError('')
  document.getElementById('datum').value = datum
  document.getElementById('w1').value = data.woerter[0] || ''
  document.getElementById('w2').value = data.woerter[1] || ''
  document.getElementById('w3').value = data.woerter[2] || ''
  document.getElementById('p1').value = data.positionen?.[0] || 'Substantiv'
  document.getElementById('p2').value = data.positionen?.[1] || 'Verb'
  document.getElementById('p3').value = data.positionen?.[2] || 'Adjektiv'
  document.getElementById('n1').value = data.notizen[0] || ''
  document.getElementById('n2').value = data.notizen[1] || ''
  document.getElementById('n3').value = data.notizen[2] || ''
  document.getElementById('l1').value = data.links[0] || ''
  document.getElementById('l2').value = data.links[1] || ''
  document.getElementById('l3').value = data.links[2] || ''

  document.getElementById('thema').value        = data.thema || ''
  document.getElementById('thema-kurz').value  = data.thema_kurz || ''
  document.getElementById('thema-quelle').value = data.thema_quelle || ''
  document.getElementById('wza').value         = data.zwilling_paar?.[0] || ''
  document.getElementById('wzb').value         = data.zwilling_paar?.[1] || ''
  document.getElementById('wzpos').value       = data.zwilling_pos || 'Substantiv'
  document.getElementById('wz-notiz').value    = data.zwilling_notiz || ''
  document.getElementById('wz-link').value     = data.zwilling_link  || ''
  document.getElementById('zw-lemma').value    = data.zeitenwende_lemma || ''
  document.getElementById('zw-notiz').value    = data.zeitenwende_notiz || ''
  document.getElementById('zw-link').value     = data.zeitenwende_link  || ''
  // Das Feld zeigt das Wort („Lektüre“), nicht die Kennung („lektuere“); ältere
  // Antworten ohne Wort fallen auf die Kennung zurück (der Server akzeptiert beides).
  document.getElementById('lf-id').value       = data.lueckenfueller_lemma || data.lueckenfueller_id || ''

  // Extra-Felder aufklappen wenn Daten vorhanden
  hideAllExtraFields()
  if (data.notizen?.[0] || data.links?.[0]) showExtraFields('koll-extras-1')
  if (data.notizen?.[1] || data.links?.[1]) showExtraFields('koll-extras-2')
  if (data.notizen?.[2] || data.links?.[2]) showExtraFields('koll-extras-3')
  if (data.zwilling_notiz || data.zwilling_link) showExtraFields('wz-extras')
  if (data.zeitenwende_notiz || data.zeitenwende_link) showExtraFields('zw-extras')
  updateModeIndicators()
  clearInlineAnalysisOutputs()
  captureEntryFormSnapshot({ keepDraft: true })

  scrollNachOben()
  // Keine Ladebestätigung mehr: Der Stand „Keine Änderungen“ in der Leiste genügt.
  setStatus('', '')
  aktualisiereDatumHinweis()
  // Gespeichert ist nur eine Kennung, zu der kein Wort gefunden wurde: Das Feld zeigt sie unverändert
  // (so geht beim nächsten Speichern nichts verloren), die Seite sagt, warum es kein Wort ist.
  if (data.lueckenfueller_id && !data.lueckenfueller_lemma) {
    setModusMeldung('lf', `Gespeichert ist die Kennung „${data.lueckenfueller_id}“. Dazu gibt es noch kein Wort mit Runden.`, 'warn')
  }
  return { state: 'ok' }
}

async function deleteCurrentTag() {
  if (!selectedCalendarDate || loeschtGerade || speichertGerade) return
  const geloescht = selectedCalendarDate
  const details = [
    'Alle vier Modi verschwinden aus dem Kalender.',
    'Die Wörter und ihre Lückenfüller-Runden bleiben erhalten.',
    'Das lässt sich nicht rückgängig machen.',
  ]
  if (entryFormDirty) details.push('Ungespeicherte Änderungen gehen dabei verloren.')
  if (!confirmAction(`Tag ${datumLang(geloescht, { jahr: true })} löschen?`, details)) return

  // aria-disabled statt disabled: Bei disabled blendet das CSS den ganzen Abschnitt aus,
  // und der Fokus ginge verloren. Währenddessen ist auch Speichern (Strg+S) gesperrt.
  const deleteBtn = document.getElementById('delete-btn')
  deleteBtn?.setAttribute('aria-disabled', 'true')
  loeschtGerade = true
  setSpeichernGesperrt(true)

  try {
    const res = await fetch(`/admin/tag/${geloescht}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

    selectedEntryDates.delete(geloescht)
    delete kalenderData[geloescht]   // sonst hielte der Datumshinweis den gelöschten Tag noch für belegt
    const currentDate = document.getElementById('datum')?.value || getTodayIso()
    // force: Die Rückfrage zu ungespeicherten Änderungen war Teil der Lösch-Rückfrage.
    if (prefillDate(currentDate, { force: true }) && currentRoute?.entry && isValidIsoDay(currentDate)) {
      setEntryHead('neu', currentDate)
    }
    // Erst nach prefillDate, das die Meldung leert; sonst wäre die Bestätigung nie zu sehen.
    setStatus(`Tag ${formatIsoDate(geloescht)} gelöscht.`, 'ok')
    // Der Abschnitt „Tag löschen“ ist jetzt weg; der Fokus würde sonst ins Leere fallen.
    document.getElementById('page-title')?.focus()
    await loadKalender()
  } catch (err) {
    setStatus(`Nicht gelöscht: ${err.message}`, 'error')
    // Der Knopf ist noch da: Fokus bleibt bzw. kehrt dorthin zurück.
    deleteBtn?.focus()
  } finally {
    loeschtGerade = false
    deleteBtn?.removeAttribute('aria-disabled')
    setSpeichernGesperrt(entryFormMode === 'error' || entryFormMode === 'loading' || speichertGerade)
  }
}

async function loadKalender() {
  // Nach einem Fehler: Meldung samt Knopf stehen lassen (Fokus!), der Knopf zeigt „wird geladen“.
  if (kalenderStatus === 'fehler') {
    kalenderLaedtNeu = true
    renderWoche()
  }
  try {
    const res  = await fetch('/admin/kalender', {})
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const loaded = await res.json()
    // Fehlerantworten wie { error: … } nie als Kalender übernehmen.
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded) || typeof loaded.error === 'string') {
      throw new Error('Ungültige Kalenderantwort')
    }
    kalenderData = loaded
    kalenderStatus = 'ok'
    kalenderLaedtNeu = false
    kalenderGeladenUm = new Date()
    if (currentRoute?.page === 'entry') aktualisiereDatumHinweis()   // „Datum schon belegt“ erst mit Kalender

    for (const datum of [...selectedEntryDates]) {
      if (!kalenderData[datum]) selectedEntryDates.delete(datum)
    }

    if (selectedCalendarDate && !kalenderData[selectedCalendarDate] && !isFreeAccessDay(selectedCalendarDate)) {
      selectedCalendarDate = ''
    }

    renderCalendar()
    updateDashboardFromKalender()
    renderEntryTable()
    if (selectedCalendarDate) {
      updateCalendarDetails(selectedCalendarDate)
    } else {
      updateCalendarDetails('')
    }
  } catch {
    kalenderData = {}
    kalenderStatus = 'fehler'
    kalenderLaedtNeu = false
    selectedCalendarDate = ''
    selectedEntryDates.clear()
    renderCalendar()
    updateDashboardFromKalender()
    renderEntryTable()
    updateCalendarDetails('')
    if (currentRoute?.page === 'entry') aktualisiereDatumHinweis()
  }
}

function renderEntryTable() {
  const tbody = document.getElementById('entry-table-body')
  const countEl = document.getElementById('entry-count')
  if (!tbody || !countEl) return

  const search = (document.getElementById('entry-search')?.value || '').trim().toLowerCase()
  const modeFilter = document.getElementById('entry-mode-filter')?.value || 'all'
  const sortOrder = document.getElementById('entry-sort')?.value || 'date-asc'
  entryPageSize = parseInt(document.getElementById('entry-page-size')?.value, 10) || entryPageSize

  const entries = getCalendarEntries()

  let filtered = entries.filter(({ datum, entry }) => {
    const hasKoll = !!entry?.lemmata?.length
    const groupedText = getModeGroups(entry).flatMap((group) => group.items || []).join(' ').toLowerCase()
    const formattedDate = formatIsoDate(toIsoFromMMDD(datum)).toLowerCase()
    const matchesSearch = !search || datum.includes(search) || formattedDate.includes(search) || groupedText.includes(search)
    if (!matchesSearch) return false

    if (modeFilter === 'all') return true
    if (modeFilter === 'koll') return hasKoll
    if (modeFilter === 'wortzwilling') return !!entry?.hasWortZwilling
    if (modeFilter === 'zeitenwende') return !!entry?.hasZeitenwende
    if (modeFilter === 'lueckenfueller') return !!entry?.hasLueckenfueller
    return true
  })

  // getCalendarEntries() liefert bereits aufsteigend sortiert – bei "date-desc" nur umdrehen.
  if (sortOrder === 'date-desc') filtered = filtered.slice().reverse()

  countEl.textContent = `${filtered.length} von ${entries.length} Einträgen`

  if (!filtered.length) {
    tbody.innerHTML = tableMessageRow(5, 'entry-empty', 'Keine Einträge für den aktuellen Filter.')
    updateEntryBulkState([])
    entryTablePage = 1
    renderEntryPagination(0, 0, 1)
    return
  }

  // Auswahl-Bereinigung + Massenauswahl beziehen sich weiterhin auf ALLE
  // gefilterten Treffer (nicht nur die aktuell sichtbare Seite) – sonst
  // würde "Alle sichtbaren wählen" bei Paginierung nur die erste Seite treffen.
  const visibleDates = filtered.map((item) => item.datum)
  visibleDates.forEach((datum) => {
    if (selectedEntryDates.has(datum) && !kalenderData[datum]) selectedEntryDates.delete(datum)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / entryPageSize))
  if (entryTablePage > totalPages) entryTablePage = totalPages
  if (entryTablePage < 1) entryTablePage = 1
  const pageStart = (entryTablePage - 1) * entryPageSize
  const pageItems = filtered.slice(pageStart, pageStart + entryPageSize)

  tbody.innerHTML = pageItems.map(({ datum, iso, entry }) => {
    const summaryHtml = renderModeGroupSummary(entry)
    const checked = selectedEntryDates.has(datum) ? 'checked' : ''

    return `<tr role="row">
      <td role="cell" data-label="Auswahl" class="entry-select-col"><label class="cb-hit"><input type="checkbox" ${checked} data-action="toggle-entry-selection" data-datum="${datum}" aria-label="Eintrag ${esc(datum)} auswählen"></label></td>
      <td role="cell" data-label="Datum"><strong>${esc(formatMmdd(datum))}</strong><br><span class="entry-hint">${esc(datum)}</span></td>
      <td role="cell" data-label="Inhalte" class="cell-stack"><div class="mode-summary-list">${summaryHtml}</div></td>
      <td role="cell" data-label="Modi" class="cell-stack"><div class="entry-chip-wrap">${modeChips(entry)}</div></td>
      <td role="cell" data-label="Aktion">
        <div class="entry-row-actions">
          <button class="entry-action-btn" data-action="edit-tag" data-datum="${datum}">Bearbeiten</button>
          <button class="entry-action-btn" data-action="focus-calendar-date" data-value="${datum}">Im Kalender</button>
        </div>
      </td>
    </tr>`
  }).join('')

  updateEntryBulkState(visibleDates)
  renderEntryPagination(filtered.length, pageItems.length, totalPages)
}

function renderEntryPagination(filteredCount, pageItemCount, totalPages) {
  const infoEl = document.getElementById('entry-page-info')
  const prevBtn = document.getElementById('entry-page-prev-btn')
  const nextBtn = document.getElementById('entry-page-next-btn')
  if (!infoEl || !prevBtn || !nextBtn) return

  infoEl.textContent = filteredCount
    ? `Seite ${entryTablePage} von ${totalPages} (${pageItemCount} von ${filteredCount} angezeigt)`
    : 'Seite 1 von 1'
  prevBtn.disabled = entryTablePage <= 1
  nextBtn.disabled = entryTablePage >= totalPages
}

function goToEntryPage(delta) {
  entryTablePage += delta
  renderEntryTable()
}

/**
 * Die Eintragsliste wird komplett neu gerendert (Filter über alle Kalendertage
 * + innerHTML der Tabelle). Ohne Debounce passiert das bei jedem Tastenanschlag –
 * gleiches Muster wie scheduleUsersOverviewLoad.
 */
function scheduleEntryTableRender() {
  if (entrySearchTimer) {
    window.clearTimeout(entrySearchTimer)
  }
  entrySearchTimer = window.setTimeout(() => {
    entrySearchTimer = null
    entryTablePage = 1
    renderEntryTable()
  }, 200)
}

function resetEntryFilters() {
  if (entrySearchTimer) {
    window.clearTimeout(entrySearchTimer)
    entrySearchTimer = null
  }
  const searchInput = document.getElementById('entry-search')
  const modeFilter = document.getElementById('entry-mode-filter')
  const sortSelect = document.getElementById('entry-sort')
  if (searchInput) searchInput.value = ''
  if (modeFilter) modeFilter.value = 'all'
  if (sortSelect) sortSelect.value = 'date-asc'
  entryTablePage = 1
  renderEntryTable()
}

function updateEntryBulkState(visibleDates = []) {
  const count = document.getElementById('entry-bulk-count')
  const deleteBtn = document.getElementById('entry-bulk-delete-btn')
  if (!count || !deleteBtn) return

  for (const datum of [...selectedEntryDates]) {
    if (!kalenderData[datum]) selectedEntryDates.delete(datum)
  }

  const visibleSelected = visibleDates.filter((datum) => selectedEntryDates.has(datum)).length
  count.textContent = `${selectedEntryDates.size} ausgewählt${visibleDates.length ? ` (${visibleSelected} sichtbar)` : ''}`
  deleteBtn.disabled = selectedEntryDates.size === 0
}

function toggleEntrySelection(datum, checked) {
  if (!datum) return
  if (checked) selectedEntryDates.add(datum)
  else selectedEntryDates.delete(datum)

  const rows = Object.keys(kalenderData || {})
  updateEntryBulkState(rows)
}

function selectAllVisibleEntries() {
  const search = (document.getElementById('entry-search')?.value || '').trim().toLowerCase()
  const modeFilter = document.getElementById('entry-mode-filter')?.value || 'all'

  const visible = getCalendarEntries()
    .filter(({ datum, entry }) => {
      const hasKoll = !!entry?.lemmata?.length
      const groupedText = getModeGroups(entry).flatMap((group) => group.items || []).join(' ').toLowerCase()
      const formattedDate = formatIsoDate(toIsoFromMMDD(datum)).toLowerCase()
      const matchesSearch = !search || datum.includes(search) || formattedDate.includes(search) || groupedText.includes(search)
      if (!matchesSearch) return false
      if (modeFilter === 'all') return true
      if (modeFilter === 'koll') return hasKoll
      if (modeFilter === 'wortzwilling') return !!entry?.hasWortZwilling
      if (modeFilter === 'zeitenwende') return !!entry?.hasZeitenwende
      if (modeFilter === 'lueckenfueller') return !!entry?.hasLueckenfueller
      return true
    })
    .map(({ datum }) => datum)

  visible.forEach((datum) => selectedEntryDates.add(datum))
  renderEntryTable()
}

function clearEntrySelection() {
  selectedEntryDates.clear()
  renderEntryTable()
}

async function bulkDeleteSelectedDates() {
  if (!selectedEntryDates.size) return

  const dates = [...selectedEntryDates].sort()
  const ok = confirmAction(`${dates.length} Einträge wirklich löschen?`, [
    `Erster Tag: ${formatIsoDate(dates[0])}`,
    `Letzter Tag: ${formatIsoDate(dates[dates.length - 1])}`,
    'Diese Aktion kann nicht rückgängig gemacht werden.',
  ])
  if (!ok) return

  const deleteBtn = document.getElementById('entry-bulk-delete-btn')
  if (deleteBtn) deleteBtn.disabled = true

  try {
    const response = await fetch('/admin/kalender/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dates }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    selectedEntryDates.clear()
    setListStatus(`${data.removedCount || 0} Einträge gelöscht, ${data.skippedCount || 0} übersprungen.`, 'ok')
    await loadKalender()
  } catch (err) {
    setListStatus(`Bulk-Löschen fehlgeschlagen: ${err.message}`, 'error')
    const rows = Object.keys(kalenderData || {})
    updateEntryBulkState(rows)
  } finally {
    if (deleteBtn) deleteBtn.disabled = selectedEntryDates.size === 0
  }
}

function focusCalendarDate(datum) {
  // datum ist jetzt YYYY-MM-DD
  const [year, month] = datum.split('-').map(Number)
  calYear = year || new Date().getFullYear()
  calMonth = (month || 1) - 1
  selectedCalendarDate = datum
  // Der Router rendert Monat und Tagesdetails mit der gewählten Auswahl.
  navigate('#planen/monat')
}

function updateCalendarDetails(datum) {
  const details = document.getElementById('calendar-details')
  const editBtn = document.getElementById('calendar-edit-btn')
  if (!details || !editBtn) return

  if (!datum || (!kalenderData[datum] && !isFreeAccessDay(datum))) {
    details.innerHTML = '<div class="calendar-detail-empty">Wähle einen Kalendertag mit Eintrag, um Details zu sehen.</div>'
    editBtn.disabled = true
    editBtn.textContent = 'Eintrag bearbeiten'
    selectedCalendarDate = ''
    return
  }

  selectedCalendarDate = datum
  const entry = kalenderData[datum]
  const freeDayInfo = getFreeDayInfo(datum)
  editBtn.disabled = false
  editBtn.textContent = entry ? 'Eintrag bearbeiten' : 'Eintrag anlegen'

  const groupedHtml = entry ? renderModeGroupSummary(entry) : ''
  const freeDayHtml = freeDayInfo
    ? `<div class="calendar-detail-free"><strong>Bonus-Tag</strong><span>${esc(freeDayInfo.displayLabel)}</span></div>`
    : ''
  const contentHtml = entry
    ? `<div class="calendar-detail-section">
        <h3>Inhalte nach Modus</h3>
        <div class="mode-summary-list">${groupedHtml}</div>
      </div>
      <div class="calendar-detail-section">
        <h3>Modi</h3>
        <div class="calendar-detail-list">${modeChips(entry)}</div>
      </div>`
    : '<div class="calendar-detail-empty">Für diesen Tag gibt es noch keinen Spieleintrag. Du kannst das Datum direkt vorausfüllen.</div>'

  details.innerHTML = `
    <div class="calendar-detail-head">
      <strong>${esc(formatIsoDate(datum))}</strong>
      <span>${esc(datum)}</span>
    </div>
    ${freeDayHtml}
    ${contentHtml}
  `
}

function editSelectedCalendarDate() {
  if (!selectedCalendarDate) return
  navigate(`#planen/tag/${selectedCalendarDate}`)
}

// ── Planen › Woche ────────────────────────────────────────────────────────────
// Heute-Zeile, sieben Tage mit einem Detail-Element, Lücken der nächsten vier
// Wochen und Stand. Alle Texte lesen Zustand aus kalenderData/kalenderStatus.

const LUECKEN_TAGE = 28
const LUECKEN_MAX = 8
let wocheLiveAktiv = false

function updateDashboardFromKalender() {
  renderHeuteZeile()
  renderWoche()
  renderLuecken()
  renderStand()
}

// Montag der Woche (offset 0 = diese Woche, ±1 = Vor-/Nachwoche), als ISO-Datum.
function wochenMontag(offset) {
  const heute = getTodayIso()
  return addTageIso(heute, -datumTeile(heute).wt + offset * 7)
}

function hatOffenenVorschlag(datum) {
  return vorschlaege.some((v) => v.datum === datum && !v.erledigt)
}

function renderWoche() {
  const host = document.getElementById('dashboard-calendar-preview')
  if (!host) return
  const heute = getTodayIso()
  const montag = wochenMontag(dashboardWeekOffset)
  const tage = Array.from({ length: 7 }, (_, i) => addTageIso(montag, i))
  if (!tage.includes(selectedDashboardDate)) selectedDashboardDate = tage.includes(heute) ? heute : montag

  const kw = document.getElementById('wo-woche-kw')
  if (kw) kw.textContent = `KW ${isoKalenderwoche(montag).woche}`
  const spanne = document.getElementById('dashboard-week-label')
  if (spanne) {
    // Nur bei geändertem Text setzen: Jeder Schreibzugriff löst sonst eine Ansage aus
    // (loadKalender und loadFreeDays rendern die Woche kurz nacheinander).
    const text = wochenSpanne(montag)
    if (spanne.textContent !== text) spanne.textContent = text
    // erst nach dem ersten Rendern ansagen, sonst meldet der Screenreader das Laden
    if (!wocheLiveAktiv) {
      spanne.setAttribute('aria-live', 'polite')
      wocheLiveAktiv = true
    }
  }
  document.getElementById('wo-woche-heute')?.setAttribute('aria-disabled', String(dashboardWeekOffset === 0))

  // Ohne Kalender sind Legende sowie Lücken und Stand sinnlos – nur im Fehlerfall ausblenden
  document.getElementById('wo-legende')?.classList.toggle('is-hidden', kalenderStatus === 'fehler')
  document.getElementById('wo-unten')?.classList.toggle('is-hidden', kalenderStatus === 'fehler')

  if (kalenderStatus === 'fehler') {
    // Meldung nur einmal aufbauen: Neu gezeichnet würde der Screenreader sie bei jedem
    // renderWoche (Wochenwechsel, loadFreeDays) erneut ansagen, und der Fokus ginge verloren.
    let knopf = host.querySelector('.wo-meldung[data-tone="err"] [data-action="load-kalender"]')
    if (!knopf) {
      host.innerHTML = '<p class="wo-meldung" data-tone="err" role="alert">Der Kalender konnte nicht geladen werden. <button type="button" class="adm-link" data-action="load-kalender">Erneut versuchen</button></p>'
      knopf = host.querySelector('[data-action="load-kalender"]')
    }
    knopf.setAttribute('aria-disabled', String(kalenderLaedtNeu))
    const knopfText = kalenderLaedtNeu ? 'Woche wird geladen …' : 'Erneut versuchen'
    if (knopf.textContent !== knopfText) knopf.textContent = knopfText
    return
  }
  if (kalenderStatus !== 'ok') {
    host.innerHTML = '<p class="wo-meldung">Woche wird geladen …</p>'
    return
  }

  // Fokus merken: gleicher Tag, Überschrift des Details oder der Knopf der Fehlermeldung
  const aktiv = document.activeElement
  const fokusTag = host.contains(aktiv) ? (aktiv.closest('.wo-tag')?.dataset.value || '') : ''
  const fokusImDetail = !!aktiv?.closest?.('#dashboard-day-detail')
  const fokusInMeldung = !!aktiv?.closest?.('.wo-meldung')

  host.innerHTML = tage.map((datum) => wochenTagHtml(datum, heute)).join('')
    + '<div class="wo-detail" id="dashboard-day-detail"></div>'
  const detail = document.getElementById('dashboard-day-detail')
  host.querySelector(`.wo-tag[data-value="${CSS.escape(selectedDashboardDate)}"]`)?.after(detail)
  renderTagesDetail(selectedDashboardDate)

  if (fokusTag) host.querySelector(`.wo-tag[data-value="${CSS.escape(fokusTag)}"]`)?.focus({ preventScroll: true })
  else if (fokusImDetail) detail.querySelector('.wo-detail-thema')?.focus({ preventScroll: true })
  // „Erneut versuchen“ war erfolgreich: Der Knopf ist weg, der gewählte Tag übernimmt den Fokus
  else if (fokusInMeldung) host.querySelector(`.wo-tag[data-value="${CSS.escape(selectedDashboardDate)}"]`)?.focus({ preventScroll: true })
}

function wochenTagHtml(datum, heute) {
  const entry = kalenderData?.[datum] || null
  const stand = tagesStand(entry)
  const t = datumTeile(datum)
  const istHeute = datum === heute
  const gewaehlt = datum === selectedDashboardDate
  const bonus = isFreeAccessDay(datum)
  const marken = stand.modi.map((m) => (m.geplant
    ? `<span class="wo-marke" data-m="${m.marke}">${m.buchstabe}</span>`
    : '<span class="wo-marke is-fehlt"></span>')).join('')
  const thema = !entry
    ? '<span class="wo-tag-thema is-leer">nichts geplant</span>'
    : entry.thema
      ? `<span class="wo-tag-thema">${esc(entry.thema)}</span>`
      : '<span class="wo-tag-thema is-leer">ohne Thema</span>'
  const kurz = stand.zustand === 'leer' ? 'leer' : stand.zustand === 'teilweise' ? `${stand.anzahl} von ${MODI.length}` : ''
  // Stand für Screenreader. Bei einem Tag ohne Eintrag sagt das sichtbare Thema
  // („nichts geplant“) es schon – dann kein zweites Mal.
  const sr = stand.zustand === 'vollstaendig' ? 'vollständig'
    : stand.zustand === 'leer' ? (entry ? 'nichts geplant' : '')
      : `${stand.anzahl} von ${MODI.length} Modi, ${fehltText(stand)}`
  const srTeile = [sr, bonus ? 'Bonus-Tag' : ''].filter(Boolean)
  // Der Name enthält das sichtbare Datum (WCAG 2.5.3): nur der Wochentag wird ausgeschrieben.
  // „heute“ sagt aria-current="date" schon.
  return `<button type="button" class="wo-tag${gewaehlt ? ' is-gewaehlt' : ''}${datum < heute ? ' is-vergangen' : ''}"`
    + ` data-action="select-dashboard-date" data-value="${esc(datum)}" aria-expanded="${gewaehlt}"`
    + ` aria-controls="dashboard-day-detail"${istHeute ? ' aria-current="date"' : ''}>`
    + `<span class="wo-tag-wt"><span class="adm-visually-hidden">${WOCHENTAGE_LANG[t.wt]}, </span><span aria-hidden="true">${DAYS_DE[t.wt]}${istHeute ? ' · heute' : ''}</span></span>`
    + `<span class="wo-tag-datum">${String(t.d).padStart(2, '0')}.${String(t.m).padStart(2, '0')}.</span>`
    + thema
    + `<span class="wo-marken" aria-hidden="true">${marken}</span>`
    + (srTeile.length ? `<span class="adm-visually-hidden">, ${esc(srTeile.join(', '))}</span>` : '')
    // ohne Leerraum: :empty blendet den Fuß bei vollständigen Tagen aus
    + `<span class="wo-tag-fuss" aria-hidden="true">${kurz ? `<span class="wo-tag-stand">${kurz}</span>` : ''}${bonus ? '<span class="wo-bonus">Bonus</span>' : ''}</span>`
    + '</button>'
}

// Auswahl: nur Klassen/ARIA umschalten und das Detail umhängen – der Fokus bleibt auf dem Knopf.
function selectDashboardDay(datum) {
  const host = document.getElementById('dashboard-calendar-preview')
  const tag = host?.querySelector(`.wo-tag[data-value="${CSS.escape(datum)}"]`)
  const detail = document.getElementById('dashboard-day-detail')
  if (!tag || !detail) return
  selectedDashboardDate = datum
  host.querySelectorAll('.wo-tag').forEach((b) => {
    const an = b === tag
    b.classList.toggle('is-gewaehlt', an)
    b.setAttribute('aria-expanded', String(an))
  })
  tag.after(detail)
  renderTagesDetail(datum)
}

function changeDashboardWeek(delta) {
  dashboardWeekOffset += delta
  selectedDashboardDate = ''
  renderWoche()   // der Fokus bleibt auf dem Navigationsknopf (liegt außerhalb der Tage)
}

function zeigeDieseWoche() {
  if (dashboardWeekOffset === 0) return
  dashboardWeekOffset = 0
  selectedDashboardDate = getTodayIso()
  renderWoche()
}

function renderTagesDetail(datum) {
  const detail = document.getElementById('dashboard-day-detail')
  if (!detail || !datum) return
  const heute = getTodayIso()
  const entry = kalenderData?.[datum] || null
  const stand = tagesStand(entry)
  const vergangen = datum < heute
  const bonus = getFreeDayInfo(datum)
  // Unsichtbarer Zusatz INNERHALB des Text-Spans, sonst entsteht in Chrome eine zweite Flex-Lücke vor dem Pfeil
  const fuer = `<span class="adm-visually-hidden">: ${esc(datumLang(datum))}</span>`
  const over = `${datumLang(datum, { jahr: true })}${datum === heute ? ' · heute' : ''}`
  const bonusHtml = bonus
    ? `<p class="wo-detail-bonus"><span class="wo-bonus">Bonus</span><span>+${bonus.bonus} Eigene-Lemma-Spiele für Basic${bonus.label ? ` · ${esc(bonus.label)}` : ''}</span></p>`
    : ''

  if (!entry) {
    const vorschlag = hatOffenenVorschlag(datum)
    detail.innerHTML = `<div class="wo-detail-kopf">
        <p class="adm-overline wo-detail-over">${esc(over)}</p>
        <h3 class="wo-detail-thema is-leer" tabindex="-1">Noch nichts geplant</h3>
        ${vorschlag ? '<p class="wo-detail-kurz">Für diesen Tag liegt ein Vorschlag vor.</p>' : ''}${bonusHtml}
      </div>
      <div class="wo-detail-aktionen">
        ${vorschlag ? '<a class="adm-link" href="#vorschlaege">Vorschlag ansehen</a>' : ''}
        <a class="adm-cta" href="#planen/tag/${esc(datum)}"><span>Tag anlegen${fuer}</span> <span aria-hidden="true">→</span></a>
      </div>`
    return
  }

  const zeile = (m) => {
    if (!m.geplant) {
      return `<div class="vorschlag-modus${vergangen ? '' : ' is-warnung'}"><dt class="vorschlag-label">${m.label}</dt>`
        + `<dd class="vorschlag-wert">${vergangen ? 'nicht geplant' : 'fehlt'}</dd></div>`
    }
    const wert = m.items.map(esc).join(m.key === 'wortzwilling' ? ' / ' : ' · ')
    return `<div class="vorschlag-modus"><dt class="vorschlag-label">${m.label}</dt><dd class="vorschlag-wert">${wert}</dd></div>`
  }
  const standText = stand.zustand === 'vollstaendig' ? 'vollständig' : `${stand.anzahl} von ${MODI.length} Modi`
  detail.innerHTML = `<div class="wo-detail-kopf">
      <p class="adm-overline wo-detail-over">${esc(over)} · ${standText}</p>
      <h3 class="wo-detail-thema${entry.thema ? '' : ' is-leer'}" tabindex="-1">${esc(entry.thema || 'ohne Thema')}</h3>
      ${entry.thema_kurz ? `<p class="wo-detail-kurz">${esc(entry.thema_kurz)}</p>` : ''}${bonusHtml}
    </div>
    <dl class="vorschlag-modi">${stand.modi.map(zeile).join('')}</dl>
    <div class="wo-detail-aktionen">
      <a class="adm-cta" href="#planen/tag/${esc(datum)}"><span>Tag bearbeiten${fuer}</span> <span aria-hidden="true">→</span></a>
    </div>`
}

function renderHeuteZeile() {
  const zeile = document.getElementById('wo-heute')
  if (!zeile) return
  const heute = getTodayIso()
  const label = document.getElementById('wo-heute-label')
  if (label) label.innerHTML = `Heute <span aria-hidden="true">· ${esc(datumKurz(heute))}</span><span class="adm-visually-hidden">, ${esc(datumLang(heute))}</span>`
  const thema = document.getElementById('wo-heute-thema')
  const standEl = document.getElementById('wo-heute-stand')
  const anlegen = document.getElementById('wo-heute-anlegen')
  if (!thema || !standEl) return

  if (kalenderStatus !== 'ok') {
    thema.textContent = kalenderStatus === 'fehler' ? 'Kalender nicht geladen' : 'wird geladen …'
    thema.classList.add('is-leer')
    standEl.textContent = ''
    standEl.removeAttribute('data-tone')
    anlegen?.classList.add('is-hidden')
    anlegen?.removeAttribute('href')
    zeile.removeAttribute('data-tone')
    return
  }

  const entry = kalenderData?.[heute] || null
  const stand = tagesStand(entry)
  thema.textContent = !entry ? 'Für heute ist nichts geplant.' : (entry.thema || 'ohne Thema')
  thema.classList.toggle('is-leer', !entry || !entry.thema)
  // Ohne Eintrag sagt der Satz „Für heute ist nichts geplant.“ es schon – kein zweites Mal als Statuswort.
  standEl.textContent = stand.zustand === 'vollstaendig' ? 'vollständig'
    : stand.zustand === 'leer' ? (entry ? 'nichts geplant' : '')
      : `${stand.anzahl} von ${MODI.length} Modi`
  standEl.dataset.tone = stand.zustand === 'vollstaendig' ? 'ok' : 'warn'
  // Warnton, nicht Rot: Rot + Strich ist „ausgewählt“ (DESIGN.md §4)
  if (stand.zustand === 'leer') zeile.dataset.tone = 'warn'
  else zeile.removeAttribute('data-tone')
  if (anlegen) {
    const leer = stand.zustand === 'leer'
    anlegen.classList.toggle('is-hidden', !leer)
    // href nur am sichtbaren Link: focusAfterNavigation sucht Links per href und träfe sonst den versteckten
    if (leer) anlegen.setAttribute('href', `#planen/tag/${heute}`)
    else anlegen.removeAttribute('href')
  }
}

// Alle Spiele eines Tages (auch Lückenfüller). Die Schlüssel der Statistik sind ISO-Daten.
function zaehleSpieleAm(timeline, iso) {
  const tag = Array.isArray(timeline) ? timeline.find((t) => t?.datum === iso) : null
  let plays = 0
  let scoreSum = 0
  let maxSum = 0
  for (const [spiel, b] of Object.entries(tag || {})) {
    if (spiel === 'datum' || !b || typeof b !== 'object') continue
    plays += Number(b.plays || 0)
    scoreSum += Number(b.scoreSum || 0)
    maxSum += Number(b.maxSum || 0)
  }
  return { plays, avg10: maxSum > 0 ? (scoreSum / maxSum) * 10 : null }
}

async function loadHeuteSpiele() {
  const el = document.getElementById('wo-heute-spiele')
  if (!el) return
  try {
    // days=2 genügt: Die Zeitreihe enthält heute, sobald gespielt wurde.
    const res = await fetch('/admin/stats?days=2')
    const data = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(data)) throw new Error(`HTTP ${res.status}`)
    const { plays, avg10 } = zaehleSpieleAm(data, getTodayIso())
    const schnitt = avg10 == null ? '' : ` · Ø ${avg10.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} von 10`
    el.textContent = plays === 0 ? 'noch keine Spiele' : `${plays.toLocaleString('de-DE')} ${plays === 1 ? 'Spiel' : 'Spiele'}${schnitt}`
  } catch {
    el.textContent = 'Spielzahlen nicht verfügbar'
  }
}

// Die nächsten `anzahl` Tage ab `vonIso` mit Eintrag und Stand.
function planungsTage(vonIso = getTodayIso(), anzahl = LUECKEN_TAGE) {
  return Array.from({ length: anzahl }, (_, i) => {
    const datum = addTageIso(vonIso, i)
    const entry = kalenderData?.[datum] || null
    return { datum, entry, stand: tagesStand(entry) }
  })
}

function renderLuecken() {
  const host = document.getElementById('wo-luecken')
  if (!host) return
  if (kalenderStatus !== 'ok') {
    host.innerHTML = ''
    return
  }
  const heute = getTodayIso()
  const luecken = planungsTage(heute).filter((t) => t.stand.zustand !== 'vollstaendig')
  if (!luecken.length) {
    host.innerHTML = '<div class="wo-leer"><p class="wo-leer-titel">Keine Lücken</p>'
      + '<p class="wo-leer-text">Die nächsten vier Wochen sind vollständig geplant.</p>'
      + '<p class="wo-leer-ornament" aria-hidden="true">· · ·</p></div>'
    return
  }
  const zeilen = luecken.slice(0, LUECKEN_MAX).map(({ datum, entry, stand }) => {
    const vorschlag = !entry && hatOffenenVorschlag(datum)
    const was = vorschlag ? 'Vorschlag liegt vor' : fehltText(stand)
    const go = vorschlag ? 'ansehen' : entry ? 'ergänzen' : 'anlegen'
    const href = vorschlag ? '#vorschlaege' : `#planen/tag/${datum}`
    const istHeute = datum === heute
    // Wochentag-Kürzel für Screenreader ausschreiben; das Datum bleibt lesbar (WCAG 2.5.3)
    const t = datumTeile(datum)
    const datumHtml = `<span class="adm-visually-hidden">${WOCHENTAGE_LANG[t.wt]}, </span><span aria-hidden="true">${DAYS_DE[t.wt]} </span>${String(t.d).padStart(2, '0')}.${String(t.m).padStart(2, '0')}.`
    return `<li><a class="wo-luecke${istHeute ? ' is-heute' : ''}" href="${esc(href)}" data-datum="${esc(datum)}">`
      + `<span class="wo-luecke-datum">${datumHtml}</span>`
      + `<span class="wo-luecke-haupt">${entry?.thema ? `<span class="wo-luecke-thema">${esc(entry.thema)}</span>` : ''}`
      + `<span class="wo-luecke-was">${istHeute ? 'heute · ' : ''}${esc(was)}</span></span>`
      + `<span class="wo-luecke-go">${go} <span aria-hidden="true">→</span></span></a></li>`
  }).join('')
  const rest = luecken.length - LUECKEN_MAX
  const bis = addTageIso(heute, LUECKEN_TAGE - 1)
  const mehr = rest > 0
    ? `<p class="wo-luecken-mehr">und ${rest} weitere bis ${esc(formatIsoDate(bis).slice(0, 6))} <a class="adm-link" href="#planen/monat">im Monat ansehen</a></p>`
    : ''
  // Fokus über das Neuzeichnen retten (auch beim Eintreffen der Vorschläge): gleiche Zeile
  // (per Datum, href ist bei Vorschlägen gleich), sonst die erste.
  const aktiv = host.contains(document.activeElement) ? document.activeElement : null
  const fokusDatum = aktiv?.closest('.wo-luecke')?.dataset.datum || ''
  const fokusMehr = !!aktiv?.closest('.wo-luecken-mehr')
  host.innerHTML = `<ul class="wo-luecken">${zeilen}</ul>${mehr}`
  if (fokusMehr) host.querySelector('.wo-luecken-mehr a')?.focus({ preventScroll: true })
  else if (fokusDatum) {
    const ziel = host.querySelector(`.wo-luecke[data-datum="${CSS.escape(fokusDatum)}"]`) || host.querySelector('.wo-luecke')
    ziel?.focus({ preventScroll: true })
  }
}

function renderStand() {
  const host = document.getElementById('wo-stand')
  if (!host) return
  if (kalenderStatus !== 'ok') {
    host.innerHTML = ''
    return
  }
  const heute = getTodayIso()
  const zahl = { vollstaendig: 0, teilweise: 0, leer: 0 }
  planungsTage(heute).forEach((t) => { zahl[t.stand.zustand] += 1 })
  let bis = null
  for (let d = heute; istVollstaendig(kalenderData?.[d]); d = addTageIso(d, 1)) bis = d
  const letzter = Object.keys(kalenderData || {}).filter(isValidIsoDay).sort().pop()
  const zeile = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`
  host.innerHTML = [
    zeile('Vollständig geplant bis', bis ? esc(datumKurz(bis)) : 'heute nicht vollständig'),
    zeile('Letzter geplanter Tag', letzter ? esc(datumKurz(letzter)) : '—'),
    zeile(`Nächste ${LUECKEN_TAGE} Tage`, `${zahl.vollstaendig} vollständig · ${zahl.teilweise} unvollständig · ${zahl.leer} frei`),
    zeile('Geladen', kalenderGeladenUm ? `${kalenderGeladenUm.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : '—'),
  ].join('')
}

async function loadAuditLog() {
  const tbody = document.getElementById('audit-table-body')
  const limit = document.getElementById('audit-limit')?.value || '100'
  const action = document.getElementById('audit-action')?.value || ''
  const resource = document.getElementById('audit-resource')?.value || ''
  const status = document.getElementById('audit-status')?.value || ''
  const from = document.getElementById('audit-from')?.value || ''
  const to = document.getElementById('audit-to')?.value || ''
  const q = (document.getElementById('audit-search')?.value || '').trim()
  const countEl = document.getElementById('audit-count')
  if (!tbody) return

  tbody.innerHTML = tableMessageRow(5, 'users-empty', 'Audit-Log wird geladen …')

  try {
    const params = new URLSearchParams({ limit })
    if (action) params.set('action', action)
    if (resource) params.set('resource', resource)
    if (status) params.set('status', status)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (q) params.set('q', q)

    const response = await fetch(`/admin/audit-log?${params.toString()}`, {})
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const entries = Array.isArray(data.entries) ? data.entries : []
    currentAuditEntries = entries
    if (countEl) {
      const totalMatches = Number(data.totalMatches || entries.length || 0)
      countEl.textContent = `${entries.length} Einträge angezeigt${totalMatches !== entries.length ? ` (insgesamt ${totalMatches} Treffer)` : ''}`
    }
    if (!entries.length) {
      tbody.innerHTML = tableMessageRow(5, 'users-empty', 'Noch keine Audit-Einträge vorhanden.')
      return
    }

    tbody.innerHTML = entries.map((entry, index) => {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('de-DE') : '—'
      const action = entry.action || '—'
      const resource = entry.resourceId ? `${entry.resource || '—'}:${entry.resourceId}` : (entry.resource || '—')
      const status = entry.status || '—'
      const changes = summarizeAuditChanges(entry.changes)
      return `<tr role="row">
        <td role="cell" data-label="Zeit">${esc(time)}</td>
        <td role="cell" data-label="Aktion">${esc(action)}</td>
        <td role="cell" data-label="Ressource">${esc(resource)}</td>
        <td role="cell" data-label="Status">${esc(status)}</td>
        <td role="cell" data-label="Änderungen" class="cell-stack"><button class="entry-action-btn" data-action="show-audit-entry-details" data-index="${index}">${esc(changes)}</button></td>
      </tr>`
    }).join('')
    showAuditEntryDetails(entries[0])
  } catch (err) {
    if (countEl) countEl.textContent = 'Audit-Log konnte nicht geladen werden.'
    tbody.innerHTML = tableMessageRow(5, 'users-empty', `Audit-Log konnte nicht geladen werden: ${esc(err.message)}`)
  }
}

function resetAuditFilters() {
  const action = document.getElementById('audit-action')
  const resource = document.getElementById('audit-resource')
  const status = document.getElementById('audit-status')
  const from = document.getElementById('audit-from')
  const to = document.getElementById('audit-to')
  const search = document.getElementById('audit-search')

  if (action) action.value = ''
  if (resource) resource.value = ''
  if (status) status.value = ''
  if (from) from.value = ''
  if (to) to.value = ''
  if (search) search.value = ''

  loadAuditLog()
}




// ── Kollokation – Wortanalyse ─────────────────────────────
async function analyzeKollokation() {
  const lemma = document.getElementById('koll-input').value.trim()
  const out   = document.getElementById('koll-output')
  if (!lemma) return
  out.innerHTML = '<div class="status loading">Analysiere …</div>'
  try {
    const res  = await fetch(`/admin/analyze-kollokation?q=${encodeURIComponent(lemma)}`, {})
    const data = await res.json()
    if (!res.ok) { out.innerHTML = `<div class="status error">Fehler: ${esc(data.error)}</div>`; return }
    renderKollAnalyse(data, out)
  } catch (e) { out.innerHTML = `<div class="status error">Netzwerkfehler: ${esc(e.message)}</div>` }
}

// ── Tagesseite: Prüfen der vier Modi ──────────────────────
const zahlDe = (n) => Number.isFinite(Number(n))
  ? Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  : '–'
const ergebnisMeldung = (text, tone = '') => `<p class="tag-erg-meldung"${tone ? ` data-tone="${tone}"` : ''}>${esc(text)}</p>`
// Schreibt ein Prüfergebnis und sagt nur die Kurzmeldung (erste .tag-erg-meldung) in der
// zugehörigen Live-Zeile an – nicht die ganze Liste. out.id: „entry-<modus>-analysis-output“.
function sageErgebnisAn(out, text) {
  const live = document.getElementById(out.id.replace('-analysis-output', '-live'))
  if (!live) return
  // Erst leeren, damit auch derselbe Text (z. B. zweimal „Prüft im Korpus …“) erneut angesagt wird.
  live.textContent = ''
  if (text) window.setTimeout(() => { live.textContent = text }, 50)
}

function schreibeErgebnis(out, html) {
  out.innerHTML = html
  sageErgebnisAn(out, out.querySelector('.tag-erg-meldung')?.textContent || '')
}

const zeileMitZahl = (wort, zahl, vorzeichen = '') => `<li><span>${esc(wort)}</span><span class="tag-erg-zahl">${vorzeichen}${zahlDe(zahl)}</span></li>`

// Prüfen sperren, solange die Korpusabfrage läuft (schwer; verhindert Doppelklicks).
async function mitPruefSperre(btn, fn) {
  if (btn?.getAttribute('aria-disabled') === 'true') return
  const label = btn?.querySelector('span')?.firstChild   // Textknoten „Prüfen“
  const alt = label?.textContent
  btn?.setAttribute('aria-disabled', 'true')
  btn?.classList.add('is-busy')
  if (label) label.textContent = 'prüft …'
  try {
    await fn()
  } finally {
    btn?.removeAttribute('aria-disabled')
    btn?.classList.remove('is-busy')
    if (label) label.textContent = alt
  }
}

// Holt eine Prüfantwort; Fehlerantworten werden zu Ausnahmen mit lesbarem Text.
async function holePruefung(url) {
  const res = await fetch(url, {})
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function analyzeEntryKollokation() {
  const out = document.getElementById('entry-koll-analysis-output')
  if (!out) return
  out.classList.remove('is-veraltet')
  // Mit der gewählten Wortart: sonst rechnet der Server alle drei und das Ergebnis
  // könnte für eine andere Wortart gelten als die gespeicherte.
  const woerter = [1, 2, 3]
    .map((n) => ({ lemma: normalizeText(document.getElementById(`w${n}`)?.value || ''), pos: document.getElementById(`p${n}`)?.value || 'Substantiv' }))
    .filter((w) => w.lemma)

  if (!woerter.length) {
    schreibeErgebnis(out, ergebnisMeldung('Erst mindestens ein Wort eintragen.'))
    return
  }

  schreibeErgebnis(out, ergebnisMeldung('Prüft im Korpus …', 'loading'))
  // allSettled: Scheitert ein Wort, bleiben die Ergebnisse der anderen sichtbar.
  const antworten = await Promise.allSettled(woerter.map(({ lemma, pos }) =>
    holePruefung(`/admin/analyze-kollokation?q=${encodeURIComponent(lemma)}&pos=${encodeURIComponent(pos)}`)))

  const geeignet = antworten.filter((a) => a.status === 'fulfilled' && a.value.usable).length
  // Ein gescheiterter Abruf ist „nicht geprüft“, nicht „nicht geeignet“.
  const nichtGeprueft = antworten.filter((a) => a.status === 'rejected').length
  const alle = geeignet === woerter.length
  const kopf = alle
    ? (woerter.length === 3 ? 'Alle drei geeignet.' : woerter.length === 2 ? 'Beide geeignet.' : 'Geeignet.')
    : `${geeignet} von ${woerter.length} geeignet${nichtGeprueft ? ` · ${nichtGeprueft} nicht geprüft` : ''}.`

  const zeilen = woerter.map(({ lemma }, i) => {
    const antwort = antworten[i]
    if (antwort.status === 'rejected') {
      return `<li class="tag-erg-zeile"><span class="tag-erg-wort">${esc(lemma)}</span><span class="tag-erg-urteil" data-tone="error">${esc(`Fehler: ${antwort.reason?.message || 'unbekannt'}`)}</span></li>`
    }
    const data = antwort.value
    const werte = (Array.isArray(data.kollokatoren) ? data.kollokatoren : []).slice(0, 5)
      .map((k) => `${esc(k.wort)} <span class="tag-erg-zahl">${zahlDe(k.logDice)}</span>`).join(' · ')
    const urteil = data.usable
      ? '<span class="tag-erg-urteil" data-tone="ok">geeignet</span>'
      : '<span class="tag-erg-urteil" data-tone="warn">zu wenige Kollokatoren</span>'
    return `<li class="tag-erg-zeile"><span class="tag-erg-wort">${esc(lemma)}</span>${werte ? `<span class="tag-erg-werte">${werte}</span>` : ''}${urteil}</li>`
  }).join('')

  schreibeErgebnis(out, ergebnisMeldung(kopf, alle ? 'ok' : 'warn')
    + `<ul class="tag-erg-liste">${zeilen}</ul>`
    + '<p class="tag-erg-fuss">Je Wort die fünf stärksten Kollokatoren im eigenen Korpus; Zahl = logDice (Assoziationsmaß).</p>')
}

// Vorschau eines der drei Kollokationen-Wörter (Nr. 1–3) als Wörterbuch-Eintrag.
// Die frühere Tages-Vorschau entfällt: Planen › Woche zeigt dieselben Modi und Wörter.
async function previewCurrentLemma(index = 1) {
  const out = document.getElementById('entry-preview-output')
  const n = [1, 2, 3].includes(index) ? index : 1
  const lemma = normalizeText(document.getElementById(`w${n}`)?.value || '')
  const pos = document.getElementById(`p${n}`)?.value || 'Substantiv'
  if (!out) return

  if (!lemma) {
    out.innerHTML = ergebnisMeldung(`Erst Wort ${n} eintragen.`)
    return
  }

  out.innerHTML = ergebnisMeldung('Vorschau wird geladen …', 'loading')
  try {
    const response = await fetch('/admin/preview/lemma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lemma, pos }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const bedeutungen = Array.isArray(data.definitionen) && data.definitionen.length
      ? `<ol>${data.definitionen.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>`
      : 'Keine Bedeutungen vorhanden.'
    const runden = Array.isArray(data.rundenSummary) && data.rundenSummary.length
      ? data.rundenSummary.map((round) => `${esc(round.label || round.key)} ${esc(String(round.count || 0))}`).join(' · ')
      : 'Keine Rundendaten verfügbar.'
    const bonus = data.bonusFrage
      ? `${data.bonusFrage.label ? `${esc(data.bonusFrage.label)}: ` : ''}${esc(data.bonusFrage.question || '—')}`
      : 'Keine Bonusfrage vorhanden.'

    out.innerHTML = `<div class="tag-vorschau-eintrag">
      <p class="tag-vorschau-kopf"><span class="tag-vorschau-wort">${esc(data.lemma || lemma)}</span>${data.ipa ? ` <span class="tag-vorschau-ipa">${esc(data.ipa)}</span>` : ''} <span class="vorschlag-pos">${esc(data.pos || pos)}</span></p>
      <dl class="tag-dl">
        <div><dt>Bedeutungen</dt><dd>${bedeutungen}</dd></div>
        <div><dt>Runden</dt><dd>${runden}</dd></div>
        <div><dt>Bonusfrage</dt><dd>${bonus}</dd></div>
      </dl>
    </div>`
  } catch (err) {
    out.innerHTML = ergebnisMeldung(`Vorschau fehlgeschlagen: ${err.message}`, 'error')
  }
}

function renderKollAnalyse(data, out) {
  const badge = data.usable
    ? '<span style="color:#166534;font-weight:700">✓ Geeignet als Kollokationswort</span>'
    : '<span style="color:#991b1b;font-weight:700">✗ Nicht geeignet (zu wenig Kollokatoren)</span>'

  let html = `<div style="margin:12px 0 16px">${badge}</div>`

  // Kollokationen – sortierte Gesamtliste (alle Relationen zusammengeführt)
  if (data.kollokatoren?.length) {
    html += `<div style="margin-bottom:16px">`
    html += `<strong style="font-size:0.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Top ${data.kollokatoren.length} Kollokationen</strong>`
    html += `<ol style="padding-left:20px;margin-top:8px;display:flex;flex-direction:column;gap:4px;font-size:0.88rem">`
    for (const it of data.kollokatoren) {
      html += `<li>${esc(it.wort)} <span style="color:var(--muted);font-size:0.8em">logDice ${it.logDice}</span></li>`
    }
    html += `</ol></div>`
  } else {
    html += `<div style="margin-bottom:16px;color:var(--muted);font-size:0.85rem">Keine Kollokationen ermittelt.</div>`
  }

  // Bonusfrage
  if (data.bonus) {
    html += `<div style="margin-bottom:14px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:0.82rem">`
    html += `<strong>Bonusfrage (${esc(data.bonus.label)}):</strong> ${esc(data.bonus.question)}<br>`
    html += `<span style="color:var(--muted)">Antwort: <strong>${esc(data.bonus.correct)}</strong> · Optionen: ${data.bonus.options.map(o => esc(o)).join(', ')}</span></div>`
  }

  out.innerHTML = html
}

// ── Statistik ─────────────────────────────────────────────
let statsChartTrend = null
let statsChartDist  = null

const STAT_KEYS   = ['kollokationen', 'wortzwilling', 'zeitenwende']
const STAT_LABELS = { kollokationen: 'Kollokationen', wortzwilling: 'Wort-Zwilling', zeitenwende: 'Zeitenwende' }
const STAT_COLORS = { kollokationen: '#9b1c1c', wortzwilling: '#15803d', zeitenwende: '#7c3aed' }

async function loadStats() {
  const out = document.getElementById('stats-output')
  const days = document.getElementById('stats-days')?.value || '30'
  out.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Lade…</div>'
  try {
    const r    = await fetch(`/admin/stats?days=${encodeURIComponent(days)}`, {})
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    renderStats(data, out)
  } catch (e) {
    out.innerHTML = `<div class="status error">Fehler: ${esc(e.message)}</div>`
  } finally {
    await loadStatsSummary(days)
  }
}

function renderUserRow(user) {
  const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-DE') : '—'
  const isSelected = user.id === selectedUserId
  const safeUserId = encodeURIComponent(String(user.id || ''))
  const safeRawUserId = esc(String(user.id || ''))
  return `<tr role="row">
    <td role="cell" class="users-select-col" data-label="Auswahl"><label class="cb-hit"><input type="checkbox" class="user-select-checkbox" data-user-id="${safeRawUserId}" aria-label="${esc(user.email || user.name || 'Nutzer')} auswählen"></label></td>
    <td role="cell" data-label="Name">${esc(user.name || '—')}</td>
    <td role="cell" data-label="E-Mail">${esc(user.email || '—')}</td>
    <td role="cell" data-label="Rolle">${esc(roleLabel(user.role || 'user'))}</td>
    <td role="cell" data-label="Registriert">${esc(created)}</td>
    <td role="cell" data-label="Aktion"><button class="entry-action-btn" data-action="select-user" data-user-id="${safeUserId}">${isSelected ? 'Ausgewählt' : 'Details'}</button></td>
  </tr>`
}

/** Zeigt/versteckt „Weitere laden" und schreibt den Ladefortschritt daneben. */
function updateUsersPagingState({ loaded = 0, filtered = 0, hasMore = false, busy = false } = {}) {
  const wrap = document.getElementById('users-paging')
  const btn = document.getElementById('users-load-more-btn')
  const info = document.getElementById('users-paging-info')
  if (!wrap || !btn || !info) return

  wrap.classList.toggle('is-hidden', !hasMore && loaded >= filtered)
  btn.classList.toggle('is-hidden', !hasMore)
  btn.disabled = busy
  btn.textContent = busy ? 'Lade …' : 'Weitere laden'
  info.textContent = filtered ? `${loaded} von ${filtered} angezeigt` : ''
}

async function loadUsersOverview({ append = false } = {}) {
  const summary = document.getElementById('users-summary')
  const tbody = document.getElementById('users-table-body')
  if (!summary || !tbody) return

  if (usersOverviewAbortController) {
    usersOverviewAbortController.abort()
  }
  usersOverviewAbortController = new AbortController()

  const search = (document.getElementById('users-search')?.value || '').trim()
  const role = document.getElementById('users-role-filter')?.value || ''

  // Jeder Filterwechsel beginnt wieder bei Seite 1 – nur „Weitere laden" hängt an.
  if (!append) usersOffset = 0

  const params = new URLSearchParams({ limit: String(USERS_PAGE_SIZE), offset: String(usersOffset) })
  if (search) params.set('q', search)
  if (role) params.set('role', role)

  if (append) {
    updateUsersPagingState({ loaded: usersOffset, filtered: usersOffset, hasMore: true, busy: true })
  } else {
    summary.textContent = 'Nutzerdaten werden geladen …'
    tbody.innerHTML = tableMessageRow(6, 'users-empty', 'Lade …')
    updateUsersPagingState()
  }

  try {
    const response = await fetch(`/admin/users?${params.toString()}`, { signal: usersOverviewAbortController.signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const info = data.summary || {}
    summary.textContent = `Gesamt: ${info.total || 0} · User: ${info.users || 0} · Premium: ${info.premium || 0} · Neu 30 Tage: ${info.newLast30Days || 0}`

    const page = data.page || {}
    const users = Array.isArray(data.users) ? data.users : []
    usersOffset += users.length

    if (!users.length && !append) {
      tbody.innerHTML = tableMessageRow(6, 'users-empty', 'Keine Nutzer gefunden.')
      clearSelectedUser('Keine Nutzer ausgewählt.')
      updateUsersPagingState()
    } else {
      const rowsHtml = users.map(renderUserRow).join('')
      if (append) tbody.insertAdjacentHTML('beforeend', rowsHtml)
      else tbody.innerHTML = rowsHtml

      updateUsersPagingState({
        loaded: usersOffset,
        filtered: Number(page.filtered || usersOffset),
        hasMore: !!page.hasMore,
      })
      updateUsersBulkState()

      if (selectedUserId && users.some((user) => user.id === selectedUserId)) {
        await selectUser(selectedUserId, { keepScroll: true })
      } else if (!append) {
        clearSelectedUser('Wähle einen Nutzer aus der Tabelle, um Details zu sehen.')
      }
    }

    usersLoaded = true
  } catch (err) {
    if (err.name === 'AbortError') return
    summary.textContent = `Nutzer konnten nicht geladen werden: ${err.message}`
    if (!append) {
      tbody.innerHTML = tableMessageRow(6, 'users-empty', 'Fehler beim Laden.')
      clearSelectedUser('Nutzerdetails konnten nicht geladen werden.')
    }
    updateUsersPagingState({ loaded: usersOffset, filtered: usersOffset, hasMore: !!append })
    updateUsersBulkState()
  } finally {
    usersOverviewAbortController = null
    const roleBtn = document.getElementById('user-role-save-btn')
    if (roleBtn) roleBtn.disabled = !selectedUserId
  }
}

function loadMoreUsers() {
  loadUsersOverview({ append: true })
}

function scheduleUsersOverviewLoad() {
  if (usersSearchTimer) {
    window.clearTimeout(usersSearchTimer)
  }
  usersSearchTimer = window.setTimeout(() => {
    loadUsersOverview()
  }, 250)
}

function resetUsersFilters() {
  const searchInput = document.getElementById('users-search')
  const roleFilter = document.getElementById('users-role-filter')
  if (searchInput) searchInput.value = ''
  if (roleFilter) roleFilter.value = ''
  loadUsersOverview()
}

function clearSelectedUser(message) {
  selectedUserId = ''
  const empty = document.getElementById('user-detail-empty')
  const content = document.getElementById('user-detail-content')
  const roleBtn = document.getElementById('user-role-save-btn')
  const roleSelect = document.getElementById('user-detail-role')
  const userDeleteBtn = document.getElementById('user-delete-btn')
  if (empty) {
    empty.textContent = message
    empty.style.display = 'block'
  }
  if (content) content.style.display = 'none'
  if (roleBtn) roleBtn.disabled = true
  if (roleSelect) roleSelect.value = 'user'
  if (userDeleteBtn) userDeleteBtn.disabled = true
}

function renderUserStatsByGame(byGame) {
  const target = document.getElementById('user-game-stats')
  if (!target) return

  if (!Array.isArray(byGame) || byGame.length === 0) {
    target.innerHTML = '<div class="users-empty">Noch keine spielbezogenen Daten vorhanden.</div>'
    return
  }

  target.innerHTML = byGame.map((gameRow) => {
    const avg = Number(gameRow.maxSum || 0) > 0
      ? ((Number(gameRow.scoreSum || 0) / Number(gameRow.maxSum || 0)) * 10).toFixed(1)
      : '–'
    const label = STAT_LABELS[gameRow.spiel] || gameRow.spiel
    return `<div class="user-stat-chip"><strong>${esc(label)}</strong><span>${esc(String(gameRow.plays || 0))} Plays · Ø ${esc(avg)} / 10</span></div>`
  }).join('')
}

function renderUserRecentStats(recent) {
  const tbody = document.getElementById('user-recent-body')
  if (!tbody) return

  if (!Array.isArray(recent) || recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="users-empty">Noch keine Aktivität.</td></tr>'
    return
  }

  tbody.innerHTML = recent.map((row) => {
    const avg = Number(row.maxSum || 0) > 0
      ? ((Number(row.scoreSum || 0) / Number(row.maxSum || 0)) * 10).toFixed(1)
      : '–'
    const label = STAT_LABELS[row.spiel] || row.spiel
    return `<tr>
      <td>${esc(row.datum)}</td>
      <td>${esc(label)}</td>
      <td>${esc(String(row.plays || 0))}</td>
      <td>Ø ${esc(avg)} / 10</td>
    </tr>`
  }).join('')
}

function renderUserDetails(data) {
  const empty = document.getElementById('user-detail-empty')
  const content = document.getElementById('user-detail-content')
  const title = document.getElementById('user-detail-title')
  const subtitle = document.getElementById('user-detail-subtitle')
  const roleSelect = document.getElementById('user-detail-role')
  const userDeleteBtn = document.getElementById('user-delete-btn')

  if (!empty || !content || !title || !subtitle || !roleSelect || !userDeleteBtn) return

  const user = data?.user || {}
  const stats = data?.stats || {}

  selectedUserId = user.id || ''
  title.textContent = user.name || 'Unbenannter Nutzer'
  subtitle.textContent = user.email || 'Keine E-Mail'
  roleSelect.value = user.role || 'user'
  roleSelect.dataset.currentRole = user.role || 'user'
  userDeleteBtn.disabled = !selectedUserId
  const roleBtn = document.getElementById('user-role-save-btn')
  if (roleBtn) roleBtn.disabled = !selectedUserId

  const meta = document.getElementById('user-meta-grid')
  if (meta) {
    meta.innerHTML = [
      `<div class="user-meta-item"><span>ID</span><strong>${esc(user.id || '—')}</strong></div>`,
      `<div class="user-meta-item"><span>Rolle</span><strong>${esc(roleLabel(user.role || 'user'))}</strong></div>`,
      `<div class="user-meta-item"><span>E-Mail verifiziert</span><strong>${user.emailVerified ? 'Ja' : 'Nein'}</strong></div>`,
      `<div class="user-meta-item"><span>Registriert</span><strong>${esc(user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-DE') : '—')}</strong></div>`,
      `<div class="user-meta-item"><span>Plays gesamt</span><strong>${esc(String(stats.totals?.plays || 0))}</strong></div>`,
      `<div class="user-meta-item"><span>Ø Score</span><strong>${Number(stats.totals?.maxSum || 0) > 0 ? `${((Number(stats.totals?.scoreSum || 0) / Number(stats.totals?.maxSum || 0)) * 10).toFixed(1)} / 10` : '—'}</strong></div>`,
    ].join('')
  }

  renderUserStatsByGame(stats.byGame || [])
  renderUserRecentStats(stats.recent || [])

  empty.style.display = 'none'
  content.style.display = 'grid'
}

async function selectUser(userId, options = {}) {
  let normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return
  try {
    normalizedUserId = decodeURIComponent(normalizedUserId)
  } catch {
    // Falls der Wert nicht URL-encodiert ist, unveraendert nutzen.
  }
  if (!normalizedUserId) return

  const { keepScroll = false } = options
  const empty = document.getElementById('user-detail-empty')
  const content = document.getElementById('user-detail-content')
  if (empty) {
    empty.textContent = 'Nutzerdetails werden geladen …'
    empty.style.display = 'block'
  }
  if (content) content.style.display = 'none'

  try {
    const response = await fetch(`/admin/users/${encodeURIComponent(normalizedUserId)}`, {})
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    renderUserDetails(data)
    if (!keepScroll) {
      const detailCard = document.getElementById('users-detail-card')
      if (detailCard) detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  } catch (err) {
    clearSelectedUser(`Details konnten nicht geladen werden: ${err.message}`)
  }
}

async function saveSelectedUserRole() {
  if (!selectedUserId) return

  const roleSelect = document.getElementById('user-detail-role')
  const roleBtn = document.getElementById('user-role-save-btn')
  if (!roleSelect || !roleBtn) return

  roleBtn.disabled = true
  const roleSelectInitial = roleSelect.dataset.currentRole || roleSelect.value
  const nextRole = roleSelect.value
  try {
    const response = await fetch(`/admin/users/${encodeURIComponent(selectedUserId)}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    await loadUsersOverview()
    await selectUser(selectedUserId, { keepScroll: true })
  } catch (err) {
    roleSelect.value = roleSelectInitial
    const empty = document.getElementById('user-detail-empty')
    if (empty) {
      empty.textContent = `Rollenänderung fehlgeschlagen: ${err.message}`
      empty.style.display = 'block'
    }
  } finally {
    roleBtn.disabled = !selectedUserId
    if (!selectedUserId) roleSelect.value = roleSelectInitial
  }
}

async function deleteSelectedUser() {
  if (!selectedUserId) return

  const ok = window.confirm('Nutzer wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')
  if (!ok) return

  const deleteBtn = document.getElementById('user-delete-btn')
  if (deleteBtn) deleteBtn.disabled = true

  try {
    const response = await fetch(`/admin/users/${encodeURIComponent(selectedUserId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    clearSelectedUser('Nutzer gelöscht. Wähle einen weiteren Nutzer aus der Tabelle.')
    await loadUsersOverview()
  } catch (err) {
    const empty = document.getElementById('user-detail-empty')
    if (empty) {
      empty.textContent = `Löschen fehlgeschlagen: ${err.message}`
      empty.style.display = 'block'
    }
  } finally {
    if (deleteBtn) deleteBtn.disabled = !selectedUserId
  }
}

function renderStatsSummary(summary) {
  const cards = document.getElementById('stats-summary-cards')
  if (!cards) return

  if (!summary) {
    cards.innerHTML = '<div class="users-empty">Keine Zusammenfassung verfügbar.</div>'
    return
  }

  const avg = summary.totals?.avg10 == null ? '–' : `${Number(summary.totals.avg10).toFixed(2)} / 10`
  cards.innerHTML = [
    `<article class="stats-summary-card"><span>Zeitraum</span><strong>${esc(String(summary.window?.days || 0))} Tage</strong><small>${esc(summary.window?.from || '—')} bis ${esc(summary.window?.to || '—')}</small></article>`,
    `<article class="stats-summary-card"><span>Plays gesamt</span><strong>${esc(String(summary.totals?.plays || 0))}</strong><small>Über alle Modi</small></article>`,
    `<article class="stats-summary-card"><span>Ø Score</span><strong>${esc(avg)}</strong><small>Aggregiert</small></article>`,
    `<article class="stats-summary-card"><span>Top Modus</span><strong>${esc(summary.byGame?.[0] ? (STAT_LABELS[summary.byGame[0].spiel] || summary.byGame[0].spiel) : '—')}</strong><small>${esc(String(summary.byGame?.[0]?.plays || 0))} Plays</small></article>`,
  ].join('')
}

function renderTopUsers(topUsers) {
  const tbody = document.getElementById('stats-top-users-body')
  if (!tbody) return

  if (!Array.isArray(topUsers) || !topUsers.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="users-empty">Keine identifizierten Nutzerstatistiken im Zeitraum.</td></tr>'
    return
  }

  tbody.innerHTML = topUsers.map((user) => {
    const avg = user.avg10 == null ? '–' : `${Number(user.avg10).toFixed(2)} / 10`
    return `<tr>
      <td>${esc(user.name || user.email || user.userId)}</td>
      <td>${esc(roleLabel(user.role || 'user'))}</td>
      <td>${esc(String(user.plays || 0))}</td>
      <td>${esc(avg)}</td>
    </tr>`
  }).join('')
}

function renderPerformance(metrics) {
  const cards = document.getElementById('performance-cards')
  const json = document.getElementById('performance-json')
  if (!cards || !json) return

  if (!metrics) {
    cards.innerHTML = '<div class="users-empty">Keine Performance-Daten verfügbar.</div>'
    json.textContent = 'Keine Performance-Daten verfügbar.'
    return
  }

  const dbMb = ((Number(metrics.db?.sizeBytes || 0)) / 1024 / 1024).toFixed(2)
  const walMb = ((Number(metrics.db?.walBytes || 0)) / 1024 / 1024).toFixed(2)
  const queryHitRate = metrics.cache?.query?.hitRate || '0%'
  const belegeHitRate = metrics.cache?.belege?.hitRate || '0%'

  cards.innerHTML = [
    `<article class="performance-card"><span>Server</span><strong>${esc(String(metrics.rssMb || 0))} MB RAM</strong><small>Uptime ${esc(String(metrics.uptimeSec || 0))}s</small></article>`,
    `<article class="performance-card"><span>Datenbank</span><strong>${esc(dbMb)} MB</strong><small>WAL ${esc(walMb)} MB</small></article>`,
    `<article class="performance-card"><span>Stats</span><strong>${esc(String(metrics.rows?.statsRows || 0))} Zeilen</strong><small>${esc(String(metrics.rows?.totalPlays || 0))} Plays total</small></article>`,
    `<article class="performance-card"><span>Cache Query</span><strong>${esc(queryHitRate)}</strong><small>${esc(String(metrics.cache?.query?.size || 0))} Keys</small></article>`,
    `<article class="performance-card"><span>Cache Belege</span><strong>${esc(belegeHitRate)}</strong><small>${esc(String(metrics.cache?.belege?.size || 0))} Keys</small></article>`,
    `<article class="performance-card"><span>Entitäten</span><strong>${esc(String(metrics.entities?.users || 0))} Nutzer</strong><small>${esc(String(metrics.entities?.classroomSessions || 0))} Klassen-Sessions</small></article>`,
  ].join('')

  json.textContent = JSON.stringify(metrics, null, 2)
}

async function loadPerformance() {
  const cards = document.getElementById('performance-cards')
  if (cards) cards.innerHTML = '<div class="users-empty">Performance-Daten werden geladen …</div>'

  try {
    const response = await fetch('/admin/performance', {})
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    renderPerformance(data)
  } catch (err) {
    renderPerformance(null)
    const json = document.getElementById('performance-json')
    if (json) json.textContent = `Performance konnte nicht geladen werden: ${err.message}`
  }
}

// ── Kurs-PDFs neu generieren (Hintergrund-Job + Polling) ──────────────
let coursePdfPollTimer = null

function renderCoursePdfStatus(data) {
  const el = document.getElementById('course-pdf-status')
  if (!el) return
  if (!data) { el.textContent = 'Status nicht verfügbar.'; return }
  const st = data.station === 'all' ? 'alle Stationen' : `Station ${data.station}`
  const lines = []
  if (data.running) lines.push(`⏳ Läuft … (${st})`)
  else if (data.ok === true) lines.push(`✓ Fertig: ${data.count} PDF(s) für ${st} erzeugt und registriert.`)
  else if (data.ok === false) lines.push(`✗ Fehler: ${data.error || 'unbekannt'}`)
  else lines.push('Noch nicht gestartet.')
  if (data.startedAt) lines.push(`Start: ${new Date(data.startedAt).toLocaleString('de-DE')}`)
  if (data.finishedAt) lines.push(`Ende:  ${new Date(data.finishedAt).toLocaleString('de-DE')}`)
  el.textContent = lines.join('\n')
}

async function loadCoursePdfStatus() {
  try {
    const r = await fetch('/admin/course/pdf-status', {})
    const data = await r.json()
    renderCoursePdfStatus(data)
    return data
  } catch (err) {
    renderCoursePdfStatus(null)
    return null
  }
}

function stopCoursePdfPolling() {
  if (coursePdfPollTimer) { clearInterval(coursePdfPollTimer); coursePdfPollTimer = null }
}

function startCoursePdfPolling() {
  stopCoursePdfPolling()
  coursePdfPollTimer = setInterval(async () => {
    const data = await loadCoursePdfStatus()
    if (!data || !data.running) stopCoursePdfPolling()
  }, 3000)
}

async function regenerateCoursePdfs() {
  const station = document.getElementById('course-pdf-station')?.value || 'all'
  const el = document.getElementById('course-pdf-status')
  if (el) el.textContent = 'Starte …'
  try {
    const r = await fetch('/admin/course/regenerate-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station }),
    })
    const data = await r.json()
    if (!r.ok) {
      if (data.status) renderCoursePdfStatus(data.status)
      else if (el) el.textContent = `✗ ${data.error || `HTTP ${r.status}`}`
      return
    }
    renderCoursePdfStatus(data.status)
    startCoursePdfPolling()
  } catch (err) {
    if (el) el.textContent = `✗ Netzwerkfehler: ${err.message}`
  }
}

async function loadStatsSummary(daysOverride) {
  const days = String(daysOverride ?? (document.getElementById('stats-days')?.value || '30'))
  const topUsersBody = document.getElementById('stats-top-users-body')
  if (topUsersBody) {
    topUsersBody.innerHTML = '<tr><td colspan="4" class="users-empty">Lade Top-Nutzer …</td></tr>'
  }

  try {
    const response = await fetch(`/admin/stats/summary?days=${encodeURIComponent(days)}&topUsers=10`, {})
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    renderStatsSummary(data)
    renderTopUsers(data.topUsers || [])
  } catch (err) {
    renderStatsSummary(null)
    if (topUsersBody) {
      topUsersBody.innerHTML = `<tr><td colspan="4" class="users-empty">Fehler: ${esc(err.message)}</td></tr>`
    }
  }
}

function exportStats(format) {
  const days = document.getElementById('stats-days')?.value || '30'
  const url = `/admin/stats/export?days=${encodeURIComponent(days)}&format=${encodeURIComponent(format)}`
  window.open(url, '_blank', 'noopener')
}

// Chart.js (~70 KB gzip) lag als render-blockierendes <script> im <head> und
// verzögerte damit sogar den Login-Screen. Es wird jetzt erst beim ersten
// Öffnen der Statistiken nachgeladen.
let chartJsPromise = null

function ensureChartJs() {
  if (window.Chart) return Promise.resolve()
  if (chartJsPromise) return chartJsPromise

  chartJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/admin-assets/vendor/chart.umd.min.js'
    script.onload = () => resolve()
    script.onerror = () => {
      chartJsPromise = null
      reject(new Error('Chart.js konnte nicht geladen werden.'))
    }
    document.head.appendChild(script)
  })

  return chartJsPromise
}

function renderStats(data, out) {
  if (!data.length) {
    out.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Noch keine Statistik vorhanden.</div>'
    return
  }

  const todayStr   = getTodayIso()
  const todayEntry = data.find(d => d.datum === todayStr) || null
  const last7      = data.slice(-7)

  function fmtAvg(entry) {
    if (!entry || !entry.plays) return '–'
    return (entry.scoreSum / entry.maxSum * 10).toFixed(1)
  }

  let html = '<div class="stats-section-title" style="margin-top:0">Heute</div><div class="stats-tiles">'
  for (const key of STAT_KEYS) {
    const e = todayEntry?.[key]
    html += `<div class="stats-tile">
      <div class="stats-tile-title">${esc(STAT_LABELS[key])}</div>
      <div class="stats-tile-num">${e?.plays || 0}</div>
      <div class="stats-tile-sub">Ø ${fmtAvg(e)} / 10</div>
    </div>`
  }
  html += '</div>'
  html += '<div class="stats-section-title">Plays letzte 7 Tage</div>'
  html += '<div class="stats-chart-wrap" style="height:160px"><canvas id="stats-trend-canvas"></canvas></div>'
  html += '<div class="stats-section-title">Score-Verteilung heute (0–10)</div>'
  html += '<div class="stats-chart-wrap" style="height:130px" id="stats-dist-wrap"><canvas id="stats-dist-canvas"></canvas></div>'

  out.innerHTML = html

  // Diagramme nur zeichnen, wenn die Statistik-Seite wirklich sichtbar ist
  // (der Nutzer kann während des Ladens weitergewechselt sein) – Chart.js
  // kostet ~70 KB gzip und zwei Chart-Instanzen.
  if (!document.getElementById('page-stats')?.classList.contains('is-active')) return

  ensureChartJs()
    .then(() => renderStatsCharts(last7, todayEntry))
    .catch(() => {
      const wrap = document.getElementById('stats-dist-wrap')
      if (wrap) wrap.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:12px 0">Diagramme konnten nicht geladen werden.</div>'
    })
}

function renderStatsCharts(last7, todayEntry) {
  // Der Nutzer kann zwischen Laden und Zeichnen weitergewechselt haben.
  const trendCanvas = document.getElementById('stats-trend-canvas')
  if (!trendCanvas) return

  if (statsChartTrend) { statsChartTrend.destroy(); statsChartTrend = null }
  if (statsChartDist)  { statsChartDist.destroy();  statsChartDist  = null }

  const trendLabels = last7.map((d) => formatIsoDate(d.datum))
  statsChartTrend = new Chart(trendCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: STAT_KEYS.map(key => ({
        label: STAT_LABELS[key],
        data: last7.map(d => d[key]?.plays || 0),
        borderColor: STAT_COLORS[key],
        backgroundColor: STAT_COLORS[key] + '18',
        tension: 0.3,
        pointRadius: 4,
        fill: false,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 10 } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#e7e5e0' } },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } }
      },
      animation: { duration: 300 }
    }
  })

  if (todayEntry && STAT_KEYS.some(k => todayEntry[k]?.plays)) {
    statsChartDist = new Chart(document.getElementById('stats-dist-canvas').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['0','1','2','3','4','5','6','7','8','9','10'],
        datasets: STAT_KEYS.map(key => ({
          label: STAT_LABELS[key],
          data: todayEntry[key]?.dist || Array(11).fill(0),
          backgroundColor: STAT_COLORS[key] + 'aa',
          borderColor: STAT_COLORS[key],
          borderWidth: 1,
          borderRadius: 2,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 10 } } },
        scales: {
          x: { title: { display: true, text: 'Score', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#e7e5e0' } }
        },
        animation: { duration: 300 }
      }
    })
  } else {
    document.getElementById('stats-dist-wrap').innerHTML =
      '<div style="color:var(--muted);font-size:0.85rem;padding:12px 0">Noch keine Daten für heute.</div>'
  }
}

// ── Wort-Zwilling – Paaranalyse ───────────────────────────
async function analyzeWortZwilling() {
  const wortA = document.getElementById('wza-input').value.trim()
  const wortB = document.getElementById('wzb-input').value.trim()
  const pos   = document.getElementById('wzana-pos').value
  const out   = document.getElementById('wz-ana-output')
  if (!wortA || !wortB) return
  out.innerHTML = '<div class="status loading">Analysiere …</div>'
  try {
    const res  = await fetch(`/admin/analyze-wortzwilling?a=${encodeURIComponent(wortA)}&b=${encodeURIComponent(wortB)}&pos=${encodeURIComponent(pos)}`, {})
    const data = await res.json()
    if (!res.ok) { out.innerHTML = `<div class="status error">Fehler: ${esc(data.error)}</div>`; return }
    renderWZAnalyse(data, out)
  } catch (e) { out.innerHTML = `<div class="status error">Netzwerkfehler: ${esc(e.message)}</div>` }
}

async function analyzeEntryWortZwilling() {
  const wortA = normalizeText(document.getElementById('wza')?.value || '')
  const wortB = normalizeText(document.getElementById('wzb')?.value || '')
  const pos = document.getElementById('wzpos')?.value || 'Substantiv'
  const out = document.getElementById('entry-wz-analysis-output')
  if (!out) return
  out.classList.remove('is-veraltet')
  if (!wortA || !wortB) {
    schreibeErgebnis(out, ergebnisMeldung('Erst beide Wörter eintragen.'))
    return
  }
  schreibeErgebnis(out, ergebnisMeldung('Prüft im Korpus …', 'loading'))
  try {
    const data = await holePruefung(`/admin/analyze-wortzwilling?a=${encodeURIComponent(wortA)}&b=${encodeURIComponent(wortB)}&pos=${encodeURIComponent(pos)}`)
    renderTagWortZwilling(data, out)
  } catch (err) {
    schreibeErgebnis(out, ergebnisMeldung(`Prüfen fehlgeschlagen: ${err.message}`, 'error'))
  }
}

// Ergebnis auf der Tagesseite. renderWZAnalyse bleibt für Werkzeuge › Analyse unverändert.
function renderTagWortZwilling(data, out) {
  if (!data.usable) {
    schreibeErgebnis(out, ergebnisMeldung('Nicht geeignet: zu wenige eigene Kollokatoren (mindestens 5 je Wort).', 'warn'))
    return
  }
  const alle = Array.isArray(data.kollokatoren) ? data.kollokatoren : []
  const spalte = (kopf, seite, scoreKey) => {
    const zeilen = alle.filter((k) => k.zuordnung === seite).slice(0, 5).map((k) => zeileMitZahl(k.wort, k[scoreKey])).join('')
    return `<div class="tag-erg-spalte"><h4 class="tag-erg-kopf">${esc(kopf)}</h4><ol class="tag-erg-knapp">${zeilen}</ol></div>`
  }
  schreibeErgebnis(out, ergebnisMeldung('Geeignet: genug eigene Kollokatoren für beide Wörter.', 'ok')
    + `<div class="tag-erg-spalten">${spalte(data.wortA, 'A', 'scoreA')}${spalte(data.wortB, 'B', 'scoreB')}</div>`
    + '<p class="tag-erg-fuss">Zahl = logDice zum jeweiligen Wort; gespielt werden nur Kollokatoren, die zu einem der beiden passen.</p>')
}

function renderWZAnalyse(data, out) {
  if (!data.usable) {
    out.innerHTML = `<div style="margin-top:12px"><span style="color:#991b1b;font-weight:700">✗ Nicht geeignet</span><br><span style="color:var(--muted);font-size:0.85rem">${esc(data.reason || '')}</span></div>`
    return
  }
  const kA = data.kollokatoren.filter(k => k.zuordnung === 'A')
  const kB = data.kollokatoren.filter(k => k.zuordnung === 'B')
  let html = `<div style="margin:12px 0 16px"><span style="color:#166534;font-weight:700">✓ Geeignet als Wort-Zwilling</span></div>`
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`
  for (const [label, items] of [[data.wortA, kA], [data.wortB, kB]]) {
    html += `<div style="border:1.5px solid #bbf7d0;border-radius:8px;padding:12px">`
    html += `<div style="font-weight:700;font-size:0.9rem;margin-bottom:8px;font-family:'Gentium Plus',serif">${esc(label)}</div>`
    html += `<ol style="padding-left:16px;font-size:0.85rem;display:flex;flex-direction:column;gap:4px">`
    for (const it of items) {
      html += `<li>${esc(it.wort)} <span style="color:var(--muted);font-size:0.78em">A:${it.scoreA?.toFixed(1)} B:${it.scoreB?.toFixed(1)}</span></li>`
    }
    html += `</ol></div>`
  }
  html += `</div>`
  out.innerHTML = html
}

function resetKollokationAnalysis() {
  const output = document.getElementById('koll-output')
  const input = document.getElementById('koll-input')
  if (output) output.innerHTML = ''
  if (input) input.value = ''
}

function resetWortZwillingAnalysis() {
  const output = document.getElementById('wz-ana-output')
  const inputA = document.getElementById('wza-input')
  const inputB = document.getElementById('wzb-input')
  if (output) output.innerHTML = ''
  if (inputA) inputA.value = ''
  if (inputB) inputB.value = ''
}

function resetZeitenwendeAnalysis() {
  const output = document.getElementById('zw-ana-output')
  const input = document.getElementById('zw-ana-input')
  if (output) output.innerHTML = ''
  if (input) input.value = ''
}

// ── Lückenfüller – Analyse ────────────────────────────────
async function analyzeLueckenfueller() {
  const lemma = document.getElementById('lf-ana-input')?.value.trim()
  const out   = document.getElementById('lf-ana-output')
  if (!lemma || !out) return
  out.innerHTML = '<div class="status loading">Analysiere …</div>'
  try {
    const res  = await fetch(`/admin/analyze-lueckenfueller?q=${encodeURIComponent(lemma)}`, {})
    const data = await res.json()
    if (!res.ok) { out.innerHTML = `<div class="status error">Fehler: ${esc(data.error)}</div>`; return }

    if (!data.usable) {
      out.innerHTML = `<div style="margin:12px 0"><span style="color:#991b1b;font-weight:700">✗ Nicht geeignet</span><br><span style="color:var(--muted);font-size:0.85rem">${esc(data.reason || 'Kein Material verfügbar')}</span></div>`
      return
    }

    const TYPE_LABELS = { choice: 'Auswahl', double: 'Doppel', free: 'Frei' }
    const roundsHtml = (data.preview || []).map((r, i) => {
      const typeLabel = TYPE_LABELS[r.type] || r.type
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-lt)">
        <span style="font-size:0.75rem;color:var(--muted);min-width:50px">Runde ${i + 1}</span>
        <span class="entry-chip">${esc(typeLabel)}</span>
        <strong style="font-size:0.88rem">${esc(r.kollokator || '—')}</strong>
        <span style="font-size:0.78rem;color:var(--muted);margin-left:auto">${r.punkte} Pkt.</span>
      </div>`
    }).join('')

    const neuHinweis = data.neuesLemma ? ' · noch kein Lemma – wird beim Generieren neu angelegt' : ''
    out.innerHTML = `
      <div style="margin:12px 0 16px"><span style="color:#166534;font-weight:700">✓ Geeignet – ${data.rounds} Runden generierbar</span></div>
      <div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px">Wortart: ${esc(data.pos || '—')}${neuHinweis}</div>
      <div>${roundsHtml}</div>
    `
  } catch (e) { out.innerHTML = `<div class="status error">Netzwerkfehler: ${esc(e.message)}</div>` }
}

async function analyzeEntryZeitenwende() {
  const lemma = normalizeText(document.getElementById('zw-lemma')?.value || '')
  const out = document.getElementById('entry-zw-analysis-output')
  if (!out) return
  out.classList.remove('is-veraltet')
  if (!lemma) {
    schreibeErgebnis(out, ergebnisMeldung('Erst ein Wort eintragen.'))
    return
  }
  schreibeErgebnis(out, ergebnisMeldung('Prüft im Korpus …', 'loading'))
  try {
    const data = await holePruefung(`/admin/analyze-zeitenwende?q=${encodeURIComponent(lemma)}`)
    renderTagZeitenwende(data, out)
  } catch (err) {
    schreibeErgebnis(out, ergebnisMeldung(`Prüfen fehlgeschlagen: ${err.message}`, 'error'))
  }
}

// Ergebnis auf der Tagesseite. renderZWAnalyse bleibt für Werkzeuge › Zeitenwende unverändert.
function renderTagZeitenwende(data, out) {
  const pre = Array.isArray(data.preCandidates) ? data.preCandidates : []
  const post = Array.isArray(data.postCandidates) ? data.postCandidates : []
  if (!pre.length && !post.length) {
    schreibeErgebnis(out, ergebnisMeldung('Keine Zeitenwende-Daten für dieses Wort.', 'warn'))
    return
  }
  const kopf = data.usable
    ? ergebnisMeldung('Geeignet: genug Kollokatoren, die vor oder nach 2000 typisch sind.', 'ok')
    : ergebnisMeldung('Nicht geeignet: zu wenige Unterschiede vor und nach 2000.', 'warn')
  const spalte = (titel, periode, items, key) => {
    const zeilen = items.slice(0, 5).map((it) => zeileMitZahl(it.wort, it[key], '+')).join('')
    return `<div class="tag-erg-spalte"><h4 class="tag-erg-kopf tag-erg-kopf--zeit" data-periode="${periode}">${titel}</h4>${zeilen ? `<ol class="tag-erg-knapp">${zeilen}</ol>` : '<p class="tag-erg-fuss">Keine Kandidaten</p>'}</div>`
  }
  const spiel = Array.isArray(data.words) && data.words.length
    ? `<p class="tag-erg-auswahl"><span class="tag-label">Im Spiel</span>${data.words.map((w) => {
      const periode = w.periode === 'pre' ? 'pre' : 'post'
      // Leerzeichen vor der Marke; die kurze Marke ist für Screenreader durch „(vor 2000)“ ersetzt.
      return `${esc(w.wort)} <span class="tag-erg-periode" data-periode="${periode}"><span aria-hidden="true">${periode === 'pre' ? 'vor' : 'nach'}</span><span class="adm-visually-hidden">(${periode === 'pre' ? 'vor' : 'nach'} 2000)</span></span>`
    }).join(' · ')}</p>`
    : ''
  schreibeErgebnis(out, kopf
    + `<div class="tag-erg-spalten">${spalte('vor 2000', 'pre', pre, 'distPre')}${spalte('nach 2000', 'post', post, 'distPost')}</div>`
    + spiel
    + '<p class="tag-erg-fuss">Zahl = Abstand im logDice zwischen den Zeiträumen.</p>')
}

const LF_TYPEN = { choice: 'Auswahl', double: 'Doppel', free: 'Frei' }

async function analyzeEntryLueckenfueller() {
  const lemma = normalizeText(document.getElementById('lf-id')?.value || '')
  const out = document.getElementById('entry-lf-analysis-output')
  if (!out) return
  out.classList.remove('is-veraltet')
  if (!lemma) {
    schreibeErgebnis(out, ergebnisMeldung('Erst ein Wort eintragen.'))
    return
  }
  schreibeErgebnis(out, ergebnisMeldung('Prüft im Korpus …', 'loading'))
  try {
    const data = await holePruefung(`/admin/analyze-lueckenfueller?q=${encodeURIComponent(lemma)}`)
    if (!data.usable) {
      schreibeErgebnis(out, ergebnisMeldung(data.reason || 'Nicht genug Material verfügbar.', 'warn'))
      return
    }
    const neu = data.neuesLemma ? ' Noch kein Eintrag – „Runden erzeugen“ legt ihn an.' : ''
    const zeilen = (Array.isArray(data.preview) ? data.preview : []).map((r, i) =>
      `<li class="tag-erg-zeile"><span class="tag-erg-wort">${i + 1}. ${esc(r.kollokator || '—')}</span><span class="tag-erg-werte">${esc(LF_TYPEN[r.type] || r.type || '')}</span><span class="tag-erg-urteil"><span class="tag-erg-zahl">${esc(String(r.punkte ?? '–'))} Pkt.</span></span></li>`).join('')
    schreibeErgebnis(out, ergebnisMeldung(`Geeignet: ${data.rounds || 0} Runden · ${data.pos || '—'}.${neu}`, 'ok')
      + (zeilen ? `<ol class="tag-erg-liste">${zeilen}</ol>` : ''))
  } catch (err) {
    schreibeErgebnis(out, ergebnisMeldung(`Prüfen fehlgeschlagen: ${err.message}`, 'error'))
  }
}

function resetLueckenfuellerAnalysis() {
  const output = document.getElementById('lf-ana-output')
  const input  = document.getElementById('lf-ana-input')
  if (output) output.innerHTML = ''
  if (input)  input.value = ''
}

// ── Lückenfüller – Generieren ─────────────────────────────
async function generateLueckenfueller(btn) {
  if (btn?.getAttribute('aria-disabled') === 'true') return
  const lemmaName = normalizeText(document.getElementById('lf-id')?.value || '')
  const statusEl  = document.getElementById('lf-generate-status')
  const zeige = (text, tone) => {
    if (!statusEl) return
    statusEl.textContent = text
    if (text && tone) statusEl.dataset.tone = tone
    else statusEl.removeAttribute('data-tone')
  }
  if (!lemmaName) {
    zeige('Erst ein Wort eintragen.', 'warn')
    document.getElementById('lf-id')?.focus()
    return
  }
  btn?.setAttribute('aria-disabled', 'true')
  try {
    // Das Erzeugen baut vorhandene Runden neu auf; der Speicherweg tut das bewusst nie
    // (lueckenfuellerAutoGen.js). Gefragt wird nur, wenn das Wort schon Runden hat.
    // Leichte Abfrage (Lemma-Index, keine Korpusanalyse); scheitert sie, lieber nachfragen.
    let vorhanden = null   // null: unbekannt
    try {
      const info = await holePruefung(`/admin/lueckenfueller/runden?q=${encodeURIComponent(lemmaName)}`)
      vorhanden = Number(info.vorhandeneRunden) || 0
    } catch {
      vorhanden = null
    }
    if (vorhanden !== 0) {
      const satz = vorhanden === null
        ? 'Hat das Wort schon Runden, werden sie ersetzt – auch für Tage, die schon gespielt wurden.'
        : `Das Wort hat schon ${vorhanden} ${vorhanden === 1 ? 'Runde' : 'Runden'}. Sie werden ersetzt – auch für Tage, die schon gespielt wurden.`
      if (!confirmAction(`Runden für „${lemmaName}“ jetzt erzeugen?\n\n${satz}`)) return
    }

    zeige(`Erzeugt Runden für „${lemmaName}“ …`, 'loading')
    const res  = await fetch('/admin/lueckenfueller/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lemmaName }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      zeige(`Fehler: ${data.error || `HTTP ${res.status}`}`, 'error')
      return
    }
    if (!data.ok) {
      zeige(`Nicht möglich: ${data.reason || 'Kein Material verfügbar'}`, 'warn')
      return
    }
    const neu = data.neuAngelegt ? ` (neu angelegt, ${data.pos})` : ''
    zeige(`Runden erzeugt: ${data.rounds} für „${data.lemma}“${neu}.`, 'ok')
    setModusMeldung('lf', '')   // eine ältere „unbekannt“-Meldung ist damit erledigt
  } catch (err) {
    zeige(`Fehler: ${err.message}`, 'error')
  } finally {
    btn?.removeAttribute('aria-disabled')
  }
}

// ── Freitage ──────────────────────────────────────────────
async function loadFreeDays(options = {}) {
  const listEl = document.getElementById('freedays-list')
  if (listEl && !options.silent) listEl.innerHTML = '<div class="users-empty">Wird geladen …</div>'
  try {
    const res = await fetch('/admin/free-days')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { days } = await res.json()
    freeDaysData = Array.isArray(days) ? days : []
    renderCalendar()
    renderWoche()   // Bonus-Marken in der Woche
    if (selectedCalendarDate) updateCalendarDetails(selectedCalendarDate)
    if (!listEl) return
    if (!freeDaysData.length) {
      listEl.innerHTML = '<div class="users-empty">Keine Bonus-Tage eingetragen.</div>'
      return
    }
    const rows = freeDaysData.map(({ date, label, bonus_count }) => `
      <div class="freeday-row">
        <div>
          <strong>${esc(formatIsoDate(date))}</strong>
          ${label ? `<span>${esc(label)}</span>` : ''}
          <span class="freeday-bonus">+${Number(bonus_count) || 0} Eigene-Lemma-Spiele für Basic</span>
        </div>
        <button class="entry-filters-reset freeday-delete-btn" data-action="delete-free-day" data-date="${esc(date)}">Entfernen</button>
      </div>`).join('')
    listEl.innerHTML = `<div class="freeday-list">${rows}</div>`
  } catch (err) {
    freeDaysData = []
    renderCalendar()
    renderWoche()
    if (selectedCalendarDate) updateCalendarDetails(selectedCalendarDate)
    if (listEl) listEl.innerHTML = `<div class="users-empty" style="color:#991b1b">Fehler: ${esc(err.message)}</div>`
  }
}

async function addFreeDay() {
  const dateInput = document.getElementById('freeday-date')
  const labelInput = document.getElementById('freeday-label')
  const bonusInput = document.getElementById('freeday-bonus')
  const msgEl = document.getElementById('freeday-msg')
  const date = dateInput?.value?.trim()
  const label = labelInput?.value?.trim() || ''
  const bonus_count = Math.max(0, Math.min(50, parseInt(bonusInput?.value, 10) || 0))
  if (!date) {
    if (msgEl) setFreeDayMessage('Bitte ein Datum auswählen.', 'error')
    return
  }
  try {
    const res = await fetch('/admin/free-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, label, bonus_count }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (msgEl) setFreeDayMessage(data.error || 'Fehler beim Hinzufügen.', 'error')
      return
    }
    if (dateInput) dateInput.value = ''
    if (labelInput) labelInput.value = ''
    if (bonusInput) bonusInput.value = ''
    if (msgEl) setFreeDayMessage(`${formatIsoDate(date)} wurde eingetragen.`, 'success')
    await loadFreeDays()
  } catch {
    if (msgEl) setFreeDayMessage('Netzwerkfehler.', 'error')
  }
}

async function deleteFreeDay(date) {
  if (!date) return
  const info = getFreeDayInfo(date)
  const ok = confirmAction('Bonus-Tag wirklich entfernen?', [
    `Datum: ${formatIsoDate(date)}`,
    info?.label ? `Bezeichnung: ${info.label}` : 'Ohne Bezeichnung',
  ])
  if (!ok) return
  try {
    const res = await fetch(`/admin/free-days/${encodeURIComponent(date)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) return
    setFreeDayMessage(`${formatIsoDate(date)} wurde entfernt.`, 'success')
    await loadFreeDays()
  } catch { /* ignore */ }
}

// ── Spezialwoche ──────────────────────────────────────────
function setSwMessage(message, tone = 'info') {
  const msgEl = document.getElementById('sw-msg')
  if (!msgEl) return
  msgEl.textContent = message || ''
  msgEl.classList.remove('is-hidden', 'is-error', 'is-success')
  if (!message) { msgEl.classList.add('is-hidden'); return }
  if (tone === 'error') msgEl.classList.add('is-error')
  if (tone === 'success') msgEl.classList.add('is-success')
}

function fillSwForm(entry) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? '' }
  set('sw-woche', entry.woche)
  set('sw-von', entry.von)
  set('sw-bis', entry.bis)
  set('sw-lemma-id', entry.lemma_id)
  set('sw-notiz', entry.notiz)
  set('sw-link', entry.link)
  set('sw-wza', entry.zwilling_partner)
  set('sw-wzpos', entry.zwilling_pos || 'Substantiv')
  set('sw-zw-notiz', entry.zeitenwende_notiz)
  set('sw-zw-link', entry.zeitenwende_link)
  set('sw-lf-id', entry.lueckenfueller_id)
  const preview = document.getElementById('sw-wz-preview')
  if (preview) preview.classList.add('is-hidden')
  setSwMessage('')
}

function clearSwForm() {
  ['sw-woche', 'sw-von', 'sw-bis', 'sw-lemma-id', 'sw-notiz', 'sw-link',
   'sw-wza', 'sw-zw-notiz', 'sw-zw-link', 'sw-lf-id'].forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  const posEl = document.getElementById('sw-wzpos')
  if (posEl) posEl.value = 'Substantiv'
  const preview = document.getElementById('sw-wz-preview')
  if (preview) preview.classList.add('is-hidden')
  setSwMessage('')
}

async function loadSpezialwochen() {
  const listEl = document.getElementById('sw-list')
  if (listEl) listEl.innerHTML = '<div class="users-empty">Wird geladen …</div>'
  try {
    const res = await fetch('/admin/spezialwochen')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { entries } = await res.json()
    if (!listEl) return
    if (!Array.isArray(entries) || !entries.length) {
      listEl.innerHTML = '<div class="users-empty">Keine Spezialwochen eingetragen.</div>'
      return
    }
    const rows = entries.map((e) => `
      <div class="sw-list-row">
        <div class="sw-list-main">
          <strong>${esc(e.woche)}</strong>
          <span class="sw-list-dates">${esc(formatIsoDate(e.von))} – ${esc(formatIsoDate(e.bis))}</span>
          <span class="sw-list-lemma">${esc(e.lemmaName || e.lemma_id)}</span>
          ${e.zwilling_partner ? `<span class="sw-list-badge">WZ: ${esc(e.zwilling_partner)}</span>` : ''}
          ${e.zeitenwende_notiz ? `<span class="sw-list-badge">ZW ✓</span>` : ''}
          ${e.lueckenfueller_id ? `<span class="sw-list-badge">LF: ${esc(e.lueckenfueller_id)}</span>` : ''}
        </div>
        <div class="sw-list-actions">
          <button class="ghost-btn ghost-btn--small" data-action="edit-spezialwoche" data-woche="${esc(e.woche)}">Bearbeiten</button>
          <button class="entry-filters-reset" data-action="delete-spezialwoche" data-woche="${esc(e.woche)}">Löschen</button>
        </div>
      </div>`).join('')
    listEl.innerHTML = `<div class="sw-list">${rows}</div>`
  } catch (err) {
    if (listEl) listEl.innerHTML = `<div class="users-empty" style="color:#991b1b">Fehler: ${esc(err.message)}</div>`
  }
}

async function saveSpezialwoche() {
  const get = (id) => (document.getElementById(id)?.value || '').trim()
  const body = {
    woche: get('sw-woche'),
    von: get('sw-von'),
    bis: get('sw-bis'),
    lemma_id: get('sw-lemma-id'),
    notiz: get('sw-notiz'),
    link: get('sw-link'),
    zwilling_partner: get('sw-wza'),
    zwilling_pos: get('sw-wzpos') || 'Substantiv',
    zeitenwende_notiz: get('sw-zw-notiz'),
    zeitenwende_link: get('sw-zw-link'),
    lueckenfueller_id: get('sw-lf-id'),
  }
  if (!body.woche || !body.von || !body.bis || !body.lemma_id) {
    setSwMessage('Woche, Von, Bis und Lemma sind Pflicht.', 'error')
    return
  }
  try {
    const res = await fetch('/admin/spezialwoche', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSwMessage(data.error || 'Fehler beim Speichern.', 'error')
      return
    }
    setSwMessage(`Woche ${body.woche} gespeichert.`, 'success')
    clearSwForm()
    await loadSpezialwochen()
  } catch {
    setSwMessage('Netzwerkfehler.', 'error')
  }
}

async function editSpezialwoche(woche) {
  if (!woche) return
  try {
    const res = await fetch(`/admin/spezialwoche/${encodeURIComponent(woche)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { entry } = await res.json()
    if (!entry) { setSwMessage('Eintrag nicht gefunden.', 'error'); return }
    fillSwForm(entry)
    document.getElementById('sw-woche')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    setSwMessage(`Fehler: ${err.message}`, 'error')
  }
}

async function deleteSpezialwoche(woche) {
  if (!woche) return
  const ok = confirmAction(`Spezialwoche ${woche} wirklich löschen?`, [
    `ISO-Woche: ${woche}`,
    'Dieser Vorgang kann nicht rückgängig gemacht werden.',
  ])
  if (!ok) return
  try {
    const res = await fetch(`/admin/spezialwoche/${encodeURIComponent(woche)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return
    setSwMessage(`Woche ${woche} gelöscht.`, 'success')
    await loadSpezialwochen()
  } catch { /* ignore */ }
}

async function previewSwWz() {
  const get = (id) => (document.getElementById(id)?.value || '').trim()
  const lemma = get('sw-lemma-id')
  const zwilling_partner = get('sw-wza')
  const zwilling_pos = get('sw-wzpos') || 'Substantiv'
  const previewEl = document.getElementById('sw-wz-preview')
  if (!lemma || !zwilling_partner) {
    setSwMessage('Lemma und Partner-Wort für WZ-Vorschau erforderlich.', 'error')
    return
  }
  if (previewEl) { previewEl.textContent = 'Lade Vorschau …'; previewEl.classList.remove('is-hidden') }
  try {
    const params = new URLSearchParams({ a: lemma, b: zwilling_partner, pos: zwilling_pos })
    const res = await fetch(`/admin/spezialwoche/preview-wz?${params}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (previewEl) previewEl.textContent = `Fehler: ${data.error || res.status}`
      return
    }
    if (previewEl) previewEl.textContent = JSON.stringify(data, null, 2)
  } catch (err) {
    if (previewEl) previewEl.textContent = `Netzwerkfehler: ${err.message}`
  }
}

// ── Vorschläge (Entwurfs-Postfach) ───────────────────────
// Tage, die per Vorschlags-API eingereicht wurden (server/routes/lemma-api.js).
// Übernehmen läuft serverseitig über denselben Speicherweg wie das Formular.

let vorschlaege = []
let vorschlaegeLaufen = false

// Gleiche Regel wie toId() in server/wortprofil.js
function wortZuId(wort) {
  return String(wort || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ISO-Kalenderwoche: Der Donnerstag einer Woche bestimmt Jahr und Nummer.
function isoKalenderwoche(datum) {
  const d = new Date(`${datum}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { jahr: d.getUTCFullYear(), woche: Math.ceil(((d - jahresbeginn) / 86400000 + 1) / 7) }
}

function vorschlagDatumKurz(datum) {
  const d = new Date(`${datum}T12:00:00Z`)
  return `${DAYS_DE[(d.getUTCDay() + 6) % 7]} ${datum.slice(8, 10)}.${datum.slice(5, 7)}.`
}

function lueckenfuellerHerkunft(tag) {
  const id = tag.lueckenfueller_id
  if (!id) return { wort: '—', herkunft: '' }
  const kandidaten = [
    ...(tag.woerter || []).map((wort) => ({ wort, herkunft: 'aus den Kollokationen' })),
    ...(tag.zwilling_paar || []).map((wort) => ({ wort, herkunft: 'aus dem Wort-Zwilling' })),
    { wort: tag.zeitenwende_lemma, herkunft: 'aus der Zeitenwende' },
  ]
  // Beide Seiten normalisieren: Der Server nimmt für den Lückenfüller auch ein Wort („Lektüre“) an, nicht nur die Kennung.
  return kandidaten.find((k) => k.wort && wortZuId(k.wort) === wortZuId(id)) || { wort: id, herkunft: 'passt zu keinem Wort dieses Tages', warnung: true }
}

function vorschlagLink(url) {
  if (!/^https:\/\//.test(url || '')) return ''
  let host
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
  return ` <a class="vorschlag-quelle" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(host)}<span class="adm-visually-hidden"> (öffnet neues Fenster)</span></a>`
}

function vorschlagNotizen(tag) {
  const zeilen = []
  ;(tag.woerter || []).forEach((wort, i) => {
    if (tag.notizen?.[i]) zeilen.push(`<p><b>${esc(wort)}:</b> ${esc(tag.notizen[i])}${vorschlagLink(tag.links?.[i])}</p>`)
  })
  if (tag.zwilling_notiz) zeilen.push(`<p><b>${esc((tag.zwilling_paar || []).join(' / '))}:</b> ${esc(tag.zwilling_notiz)}${vorschlagLink(tag.zwilling_link)}</p>`)
  if (tag.zeitenwende_notiz) zeilen.push(`<p><b>${esc(tag.zeitenwende_lemma)}:</b> ${esc(tag.zeitenwende_notiz)}${vorschlagLink(tag.zeitenwende_link)}</p>`)
  if (tag.thema_kurz) zeilen.unshift(`<p class="vorschlag-themakurz">${esc(tag.thema_kurz)}${vorschlagLink(tag.thema_quelle)}</p>`)
  return zeilen.length
    ? `<details class="vorschlag-details"><summary>Notizen und Links</summary><div class="vorschlag-notizen">${zeilen.join('')}</div></details>`
    : ''
}

function vorschlagKopf(entwurf, heute) {
  const id = esc(entwurf.id)
  // Echtes Leerzeichen vor „heute“, sonst liest der Screenreader „Mi 21.10.heute“
  const heuteHtml = entwurf.datum === heute ? ' <span class="vorschlag-heute">heute</span>' : ''
  return `<div class="vorschlag-kopf">
    <h3 class="vorschlag-titel" id="vorschlag-${id}-titel" tabindex="-1">
      <span class="vorschlag-datum">${esc(vorschlagDatumKurz(entwurf.datum))}${heuteHtml}</span>
      <span class="vorschlag-thema">${esc(entwurf.tag.thema || 'ohne Thema')}</span>
    </h3>
  </div>`
}

function vorschlagKarte(entwurf) {
  const { tag } = entwurf
  const heute = getTodayIso()
  const id = esc(entwurf.id)
  // Unsichtbarer Zusatz, damit die vielen gleichnamigen Knöpfe unterscheidbar sind
  const fuerTag = `<span class="adm-visually-hidden">: ${esc(vorschlagDatumKurz(entwurf.datum))}</span>`
  const kopf = vorschlagKopf(entwurf, heute)

  if (entwurf.erledigt) {
    return `<article class="vorschlag is-erledigt" data-id="${id}" aria-labelledby="vorschlag-${id}-titel">
      ${kopf}
      <div class="vorschlag-meldungen">
        <p class="vorschlag-meldung ${entwurf.erledigt.ok ? 'is-ok' : 'is-warnung'}">${esc(entwurf.erledigt.text)}</p>
      </div>
      <div class="vorschlag-aktionen">
        <span class="vorschlag-erledigt-marke">Übernommen</span>
        <a class="adm-link" href="#planen/tag/${esc(entwurf.datum)}">Tag bearbeiten${fuerTag}</a>
      </div>
    </article>`
  }

  const pos = { Substantiv: 'N', Verb: 'V', Adjektiv: 'A' }
  const kollokationen = (tag.woerter || [])
    .map((wort, i) => {
      const wortart = tag.positionen?.[i]
      return Object.hasOwn(pos, wortart)
        ? `${esc(wort)} <span class="vorschlag-pos" aria-hidden="true">${pos[wortart]}</span><span class="adm-visually-hidden">${esc(wortart)}</span>`
        : esc(wort)
    })
    .join(' · ')
  const zwilling = tag.zwilling_paar?.length === 2 ? `${esc(tag.zwilling_paar[0])} / ${esc(tag.zwilling_paar[1])}` : '—'
  const lf = lueckenfuellerHerkunft(tag)

  const warnungen = []
  if (entwurf.belegt) {
    warnungen.push(`An diesem Tag steht schon ein Eintrag (${entwurf.belegt.woerter.map(esc).join(' · ')}). Übernehmen ersetzt ihn${entwurf.datum === heute ? ', und der Tag wird gerade gespielt' : ''}.`)
  }
  if (entwurf.datum < heute) warnungen.push('Das Datum liegt in der Vergangenheit.')
  if (lf.warnung) warnungen.push(`Lückenfüller-ID „${esc(lf.wort)}“ passt zu keinem Wort dieses Tages.`)

  const meldungen = []
  if (warnungen.length) {
    meldungen.push(`<div class="vorschlag-meldung is-warnung">
      <p class="vorschlag-meldung-marke">Vor dem Übernehmen prüfen</p>
      <ul class="vorschlag-meldung-liste">${warnungen.map((w) => `<li>${w}</li>`).join('')}</ul>
    </div>`)
  }
  if (entwurf.fehler) meldungen.push(`<p class="vorschlag-meldung is-fehler">Übernehmen fehlgeschlagen: ${esc(entwurf.fehler)}</p>`)

  const beschaeftigt = entwurf.laeuft
  // aria-disabled statt disabled: Der Fokus bleibt auf dem Knopf, der Klick-Handler
  // fängt gesperrte Knöpfe ab (handleDocumentClick).
  const gesperrt = beschaeftigt || vorschlaegeLaufen ? ' aria-disabled="true"' : ''
  const ctaInhalt = beschaeftigt
    ? 'Wird übernommen …'
    // Der unsichtbare Zusatz steht INNERHALB des Text-Spans: als eigenes Flex-Kind
    // würde er in Chrome eine zweite Lücke (gap) vor dem Pfeil erzeugen.
    : `<span>Übernehmen${fuerTag}</span> <span aria-hidden="true">→</span>`

  return `<article class="vorschlag${beschaeftigt ? ' is-busy' : ''}" data-id="${id}" aria-labelledby="vorschlag-${id}-titel">
    ${kopf}
    <dl class="vorschlag-modi">
      <div class="vorschlag-modus"><dt class="vorschlag-label">Kollokationen</dt><dd class="vorschlag-wert">${kollokationen || '—'}</dd></div>
      <div class="vorschlag-modus"><dt class="vorschlag-label">Wort-Zwilling</dt><dd class="vorschlag-wert">${zwilling}</dd></div>
      <div class="vorschlag-modus"><dt class="vorschlag-label">Zeitenwende</dt><dd class="vorschlag-wert">${esc(tag.zeitenwende_lemma || '—')}</dd></div>
      <div class="vorschlag-modus${lf.warnung ? ' is-warnung' : ''}"><dt class="vorschlag-label">Lückenfüller</dt><dd class="vorschlag-wert">${esc(lf.wort)}${lf.herkunft && !lf.warnung ? `<span class="vorschlag-herkunft">${esc(lf.herkunft)}</span>` : ''}</dd></div>
    </dl>
    ${meldungen.length ? `<div class="vorschlag-meldungen">${meldungen.join('')}</div>` : ''}
    <div class="vorschlag-aktionen">
      <button type="button" class="adm-link" data-action="vorschlag-verwerfen" data-id="${id}"${gesperrt}>Verwerfen${fuerTag}</button>
      <button type="button" class="adm-cta" data-action="vorschlag-uebernehmen" data-id="${id}"${gesperrt}>${ctaInhalt}</button>
    </div>
    ${vorschlagNotizen(tag)}
  </article>`
}

function renderVorschlaege() {
  const liste = document.getElementById('vorschlaege-liste')
  const leer = document.getElementById('vorschlaege-leer')
  if (!liste || !leer) return

  // Fokus über das Neuzeichnen retten (sonst springt er nach <body>).
  const aktiv = liste.contains(document.activeElement) ? document.activeElement : null
  const fokusId = aktiv?.closest('[data-id]')?.dataset.id
  const fokusAktion = aktiv?.dataset.action

  const wochen = new Map()
  for (const entwurf of vorschlaege) {
    const { jahr, woche } = isoKalenderwoche(entwurf.datum)
    const kw = `${jahr}-${woche}`
    if (!wochen.has(kw)) wochen.set(kw, [])
    wochen.get(kw).push(entwurf)
  }
  liste.innerHTML = Array.from(wochen.values()).map((tage) => {
    const von = tage[0].datum
    const bis = tage[tage.length - 1].datum
    const spanne = `${von.slice(8, 10)}.${von.slice(5, 7)}.${von === bis ? '' : ` – ${bis.slice(8, 10)}.${bis.slice(5, 7)}.`}`
    // Bewusst ohne aria-labelledby: Eine benannte <section> wäre ein eigener Landmark (Region).
    // Das Leerzeichen zwischen den Spans ist nötig, sonst liest der Screenreader „KW 4215.10.“.
    return `<section class="vorschlag-woche">
      <h2 class="vorschlag-woche-kopf"><span class="vorschlag-woche-kw">KW ${isoKalenderwoche(von).woche}</span> <span class="vorschlag-woche-spanne">${esc(spanne)}</span></h2>
      ${tage.map(vorschlagKarte).join('')}
    </section>`
  }).join('')

  if (fokusId) {
    // Gesperrte Knöpfe sind aria-disabled (nicht disabled) und bleiben fokussierbar.
    const ziel = (fokusAktion && liste.querySelector(`[data-id="${CSS.escape(fokusId)}"][data-action="${CSS.escape(fokusAktion)}"]`))
      || document.getElementById(`vorschlag-${fokusId}-titel`)
    ziel?.focus({ preventScroll: true })
  }

  leer.classList.toggle('is-hidden', vorschlaege.length > 0)
  // Erläuterung zum Übernehmen nur, wenn es etwas zu übernehmen gibt
  document.getElementById('vorschlaege-info')?.classList.toggle('is-hidden', vorschlaege.length === 0)
  aktualisiereVorschlagHinweise()
}

function aktualisiereVorschlagHinweise() {
  const offen = vorschlaege.filter((v) => !v.erledigt).length
  const badge = document.getElementById('vorschlaege-badge')
  if (badge) {
    // Sichtbare Zahl ist aria-hidden; Screenreader lesen den versteckten Text im Link.
    badge.textContent = offen ? String(offen) : ''
    badge.classList.toggle('is-hidden', offen === 0)
  }
  const badgeText = document.getElementById('vorschlaege-badge-text')
  if (badgeText) badgeText.textContent = offen ? `, ${offen} offen` : ''
  const hinweis = document.getElementById('dashboard-vorschlaege-hinweis')
  const hinweisText = document.getElementById('dashboard-vorschlaege-text')
  if (hinweis && hinweisText) {
    hinweisText.textContent = offen === 1 ? '1 Vorschlag wartet' : `${offen} Vorschläge warten`
    hinweis.classList.toggle('is-hidden', offen === 0)
  }
  const alleBtn = document.getElementById('vorschlaege-alle-btn')
  if (alleBtn) {
    // Nur den Text-Span ändern; der Pfeil-Span im Knopf bleibt erhalten.
    const alleText = document.getElementById('vorschlaege-alle-text')
    if (alleText) alleText.textContent = offen ? `Alle ${offen} übernehmen` : 'Alle übernehmen'
    // Ohne offene Vorschläge ausblenden statt gesperrt zeigen; während des Laufs
    // aria-disabled (Fokus bleibt auf dem Knopf, Klick fängt handleDocumentClick ab).
    alleBtn.classList.toggle('is-hidden', offen === 0)
    // Auch während einer Einzelübernahme sperren, sonst zählte „Alle“ den laufenden Tag als fehlgeschlagen.
    if (vorschlaegeLaufen || vorschlaege.some((v) => v.laeuft)) alleBtn.setAttribute('aria-disabled', 'true')
    else alleBtn.removeAttribute('aria-disabled')
  }
  // „Vorschlag liegt vor“ in der Woche hängt an den (später eintreffenden) Vorschlägen.
  renderLuecken()
  const detail = document.getElementById('dashboard-day-detail')
  // Nicht neu zeichnen, solange der Fokus im Detail steht – er ginge sonst verloren.
  if (detail && !detail.contains(document.activeElement)) renderTagesDetail(selectedDashboardDate)
}

function setVorschlaegeStatus(text, tone = 'info') {
  const el = document.getElementById('vorschlaege-status')
  if (!el) return
  el.textContent = text
  el.dataset.tone = tone
}

async function loadVorschlaege({ silent = false } = {}) {
  try {
    const res = await fetch('/admin/entwuerfe')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    // Laufzeit-Flags (laeuft/erledigt/fehler) bestehender Einträge behalten: Das Objekt
    // bleibt dasselbe, damit eine laufende Übernahme es weiter erreicht. Erledigte
    // Einträge, die der Server nicht mehr liefert, werden nicht wieder eingefügt.
    const bisher = new Map(vorschlaege.map((v) => [v.id, v]))
    vorschlaege = (data.entwuerfe || []).map((neu) => {
      const alt = bisher.get(neu.id)
      return alt ? Object.assign(alt, neu) : neu
    })
    // Die Fortschrittszeile eines laufenden Sammel- oder Einzellaufs nicht löschen
    if (!silent && !vorschlaegeLaufen && !vorschlaege.some((v) => v.laeuft)) setVorschlaegeStatus('')
    renderVorschlaege()
  } catch (err) {
    if (!silent) setVorschlaegeStatus(`Laden fehlgeschlagen: ${err.message}`, 'error')
  }
}

function speicherErgebnisText(data) {
  const teile = ['Gespeichert']
  if (data.zwillingOk === true) teile.push('Wort-Zwilling OK')
  if (data.zwillingOk === false) teile.push('Wort-Zwilling: nicht genug distinkte Kollokatoren')
  if (data.zeitenwendeOk === true) teile.push('Zeitenwende OK')
  if (data.zeitenwendeOk === false) teile.push('Zeitenwende: nicht genug distinkte Kollokatoren')
  if (data.lueckenfuellerId || data.lueckenfuellerStatus === 'mehrdeutig') teile.push(`Lückenfüller: ${lueckenfuellerMeldung(data.lueckenfuellerStatus)}`)
  return teile.join(' · ')
}

async function uebernehmeVorschlag(id) {
  const entwurf = vorschlaege.find((v) => v.id === id)
  if (!entwurf || entwurf.erledigt || entwurf.laeuft) return false
  entwurf.laeuft = true
  entwurf.fehler = ''
  renderVorschlaege()
  try {
    const res = await fetch(`/admin/entwuerfe/${id}/uebernehmen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    entwurf.erledigt = {
      ok: data.zwillingOk !== false && data.zeitenwendeOk !== false && data.lueckenfuellerOk !== false,
      text: speicherErgebnisText(data),
    }
    return true
  } catch (err) {
    entwurf.fehler = err.message
    return false
  } finally {
    entwurf.laeuft = false
    renderVorschlaege()
  }
}

async function uebernehmeEinzelnenVorschlag(id) {
  const entwurf = vorschlaege.find((v) => v.id === id)
  if (!entwurf) return
  if (entwurf.belegt && !confirmAction(`Eintrag am ${vorschlagDatumKurz(entwurf.datum)} ersetzen?`, [
    `Bisher: ${entwurf.belegt.woerter.join(' · ')}`,
    `Neu: ${entwurf.tag.woerter.join(' · ')}`,
  ])) return
  const datumKurz = vorschlagDatumKurz(entwurf.datum)
  setVorschlaegeStatus(`Übernehme ${datumKurz} …`, 'loading')
  const ok = await uebernehmeVorschlag(id)
  setVorschlaegeStatus(ok ? `${datumKurz} übernommen.` : `${datumKurz} konnte nicht übernommen werden.`, ok ? 'ok' : 'error')
  if (ok) loadKalender()
  else document.querySelector(`[data-action="vorschlag-uebernehmen"][data-id="${CSS.escape(String(id))}"]`)?.focus({ preventScroll: true })
}

async function uebernehmeAlleVorschlaege() {
  const offen = vorschlaege.filter((v) => !v.erledigt)
  if (!offen.length) return
  const belegt = offen.filter((v) => v.belegt)
  const details = [`${vorschlagDatumKurz(offen[0].datum)} bis ${vorschlagDatumKurz(offen[offen.length - 1].datum)}`]
  if (belegt.length) details.push(`Ersetzt bestehende Einträge an: ${belegt.map((v) => vorschlagDatumKurz(v.datum)).join(', ')}`)
  if (!confirmAction(`${offen.length} Vorschläge übernehmen?`, details)) return

  vorschlaegeLaufen = true
  let erfolgreich = 0
  for (let i = 0; i < offen.length; i++) {
    setVorschlaegeStatus(`Übernehme ${i + 1} von ${offen.length}: ${vorschlagDatumKurz(offen[i].datum)} …`, 'loading')
    if (await uebernehmeVorschlag(offen[i].id)) erfolgreich++
  }
  vorschlaegeLaufen = false
  renderVorschlaege()
  const fehlgeschlagen = offen.length - erfolgreich
  setVorschlaegeStatus(
    fehlgeschlagen ? `${erfolgreich} übernommen, ${fehlgeschlagen} fehlgeschlagen – Details stehen am jeweiligen Tag.` : `Alle ${erfolgreich} Vorschläge übernommen.`,
    fehlgeschlagen ? 'error' : 'ok',
  )
  loadKalender()
}

async function verwerfeVorschlag(id) {
  const entwurf = vorschlaege.find((v) => v.id === id)
  if (!entwurf || !confirmAction(`Vorschlag für ${vorschlagDatumKurz(entwurf.datum)} verwerfen?`, [entwurf.tag.thema || entwurf.tag.woerter.join(' · ')])) return
  const index = vorschlaege.findIndex((v) => v.id === id)
  let verworfen = false
  try {
    const res = await fetch(`/admin/entwuerfe/${id}/verwerfen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    vorschlaege = vorschlaege.filter((v) => v.id !== id)
    verworfen = true
    setVorschlaegeStatus(`Vorschlag für ${vorschlagDatumKurz(entwurf.datum)} verworfen.`, 'ok')
  } catch (err) {
    setVorschlaegeStatus(`Verwerfen fehlgeschlagen: ${err.message}`, 'error')
  }
  renderVorschlaege()
  if (!verworfen) return

  // Der Eintrag ist weg: Fokus auf die Überschrift des nächsten, sonst des vorigen
  // Eintrags, sonst auf den Titel des Leerzustands.
  const nachbar = vorschlaege[index] || vorschlaege[index - 1]
  const ziel = nachbar
    ? document.getElementById(`vorschlag-${nachbar.id}-titel`)
    : document.getElementById('vorschlaege-leer-titel')
  ziel?.focus({ preventScroll: true })
}

// ── Push-Benachrichtigungen ──────────────────────────────
function setPushHint(id, message, tone = 'info') {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = message || ''
  el.classList.remove('is-hidden', 'is-error', 'is-success')
  if (!message) { el.classList.add('is-hidden'); return }
  if (tone === 'error') el.classList.add('is-error')
  if (tone === 'success') el.classList.add('is-success')
}

function renderPushTemplateRow(t) {
  const preview = t.preview || {}
  const isStreak = t.category === 'streak'
  const previewLabel = isStreak ? 'Vorschau (Serie = 5)' : 'Vorschau heute'
  const previewHtml = preview.eligible
    ? `<strong>${esc(preview.title)}</strong><br>${esc(preview.body)}`
    : `<span class="push-tpl-skip">Heute übersprungen — fehlt: ${esc((preview.missing || []).join(', ') || 'unbekannt')}</span>`
  const categoryBadge = isStreak
    ? '<span class="push-tpl-badge push-tpl-badge-streak">Streak-Saver · 19:00</span>'
    : '<span class="push-tpl-badge">Täglich · 08:00</span>'
  const toggleLabel = isStreak
    ? 'Aktiv – nimmt an der abendlichen Streak-Rotation teil'
    : 'Aktiv – nimmt an der täglichen Rotation teil'
  // Streak-Templates gehen nur automatisch an gefährdete Serien – kein Broadcast.
  const sendButton = isStreak
    ? '<span class="push-tpl-skip">Automatischer Versand 19:00 an gefährdete Serien</span>'
    : `<button class="ghost-btn" data-action="push-send-template" data-id="${t.id}">Jetzt senden</button>`
  return `
    <div class="push-template" data-id="${t.id}">
      <div class="push-tpl-head">${categoryBadge}</div>
      <div class="entry-field">
        <label>Titel</label>
        <input type="text" class="push-tpl-title" maxlength="120" value="${esc(t.title)}">
      </div>
      <div class="entry-field">
        <label>Text</label>
        <textarea class="push-tpl-body" maxlength="300" rows="2">${esc(t.body)}</textarea>
      </div>
      <label class="push-tpl-toggle">
        <input type="checkbox" class="push-tpl-enabled" ${t.enabled ? 'checked' : ''}>
        ${toggleLabel}
      </label>
      <div class="push-tpl-preview">${previewLabel}: ${previewHtml}</div>
      <div class="push-tpl-actions">
        <button class="primary-btn" data-action="push-save-template" data-id="${t.id}">Speichern</button>
        ${sendButton}
        <button class="entry-filters-reset" data-action="push-delete-template" data-id="${t.id}">Löschen</button>
      </div>
    </div>`
}

function renderPushTemplates(data) {
  const placeholdersEl = document.getElementById('push-placeholders')
  if (placeholdersEl) {
    placeholdersEl.textContent = (data.placeholders || []).map(p => `{${p}}`).join('  ')
  }
  const countEl = document.getElementById('push-subscriber-count')
  if (countEl) {
    const n = Number(data.subscriberCount) || 0
    countEl.textContent = n === 1 ? '1 Gerät' : `${n} Geräte`
  }
  const listEl = document.getElementById('push-templates-list')
  if (!listEl) return
  const templates = Array.isArray(data.templates) ? data.templates : []
  listEl.innerHTML = templates.length
    ? templates.map(renderPushTemplateRow).join('')
    : '<div class="users-empty">Keine Vorlagen vorhanden.</div>'
}

async function loadPushTemplates() {
  const listEl = document.getElementById('push-templates-list')
  if (listEl) listEl.innerHTML = '<div class="users-empty">Wird geladen …</div>'
  try {
    const res = await fetch('/admin/push/templates')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    renderPushTemplates(await res.json())
  } catch (err) {
    if (listEl) listEl.innerHTML = `<div class="users-empty" style="color:#991b1b">Fehler: ${esc(err.message)}</div>`
  }
}

async function addPushTemplate() {
  try {
    const res = await fetch('/admin/push/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Neue Vorlage', body: 'Text bearbeiten …', enabled: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setPushHint('push-template-msg', data.error || 'Anlegen fehlgeschlagen.', 'error'); return }
    setPushHint('push-template-msg', 'Vorlage angelegt – jetzt bearbeiten und aktivieren.', 'success')
    await loadPushTemplates()
  } catch {
    setPushHint('push-template-msg', 'Netzwerkfehler.', 'error')
  }
}

async function savePushTemplate(id) {
  const row = document.querySelector(`.push-template[data-id="${id}"]`)
  if (!row) return
  const title = row.querySelector('.push-tpl-title')?.value?.trim() || ''
  const body = row.querySelector('.push-tpl-body')?.value?.trim() || ''
  const enabled = row.querySelector('.push-tpl-enabled')?.checked || false
  try {
    const res = await fetch(`/admin/push/templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, enabled }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setPushHint('push-template-msg', data.error || 'Speichern fehlgeschlagen.', 'error'); return }
    setPushHint('push-template-msg', 'Vorlage gespeichert.', 'success')
    await loadPushTemplates()
  } catch {
    setPushHint('push-template-msg', 'Netzwerkfehler.', 'error')
  }
}

async function deletePushTemplate(id) {
  if (!confirmAction('Vorlage wirklich löschen?')) return
  try {
    const res = await fetch(`/admin/push/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setPushHint('push-template-msg', data.error || 'Löschen fehlgeschlagen.', 'error'); return }
    setPushHint('push-template-msg', 'Vorlage gelöscht.', 'success')
    await loadPushTemplates()
  } catch {
    setPushHint('push-template-msg', 'Netzwerkfehler.', 'error')
  }
}

async function sendPushTemplate(id) {
  if (!confirmAction('Diese Vorlage jetzt an alle registrierten Geräte senden?')) return
  setPushHint('push-template-msg', 'Wird gesendet …', 'info')
  try {
    const res = await fetch('/admin/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'template', templateId: Number(id) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setPushHint('push-template-msg', data.error || 'Versand fehlgeschlagen.', 'error'); return }
    setPushHint('push-template-msg', `Gesendet: ${data.sent} erfolgreich, ${data.failed} fehlgeschlagen (von ${data.total}).`, 'success')
  } catch {
    setPushHint('push-template-msg', 'Netzwerkfehler.', 'error')
  }
}

async function submitManualPush(mode) {
  const titleEl = document.getElementById('push-send-title')
  const bodyEl = document.getElementById('push-send-body')
  const title = titleEl?.value?.trim() || ''
  const body = bodyEl?.value?.trim() || ''
  if (!title || !body) {
    setPushHint('push-send-msg', 'Titel und Text sind erforderlich.', 'error')
    return
  }
  const confirmMsg = mode === 'self'
    ? 'Testnachricht jetzt an deine eigenen Geräte senden?'
    : 'Diese Nachricht jetzt an alle registrierten Geräte senden?'
  if (!confirmAction(confirmMsg, [`Titel: ${title}`, `Text: ${body}`])) return
  setPushHint('push-send-msg', 'Wird gesendet …', 'info')
  try {
    const res = await fetch('/admin/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, title, body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setPushHint('push-send-msg', data.error || 'Versand fehlgeschlagen.', 'error'); return }
    setPushHint('push-send-msg', `Gesendet: ${data.sent} erfolgreich, ${data.failed} fehlgeschlagen (von ${data.total}).`, 'success')
    // Test-Versand: Felder behalten, damit der Text danach an alle gehen kann.
    if (mode !== 'self') {
      if (titleEl) titleEl.value = ''
      if (bodyEl) bodyEl.value = ''
    }
  } catch {
    setPushHint('push-send-msg', 'Netzwerkfehler.', 'error')
  }
}

function handleDocumentClick(event) {
  handleRouteLinkClick(event)

  const target = event.target.closest('[data-action]')
  if (!target) return
  // Gesperrte Knöpfe (z. B. Vorschläge während einer Übernahme) behalten den Fokus
  // und lösen keine Aktion aus.
  if (target.getAttribute('aria-disabled') === 'true') return

  const { action } = target.dataset
  if (action === 'login') return void doLogin()
  if (action === 'download-backup') return void downloadBackup()
  if (action === 'logout') return void doLogout()
  if (action === 'switch-page') return void switchPage(target.dataset.page)
  if (action === 'nav-back') {
    event.preventDefault()
    return void goBackFromSubpage()
  }
  if (action === 'skip-to-content') {
    event.preventDefault()
    return void document.getElementById('adm-main')?.focus()
  }
  if (action === 'retry-entry-route') return void navigate(currentRouteHash || '#planen')
  if (action === 'refresh-dashboard') return void refreshDashboard()
  if (action === 'load-health') return void loadHealth()
  if (action === 'dashboard-week') return void changeDashboardWeek(Number(target.dataset.delta || 0))
  if (action === 'dashboard-week-heute') return void zeigeDieseWoche()
  if (action === 'select-dashboard-date') return void selectDashboardDay(target.dataset.value || '')
  if (action === 'toggle-extra-fields') return void toggleExtraFields(target.dataset.target || '')
  if (action === 'preview-current-lemma') return void previewCurrentLemma(Number(target.dataset.index) || 1)
  if (action === 'reset-entry-form') {
    // Der Knopf steht neben „Speichern“: ein Fehltipp würde sonst alle Eingaben verwerfen.
    if (!window.confirm('Ungespeicherte Änderungen verwerfen? Der zuletzt gespeicherte Stand kommt zurück.')) return
    restoreEntryFormSnapshot()
    // Der Knopf verschwindet (disabled → ausgeblendet); der Fokus geht zum Stand.
    document.getElementById('entry-dirty-indicator')?.focus()
    return
  }
  if (action === 'restore-entry-draft') return void restoreEntryDraft()
  if (action === 'discard-entry-draft') return void discardEntryDraft()
  if (action === 'vorschlaege-laden') return void loadVorschlaege()
  if (action === 'vorschlaege-alle') return void uebernehmeAlleVorschlaege()
  if (action === 'vorschlag-uebernehmen') return void uebernehmeEinzelnenVorschlag(Number(target.dataset.id))
  if (action === 'vorschlag-verwerfen') return void verwerfeVorschlag(Number(target.dataset.id))
  if (action === 'save-tag') return void saveTag()
  if (action === 'delete-current-tag') return void deleteCurrentTag()
  if (action === 'analyze-entry-kollokation') return void mitPruefSperre(target, analyzeEntryKollokation)
  if (action === 'analyze-entry-wort-zwilling') return void mitPruefSperre(target, analyzeEntryWortZwilling)
  if (action === 'analyze-entry-zeitenwende') return void mitPruefSperre(target, analyzeEntryZeitenwende)
  if (action === 'analyze-entry-lueckenfueller') return void mitPruefSperre(target, analyzeEntryLueckenfueller)
  if (action === 'trigger-calendar-csv-import') return void triggerCalendarCsvImport()
  if (action === 'load-kalender') return void loadKalender()
  if (action === 'reset-entry-filters') return void resetEntryFilters()
  if (action === 'select-all-visible-entries') return void selectAllVisibleEntries()
  if (action === 'entry-page-prev') return void goToEntryPage(-1)
  if (action === 'entry-page-next') return void goToEntryPage(1)
  if (action === 'clear-entry-selection') return void clearEntrySelection()
  if (action === 'bulk-delete-selected-dates') return void bulkDeleteSelectedDates()
  if (action === 'load-stats') return void loadStats()
  if (action === 'export-stats') return void exportStats(target.dataset.format || 'json')
  if (action === 'analyze-kollokation') return void analyzeKollokation()
  if (action === 'reset-kollokation-analysis') return void resetKollokationAnalysis()
  if (action === 'analyze-wort-zwilling') return void analyzeWortZwilling()
  if (action === 'reset-wort-zwilling-analysis') return void resetWortZwillingAnalysis()
  if (action === 'analyze-zeitenwende') return void analyzeZeitenwende()
  if (action === 'reset-zeitenwende-analysis') return void resetZeitenwendeAnalysis()
  if (action === 'analyze-lueckenfueller') return void analyzeLueckenfueller()
  if (action === 'reset-lueckenfueller-analysis') return void resetLueckenfuellerAnalysis()
  if (action === 'generate-lueckenfueller') return void generateLueckenfueller(target)
  if (action === 'change-month') return void changeMonth(Number(target.dataset.delta || 0))
  if (action === 'edit-selected-calendar-date') return void editSelectedCalendarDate()
  if (action === 'load-users-overview') return void loadUsersOverview()
  if (action === 'select-all-users') return void toggleAllUsersSelection(true)
  if (action === 'clear-users-selection') return void clearUsersBulkSelection()
  if (action === 'run-users-bulk-action') return void runUsersBulkAction()
  if (action === 'reset-users-filters') return void resetUsersFilters()
  if (action === 'load-more-users') return void loadMoreUsers()
  if (action === 'save-selected-user-role') return void saveSelectedUserRole()
  if (action === 'delete-selected-user') return void deleteSelectedUser()
  if (action === 'trigger-backup-restore') return void triggerBackupRestore()
  if (action === 'load-performance') return void loadPerformance()
  if (action === 'regenerate-course-pdfs') return void regenerateCoursePdfs()
  if (action === 'load-course-pdf-status') return void loadCoursePdfStatus()
  if (action === 'load-audit-log') return void loadAuditLog()
  if (action === 'reset-audit-filters') return void resetAuditFilters()
  if (action === 'prefill-date') return void navigate(isValidIsoDay(target.dataset.value) ? `#planen/tag/${target.dataset.value}` : '#planen/tag/neu')
  if (action === 'select-calendar-date') return void selectCalendarDate(target.dataset.value || '')
  if (action === 'focus-calendar-date') return void focusCalendarDate(target.dataset.value || '', target.dataset.iso || '')
  if (action === 'edit-tag') {
    // Die Eintragsliste liefert data-datum, ältere Aufrufer data-value.
    const datum = target.dataset.datum || target.dataset.value || ''
    return void navigate(isValidIsoDay(datum) ? `#planen/tag/${datum}` : '#planen/tag/neu')
  }
  if (action === 'select-user') return void selectUser(target.dataset.userId || '')
  if (action === 'show-audit-entry-details') return void showAuditEntryDetailsByIndex(Number(target.dataset.index || -1))
  if (action === 'load-free-days') return void loadFreeDays()
  if (action === 'add-free-day') return void addFreeDay()
  if (action === 'delete-free-day') return void deleteFreeDay(target.dataset.date || '')
  if (action === 'load-spezialwochen') return void loadSpezialwochen()
  if (action === 'save-spezialwoche') return void saveSpezialwoche()
  if (action === 'clear-sw-form') return void clearSwForm()
  if (action === 'edit-spezialwoche') return void editSpezialwoche(target.dataset.woche || '')
  if (action === 'delete-spezialwoche') return void deleteSpezialwoche(target.dataset.woche || '')
  if (action === 'preview-sw-wz') return void previewSwWz()
  if (action === 'push-load-templates') return void loadPushTemplates()
  if (action === 'push-add-template') return void addPushTemplate()
  if (action === 'push-save-template') return void savePushTemplate(target.dataset.id || '')
  if (action === 'push-delete-template') return void deletePushTemplate(target.dataset.id || '')
  if (action === 'push-send-template') return void sendPushTemplate(target.dataset.id || '')
  if (action === 'push-send-free') return void submitManualPush('free')
  if (action === 'push-send-self') return void submitManualPush('self')
  if (action === 'load-classroom-stats') return void loadClassroomStats()
  if (action === 'save-demo-content') return void saveDemoEditor()
  if (action === 'load-product-metrics') return void loadProductMetrics()
}

// ── Demo-Inhalte (login-freie Lehrer-Vorschau) ──────────────────────────────
function demoWords(str) {
  return String(str || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
}

async function loadDemoEditor() {
  const status = document.getElementById('demo-content-status')
  if (!document.getElementById('demo-kol-lemma')) return
  try {
    const r = await fetch('/admin/classroom/demo-content')
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
    const c = d.content || {}
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v }
    set('demo-kol-lemma', c.kollokationen?.lemma?.lemma)
    set('demo-kol-ipa',   c.kollokationen?.lemma?.ipa)
    set('demo-kol-def',   c.kollokationen?.lemma?.definition)
    set('demo-kol-words', (c.kollokationen?.words || []).join('\n'))
    set('demo-wz-a',      c.wortzwilling?.wortA)
    set('demo-wz-b',      c.wortzwilling?.wortB)
    set('demo-wz-words',  (c.wortzwilling?.words || []).join('\n'))
    set('demo-zw-lemma',  c.zeitenwende?.lemma?.lemma)
    set('demo-zw-ipa',    c.zeitenwende?.lemma?.ipa)
    set('demo-zw-words',  (c.zeitenwende?.words || []).join('\n'))
    set('demo-lf-lemma',  c.lueckenfueller?.lemma?.lemma)
    set('demo-lf-ipa',    c.lueckenfueller?.lemma?.ipa)
    set('demo-lf-sentence', c.lueckenfueller?.sentence)
    set('demo-lf-options', (c.lueckenfueller?.options || []).join('\n'))
    if (status) { status.textContent = 'Inhalte geladen.'; status.className = 'entry-hint' }
  } catch (e) {
    if (status) { status.textContent = 'Fehler beim Laden: ' + e.message; status.className = 'status error' }
  }
}

async function saveDemoEditor() {
  const status = document.getElementById('demo-content-status')
  const val = (id) => (document.getElementById(id)?.value || '').trim()
  const payload = {
    kollokationen: {
      lemma: { lemma: val('demo-kol-lemma'), ipa: val('demo-kol-ipa'), definition: val('demo-kol-def') },
      words: demoWords(val('demo-kol-words')),
    },
    wortzwilling: {
      wortA: val('demo-wz-a'), wortB: val('demo-wz-b'),
      words: demoWords(val('demo-wz-words')),
    },
    zeitenwende: {
      lemma: { lemma: val('demo-zw-lemma'), ipa: val('demo-zw-ipa') },
      words: demoWords(val('demo-zw-words')),
    },
    lueckenfueller: {
      lemma: { lemma: val('demo-lf-lemma'), ipa: val('demo-lf-ipa') },
      sentence: val('demo-lf-sentence'),
      options: demoWords(val('demo-lf-options')),
    },
  }
  if (status) { status.textContent = 'Speichere …'; status.className = 'entry-hint' }
  try {
    const r = await fetch('/admin/classroom/demo-content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json()
    if (!r.ok) {
      const detail = Array.isArray(d.issues) && d.issues.length
        ? d.issues.map(i => `${(i.path || []).join('.')}: ${i.message}`).join(' · ')
        : (d.error || `HTTP ${r.status}`)
      throw new Error(detail)
    }
    if (status) { status.textContent = '✓ Gespeichert. Die Vorschau nutzt die neuen Inhalte sofort.'; status.className = 'entry-hint' }
  } catch (e) {
    if (status) { status.textContent = 'Fehler: ' + e.message; status.className = 'status error' }
  }
}

async function loadClassroomStats() {
  const out  = document.getElementById('classroom-stats-output')
  const days = document.getElementById('classroom-days')?.value || '30'
  if (!out) return
  out.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Lade …</div>'
  try {
    const r    = await fetch(`/admin/classroom/stats?days=${encodeURIComponent(days)}`)
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    out.innerHTML = renderClassroomStats(data)
  } catch (e) {
    out.innerHTML = `<div class="status error">Fehler: ${esc(e.message)}</div>`
  }
}

function renderClassroomStats(d) {
  const s   = d.sessions   || {}
  const p   = d.participants || {}
  const sub = d.submissions || {}
  const modes = d.modes    || []

  // Empty State
  if (!s.total) {
    return `
      <div class="users-empty" style="padding:48px 0; text-align:center">
        <p style="font-size:1.5rem; font-family:'Gentium Plus',serif; color:var(--primary)">K</p>
        <p style="color:var(--muted); font-size:0.9rem; margin-top:8px">Noch keine Klassenraum-Sessions im gewählten Zeitraum.</p>
      </div>`
  }

  const pct = (n, d2) => d2 > 0 ? Math.round((n / d2) * 100) + '%' : '-'
  const fmt = (n) => n == null ? '-' : Number(n).toLocaleString('de-DE')
  const fmtPct = (v) => v == null ? '-' : (v * 100).toFixed(1) + '%'

  // Sessions-Kacheln
  const byStatus = s.byStatus || {}
  const byReason = s.byReason || {}
  const manual   = (byReason['manual'] || 0) + (byReason['completed'] || 0)
  const auto     = byReason['auto'] || byReason['auto_end'] || 0

  // Modus-Tabelle
  const modeRows = modes.length
    ? modes.map(m => {
        const w = modes[0].count > 0 ? Math.round((m.count / modes[0].count) * 100) : 0
        return `<tr>
          <td style="width:130px">${esc(m.mode)}</td>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:8px;background:var(--border-lt);border-radius:4px">
              <div style="width:${w}%;height:8px;background:var(--primary);border-radius:4px"></div>
            </div>
            <span style="min-width:32px;text-align:right;font-size:0.82rem">${fmt(m.count)}</span>
          </div></td>
        </tr>`
      }).join('')
    : '<tr><td colspan="2" class="users-empty">Keine Modi-Daten</td></tr>'

  // Sessions pro Tag (Mini-Balkendiagramm)
  const perDay = (s.perDay || []).slice(-30)
  const maxDay = perDay.reduce((m, r) => Math.max(m, r.count), 0) || 1
  const dayBars = perDay.length
    ? perDay.map(r => {
        const h = Math.round((r.count / maxDay) * 36)
        return `<div title="${esc(r.day)}: ${r.count}" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-end;height:40px;width:${Math.max(8, Math.floor(280 / perDay.length))}px">
          <div style="width:80%;background:var(--primary);border-radius:2px 2px 0 0;height:${h}px"></div>
        </div>`
      }).join('')
    : '<span style="color:var(--muted);font-size:0.82rem">Keine Daten</span>'

  return `
    <div class="dashboard-grid" style="margin-bottom:16px">
      <article class="metric-card metric-card--support">
        <span class="metric-label">Sessions gesamt</span>
        <strong class="metric-value">${fmt(s.total)}</strong>
        <span class="metric-sub">im Zeitraum</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Abgeschlossen</span>
        <strong class="metric-value">${fmt(byStatus['finished'] || 0)}</strong>
        <span class="metric-sub">${pct(byStatus['finished'] || 0, s.total)} der Sessions</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Ø Teilnehmer</span>
        <strong class="metric-value">${p.avgPerSession != null ? p.avgPerSession : '-'}</strong>
        <span class="metric-sub">${fmt(p.totalJoins)} Joins gesamt</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Korrekte Antworten</span>
        <strong class="metric-value">${fmtPct(sub.correctPct)}</strong>
        <span class="metric-sub">${fmt(sub.total)} Abgaben</span>
      </article>
    </div>

    <div class="dashboard-main-grid" style="margin-bottom:16px">
      <article class="card dashboard-panel dashboard-panel--primary">
        <div class="dashboard-panel-head">
          <div>
            <p class="section-label">Verlauf</p>
            <h2>Sessions pro Tag</h2>
          </div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:1px;padding:8px 0;overflow:hidden;min-height:50px">
          ${dayBars}
        </div>
      </article>

      <aside class="dashboard-side-column">
        <article class="card dashboard-panel dashboard-panel--secondary">
          <div class="dashboard-panel-head dashboard-panel-head--stacked">
            <div><p class="section-label">Inhalte</p><h2>Beliebteste Modi</h2></div>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <tbody>${modeRows}</tbody>
          </table>
        </article>

        <article class="card dashboard-panel dashboard-panel--secondary">
          <div class="dashboard-panel-head dashboard-panel-head--stacked">
            <div><p class="section-label">Lifecycle</p><h2>Session-Status</h2></div>
          </div>
          <table class="users-table" style="font-size:0.83rem">
            <tbody>
              <tr><td>Lobby (offen)</td><td style="text-align:right">${fmt(byStatus['lobby'] || 0)}</td></tr>
              <tr><td>Laufend</td><td style="text-align:right">${fmt(byStatus['running'] || 0)}</td></tr>
              <tr><td>Pausiert</td><td style="text-align:right">${fmt(byStatus['paused'] || 0)}</td></tr>
              <tr><td>Abgeschlossen</td><td style="text-align:right">${fmt(byStatus['finished'] || 0)}</td></tr>
              <tr><td>Abgebrochen</td><td style="text-align:right">${fmt(byStatus['aborted'] || 0)}</td></tr>
            </tbody>
          </table>
        </article>
      </aside>
    </div>

    <div class="dashboard-grid" style="grid-template-columns:1fr 1fr">
      <article class="card dashboard-panel dashboard-panel--secondary">
        <div class="dashboard-panel-head dashboard-panel-head--stacked">
          <div><p class="section-label">Teilnehmer</p><h2>Verbindungen</h2></div>
        </div>
        <table class="users-table" style="font-size:0.83rem">
          <tbody>
            <tr><td>Gesamt-Joins</td><td style="text-align:right">${fmt(p.totalJoins)}</td></tr>
            <tr><td>Reconnects</td><td style="text-align:right">${fmt(p.reconnects)}</td></tr>
            <tr><td>Reconnect-Quote</td><td style="text-align:right">${fmtPct(p.reconnectRate)}</td></tr>
            <tr><td>Dropped (Timeout)</td><td style="text-align:right">${fmt(p.dropped)}</td></tr>
          </tbody>
        </table>
      </article>

      <article class="card dashboard-panel dashboard-panel--secondary">
        <div class="dashboard-panel-head dashboard-panel-head--stacked">
          <div><p class="section-label">Ende</p><h2>Abschlussart</h2></div>
        </div>
        <table class="users-table" style="font-size:0.83rem">
          <tbody>
            <tr><td>Manuell beendet</td><td style="text-align:right">${fmt(byReason['manual'] || 0)}</td></tr>
            <tr><td>Alle Modi gespielt</td><td style="text-align:right">${fmt(byReason['completed'] || 0)}</td></tr>
            <tr><td>Auto-End (Inaktivität)</td><td style="text-align:right">${fmt(auto)}</td></tr>
            <tr><td>Abgebrochen</td><td style="text-align:right">${fmt(byReason['aborted'] || 0)}</td></tr>
          </tbody>
        </table>
      </article>
    </div>`
}

// ── Produkt-Kennzahlen ────────────────────────────────────────
async function loadProductMetrics() {
  const out  = document.getElementById('metrics-output')
  const days = document.getElementById('metrics-days')?.value || '30'
  if (!out) return
  out.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Lade …</div>'
  const q = encodeURIComponent(days)

  // Vier unabhängige Aggregate parallel laden; ein Fehler in einem Block
  // soll die anderen nicht verschlucken.
  async function getJson(url) {
    const r = await fetch(url)
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    return data
  }

  const [payments, teachers, customLemma, retention] = await Promise.all([
    getJson(`/admin/payments/summary?days=${q}`).catch((e) => ({ __error: e.message })),
    getJson(`/admin/classroom/teachers?days=${q}`).catch((e) => ({ __error: e.message })),
    getJson(`/admin/custom-lemma/summary?days=${q}`).catch((e) => ({ __error: e.message })),
    getJson(`/admin/stats/retention?days=${q}`).catch((e) => ({ __error: e.message })),
  ])

  out.innerHTML = [
    renderMetricsPayments(payments),
    renderMetricsRetention(retention),
    renderMetricsCustomLemma(customLemma),
    renderMetricsTeachers(teachers),
  ].join('')
}

const metricsFmt    = (n) => n == null ? '–' : Number(n).toLocaleString('de-DE')
const metricsPct    = (v) => v == null ? '–' : (v * 100).toFixed(1) + '%'
const metricsEuro   = (n) => n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

function metricsErrorCard(title, msg) {
  return `<article class="card dashboard-panel dashboard-panel--secondary" style="margin-bottom:16px">
    <div class="dashboard-panel-head dashboard-panel-head--stacked"><div><p class="section-label">Produkt</p><h2>${esc(title)}</h2></div></div>
    <div class="status error">Fehler: ${esc(msg)}</div>
  </article>`
}

// Mini-Balken-Diagramm (Tageswerte). values: [{label, value}]
function metricsBars(values, color = 'var(--primary)') {
  if (!values.length) return '<span style="color:var(--muted);font-size:0.82rem">Keine Daten</span>'
  const max = values.reduce((m, r) => Math.max(m, r.value), 0) || 1
  const w = Math.max(6, Math.floor(280 / values.length))
  return values.map((r) => {
    const h = Math.round((r.value / max) * 36)
    return `<div title="${esc(r.label)}: ${metricsFmt(r.value)}" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-end;height:40px;width:${w}px">
      <div style="width:80%;background:${color};border-radius:2px 2px 0 0;height:${h}px"></div>
    </div>`
  }).join('')
}

function renderMetricsPayments(d) {
  if (d.__error) return metricsErrorCard('Zahlungen', d.__error)
  const t = d.totals || {}
  const byProduct = d.byProduct || []
  const trend = (d.trend || []).slice(-30).map((r) => ({ label: r.day, value: r.count }))

  const productRows = byProduct.length
    ? byProduct.map((p) => `<tr>
        <td>${esc(p.product)}</td>
        <td style="text-align:right">${metricsFmt(p.count)}</td>
        <td style="text-align:right">${metricsEuro(p.revenue)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="users-empty">Keine Zahlungen im Zeitraum</td></tr>'

  return `
    <p class="section-label" style="margin:4px 0 10px">Zahlungen</p>
    <div class="dashboard-grid" style="margin-bottom:12px">
      <article class="metric-card metric-card--support">
        <span class="metric-label">Umsatz</span>
        <strong class="metric-value">${metricsEuro(t.revenue)}</strong>
        <span class="metric-sub">im Zeitraum</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Zahlungen</span>
        <strong class="metric-value">${metricsFmt(t.payments)}</strong>
        <span class="metric-sub">${metricsFmt(t.uniquePayers)} zahlende Nutzer</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Ø Wert</span>
        <strong class="metric-value">${metricsEuro(t.avgValue)}</strong>
        <span class="metric-sub">pro Zahlung</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Produkte</span>
        <strong class="metric-value">${metricsFmt(byProduct.length)}</strong>
        <span class="metric-sub">verschiedene</span>
      </article>
    </div>
    <div class="dashboard-main-grid" style="margin-bottom:20px">
      <article class="card dashboard-panel dashboard-panel--primary">
        <div class="dashboard-panel-head"><div><p class="section-label">Verlauf</p><h2>Zahlungen pro Tag</h2></div></div>
        <div style="display:flex;align-items:flex-end;gap:1px;padding:8px 0;overflow:hidden;min-height:50px">${metricsBars(trend)}</div>
      </article>
      <aside class="dashboard-side-column">
        <article class="card dashboard-panel dashboard-panel--secondary">
          <div class="dashboard-panel-head dashboard-panel-head--stacked"><div><p class="section-label">Aufschlüsselung</p><h2>Nach Produkt</h2></div></div>
          <table class="users-table" style="font-size:0.83rem">
            <thead><tr><th>Produkt</th><th style="text-align:right">Anzahl</th><th style="text-align:right">Umsatz</th></tr></thead>
            <tbody>${productRows}</tbody>
          </table>
        </article>
      </aside>
    </div>`
}

function renderMetricsRetention(d) {
  if (d.__error) return metricsErrorCard('Wiederkehr', d.__error)
  const a = d.active || {}
  const r = d.retentionDay7 || {}
  const caveat = d.caveat
    ? `<p style="color:var(--muted);font-size:0.78rem;margin:8px 2px 0">${esc(d.caveat)}</p>`
    : ''
  return `
    <p class="section-label" style="margin:4px 0 10px">Aktivität & Wiederkehr</p>
    <div class="dashboard-grid" style="margin-bottom:8px">
      <article class="metric-card metric-card--support">
        <span class="metric-label">DAU</span>
        <strong class="metric-value">${metricsFmt(a.dau)}</strong>
        <span class="metric-sub">aktiv heute</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">WAU</span>
        <strong class="metric-value">${metricsFmt(a.wau)}</strong>
        <span class="metric-sub">letzte 7 Tage</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">MAU</span>
        <strong class="metric-value">${metricsFmt(a.mau)}</strong>
        <span class="metric-sub">letzte 30 Tage</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Wiederkehr Tag 7</span>
        <strong class="metric-value">${metricsPct(r.rate)}</strong>
        <span class="metric-sub">${metricsFmt(r.returned)} von ${metricsFmt(r.cohortSize)} Konten</span>
      </article>
    </div>
    ${caveat}
    <div style="margin-bottom:20px"></div>`
}

function renderMetricsCustomLemma(d) {
  if (d.__error) return metricsErrorCard('Eigenes Lemma', d.__error)
  const t = d.totals || {}
  const byRole = d.byRole || []
  const trend = (d.trend || []).slice(-30).map((r) => ({ label: r.day, value: r.plays }))

  const roleLabelMap = { user: 'Basic', premium: 'Premium', admin: 'Admin' }
  const roleRows = byRole.length
    ? byRole.map((r) => `<tr>
        <td>${esc(roleLabelMap[r.role] || r.role)}</td>
        <td style="text-align:right">${metricsFmt(r.users)}</td>
        <td style="text-align:right">${metricsFmt(r.plays)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="users-empty">Keine Nutzung im Zeitraum</td></tr>'

  return `
    <p class="section-label" style="margin:4px 0 10px">Eigenes Lemma</p>
    <div class="dashboard-grid" style="margin-bottom:12px">
      <article class="metric-card metric-card--support">
        <span class="metric-label">Aktive Nutzer</span>
        <strong class="metric-value">${metricsFmt(t.activeUsers)}</strong>
        <span class="metric-sub">im Zeitraum</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Spiele gesamt</span>
        <strong class="metric-value">${metricsFmt(t.totalPlays)}</strong>
        <span class="metric-sub">${metricsFmt(t.dau)} aktiv heute</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Premium-Anteil</span>
        <strong class="metric-value">${metricsPct(t.premiumRate)}</strong>
        <span class="metric-sub">der aktiven Nutzer</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Premium / Basic</span>
        <strong class="metric-value">${metricsFmt(t.premiumUsers)} / ${metricsFmt(t.basicUsers)}</strong>
        <span class="metric-sub">Nutzer</span>
      </article>
    </div>
    <div class="dashboard-main-grid" style="margin-bottom:20px">
      <article class="card dashboard-panel dashboard-panel--primary">
        <div class="dashboard-panel-head"><div><p class="section-label">Verlauf</p><h2>Spiele pro Tag</h2></div></div>
        <div style="display:flex;align-items:flex-end;gap:1px;padding:8px 0;overflow:hidden;min-height:50px">${metricsBars(trend)}</div>
      </article>
      <aside class="dashboard-side-column">
        <article class="card dashboard-panel dashboard-panel--secondary">
          <div class="dashboard-panel-head dashboard-panel-head--stacked"><div><p class="section-label">Aufschlüsselung</p><h2>Nach Rolle</h2></div></div>
          <table class="users-table" style="font-size:0.83rem">
            <thead><tr><th>Rolle</th><th style="text-align:right">Nutzer</th><th style="text-align:right">Spiele</th></tr></thead>
            <tbody>${roleRows}</tbody>
          </table>
        </article>
      </aside>
    </div>`
}

function renderMetricsTeachers(d) {
  if (d.__error) return metricsErrorCard('Lehrer', d.__error)
  const h = d.histogram || {}
  const buckets = [
    ['1–5 Sessions', h['1-5'] || 0],
    ['6–20 Sessions', h['6-20'] || 0],
    ['20+ Sessions', h['20+'] || 0],
  ]
  const maxBucket = buckets.reduce((m, [, n]) => Math.max(m, n), 0) || 1
  const bucketRows = buckets.map(([label, n]) => {
    const w = Math.round((n / maxBucket) * 100)
    return `<tr>
      <td style="width:140px">${esc(label)}</td>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:8px;background:var(--border-lt);border-radius:4px">
          <div style="width:${w}%;height:8px;background:var(--primary);border-radius:4px"></div>
        </div>
        <span style="min-width:32px;text-align:right;font-size:0.82rem">${metricsFmt(n)}</span>
      </div></td>
    </tr>`
  }).join('')

  return `
    <p class="section-label" style="margin:4px 0 10px">Lehrer (Klassenraum)</p>
    <div class="dashboard-grid" style="margin-bottom:12px">
      <article class="metric-card metric-card--support">
        <span class="metric-label">Aktive Lehrer</span>
        <strong class="metric-value">${metricsFmt(d.uniqueTeachers)}</strong>
        <span class="metric-sub">mit Sessions im Zeitraum</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Sessions gesamt</span>
        <strong class="metric-value">${metricsFmt(d.totalSessions)}</strong>
        <span class="metric-sub">angelegt</span>
      </article>
      <article class="metric-card metric-card--support">
        <span class="metric-label">Ø Sessions / Lehrer</span>
        <strong class="metric-value">${d.avgSessionsPerTeacher != null ? d.avgSessionsPerTeacher : '–'}</strong>
        <span class="metric-sub">im Zeitraum</span>
      </article>
    </div>
    <article class="card dashboard-panel dashboard-panel--secondary" style="margin-bottom:8px">
      <div class="dashboard-panel-head dashboard-panel-head--stacked"><div><p class="section-label">Verteilung</p><h2>Sessions pro Lehrer</h2></div></div>
      <table style="width:100%;border-collapse:collapse"><tbody>${bucketRows}</tbody></table>
    </article>`
}

function handleDocumentChange(event) {
  const target = event.target
  if (target.id === 'calendar-csv-input') return void importCalendarCsv(event)
  if (target.id === 'backup-restore-input') return void restoreBackupFile(event)
  if (target.id === 'entry-mode-filter' || target.id === 'entry-sort' || target.id === 'entry-page-size') {
    entryTablePage = 1
    return void renderEntryTable()
  }
  if (target.id === 'stats-days') return void loadStats()
  if (target.id === 'users-bulk-action') return void updateUsersBulkState()
  if (target.id === 'users-role-filter') return void loadUsersOverview()
  if (target.id === 'users-select-all') return void toggleAllUsersSelection(target.checked)
  if (target.matches('.user-select-checkbox')) return void updateUsersBulkState()
  if (target.dataset.action === 'toggle-entry-selection') return void toggleEntrySelection(target.dataset.datum || '', target.checked)
  if (target.id === 'audit-limit' || target.id === 'audit-action' || target.id === 'audit-resource' || target.id === 'audit-status' || target.id === 'audit-from' || target.id === 'audit-to') return void loadAuditLog()
  if (target.id === 'classroom-days') return void loadClassroomStats()
  if (target.id === 'metrics-days') return void loadProductMetrics()
}

function handleDocumentInput(event) {
  const target = event.target
  if (target.id === 'entry-search') return void scheduleEntryTableRender()
  if (target.id === 'users-search') return void scheduleUsersOverviewLoad()
  if (target.id === 'audit-search') return void loadAuditLog()
  if (ENTRY_FIELD_IDS.includes(target.id)) {
    // Das Thema ist einzeilig, auch wenn Text mit Zeilenumbrüchen eingefügt wird.
    if (target.matches?.('textarea[data-einzeilig]') && /\n/.test(target.value)) {
      target.value = target.value.replace(/\s*\n\s*/g, ' ')
    }
    loescheFeldFehler(target.id)
    updateEntryDirtyState()
    updateModeIndicators()
    if (target.id === 'datum') aktualisiereDatumHinweis()
    markiereVeraltet(target.id)
  }
}

// Eingaben geändert: Das Prüfergebnis des Modus gilt noch für den alten Stand.
const ENTRY_FELD_ZU_ERGEBNIS = { w1: 'koll', w2: 'koll', w3: 'koll', p1: 'koll', p2: 'koll', p3: 'koll', wza: 'wz', wzb: 'wz', wzpos: 'wz', 'zw-lemma': 'zw', 'lf-id': 'lf' }

function markiereVeraltet(feldId) {
  const modus = ENTRY_FELD_ZU_ERGEBNIS[feldId]
  const out = modus && document.getElementById(`entry-${modus}-analysis-output`)
  if (!out?.firstElementChild || out.classList.contains('is-veraltet')) return
  // Ein laufendes „Prüft im Korpus …“ ist kein Ergebnis.
  if (out.querySelector('[data-tone="loading"]')) return
  out.classList.add('is-veraltet')
  out.insertAdjacentHTML('afterbegin', ergebnisMeldung('Eingaben geändert – das Ergebnis gilt noch für den alten Stand.'))
  sageErgebnisAn(out, 'Eingaben geändert – das Ergebnis gilt noch für den alten Stand.')
}

function handleDocumentKeydown(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return

  // Strg/⌘ + S speichert den Tag (Redakteursgewohnheit); saveTag ignoriert gesperrte Zustände.
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && String(event.key || '').toLowerCase() === 's' && currentRoute?.page === 'entry') {
    event.preventDefault()
    void saveTag()
    return
  }

  if (event.key !== 'Enter') return
  // Das Thema steht in einem mitwachsenden Feld, bleibt aber einzeilig.
  if (target.matches('textarea[data-einzeilig]')) {
    event.preventDefault()
    return
  }

  const action = target.dataset.enterAction
  if (!action) return
  event.preventDefault()

  if (action === 'login') return void doLogin()
  if (action === 'analyze-kollokation') return void analyzeKollokation()
  if (action === 'analyze-wort-zwilling') return void analyzeWortZwilling()
  if (action === 'analyze-zeitenwende') return void analyzeZeitenwende()
  if (action === 'analyze-lueckenfueller') return void analyzeLueckenfueller()
}

// Die Leiste der Tagesseite wächst mobil mit (Meldung, zwei Zeilen). Ihre echte Höhe steuert
// den Scroll-Abstand (CSS: scroll-padding-bottom), damit fokussierte Felder nie unter ihr liegen.
;(function beobachteTagLeiste() {
  const leiste = document.getElementById('tag-leiste')
  if (!leiste || typeof ResizeObserver === 'undefined') return
  const setze = () => {
    const h = Math.ceil(leiste.getBoundingClientRect().height)
    if (h > 0) document.documentElement.style.setProperty('--tag-leiste-h', `${h}px`)
    else document.documentElement.style.removeProperty('--tag-leiste-h')
  }
  new ResizeObserver(setze).observe(leiste)
  setze()
})()

document.addEventListener('click', handleDocumentClick)
document.addEventListener('change', handleDocumentChange)
document.addEventListener('input', handleDocumentInput)
document.addEventListener('keydown', handleDocumentKeydown)

// Der Debounce reicht nicht, wenn das System den Tab sofort beendet –
// beim Wegblenden daher direkt schreiben.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && entryFormDirty) persistEntryDraft()
})
window.addEventListener('pagehide', () => {
  if (entryFormDirty) persistEntryDraft()
})

// ── Zeitenwende – Wortanalyse ─────────────────────────────
async function analyzeZeitenwende() {
  const lemma = document.getElementById('zw-ana-input').value.trim()
  const out   = document.getElementById('zw-ana-output')
  if (!lemma) return
  out.innerHTML = '<div class="status loading">Analysiere …</div>'
  try {
    const res  = await fetch(`/admin/analyze-zeitenwende?q=${encodeURIComponent(lemma)}`, {})
    const data = await res.json()
    if (!res.ok) { out.innerHTML = `<div class="status error">Fehler: ${esc(data.error)}</div>`; return }
    renderZWAnalyse(data, out)
  } catch (e) { out.innerHTML = `<div class="status error">Netzwerkfehler: ${esc(e.message)}</div>` }
}

function renderZWAnalyse(data, out) {
  if (!data.preCandidates && !data.postCandidates) {
    out.innerHTML = `<div style="margin-top:12px"><span style="color:#991b1b;font-weight:700">✗ Keine Daten</span><br><span style="color:var(--muted);font-size:0.85rem">${esc(data.reason || '')}</span></div>`
    return
  }
  const badge = data.usable
    ? '<span style="color:#166534;font-weight:700">✓ Geeignet als Zeitenwende-Lemma</span>'
    : '<span style="color:#991b1b;font-weight:700">✗ Nicht geeignet (zu wenig distinkte Kollokatoren)</span>'

  let html = `<div style="margin:12px 0 16px">${badge}</div>`
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`
  for (const [title, items, bdColor] of [
    ['← Vor 2000',  data.preCandidates,  '#93c5fd'],
    ['Nach 2000 →', data.postCandidates, '#86efac'],
  ]) {
    html += `<div style="border:1.5px solid ${bdColor};border-radius:8px;padding:12px">`
    html += `<div style="font-weight:700;font-size:0.85rem;margin-bottom:8px">${esc(title)}</div>`
    if (!items?.length) { html += `<div style="color:var(--muted);font-size:0.82rem">Keine Kandidaten</div></div>`; continue }
    html += `<ol style="padding-left:16px;font-size:0.82rem;display:flex;flex-direction:column;gap:3px">`
    for (const it of items) {
      const score = it.distPre > 0 ? it.distPre : it.distPost
      html += `<li>${esc(it.wort)} <span style="color:var(--muted);font-size:0.78em">Δ${score}</span></li>`
    }
    html += `</ol></div>`
  }
  html += `</div>`

  if (data.words) {
    html += `<div style="margin-top:14px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:0.82rem">`
    html += `<strong>Spielauswahl (${data.words.length} Wörter):</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">`
    for (const w of data.words) {
      const bg  = w.periode === 'pre' ? '#dbeafe' : '#dcfce7'
      const bdr = w.periode === 'pre' ? '#3b82f6' : '#22c55e'
      html += `<span style="background:${bg};border:1px solid ${bdr};border-radius:4px;padding:2px 8px;font-size:0.82rem">${esc(w.wort)}</span>`
    }
    html += `</div></div>`
  }
  out.innerHTML = html
}
