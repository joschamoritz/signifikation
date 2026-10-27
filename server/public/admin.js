// ── CSRF-Header für State-Changing-Requests ───────────────
// Das Backend (server/middleware/auth.js) verlangt für POST/PUT/DELETE/PATCH
// den Header X-Requested-With: signifikation-app. Cross-Origin-Scripts können
// diesen Custom-Header ohne CORS-Preflight nicht setzen → echter CSRF-Schutz.
// Zusätzlich verlangt csrfProtect für POST/PUT/DELETE Content-Type: application/json (auch ohne Body); der Wrapper
// ergänzt ihn, wo er fehlt (server/__tests__/admin.users.csrf.test.js führt genau diesen Code aus).
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
      // csrfProtect lehnt POST/PUT/DELETE ohne Content-Type: application/json mit 403 ab – auch ein DELETE ohne Body.
      // Ohne Body oder mit Text-Body (JSON.stringify) also vorgeben; FormData/Blob behalten ihren eigenen Typ.
      if (!headers.has('Content-Type') && (next.body === undefined || next.body === null || typeof next.body === 'string')) {
        headers.set('Content-Type', 'application/json')
      }
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
// Nur der im Tagesformular geladene Tag (Speichern, Löschen, Datumshinweis, Entwurf).
// Den Monat steuern monatAnsicht und monatGewaehlt (Planen › Monat).
let selectedCalendarDate = ''
// Planen › Monat: angezeigter Monat ('JJJJ-MM'), gewählter Tag (ISO oder leer), Titel als Live-Region aktiv?
let monatAnsicht = ''
let monatGewaehlt = ''
let monatLiveAktiv = false
// Nutzer (#nutzer) und Konto (#nutzer/<id>): Die Liste bleibt beim Wechsel ins Konto und zurück im Speicher.
let nutzerListe = []            // geladene Zeilen {id,name,email,emailVerified,role,createdAt,gekauft}, Server-Reihenfolge
let nutzerGefiltert = 0         // Treffer des angewandten Filters (page.filtered)
let nutzerHatMehr = false       // page.hasMore
let nutzerSummary = null        // data.summary (total, premium, newLast30Days …)
let nutzerZustand = 'laden'     // 'laden' | 'fehler' | 'ok'
let nutzerFehlerText = ''
let nutzerMehrLaedt = false     // „Weitere laden“ läuft
let nutzerFilterLaedt = false   // ein Abruf für einen neuen Filter (Suche, Rolle, „neu laden“) ist unterwegs
let nutzerBeschaeftigt = false  // Sammelaktion (Rolle, Löschen) läuft
let nutzerFilterAktiv = { q: '', role: '' }  // Filter, zu dem nutzerListe gehört (nicht der noch ungesendete Eingabestand)
const gewaehlteNutzer = new Set()
const NUTZER_MAX_SAMMEL = 200   // = validate.js adminUsersBulkUpdateSchema
let kontoAktuell = null         // letzte Antwort von GET /admin/users/:id
let kontoAbort = null           // AbortController des Konto-Abrufs
let kontoBeschaeftigt = false   // Rolle speichern / löschen läuft
let dashboardWeekOffset = 0
let selectedDashboardDate = ''
const selectedEntryDates = new Set()
let sessionRefreshTimer = null
let usersSearchTimer = null
let entrySearchTimer = null
let usersOverviewAbortController = null
const USERS_PAGE_SIZE = 50
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

// Reiter auf Unterseiten (route.tabs): Werkzeuge › Social Cards. Der Reiter „Selbst gestalten“ führt zum letzten Zustand (reiterMerker).
const SUB_TABS = {
  social: [
    { key: 'social', label: 'Entwürfe', hash: '#werkzeuge/social-cards' },
    { key: 'social-editor', label: 'Selbst gestalten', hash: '#werkzeuge/social-cards/gestalten' },
  ],
}
const SUB_TABS_LABEL = { social: 'Social Cards' }

const PARENT_PLANEN = { hash: '#planen', label: 'Planen', area: 'planen' }
const PARENT_WERKZEUGE = { hash: '#werkzeuge', label: 'Werkzeuge', area: 'werkzeuge' }
const PARENT_NUTZER = { hash: '#nutzer', label: 'Nutzer', area: 'nutzer' }
// better-auth-IDs: Buchstaben, Ziffern, '-' (32–61 Zeichen); '_' vorsorglich mit erlaubt.
const NUTZER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
// Links im Tag-Editor: wie LINK_HTTP in server/middleware/validate.js
const LINK_HTTP = /^https?:\/\/\S+$/i
const kontoHash = (id) => `#nutzer/${encodeURIComponent(id)}`

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
  'werkzeuge/sicherung': { page: 'sicherung', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/kursmaterial': { page: 'kursmaterial', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/protokoll': { page: 'protokoll', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/klassenraum-demo': { page: 'klassenraum-demo', area: 'werkzeuge', parent: PARENT_WERKZEUGE },
  'werkzeuge/social-cards': { page: 'social', area: 'werkzeuge', parent: PARENT_WERKZEUGE, tabs: 'social' },
  'werkzeuge/social-cards/gestalten': { page: 'social-editor', area: 'werkzeuge', parent: PARENT_WERKZEUGE, tabs: 'social' },
}

// Werkzeuge › System hatte vier Abschnitte: #werkzeuge/system?abschnitt=sicherung|kursmaterial|protokoll
const ALTE_SYSTEM_ABSCHNITTE = Object.freeze({
  sicherung: '#werkzeuge/sicherung',
  kursmaterial: '#werkzeuge/kursmaterial',
  protokoll: '#werkzeuge/protokoll',
})

// Alte Adressen (#dashboard, #calendar … aus Lesezeichen und früheren Versionen) → aktuelle Adressen (parseRoute).
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
let verlassenErlaubt = false   // Die Rückfrage beim Verlassen ist bejaht: Der nächste Wechsel fragt nicht noch einmal
let verlassenTimer = null
// Elternadresse → Link, über den man die Unterseite betreten hat (Fokus bei Rückkehr).
const focusMemory = new Map()
// Einmaliges Fokusziel für die nächste Navigation (CSS-Selektor), z. B. „In der Woche zeigen“ → gewählter Tag.
let naechsterFokus = ''
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

// Zustand der Liste (Planen › Liste) in der Adresse: #planen/liste?q=…&zeit=…&stand=…&seite=…&pro=…
// Nur Bekanntes kommt durch (Weißliste je Parameter), alles andere fällt auf den Standard zurück.
const LISTE_STANDARD = Object.freeze({ q: '', zeit: 'kommend', stand: 'alle', seite: 1, pro: 25 })
const LISTE_ZEITEN = ['kommend', 'vergangen', 'alle']
const LISTE_STAENDE = ['alle', 'unvollstaendig', 'vollstaendig', 'ohne-wortzwilling', 'ohne-zeitenwende', 'ohne-lueckenfueller']
const LISTE_GROESSEN = [25, 50, 100]

// Selbst gestalten: #werkzeuge/social-cards/gestalten?datum=2026-10-27&vorlage=B. Nur Gültiges kommt durch (Weißliste);
// fehlt ein Wert, behält die Seite ihren Zustand (beim ersten Öffnen: morgen, Rätsel).
const SOCIAL_VORLAGEN = ['A', 'B', 'C', 'X', 'T']
function leseSocialQuery(query) {
  const p = new URLSearchParams(query)
  return {
    datum: isValidIsoDay(p.get('datum')) ? p.get('datum') : '',
    vorlage: SOCIAL_VORLAGEN.includes(p.get('vorlage')) ? p.get('vorlage') : '',
  }
}

function leseListeQuery(query) {
  const p = new URLSearchParams(query)
  const zahl = (v) => (/^\d{1,4}$/.test(v || '') ? Number(v) : 0)
  return {
    q: (p.get('q') || '').slice(0, 100),
    zeit: LISTE_ZEITEN.includes(p.get('zeit')) ? p.get('zeit') : LISTE_STANDARD.zeit,
    stand: LISTE_STAENDE.includes(p.get('stand')) ? p.get('stand') : LISTE_STANDARD.stand,
    seite: zahl(p.get('seite')) || 1,
    pro: LISTE_GROESSEN.includes(zahl(p.get('pro'))) ? zahl(p.get('pro')) : LISTE_STANDARD.pro,
  }
}

function listeHash(z) {
  const p = new URLSearchParams()
  if (z.q) p.set('q', z.q)
  for (const k of ['zeit', 'stand', 'seite', 'pro']) if (z[k] !== LISTE_STANDARD[k]) p.set(k, String(z[k]))
  const s = p.toString()
  return s ? `#planen/liste?${s}` : '#planen/liste'
}

// Letzte Adresse je Reiter: Der Reiter führt dorthin zurück (nur für diese Sitzung).
const reiterMerker = { monat: '#planen/monat', liste: '#planen/liste', 'social-editor': '#werkzeuge/social-cards/gestalten' }
// Seite der Route → Schlüssel in reiterMerker
const MERKER_SEITEN = { monat: 'calendar', liste: 'liste' }

// Zustand der Seite in die Adresse schreiben: ohne Verlaufseintrag, ohne hashchange, ohne Neurendern.
// Nur auf der eigenen Seite (loadKalender rendert Monat und Liste auch im Hintergrund).
function merkeAnsicht(key, hash) {
  if (currentRoute?.page !== MERKER_SEITEN[key]) return
  reiterMerker[key] = hash
  if (hash !== currentRouteHash) replaceRouteHashSilently(hash)
  document.querySelector('#page-tabs a[aria-current="page"]')?.setAttribute('href', hash)
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

  // Monat mit Zustand: #planen/monat/2026-11 (Monat) oder #planen/monat/2026-11-13 (Monat + gewählter Tag)
  const monatMatch = /^planen\/monat\/(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(path)
  if (monatMatch) {
    const [, y, m, d] = monatMatch
    const tag = d ? `${y}-${m}-${d}` : ''
    const ok = Number(m) >= 1 && Number(m) <= 12 && Number(y) >= 2000 && Number(y) <= 2100 && (!tag || isValidIsoDay(tag))
    if (!ok) return { redirect: '#planen/monat' }
    return { ...ROUTE_TABLE['planen/monat'], key: 'planen/monat', monat: `${y}-${m}`, tag }
  }
  if (path.startsWith('planen/monat/')) return { redirect: '#planen/monat' }

  // Konto: #nutzer/<id>. Nur die interne ID steht in der Adresse (kein Name, keine E-Mail, kein Suchtext);
  // nutzer/x/y leitet die Regel „unbekannte Unterroute → Start des Bereichs“ unten auf #nutzer um.
  const kontoMatch = /^nutzer\/([^/]+)$/.exec(path)
  if (kontoMatch) {
    let id = ''
    try { id = decodeURIComponent(kontoMatch[1]) } catch { /* kaputte Kodierung → Liste */ }
    if (!NUTZER_ID_RE.test(id)) return { redirect: '#nutzer' }
    return { page: 'user', area: 'nutzer', parent: PARENT_NUTZER, nutzerId: id, key: 'nutzer/konto' }
  }

  // Früher lagen Zustand, Sicherung, Kursmaterial und Protokoll auf einer Seite (#werkzeuge/system?abschnitt=…).
  // Alte Lesezeichen und Links führen auf die jeweilige Unterseite; Unbekanntes landet beim Systemzustand.
  if (path === 'werkzeuge/system' && queryPart) {
    const ziel = ALTE_SYSTEM_ABSCHNITTE[new URLSearchParams(queryPart).get('abschnitt')] || '#werkzeuge/system'
    return { redirect: ziel }
  }

  // Object.hasOwn: sonst würden #constructor oder #__proto__ Prototyp-Einträge treffen.
  if (Object.hasOwn(ROUTE_TABLE, path)) {
    const route = { ...ROUTE_TABLE[path], key: path }
    if (path === 'planen/liste') route.liste = leseListeQuery(queryPart)
    if (path === 'werkzeuge/social-cards/gestalten') route.social = leseSocialQuery(queryPart)
    // Auswertung: ein Zeitraum für alle drei Reiter (Weißliste, sonst 30 Tage)
    if (route.area === 'auswertung') route.zeitraum = leseAuswertungZeitraum(queryPart)
    return route
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
  if (route.page === 'users') {
    return '<button type="button" class="adm-link" data-action="load-users-overview">neu laden</button>'
  }
  if (route.area === 'auswertung') {
    return '<button type="button" class="adm-link" data-action="au-neu-laden">neu laden</button>'
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
  // Der Zeitraum aus der Adresse gilt für alle drei Reiter: Auswahl, CSV-Link und Reiter-Links ziehen nach
  if (route.area === 'auswertung') synchronisiereAuswertungZeitraum(route.zeitraum ?? AU_STANDARD)
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
    // Unterseiten mit eigenen Reitern (route.tabs, z. B. Social Cards) zeigen sie trotz Rückleiste
    const tabs = route.tabs ? SUB_TABS[route.tabs] : AREA_TABS[route.area]
    const showTabs = !!tabs && (!route.parent || !!route.tabs)
    const aktiv = route.tabs ? route.page : route.tab
    tabsEl.classList.toggle('is-hidden', !showTabs)
    tabsEl.setAttribute('aria-label', `Ansichten: ${route.tabs ? SUB_TABS_LABEL[route.tabs] : areaLabel}`)
    tabsEl.innerHTML = showTabs
      // Der aktive Reiter führt zur aktuellen Adresse (auch bei Direktaufruf von #planen/monat/2026-12), die anderen zu ihrer letzten.
      ? tabs.map((tab) => `<a class="adm-tab" href="${esc((tab.key === aktiv ? currentRouteHash : reiterMerker[tab.key]) || tab.hash)}"${tab.key === aktiv ? ' aria-current="page"' : ''}>${esc(tab.label)}</a>`).join('')
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

// Daten je Route laden.
function runRouteLoaders(route) {
  switch (route.page) {
    case 'users':
      // Beim ersten Öffnen laden; danach bleibt die Liste samt Filtern stehen. Gezeichnet wird immer neu:
      // Im Konto geänderte Rollen sind im Speicher schon nachgeführt, die Zeilen sollen sie zeigen.
      if (!usersLoaded) loadUsersOverview()
      else renderNutzerListe()
      break
    case 'user':
      // Das Konto wird bei jedem Öffnen frisch gelesen (Kauf, Rolle und Aktivität ändern sich außerhalb).
      ladeKonto(route.nutzerId)
      break
    case 'stats':
    case 'metrics':
    case 'classroom':
      // Zeichnet aus dem Zwischenspeicher (60 s) oder lädt neu; „neu laden“ im Kopf umgeht ihn
      void ladeAuswertung(route.page)
      break
    case 'werkzeuge':
      // Füllt den Stand der Werkzeuge (Betrieb aus /admin/health, Bonus-Tage aus freeDaysData)
      renderInhalteStand()
      loadHealth()
      break
    case 'system':
      ladeSystemzustand()
      break
    case 'sicherung':
      ladeSicherung()
      break
    case 'kursmaterial':
      ladeKursmaterial()
      break
    case 'protokoll':
      // Jedes Öffnen beginnt mit der ersten Seite und zugeklappten Einträgen
      protokollLimit = PROTOKOLL_SEITE
      protokollOffen.clear()
      loadAuditLog()
      break
    case 'freedays':
      // Liste sofort aus dem Speicher, dann frisch nachziehen
      oeffneBonusSeite()
      break
    case 'vorschlaege':
      loadVorschlaege()
      break
    case 'spezialwoche':
      void ladeWortDerWoche()
      break
    case 'push':
      void ladePush()
      break
    case 'klassenraum-demo':
      void ladeDemo()
      break
    case 'social':
      // Beim ersten Öffnen laden, danach aus dem Speicher; „neu laden“ holt frisch
      void ladeSocialEntwuerfe()
      break
    case 'social-editor':
      void oeffneSocialEditor(route)
      break
    case 'liste':
      // Ein noch laufender Such-Timer würde den Zustand aus der Adresse (Zurück/Vor) überschreiben.
      if (entrySearchTimer) {
        window.clearTimeout(entrySearchTimer)
        entrySearchTimer = null
      }
      listeZustand = { ...route.liste }
      reiterMerker.liste = currentRouteHash
      renderListe({ felderErzwingen: true })
      break
    case 'calendar':
      zeigeMonatAusRoute(route)
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
    // Ein bereits angefangener neuer Tag bleibt erhalten; ein geladener
    // bestehender Tag wird dagegen geleert, sonst würde „Neuer Tag“
    // versehentlich diesen Tag überschreiben.
    // Ohne Snapshot (erster Besuch) gäbe es keine Dirty-Erkennung – dann einmal
    // initialisieren. keepDraft: ein gespeicherter Entwurf bleibt zur Wiederherstellung.
    if (entryFormMode !== 'new' || !entryFormSnapshot) {
      // Der Formularinhalt gehört jetzt „Neuer Tag“; dessen Entwurf wird angeboten.
      entryDraftBasis = 'neu'
      prefillDate(getTodayIso(), { keepDraft: true })
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
    prefillDate(route.date, { keepDraft: true })
    setEntryHead('neu', route.date)
    offerEntryDraft()
    return
  }
  if (result.state === 'error') {
    prefillDate(route.date, { keepDraft: true })
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
  try {
    window.history.replaceState({ ...base, admIdx: currentIdx }, '', hash)
  } catch {
    // Safari wirft bei mehr als 100 Aufrufen in 30 s (SecurityError): Die Adresse bleibt dann stehen, die Seite funktioniert weiter.
  }
  routeHashByIdx.set(currentIdx, hash)
}

// Fokus nach einer vom Nutzer ausgelösten Navigation: Zielabschnitt, der Link,
// über den man von der Unterseite zurückkehrt, sonst die Seitenüberschrift.
function focusAfterNavigation(route, hash, { fromChild }) {
  const titleEl = document.getElementById('page-title')
  let target = null
  let preventScroll = true
  const gewuenscht = naechsterFokus
  naechsterFokus = ''

  if (gewuenscht && (route.page === 'dashboard' || route.page === 'users')) {
    target = document.querySelector(gewuenscht)
    preventScroll = false
  } else if (fromChild) {
    const href = focusMemory.get(hash)
    if (href) {
      // Nur auf der sichtbaren Seite suchen: Woche und Liste führen dieselben Tag-Links, versteckt davor im Dokument.
      target = Array.from(document.querySelectorAll('#adm-main .admin-page.is-active a[href]')).find((a) => a.getAttribute('href') === href) || null
      preventScroll = false
    }
    // Kein gemerkter Link mehr da (z. B. Tag gelöscht): im Monat auf den Tag, von dem man kam.
    if (!target && route.page === 'calendar' && route.tag) {
      target = document.querySelector(`.mo-tag[data-value="${CSS.escape(route.tag)}"]`)
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
  // Auswertung: Ein ungültiger oder überflüssiger ?zeitraum= (14, 30, abc) wird auf den tatsächlich gewählten Wert
  // bereinigt, damit Adresse, Auswahl und Reiter-Links dasselbe sagen (stampHistory schreibt ohne neuen Eintrag).
  if (route?.area === 'auswertung' && AU_REITER[route.page]) {
    hash = auswertungHash(AU_REITER[route.page], route.zeitraum ?? AU_STANDARD)
  }

  const token = ++routeRenderToken
  const leavingRoute = currentRoute
  const vorherHash = currentRouteHash
  currentRouteHash = hash
  currentRoute = route
  // Jede Adressänderung beendet eine offene Rückfrage als „Abbrechen“ (sie gehörte zur alten Adresse, auch bei
  // gleicher Seite: anderer Tag, anderes Konto). Ausgenommen die Frage des Routers selbst, die gerade eine
  // Adressänderung verhandelt. Den Fokus setzt die neue Seite.
  if (vorherHash !== hash && bestaetigeLauf && !bestaetigeLauf.vomRouter) bestaetigeLauf.beende(false, { fokus: false })
  // Weiterleitungen und Index in einem Schritt in den Verlauf schreiben (ohne neuen Eintrag).
  stampHistory(hash)

  applyRouteChrome(route)

  // Beim Verlassen: Kursmaterial fragt nicht weiter ab; die gewählte Sicherungsdatei (bis 10 MB) wird freigegeben.
  if (leavingRoute?.page === 'kursmaterial' && route.page !== 'kursmaterial') stoppeKursAbfrage()
  if (leavingRoute?.page === 'sicherung' && route.page !== 'sicherung') restoreAbbrechenStill()
  // Die Zeichenfläche der Karten-Gestaltung (5,8–8,3 MB) wird beim Verlassen freigegeben
  if (leavingRoute?.page === 'social-editor' && route.page !== 'social-editor') socialEditorVerlassen()
  // Ein offener Bestätigungsdialog (An alle senden, Bonus-Tag ersetzen) gehört zu seiner Seite und schließt mit ihr.
  if (leavingRoute && leavingRoute.page !== route.page) document.querySelectorAll('dialog.in-dialog[open]:not(#bestaetige-dialog)').forEach((d) => d.close())

  if (userInitiated && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0)
  }
  // Rückkehr aus einer Unterseite desselben Bereichs (auch an eine Stelle wie #planen/monat/2026-11-13)
  const fromChild = !!leavingRoute?.parent && leavingRoute.parent.area === route.area
  if (route.page === 'entry') {
    if (userInitiated) focusAfterNavigation(route, hash, { fromChild })
    await renderEntryRoute(route, token)
  } else {
    // Beim Betreten der Liste von einer anderen Route beginnt die Auswahl neu: Unsichtbare Auswahl soll nicht mitlöschen.
    if (route.page === 'liste' && leavingRoute?.page !== 'liste') selectedEntryDates.clear()
    // Erst füllen, dann fokussieren: Monat und Liste ersetzen ihre Elemente beim Rendern.
    runRouteLoaders(route)
    if (userInitiated) focusAfterNavigation(route, hash, { fromChild })
  }
}

// Entwurfsschutz am Formular: nachfragen, wenn ungespeicherte Änderungen verloren
// gehen würden – beim Verlassen der Tagesseite UND beim Öffnen eines anderen Tages
// (auch aus Monat/Liste, wo das Formular im Hintergrund noch den Entwurf hält).
// Der Browser-eigene Schutz beim Schließen/Neuladen des Tabs fehlt bewusst
// (kein beforeunload); dort greift nur das Zwischenspeichern des Entwurfs.
// Die Rückfrage ist ein Dialog und damit asynchron: Der Router setzt die Adresse zurück, fragt und
// navigiert erst bei „Ja“ (handleHashChange, navigate).
// Liefert die nötige Rückfrage vor dem Wechsel zu nextHash, null wenn nichts verloren ginge.
function verlassenFrage(nextHash) {
  if (!entryFormDirty) return null
  const leaving = isEntryRouteHash(currentRouteHash)
  const entering = isEntryRouteHash(nextHash)
  // „Neuer Tag“ behält ein angefangenes neues Formular – nichts geht verloren.
  if (nextHash === '#planen/tag/neu' && entryFormMode === 'new') return null
  if (!leaving && !entering) return null
  return entering
    ? { wort: 'verwerfen', aktion: 'Verwerfen', verwirft: true }
    : { wort: 'die Seite verlassen', aktion: 'Verlassen', verwirft: false }
}

async function bestaetigeVerlassen(frage) {
  const ok = await bestaetige({ frage: `Es gibt ungespeicherte Änderungen. Wirklich ${frage.wort}?`, aktion: frage.aktion, vomRouter: true })
  // Bewusst verworfen: den gespeicherten Entwurf nicht beim nächsten Start anbieten.
  if (ok && frage.verwirft) clearEntryDraft()
  return ok
}

// Bei „Ja“ nach einer zurückgesetzten Adresse: den Wechsel nachholen, ohne noch einmal zu fragen.
// delta ≠ 0: Zurück/Vor-Sprung (genau diesen Schritt im Verlauf), sonst ein neuer Eintrag für die Zieladresse.
async function frageVerlassen(frage, ziel, delta) {
  if (!(await bestaetigeVerlassen(frage))) return
  verlassenErlaubt = true
  if (verlassenTimer) window.clearTimeout(verlassenTimer)
  // Sicherheitsnetz: kommt kein hashchange, die Erlaubnis nicht hängen lassen.
  verlassenTimer = window.setTimeout(() => { verlassenErlaubt = false }, 1000)
  if (delta) window.history.go(delta)
  else window.location.hash = ziel
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

  const frage = verlassenErlaubt ? null : verlassenFrage(window.location.hash)
  verlassenErlaubt = false
  if (frage) {
    // Zuerst genau diesen Schritt rückgängig machen (ohne zu rendern), dann fragen: Die Seite bleibt, wie sie ist.
    // Bei „Ja“ holt frageVerlassen den Schritt nach; bei „Abbrechen“ ist nichts mehr zu tun.
    const ziel = window.location.hash
    const delta = isTraversal ? stateIdx - currentIdx : 0
    suppressNextHashChange()
    if (isTraversal) window.history.go(currentIdx - stateIdx)
    else window.history.back()
    void frageVerlassen(frage, ziel, delta)
    return
  }
  // Ohne eigene Rückfrage geht es weiter: Eine noch offene (auch die des Routers zu einem früheren Schritt) ist überholt.
  bestaetigeLauf?.beende(false, { fokus: false })
  currentIdx = isTraversal ? stateIdx : currentIdx + 1
  void renderRoute({ userInitiated: true })
}

// Programmatische Navigation. Bei gleicher Adresse feuert 'hashchange' nicht –
// dann wird direkt neu gerendert (z. B. zweimal derselbe Tag).
function navigate(hash) {
  const target = String(hash || '').startsWith('#') ? String(hash) : `#${hash}`
  if (target !== window.location.hash) {
    // Erst fragen, dann die Adresse setzen: So entsteht bei „Abbrechen“ kein Verlaufseintrag (handleHashChange fängt
    // nur noch Zurück/Vor-Sprünge ab).
    const frage = routerActive ? verlassenFrage(target) : null
    if (frage) void frageVerlassen(frage, target, 0)
    else window.location.hash = target
    return
  }
  if (!routerActive) return
  const frage = verlassenFrage(target)
  if (!frage) {
    void renderRoute({ userInitiated: true })
    return
  }
  void bestaetigeVerlassen(frage).then((ok) => { if (ok) void renderRoute({ userInitiated: true }) })
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
  // Unter der Adresse, an der man gerade steht (z. B. #planen/monat/2026-11-13): Dorthin führt der Rückweg.
  if (targetRoute?.parent) focusMemory.set(window.location.hash, target)
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
  // Eine offene Rückfrage gehört zur beendeten Sitzung (sonst bliebe sie über dem Anmeldebild stehen).
  bestaetigeLauf?.beende(false, { fokus: false })
}

window.addEventListener('hashchange', handleHashChange)

// Zuletzt angeklickter Knopf oder Link (für den Fokus nach einer Rückfrage, wenn der Browser ihn beim Klick nicht
// fokussiert, z. B. Safari). Als erster Klick-Listener der Seite in der Capture-Phase: Er muss vor allen anderen laufen,
// die synchron eine Rückfrage öffnen könnten (fangeVerlassenLink).
let letzterKlick = null     // { el, t }
document.addEventListener('click', (ev) => {
  const el = ev.target instanceof Element ? ev.target.closest('button, a[href], summary, [role="button"]') : null
  letzterKlick = el instanceof HTMLElement ? { el, t: performance.now() } : null
}, true)

// Hash-Link bei ungespeicherten Änderungen: erst fragen, dann navigieren. Der Browser legt so gar nicht erst einen
// Verlaufseintrag an, den der Router bei „Abbrechen“ wieder zurücknehmen müsste (sonst bliebe ein Vorwärts-Eintrag).
// Ohne Rückfrage-Bedarf läuft der Link wie gewohnt (Rechtsklick, Strg+Klick und Tastatur bleiben Sache des Browsers).
function fangeVerlassenLink(event) {
  const link = event.target.closest?.('a[href^="#"]')
  if (!link || link.dataset.action) return
  if (!routerActive || event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = link.getAttribute('href')
  if (target === window.location.hash || !verlassenFrage(target)) return
  if (parseRoute(target)?.parent) focusMemory.set(window.location.hash, target)
  event.preventDefault()
  navigate(target)
}
document.addEventListener('click', fangeVerlassenLink, true)
// Die Reiterleiste scrollt waagerecht, wenn sie nicht passt (375 px, große Schrift): Ein per Tastatur erreichter Reiter
// außerhalb des sichtbaren Teils wird ins Bild geholt (der Browser tut das hier nicht von selbst).
document.addEventListener('focusin', (ev) => {
  ev.target.closest?.('#page-tabs .adm-tab')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

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
// ersatzlos verloren – eine Rückfrage im Dialog greift dabei nicht.
// Ein Schlüssel je Tag („…:2026-11-10“, „…:neu“): Der Entwurf eines Tages
// erscheint nur auf dessen Seite und überschreibt nie den eines anderen.
const ENTRY_DRAFT_PREFIX = 'sig-admin-entry-draft:'
const ENTRY_DRAFT_LEGACY_KEY = 'sig-admin-entry-draft'   // früherer Sammelschlüssel für alles: wird beim ersten Laden auf den Tag umgezogen
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

async function restoreEntryDraft() {
  const draft = readStoredEntryDraft()
  if (!draft) {
    hideEntryDraftBanner()
    return
  }
  // Seit dem Öffnen Getipptes würde durch den Entwurf ersetzt: vorher fragen.
  if (entryFormDirty && !(await bestaetige({ frage: 'Es gibt ungespeicherte Änderungen im Formular. Wirklich wiederherstellen?', text: 'Der Entwurf ersetzt sie.', aktion: 'Wiederherstellen' }))) return
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

// Der Knopf steht neben „Speichern“: ein Fehltipp würde sonst alle Eingaben verwerfen.
async function resetEntryForm() {
  if (!(await bestaetige({ frage: 'Ungespeicherte Änderungen verwerfen?', text: 'Der zuletzt gespeicherte Stand kommt zurück.', aktion: 'Verwerfen' }))) return
  restoreEntryFormSnapshot()
  // Der Knopf verschwindet (disabled → ausgeblendet); der Fokus geht zum Stand.
  document.getElementById('entry-dirty-indicator')?.focus()
}

function restoreEntryFormSnapshot() {
  if (!entryFormSnapshot) return
  applyEntryFields(entryFormSnapshot)
  setEntryDirtyState(false)
  clearEntryDraft()
  aktualisiereDatumHinweis()
}

// Bonus-Tag zu einem Datum: { label, bonus } oder null
function getFreeDayInfo(iso) {
  if (!iso) return null
  const explicit = freeDaysData.find((item) => item?.date === iso)
  if (!explicit) return null
  return { label: explicit.label || '', bonus: Number(explicit.bonus_count) || 0 }
}

function isFreeAccessDay(iso) {
  return !!getFreeDayInfo(iso)
}

// ── Rückfrage (ersetzt window.confirm) ────────────────────
// Ein gemeinsamer <dialog> (#bestaetige-dialog, showModal). await bestaetige({ frage, text, details, aktion, gefahr })
// liefert true (Aktion gewählt) oder false. frage = Titel (kurz), text = Absatz darunter, details = Zeilen als Liste,
// aktion = Beschriftung des zweiten Knopfs („Löschen“ …); gefahr (Standard: ja) setzt ihn im Stil von
// .li-loeschen mit rotem Oberrand, sonst als Text-CTA ohne roten Rand. Esc, „Abbrechen“ (Fokus beim Öffnen),
// ein Adresswechsel und das Abmelden ergeben false; der Fokus kehrt zum Auslöser zurück (bei Adresswechsel und
// Abmelden nicht: Dort setzt die neue Seite den Fokus). Inhalte gehen nur per textContent hinein.
// Eine neue Frage ersetzt eine offene (die alte gilt als abgelehnt). Ein Mausklick auf die Aktion in den ersten
// BESTAETIGE_SPERRE_MS zählt nicht: Sonst träfe der zweite Klick eines Doppelklicks auf den Auslöser den Knopf des
// frisch geöffneten Dialogs. Die Tastatur (Enter, Leertaste) wirkt sofort: Der Fokus steht auf „Abbrechen“.
const BESTAETIGE_SPERRE_MS = 400
const BESTAETIGE_KLICK_MS = 1500   // so lange gilt der zuletzt angeklickte Knopf als Auslöser, wenn der Browser ihn nicht fokussiert hat (Safari)
let bestaetigeLauf = null   // die offene Frage: { ziel, seit, vomRouter, loese(), beende(ergebnis, { fokus }) }

// Der Auslöser wird mit Schlüssel (id bzw. Tag + data-*) gemerkt: Zeichnet die Seite ihre Knöpfe neu, ist das
// ursprüngliche Element weg, der gleiche Knopf aber da.
function merkeFokusZiel(el) {
  if (!(el instanceof HTMLElement) || el === document.body) return null
  return { el, id: el.id, tag: el.tagName.toLowerCase(), data: { ...el.dataset } }
}

function findeFokusZiel(ziel) {
  if (!ziel) return null
  if (ziel.el.isConnected) return ziel.el
  if (ziel.id) {
    const nachId = document.getElementById(ziel.id)
    if (nachId) return nachId
  }
  const schluessel = Object.keys(ziel.data)
  if (!schluessel.length) return null
  const sel = ziel.data.action !== undefined ? `${ziel.tag}[data-action]` : ziel.tag
  return [...document.querySelectorAll(sel)].find((e) => (
    Object.keys(e.dataset).length === schluessel.length && schluessel.every((k) => e.dataset[k] === ziel.data[k])
  )) || null
}

// Fokus zurück an den Auslöser; fehlt er (oder ist unsichtbar), auf die Seitenüberschrift.
function stelleFokusWieder(ziel) {
  for (const kandidat of [findeFokusZiel(ziel), document.getElementById('page-title')]) {
    if (!(kandidat instanceof HTMLElement)) continue
    kandidat.focus({ preventScroll: true })
    if (document.activeElement === kandidat) return
  }
}

function bestaetige({ frage, text = '', details = [], aktion, gefahr = true, vomRouter = false }) {
  const dlg = document.getElementById('bestaetige-dialog')
  if (!dlg) return Promise.resolve(false)
  const alt = bestaetigeLauf
  bestaetigeLauf = null
  alt?.loese(false)
  const aktiv = document.activeElement
  let ziel = alt?.ziel || null
  if (!ziel) {
    if (aktiv instanceof HTMLElement && aktiv !== document.body && !dlg.contains(aktiv)) ziel = merkeFokusZiel(aktiv)
    else if (letzterKlick && performance.now() - letzterKlick.t < BESTAETIGE_KLICK_MS && letzterKlick.el.isConnected) ziel = merkeFokusZiel(letzterKlick.el)
  }

  return new Promise((loese) => {
    const lauf = {
      ziel,
      seit: performance.now(),
      vomRouter,
      loese,
      // Idempotent: Mehrfachklick, Esc und Seitenwechsel dürfen sich überschneiden.
      beende(ergebnis, { fokus = true } = {}) {
        if (bestaetigeLauf !== lauf) return
        bestaetigeLauf = null
        if (dlg.open) dlg.close()
        if (fokus) stelleFokusWieder(lauf.ziel)
        loese(ergebnis)
      },
    }
    bestaetigeLauf = lauf

    document.getElementById('bestaetige-titel').textContent = frage
    const textEl = document.getElementById('bestaetige-text')
    textEl.textContent = text
    textEl.hidden = !text
    const listeEl = document.getElementById('bestaetige-liste')
    listeEl.replaceChildren(...details.map((zeile) => {
      const li = document.createElement('li')
      li.textContent = zeile
      return li
    }))
    listeEl.hidden = !details.length
    const beschreibung = [text && 'bestaetige-text', details.length && 'bestaetige-liste'].filter(Boolean).join(' ')
    if (beschreibung) dlg.setAttribute('aria-describedby', beschreibung)
    else dlg.removeAttribute('aria-describedby')
    dlg.dataset.gefahr = gefahr ? 'ja' : 'nein'
    // Beschriftung im eigenen <span>: Der Pfeil des Text-CTA ist reine Zier (aria-hidden) und bleibt erhalten.
    const ok = document.getElementById('bestaetige-ok')
    const beschriftung = document.createElement('span')
    beschriftung.textContent = aktion
    if (gefahr) {
      ok.className = 'li-loeschen'
      ok.replaceChildren(beschriftung)
    } else {
      const pfeil = document.createElement('span')
      pfeil.setAttribute('aria-hidden', 'true')
      pfeil.textContent = '→'
      ok.className = 'adm-cta'
      ok.replaceChildren(beschriftung, ' ', pfeil)
    }
    if (!dlg.open) dlg.showModal()
    // Auch beim Ersetzen einer offenen Frage beginnt der Fokus wieder bei „Abbrechen“ (nicht beim Knopf der alten Frage)
    document.getElementById('bestaetige-abbrechen').focus({ preventScroll: true })
    // Scrollt der Mittelteil (lange Liste, große Schrift), ist er mit der Tastatur erreichbar und benannt
    const scroll = document.getElementById('bestaetige-scroll')
    const scrollt = scroll.scrollHeight > scroll.clientHeight
    if (scrollt) {
      scroll.setAttribute('tabindex', '0')
      scroll.setAttribute('role', 'group')
      scroll.setAttribute('aria-labelledby', 'bestaetige-titel')
    } else {
      for (const a of ['tabindex', 'role', 'aria-labelledby']) scroll.removeAttribute(a)
    }
    lauf.seit = performance.now()   // die Sperre beginnt (neu), sobald die Frage steht
  })
}

function createTemporaryDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
 * Genutzt von Woche, Monat und Liste.
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

// Die Rollen heißen in der Oberfläche „Basiszugang“ und „Gesamtausgabe“ (Terminologie.md; „Basis“ ist ein Fachbegriff
// der Kollokationen). Datenbankwerte und API bleiben „user“ und „premium“.
function roleLabel(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'premium') return 'Gesamtausgabe'
  return 'Basiszugang'
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

  const btnText = document.getElementById('login-btn-text')
  btn.disabled = true
  btnText.textContent = 'Wird geprüft …'
  errEl.style.display = 'none'
  beendeStartPruefung()

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
  btnText.textContent = 'Anmelden'
}

async function doLogout() {
  if (sessionRefreshTimer) {
    window.clearTimeout(sessionRefreshTimer)
    sessionRefreshTimer = null
  }
  clearToken()
  stopRouter()
  nutzerZuruecksetzen()
  betriebZuruecksetzen()
  socialZuruecksetzen()
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
// Nur 401/403 heißt „nicht angemeldet“. Bei 429 (Admin-Limit), Serverfehler oder Netzausfall
// ist die Sitzung womöglich gültig: Dann steht ein Hinweis unter der Anmeldung und die Prüfung
// läuft nach der Wartezeit von selbst noch einmal (eine Anmeldung von Hand bleibt möglich).
let startPruefungTimer = null
let startPruefungTakt = null

function startHinweis(text) {
  const errEl = document.getElementById('login-error')
  if (!errEl) return
  errEl.textContent = text
  errEl.style.display = text ? 'block' : 'none'
}

function beendeStartPruefung() {
  window.clearTimeout(startPruefungTimer)
  window.clearInterval(startPruefungTakt)
  startPruefungTimer = startPruefungTakt = null
}

function planeStartPruefung(grund, sekunden) {
  beendeStartPruefung()
  let rest = sekunden
  const zeige = () => startHinweis(`${grund} Neuer Versuch in ${rest} s.`)
  zeige()
  startPruefungTakt = window.setInterval(() => { rest = Math.max(1, rest - 1); zeige() }, 1000)
  startPruefungTimer = window.setTimeout(() => {
    beendeStartPruefung()
    startHinweis('Sitzung wird geprüft …')
    void pruefeSitzungBeimStart()
  }, sekunden * 1000)
}

async function pruefeSitzungBeimStart() {
  let r
  try {
    r = await fetch('/admin/kalender')
  } catch {
    return planeStartPruefung('Der Server ist gerade nicht erreichbar.', 15)
  }
  // Inzwischen von Hand angemeldet: nichts mehr tun
  if (document.getElementById('login-overlay')?.classList.contains('hidden')) return
  if (r.ok) {
    startHinweis('')
    document.getElementById('login-overlay').classList.add('hidden')
    showMainContainer()
    scheduleSessionRefresh()
    initDashboard()
    return
  }
  if (r.status === 429) {
    const warten = Number.parseInt(r.headers.get('Retry-After') || '', 10)
    return planeStartPruefung('Zu viele Admin-Anfragen in der letzten Minute.', Number.isFinite(warten) && warten > 0 ? Math.min(warten, 120) : 60)
  }
  if (r.status >= 500) return planeStartPruefung(`Der Server antwortet gerade nicht (HTTP ${r.status}).`, 15)
  // 401/403: Kein Cookie oder abgelaufen → Anmeldung bleibt sichtbar, ohne Hinweis
  startHinweis('')
}
void pruefeSitzungBeimStart()

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


// ── Werkzeuge › Betrieb ───────────────────────────────────────────────────────
// Übersicht (#werkzeuge) mit dem Stand der Betriebs-Werkzeuge und die Unterseiten Systemzustand
// (#werkzeuge/system), Sicherung (#werkzeuge/sicherung), Kursmaterial (#werkzeuge/kursmaterial)
// und Änderungsprotokoll (#werkzeuge/protokoll).
//
// Zeiten erscheinen in Berliner Zeit, wie die Tagesgrenzen des Servers im Protokoll.
// Alles, was aus Daten stammt (Protokolleinträge enthalten Eingaben, Dateinamen, E-Mail-Adressen
// gelöschter Konten), geht nur über esc() bzw. textContent in die Seite. Protokolldaten gelangen weder
// in die Adresse noch in den Seitentitel noch in die Konsole.

const SICHERUNG_MAX_STUNDEN = 36      // täglicher Lauf + 12 h Spielraum
const ANTWORT_VERZOEGERT_MS = 100     // mittlere Verzögerung der Ereignisschleife, ab der „verzögert“ steht
const BACKUP_MAX_BYTES = 10 * 1024 * 1024  // = BACKUP_RESTORE_BODY_LIMIT in server/index.js
const KURS_ABFRAGE_MS = 3000
const PROTOKOLL_SEITE = 100
const PROTOKOLL_MAX = 500             // = Obergrenze von limit im Server-Schema

const BERLIN_ZEIT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

let healthToken = 0
let systemToken = 0
let sicherungListeToken = 0
let sicherungUmfang = null          // Antwort von GET /admin/backup/umfang (jetziger Stand)
let restoreDatei = null             // { name, payload, pruefung } – nur im Speicher, nichts wird vor der Bestätigung hochgeladen
let restoreLaeuft = false
let kursJob = null                  // letzte Antwort von GET /admin/course/pdf-status
let kursTimer = null
let kursMeldungZuletzt = ''
let protokollLimit = PROTOKOLL_SEITE
let protokollEintraege = []
let protokollGesamt = 0
let protokollBegrenzt = false
let protokollDurchsuchtMax = 0
let protokollToken = 0
let protokollSuchTimer = null
const protokollOffen = new Set()    // Schlüssel der aufgeklappten Einträge (bleiben bei „weitere anzeigen“ offen)

// ── Formate ──

// Zerlegt einen Zeitpunkt in Berliner Zeit; null bei ungültigem Wert.
function berlinTeile(wert) {
  const d = wert instanceof Date ? wert : new Date(wert)
  if (Number.isNaN(d.getTime())) return null
  const t = {}
  for (const p of BERLIN_ZEIT.formatToParts(d)) t[p.type] = p.value
  const y = Number(t.year)
  const m = Number(t.month)
  const tag = Number(t.day)
  return { y, m, d: tag, hh: t.hour, mm: t.minute, ss: t.second, wt: (new Date(Date.UTC(y, m - 1, tag)).getUTCDay() + 6) % 7, iso: `${t.year}-${t.month}-${t.day}` }
}

const zwei = (n) => String(n).padStart(2, '0')
const uhrText = (t) => `${t.hh}:${t.mm}`
// „Mi 02.09.2026“
const datumKurzJahr = (t) => `${DAYS_DE[t.wt]} ${zwei(t.d)}.${zwei(t.m)}.${t.y}`
// „Mittwoch, 14. Oktober 2026“
const datumLangBerlin = (t, jahr = true) => `${WOCHENTAGE_LANG[t.wt]}, ${t.d}. ${MONTHS_DE[t.m - 1]}${jahr ? ` ${t.y}` : ''}`
const mbText = (bytes) => `${(Number(bytes) / 1024 / 1024).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
// „83 %“ aus „83.22%“
const prozentText = (s) => `${Math.round(parseFloat(String(s).replace(',', '.')) || 0)} %`
const anzahlText = (n, eins, viele) => `${ganzzahlDe(n)} ${Number(n) === 1 ? eins : viele}`

// „heute, 03:12“ · „gestern, 23:40“ · „Mi 21.10., 15:42“ · mit Jahr, wenn nicht dieses Jahr
function wannText(wert, { uhrzeit = true } = {}) {
  const t = wert ? berlinTeile(wert) : null
  if (!t) return '–'
  const heute = berlinTeile(getCurrentDate())
  const tage = Math.round((Date.UTC(heute.y, heute.m - 1, heute.d) - Date.UTC(t.y, t.m - 1, t.d)) / 864e5)
  const zeit = uhrzeit ? `, ${uhrText(t)}` : ''
  if (tage === 0) return `heute${zeit}`
  if (tage === 1) return `gestern${zeit}`
  const jahr = t.y === heute.y ? '' : String(t.y)
  return `${DAYS_DE[t.wt]} ${zwei(t.d)}.${zwei(t.m)}.${jahr}${zeit}`
}

// „12 Minuten“ · „5 Stunden“ · „3 Tage“ (für „3 Tage ohne Neustart“)
function dauerText(ms) {
  const min = Math.floor(ms / 60000)
  if (min < 60) return anzahlText(min, 'Minute', 'Minuten')
  const std = Math.floor(min / 60)
  if (std < 48) return anzahlText(std, 'Stunde', 'Stunden')
  return anzahlText(Math.floor(std / 24), 'Tag', 'Tage')
}

// „Sa 31.10.2026“ aus einem ISO-Tag; alles andere bleibt unverändert
const tagText = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${datumKurz(iso)}${iso.slice(0, 4)}` : String(iso || ''))
// „02.11.“
const kurzTag = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : String(iso || ''))
// „KW 45/2026“ aus „2026-W45“
const kwText = (woche) => {
  const m = /^(\d{4})-W(\d{2})$/.exec(woche || '')
  return m ? `KW ${Number(m[2])}/${m[1]}` : String(woche || '')
}

function betriebZeile(label, wertHtml, zusatzHtml = '') {
  return `<div><dt>${esc(label)}</dt><dd>${wertHtml}${zusatzHtml ? ` <span class="be-zusatz">${zusatzHtml}</span>` : ''}</dd></div>`
}
const betriebWert = (text, ton = '') => `<span class="be-wert"${ton ? ` data-tone="${ton}"` : ''}>${esc(text)}</span>`

async function holeJson(url, options) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => null)
  if (!res.ok || data === null) {
    const fehler = new Error(data?.error || `HTTP ${res.status}`)
    fehler.status = res.status
    fehler.data = data
    throw fehler
  }
  return data
}

// Knopf als „läuft gerade“ markieren (aria-disabled statt disabled: Er behält den Fokus)
function setzeKnopfBusy(knopfId, textId, busy, text) {
  const btn = document.getElementById(knopfId)
  if (!btn) return
  btn.classList.toggle('is-busy', busy)
  if (busy) btn.setAttribute('aria-disabled', 'true')
  else btn.removeAttribute('aria-disabled')
  const textEl = document.getElementById(textId)
  if (textEl) textEl.textContent = text
}

// ── Bewertung des Zustands (Übersicht, Woche und Systemseite nutzen dieselbe Regel) ──

function sicherungAlterStunden(h) {
  const zuletzt = h?.sicherung?.zuletzt
  if (!zuletzt) return null
  return (getCurrentDate().getTime() - new Date(zuletzt).getTime()) / 36e5
}

// Was den Spielbetrieb oder die Datensicherheit betrifft. Push und Mail „nicht eingerichtet“ stehen nur als Hinweis in der Zeile.
function systemProbleme(h) {
  const p = []
  if (h.appDb !== 'ok') p.push({ ton: 'err', text: 'Die Spieldaten-Datenbank antwortet nicht.' })
  if (h.wortprofilDb !== 'ok') p.push({ ton: 'err', text: 'Das Wortprofil ist nicht erreichbar; Kollokationen und „Wort prüfen“ funktionieren nicht.' })
  if (h.belegeDb !== 'ok') p.push({ ton: 'warn', text: 'Die Belegsätze sind nicht verfügbar.' })
  const alter = sicherungAlterStunden(h)
  if (alter === null) p.push({ ton: 'warn', text: 'Es gibt keine automatische Sicherung.' })
  else if (alter > SICHERUNG_MAX_STUNDEN) p.push({ ton: 'warn', text: `Die letzte Sicherung ist ${anzahlText(Math.floor(alter), 'Stunde', 'Stunden')} alt.` })
  return p
}
const systemTon = (probleme) => (probleme.some((x) => x.ton === 'err') ? 'err' : probleme.length ? 'warn' : 'ok')

// ── Übersicht: Stand je Werkzeug ──

function setzeStand(id, text, ton = '') {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = text
  if (ton) el.dataset.tone = ton
  else el.removeAttribute('data-tone')
}

function renderWerkzeugStand(h) {
  if (!h) {
    setzeStand('wz-stand-system', 'Zustand unbekannt', 'warn')
    for (const id of ['wz-stand-sicherung', 'wz-stand-kursmaterial', 'wz-stand-protokoll']) setzeStand(id, '')
    return
  }
  const ton = systemTon(systemProbleme(h))
  setzeStand('wz-stand-system', { ok: 'Alles in Ordnung', warn: 'Bitte prüfen', err: 'Störung' }[ton], ton === 'ok' ? '' : ton)
  const alter = sicherungAlterStunden(h)
  if (alter === null) setzeStand('wz-stand-sicherung', 'Keine Sicherung gefunden', 'warn')
  else if (alter > SICHERUNG_MAX_STUNDEN) setzeStand('wz-stand-sicherung', `Zuletzt ${wannText(h.sicherung.zuletzt)} · zu alt`, 'warn')
  else setzeStand('wz-stand-sicherung', `Zuletzt ${wannText(h.sicherung.zuletzt)}`)
  if (h.kursmaterial?.laeuft) setzeStand('wz-stand-kursmaterial', 'Wird gerade erzeugt …', 'loading')
  else setzeStand('wz-stand-kursmaterial', h.kursmaterial?.zuletzt ? `Zuletzt erzeugt ${wannText(h.kursmaterial.zuletzt, { uhrzeit: false })}` : 'Noch nicht erzeugt')
  setzeStand('wz-stand-protokoll', h.protokoll?.zuletzt ? `Letzter Eintrag ${wannText(h.protokoll.zuletzt)}` : '')
}

// Füllt den Link in Planen › Woche (ein Wort) und den Stand der Übersicht aus einer Antwort von /admin/health.
function healthAnwenden(data) {
  const link = document.getElementById('wo-system')
  if (link) {
    if (!data) { link.textContent = 'Systemzustand unbekannt'; link.removeAttribute('data-tone') }
    // Unsichtbares Präfix: „System läuft“ allein sagt als Link nicht, wohin er führt
    else if (systemTon(systemProbleme(data)) === 'ok') { link.innerHTML = '<span class="adm-visually-hidden">Systemzustand: </span>System läuft'; link.removeAttribute('data-tone') }
    else { link.innerHTML = '<span class="adm-visually-hidden">Systemzustand: </span>System prüfen'; link.dataset.tone = 'warn' }
  }
  renderWerkzeugStand(data)
  inhalteHealth = data
  renderInhalteStand()
}

async function loadHealth() {
  const token = ++healthToken
  let data = null
  try {
    data = await holeJson('/admin/health')
  } catch {
    data = null
  }
  if (token !== healthToken) return data
  healthAnwenden(data)
  return data
}

// ── Systemzustand ──

function renderLage(h, { laden = false, fehler = '' } = {}) {
  const el = document.getElementById('system-lage')
  if (!el) return
  if (laden) {
    el.dataset.tone = 'loading'
    el.innerHTML = '<p class="be-lage-titel">Zustand wird geprüft …</p>'
    return
  }
  if (!h) {
    el.dataset.tone = 'err'
    el.innerHTML = '<p class="be-lage-titel">Zustand unbekannt</p>'
      + `<p class="be-lage-text">Der Server hat nicht geantwortet (${esc(fehler || 'keine Antwort')}). Ist die Seite noch angemeldet?</p>`
      + '<p class="be-lage-zeit"><button type="button" class="adm-link" data-action="load-health">Erneut prüfen</button></p>'
    return
  }
  const probleme = systemProbleme(h)
  const ton = systemTon(probleme)
  if (ton === 'ok') el.removeAttribute('data-tone')
  else el.dataset.tone = ton
  const text = ton === 'ok'
    ? `Alle Datenbanken sind erreichbar, die letzte Sicherung lief ${wannText(h.sicherung.zuletzt)} Uhr.`
    : probleme.map((x) => x.text).join(' ')
  el.innerHTML = `<p class="be-lage-titel">${ton === 'ok' ? 'Alles in Ordnung' : 'Bitte prüfen'}</p>`
    + `<p class="be-lage-text">${esc(text)}</p>`
    + `<p class="be-lage-zeit"><span>Geprüft um ${uhrText(berlinTeile(getCurrentDate()))} Uhr</span><button type="button" class="adm-link" data-action="load-health">neu prüfen</button></p>`
}

// Zwischenspeicher: ohne Anfragen gibt es keine Trefferquote, die man lesen könnte
function zwischenspeicherZeile(label, cache) {
  if (!cache || !((cache.hits || 0) + (cache.misses || 0)) && !cache.size) return betriebZeile(label, betriebWert('noch nichts zwischengespeichert'))
  return betriebZeile(label, betriebWert(`${prozentText(cache.hitRate)} aus dem Zwischenspeicher`), esc(anzahlText(cache.size || 0, 'Eintrag', 'Einträge')))
}

function renderSystem(h, perf) {
  const dienste = document.getElementById('system-dienste')
  const server = document.getElementById('system-server')
  const werte = document.getElementById('performance-werte')
  const healthJson = document.getElementById('system-health-json')
  const perfJson = document.getElementById('performance-json')
  if (!dienste || !server || !werte) return
  if (!h) {
    dienste.innerHTML = ''
    server.innerHTML = ''
    werte.innerHTML = ''
    if (healthJson) healthJson.textContent = 'Keine Daten.'
    if (perfJson) perfJson.textContent = 'Keine Daten.'
    return
  }
  const datenbank = (status, okZusatz) => {
    if (status === 'ok') return `${betriebWert('erreichbar')} <span class="be-zusatz">${esc(okZusatz)}</span>`
    const text = status === 'nicht verfügbar' ? 'nicht verfügbar' : 'nicht erreichbar'
    return betriebWert(text, 'err') + (String(status).startsWith('error') ? ` <span class="be-zusatz">${esc(String(status).replace(/^error:\s*/, ''))}</span>` : '')
  }
  const push = h.push || {}
  const pushText = push.web && push.ios ? 'eingerichtet für Web und iOS' : push.web ? 'nur für Web eingerichtet' : push.ios ? 'nur für iOS eingerichtet' : 'nicht eingerichtet'
  const mailDa = !!h.mail?.eingerichtet
  const alter = sicherungAlterStunden(h)
  dienste.innerHTML = [
    `<div><dt>Spieldaten</dt><dd>${datenbank(h.appDb, 'Konten, Kalender, Statistik')}</dd></div>`,
    `<div><dt>Wortprofil</dt><dd>${datenbank(h.wortprofilDb, 'Kollokationen, Wort prüfen')}</dd></div>`,
    `<div><dt>Belegsätze</dt><dd>${h.belegeDb === 'ok' ? datenbank('ok', 'Beispielsätze aus dem Korpus') : betriebWert('nicht verfügbar', 'warn')}</dd></div>`,
    betriebZeile('Benachrichtigungen', betriebWert(pushText, push.web || push.ios ? '' : 'warn'), esc(anzahlText(push.geraete || 0, 'Gerät angemeldet', 'Geräte angemeldet'))),
    betriebZeile('E-Mail-Versand', betriebWert(mailDa ? 'eingerichtet' : 'nicht eingerichtet', mailDa ? '' : 'warn'), mailDa ? '' : 'Willkommens-Mails werden nicht verschickt'),
    betriebZeile('Letzte Sicherung', alter === null ? betriebWert('keine gefunden', 'warn') : alter > SICHERUNG_MAX_STUNDEN ? betriebWert(`${wannText(h.sicherung.zuletzt)} Uhr · zu alt`, 'warn') : betriebWert(`${wannText(h.sicherung.zuletzt)} Uhr`), '<a class="adm-link" href="#werkzeuge/sicherung">Sicherung ansehen</a>'),
    betriebZeile('Letzter geplanter Tag', betriebWert(h.lastEntry && /^\d{4}-\d{2}-\d{2}$/.test(h.lastEntry) ? tagText(h.lastEntry) : '–')),
  ].join('')

  const gestartet = h.process?.startedAt ? new Date(h.process.startedAt) : null
  const lag = Number(perf?.eventLoop?.lagAvgMs || 0)
  server.innerHTML = [
    gestartet ? betriebZeile('Läuft', betriebWert(`seit ${wannText(gestartet)} Uhr`), esc(`${dauerText(getCurrentDate() - gestartet)} ohne Neustart`)) : '',
    betriebZeile('Betriebsart', betriebWert(h.env === 'production' ? 'Produktion' : 'Entwicklung')),
    h.process?.appVersion ? betriebZeile('Version', betriebWert(h.process.appVersion)) : '',
    betriebZeile('Arbeitsspeicher', betriebWert(`${ganzzahlDe(h.memMb)} MB`)),
    perf ? betriebZeile('Reaktionszeit', betriebWert(lag < ANTWORT_VERZOEGERT_MS ? 'flüssig' : 'verzögert', lag < ANTWORT_VERZOEGERT_MS ? '' : 'warn'), esc(`Verzögerung im Mittel ${lag.toLocaleString('de-DE')} ms`)) : '',
  ].join('')

  werte.innerHTML = perf ? [
    betriebZeile('Datenbank', betriebWert(mbText(perf.db?.sizeBytes)), esc(`dazu ${mbText(perf.db?.walBytes)} noch nicht übernommene Änderungen`)),
    zwischenspeicherZeile('Suchergebnisse', perf.cache?.query),
    zwischenspeicherZeile('Belegsätze', perf.cache?.belege),
    betriebZeile('Konten', betriebWert(ganzzahlDe(perf.entities?.users))),
    betriebZeile('Klassenräume', betriebWert(anzahlText(perf.entities?.classroomSessions || 0, 'Sitzung', 'Sitzungen'))),
    betriebZeile('Spielstatistik', betriebWert(anzahlText(perf.rows?.totalPlays || 0, 'Spiel', 'Spiele')), esc(`${ganzzahlDe(perf.rows?.statsRows)} Zeilen, davon ${ganzzahlDe(perf.rows?.identifiedStatsRows)} mit Konto`)),
  ].join('') : betriebZeile('Messwerte', betriebWert('nicht verfügbar', 'warn'))

  if (healthJson) healthJson.textContent = JSON.stringify(h, null, 2)
  if (perfJson) perfJson.textContent = perf ? JSON.stringify(perf, null, 2) : 'Keine Daten.'
}

async function ladeSystemzustand({ fokus = false } = {}) {
  const token = ++systemToken
  const lage = document.getElementById('system-lage')
  const knopf = lage?.querySelector('[data-action="load-health"]')
  if (knopf) {
    // Neu prüfen: Der Knopf bleibt stehen (der Fokus geht nicht verloren), zeigt aber, dass geprüft wird
    knopf.setAttribute('aria-disabled', 'true')
    knopf.textContent = 'wird geprüft …'
  } else {
    renderLage(null, { laden: true })
  }
  const [hRes, pRes] = await Promise.allSettled([holeJson('/admin/health'), holeJson('/admin/performance')])
  const h = hRes.status === 'fulfilled' ? hRes.value : null
  const perf = pRes.status === 'fulfilled' ? pRes.value : null
  healthAnwenden(h)
  if (token !== systemToken || currentRoute?.page !== 'system') return
  // War der Fokus im ersetzten Bereich (oder nirgends), soll er dort bleiben; woanders hingegangen: in Ruhe lassen
  const aktiv = document.activeElement
  const fokusDa = !aktiv || aktiv === document.body || !!lage?.contains(aktiv)
  renderLage(h, { fehler: hRes.status === 'rejected' ? hRes.reason?.message : '' })
  renderSystem(h, perf)
  if (fokus && fokusDa && lage) {
    // Die Lage ist eine Live-Region; wird sie fokussiert, liest der Screenreader sie darüber: kurz ausschalten, sonst doppelt
    lage.setAttribute('aria-live', 'off')
    lage.focus({ preventScroll: true })
    window.setTimeout(() => lage.setAttribute('aria-live', 'polite'), 800)
  }
}

// ── Sicherung ──

const SICHERUNG_ANLASS = { taeglich: 'tägliche Sicherung', manuell: 'von Hand gesichert', 'vor-wiederherstellung': 'vor dem Wiederherstellen' }
const UMFANG_ZEILEN = [['lemmata', 'Wörter'], ['kalender', 'Kalendertage'], ['wortzwilling', 'Wort-Zwilling'], ['zeitenwende', 'Zeitenwende']]
const SICHERUNG_TEILE = { lemmata: 'lemmata.json', kalender: 'kalender.json', wortzwilling: 'wortzwilling.json', zeitenwende: 'zeitenwende.json' }

function sicherungFehlerHtml(text) {
  return `<li><p class="wo-meldung" data-tone="err" role="alert">${esc(text)} <button type="button" class="adm-link" data-action="sicherung-laden">Erneut versuchen</button></p></li>`
}

async function ladeSicherungsListe() {
  const token = ++sicherungListeToken
  const liste = document.getElementById('sicherung-liste')
  const stand = document.getElementById('sicherung-stand')
  if (!liste) return
  if (!liste.children.length) liste.innerHTML = '<li class="be-zeile"><span class="be-zeile-meta" data-tone="loading">wird geladen …</span></li>'
  try {
    const data = await holeJson('/admin/backup/sqlite')
    if (token !== sicherungListeToken) return
    const sicherungen = Array.isArray(data.backups) ? data.backups : []
    const neueste = sicherungen.find((s) => s.anlass === 'taeglich')
    if (stand) stand.textContent = neueste ? `Zuletzt ${wannText(neueste.modifiedAt)} Uhr` : 'Noch keine Sicherung vorhanden'
    liste.innerHTML = sicherungen.length
      ? sicherungen.map((s) => {
        const t = berlinTeile(s.modifiedAt)
        return `<li class="be-zeile"><span class="be-zeile-haupt">${t ? `${esc(datumKurzJahr(t))}, ${uhrText(t)}` : '–'}</span>`
          + `<span class="be-zeile-meta">${esc(SICHERUNG_ANLASS[s.anlass] || s.anlass)} · ${esc(mbText(s.sizeBytes))}</span></li>`
      }).join('')
      : '<li class="be-zeile"><span class="be-zeile-meta is-leer">noch keine Sicherung vorhanden</span></li>'
  } catch (err) {
    if (token !== sicherungListeToken) return
    if (stand) stand.textContent = ''
    liste.innerHTML = sicherungFehlerHtml(`Die Sicherungen konnten nicht geladen werden (${err.message}).`)
  }
}

function renderSicherungUmfang() {
  const host = document.getElementById('sicherung-umfang')
  if (!host) return
  if (!sicherungUmfang) {
    host.innerHTML = betriebZeile('Umfang', betriebWert('nicht verfügbar', 'warn'), '<button type="button" class="adm-link" data-action="sicherung-laden">Erneut versuchen</button>')
    return
  }
  host.innerHTML = UMFANG_ZEILEN.map(([k, label]) => betriebZeile(label, betriebWert(ganzzahlDe(sicherungUmfang[k])))).join('')
    + betriebZeile('Spielstatistik', betriebWert(anzahlText(sicherungUmfang.statsRows, 'Zeile', 'Zeilen')), 'in der Datei ohne Bezug zu Konten zusammengefasst')
}

async function ladeUmfang() {
  try {
    sicherungUmfang = await holeJson('/admin/backup/umfang')
  } catch {
    sicherungUmfang = null
  }
  renderSicherungUmfang()
  // Die Prüfung vergleicht mit dem jetzigen Stand: Hat sich dieser geändert, beginnt sie neu (Häkchen aus).
  if (restoreDatei) renderPruefung()
}

function ladeSicherung() {
  return Promise.all([ladeSicherungsListe(), ladeUmfang()])
}

async function sicherungJetzt() {
  const btn = document.getElementById('sicherung-jetzt')
  if (!btn || btn.getAttribute('aria-disabled') === 'true') return
  setzeKnopfBusy('sicherung-jetzt', 'sicherung-jetzt-text', true, 'Sichert …')
  setMeldung('sicherung-jetzt-status', 'Sicherung läuft …', 'loading')
  try {
    const res = await fetch('/admin/backup/sqlite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json().catch(() => ({}))
    if (res.status === 409 || data.skipped) {
      setMeldung('sicherung-jetzt-status', 'Es läuft schon eine Sicherung. Bitte gleich noch einmal versuchen.', 'warn')
      return
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    setMeldung('sicherung-jetzt-status', `Gesichert um ${uhrText(berlinTeile(getCurrentDate()))} Uhr: ${data.datei} (${mbText(data.sizeBytes)}).`, 'ok')
    void ladeSicherungsListe()
    void loadHealth()
  } catch (err) {
    setMeldung('sicherung-jetzt-status', `Die Sicherung ist fehlgeschlagen: ${err.message}`, 'error')
  } finally {
    setzeKnopfBusy('sicherung-jetzt', 'sicherung-jetzt-text', false, 'Jetzt sichern')
  }
}

async function downloadBackup() {
  const btn = document.getElementById('sicherung-download')
  if (!btn || btn.getAttribute('aria-disabled') === 'true') return
  setzeKnopfBusy('sicherung-download', 'sicherung-download-text', true, 'Lädt …')
  setMeldung('sicherung-download-status', '')
  try {
    const r = await fetch('/admin/backup')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const blob = await r.blob()
    const name = `signifikation-inhalte-${berlinTeile(getCurrentDate()).iso}.json`
    createTemporaryDownload(blob, name)
    setMeldung('sicherung-download-status', `Heruntergeladen: ${name}`, 'ok')
  } catch (err) {
    setMeldung('sicherung-download-status', `Der Download ist fehlgeschlagen (${err.message}).`, 'error')
  } finally {
    setzeKnopfBusy('sicherung-download', 'sicherung-download-text', false, 'Inhalte herunterladen')
  }
}

// Datei lokal prüfen: Nichts wird hochgeladen, bevor bestätigt ist. Die Regeln entsprechen sanitizeBackupBundle
// (server/routes/admin-backup-utils.js): Alle vier Inhaltsteile müssen vorhanden sein.
// Liefert { ok: false, fehler } oder { ok: true, exportedAt, zahlen, fehlt }.
function pruefeSicherung(payload, groesse) {
  if (groesse > BACKUP_MAX_BYTES) return { ok: false, fehler: `Die Datei ist ${mbText(groesse)} groß; der Server nimmt höchstens 10 MB an.` }
  if (!payload || typeof payload !== 'object' || !payload.files || typeof payload.files !== 'object') {
    return { ok: false, fehler: 'Diese Datei ist keine Sicherung von Signifikation. Erwartet wird eine Datei, die hier unter „Inhalte herunterladen“ entstanden ist.' }
  }
  const f = payload.files
  const objekt = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : null)
  const zahlen = {
    lemmata: Array.isArray(f[SICHERUNG_TEILE.lemmata]) ? f[SICHERUNG_TEILE.lemmata].length : null,
    kalender: objekt(f[SICHERUNG_TEILE.kalender]),
    wortzwilling: objekt(f[SICHERUNG_TEILE.wortzwilling]),
    zeitenwende: objekt(f[SICHERUNG_TEILE.zeitenwende]),
    statsRows: Array.isArray(f['stats-rows.json']) ? f['stats-rows.json'].length : null,
  }
  const fehlt = Object.keys(SICHERUNG_TEILE).filter((k) => zahlen[k] === null)
  const exportedAt = typeof payload.exportedAt === 'string' && !Number.isNaN(Date.parse(payload.exportedAt)) ? payload.exportedAt : null
  return { ok: true, exportedAt, zahlen, fehlt }
}

function renderPruefung() {
  const box = document.getElementById('restore-pruefung')
  const name = document.getElementById('backup-restore-name')
  if (!box || !name) return
  if (!restoreDatei) {
    box.hidden = true
    box.innerHTML = ''
    name.textContent = 'Keine Datei ausgewählt'
    name.classList.remove('is-gewaehlt')
    return
  }
  name.textContent = restoreDatei.name
  name.classList.add('is-gewaehlt')
  const pr = restoreDatei.pruefung
  box.hidden = false
  if (!pr.ok) {
    // Der Grund steht in #restore-status (Live-Region, am Feld verknüpft)
    box.hidden = true
    box.innerHTML = ''
    return
  }
  if (pr.server === 'laeuft') {
    box.innerHTML = '<div class="be-pruefung"><p class="be-pruef-sub">Der Server prüft die Datei …</p></div>'
    return
  }
  const d = pr.exportedAt ? berlinTeile(pr.exportedAt) : null
  const heute = berlinTeile(getCurrentDate())
  const tageAlt = d ? Math.floor((Date.UTC(heute.y, heute.m - 1, heute.d) - Date.UTC(d.y, d.m - 1, d.d)) / 864e5) : null
  const jetzt = sicherungUmfang
  const zeile = ([k, label]) => {
    const neu = pr.zahlen[k]
    const aktuell = jetzt ? jetzt[k] : null
    const zelle = neu === null
      ? '<span class="be-weniger">fehlt</span>'
      : aktuell !== null && neu < aktuell ? `<span class="be-weniger">${esc(ganzzahlDe(neu))} (−${esc(ganzzahlDe(aktuell - neu))})</span>` : esc(ganzzahlDe(neu))
    return `<tr><th scope="row">${esc(label)}</th><td>${zelle}</td><td>${aktuell === null ? '–' : esc(ganzzahlDe(aktuell))}</td></tr>`
  }
  const hinweise = []
  if (pr.fehlt.length) {
    hinweise.push({ ton: 'err', text: `In der Datei fehlen ${aufzaehlung(pr.fehlt.map((k) => UMFANG_ZEILEN.find((z) => z[0] === k)[1]))}. Eine unvollständige Datei lässt sich nicht wiederherstellen.` })
  }
  if (!jetzt) hinweise.push({ ton: 'err', text: 'Der jetzige Stand auf dem Server konnte nicht geladen werden. Ohne ihn lässt sich nichts vergleichen. Bitte die Seite neu laden.' })
  if (d && tageAlt >= 1) hinweise.push({ ton: 'warn', text: `Die Datei ist ${anzahlText(tageAlt, 'Tag', 'Tage')} alt. Was seit ${datumLangBerlin(d, false)} geplant oder geändert wurde, geht verloren.` })
  if (!d) hinweise.push({ ton: 'warn', text: 'Die Datei nennt kein Erstellungsdatum.' })
  const sperre = pr.fehlt.length > 0 || !jetzt
  const hatStatistik = pr.zahlen.statsRows !== null
  box.innerHTML = '<div class="be-pruefung">'
    + `<p class="be-pruef-titel">${d ? `Sicherung vom ${esc(datumLangBerlin(d))}, ${uhrText(d)} Uhr` : 'Sicherung ohne Datum'}</p>`
    + '<p class="be-pruef-sub">Vergleich mit dem jetzigen Stand auf dem Server.</p>'
    + '<table class="be-vergleich"><caption class="adm-visually-hidden">Umfang der Datei und jetziger Stand</caption>'
    + '<thead><tr><th scope="col">Inhalt</th><th scope="col">in der Datei</th><th scope="col">jetzt</th></tr></thead><tbody>'
    + UMFANG_ZEILEN.map(zeile).join('')
    + '</tbody></table>'
    + (hinweise.length ? `<ul class="be-hinweise">${hinweise.map((h) => `<li${h.ton === 'err' ? ' data-tone="err"' : ''}>${esc(h.text)}</li>`).join('')}</ul>` : '')
    + (sperre ? '' : (hatStatistik
      ? '<label class="be-check"><input type="checkbox" id="restore-statistik" aria-describedby="restore-statistik-hinweis"><span>Auch die Spielstatistik ersetzen</span></label>'
        + '<p class="be-check-hinweis" id="restore-statistik-hinweis">Nicht empfohlen: Die Datei enthält die Statistik nur zusammengefasst. Statistik je Konto, Serien und Bestwerte gingen verloren.</p>'
      : '')
      + '<label class="be-check"><input type="checkbox" id="restore-verstanden"><span>Ich habe die Zahlen geprüft. Die jetzigen Inhalte werden ersetzt.</span></label>')
    + '<div class="be-aktionen">'
    + (sperre ? '' : '<button type="button" class="li-loeschen" id="restore-ausfuehren" data-action="restore-ausfuehren" aria-disabled="true" aria-describedby="restore-sperre">Inhalte jetzt ersetzen</button>')
    + '<button type="button" class="adm-link" data-action="restore-abbrechen">Andere Datei wählen</button>'
    + '</div>'
    + (sperre ? '' : '<p class="adm-visually-hidden" id="restore-sperre">Erst das Häkchen „Zahlen geprüft“ setzen.</p>')
    + '</div>'
}

// Fehler der Dateiprüfung am Feld: aria-invalid und Verweis auf die Meldung
function markiereDateiFehler(fehler) {
  const input = document.getElementById('backup-restore-input')
  if (!input) return
  if (fehler) {
    input.setAttribute('aria-invalid', 'true')
    input.setAttribute('aria-describedby', 'backup-restore-name restore-status')
  } else {
    input.removeAttribute('aria-invalid')
    input.setAttribute('aria-describedby', 'backup-restore-name')
  }
}

// Ergebnis der Dateiprüfung ansagen (die Tabelle allein käme nicht über eine Live-Region)
function sageDateiPruefung(auswahl) {
  const pr = auswahl.pruefung
  if (!pr.ok) {
    markiereDateiFehler(true)
    setMeldung('restore-status', pr.fehler, 'error')
  } else if (pr.fehlt.length) {
    markiereDateiFehler(true)
    setMeldung('restore-status', 'Die Datei ist unvollständig und lässt sich nicht wiederherstellen.', 'error')
  } else {
    markiereDateiFehler(false)
    setMeldung('restore-status', 'Datei geprüft. Der Vergleich mit dem jetzigen Stand steht unter dem Dateinamen.')
  }
}

async function waehleRestoreDatei(file) {
  setMeldung('restore-status', '')
  markiereDateiFehler(false)
  if (!file) {
    restoreDatei = null
    renderPruefung()
    return
  }
  let payload = null
  // Größer als der Server annimmt: gar nicht erst lesen
  if (file.size <= BACKUP_MAX_BYTES) {
    try { payload = JSON.parse(await file.text()) } catch { payload = null }
  }
  const auswahl = { name: file.name, payload, pruefung: pruefeSicherung(payload, file.size) }
  restoreDatei = auswahl
  // Vollständig: Der Server zählt dieselbe Datei nach seinen Regeln (Probelauf, nichts wird geschrieben). So zeigt die Vorschau
  // genau das, was er ersetzen würde, und nichts als „in Ordnung“, was er danach mit 400 ablehnt.
  if (auswahl.pruefung.ok && !auswahl.pruefung.fehlt.length) {
    auswahl.pruefung.server = 'laeuft'
    renderPruefung()
    try {
      const data = await holeJson('/admin/backup/restore/pruefen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportedAt: payload.exportedAt ?? undefined, files: payload.files }),
      })
      if (restoreDatei !== auswahl) return
      auswahl.pruefung.zahlen = { ...data.zahlen, statsRows: data.hatStatistik ? data.zahlen.statsRows : null }
      auswahl.pruefung.server = 'ok'
    } catch (err) {
      if (restoreDatei !== auswahl) return
      auswahl.pruefung = { ok: false, fehler: err.status === 400 || err.status === 413 ? err.message : `Der Server konnte die Datei nicht prüfen (${err.message}).` }
    }
  }
  renderPruefung()
  sageDateiPruefung(auswahl)
}

// Gewählte Datei und Prüfung verwerfen (ohne den Fokus zu bewegen)
function restoreAbbrechenStill() {
  restoreDatei = null
  const input = document.getElementById('backup-restore-input')
  if (input) input.value = ''
  markiereDateiFehler(false)
  renderPruefung()
}

function restoreAbbrechen() {
  restoreAbbrechenStill()
  setMeldung('restore-status', '')
  document.getElementById('backup-restore-input')?.focus()
}

// Häkchen „Zahlen geprüft“ entsperrt den Knopf (aria-disabled statt disabled: Er behält den Fokus)
function aktualisiereRestoreKnopf() {
  const btn = document.getElementById('restore-ausfuehren')
  if (!btn || restoreLaeuft) return
  if (document.getElementById('restore-verstanden')?.checked) {
    btn.removeAttribute('aria-disabled')
    btn.removeAttribute('aria-describedby')   // der Hinweis „erst das Häkchen setzen“ gilt nicht mehr
  } else {
    btn.setAttribute('aria-disabled', 'true')
    btn.setAttribute('aria-describedby', 'restore-sperre')
  }
}

// „Wiederhergestellt aus der Sicherung vom 14.10.2026: 1.290 Wörter, …“
function restoreErfolgText(data, exportedAt) {
  const r = data.restored || {}
  const d = exportedAt ? berlinTeile(exportedAt) : null
  const woher = d ? `der Sicherung vom ${zwei(d.d)}.${zwei(d.m)}.${d.y}` : 'der Datei'
  const teile = [
    anzahlText(r.lemmata || 0, 'Wort', 'Wörter'),
    anzahlText(r.kalender || 0, 'Kalendertag', 'Kalendertage'),
    anzahlText(r.wortzwilling || 0, 'Wort-Zwilling', 'Wort-Zwillinge'),
    anzahlText(r.zeitenwende || 0, 'Zeitenwende', 'Zeitenwenden'),
  ]
  return `Wiederhergestellt aus ${woher}: ${teile.join(', ')}. `
    + `${data.statistikErsetzt ? 'Die Spielstatistik wurde ersetzt.' : 'Die Spielstatistik blieb unverändert.'}`
    + `${data.sicherheitskopie ? ` Sicherheitskopie vorher: ${data.sicherheitskopie}.` : ''}`
}

async function restoreAusfuehren() {
  const btn = document.getElementById('restore-ausfuehren')
  if (!btn || restoreLaeuft || !restoreDatei?.pruefung?.ok) return
  if (btn.getAttribute('aria-disabled') === 'true') {
    document.getElementById('restore-verstanden')?.focus()
    return
  }
  // Alles, was nach dem await gebraucht wird, jetzt festhalten: Währenddessen kann man die Seite verlassen
  // oder eine andere Datei wählen, restoreDatei und die Felder sind dann nicht mehr dieselben.
  const auswahl = restoreDatei
  const { payload } = auswahl
  const exportedAt = auswahl.pruefung.exportedAt
  const mitStatistik = !!document.getElementById('restore-statistik')?.checked
  restoreLaeuft = true
  btn.setAttribute('aria-disabled', 'true')
  btn.textContent = 'Wird ersetzt …'
  setMeldung('restore-status', '')

  let data
  try {
    const res = await fetch('/admin/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportedAt: payload.exportedAt ?? undefined, files: payload.files, confirm: true, mitStatistik }),
    })
    data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(res.status === 413 ? 'Die Datei ist größer, als der Server annimmt (höchstens 10 MB).' : (data.error || `HTTP ${res.status}`))
    }
  } catch (err) {
    restoreLaeuft = false
    const knopf = document.getElementById('restore-ausfuehren')
    if (knopf && restoreDatei === auswahl) {
      knopf.textContent = 'Inhalte jetzt ersetzen'
      aktualisiereRestoreKnopf()
    }
    setMeldung('restore-status', `Nicht wiederhergestellt: ${err.message}`, 'error')
    return
  }

  // Ab hier ist es geschehen: nur noch aufräumen und melden, nie als Fehler
  restoreLaeuft = false
  const nochDieselbe = restoreDatei === auswahl
  if (nochDieselbe) {
    restoreDatei = null
    const input = document.getElementById('backup-restore-input')
    if (input) input.value = ''
    markiereDateiFehler(false)
    renderPruefung()
  }
  // Der Knopf ist weg (oder die Seite nicht offen): Bei offener Seite liest die Meldung der Fokus vor.
  setMeldung('restore-status', restoreErfolgText(data, exportedAt), 'ok', { fokus: nochDieselbe && currentRoute?.page === 'sicherung' })
  refreshDashboard()
  void ladeSicherung()
}

// ── Kursmaterial ──

const KURS_STATIONEN = [
  { nr: 1, id: 's1', label: 'Kollokationen' },
  { nr: 2, id: 's2', label: 'Wortarten' },
  { nr: 3, id: 's3', label: 'Abhängigkeiten' },
  { nr: 4, id: 's4', label: 'Korpus' },
  { nr: 5, id: 's5', label: 'Recherche' },
]

function kursStationText(station) {
  if (station === 'all' || station == null) return 'alle Stationen'
  const s = KURS_STATIONEN.find((x) => x.nr === Number(station))
  return s ? `Station ${s.nr} (${s.label})` : `Station ${station}`
}

function renderKurs() {
  const host = document.getElementById('kurs-stationen')
  if (!host) return
  const job = kursJob || {}
  const lauf = !!job.running
  const stand = new Map((Array.isArray(job.stationen) ? job.stationen : []).map((s) => [s.station, s]))
  host.innerHTML = KURS_STATIONEN.map((s) => {
    const eintrag = stand.get(s.id)
    const betroffen = lauf && (job.station === 'all' || Number(job.station) === s.nr)
    const meta = betroffen
      ? '<span class="be-zeile-meta" data-tone="loading">wird gerade erzeugt …</span>'
      : eintrag
        ? `<span class="be-zeile-meta">${esc(anzahlText(eintrag.anzahl, 'Datei', 'Dateien'))} · erzeugt ${esc(wannText(eintrag.zuletzt, { uhrzeit: false }))}</span>`
        : '<span class="be-zeile-meta is-leer">noch nicht erzeugt</span>'
    return `<li class="be-zeile"><span class="be-zeile-haupt">${s.nr} · ${esc(s.label)}</span>${meta}</li>`
  }).join('')

  setzeKnopfBusy('course-pdf-start', 'course-pdf-start-text', lauf, lauf ? 'Läuft …' : 'Neu erzeugen')

  // Die Statuszeile ist eine Live-Region: nur neu setzen, wenn sich der Text ändert (nicht bei jeder Abfrage)
  let text = ''
  let ton = ''
  const uhrVon = (ms) => uhrText(berlinTeile(new Date(ms)))
  if (lauf) {
    text = `Wird erzeugt: ${kursStationText(job.station)}, gestartet um ${uhrVon(job.startedAt)} Uhr. Das dauert ein bis zwei Minuten je Station.`
    ton = 'loading'
  } else if (job.ok === true) {
    text = `Fertig um ${uhrVon(job.finishedAt)} Uhr: ${anzahlText(job.count, 'Datei', 'Dateien')} für ${kursStationText(job.station)} erzeugt.`
    ton = 'ok'
  } else if (job.ok === false) {
    text = `Fehlgeschlagen um ${uhrVon(job.finishedAt)} Uhr (${kursStationText(job.station)}): ${job.error || 'unbekannter Fehler'}`
    ton = 'error'
  }
  if (text !== kursMeldungZuletzt) {
    kursMeldungZuletzt = text
    setMeldung('course-pdf-status', text, ton)
  }
}

function stoppeKursAbfrage() {
  if (kursTimer) {
    window.clearTimeout(kursTimer)
    kursTimer = null
  }
}

// Abfrage nur, solange die Seite offen und sichtbar ist und ein Lauf unterwegs ist (setTimeout-Kette: keine Überlappung)
function planeKursAbfrage() {
  stoppeKursAbfrage()
  if (!kursJob?.running || currentRoute?.page !== 'kursmaterial' || document.hidden) return
  kursTimer = window.setTimeout(async () => {
    kursTimer = null
    try {
      const data = await holeJson('/admin/course/pdf-status')
      if (currentRoute?.page !== 'kursmaterial') return
      kursJob = data
    } catch { /* der nächste Versuch kommt */ }
    renderKurs()
    planeKursAbfrage()
  }, KURS_ABFRAGE_MS)
}

async function ladeKursmaterial() {
  stoppeKursAbfrage()
  const host = document.getElementById('kurs-stationen')
  if (host && !host.children.length) host.innerHTML = '<li class="be-zeile"><span class="be-zeile-meta" data-tone="loading">wird geladen …</span></li>'
  try {
    const data = await holeJson('/admin/course/pdf-status')
    if (currentRoute?.page !== 'kursmaterial') return
    kursJob = data
    renderKurs()
    // Auch ein Lauf aus einem anderen Tab oder vor dem Neuladen wird weiterverfolgt
    planeKursAbfrage()
  } catch (err) {
    if (currentRoute?.page !== 'kursmaterial' || !host) return
    host.innerHTML = `<li><p class="wo-meldung" data-tone="err" role="alert">Der Stand konnte nicht geladen werden (${esc(err.message)}). <button type="button" class="adm-link" data-action="kurs-laden">Erneut versuchen</button></p></li>`
  }
}

async function regenerateCoursePdfs() {
  const btn = document.getElementById('course-pdf-start')
  if (!btn || btn.getAttribute('aria-disabled') === 'true') return
  const station = document.getElementById('course-pdf-station')?.value || 'all'
  setzeKnopfBusy('course-pdf-start', 'course-pdf-start-text', true, 'Startet …')
  try {
    const res = await fetch('/admin/course/regenerate-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station }),
    })
    const data = await res.json().catch(() => ({}))
    // 409: Es läuft schon ein Lauf – dessen Stand zeigen
    if (!res.ok && !data.status) throw new Error(data.error || `HTTP ${res.status}`)
    kursJob = { ...(kursJob || {}), ...data.status }
    renderKurs()
    planeKursAbfrage()
  } catch (err) {
    renderKurs()
    kursMeldungZuletzt = ''
    setMeldung('course-pdf-status', `Nicht gestartet: ${err.message}`, 'error')
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stoppeKursAbfrage()
  else if (currentRoute?.page === 'kursmaterial') void ladeKursmaterial()
})

// Rohdaten-Blöcke werden erst fokussierbar, wenn sie überlaufen (WCAG 2.1.1: scrollbare Bereiche per Tastatur).
// Gemessen wird beim Aufklappen, vorher haben sie keine Größe. „toggle“ bubbelt nicht: Capture am Dokument.
document.addEventListener('toggle', (event) => {
  const d = event.target
  if (!d?.classList?.contains('be-roh') || !d.open) return
  for (const pre of d.querySelectorAll('pre')) {
    if (pre.scrollHeight > pre.clientHeight + 1 || pre.scrollWidth > pre.clientWidth + 1) pre.setAttribute('tabindex', '0')
    else pre.removeAttribute('tabindex')
  }
}, true)

// ── Änderungsprotokoll ──

const PROTOKOLL_BEREICHE = { kalender: 'Tage', lemma_entwurf: 'Vorschläge', user: 'Konten', push: 'Benachrichtigungen', push_vorlage: 'Vorlagen', bonus_tag: 'Bonus-Tage', spezialwoche: 'Wort der Woche', demo: 'Klassenraum-Demo', social_card_entwurf: 'Social Cards', backup: 'Sicherung', security: 'Anmeldung und Zahlung' }
const PROTOKOLL_VORGAENGE = {
  CREATE: 'angelegt oder gespeichert', UPDATE: 'geändert', DELETE: 'gelöscht', LOGIN_SUCCESS: 'angemeldet', LOGIN_FAIL: 'Anmeldung fehlgeschlagen',
  LOGOUT: 'abgemeldet', SESSIONS_INVALIDATED: 'Sitzungen beendet', CHECKOUT_REJECT_COUNTRY: 'Kauf abgelehnt (Land)', PAYMENT_REJECT: 'Zahlung abgewiesen', WEBHOOK_REJECT: 'Zahlungsmeldung abgewiesen',
  PAYMENT_REFUNDED: 'Kauf erstattet', PAYMENT_REFUND_REVERSED: 'Erstattung zurückgenommen',
}
const ANMELDE_GRUENDE = { 'User nicht gefunden': 'unbekannte Adresse', 'keine Admin-Role': 'Konto ohne Admin-Rechte', 'kein Passwort': 'Konto ohne Passwort', 'Passwort falsch': 'falsches Passwort' }
const PROTOKOLL_FILTER_IDS = ['audit-search', 'audit-resource', 'audit-action', 'audit-status', 'audit-from', 'audit-to']

const fehlgeschlagen = (e) => e.status === 'FAIL' || e.status === 'FAILED'
const protokollSchluessel = (e) => `${e.timestamp}|${e.action}|${e.resource}|${e.resourceId}`

// Ein Satz je Eintrag (Klartext; esc beim Ausgeben)
function protokollSatz(e) {
  const c = e.changes || {}
  const a = c.after || {}
  const b = c.before || {}
  const det = c.details || {}
  switch (`${e.resource}:${e.action}`) {
    case 'kalender:CREATE': return `Tag ${tagText(e.resourceId)} gespeichert`
    case 'kalender:DELETE': return `Tag ${tagText(e.resourceId)} gelöscht`
    case 'lemma_entwurf:CREATE': {
      const n = Array.isArray(a.daten) ? a.daten.length : 0
      const [von, bis] = String(e.resourceId || '').split('..')
      return n ? `${anzahlText(n, 'Vorschlag', 'Vorschläge')} eingegangen (${kurzTag(von)}–${kurzTag(bis)})` : 'Vorschläge eingegangen'
    }
    case 'lemma_entwurf:DELETE': return `Vorschlag für ${b.datum ? tagText(b.datum) : 'einen Tag'} verworfen`
    case 'user:UPDATE': return `Rolle eines Kontos von ${roleLabel(b.role)} auf ${roleLabel(a.role)} geändert`
    case 'user:DELETE': return `Konto gelöscht (${b.role ? roleLabel(b.role) : 'Rolle unbekannt'})`
    case 'push:CREATE': return `Benachrichtigung „${a.title || e.resourceId}“ an alle Geräte gesendet`
    case 'push_vorlage:CREATE': return `Vorlage „${a.title || e.resourceId}“ angelegt`
    case 'push_vorlage:UPDATE': return `Vorlage „${a.title || b.title || e.resourceId}“ gespeichert`
    case 'push_vorlage:DELETE': return `Vorlage „${b.title || e.resourceId}“ gelöscht`
    case 'bonus_tag:CREATE': return `Bonus-Tag ${tagText(e.resourceId)} eingetragen: +${anzahlText(a.bonus_count, 'Spiel', 'Spiele')}`
    case 'bonus_tag:UPDATE': return `Bonus-Tag ${tagText(e.resourceId)} ersetzt: +${anzahlText(a.bonus_count, 'Spiel', 'Spiele')}`
    case 'bonus_tag:DELETE': return `Bonus-Tag ${tagText(e.resourceId)} entfernt`
    case 'demo:UPDATE': return 'Inhalte der Klassenraum-Demo gespeichert'
    case 'social_card_entwurf:CREATE': return `Eigener Social-Card-Entwurf für ${tagText(a.datum || '')} ${a.ersetzt ? 'ersetzt' : 'abgelegt'}${a.slot === 'E-aufloesung' ? ' (Auflösung)' : ''}`
    case 'social_card_entwurf:UPDATE':
      if (a.neuErstellt) return 'Social-Card-Entwurf neu erstellt (Beitragstext ersetzt)'
      if (a.status && b.status !== a.status) return `Social-Card-Entwurf ${a.status === 'offen' ? 'wieder geöffnet' : a.status}`
      return 'Beitragstext eines Social-Card-Entwurfs geändert'
    case 'spezialwoche:CREATE': return `Wort der Woche für ${kwText(e.resourceId)} ${a.ersetzt ? 'ersetzt' : 'gespeichert'}${a.lemma ? `: ${a.lemma}` : ''}`
    case 'spezialwoche:UPDATE': return `Wort der Woche für ${kwText(e.resourceId)} ersetzt${a.lemma ? `: ${a.lemma}` : ''}`
    case 'spezialwoche:DELETE': return `Wort der Woche für ${kwText(e.resourceId)} entfernt`
    case 'backup:CREATE': return 'Datenbank gesichert (von Hand)'
    case 'backup:UPDATE': {
      const t = a.exportedAt ? berlinTeile(a.exportedAt) : null
      return `Inhalte aus einer Sicherung${t ? ` vom ${zwei(t.d)}.${zwei(t.m)}.${t.y}` : ''} wiederhergestellt`
    }
    case 'security:LOGIN_SUCCESS': return 'Im Admin-Bereich angemeldet'
    case 'security:LOGIN_FAIL': return `Anmeldung fehlgeschlagen: ${ANMELDE_GRUENDE[det.reason] || det.reason || 'Grund unbekannt'}`
    case 'security:LOGOUT': return 'Abgemeldet'
    case 'security:SESSIONS_INVALIDATED': return det.scope === 'all' ? 'Alle Sitzungen beendet' : 'Sitzungen eines Kontos beendet'
    case 'security:CHECKOUT_REJECT_COUNTRY': return `Kauf abgelehnt: Aufruf aus dem Ausland${det.country ? ` (${det.country})` : ''}`
    case 'security:PAYMENT_REJECT': return 'Zahlung abgewiesen: Betrag oder Währung ungültig'
    case 'security:WEBHOOK_REJECT': return 'Zahlungsmeldung von unbekannter Adresse abgewiesen'
    case 'security:PAYMENT_REFUNDED': return `Kauf ${det.art === 'rueckbuchung' ? 'zurückgebucht' : 'erstattet'} (${det.quelle === 'apple' ? 'App Store' : 'Mollie'})${det.entzogen ? ', Gesamtausgabe entzogen' : ''}`
    case 'security:PAYMENT_REFUND_REVERSED': return `Erstattung zurückgenommen (App Store), Kauf zählt wieder${det.freigeschaltet ? ', Gesamtausgabe wieder frei' : ''}`
    default: return `${PROTOKOLL_VORGAENGE[e.action] || e.action || 'Vorgang'} · ${PROTOKOLL_BEREICHE[e.resource] || e.resource || 'Bereich unbekannt'}`
  }
}

// Das Protokoll nennt kein „Wer“ (gespeichert sind nur die letzten 4 Zeichen der Sitzungs-ID): Es zeigt die Quelle.
function protokollQuelle(e) {
  if (e.adminKeyLast4 === '-api') return 'Vorschlags-Schnittstelle'
  if (e.ip === 'cli') return 'Kommandozeile auf dem Server'
  if (e.action === 'WEBHOOK_REJECT' || e.action === 'PAYMENT_REJECT') return 'Zahlungsdienst'
  if (e.action === 'CHECKOUT_REJECT_COUNTRY') return 'Kasse der Website'
  if (e.action === 'LOGIN_SUCCESS' || e.action === 'LOGIN_FAIL') return 'Anmeldeseite'
  return 'Admin-Bereich'
}

// Lesbare Einzelheiten (dl) und die Rohdaten. Die E-Mail eines gelöschten Kontos steht nur hier.
function protokollDetail(e, i) {
  const c = e.changes || {}
  const a = c.after || {}
  const b = c.before || {}
  const det = c.details || {}
  const t = berlinTeile(e.timestamp)
  const id = (v) => `<span class="be-id">${esc(v)}</span>`
  const w = betriebWert
  const istTag = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
  const kontoLink = (v) => (NUTZER_ID_RE.test(v || '') ? `<a class="adm-link" href="${esc(kontoHash(v))}">Konto öffnen</a>` : id(v))
  const zeilen = [betriebZeile('Zeitpunkt', w(t ? `${datumLangBerlin(t)}, ${uhrText(t)}:${t.ss} Uhr` : '–'))]
  zeilen.push(betriebZeile('Vorgang', w(PROTOKOLL_VORGAENGE[e.action] || e.action), esc(PROTOKOLL_BEREICHE[e.resource] || e.resource || '')))
  const k = `${e.resource}:${e.action}`
  if (e.resource === 'kalender') {
    if (istTag(e.resourceId) && e.action === 'CREATE') zeilen.push(betriebZeile('Tag', `<a class="adm-link" href="#planen/tag/${esc(e.resourceId)}">${esc(tagText(e.resourceId))} öffnen</a>`))
    if (k === 'kalender:CREATE') {
      if (Array.isArray(a.woerter)) zeilen.push(betriebZeile('Wörter', w(a.woerter.join(', '))))
      zeilen.push(betriebZeile('Weitere Spiele', w(`Wort-Zwilling ${a.zwilling ? 'ja' : 'nein'} · Zeitenwende ${a.zeitenwende ? 'ja' : 'nein'}`)))
    } else {
      zeilen.push(betriebZeile('Tag', w(tagText(e.resourceId))))
      if (b.kalender) {
        if (b.kalender.thema) zeilen.push(betriebZeile('Thema vorher', w(b.kalender.thema)))
        zeilen.push(betriebZeile('Gelöscht', w(`${anzahlText((b.kalender.ids || []).length, 'Wort', 'Wörter')} · Wort-Zwilling ${b.wortzwilling ? 'ja' : 'nein'} · Zeitenwende ${b.zeitenwende ? 'ja' : 'nein'}`)))
      }
    }
  } else if (e.resource === 'lemma_entwurf') {
    if (Array.isArray(a.daten)) zeilen.push(betriebZeile('Tage', w(a.daten.map(kurzTag).join(', '))))
    if (b.datum) zeilen.push(betriebZeile('Tag', w(tagText(b.datum))))
    if (Array.isArray(b.woerter)) zeilen.push(betriebZeile('Wörter', w(b.woerter.join(', '))))
  } else if (e.resource === 'user') {
    zeilen.push(betriebZeile('Konto', e.action === 'DELETE' ? id(e.resourceId) : kontoLink(e.resourceId), e.action === 'DELETE' ? 'Konto gibt es nicht mehr' : ''))
    if (k === 'user:UPDATE') zeilen.push(betriebZeile('Rolle', `${w(roleLabel(b.role))} <span class="pr-pfeil" aria-hidden="true">→</span><span class="adm-visually-hidden">geändert auf</span> ${w(roleLabel(a.role))}`))
    if (k === 'user:DELETE' && b.email) zeilen.push(betriebZeile('E-Mail', w(b.email)))
  } else if (e.resource === 'push') {
    if (a.body) zeilen.push(betriebZeile('Text', w(a.body)))
    if (a.total != null) zeilen.push(betriebZeile('Zugestellt', w(`${ganzzahlDe(a.sent)} von ${ganzzahlDe(a.total)}`), a.failed ? esc(`${ganzzahlDe(a.failed)} fehlgeschlagen`) : ''))
  } else if (e.resource === 'push_vorlage') {
    const v = e.action === 'DELETE' ? b : a
    if (v.title) zeilen.push(betriebZeile('Titel', w(v.title)))
    if (v.body) zeilen.push(betriebZeile('Text', w(v.body)))
    if (e.action === 'UPDATE' && b.title !== undefined && (b.title !== a.title || b.body !== a.body)) zeilen.push(betriebZeile('Vorher', w(b.title || '–'), esc(b.body || '')))
    if (v.category) zeilen.push(betriebZeile('Versand', w(v.category === 'streak' ? 'abends, 19:00' : 'täglich, 8:00'), v.enabled === false ? 'aus' : ''))
  } else if (e.resource === 'bonus_tag') {
    zeilen.push(betriebZeile('Tag', w(tagText(e.resourceId))))
    const v = e.action === 'DELETE' ? b : a
    if (v.bonus_count != null) zeilen.push(betriebZeile('Zusätzliche Spiele', w(String(v.bonus_count)), v.label ? esc(v.label) : ''))
    if (e.action === 'UPDATE' && b.bonus_count != null) zeilen.push(betriebZeile('Vorher', w(String(b.bonus_count)), b.label ? esc(b.label) : ''))
  } else if (e.resource === 'demo') {
    if (a.basis) zeilen.push(betriebZeile('Kollokationen', w(a.basis)))
    if (a.wortzwilling) zeilen.push(betriebZeile('Wort-Zwilling', w(a.wortzwilling)))
    if (a.zeitenwende) zeilen.push(betriebZeile('Zeitenwende', w(a.zeitenwende)))
    if (a.lueckenfueller) zeilen.push(betriebZeile('Lückenfüller', w(a.lueckenfueller)))
    if (b.basis) zeilen.push(betriebZeile('Vorher', w(b.standard ? 'Standardinhalte' : b.basis)))
  } else if (e.resource === 'spezialwoche') {
    const v = e.action === 'DELETE' ? b : a
    if (v.von) zeilen.push(betriebZeile('Zeitraum', w(`${tagText(v.von)} – ${tagText(v.bis)}`)))
    if (v.zwilling_partner) zeilen.push(betriebZeile('Wort-Zwilling', w(`${v.lemma} · ${v.zwilling_partner}`)))
    if (v.lueckenfueller_id) zeilen.push(betriebZeile('Lückenfüller', w(v.lueckenfueller_id)))
    if (v.notiz) zeilen.push(betriebZeile('Notiz', w(v.notiz)))
    if (v.link) zeilen.push(betriebZeile('Link', w(v.link)))
    if (v.zeitenwende_notiz) zeilen.push(betriebZeile('Notiz Zeitenwende', w(v.zeitenwende_notiz)))
    if (v.zeitenwende_link) zeilen.push(betriebZeile('Link Zeitenwende', w(v.zeitenwende_link)))
    if (e.action === 'UPDATE' && b.lemma) zeilen.push(betriebZeile('Vorher', w(b.lemma), b.zwilling_partner ? esc(`Wort-Zwilling mit ${b.zwilling_partner}`) : ''))
  } else if (e.resource === 'backup') {
    if (k === 'backup:CREATE') {
      if (a.datei) zeilen.push(betriebZeile('Datei', id(a.datei), a.sizeBytes ? esc(mbText(a.sizeBytes)) : ''))
    } else {
      const ex = a.exportedAt ? berlinTeile(a.exportedAt) : null
      if (ex) zeilen.push(betriebZeile('Stand der Datei', w(`${datumLangBerlin(ex)}, ${uhrText(ex)} Uhr`)))
      if (a.zahlen) zeilen.push(betriebZeile('Wiederhergestellt', w(`${anzahlText(a.zahlen.lemmata || 0, 'Wort', 'Wörter')} · ${anzahlText(a.zahlen.kalender || 0, 'Kalendertag', 'Kalendertage')}`)))
      if (typeof a.mitStatistik === 'boolean') zeilen.push(betriebZeile('Spielstatistik', w(a.mitStatistik ? 'ersetzt' : 'unverändert')))
      if (a.sicherheitskopie) zeilen.push(betriebZeile('Sicherheitskopie', id(a.sicherheitskopie)))
    }
  } else if (e.resource === 'security') {
    if (det.reason && e.action === 'LOGIN_FAIL') zeilen.push(betriebZeile('Grund', w(ANMELDE_GRUENDE[det.reason] || det.reason)))
    if (det.reason && e.action !== 'LOGIN_FAIL') zeilen.push(betriebZeile('Grund', w(det.reason)))
    if (det.country) zeilen.push(betriebZeile('Land', w(det.country)))
    if (det.deleted != null) zeilen.push(betriebZeile('Beendet', w(anzahlText(det.deleted, 'Sitzung', 'Sitzungen'))))
    if (det.userId) zeilen.push(betriebZeile('Konto', kontoLink(det.userId)))
  }
  zeilen.push(betriebZeile('Ergebnis', w(fehlgeschlagen(e) ? 'fehlgeschlagen' : 'erfolgreich', fehlgeschlagen(e) ? 'err' : ''), e.error ? esc(e.error) : ''))
  zeilen.push(betriebZeile('Quelle', w(protokollQuelle(e))))
  if (e.ip && e.ip !== 'cli') zeilen.push(betriebZeile('IP-Adresse', w(e.ip), 'wird nach 30 Tagen entfernt'))
  const emailHinweis = (k === 'user:DELETE' && b.email)
    ? '<p class="pr-detail-hinweis">Die E-Mail-Adresse steht hier nur als Nachweis der Löschung. Nicht kopieren oder weitergeben; sie verschwindet mit dem Eintrag nach 24 Monaten.</p>'
    : ''
  return `<div class="pr-detail" id="pr-detail-${i}" hidden>`
    + `<dl class="tag-dl be-dl">${zeilen.join('')}</dl>${emailHinweis}`
    + `<details class="be-roh"><summary>Rohdaten anzeigen</summary><pre role="region" aria-label="Rohdaten des Eintrags">${esc(JSON.stringify(e, null, 2))}</pre></details>`
    + '</div>'
}

function protokollFilter() {
  const wert = (id) => document.getElementById(id)?.value || ''
  return { q: wert('audit-search').trim(), resource: wert('audit-resource'), action: wert('audit-action'), status: wert('audit-status'), from: wert('audit-from'), to: wert('audit-to') }
}
const protokollFilterAktiv = (f) => !!(f.q || f.resource || f.action || f.status || f.from || f.to)

let protokollLadeTimer = null

async function loadAuditLog() {
  const liste = document.getElementById('audit-liste')
  const zaehler = document.getElementById('audit-count')
  if (!liste) return
  const token = ++protokollToken
  if (protokollLadeTimer) window.clearTimeout(protokollLadeTimer)
  const f = protokollFilter()
  // „Von“ nach „Bis“: Es kann keine Treffer geben, der Server wird gar nicht erst gefragt
  if (f.from && f.to && f.from > f.to) {
    protokollEintraege = []
    protokollGesamt = 0
    protokollBegrenzt = false
    renderProtokoll({ hinweis: 'Das Von-Datum liegt nach dem Bis-Datum. Dazu gibt es keine Einträge.' })
    return
  }
  // Der Ladetext erscheint erst, wenn die Antwort länger als 400 ms braucht (sonst spricht er bei jedem Filter)
  protokollLadeTimer = window.setTimeout(() => {
    if (token === protokollToken && zaehler) zaehler.textContent = 'Protokoll wird geladen …'
  }, 400)
  const params = new URLSearchParams({ limit: String(protokollLimit) })
  for (const [k, v] of Object.entries(f)) if (v) params.set(k, v)
  try {
    const data = await holeJson(`/admin/audit-log?${params}`)
    if (token !== protokollToken) return
    window.clearTimeout(protokollLadeTimer)
    protokollEintraege = Array.isArray(data.entries) ? data.entries : []
    protokollGesamt = Number(data.totalMatches ?? protokollEintraege.length)
    protokollBegrenzt = !!data.begrenzt
    protokollDurchsuchtMax = Number(data.durchsuchtMax || 0)
    renderProtokoll()
  } catch (err) {
    if (token !== protokollToken) return
    window.clearTimeout(protokollLadeTimer)
    protokollEintraege = []
    // Die Zahlzeile ist die Live-Region: Auch der Fehler wird dort angesagt
    if (zaehler) zaehler.textContent = 'Das Protokoll konnte nicht geladen werden.'
    document.getElementById('audit-mehr')?.setAttribute('hidden', '')
    const reset = document.getElementById('audit-reset')
    if (reset) reset.hidden = !protokollFilterAktiv(f)
    liste.innerHTML = `<p class="wo-meldung" data-tone="err">${esc(err.message)} <button type="button" class="adm-link" data-action="audit-laden">Erneut versuchen</button></p>`
  }
}

function renderProtokoll({ hinweis = '' } = {}) {
  const f = protokollFilter()
  const liste = document.getElementById('audit-liste')
  const zaehler = document.getElementById('audit-count')
  const mehr = document.getElementById('audit-mehr')
  const reset = document.getElementById('audit-reset')
  if (!liste || !zaehler || !mehr || !reset) return
  const gezeigt = protokollEintraege
  const gesamt = protokollGesamt
  reset.hidden = !protokollFilterAktiv(f)
  // Von nach Bis: Beide Felder tragen die Meldung
  for (const id of ['audit-from', 'audit-to']) {
    const el = document.getElementById(id)
    if (!el) continue
    if (hinweis) {
      el.setAttribute('aria-invalid', 'true')
      el.setAttribute('aria-describedby', 'audit-count')
    } else {
      el.removeAttribute('aria-invalid')
      el.removeAttribute('aria-describedby')
    }
  }
  const begrenztText = protokollBegrenzt ? ` · nur die neuesten ${ganzzahlDe(protokollDurchsuchtMax)} durchsucht` : ''
  // Auch „nichts gefunden“ steht in der Zahlzeile: Sie ist die Live-Region, die leere Liste sagt nichts an
  zaehler.textContent = hinweis || (!gesamt
    ? (protokollFilterAktiv(f) ? 'Keine Treffer' : 'Noch keine Einträge')
    : (gezeigt.length < gesamt
      ? `${ganzzahlDe(gezeigt.length)} von ${anzahlText(gesamt, 'Eintrag', 'Einträgen')} angezeigt`
      : anzahlText(gesamt, 'Eintrag', 'Einträge')) + begrenztText)
  const kannMehr = gezeigt.length < gesamt && protokollLimit < PROTOKOLL_MAX
  mehr.hidden = !kannMehr
  if (kannMehr) mehr.textContent = `${ganzzahlDe(Math.min(PROTOKOLL_SEITE, PROTOKOLL_MAX - protokollLimit, gesamt - gezeigt.length))} weitere anzeigen`

  if (!gezeigt.length) {
    // „Filter zurücksetzen“ steht schon neben der Zahl: nicht noch einmal
    liste.innerHTML = protokollFilterAktiv(f)
      ? '<div class="li-leer"><p class="li-leer-titel">Keine Einträge</p><p class="li-leer-text">Für diese Filter gibt es keine Einträge.</p></div>'
      : '<div class="li-leer"><p class="li-leer-titel">Noch keine Einträge</p><p class="li-leer-text">Sobald im Admin-Bereich etwas gespeichert, gelöscht oder angemeldet wird, steht es hier.</p><p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>'
    return
  }
  const gruppen = new Map()
  gezeigt.forEach((e, i) => {
    const t = berlinTeile(e.timestamp)
    const key = t ? t.iso : 'unbekannt'
    if (!gruppen.has(key)) gruppen.set(key, { t, eintraege: [] })
    gruppen.get(key).eintraege.push([e, i])
  })
  let html = [...gruppen].map(([key, { t, eintraege }]) => {
    // Wochentag: sichtbar gekürzt, vorgelesen ausgeschrieben, mit Trennung zum Datum (sonst „Fr23.10.2026“)
    const kopf = t
      ? `<span class="nu-wt" aria-hidden="true">${DAYS_DE[t.wt]}</span><span class="adm-visually-hidden">${WOCHENTAGE_LANG[t.wt]}, </span>${esc(`${zwei(t.d)}.${zwei(t.m)}.${t.y}`)}`
      : 'Zeit unbekannt'
    return `<section class="li-gruppe" aria-labelledby="pr-tag-${esc(key)}">`
      + `<h2 class="li-monat" id="pr-tag-${esc(key)}"><span class="li-monat-name">${kopf}</span>`
      + `<span class="li-monat-zahl">${esc(anzahlText(eintraege.length, 'Eintrag', 'Einträge'))}</span></h2>`
      + '<ol class="pr-liste">' + eintraege.map(([e, i]) => {
        const offen = protokollOffen.has(protokollSchluessel(e))
        const zeit = berlinTeile(e.timestamp)
        return `<li class="pr-eintrag${offen ? ' is-offen' : ''}" data-aktion="${esc(e.action)}">`
          + `<button type="button" class="pr-zeile" aria-expanded="${offen}" aria-controls="pr-detail-${i}" data-action="audit-detail" data-index="${i}">`
          + `<span class="pr-zeit">${zeit ? uhrText(zeit) : '–'}</span>`
          + `<span class="pr-satz">${esc(protokollSatz(e))}</span>`
          + `<span class="pr-meta"><span>${esc(PROTOKOLL_BEREICHE[e.resource] || e.resource || '')}</span>${fehlgeschlagen(e) ? '<span class="pr-ergebnis">fehlgeschlagen</span>' : ''}</span>`
          + '<span class="pr-auf" aria-hidden="true"></span></button>'
          + protokollDetail(e, i).replace(' hidden>', offen ? '>' : ' hidden>') + '</li>'
      }).join('') + '</ol></section>'
  }).join('')
  if (protokollBegrenzt) {
    html += `<p class="pr-detail-hinweis">Nur die neuesten ${esc(ganzzahlDe(protokollDurchsuchtMax))} Einträge wurden durchsucht. Mit Filtern lässt sich das Protokoll eingrenzen.</p>`
  } else if (gezeigt.length < gesamt && protokollLimit >= PROTOKOLL_MAX) {
    html += `<p class="pr-detail-hinweis">Es werden höchstens ${esc(ganzzahlDe(PROTOKOLL_MAX))} Einträge angezeigt. Mit Filtern lässt sich das Protokoll eingrenzen.</p>`
  }
  liste.innerHTML = html
}

function schalteProtokollDetail(btn) {
  const offen = btn.getAttribute('aria-expanded') !== 'true'
  btn.setAttribute('aria-expanded', String(offen))
  const detail = document.getElementById(btn.getAttribute('aria-controls'))
  if (detail) detail.hidden = !offen
  btn.closest('.pr-eintrag')?.classList.toggle('is-offen', offen)
  const e = protokollEintraege[Number(btn.dataset.index)]
  if (e) {
    if (offen) protokollOffen.add(protokollSchluessel(e))
    else protokollOffen.delete(protokollSchluessel(e))
  }
}

// Filter geändert: von vorn beginnen (erste Seite, nichts aufgeklappt)
function protokollNeuLaden() {
  protokollLimit = PROTOKOLL_SEITE
  protokollOffen.clear()
  return loadAuditLog()
}

function resetAuditFilters() {
  for (const id of PROTOKOLL_FILTER_IDS) {
    const el = document.getElementById(id)
    if (el) el.value = ''
  }
  void protokollNeuLaden()
  document.getElementById('audit-search')?.focus()
}

function auditMehr() {
  protokollLimit = Math.min(PROTOKOLL_MAX, protokollLimit + PROTOKOLL_SEITE)
  // Der Fokus wartet auf der Zahl, bis die längere Liste da ist (der Knopf kann verschwinden)
  void loadAuditLog().then(() => document.getElementById('audit-count')?.focus({ preventScroll: true }))
}

function planeProtokollSuche() {
  if (protokollSuchTimer) window.clearTimeout(protokollSuchTimer)
  protokollSuchTimer = window.setTimeout(() => {
    protokollSuchTimer = null
    void protokollNeuLaden()
  }, 300)
}

// Beim Abmelden: Protokolldaten, Suchtext und eine gewählte Sicherungsdatei aus Speicher und Seite entfernen.
function betriebZuruecksetzen() {
  stoppeKursAbfrage()
  if (protokollSuchTimer) window.clearTimeout(protokollSuchTimer)
  protokollSuchTimer = null
  protokollToken++
  protokollEintraege = []
  protokollGesamt = 0
  protokollOffen.clear()
  for (const id of PROTOKOLL_FILTER_IDS) {
    const el = document.getElementById(id)
    if (el) el.value = ''
  }
  const liste = document.getElementById('audit-liste')
  if (liste) liste.innerHTML = ''
  restoreLaeuft = false
  restoreAbbrechenStill()
  kursMeldungZuletzt = ''
  setMeldung('course-pdf-status', '')
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
    text.textContent = w || `Basis ${n}`
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

// Meldungen der Listenansicht (Massenlöschen): eigene Zeile in #page-liste, da #status
// zur Tagesseite gehört und dort unsichtbar bliebe. type: 'ok' | 'warn' | 'error' | 'loading'.
function setListStatus(msg, type) {
  const el = document.getElementById('liste-status')
  if (!el) return
  el.textContent = msg || ''
  if (msg && type) el.dataset.tone = type
  else el.removeAttribute('data-tone')
}


// ── Planen › Monat ────────────────────────────────────────────────────────────
// Raster aus Tagesknöpfen mit einem Detail (dieselbe Komponente wie in der Woche,
// renderTagesDetail). Zustand: monatAnsicht, monatGewaehlt – in der Adresse als
// #planen/monat/JJJJ-MM[-TT] (replaceState, kein Verlaufseintrag).

const monatVon = (iso) => iso.slice(0, 7)

function monatVerschoben(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Kurze Adresse für den Normalfall (dieser Monat, heute gewählt oder nichts).
function monatHash() {
  const heute = getTodayIso()
  if (monatAnsicht === monatVon(heute) && (!monatGewaehlt || monatGewaehlt === heute)) return '#planen/monat'
  return `#planen/monat/${monatGewaehlt || monatAnsicht}`
}

function zeigeMonatAusRoute(route) {
  const heute = getTodayIso()
  monatAnsicht = route.tag ? monatVon(route.tag) : (route.monat || monatVon(heute))
  monatGewaehlt = route.tag || (monatVon(heute) === monatAnsicht ? heute : '')
  reiterMerker.monat = currentRouteHash
  renderMonat()
}

function renderMonat() {
  const host = document.getElementById('cal-grid')
  if (!host || !monatAnsicht) return
  const heute = getTodayIso()
  const [y, m] = monatAnsicht.split('-').map(Number)
  const tage = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${monatAnsicht}-${String(i + 1).padStart(2, '0')}`)
  if (monatGewaehlt && !tage.includes(monatGewaehlt)) monatGewaehlt = ''

  const titel = document.getElementById('cal-title')
  const titelText = `${MONTHS_DE[m - 1]} ${y}`
  // Nur bei geändertem Text setzen (jeder Schreibzugriff löst eine Ansage aus)
  if (titel && titel.textContent !== titelText) titel.textContent = titelText
  // erst nach dem ersten Rendern ansagen (wie die Woche), sonst meldet der Screenreader das Laden
  if (titel && !monatLiveAktiv) {
    titel.setAttribute('aria-live', 'polite')
    monatLiveAktiv = true
  }
  document.getElementById('mo-heute-btn')?.setAttribute('aria-disabled', String(monatAnsicht === monatVon(heute)))
  const legendeHeute = document.getElementById('mo-legende-heute')
  if (legendeHeute) legendeHeute.textContent = String(datumTeile(heute).d)
  document.getElementById('mo-leiste')?.classList.toggle('is-hidden', kalenderStatus === 'fehler')
  document.querySelector('#page-calendar .mo-wt-kopf')?.classList.toggle('is-hidden', kalenderStatus !== 'ok')
  const bilanz = document.getElementById('mo-bilanz')

  if (kalenderStatus === 'fehler') {
    if (bilanz) bilanz.textContent = ''
    // wie renderWoche: Meldung nur einmal aufbauen (Fokus, keine Mehrfachansage)
    let knopf = host.querySelector('.wo-meldung[data-tone="err"] [data-action="load-kalender"]')
    if (!knopf) {
      host.innerHTML = '<p class="wo-meldung" data-tone="err" role="alert">Der Kalender konnte nicht geladen werden. <button type="button" class="adm-link" data-action="load-kalender">Erneut versuchen</button></p>'
      knopf = host.querySelector('[data-action="load-kalender"]')
    }
    knopf.setAttribute('aria-disabled', String(kalenderLaedtNeu))
    const knopfText = kalenderLaedtNeu ? 'Monat wird geladen …' : 'Erneut versuchen'
    if (knopf.textContent !== knopfText) knopf.textContent = knopfText
    return
  }
  if (kalenderStatus !== 'ok') {
    if (bilanz) bilanz.textContent = ''
    host.innerHTML = '<p class="wo-meldung">Monat wird geladen …</p>'
    return
  }

  const z = { vollstaendig: 0, teilweise: 0, leer: 0 }
  tage.forEach((d) => { z[tagesStand(kalenderData[d]).zustand]++ })
  if (bilanz) bilanz.textContent = monatBilanzText(z, tage.length)

  // Fokus merken: gleicher Tag, Überschrift des Details oder der Knopf der Fehlermeldung
  const aktiv = document.activeElement
  const fokusTag = host.contains(aktiv) ? (aktiv.closest('.mo-tag')?.dataset.value || '') : ''
  const fokusImDetail = !!aktiv?.closest?.('#calendar-details')
  const fokusInMeldung = host.contains(aktiv) && !!aktiv.closest('.wo-meldung')

  host.innerHTML = tage.map((d) => monatTagHtml(d, heute)).join('')
    + (monatGewaehlt
      ? '<div class="wo-detail mo-detail" id="calendar-details"></div>'
      : '<p class="mo-hinweis" id="calendar-details">Tag wählen, um Einzelheiten zu sehen.</p>')
  if (monatGewaehlt) {
    const detail = document.getElementById('calendar-details')
    renderTagesDetail(monatGewaehlt, detail, { ansicht: 'monat' })
    monatDetailPlatzieren()
  }
  if (fokusTag) host.querySelector(`.mo-tag[data-value="${CSS.escape(fokusTag)}"]`)?.focus({ preventScroll: true })
  else if (fokusImDetail) host.querySelector('.wo-detail-thema')?.focus({ preventScroll: true })
  // „Erneut versuchen“ war erfolgreich: Der Knopf ist weg, der gewählte Tag (sonst die Monatsüberschrift) übernimmt den Fokus
  else if (fokusInMeldung) {
    const ziel = monatGewaehlt ? host.querySelector(`.mo-tag[data-value="${CSS.escape(monatGewaehlt)}"]`) : document.getElementById('cal-title')
    ziel?.focus({ preventScroll: true })
  }
}

// Das Detail hängt im DOM hinter dem letzten Tag der Woche des gewählten Tags (Fokusreihenfolge = Optik) und
// zeigt sich dort über die volle Rasterbreite. In der Tagesliste (eine Spalte) steht es direkt hinter dem Tag.
function monatDetailPlatzieren() {
  const host = document.getElementById('cal-grid')
  const detail = document.getElementById('calendar-details')
  if (!host || !detail?.classList.contains('mo-detail') || !monatGewaehlt) return
  const tage = [...host.querySelectorAll('.mo-tag')]
  const i = tage.findIndex((b) => b.dataset.value === monatGewaehlt)
  if (i < 0) return
  const spalten = getComputedStyle(host).gridTemplateColumns.split(' ').length
  const anker = tage[spalten > 1 ? Math.min(i + 6 - Number(tage[i].dataset.wt), tage.length - 1) : i]
  if (anker.nextElementSibling === detail) return
  const aktiv = document.activeElement
  anker.after(detail)
  if (aktiv && detail.contains(aktiv) && document.activeElement !== aktiv) aktiv.focus({ preventScroll: true })
}

// Wechselt das Raster zwischen Spalten und Tagesliste (Container-Abfrage), ändert sich die Stelle des Details.
;(function beobachteMonatRaster() {
  const host = document.getElementById('cal-grid')
  if (!host || typeof ResizeObserver === 'undefined') return
  new ResizeObserver(() => monatDetailPlatzieren()).observe(host)
})()

// „6 von 30 Tagen vollständig · 7 unvollständig · 17 leer“ (Nullwerte entfallen)
function monatBilanzText(z, anzahl) {
  if (z.vollstaendig === anzahl) return 'Alle Tage vollständig geplant'
  if (z.leer === anzahl) return 'Noch nichts geplant'
  return [`${z.vollstaendig} von ${anzahl} Tagen vollständig`,
    z.teilweise ? `${z.teilweise} unvollständig` : '',
    z.leer ? `${z.leer} leer` : ''].filter(Boolean).join(' · ')
}

function monatTagHtml(datum, heute) {
  const entry = kalenderData?.[datum] || null
  const stand = tagesStand(entry)
  const t = datumTeile(datum)
  const istHeute = datum === heute
  const bonus = isFreeAccessDay(datum)
  const vorschlag = !entry && hatOffenenVorschlag(datum)
  // Leere Tage tragen keine Marken (30 Zellen mit je vier leeren Marken wären Rauschen)
  const marken = stand.zustand === 'leer' ? '' : `<span class="wo-marken" aria-hidden="true">${stand.modi.map((mo) => (mo.geplant
    ? `<span class="wo-marke" data-m="${mo.marke}">${mo.buchstabe}</span>`
    : '<span class="wo-marke is-fehlt"></span>')).join('')}</span>`
  const zeichen = (vorschlag ? '<span class="mo-vorschlag"><span class="mo-zeichen-kurz">V</span><span class="mo-zeichen-lang">Vorschlag</span></span>' : '')
    + (bonus ? '<span class="mo-bonus"><span class="mo-zeichen-kurz">✦</span><span class="mo-zeichen-lang wo-bonus">Bonus</span></span>' : '')
  // Stand für Screenreader; die Marken und Zeichen sind aria-hidden
  const sr = [
    stand.zustand === 'vollstaendig' ? 'vollständig' : stand.zustand === 'leer' ? 'nichts geplant' : `${stand.anzahl} von ${MODI.length} Modi, ${fehltText(stand)}`,
    bonus ? 'Bonus-Tag' : '',
    vorschlag ? 'Vorschlag liegt vor' : '',
  ].filter(Boolean).join(', ')
  const gewaehlt = datum === monatGewaehlt
  // Der Name enthält die sichtbare Zahl (WCAG 2.5.3): „Freitag, 13. November, Thema, 3 von 4 Modi …“
  return `<button type="button" class="mo-tag${gewaehlt ? ' is-gewaehlt' : ''}${datum < heute ? ' is-vergangen' : ''}"`
    + ` data-action="select-monat-tag" data-value="${esc(datum)}" data-wt="${t.wt}" aria-expanded="${gewaehlt}" aria-controls="calendar-details"${istHeute ? ' aria-current="date"' : ''}>`
    + `<span class="mo-tag-kopf"><span class="mo-tag-wt" aria-hidden="true">${DAYS_DE[t.wt]}</span>`
    // Ein einziger versteckter Name („Mittwoch, 14. Oktober, heute“); die sichtbare Zahl bleibt für Screenreader stumm
    + `<span class="mo-tag-zahl"><span class="adm-visually-hidden">${WOCHENTAGE_LANG[t.wt]}, ${t.d}. ${MONTHS_DE[t.m - 1]}${istHeute ? ', heute' : ''}</span><span aria-hidden="true">${t.d}</span></span>`
    + (istHeute ? '<span class="mo-heute" aria-hidden="true">heute</span>' : '') + '</span>'
    + (entry?.thema ? `<span class="mo-tag-thema"><span class="adm-visually-hidden">, </span>${esc(entry.thema)}</span>` : '')
    + marken
    + `<span class="mo-tag-zeichen" aria-hidden="true">${zeichen}</span>`
    + `<span class="adm-visually-hidden">, ${esc(sr)}</span></button>`
}

// Auswahl ohne Neuzeichnen (wie selectDashboardDay): Der Fokus bleibt auf dem Tag.
function selectMonatTag(datum, { perZeiger = false } = {}) {
  const host = document.getElementById('cal-grid')
  const tag = host?.querySelector(`.mo-tag[data-value="${CSS.escape(datum)}"]`)
  if (!tag) return
  monatGewaehlt = datum
  let detail = document.getElementById('calendar-details')
  if (!detail?.classList.contains('mo-detail')) {
    const neu = document.createElement('div')
    neu.className = 'wo-detail mo-detail'
    neu.id = 'calendar-details'
    if (detail) detail.replaceWith(neu)
    detail = neu
  }
  host.querySelectorAll('.mo-tag').forEach((b) => {
    const an = b === tag
    b.classList.toggle('is-gewaehlt', an)
    b.setAttribute('aria-expanded', String(an))
  })
  renderTagesDetail(datum, detail, { ansicht: 'monat' })
  monatDetailPlatzieren()
  merkeAnsicht('monat', monatHash())
  // Im Raster steht das Detail unter dem Monat: bei Klick/Tipp ggf. ins Bild holen
  if (perZeiger && detail.getBoundingClientRect().top > window.innerHeight - 80) {
    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    detail.scrollIntoView({ block: 'nearest', behavior: ruhig ? 'auto' : 'smooth' })
  }
}

function wechsleMonat(delta) {
  const heute = getTodayIso()
  monatAnsicht = monatVerschoben(monatAnsicht || monatVon(heute), delta)
  monatGewaehlt = monatVon(heute) === monatAnsicht ? heute : ''
  renderMonat()                       // Der Fokus bleibt auf dem Navigationsknopf (liegt außerhalb der Tage)
  merkeAnsicht('monat', monatHash())
}

function zeigeDiesenMonat() {
  const heute = getTodayIso()
  if (monatAnsicht === monatVon(heute)) return
  monatAnsicht = monatVon(heute)
  monatGewaehlt = heute
  renderMonat()
  merkeAnsicht('monat', monatHash())
}

const MONAT_TASTEN = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']

// Pfeile: ein Tag bzw. eine Woche; Pos1/Ende: Wochenanfang/-ende; Bild auf/ab: Vor-/Folgemonat.
// Über den Monatsrand hinaus wechselt der Monat, und der Zieltag bekommt den Fokus.
function monatTaste(taste, target) {
  const datum = target.dataset.value
  const spalten = getComputedStyle(target.parentElement).gridTemplateColumns.split(' ').length   // 1 = Tagesliste
  const wt = datumTeile(datum).wt
  const ersterTag = `${monatAnsicht}-01`
  const letzterTag = addTageIso(`${monatVerschoben(monatAnsicht, 1)}-01`, -1)
  let ziel
  if (taste === 'ArrowLeft') ziel = addTageIso(datum, -1)
  else if (taste === 'ArrowRight') ziel = addTageIso(datum, 1)
  else if (taste === 'ArrowUp') ziel = addTageIso(datum, spalten > 1 ? -7 : -1)
  else if (taste === 'ArrowDown') ziel = addTageIso(datum, spalten > 1 ? 7 : 1)
  else if (taste === 'Home') ziel = addTageIso(datum, -wt) < ersterTag ? ersterTag : addTageIso(datum, -wt)
  else if (taste === 'End') ziel = addTageIso(datum, 6 - wt) > letzterTag ? letzterTag : addTageIso(datum, 6 - wt)
  else {
    const ym = monatVerschoben(monatVon(datum), taste === 'PageUp' ? -1 : 1)
    const [y, m] = ym.split('-').map(Number)
    ziel = `${ym}-${String(Math.min(Number(datum.slice(8)), new Date(y, m, 0).getDate())).padStart(2, '0')}`
  }
  if (monatVon(ziel) !== monatAnsicht) wechsleMonat(monatVon(ziel) > monatAnsicht ? 1 : -1)
  document.querySelector(`#cal-grid .mo-tag[data-value="${CSS.escape(ziel)}"]`)?.focus()
}

// „In der Woche zeigen“: Woche auf die Woche des Tages stellen, Tag dort gewählt.
function zeigeWocheVon(datum) {
  if (!isValidIsoDay(datum)) return
  const montag = addTageIso(datum, -datumTeile(datum).wt)
  const diffTage = Math.round((new Date(`${montag}T12:00:00`) - new Date(`${wochenMontag(0)}T12:00:00`)) / 86400000)
  dashboardWeekOffset = Math.round(diffTage / 7)
  selectedDashboardDate = datum
  renderWoche()
  naechsterFokus = '#dashboard-calendar-preview .wo-tag.is-gewaehlt'
  navigate('#planen')
}

// Leert das Tagesformular und setzt das Datum. Die Seite selbst zeigt der
// Router (#planen/tag/…); die Rückfrage zu ungespeicherten Änderungen hat er beim
// Seitenwechsel schon gestellt. keepDraft lässt einen gespeicherten Entwurf
// bestehen (Router-Pfad).
function prefillDate(isoDate, { keepDraft = false } = {}) {
  setEntryMode('new')
  setEntryLoadError('')
  selectedCalendarDate = ''
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
  captureEntryFormSnapshot({ keepDraft })
  aktualisiereDatumHinweis()
  scrollNachOben()
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
  const fehlend = [['datum', 'Datum'], ['w1', 'Basis 1'], ['w2', 'Basis 2'], ['w3', 'Basis 3']]
    .filter(([id]) => !normalizeText(document.getElementById(id)?.value || ''))
  loescheAlleFeldFehler()
  if (fehlend.length) {
    fehlend.forEach(([id, name]) => setzeFeldFehler(id, `${name} fehlt.`))
    document.getElementById(fehlend[0][0])?.focus()
    return setStatus(`Nicht gespeichert: Es ${fehlend.length === 1 ? 'fehlt' : 'fehlen'} ${aufzaehlung(fehlend.map(([, name]) => name))}.`, 'error')
  }

  // Links erscheinen in der App: nur leer oder http(s)://… (wie beim Wort der Woche).
  // Die Felder liegen in zugeklappten Bereichen, deshalb vorher aufklappen.
  const falscheLinks = [['l1', l1, 'koll-extras-1'], ['l2', l2, 'koll-extras-2'], ['l3', l3, 'koll-extras-3'], ['wz-link', wzLink, 'wz-extras'], ['zw-link', zwLink, 'zw-extras']]
    .filter(([, wert]) => wert && !LINK_HTTP.test(wert))
  if (falscheLinks.length) {
    falscheLinks.forEach(([id, , bereich]) => {
      showExtraFields(bereich)
      setzeFeldFehler(id, 'Der Link muss mit http:// oder https:// beginnen.')
    })
    document.getElementById(falscheLinks[0][0])?.focus()
    return setStatus('Nicht gespeichert: Ein Link muss mit http:// oder https:// beginnen.', 'error')
  }

  // Speichern ersetzt einen bestehenden Tag, wenn das Datum nicht der geladene Tag ist
  // (Neuer Tag mit belegtem Datum, geändertes Datum): vorher bestätigen lassen.
  const geladenerTag = entryFormMode === 'edit' ? selectedCalendarDate : ''
  if (kalenderStatus === 'ok' && kalenderData[datum] && datum !== geladenerTag
      && !(await bestaetige({ frage: `Für ${datumKurz(datum)} gibt es schon einen Tag. Ersetzen?`, aktion: 'Ersetzen' }))) return

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
  if (!(await bestaetige({ frage: `Tag ${datumLang(geloescht, { jahr: true })} löschen?`, details, aktion: 'Löschen' }))) return
  // Während der Rückfrage kann sich etwas geändert haben (anderer Tag geöffnet, Speichern gestartet): dann nichts löschen.
  if (loeschtGerade || speichertGerade || selectedCalendarDate !== geloescht) return

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
    // Die Rückfrage zu ungespeicherten Änderungen war Teil der Lösch-Rückfrage.
    prefillDate(currentDate)
    if (currentRoute?.entry && isValidIsoDay(currentDate)) setEntryHead('neu', currentDate)
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
    renderMonat()
    renderListe()
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

    updateDashboardFromKalender()
    renderMonat()
    renderListe()
    aktualisiereSchwersteTage()
  } catch {
    kalenderData = {}
    kalenderStatus = 'fehler'
    kalenderLaedtNeu = false
    selectedCalendarDate = ''
    selectedEntryDates.clear()
    updateDashboardFromKalender()
    renderMonat()
    renderListe()
    if (currentRoute?.page === 'entry') aktualisiereDatumHinweis()
  }
}

// ── Planen › Liste ────────────────────────────────────────────────────────────
// Linien-Liste, nach Monaten gruppiert. Filter (Suche, Zeitraum, Stand), Seite und
// Seitengröße stehen in listeZustand und in der Adresse (#planen/liste?q=…&zeit=…).
// Die Mehrfachauswahl (selectedEntryDates) steht bewusst nicht in der Adresse.

let listeZustand = { ...LISTE_STANDARD }
let loeschtListeGerade = false
const ansageTimer = new Map()   // Ansage-Element-ID → Timer (Liste der Tage und Nutzer teilen planeAnsage)
// validate.js: adminBulkDeleteCalendarSchema erlaubt höchstens 180 Tage je Anfrage
const MAX_LOESCHEN = 180

// Dieselben Weißlisten wie leseListeQuery, für Zustand aus der Bedienung
function normalisiereListe(z) {
  return {
    q: String(z.q ?? '').slice(0, 100),
    zeit: LISTE_ZEITEN.includes(z.zeit) ? z.zeit : LISTE_STANDARD.zeit,
    stand: LISTE_STAENDE.includes(z.stand) ? z.stand : LISTE_STANDARD.stand,
    seite: Math.max(1, Math.floor(Number(z.seite)) || 1),
    pro: LISTE_GROESSEN.includes(Number(z.pro)) ? Number(z.pro) : LISTE_STANDARD.pro,
  }
}

// Text nur bei Änderung schreiben: Jeder Schreibzugriff auf eine Live-Region löst eine Ansage aus.
function setzeText(el, text) {
  if (el && el.textContent !== text) el.textContent = text
}

function passtStand(stand, filter) {
  if (filter === 'unvollstaendig') return stand.zustand !== 'vollstaendig'
  if (filter === 'vollstaendig') return stand.zustand === 'vollstaendig'
  if (filter.startsWith('ohne-')) return !stand.modi.find((m) => m.key === filter.slice(5))?.geplant
  return true
}

// Eine Filterfunktion für Anzeige, „Alle Treffer wählen“ und die Bereinigung der Auswahl.
function listeTreffer() {
  const heute = getTodayIso()
  const q = listeZustand.q.trim().toLowerCase()
  let tage = Object.keys(kalenderData || {}).filter(isValidIsoDay).sort()
  if (listeZustand.zeit === 'kommend') tage = tage.filter((d) => d >= heute)
  else if (listeZustand.zeit === 'vergangen') tage = tage.filter((d) => d < heute).reverse()
  return tage.filter((datum) => {
    const entry = kalenderData[datum]
    const stand = tagesStand(entry)
    if (!passtStand(stand, listeZustand.stand)) return false
    if (!q) return true
    return [datum, formatIsoDate(datum), datumKurz(datum), datumLang(datum, { jahr: true }), entry?.thema, entry?.thema_kurz,
      ...stand.modi.flatMap((m) => m.items)].join(' ').toLowerCase().includes(q)
  })
}

const istStandardFilter = () => !listeZustand.q && listeZustand.zeit === LISTE_STANDARD.zeit && listeZustand.stand === LISTE_STANDARD.stand

// Ansage der Ergebniszahl erst nach 700 ms Ruhe (beim Tippen sonst bei jedem Zwischenstand)
function planeAnsage(text, id = 'entry-ansage') {
  const el = document.getElementById(id)
  if (!el) return
  if (ansageTimer.has(id)) window.clearTimeout(ansageTimer.get(id))
  ansageTimer.set(id, window.setTimeout(() => {
    ansageTimer.delete(id)
    el.textContent = ''
    el.textContent = text
  }, 700))
}

// opts.felderErzwingen: Eingabefelder aus dem Zustand setzen, auch das fokussierte (Zustand kam aus der Adresse)
// opts.ansage: Änderung der Ergebniszahl ansagen (Nutzer hat gefiltert)
function renderListe({ felderErzwingen = false, ansage = false } = {}) {
  const host = document.getElementById('entry-table-body')
  if (!host) return
  const setze = (id, wert) => {
    const el = document.getElementById(id)
    if (el && (felderErzwingen || el !== document.activeElement) && el.value !== String(wert)) el.value = String(wert)
  }
  setze('entry-search', listeZustand.q)
  setze('entry-sort', listeZustand.zeit)
  setze('entry-mode-filter', listeZustand.stand)
  setze('entry-page-size', listeZustand.pro)
  const zuruecksetzen = document.getElementById('entry-filter-reset')
  zuruecksetzen.hidden = istStandardFilter()
  const leiste = document.getElementById('entry-auswahlleiste')
  const seitenNav = document.getElementById('entry-pagination')
  const zahl = document.getElementById('entry-count')

  if (kalenderStatus !== 'ok') {
    leiste.hidden = true
    seitenNav.hidden = true
    zahl.parentElement.hidden = true
    setzeText(zahl, '')
    if (kalenderStatus === 'fehler') {
      // Meldung nur einmal aufbauen, damit der Fokus auf „Erneut versuchen“ bleibt
      let knopf = host.querySelector('.wo-meldung[data-tone="err"] [data-action="load-kalender"]')
      if (!knopf) {
        host.innerHTML = '<p class="wo-meldung" data-tone="err" role="alert">Der Kalender konnte nicht geladen werden. <button type="button" class="adm-link" data-action="load-kalender">Erneut versuchen</button></p>'
        knopf = host.querySelector('[data-action="load-kalender"]')
      }
      knopf.setAttribute('aria-disabled', String(kalenderLaedtNeu))
      const knopfText = kalenderLaedtNeu ? 'Liste wird geladen …' : 'Erneut versuchen'
      if (knopf.textContent !== knopfText) knopf.textContent = knopfText
    } else {
      host.innerHTML = '<p class="wo-meldung">Liste wird geladen …</p>'
    }
    return
  }

  const aktiv = document.activeElement
  const fokusInMeldung = host.contains(aktiv) && !!aktiv.closest('.wo-meldung')
  const treffer = listeTreffer()
  // Die Auswahl gilt nur für Treffer: Was der Filter ausblendet, wird abgewählt.
  const trefferSet = new Set(treffer)
  for (const d of [...selectedEntryDates]) if (!trefferSet.has(d)) selectedEntryDates.delete(d)

  const seiten = Math.max(1, Math.ceil(treffer.length / listeZustand.pro))
  if (listeZustand.seite > seiten) {
    listeZustand = { ...listeZustand, seite: seiten }
    merkeAnsicht('liste', listeHash(listeZustand))
  }
  const start = (listeZustand.seite - 1) * listeZustand.pro
  const seite = treffer.slice(start, start + listeZustand.pro)

  const leer = !treffer.length
  const zahlText = listeZahlText(treffer.length)
  const zahlGeaendert = zahl.textContent !== zahlText
  setzeText(zahl, zahlText)
  // Ohne Treffer steht „Filter zurücksetzen“ im Leerzustand; „Nichts geplant“ braucht keine Zählzeile darüber
  zuruecksetzen.hidden = istStandardFilter() || leer
  zahl.parentElement.hidden = leer && istStandardFilter()
  if (ansage && zahlGeaendert) planeAnsage(zahlText)
  leiste.hidden = leer
  if (leer) {
    host.innerHTML = listeLeerHtml()
  } else {
    const gruppen = new Map()
    seite.forEach((d) => {
      const k = monatVon(d)
      if (!gruppen.has(k)) gruppen.set(k, [])
      gruppen.get(k).push(d)
    })
    const heute = getTodayIso()
    host.innerHTML = [...gruppen].map(([k, tage]) => {
      const [y, m] = k.split('-').map(Number)
      // Überschrift „Mai 2026, 2 Tage“ (versteckter Trenner); keine Region je Monat
      return '<section class="li-gruppe"><h2 class="li-monat">'
        + `<span class="li-monat-name">${MONTHS_DE[m - 1]} ${y}</span><span class="adm-visually-hidden">, </span><span class="li-monat-zahl">${tage.length} ${tage.length === 1 ? 'Tag' : 'Tage'}</span></h2>`
        + `<ul class="li-tage">${tage.map((d) => listeZeileHtml(d, heute)).join('')}</ul></section>`
    }).join('')
  }
  seitenNav.hidden = treffer.length <= LISTE_STANDARD.pro && listeZustand.pro === LISTE_STANDARD.pro
  setzeText(document.getElementById('entry-page-info'), leer ? '' : `Seite ${listeZustand.seite} von ${seiten} · ${start + 1}–${start + seite.length} von ${treffer.length}`)
  document.getElementById('entry-page-prev-btn').setAttribute('aria-disabled', String(listeZustand.seite <= 1))
  document.getElementById('entry-page-next-btn').setAttribute('aria-disabled', String(listeZustand.seite >= seiten))
  aktualisiereAuswahl(treffer, seite)
  // „Erneut versuchen“ war erfolgreich: Der Knopf ist weg, die Ergebniszeile übernimmt den Fokus
  if (fokusInMeldung) (zahl.parentElement.hidden ? document.getElementById('entry-search') : zahl)?.focus({ preventScroll: true })
}

// „14 kommende Tage · 42 insgesamt“ · „3 von 14 kommenden Tagen“ · „42 Tage“
function listeZahlText(n) {
  const heute = getTodayIso()
  const alle = Object.keys(kalenderData || {}).filter(isValidIsoDay)
  const basis = listeZustand.zeit === 'kommend' ? alle.filter((d) => d >= heute).length
    : listeZustand.zeit === 'vergangen' ? alle.filter((d) => d < heute).length : alle.length
  const wort = {
    kommend: ['kommender Tag', 'kommende Tage', 'kommenden Tagen'],
    vergangen: ['vergangener Tag', 'vergangene Tage', 'vergangenen Tagen'],
    alle: ['Tag', 'Tage', 'Tagen'],
  }[listeZustand.zeit]
  if (!listeZustand.q && listeZustand.stand === 'alle') {
    return `${n} ${n === 1 ? wort[0] : wort[1]}${listeZustand.zeit === 'alle' ? '' : ` · ${alle.length} insgesamt`}`
  }
  return `${n} von ${basis} ${wort[2]}`
}

// Leerzustand: Serif-Titel + Text + Ornament, kein Kasten (wie „Keine Lücken“ in der Woche)
function listeLeerHtml() {
  const ohneFilter = istStandardFilter()
  return '<div class="li-leer">'
    + `<p class="li-leer-titel">${ohneFilter ? 'Nichts geplant' : 'Keine Treffer'}</p>`
    + `<p class="li-leer-text">${ohneFilter ? 'Ab heute ist noch kein Tag angelegt.' : 'Für diese Suche gibt es keinen Tag.'}</p>`
    + (ohneFilter ? '<a class="adm-cta" href="#planen/tag/neu"><span>Tag anlegen</span> <span aria-hidden="true">→</span></a>'
      : '<button type="button" class="adm-link" data-action="reset-entry-filters">Filter zurücksetzen</button>')
    + '<p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>'
}

function listeZeileHtml(datum, heute) {
  const entry = kalenderData?.[datum] || null
  const stand = tagesStand(entry)
  const t = datumTeile(datum)
  const lang = datumLang(datum, { jahr: true })
  const koll = stand.modi[0].items.map(esc).join(' · ')
  // Versteckter „: “ zwischen Bezeichnung und Wert, sonst liest der Screenreader „Wort-ZwillingGlaube / Wissen“
  const weitere = stand.modi.slice(1).filter((m) => m.geplant)
    .map((m) => `<li><span class="li-weitere-label">${m.label}</span><span class="adm-visually-hidden">: </span>${m.items.map(esc).join(m.key === 'wortzwilling' ? ' / ' : ' · ')}</li>`).join('')
  const marken = stand.modi.map((m) => (m.geplant
    ? `<span class="wo-marke" data-m="${m.marke}">${m.buchstabe}</span>`
    : '<span class="wo-marke is-fehlt"></span>')).join('')
  const kurz = stand.zustand === 'teilweise' ? `${stand.anzahl} von ${MODI.length}` : ''
  const sr = stand.zustand === 'vollstaendig' ? 'vollständig'
    : stand.zustand === 'leer' ? 'nichts geplant' : `${stand.anzahl} von ${MODI.length} Modi, ${fehltText(stand)}`
  const gewaehlt = selectedEntryDates.has(datum)
  return `<li class="li-tag${gewaehlt ? ' is-gewaehlt' : ''}${datum < heute ? ' is-vergangen' : ''}" data-datum="${esc(datum)}">`
    + `<label class="li-wahl"><input type="checkbox" data-action="toggle-entry-selection" data-datum="${esc(datum)}" aria-label="${esc(lang)} auswählen"${gewaehlt ? ' checked' : ''}></label>`
    + `<span class="li-datum"><span class="li-wt" aria-hidden="true">${DAYS_DE[t.wt]}</span><span class="adm-visually-hidden">${WOCHENTAGE_LANG[t.wt]}, </span>${String(t.d).padStart(2, '0')}.${String(t.m).padStart(2, '0')}.${datum === heute ? '<span class="li-heute">heute</span>' : ''}</span>`
    + `<div class="li-haupt"><p class="li-thema${entry?.thema ? '' : ' is-leer'}">${esc(entry?.thema || 'ohne Thema')}</p>`
    + (koll ? `<p class="li-woerter"><span class="adm-visually-hidden">Kollokationen: </span>${koll}</p>` : '')
    + (weitere ? `<ul class="li-weitere">${weitere}</ul>` : '') + '</div>'
    + `<div class="li-stand"><span class="wo-marken" aria-hidden="true">${marken}</span>${kurz ? `<span class="li-stand-text" aria-hidden="true">${kurz}</span>` : ''}<span class="adm-visually-hidden">${esc(sr)}</span></div>`
    + `<div class="li-aktionen"><a class="li-go" href="#planen/tag/${esc(datum)}">bearbeiten<span class="adm-visually-hidden">: ${esc(lang)}</span></a>`
    + `<a class="adm-link" href="#planen/monat/${esc(datum)}">im Monat<span class="adm-visually-hidden">: ${esc(lang)}</span></a></div></li>`
}

// Zustand ändern (mit denselben Weißlisten wie die Adresse), neu zeichnen und in die Adresse schreiben (ohne Verlaufseintrag).
// fokusSeite: Seitenwechsel – zum Listenanfang scrollen, Fokus auf die Seitenangabe
function aendereListe(teil, { fokusSeite = false } = {}) {
  listeZustand = normalisiereListe({ ...listeZustand, ...teil })
  renderListe({ ansage: true })
  merkeAnsicht('liste', listeHash(listeZustand))
  if (fokusSeite) {
    document.getElementById('entry-count')?.scrollIntoView({ block: 'start' })
    document.getElementById('entry-page-info')?.focus({ preventScroll: true })
  }
}

// Die Suche zeichnet nach 200 ms Pause neu (nicht bei jedem Tastenanschlag).
function scheduleEntryTableRender() {
  if (entrySearchTimer) window.clearTimeout(entrySearchTimer)
  entrySearchTimer = window.setTimeout(() => {
    entrySearchTimer = null
    aendereListe({ q: document.getElementById('entry-search')?.value || '', seite: 1 })
  }, 200)
}

function resetEntryFilters() {
  if (entrySearchTimer) {
    window.clearTimeout(entrySearchTimer)
    entrySearchTimer = null
  }
  aendereListe({ q: '', zeit: LISTE_STANDARD.zeit, stand: LISTE_STANDARD.stand, seite: 1 })
  // Der Knopf ist jetzt weg (oder die Leer-Meldung ersetzt): Fokus zur Suche
  document.getElementById('entry-search')?.focus({ preventScroll: true })
}

function goToEntryPage(delta) {
  aendereListe({ seite: listeZustand.seite + delta }, { fokusSeite: true })
}

// ── Auswahl und Löschen ──────────────────────────────────────────────────────

function aktualisiereAuswahl(treffer = listeTreffer(), seite = null) {
  const host = document.getElementById('entry-table-body')
  if (!host) return
  const seitenTage = seite || [...host.querySelectorAll('.li-tag')].map((li) => li.dataset.datum)
  const n = selectedEntryDates.size
  host.querySelectorAll('.li-tag').forEach((li) => {
    const an = selectedEntryDates.has(li.dataset.datum)
    li.classList.toggle('is-gewaehlt', an)
    const cb = li.querySelector('input[type="checkbox"]')
    if (cb) cb.checked = an
  })
  const aufSeite = seitenTage.filter((d) => selectedEntryDates.has(d)).length
  const master = document.getElementById('entry-select-page')
  master.checked = seitenTage.length > 0 && aufSeite === seitenTage.length
  master.indeterminate = aufSeite > 0 && aufSeite < seitenTage.length
  const zuViele = n > MAX_LOESCHEN
  // „3 ausgewählt · davon 2 auf anderen Seiten · höchstens 180 auf einmal“: Unsichtbares wird mitgelöscht, also nennen
  const teile = n ? [`${n} ausgewählt`] : []
  if (n > aufSeite) teile.push(`davon ${n - aufSeite} auf anderen Seiten`)
  if (zuViele) teile.push(`höchstens ${MAX_LOESCHEN} auf einmal`)
  setzeText(document.getElementById('entry-bulk-count'), teile.join(' · '))
  const alle = document.getElementById('entry-select-all')
  alle.hidden = !(master.checked && treffer.length > seitenTage.length && n < treffer.length)
  setzeText(alle, `Alle ${treffer.length} Treffer wählen`)
  document.getElementById('entry-clear-selection').hidden = n === 0
  const del = document.getElementById('entry-bulk-delete-btn')
  del.hidden = n === 0
  if (!loeschtListeGerade) {
    setzeText(document.getElementById('entry-bulk-delete-text'), `${n} ${n === 1 ? 'Tag' : 'Tage'} löschen …`)
    if (zuViele) del.setAttribute('aria-disabled', 'true')
    else del.removeAttribute('aria-disabled')
  }
  document.getElementById('entry-auswahlleiste').classList.toggle('has-auswahl', n > 0)
  passeAuswahlleisteAn()
}

// Die klebende Leiste hält beim Scrollen Platz frei (scroll-padding-top), damit fokussierte Zeilen nicht
// darunter liegen. Bei großer Schrift wäre sie zu hoch (> 25 % des Fensters): dann klebt sie nicht.
// Zwei Seiten haben eine solche Leiste (Planen › Liste, Nutzer); nur die sichtbare setzt den Abstand.
const AUSWAHLLEISTEN = ['entry-auswahlleiste', 'users-auswahlleiste']

function passeAuswahlleisteAn() {
  let klebendeHoehe = 0
  for (const id of AUSWAHLLEISTEN) {
    const leiste = document.getElementById(id)
    if (!leiste) continue
    const hoehe = leiste.offsetHeight
    const zuHoch = hoehe > window.innerHeight * 0.25
    leiste.classList.toggle('klebt-nicht', zuHoch)
    if (leiste.classList.contains('has-auswahl') && !zuHoch && hoehe > 0) klebendeHoehe = hoehe
  }
  if (klebendeHoehe) document.documentElement.style.setProperty('--liste-leiste-h', `${klebendeHoehe}px`)
  else document.documentElement.style.removeProperty('--liste-leiste-h')
}

;(function beobachteAuswahlleiste() {
  if (typeof ResizeObserver === 'undefined') return
  const beobachter = new ResizeObserver(passeAuswahlleisteAn)
  let gefunden = false
  for (const id of AUSWAHLLEISTEN) {
    const leiste = document.getElementById(id)
    if (leiste) { beobachter.observe(leiste); gefunden = true }
  }
  if (gefunden) window.addEventListener('resize', passeAuswahlleisteAn)
})()

// Einzelnes Kästchen: ohne Neuzeichnen, der Fokus bleibt.
function toggleEntrySelection(datum, an) {
  if (!datum) return
  if (an) selectedEntryDates.add(datum)
  else selectedEntryDates.delete(datum)
  aktualisiereAuswahl()
}

// „Alle auf dieser Seite“: Kästchen im Kopf der Auswahlleiste
function selectEntriesOnPage(an) {
  document.querySelectorAll('#entry-table-body .li-tag').forEach((li) => {
    if (an) selectedEntryDates.add(li.dataset.datum)
    else selectedEntryDates.delete(li.dataset.datum)
  })
  aktualisiereAuswahl()
}

// „Alle N Treffer wählen“ (über alle Seiten des aktuellen Filters)
function selectAllVisibleEntries() {
  listeTreffer().forEach((d) => selectedEntryDates.add(d))
  aktualisiereAuswahl()
  document.getElementById('entry-select-page')?.focus({ preventScroll: true })   // der Knopf ist jetzt weg
}

function clearEntrySelection() {
  selectedEntryDates.clear()
  aktualisiereAuswahl()
  document.getElementById('entry-select-page')?.focus({ preventScroll: true })
}

async function bulkDeleteSelectedDates() {
  const dates = [...selectedEntryDates].sort()
  if (!dates.length || dates.length > MAX_LOESCHEN || loeschtListeGerade) return
  const heute = getTodayIso()
  const vergangen = dates.filter((d) => d < heute).length
  // Ab 9 Tagen die ersten fünf nennen und den Rest zählen: „vom … bis …“ klänge nach einem lückenlosen Bereich
  const details = dates.length <= 8
    ? dates.map((d) => datumLang(d, { jahr: true }))
    : [...dates.slice(0, 5).map((d) => datumLang(d, { jahr: true })), `und ${dates.length - 5} weitere`]
  if (dates.includes(heute)) details.push('Darunter ist der heutige Tag, der gerade gespielt wird.')
  if (vergangen) details.push(`${vergangen} ${vergangen === 1 ? 'Tag liegt' : 'Tage liegen'} in der Vergangenheit.`)
  details.push('Die Wörter und ihre Lückenfüller-Runden bleiben erhalten; der Vorgang steht im Änderungsprotokoll.', 'Das lässt sich nicht rückgängig machen.')
  if (!(await bestaetige({ frage: `${dates.length} ${dates.length === 1 ? 'Tag' : 'Tage'} löschen?`, details, aktion: 'Löschen' }))) return

  const del = document.getElementById('entry-bulk-delete-btn')
  loeschtListeGerade = true
  del.setAttribute('aria-disabled', 'true')          // nicht disabled: Der Fokus bleibt
  document.getElementById('entry-bulk-delete-text').textContent = 'Wird gelöscht …'
  try {
    const response = await fetch('/admin/kalender/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dates }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    selectedEntryDates.clear()
    const weg = data.removedCount || 0
    setListStatus(`${weg} ${weg === 1 ? 'Tag' : 'Tage'} gelöscht.${data.skippedCount ? ` ${data.skippedCount} gab es schon nicht mehr.` : ''}`, 'ok')
    loeschtListeGerade = false
    await loadKalender()
    document.getElementById('liste-status')?.focus()   // der Knopf ist weg
  } catch (err) {
    loeschtListeGerade = false
    setListStatus(`Nicht gelöscht: ${err.message}`, 'error')
    // Bei einem Netzfehler nach erfolgreichem Löschen wäre die Liste sonst veraltet: neu laden (bereinigt auch die Auswahl)
    void loadKalender().then(() => {
      if (!document.activeElement || document.activeElement === document.body) document.getElementById('liste-status')?.focus()
    })
    aktualisiereAuswahl()
    del.focus()
  }
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

// Tagesdetail der Woche; im Monat dieselbe Komponente (detail = #calendar-details, ansicht: 'monat').
function renderTagesDetail(datum, detail = document.getElementById('dashboard-day-detail'), { ansicht = 'woche' } = {}) {
  if (!detail || !datum) return
  const heute = getTodayIso()
  const entry = kalenderData?.[datum] || null
  const stand = tagesStand(entry)
  const vergangen = datum < heute
  const bonus = getFreeDayInfo(datum)
  // Unsichtbarer Zusatz INNERHALB des Text-Spans, sonst entsteht in Chrome eine zweite Flex-Lücke vor dem Pfeil
  const fuer = `<span class="adm-visually-hidden">: ${esc(datumLang(datum))}</span>`
  const over = `${datumLang(datum, { jahr: true })}${datum === heute ? ' · heute' : ''}`
  // Im Monat als erste, gedämpfte Aktion: die Woche des Tages zeigen
  const woche = ansicht === 'monat'
    ? `<button type="button" class="adm-link" data-action="zeige-woche-von" data-value="${esc(datum)}">In der Woche zeigen${fuer}</button>`
    : ''
  const bonusHtml = bonus
    ? `<p class="wo-detail-bonus"><span class="wo-bonus">Bonus</span><span>+${bonus.bonus} Spiele mit eigenem Lemma für Konten mit Basiszugang${bonus.label ? ` · ${esc(bonus.label)}` : ''}</span></p>`
    : ''

  if (!entry) {
    const vorschlag = hatOffenenVorschlag(datum)
    detail.innerHTML = `<div class="wo-detail-kopf">
        <p class="adm-overline wo-detail-over">${esc(over)}</p>
        <h3 class="wo-detail-thema is-leer" tabindex="-1">Noch nichts geplant</h3>
        ${vorschlag ? '<p class="wo-detail-kurz">Für diesen Tag liegt ein Vorschlag vor.</p>' : ''}${bonusHtml}
      </div>
      <div class="wo-detail-aktionen">
        ${woche}${vorschlag ? '<a class="adm-link" href="#vorschlaege">Vorschlag ansehen</a>' : ''}
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
      ${woche}<a class="adm-cta" href="#planen/tag/${esc(datum)}"><span>Tag bearbeiten${fuer}</span> <span aria-hidden="true">→</span></a>
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

// Alle Spiele des heutigen Tages (Berliner Zeit, alle vier Modi), Punkte von 10 als Durchschnitt.
function zaehleHeutigeSpiele(auswertung) {
  const tag = auswertung?.tage?.at(-1)
  let plays = 0
  let punkte = 0
  let max = 0
  for (const x of Object.values(tag?.modi || {})) {
    plays += Number(x?.spiele || 0)
    punkte += Number(x?.punkte || 0)
    max += Number(x?.max || 0)
  }
  return { plays, avg10: max > 0 ? (punkte / max) * 10 : null }
}

async function loadHeuteSpiele() {
  const el = document.getElementById('wo-heute-spiele')
  if (!el) return
  try {
    const data = await holeJson('/admin/auswertung/spiele?days=1')
    const { plays, avg10 } = zaehleHeutigeSpiele(data)
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

const zeileMitZahl = (wort, zahl, vorzeichen = '', rang = null) => `<li><span>${rang ? `<span class="in-rang">${rang}</span>` : ''}${esc(wort)}</span><span class="tag-erg-zahl">${vorzeichen}${zahlDe(zahl)}</span></li>`

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
      : `<span class="tag-erg-urteil" data-tone="warn">${esc(`nur ${anzahlText(data.pool ?? 0, 'Kollokator', 'Kollokatoren')} (das Spiel braucht ${data.min ?? 10})`)}</span>`
    return `<li class="tag-erg-zeile"><span class="tag-erg-wort">${esc(lemma)}</span>${werte ? `<span class="tag-erg-werte">${werte}</span>` : ''}${urteil}</li>`
  }).join('')

  schreibeErgebnis(out, ergebnisMeldung(kopf, alle ? 'ok' : 'warn')
    + `<ul class="tag-erg-liste">${zeilen}</ul>`
    + '<p class="tag-erg-fuss">Je Wort die fünf stärksten Kollokatoren im eigenen Korpus; Zahl = logDice (Assoziationsmaß). Geeignet ab zehn Kollokatoren: drei gesuchte und sieben Ablenker.</p>')
}

// Vorschau eines der drei Kollokationen-Wörter (Nr. 1–3) als Wörterbuch-Eintrag.
async function previewCurrentLemma(index = 1) {
  const out = document.getElementById('entry-preview-output')
  const n = [1, 2, 3].includes(index) ? index : 1
  const lemma = normalizeText(document.getElementById(`w${n}`)?.value || '')
  const pos = document.getElementById(`p${n}`)?.value || 'Substantiv'
  if (!out) return

  if (!lemma) {
    out.innerHTML = ergebnisMeldung(`Erst Basis ${n} eintragen.`)
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

// ── Nutzer (#nutzer) und Konto (#nutzer/<id>) ─────────────────────────────────
// Liste: Suche zuerst, Sammelaktionen erst bei Auswahl (Muster aus Planen › Liste), Linien-Liste statt Tabelle.
// Konto: Unterseite mit Rückleiste. Adresse und Seitentitel enthalten nie Name, E-Mail oder Suchtext
// (nur die interne ID), und Nutzerdaten gehören in keine Konsolen-Ausgabe.
// Admin-Konten lassen sich hier weder ändern noch löschen (der Server lehnt es ebenfalls ab).

const ZAHL_DE = new Intl.NumberFormat('de-DE')
const ganzzahlDe = (n) => ZAHL_DE.format(Number(n) || 0)
const kontenText = (n) => `${ganzzahlDe(n)} ${n === 1 ? 'Konto' : 'Konten'}`
const spieleText = (n) => `${ganzzahlDe(n)} ${n === 1 ? 'Spiel' : 'Spiele'}`
const nutzerName = (u) => String(u?.name ?? '').trim() || 'ohne Namen'

const ANMELDUNG_TEXT = { credential: 'E-Mail und Passwort', apple: 'Apple', google: 'Google', andere: 'andere' }
const QUELLE_KAUF_TEXT = { mollie: 'über die Website (Mollie)', 'apple-iap': 'in der iOS-App (App Store)' }
const QUELLE_ZAHLUNG_TEXT = { mollie: 'Website (Mollie)', apple: 'iOS-App (App Store)', unbekannt: 'Quelle unbekannt' }
// Löschfrist inaktiver Konten wie server/jobs/inactiveAccounts.js (INACTIVE_DAYS, WARNING_LEAD_DAYS)
const INAKTIV_TAGE = 730
const WARNUNG_VORLAUF_TAGE = 30
const TAG_MS = 24 * 60 * 60 * 1000

// ISO-Zeitstempel (UTC) → lokales Datum 'JJJJ-MM-TT'; leer bei fehlendem oder ungültigem Wert
function isoTag(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : toLocalIso(d)
}

// „12.03.2026“
function datumDe(iso) {
  const tag = isoTag(iso)
  return tag ? formatIsoDate(tag) : '–'
}

// „Donnerstag, 12. März 2026“
function datumLangDe(iso) {
  const tag = isoTag(iso)
  return tag ? datumLang(tag, { jahr: true }) : '–'
}

// Punkte von 10 mit einer Nachkommastelle und Komma: „7,3“; ohne Wertung „–“
function punkteDe(scoreSum, maxSum) {
  if (!(Number(maxSum) > 0)) return '–'
  return ((Number(scoreSum) / Number(maxSum)) * 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// „Ø“ liest ein Screenreader unklar: Das Zeichen bleibt für Augen, „Durchschnitt“ ist unsichtbar davor.
const DURCHSCHNITT_HTML = '<span aria-hidden="true">Ø&nbsp;</span><span class="adm-visually-hidden">Durchschnitt </span>'

// „9,99 €“ (reiner Text, beim Einfügen escapen)
function betragDe(betrag, waehrung = 'EUR') {
  const n = Number(betrag)
  const zahl = Number.isFinite(n) ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(betrag ?? '')
  return `${zahl} ${waehrung === 'EUR' ? '€' : waehrung}`
}

// Meldung in einer Live-Region (.li-meldung). Leerer Text blendet sie aus.
// fokus: Tastatur dorthin (der Auslöser ist weg). Dann liest der Screenreader die Meldung über den Fokus;
// die Live-Region ist für diesen Moment aus, sonst käme die Ansage doppelt.
function setMeldung(id, msg, tone, { fokus = false, html = false } = {}) {
  const el = document.getElementById(id)
  if (!el) return
  const fokussieren = fokus && !!msg
  if (fokussieren) {
    el.setAttribute('aria-live', 'off')
    // Eine fokussierte Statuszeile hat sonst keinen Namen (der Screenreader sagte nur „Status“): Ihr Name ist ihr eigener Text.
    el.setAttribute('aria-labelledby', id)
  } else {
    el.removeAttribute('aria-labelledby')
  }
  // html: nur für selbst gebaute Texte, in denen alles Dynamische schon durch esc() gegangen ist
  if (html) el.innerHTML = msg || ''
  else el.textContent = msg || ''
  if (msg && tone) el.dataset.tone = tone
  else el.removeAttribute('data-tone')
  if (fokussieren) {
    el.focus()
    window.setTimeout(() => el.setAttribute('aria-live', 'polite'), 800)
  } else if (el.getAttribute('aria-live') === 'off') {
    el.setAttribute('aria-live', 'polite')
  }
}

// Eine Live-Region (Konto: Rolle gespeichert, Export) überlebt das Neuzeichnen: Der Knoten bleibt derselbe,
// nur sein Text ändert sich. Ein neu eingefügter Knoten mit fertigem Text würde nicht angesagt.
function behalteMeldungen(host, ids, zeichne) {
  const alt = ids.map((id) => document.getElementById(id)).filter((el) => el && host.contains(el))
  alt.forEach((el) => el.remove())
  zeichne()
  for (const el of alt) {
    el.textContent = ''
    el.removeAttribute('data-tone')
    document.getElementById(el.id)?.replaceWith(el)
  }
}
const setNutzerStatus = (msg, tone, opts) => setMeldung('users-status', msg, tone, opts)
const setKontoStatus = (msg, tone, opts) => setMeldung('user-status', msg, tone, opts)

// Beim Abmelden: Personendaten aus Speicher und Seite entfernen.
function nutzerZuruecksetzen() {
  usersLoaded = false
  if (usersSearchTimer) window.clearTimeout(usersSearchTimer)
  usersSearchTimer = null
  usersOverviewAbortController?.abort()
  usersOverviewAbortController = null
  kontoAbort?.abort()
  kontoAbort = null
  nutzerListe = []
  nutzerGefiltert = 0
  nutzerHatMehr = false
  nutzerSummary = null
  nutzerZustand = 'laden'
  nutzerFehlerText = ''
  nutzerMehrLaedt = false
  nutzerFilterLaedt = false
  nutzerBeschaeftigt = false
  nutzerFilterAktiv = { q: '', role: '' }
  gewaehlteNutzer.clear()
  kontoAktuell = null
  kontoBeschaeftigt = false
  for (const id of ['users-table-body', 'user-detail']) {
    const el = document.getElementById(id)
    if (el) el.innerHTML = ''
  }
  setNutzerStatus('')
  setKontoStatus('')
  for (const id of ['users-search', 'users-role-filter']) {
    const el = document.getElementById(id)
    if (el) el.value = ''
  }
}

// ── Liste ────────────────────────────────────────────────────────────────────

function istStandardNutzerFilter() {
  return !nutzerFilterAktiv.q && !nutzerFilterAktiv.role
}

// „2.029 Konten · 4 mit Gesamtausgabe · 6 neu in 30 Tagen“ · „12 Treffer von 2.029 Konten“
function nutzerZahlText() {
  const gesamt = Number(nutzerSummary?.total ?? nutzerGefiltert)
  if (istStandardNutzerFilter()) {
    return `${kontenText(gesamt)} · ${ganzzahlDe(nutzerSummary?.premium)} mit Gesamtausgabe · ${ganzzahlDe(nutzerSummary?.newLast30Days)} neu in 30 Tagen`
  }
  return `${ganzzahlDe(nutzerGefiltert)} Treffer von ${kontenText(gesamt)}`
}

function nutzerZeileHtml(u) {
  const name = nutzerName(u)
  const gewaehlt = gewaehlteNutzer.has(u.id)
  // Admin-Konten haben kein Kästchen: Sie lassen sich nicht für Sammelaktionen auswählen.
  const wahl = u.role === 'admin'
    ? '<span class="nu-wahl-frei"></span>'
    : `<label class="li-wahl"><input type="checkbox" class="user-select-checkbox" data-user-id="${esc(u.id)}" aria-label="${esc(`Auswählen: ${name}, ${u.email}`)}"${gewaehlt ? ' checked' : ''}></label>`
  const rolle = u.role === 'user'
    ? `<span class="adm-visually-hidden">Rolle ${esc(roleLabel('user'))}</span>`
    : `<span class="nu-rolle" data-rolle="${esc(u.role)}"><span class="adm-visually-hidden">Rolle </span>${esc(roleLabel(u.role))}</span>`
  const kauf = u.gekauft ? '<span class="nu-meta-trenner" aria-hidden="true"> · </span><span class="nu-meta-kauf">gekauft</span>' : ''
  return `<li class="nu-zeile${gewaehlt ? ' is-gewaehlt' : ''}" data-user-id="${esc(u.id)}">`
    + wahl
    + `<a class="nu-name" href="${esc(kontoHash(u.id))}">${esc(name)}</a>`
    + `<span class="nu-mail">${esc(u.email)}</span>`
    + `<span class="nu-rolle-zelle">${rolle}</span>`
    + `<span class="nu-meta"><span class="nu-meta-label">angelegt </span>${esc(datumDe(u.createdAt))}${kauf}</span>`
    + '</li>'
}

function nutzerLeerHtml() {
  const ohneFilter = istStandardNutzerFilter()
  return '<div class="li-leer">'
    + `<p class="li-leer-titel">${ohneFilter ? 'Noch keine Konten' : 'Keine Treffer'}</p>`
    + `<p class="li-leer-text">${ohneFilter ? 'Sobald sich jemand registriert, steht das Konto hier.' : 'Kein Konto passt zu dieser Suche.'}</p>`
    + (ohneFilter ? '' : '<button type="button" class="adm-link" data-action="reset-users-filters">Filter zurücksetzen</button>')
    + '<p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>'
}

// Der Knopf „Weitere laden“ ist gesperrt, solange etwas läuft oder eine Suche aussteht: Sonst käme eine Seite
// des alten Filters an die Liste des neuen.
function aktualisiereMehrKnopf() {
  const knopf = document.getElementById('users-load-more-btn')
  if (!knopf) return
  const rest = Math.min(USERS_PAGE_SIZE, Math.max(0, nutzerGefiltert - nutzerListe.length))
  setzeText(knopf, nutzerMehrLaedt ? 'Wird geladen …' : `Weitere ${ganzzahlDe(rest)} laden`)
  if (nutzerMehrLaedt || nutzerFilterLaedt || usersSearchTimer) knopf.setAttribute('aria-disabled', 'true')
  else knopf.removeAttribute('aria-disabled')
}

// Nach einer Änderung an der Liste im Speicher neu zeichnen. Sind alle geladenen Zeilen weg, obwohl der Filter
// noch Treffer hat (alles gelöscht oder aus dem Filter gefallen), lädt die erste Seite neu, statt „Noch keine Konten“ zu zeigen.
function zeichneNutzerNachAenderung() {
  if (!nutzerListe.length && nutzerGefiltert > 0) {
    void loadUsersOverview()
    return
  }
  renderNutzerListe()
}

// neu: nur diese Konten hinten anfügen (Fokus und Scrollposition bleiben), sonst die ganze Liste zeichnen.
// ansage: Trefferzahl ansagen, wenn sie sich geändert hat; immer: auch bei gleicher Zahl (neuer Filter).
function renderNutzerListe({ ansage = false, neu = null, immer = false } = {}) {
  const host = document.getElementById('users-table-body')
  if (!host) return
  const leiste = document.getElementById('users-auswahlleiste')
  const ergebnis = document.getElementById('users-ergebnis')
  const spalten = document.getElementById('users-spalten')
  const mehr = document.getElementById('users-paging')

  if (nutzerZustand !== 'ok') {
    leiste.hidden = true
    mehr.hidden = true
    ergebnis.hidden = true
    spalten.hidden = true
    passeAuswahlleisteAn()
    // Nach einem Fehler bleibt Meldung samt Knopf stehen (der Fokus bleibt), der Knopf zeigt „wird geladen“.
    const knopf = host.querySelector('.wo-meldung[data-tone="err"] [data-action="load-users-overview"]')
    if (nutzerZustand === 'laden' && knopf) {
      knopf.setAttribute('aria-disabled', 'true')
      knopf.textContent = 'Wird geladen …'
      return
    }
    const hatteFokus = host.contains(document.activeElement)
    host.innerHTML = nutzerZustand === 'laden'
      ? '<p class="wo-meldung">Konten werden geladen …</p>'
      : `<p class="wo-meldung" data-tone="err" role="alert">Die Konten konnten nicht geladen werden (${esc(nutzerFehlerText)}). <button type="button" class="adm-link" data-action="load-users-overview">Erneut versuchen</button></p>`
    // Scheitert „Erneut versuchen“ noch einmal, ist der alte Knopf weg: Der Fokus geht auf den neuen.
    if (hatteFokus && nutzerZustand === 'fehler') host.querySelector('[data-action="load-users-overview"]')?.focus({ preventScroll: true })
    return
  }

  const aktiv = document.activeElement
  const fokusInMeldung = host.contains(aktiv) && !!aktiv.closest('.wo-meldung')
  const leer = nutzerListe.length === 0
  const standard = istStandardNutzerFilter()
  const zahlEl = document.getElementById('users-summary')
  const zahlText = nutzerZahlText()
  const zahlGeaendert = zahlEl.textContent !== zahlText
  setzeText(zahlEl, zahlText)
  // Ohne Konten und ohne Filter braucht es keine Zählzeile; ohne Treffer steht „Filter zurücksetzen“ im Leerzustand.
  ergebnis.hidden = leer && standard
  document.getElementById('users-filter-reset').hidden = standard || leer
  if (ansage && (zahlGeaendert || immer)) planeAnsage(zahlText, 'users-ansage')
  leiste.hidden = leer
  spalten.hidden = leer

  const liste = host.querySelector('.nu-liste')
  if (neu && neu.length && liste) {
    liste.insertAdjacentHTML('beforeend', neu.map(nutzerZeileHtml).join(''))
  } else {
    host.innerHTML = leer
      ? nutzerLeerHtml()
      : `<ul class="nu-liste" aria-label="Konten">${nutzerListe.map(nutzerZeileHtml).join('')}</ul>`
  }

  mehr.hidden = !nutzerHatMehr
  aktualisiereMehrKnopf()
  setzeText(document.getElementById('users-paging-info'), `${ganzzahlDe(nutzerListe.length)} von ${ganzzahlDe(nutzerGefiltert)} angezeigt`)
  aktualisiereNutzerAuswahl()

  // „Erneut versuchen“ war erfolgreich: Der Knopf ist weg, die Ergebniszeile (sonst die Suche) übernimmt den Fokus.
  if (fokusInMeldung) (ergebnis.hidden ? document.getElementById('users-search') : zahlEl)?.focus({ preventScroll: true })
}

async function loadUsersOverview({ append = false } = {}) {
  if (!document.getElementById('users-table-body')) return
  if (usersSearchTimer) {
    window.clearTimeout(usersSearchTimer)
    usersSearchTimer = null
  }
  usersOverviewAbortController?.abort()
  const controller = new AbortController()
  usersOverviewAbortController = controller

  const params = new URLSearchParams({ limit: String(USERS_PAGE_SIZE) })
  let filterGeaendert = false
  setMeldung('users-mehr-meldung', '')
  if (append) {
    nutzerMehrLaedt = true
    params.set('offset', String(nutzerListe.length))
    params.set('q', nutzerFilterAktiv.q)
    params.set('role', nutzerFilterAktiv.role)
    aktualisiereMehrKnopf()
  } else {
    // Ein neuer Filter beginnt wieder bei Seite 1.
    const neuerFilter = {
      q: (document.getElementById('users-search')?.value || '').trim(),
      role: document.getElementById('users-role-filter')?.value || '',
    }
    filterGeaendert = neuerFilter.q !== nutzerFilterAktiv.q || neuerFilter.role !== nutzerFilterAktiv.role
    nutzerFilterAktiv = neuerFilter
    params.set('offset', '0')
    params.set('q', nutzerFilterAktiv.q)
    params.set('role', nutzerFilterAktiv.role)
    nutzerMehrLaedt = false
    nutzerFilterLaedt = true
    if (nutzerZustand === 'ok' && nutzerListe.length) {
      // Beim Tippen bleibt die bisherige Liste stehen, bis die neue da ist (kein Flackern, Scrollposition bleibt).
      // Die Auswahl bleibt, bis die Antwort da ist; dann wird sie auf die neue Liste beschnitten.
      document.getElementById('users-table-body')?.setAttribute('aria-busy', 'true')
      aktualisiereMehrKnopf()
    } else {
      nutzerListe = []
      gewaehlteNutzer.clear()
      nutzerZustand = 'laden'
      renderNutzerListe()
    }
  }
  if (!params.get('q')) params.delete('q')
  if (!params.get('role')) params.delete('role')

  try {
    const response = await fetch(`/admin/users?${params.toString()}`, { signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const geladen = Array.isArray(data.users) ? data.users : []
    // Neue Konten verschieben die Seiten: schon gezeigte nicht doppelt aufnehmen.
    const bekannt = new Set(append ? nutzerListe.map((u) => u.id) : [])
    const neu = geladen.filter((u) => !bekannt.has(u.id))
    nutzerListe = append ? nutzerListe.concat(neu) : neu
    // Die Auswahl gilt nur für Konten der neuen Liste (während des Ladens konnte noch in der alten gewählt werden).
    for (const id of [...gewaehlteNutzer]) if (!nutzerListe.some((u) => u.id === id)) gewaehlteNutzer.delete(id)
    document.getElementById('users-table-body')?.removeAttribute('aria-busy')
    nutzerSummary = data.summary || nutzerSummary
    nutzerGefiltert = Number(data.page?.filtered ?? nutzerListe.length)
    nutzerHatMehr = !!data.page?.hasMore
    nutzerZustand = 'ok'
    nutzerMehrLaedt = false
    nutzerFilterLaedt = false
    usersLoaded = true
    renderNutzerListe({ ansage: !append, immer: filterGeaendert, neu: append ? neu : null })
    if (append) {
      if (neu.length) {
        document.querySelector(`#users-table-body .nu-zeile[data-user-id="${CSS.escape(neu[0].id)}"] .nu-name`)?.focus()
        planeAnsage(`${ganzzahlDe(neu.length)} weitere ${neu.length === 1 ? 'Konto' : 'Konten'} geladen.`, 'users-ansage')
      } else {
        // Nur Bekannte geliefert (neue Konten haben die Seiten verschoben): kein Fokusziel in der Liste, also die Info.
        planeAnsage('Keine weiteren neuen Konten geladen.', 'users-ansage')
        const info = document.getElementById('users-paging-info')
        ;(info && !document.getElementById('users-paging').hidden ? info : document.getElementById('users-summary'))?.focus({ preventScroll: true })
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return
    nutzerMehrLaedt = false
    nutzerFilterLaedt = false
    document.getElementById('users-table-body')?.removeAttribute('aria-busy')
    if (append) {
      aktualisiereMehrKnopf()
      // Eigene Meldungszeile am Knopf: Die Seitenmeldung oben läge außerhalb des Blickfelds.
      setMeldung('users-mehr-meldung', `Weitere Konten konnten nicht geladen werden: ${err.message}`, 'error')
    } else {
      gewaehlteNutzer.clear()
      nutzerZustand = 'fehler'
      nutzerFehlerText = err.message
      renderNutzerListe()
    }
  } finally {
    if (usersOverviewAbortController === controller) usersOverviewAbortController = null
  }
}

function loadMoreUsers() {
  if (nutzerMehrLaedt) return
  // Steht eine Suche aus oder läuft ein Filterabruf, gehört die nächste Seite nicht an die alte Liste:
  // Dann wird der ausstehende Filterabruf ausgeführt (bzw. abgewartet) und nichts angehängt.
  if (usersSearchTimer) {
    void loadUsersOverview()
    return
  }
  if (nutzerFilterLaedt) return
  void loadUsersOverview({ append: true })
}

// Die Suche lädt nach 250 ms Pause (nicht bei jedem Tastenanschlag). Der Suchtext steht nie in der Adresse.
function scheduleUsersOverviewLoad() {
  if (usersSearchTimer) window.clearTimeout(usersSearchTimer)
  usersSearchTimer = window.setTimeout(() => {
    usersSearchTimer = null
    void loadUsersOverview()
  }, 250)
  aktualisiereMehrKnopf()
}

function resetUsersFilters() {
  const searchInput = document.getElementById('users-search')
  const roleFilter = document.getElementById('users-role-filter')
  if (searchInput) searchInput.value = ''
  if (roleFilter) roleFilter.value = ''
  void loadUsersOverview()
  // Der Knopf ist jetzt weg: Fokus zur Suche
  searchInput?.focus({ preventScroll: true })
}

// ── Auswahl ──────────────────────────────────────────────────────────────────

function waehlbareNutzer() {
  return nutzerListe.filter((u) => u.role !== 'admin')
}

function auswahlNutzer() {
  return nutzerListe.filter((u) => gewaehlteNutzer.has(u.id))
}

function aktualisiereNutzerAuswahl() {
  const host = document.getElementById('users-table-body')
  if (!host) return
  const waehlbar = waehlbareNutzer()
  // Gezählt wird, was wirklich in der Liste steht (nicht, was im Set übrig sein könnte)
  const n = auswahlNutzer().length
  host.querySelectorAll('.nu-zeile').forEach((li) => {
    const an = gewaehlteNutzer.has(li.dataset.userId)
    li.classList.toggle('is-gewaehlt', an)
    const cb = li.querySelector('input[type="checkbox"]')
    if (cb) cb.checked = an
  })
  const master = document.getElementById('users-select-all')
  const aufListe = waehlbar.filter((u) => gewaehlteNutzer.has(u.id)).length
  master.checked = waehlbar.length > 0 && aufListe === waehlbar.length
  master.indeterminate = aufListe > 0 && aufListe < waehlbar.length
  master.disabled = waehlbar.length === 0
  const zuViele = n > NUTZER_MAX_SAMMEL
  setzeText(document.getElementById('users-bulk-count'), n ? `${ganzzahlDe(n)} ausgewählt${zuViele ? ` · höchstens ${NUTZER_MAX_SAMMEL} auf einmal` : ''}` : '')
  document.getElementById('users-clear-selection').hidden = n === 0
  document.getElementById('users-sammel').hidden = n === 0
  document.getElementById('users-aktionen-toggle').hidden = n === 0
  if (n === 0) setzeNutzerAktionen(false)
  if (!nutzerBeschaeftigt) setzeText(document.getElementById('users-bulk-delete-text'), `${kontenText(n)} löschen …`)
  for (const knopf of document.querySelectorAll('#users-sammel button')) {
    if (zuViele || nutzerBeschaeftigt) knopf.setAttribute('aria-disabled', 'true')
    else knopf.removeAttribute('aria-disabled')
  }
  // Auch die Rollenauswahl sperren: Bei mehr als 200 Gewählten geht keine Sammelaktion
  document.getElementById('users-bulk-role').disabled = zuViele
  document.getElementById('users-auswahlleiste').classList.toggle('has-auswahl', n > 0)
  passeAuswahlleisteAn()
}

// Schmal sind die Sammelaktionen hinter „Aktionen …“ eingeklappt, damit die klebende Leiste niedrig bleibt.
// Breit steht der Knopf nicht da (CSS) und die Aktionen sind immer sichtbar.
function setzeNutzerAktionen(offen) {
  const leiste = document.getElementById('users-auswahlleiste')
  const knopf = document.getElementById('users-aktionen-toggle')
  if (!leiste || !knopf) return
  leiste.classList.toggle('aktionen-offen', offen)
  knopf.setAttribute('aria-expanded', String(offen))
  knopf.textContent = offen ? 'Aktionen schließen' : 'Aktionen …'
  passeAuswahlleisteAn()
}

function toggleNutzerAktionen() {
  setzeNutzerAktionen(!document.getElementById('users-auswahlleiste').classList.contains('aktionen-offen'))
}

// Einzelnes Kästchen: ohne Neuzeichnen, der Fokus bleibt.
function waehleNutzer(id, an) {
  if (!id || !nutzerListe.some((u) => u.id === id && u.role !== 'admin')) return
  if (an) gewaehlteNutzer.add(id)
  else gewaehlteNutzer.delete(id)
  aktualisiereNutzerAuswahl()
}

// „Alle angezeigten“: alle geladenen Konten außer Admins
function waehleAlleNutzer(an) {
  for (const u of waehlbareNutzer()) {
    if (an) gewaehlteNutzer.add(u.id)
    else gewaehlteNutzer.delete(u.id)
  }
  aktualisiereNutzerAuswahl()
}

function leereNutzerAuswahl() {
  gewaehlteNutzer.clear()
  aktualisiereNutzerAuswahl()
  document.getElementById('users-select-all')?.focus({ preventScroll: true })
}

// ── Liste im Speicher nachführen (statt alles von vorn zu laden) ─────────────

// Konten aus der Liste nehmen. geloescht: es gibt sie nicht mehr (Gesamtzahl sinkt), sonst fallen sie nur aus dem Filter.
function entferneNutzerAusListe(ids, { geloescht = false } = {}) {
  const weg = new Set(ids)
  const betroffen = nutzerListe.filter((u) => weg.has(u.id))
  nutzerListe = nutzerListe.filter((u) => !weg.has(u.id))
  for (const id of ids) gewaehlteNutzer.delete(id)
  nutzerGefiltert = Math.max(0, nutzerGefiltert - betroffen.length)
  if (geloescht && nutzerSummary) {
    nutzerSummary.total = Math.max(0, Number(nutzerSummary.total || 0) - ids.length)
    nutzerSummary.premium = Math.max(0, Number(nutzerSummary.premium || 0) - betroffen.filter((u) => u.role === 'premium').length)
    // „neu in 30 Tagen“ zählt die gelöschten Neuen nicht mehr mit (bekannt nur für geladene Konten)
    const grenze = Date.now() - 30 * TAG_MS
    const neue = betroffen.filter((u) => Date.parse(u.createdAt) >= grenze).length
    nutzerSummary.newLast30Days = Math.max(0, Number(nutzerSummary.newLast30Days || 0) - neue)
  }
  nutzerHatMehr = nutzerListe.length < nutzerGefiltert
}

// Neue Rolle in der Liste setzen. Gibt zurück, ob das Konto in der Liste fehlt (dann lädt der nächste Besuch von
// #nutzer neu: Zählung und Seiten stimmen nicht mehr) und ob die Zeile aus dem Rollenfilter gefallen ist.
function setzeNutzerRolleLokal(ids, rolle) {
  let unbekannt = false
  let entfernt = false
  let premiumDelta = 0
  for (const id of ids) {
    const u = nutzerListe.find((x) => x.id === id)
    if (!u) { unbekannt = true; continue }
    premiumDelta += (rolle === 'premium' ? 1 : 0) - (u.role === 'premium' ? 1 : 0)
    u.role = rolle
  }
  if (nutzerSummary) nutzerSummary.premium = Math.max(0, Number(nutzerSummary.premium || 0) + premiumDelta)
  // Rollenfilter aktiv und die neue Rolle passt nicht mehr: Die Zeile fällt aus dem Filter.
  if (nutzerFilterAktiv.role && nutzerFilterAktiv.role !== rolle) {
    const betroffen = ids.filter((id) => nutzerListe.some((u) => u.id === id))
    entfernt = betroffen.length > 0
    entferneNutzerAusListe(betroffen)
  }
  if (unbekannt && usersLoaded) usersLoaded = false
  return { unbekannt, entfernt }
}

// ── Sammelaktionen (POST /admin/users/bulk-update) ───────────────────────────

// Bis zu 8 Namen „Name (E-Mail)“, sonst 5 und „und N weitere“
function nutzerNamenListe(konten) {
  const zeile = (u) => `${nutzerName(u)} (${u.email})`
  return konten.length <= 8
    ? konten.map(zeile)
    : [...konten.slice(0, 5).map(zeile), `und ${konten.length - 5} weitere`]
}

function gekauftSatz(n, { loeschen = false } = {}) {
  if (loeschen) return `Davon ${n === 1 ? 'hat 1 Konto' : `haben ${n}`} die Gesamtausgabe gekauft.`
  return n === 1
    ? 'Davon hat 1 Konto die Gesamtausgabe gekauft: Es behält die Gesamtausgabe, verliert aber Klassenraum und unbegrenzte eigene Wörter.'
    : `Davon haben ${n} die Gesamtausgabe gekauft: Sie behalten die Gesamtausgabe, verlieren aber Klassenraum und unbegrenzte eigene Wörter.`
}

// „1 Admin-Konto wurde übersprungen. 2 Konten gab es nicht mehr.“ (mit führendem Leerzeichen, oder leer)
function uebersprungenText(data) {
  const details = Array.isArray(data?.skippedDetails)
    ? data.skippedDetails
    : (Array.isArray(data?.skipped) ? data.skipped : []).map((id) => ({ id, reason: 'not_found' }))
  const admin = details.filter((d) => d.reason === 'admin').length
  const weg = details.length - admin
  const teile = []
  if (admin) teile.push(`${admin === 1 ? '1 Admin-Konto wurde' : `${admin} Admin-Konten wurden`} übersprungen.`)
  if (weg) teile.push(`${weg === 1 ? '1 Konto gab es' : `${weg} Konten gab es`} nicht mehr.`)
  return teile.length ? ` ${teile.join(' ')}` : ''
}

// Während einer Sammelaktion alle Knöpfe sperren (aria-disabled, damit der Fokus bleibt).
function setNutzerBeschaeftigt(an, loeschText = '') {
  nutzerBeschaeftigt = an
  if (an && loeschText) document.getElementById('users-bulk-delete-text').textContent = loeschText
  aktualisiereNutzerAuswahl()
}

async function postSammel(payload) {
  return fetch('/admin/users/bulk-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function sammelRolle() {
  const gewaehlt = auswahlNutzer()
  const ziel = document.getElementById('users-bulk-role')?.value
  if (!gewaehlt.length || gewaehlt.length > NUTZER_MAX_SAMMEL || nutzerBeschaeftigt) return
  if (ziel !== 'premium' && ziel !== 'user') return

  const details = nutzerNamenListe(gewaehlt)
  const gekauft = gewaehlt.filter((u) => u.gekauft).length
  if (ziel === 'user' && gekauft) details.push(gekauftSatz(gekauft))
  if (!(await bestaetige({ frage: `Rolle von ${kontenText(gewaehlt.length)} auf ${roleLabel(ziel)} setzen?`, details, aktion: 'Setzen', gefahr: false }))) return
  if (currentRoute?.page !== 'users' || nutzerBeschaeftigt) return

  setNutzerStatus('')
  setNutzerBeschaeftigt(true)
  try {
    const response = await postSammel({ action: 'setRole', role: ziel, userIds: gewaehlt.map((u) => u.id) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const geaendert = Array.isArray(data.changed) ? data.changed : []
    const gleich = Array.isArray(data.unchanged) ? data.unchanged : []
    const nichtMehr = (data.skippedDetails || []).filter((d) => d.reason === 'not_found').map((d) => d.id)
    setzeNutzerRolleLokal(geaendert, ziel)
    if (nichtMehr.length) entferneNutzerAusListe(nichtMehr, { geloescht: true })
    gewaehlteNutzer.clear()
    nutzerBeschaeftigt = false
    zeichneNutzerNachAenderung()
    // Gezählt werden nur echte Änderungen; wer die Rolle schon hatte, wird eigens genannt.
    const gleichText = gleich.length ? ` ${gleich.length === 1 ? '1 Konto hatte' : `${gleich.length} Konten hatten`} die Rolle schon.` : ''
    const text = geaendert.length
      ? `Rolle von ${kontenText(geaendert.length)} auf ${roleLabel(ziel)} gesetzt.${gleichText}${uebersprungenText(data)}`
      : `Keine Rolle geändert.${gleichText}${uebersprungenText(data)}`
    setNutzerStatus(text, geaendert.length ? 'ok' : 'warn', { fokus: true })
  } catch (err) {
    nutzerBeschaeftigt = false
    aktualisiereNutzerAuswahl()
    setNutzerStatus(`Nicht ausgeführt: ${err.message}`, 'error')
    document.getElementById('users-bulk-role-btn')?.focus()
  }
}

// Export lesen und als Datei anbieten; gemeinsam für Sammelaktion und Konto.
// Gibt { exportiert, weg } zurück (weg = Konten, die es nicht mehr gab).
async function ladeKontenExport(ids, format, dateiPraefix) {
  const response = await postSammel({ action: 'export', userIds: ids, format })
  const datei = `${dateiPraefix}-${getTodayIso()}.${format}`
  if (format === 'csv') {
    if (!response.ok) {
      const fehler = await response.json().catch(() => ({}))
      throw new Error(fehler.error || `HTTP ${response.status}`)
    }
    const csv = await response.text()
    const kopfExportiert = Number.parseInt(response.headers.get('x-exported-count') || '', 10)
    const kopfWeg = Number.parseInt(response.headers.get('x-skipped-count') || '', 10)
    createTemporaryDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), datei)
    return {
      exportiert: Number.isFinite(kopfExportiert) ? kopfExportiert : Math.max(csv.split(/\r?\n/).filter(Boolean).length - 1, 0),
      weg: Number.isFinite(kopfWeg) ? kopfWeg : 0,
    }
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  const konten = Array.isArray(data.users) ? data.users : []
  createTemporaryDownload(new Blob([JSON.stringify(konten, null, 2)], { type: 'application/json' }), datei)
  return { exportiert: konten.length, weg: Array.isArray(data.skipped) ? data.skipped.length : 0 }
}

// Lesend, deshalb ohne Rückfrage. Die Auswahl bleibt; der Dateiname enthält keine Personendaten.
async function sammelExport(format) {
  if (format !== 'json' && format !== 'csv') return
  const gewaehlt = auswahlNutzer()
  if (!gewaehlt.length || gewaehlt.length > NUTZER_MAX_SAMMEL || nutzerBeschaeftigt) return
  setNutzerBeschaeftigt(true)
  try {
    const { exportiert, weg } = await ladeKontenExport(gewaehlt.map((u) => u.id), format, 'signifikation-konten')
    setNutzerStatus(`${kontenText(exportiert)} als ${format.toUpperCase()} exportiert.${weg ? ` ${weg === 1 ? '1 Konto gab es' : `${weg} Konten gab es`} nicht mehr.` : ''}`, 'ok')
  } catch (err) {
    setNutzerStatus(`Nicht ausgeführt: ${err.message}`, 'error')
  } finally {
    setNutzerBeschaeftigt(false)
  }
}

async function sammelLoeschen() {
  const gewaehlt = auswahlNutzer()
  if (!gewaehlt.length || gewaehlt.length > NUTZER_MAX_SAMMEL || nutzerBeschaeftigt) return

  const details = nutzerNamenListe(gewaehlt)
  const gekauft = gewaehlt.filter((u) => u.gekauft).length
  if (gekauft) details.push(gekauftSatz(gekauft, { loeschen: true }))
  details.push('Zahlungsbelege bleiben ohne Namen und E-Mail erhalten.', 'Das lässt sich nicht rückgängig machen.')
  if (!(await bestaetige({ frage: `${kontenText(gewaehlt.length)} löschen?`, details, aktion: 'Löschen' }))) return
  if (currentRoute?.page !== 'users' || nutzerBeschaeftigt) return

  setNutzerStatus('')
  setNutzerBeschaeftigt(true, 'Wird gelöscht …')
  try {
    const response = await postSammel({ action: 'delete', userIds: gewaehlt.map((u) => u.id) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const geloescht = Array.isArray(data.deleted) ? data.deleted : []
    const nichtMehr = (data.skippedDetails || []).filter((d) => d.reason === 'not_found').map((d) => d.id)
    entferneNutzerAusListe([...geloescht, ...nichtMehr], { geloescht: true })
    nutzerBeschaeftigt = false
    zeichneNutzerNachAenderung()
    setNutzerStatus(`${kontenText(geloescht.length)} gelöscht.${uebersprungenText(data)}`, geloescht.length ? 'ok' : 'warn', { fokus: true })
  } catch (err) {
    nutzerBeschaeftigt = false
    aktualisiereNutzerAuswahl()
    setNutzerStatus(`Nicht ausgeführt: ${err.message}`, 'error')
    document.getElementById('users-bulk-delete-btn')?.focus()
    // Die Liste kann veraltet sein (etwa nach einem Netzfehler mitten im Löschen): neu laden.
    void loadUsersOverview()
  }
}

// ── Konto ────────────────────────────────────────────────────────────────────

function kontoFehlerHtml(text) {
  return `<p class="wo-meldung" data-tone="err" role="alert">Das Konto konnte nicht geladen werden (${esc(text)}). <button type="button" class="adm-link" data-action="retry-user-detail">Erneut versuchen</button></p>`
}

function kontoNichtGefundenHtml() {
  return '<div class="li-leer" role="status"><p class="li-leer-titel">Dieses Konto gibt es nicht (mehr)</p>'
    + '<p class="li-leer-text">Vielleicht wurde es gerade gelöscht.</p>'
    + '<a class="adm-link" href="#nutzer">Zur Liste</a>'
    + '<p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>'
}

async function ladeKonto(id) {
  const host = document.getElementById('user-detail')
  if (!host) return
  kontoAbort?.abort()
  const controller = new AbortController()
  kontoAbort = controller
  kontoAktuell = null
  setKontoStatus('')

  // Nach einem Fehler: Meldung samt Knopf stehen lassen (Fokus!), der Knopf zeigt „wird geladen“.
  const knopf = host.querySelector('[data-action="retry-user-detail"]')
  if (knopf) {
    knopf.setAttribute('aria-disabled', 'true')
    knopf.textContent = 'Wird geladen …'
  } else {
    host.innerHTML = '<p class="wo-meldung">Konto wird geladen …</p>'
  }

  const nochAktuell = () => currentRoute?.page === 'user' && currentRoute.nutzerId === id
  try {
    const response = await fetch(`/admin/users/${encodeURIComponent(id)}`, { signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    if (!nochAktuell()) return
    if (response.status === 404) {
      const hatteFokus = host.contains(document.activeElement)
      host.innerHTML = kontoNichtGefundenHtml()
      // Nach „Erneut versuchen“ ist der Knopf weg: Fokus auf den Weg zurück
      if (hatteFokus) host.querySelector('a[href="#nutzer"]')?.focus({ preventScroll: true })
      return
    }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    const fokusInMeldung = host.contains(document.activeElement) && !!document.activeElement.closest('.wo-meldung')
    kontoAktuell = data
    renderKonto(data)
    if (fokusInMeldung) document.getElementById('page-title')?.focus({ preventScroll: true })
  } catch (err) {
    if (err.name === 'AbortError' || !nochAktuell()) return
    const hatteFokus = host.contains(document.activeElement)
    host.innerHTML = kontoFehlerHtml(err.message)
    // Scheitert „Erneut versuchen“ noch einmal, ist der alte Knopf weg: Der Fokus geht auf den neuen.
    if (hatteFokus) host.querySelector('[data-action="retry-user-detail"]')?.focus({ preventScroll: true })
  } finally {
    if (kontoAbort === controller) kontoAbort = null
  }
}

// Stand von Kauf und Gesamtausgabe: Überschrift und Satz darunter (reiner Text, beim Einfügen escapen)
function premiumStand({ user, kauf, konto }) {
  if (user.role === 'admin') return { titel: 'Admin', text: 'Hat alle Funktionen der Gesamtausgabe, ohne Kauf.' }
  if (kauf.gesamtausgabe) {
    const quelle = QUELLE_KAUF_TEXT[kauf.quelle]
    const teile = [quelle || (kauf.quelle && kauf.quelle !== 'none' ? `Quelle: ${kauf.quelle}` : 'Quelle unbekannt')]
    if (kauf.seit) teile.push(`freigeschaltet am ${datumDe(kauf.seit)}`)
    // payments und user_entitlements kennen kein Ablaufdatum: Die Gesamtausgabe ist ein Einmalkauf.
    teile.push('unbefristet')
    return { titel: 'Gesamtausgabe gekauft', text: teile.join(' · ') }
  }
  if (user.role === 'premium') {
    return { titel: 'Gesamtausgabe von Hand vergeben', text: `Kein Kauf erfasst.${konto.rolleGeaendertAm ? ` Rolle zuletzt geändert am ${datumDe(konto.rolleGeaendertAm)}.` : ''}` }
  }
  return { titel: 'Keine Gesamtausgabe', text: 'Kein Kauf erfasst.' }
}

function kaufHinweisHtml({ user, kauf }) {
  if (kauf.gesamtausgabe && user.role === 'user') {
    return '<p class="li-meldung" data-tone="warn">Gekauft, aber Rolle Basiszugang: Klassenraum und unbegrenzte eigene Wörter sind gesperrt. Rolle auf Gesamtausgabe setzen, um das zu beheben.</p>'
  }
  const bezahlt = kauf.zahlungen.some((z) => z.status === 'paid')
  if (kauf.gesamtausgabe && kauf.zahlungen.length && !bezahlt && user.role !== 'admin') {
    return '<p class="li-meldung" data-tone="warn">Kauf erstattet, die Gesamtausgabe ist aber noch freigeschaltet. Bei Bedarf die Rolle auf Basiszugang setzen.</p>'
  }
  if (!kauf.gesamtausgabe && bezahlt) {
    return '<p class="li-meldung" data-tone="warn">Zahlung erfasst, aber die Gesamtausgabe ist nicht freigeschaltet.</p>'
  }
  if (kauf.gesamtausgabe && !kauf.zahlungen.length && user.role !== 'admin') {
    return '<p class="nu-stand-text">Kein Zahlungsbeleg zu dieser Freischaltung.</p>'
  }
  return ''
}

const ZAHLUNG_STATUS_TEXT = { paid: 'bezahlt', refunded: 'erstattet' }

function zahlungHtml(z) {
  const quelle = QUELLE_ZAHLUNG_TEXT[z.quelle] || QUELLE_ZAHLUNG_TEXT.unbekannt
  return '<li class="nu-zahlung">'
    + `<span class="nu-zahlung-datum">${esc(datumDe(z.zeitpunkt))}</span>`
    + `<span class="nu-zahlung-betrag">${esc(betragDe(z.betrag, z.waehrung))}</span>`
    + `<span class="nu-zahlung-quelle">${esc(quelle)} · ${esc(ZAHLUNG_STATUS_TEXT[z.status] || z.status)}</span>`
    + `<span class="nu-beleg"><span class="adm-visually-hidden">Beleg </span>${esc(z.beleg)}</span>`
    + '</li>'
}

function rollenfeldHtml(user) {
  if (user.role === 'admin') {
    return '<div class="nu-rollenfeld"><div class="li-feld"><span class="li-label">Rolle</span><p class="nu-rolle-fest">Admin</p></div></div>'
      + '<p class="nu-stand-text">Admin-Konten lassen sich hier weder ändern noch löschen.</p>'
  }
  return '<div class="nu-rollenfeld">'
    + '<div class="li-feld"><label class="li-label" for="user-detail-role">Rolle</label>'
    + `<select id="user-detail-role" class="li-auswahl" data-aktuell="${esc(user.role)}">`
    + `<option value="user"${user.role === 'user' ? ' selected' : ''}>${esc(roleLabel('user'))}</option>`
    + `<option value="premium"${user.role === 'premium' ? ' selected' : ''}>${esc(roleLabel('premium'))}</option></select></div>`
    + '<button type="button" class="adm-cta" id="user-role-save-btn" data-action="save-selected-user-role" aria-disabled="true"><span id="user-role-save-text">Rolle speichern</span> <span aria-hidden="true">→</span></button>'
    + '<span class="adm-visually-hidden" id="user-role-hinweis">Erst eine andere Rolle wählen.</span>'
    + '</div>'
}

// Löschfrist inaktiver Konten wie im Job: frühestens 30 Tage nach der Warnung und 24 Monate nach der letzten Aktivität
function loeschFristHtml(user, konto) {
  const warnung = Date.parse(konto.loeschWarnungAm)
  if (!Number.isFinite(warnung)) return ''
  const aktiv = Date.parse(konto.zuletztAktiv || user.createdAt)
  const frist = Math.max(warnung + WARNUNG_VORLAUF_TAGE * TAG_MS, Number.isFinite(aktiv) ? aktiv + INAKTIV_TAGE * TAG_MS : 0)
  return `<div><dt>Löschfrist</dt><dd>Löschwarnung am ${esc(datumDe(konto.loeschWarnungAm))} verschickt – ohne Anmeldung wird das Konto ab ${esc(datumDe(new Date(frist).toISOString()))} gelöscht.</dd></div>`
}

// Spielschlüssel der Statistik → Anzeigename: „Wort der Woche: Wort-Zwilling“ statt woche_wortzwilling
function spielName(key) {
  const m = MODI.find((x) => x.key === key)
  if (m) return m.label
  const wochenModus = String(key).startsWith('woche_') ? MODI.find((x) => x.key === String(key).slice(6)) : null
  return wochenModus ? `Wort der Woche: ${wochenModus.label}` : String(key)
}

function spielstatistikHtml(stats) {
  const nachModus = new Map((stats.byGame || []).map((g) => [g.spiel, g]))
  const bekannt = new Set(MODI.map((m) => m.key))
  // Wort der Woche in der Reihenfolge der Spielmodi (nicht alphabetisch); unbekannte Schlüssel danach, alphabetisch
  const wocheReihenfolge = MODI.map((m) => `woche_${m.key}`)
  const rang = (k) => { const i = wocheReihenfolge.indexOf(k); return i < 0 ? wocheReihenfolge.length : i }
  const weitere = [...nachModus.keys()].filter((k) => !bekannt.has(k)).sort((a, b) => rang(a) - rang(b) || a.localeCompare(b))
  const modi = [...MODI, ...weitere.map((k) => ({ key: k, label: spielName(k) }))]
  const gespielt = Number(stats.totals?.plays || 0)
  return '<section class="tag-abschnitt" aria-labelledby="nu-spiele-titel">'
    + '<h2 class="tag-abschnitt-titel" id="nu-spiele-titel">Spielstatistik</h2>'
    + (gespielt
      ? `<p class="nu-summe">${spieleText(gespielt)} · ${DURCHSCHNITT_HTML}${punkteDe(stats.totals.scoreSum, stats.totals.maxSum)} von 10</p>`
        + '<dl class="tag-dl">' + modi.map((m) => {
          const g = nachModus.get(m.key)
          return `<div><dt>${esc(m.label)}</dt><dd>${g ? `${spieleText(Number(g.plays || 0))} · ${DURCHSCHNITT_HTML}${punkteDe(g.scoreSum, g.maxSum)}` : '<span class="nu-leer">noch nicht gespielt</span>'}</dd></div>`
        }).join('') + '</dl>'
      : '<p class="nu-summe nu-leer">Noch nicht gespielt.</p>')
    + '</section>'
}

function aktivitaetHtml(stats) {
  const tage = new Map()
  for (const r of stats.recent || []) {
    if (!tage.has(r.datum)) tage.set(r.datum, [])
    tage.get(r.datum).push(r)
  }
  return '<section class="tag-abschnitt" aria-labelledby="nu-verlauf-titel">'
    + '<h2 class="tag-abschnitt-titel" id="nu-verlauf-titel">Letzte Aktivität</h2>'
    + (tage.size
      ? '<p class="tag-abschnitt-text">Die letzten 20 Spiele, neueste zuerst. Punkte von 10.</p><ol class="nu-verlauf">' + [...tage].map(([iso, rows]) => {
        const ok = isValidIsoDay(iso)
        const t = ok ? datumTeile(iso) : null
        return '<li class="nu-verlauf-tag">'
          + '<span class="nu-verlauf-datum">'
          + (t ? `<span class="nu-wt" aria-hidden="true">${DAYS_DE[t.wt]}</span><span class="adm-visually-hidden">${WOCHENTAGE_LANG[t.wt]}, </span>${esc(formatIsoDate(iso))}` : esc(iso))
          + '</span><ul class="nu-verlauf-spiele">' + rows.map((r) => {
            return `<li><span class="nu-modus">${esc(spielName(r.spiel))}</span><span class="adm-visually-hidden">: </span>${punkteDe(r.scoreSum, r.maxSum)}${Number(r.plays) > 1 ? ` <span class="nu-zusatz">(${Number(r.plays)}×)</span>` : ''}</li>`
          }).join('') + '</ul></li>'
      }).join('') + '</ol>'
      : '<p class="tag-abschnitt-text">Noch nicht gespielt.</p>')
    + '</section>'
}

function renderKonto(data) {
  const host = document.getElementById('user-detail')
  if (!host) return
  const user = data.user || {}
  const konto = data.konto || {}
  const kauf = { gesamtausgabe: false, seit: null, quelle: null, zahlungen: [], ...data.kauf }
  const stats = { totals: {}, byGame: [], recent: [], ...data.stats }
  const daten = { user, konto, kauf }
  const name = nutzerName(user)
  const stand = premiumStand(daten)
  const anmeldung = (konto.anmeldung || []).map((p) => ANMELDUNG_TEXT[p] || ANMELDUNG_TEXT.andere).join(' · ') || '–'

  const kopf = '<header class="nu-kopf">'
    + `<p class="nu-kopf-name">${esc(name)}</p>`
    + `<p class="nu-kopf-mail">${esc(user.email)}</p>`
    + '<p class="nu-kopf-zeile">'
    + (user.role === 'user'
      ? `<span><span class="adm-visually-hidden">Rolle </span>${esc(roleLabel('user'))}</span>`
      : `<span class="nu-rolle" data-rolle="${esc(user.role)}"><span class="adm-visually-hidden">Rolle </span>${esc(roleLabel(user.role))}</span>`)
    + `<span>angelegt am ${esc(datumDe(user.createdAt))}</span></p></header>`

  const angaben = '<section class="tag-abschnitt" aria-labelledby="nu-angaben-titel">'
    + '<h2 class="tag-abschnitt-titel" id="nu-angaben-titel">Angaben</h2>'
    + '<dl class="tag-dl">'
    + `<div><dt>E-Mail</dt><dd>${esc(user.email)}<span class="adm-visually-hidden">, </span><span class="nu-zusatz">${user.emailVerified ? 'bestätigt' : 'nicht bestätigt'}</span></dd></div>`
    + `<div><dt>Name</dt><dd>${esc(name)}</dd></div>`
    + `<div><dt>Angelegt</dt><dd>${esc(datumLangDe(user.createdAt))}</dd></div>`
    // „Zuletzt aktiv“, nicht „Letzte Anmeldung“: Eine Anmeldung wird nirgends gespeichert (user_activity.last_active_at).
    + `<div><dt>Zuletzt aktiv</dt><dd>${esc(datumLangDe(konto.zuletztAktiv))}</dd></div>`
    + `<div><dt>Anmeldung</dt><dd>${esc(anmeldung)}</dd></div>`
    + loeschFristHtml(user, konto)
    + `<div><dt>Interne ID</dt><dd class="nu-id">${esc(user.id)}</dd></div>`
    + '</dl>'
    + rollenfeldHtml(user)
    + '<p class="li-meldung" id="user-role-meldung" role="status" aria-live="polite"></p>'
    + '</section>'

  const kaufTeil = '<section class="tag-abschnitt" aria-labelledby="nu-kauf-titel">'
    + '<h2 class="tag-abschnitt-titel" id="nu-kauf-titel">Kauf und Gesamtausgabe</h2>'
    + `<p class="nu-stand">${esc(stand.titel)}</p><p class="nu-stand-text">${esc(stand.text)}</p>`
    + kaufHinweisHtml(daten)
    + (kauf.zahlungen.length
      ? `<h3 class="nu-unterlabel">Zahlungen</h3><ul class="nu-zahlungen">${kauf.zahlungen.map(zahlungHtml).join('')}</ul>`
      : '')
    // Der Hinweis erklärt, was die Zahlungsliste nicht zeigt: ohne Zahlungen gibt es nichts zu erklären.
    + (kauf.zahlungen.length ? '<p class="tag-abschnitt-text">Erstattungen und Rückbuchungen (Mollie, App Store) werden seit dem 27.10.2026 erfasst und als „erstattet“ markiert.</p>' : '')
    + '</section>'

  const exportTeil = '<section class="tag-abschnitt" aria-labelledby="nu-export-titel">'
    + '<h2 class="tag-abschnitt-titel" id="nu-export-titel">Daten exportieren</h2>'
    + '<p class="tag-abschnitt-text">Lädt die gespeicherten Angaben dieses Kontos als Datei herunter, etwa für eine Auskunft nach DSGVO.</p>'
    + '<p class="nu-export"><button type="button" class="adm-link" data-action="export-user" data-format="json">als JSON herunterladen</button>'
    + '<button type="button" class="adm-link" data-action="export-user" data-format="csv">als CSV herunterladen</button></p>'
    // Meldung direkt unter den Knöpfen (nicht oben auf der Seite)
    + '<p class="li-meldung" id="user-export-meldung" role="status" aria-live="polite"></p>'
    + '</section>'

  // Admin-Konten lassen sich nicht löschen: kein Abschnitt, kein Knopf.
  const loeschTeil = user.role === 'admin' ? '' : '<section class="tag-abschnitt tag-loeschen" aria-labelledby="nu-loeschen-titel">'
    + '<h2 class="tag-abschnitt-titel" id="nu-loeschen-titel">Konto löschen</h2>'
    + '<p class="tag-loeschen-text">Löscht das Konto mit Rolle, Spielstatistik, eigenen Wörtern und Klassenraum-Sitzungen. Zahlungsbelege bleiben ohne Namen und E-Mail erhalten (Aufbewahrungspflicht). Der Vorgang steht im Änderungsprotokoll.</p>'
    + '<button type="button" class="li-loeschen nu-loeschen-knopf" id="user-delete-btn" data-action="delete-selected-user"><span id="user-delete-text">Konto löschen …</span></button>'
    + '</section>'

  // Die Live-Regionen für „Rolle gespeichert“ und Export bleiben dieselben Knoten (sonst keine Ansage)
  behalteMeldungen(host, ['user-role-meldung', 'user-export-meldung'], () => {
    host.innerHTML = kopf + angaben + kaufTeil + spielstatistikHtml(stats) + aktivitaetHtml(stats) + exportTeil + loeschTeil
  })
  aktualisiereRollenKnopf()

  // Die Überschrift nennt das Konto unsichtbar mit („Konto: Mara Beispiel“). Der Seitentitel (document.title)
  // bleibt ohne Namen: Er landet im Verlauf.
  const h1 = document.getElementById('page-title')
  if (h1 && currentRoute?.page === 'user') {
    h1.textContent = 'Konto'
    const wer = document.createElement('span')
    wer.className = 'adm-visually-hidden'
    wer.textContent = `: ${name}`
    h1.append(wer)
  }
}

// „Rolle speichern“ ist gesperrt, solange die Auswahl der gespeicherten Rolle entspricht oder etwas läuft.
// Im ersten Fall nennt ein unsichtbarer Hinweis den Grund.
function aktualisiereRollenKnopf() {
  const select = document.getElementById('user-detail-role')
  const knopf = document.getElementById('user-role-save-btn')
  if (!select || !knopf) return
  const gleich = select.value === select.dataset.aktuell
  if (gleich || kontoBeschaeftigt) knopf.setAttribute('aria-disabled', 'true')
  else knopf.removeAttribute('aria-disabled')
  if (gleich && !kontoBeschaeftigt) knopf.setAttribute('aria-describedby', 'user-role-hinweis')
  else knopf.removeAttribute('aria-describedby')
}

// Gehört die Seite noch zu diesem Konto? (Man kann während einer Anfrage zu einem anderen Konto wechseln.)
const istKontoSeite = (id) => currentRoute?.page === 'user' && currentRoute.nutzerId === id

async function saveSelectedUserRole() {
  const select = document.getElementById('user-detail-role')
  const knopf = document.getElementById('user-role-save-btn')
  if (!select || !knopf || !kontoAktuell || kontoBeschaeftigt) return
  // Das Konto gleich festhalten: Wechselt man während der Anfrage zu einem anderen, gehört das Ergebnis zu diesem.
  const aktuell = kontoAktuell
  const user = aktuell.user
  const ziel = select.value
  if (user.role === 'admin' || (ziel !== 'user' && ziel !== 'premium') || ziel === user.role) return

  if (ziel === 'user' && aktuell.kauf?.gesamtausgabe) {
    const details = ['Das Konto hat die Gesamtausgabe gekauft und behält sie, verliert aber Klassenraum und unbegrenzte eigene Wörter.']
    if (!(await bestaetige({ frage: `Rolle auf ${roleLabel('user')} setzen?`, details, aktion: 'Setzen', gefahr: false }))) return
    // Die Rückfrage schließt beim Adresswechsel; trotzdem nur weitermachen, wenn dieses Konto noch offen ist.
    if (kontoAktuell !== aktuell || !istKontoSeite(user.id) || kontoBeschaeftigt) return
  }

  kontoBeschaeftigt = true
  knopf.classList.add('is-busy')
  knopf.setAttribute('aria-disabled', 'true')
  document.getElementById('user-role-save-text').textContent = 'Wird gespeichert …'
  setMeldung('user-role-meldung', '')
  try {
    const response = await fetch(`/admin/users/${encodeURIComponent(user.id)}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: ziel }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    user.role = ziel
    if (aktuell.konto) aktuell.konto.rolleGeaendertAm = new Date().toISOString()
    // Die Liste im Speicher nachführen und neu zeichnen (sie steht hinter dieser Seite und soll beim Zurückkehren stimmen)
    const { entfernt } = setzeNutzerRolleLokal([user.id], ziel)
    // Fällt das Konto aus dem Rollenfilter, ist der Namen-Link weg: Der Fokus geht beim Zurückkehren zur Zahlzeile.
    if (entfernt) naechsterFokus = '#users-summary'
    zeichneNutzerNachAenderung()
    kontoBeschaeftigt = false
    if (kontoAktuell === aktuell && istKontoSeite(user.id)) {
      // Neu zeichnen: Rollenmarke, Stand von Kauf und Gesamtausgabe und der Hinweis „gekauft, aber Basiszugang“ ändern sich mit.
      renderKonto(aktuell)
      setMeldung('user-role-meldung', `Rolle gespeichert: ${roleLabel(ziel)}.`, 'ok')
      document.getElementById('user-detail-role')?.focus()
    }
  } catch (err) {
    kontoBeschaeftigt = false
    if (kontoAktuell === aktuell && istKontoSeite(user.id)) {
      select.value = select.dataset.aktuell
      knopf.classList.remove('is-busy')
      document.getElementById('user-role-save-text').textContent = 'Rolle speichern'
      aktualisiereRollenKnopf()
      setMeldung('user-role-meldung', `Nicht gespeichert: ${err.message}`, 'error')
      select.focus()
    }
  }
}

async function exportiereKonto(format) {
  if ((format !== 'json' && format !== 'csv') || !kontoAktuell || kontoBeschaeftigt) return
  const id = kontoAktuell.user.id
  // Die Meldung steht im Abschnitt „Daten exportieren“, direkt unter den Knöpfen
  const melde = (text, ton) => { if (istKontoSeite(id)) setMeldung('user-export-meldung', text, ton) }
  melde('')
  try {
    const { exportiert } = await ladeKontenExport([id], format, 'signifikation-konto')
    if (exportiert) melde(`Daten als ${format.toUpperCase()} heruntergeladen.`, 'ok')
    else melde('Nicht heruntergeladen: Das Konto gibt es nicht mehr.', 'error')
  } catch (err) {
    melde(`Nicht heruntergeladen: ${err.message}`, 'error')
  }
}

async function deleteSelectedUser() {
  const knopf = document.getElementById('user-delete-btn')
  if (!knopf || !kontoAktuell || kontoBeschaeftigt) return
  const aktuell = kontoAktuell
  const { user, kauf } = aktuell
  if (user.role === 'admin') return

  const details = [user.email]
  if (kauf?.gesamtausgabe) {
    const z = kauf.zahlungen?.[0]
    const wo = { mollie: ' über die Website', apple: ' im App Store' }[z?.quelle] || ''
    const quelle = z ? ` (${betragDe(z.betrag, z.waehrung)}${wo})` : ''
    details.push(`Hat die Gesamtausgabe gekauft${quelle}. Ein Kauf im App Store lässt sich in der App einem neuen Konto wieder zuordnen, ein Website-Kauf nicht.`)
  }
  details.push('Zahlungsbelege bleiben ohne Namen und E-Mail erhalten.', 'Das lässt sich nicht rückgängig machen.')
  if (!(await bestaetige({ frage: `Konto von ${nutzerName(user)} löschen?`, details, aktion: 'Löschen' }))) return
  if (kontoAktuell !== aktuell || !istKontoSeite(user.id) || kontoBeschaeftigt) return

  kontoBeschaeftigt = true
  knopf.setAttribute('aria-disabled', 'true')    // nicht disabled: Der Fokus bleibt
  document.getElementById('user-delete-text').textContent = 'Wird gelöscht …'
  setKontoStatus('')
  try {
    const response = await fetch(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    if (nutzerListe.some((u) => u.id === user.id)) {
      entferneNutzerAusListe([user.id], { geloescht: true })
      zeichneNutzerNachAenderung()
    } else if (usersLoaded) {
      usersLoaded = false      // Konto war nicht geladen: Zählung und Seiten stimmen nicht mehr, der nächste Besuch lädt neu
    }
    if (kontoAktuell === aktuell) kontoAktuell = null
    kontoBeschaeftigt = false
    setNutzerStatus('Konto gelöscht.', 'ok')
    // Nur zurück zur Liste, wenn man noch auf diesem Konto steht (sonst wäre man schon woanders)
    if (istKontoSeite(user.id)) {
      naechsterFokus = '#users-status'
      goBackFromSubpage()
    }
  } catch (err) {
    kontoBeschaeftigt = false
    if (istKontoSeite(user.id)) {
      knopf.removeAttribute('aria-disabled')
      document.getElementById('user-delete-text').textContent = 'Konto löschen …'
      setKontoStatus(`Nicht gelöscht: ${err.message}`, 'error', { fokus: true })
    } else {
      setNutzerStatus(`Konto nicht gelöscht: ${err.message}`, 'error')
    }
  }
}

// ── Wort-Zwilling – Prüfung im Tag ─────────────────────────
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
    renderTagWortZwilling(data, out, wortA, wortB)
  } catch (err) {
    schreibeErgebnis(out, ergebnisMeldung(`Prüfen fehlgeschlagen: ${err.message}`, 'error'))
  }
}

// Ergebnis der Wort-Zwilling-Prüfung als HTML. Gemeinsam für Tag bearbeiten (ebene 4) und Werkzeuge › Wort prüfen
// (ebene 3): Überschriften der beiden Spalten.
function wzErgebnisHtml(data, { ebene = 3, wortA = '', wortB = '' } = {}) {
  if (!data.usable) {
    const a = data.wortA || wortA
    const b = data.wortB || wortB
    return ergebnisMeldung(`Nicht geeignet: Für „${a}“ und „${b}“ gibt es zu wenige Kollokatoren, die nur zu einem der beiden passen (mindestens fünf je Wort).`, 'warn')
  }
  const alle = Array.isArray(data.kollokatoren) ? data.kollokatoren : []
  const spalte = (kopf, seite, scoreKey) => {
    const zeilen = alle.filter((k) => k.zuordnung === seite).slice(0, 5).map((k) => zeileMitZahl(k.wort, k[scoreKey])).join('')
    return `<div class="tag-erg-spalte"><h${ebene} class="tag-erg-kopf">${esc(kopf)}</h${ebene}><ol class="tag-erg-knapp">${zeilen}</ol></div>`
  }
  return ergebnisMeldung('Geeignet: genug eigene Kollokatoren für beide Wörter.', 'ok')
    + `<div class="tag-erg-spalten">${spalte(data.wortA, 'A', 'scoreA')}${spalte(data.wortB, 'B', 'scoreB')}</div>`
    + '<p class="tag-erg-fuss">Zahl = logDice zum jeweiligen Wort; gespielt werden nur Kollokatoren, die zu einem der beiden passen.</p>'
}

// Ergebnis auf der Tagesseite
function renderTagWortZwilling(data, out, wortA, wortB) {
  schreibeErgebnis(out, wzErgebnisHtml(data, { ebene: 4, wortA, wortB }))
}

// ── Werkzeuge › Wort prüfen ───────────────────────────────
// Vier Formulare (Kollokationen, Wort-Zwilling, Zeitenwende, Lückenfüller), je ein Absenden (Enter oder Knopf).
// Die Ergebnisse nutzen dieselben Bausteine wie die Prüfung im Tag; Wort-Zwilling und Zeitenwende sind
// dieselben Funktionen (wzErgebnisHtml, zwErgebnisHtml), nur die Überschriftenebene unterscheidet sich.

const PRUEF = {
  k: { out: 'koll-output', live: 'koll-live', btn: 'koll-start', text: 'koll-start-text', felder: ['koll-input'] },
  w: { out: 'wz-ana-output', live: 'wz-live', btn: 'wz-start', text: 'wz-start-text', felder: ['wza-input', 'wzb-input'] },
  z: { out: 'zw-ana-output', live: 'zw-live', btn: 'zw-start', text: 'zw-start-text', felder: ['zw-ana-input'] },
  l: { out: 'lf-ana-output', live: 'lf-live', btn: 'lf-start', text: 'lf-start-text', felder: ['lf-ana-input'] },
}
// Modi, deren Abfrage gerade läuft: gegen Doppel-Absenden (Enter und Klick, zweimal Enter)
const pruefLaeuft = new Set()
const PRUEF_ZUSATZ = { k: ': Kollokationen', w: ': Wort-Zwilling', z: ': Zeitenwende', l: ': Lückenfüller' }

// Sagt einen Text in der Live-Region an. Erst leeren, damit auch derselbe Text erneut angesagt wird.
function sageAnLive(liveId, text) {
  const live = document.getElementById(liveId)
  if (!live) return
  live.textContent = ''
  if (text) window.setTimeout(() => { live.textContent = text }, 50)
}

function schreibePruefung(modus, html) {
  const p = PRUEF[modus]
  const out = document.getElementById(p.out)
  if (!out) return
  out.innerHTML = html
  sageAnLive(p.live, out.querySelector('.tag-erg-meldung')?.textContent || '')
  const leeren = out.closest('form')?.querySelector('[data-action^="reset-"]')
  if (leeren) leeren.hidden = !html
}

// Knopftext „Prüfen“ ↔ „prüft …“; das unsichtbare Zusatzwort („: Kollokationen“) bleibt erhalten
function setzePruefKnopf(modus, busy) {
  const p = PRUEF[modus]
  const btn = document.getElementById(p.btn)
  const text = document.getElementById(p.text)
  if (!btn || !text) return
  btn.classList.toggle('is-busy', busy)
  if (busy) btn.setAttribute('aria-disabled', 'true')
  else btn.removeAttribute('aria-disabled')
  text.innerHTML = `${busy ? 'prüft …' : 'Prüfen'}<span class="adm-visually-hidden">${PRUEF_ZUSATZ[modus]}</span>`
}

function pruefFehlerText(err) {
  if (err?.status === 409) return err.data?.error || 'Diese Prüfung läuft schon (anderer Tab oder doppelt abgeschickt). Das Ergebnis erscheint dort; danach geht es hier wieder.'
  if (err?.data?.error) return `Prüfen fehlgeschlagen: ${err.data.error}`
  return `Prüfen fehlgeschlagen: Der Server hat nicht geantwortet${err?.status ? ` (HTTP ${err.status})` : ''}. Bitte gleich noch einmal versuchen.`
}

// Ergebnis der Kollokationen-Prüfung: was das Spiel aus dem Wort macht (gesucht = Platz 1–3, Ablenker = Auswahl aus Platz 4–25)
function kollErgebnisHtml(d) {
  const fuss = 'Zahl = logDice im eigenen Korpus (Assoziationsmaß, höchstens 14).'
  const pool = Number(d.pool) || 0
  if (!d.usable) {
    // Unbekanntes Wort: nichts zu zählen, also auch keine Zahlen und keine Fußzeile dazu
    if (!pool) return ergebnisMeldung('Nicht geeignet: keine Kollokatoren im Korpus.', 'warn')
    const liste = (Array.isArray(d.kollokatoren) ? d.kollokatoren : []).map((k) => zeileMitZahl(k.wort, k.logDice, '', k.platz)).join('')
    return ergebnisMeldung(`Nicht geeignet: nur ${anzahlText(pool, 'Kollokator', 'Kollokatoren')} im Korpus (${d.pos}). Das Spiel braucht mindestens ${d.min ?? 10} – drei gesuchte und sieben Ablenker.`, 'warn')
      + (liste ? `<ol class="tag-erg-knapp">${liste}</ol>` : '')
      + (liste ? `<p class="tag-erg-fuss">${fuss}</p>` : '')
  }
  const spalte = (kopf, items) => `<div class="tag-erg-spalte"><h3 class="tag-erg-kopf">${esc(kopf)}</h3><ol class="tag-erg-knapp">${(items || []).map((k) => zeileMitZahl(k.wort, k.logDice, '', k.platz)).join('')}</ol></div>`
  const bonus = d.bonus
    ? `<dl class="tag-dl be-dl">${betriebZeile('Bonusfrage', betriebWert(d.bonus.question || '–'), esc(d.bonus.label || ''))}`
      + `${betriebZeile('Antwort', betriebWert(d.bonus.correct || '–'), Array.isArray(d.bonus.options) ? esc(`zur Wahl: ${d.bonus.options.join(', ')}`) : '')}</dl>`
    : ''
  return ergebnisMeldung(`Geeignet als Basis (${d.pos}): ${anzahlText(pool, 'Kollokator', 'Kollokatoren')} im Korpus.`, 'ok')
    + `<div class="tag-erg-spalten">${spalte('Gesucht im Spiel', d.gesucht)}${spalte('Ablenker (Auswahl)', d.ablenker)}</div>`
    + bonus
    + `<p class="tag-erg-fuss">Lies die drei gesuchten Kollokatoren: Passen sie zur gemeinten Bedeutung? (Ton kann Lehm oder Klang sein.) Die Ablenker wählt das Spiel jeden Tag neu aus den Plätzen 4 bis 25. ${fuss}</p>`
}

// Lückenfüller-Prüfung (Wort prüfen): Runden, die aus dem Wort entstünden
function lfErgebnisHtml(d, wort) {
  if (!d.usable) {
    // Kennung gehört schon zu einem anderen Wort: der Servertext erklärt es genauer als der Standardsatz
    const kollision = /^Die Kennung/.test(d.reason || '')
    return ergebnisMeldung(kollision ? d.reason : `Nicht genug Material für „${wort}“: zu wenige Kollokatoren oder keine Belegsätze, in denen sich eine Lücke setzen lässt.`, 'warn')
  }
  const neu = d.neuesLemma ? ' Noch kein Lückenfüller-Eintrag; „Runden erzeugen“ im Tag legt ihn an.' : ''
  const zeilen = (Array.isArray(d.preview) ? d.preview : []).map((r, i) =>
    `<li class="tag-erg-zeile"><span class="tag-erg-wort">${i + 1}. ${esc(r.kollokator || '–')}</span><span class="tag-erg-werte">${esc(LF_TYPEN[r.type] || r.type || '')}</span>`
    + `<span class="tag-erg-urteil"><span class="tag-erg-zahl">${esc(anzahlText(r.punkte ?? 0, 'Punkt', 'Punkte'))}</span></span></li>`).join('')
  return ergebnisMeldung(`Geeignet (${d.pos || '–'}): ${anzahlText(d.rounds || 0, 'Runde', 'Runden')}.${neu}`, 'ok')
    + (zeilen ? `<ol class="tag-erg-liste">${zeilen}</ol>` : '')
}

async function pruefe(modus) {
  const p = PRUEF[modus]
  if (!p || pruefLaeuft.has(modus)) return
  const wert = (id) => document.getElementById(id)?.value.trim() || ''
  for (const id of p.felder) entmarkiereFeld(id)
  const leere = p.felder.filter((id) => !wert(id))
  if (leere.length) {
    schreibePruefung(modus, ergebnisMeldung(modus === 'w' ? 'Erst beide Wörter eintragen.' : 'Erst ein Wort eintragen.'))
    // Fehler am Feld: aria-invalid, der Fehlertext (die Meldung im Ergebnisbereich) hängt per aria-describedby daran
    for (const id of leere) markiereFeld(id, p.out)
    document.getElementById(leere[0])?.focus()
    return
  }
  pruefLaeuft.add(modus)
  setzePruefKnopf(modus, true)
  schreibePruefung(modus, ergebnisMeldung(modus === 'l' ? 'Prüft im Korpus … Das kann bis zu 15 Sekunden dauern.' : 'Prüft im Korpus …', 'loading'))
  try {
    let html
    if (modus === 'k') {
      const pos = document.getElementById('koll-pos')?.value || ''
      const d = await holeJson(`/admin/analyze-kollokation?q=${encodeURIComponent(wert('koll-input'))}${pos ? `&pos=${encodeURIComponent(pos)}` : ''}`)
      html = kollErgebnisHtml(d)
    } else if (modus === 'w') {
      const a = wert('wza-input')
      const b = wert('wzb-input')
      const d = await holeJson(`/admin/analyze-wortzwilling?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&pos=${encodeURIComponent(document.getElementById('wzana-pos')?.value || 'Substantiv')}`)
      html = wzErgebnisHtml(d, { ebene: 3, wortA: a, wortB: b })
    } else if (modus === 'z') {
      const w = wert('zw-ana-input')
      html = zwErgebnisHtml(await holeJson(`/admin/analyze-zeitenwende?q=${encodeURIComponent(w)}`), { ebene: 3, wort: w })
    } else {
      const w = wert('lf-ana-input')
      const pos = document.getElementById('lf-pos')?.value || ''
      html = lfErgebnisHtml(await holeJson(`/admin/analyze-lueckenfueller?q=${encodeURIComponent(w)}${pos ? `&pos=${encodeURIComponent(pos)}` : ''}`), w)
    }
    schreibePruefung(modus, html)
  } catch (err) {
    schreibePruefung(modus, ergebnisMeldung(pruefFehlerText(err), 'error'))
  } finally {
    setzePruefKnopf(modus, false)
    pruefLaeuft.delete(modus)
  }
}

// „leeren“: Eingaben und Ergebnis weg, Fokus zurück ins erste Feld
function leerePruefung(knopf) {
  const form = knopf.closest('form')
  if (!form) return
  form.querySelectorAll('input').forEach((i) => { i.value = ''; entmarkiereFeld(i.id) })
  schreibePruefung(form.dataset.modus, '')
  sageAnLive(PRUEF[form.dataset.modus].live, '')
  form.querySelector('input')?.focus()
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
    renderTagZeitenwende(data, out, lemma)
  } catch (err) {
    schreibeErgebnis(out, ergebnisMeldung(`Prüfen fehlgeschlagen: ${err.message}`, 'error'))
  }
}

// Ergebnis der Zeitenwende-Prüfung als HTML. Gemeinsam für Tag bearbeiten (ebene 4) und Werkzeuge › Wort prüfen (ebene 3).
function zwErgebnisHtml(data, { ebene = 3, wort = '' } = {}) {
  const pre = Array.isArray(data.preCandidates) ? data.preCandidates : []
  const post = Array.isArray(data.postCandidates) ? data.postCandidates : []
  if (!pre.length && !post.length) {
    return ergebnisMeldung(`Für „${wort || data.lemma || 'dieses Wort'}“ gibt es keine Zeitenwende-Daten: zu wenige Belege vor oder nach 2000.`, 'warn')
  }
  const kopf = data.usable
    ? ergebnisMeldung('Geeignet: genug Kollokatoren, die vor oder nach 2000 typisch sind.', 'ok')
    : ergebnisMeldung('Nicht geeignet: zu wenige Unterschiede vor und nach 2000.', 'warn')
  const spalte = (titel, periode, items, key) => {
    const zeilen = items.slice(0, 5).map((it) => zeileMitZahl(it.wort, it[key], '+')).join('')
    return `<div class="tag-erg-spalte"><h${ebene} class="tag-erg-kopf tag-erg-kopf--zeit" data-periode="${periode}">${titel}</h${ebene}>${zeilen ? `<ol class="tag-erg-knapp">${zeilen}</ol>` : '<p class="tag-erg-fuss">Keine Kandidaten</p>'}</div>`
  }
  const spiel = Array.isArray(data.words) && data.words.length
    ? `<p class="tag-erg-auswahl"><span class="tag-label">Im Spiel</span>${data.words.map((w) => {
      const periode = w.periode === 'pre' ? 'pre' : 'post'
      // Leerzeichen vor der Marke; die kurze Marke ist für Screenreader durch „(vor 2000)“ ersetzt.
      return `${esc(w.wort)} <span class="tag-erg-periode" data-periode="${periode}"><span aria-hidden="true">${periode === 'pre' ? 'vor' : 'nach'}</span><span class="adm-visually-hidden">(${periode === 'pre' ? 'vor' : 'nach'} 2000)</span></span>`
    }).join(' · ')}</p>`
    : ''
  return kopf
    + `<div class="tag-erg-spalten">${spalte('vor 2000', 'pre', pre, 'distPre')}${spalte('nach 2000', 'post', post, 'distPost')}</div>`
    + spiel
    + '<p class="tag-erg-fuss">Zahl = Abstand im logDice zwischen den Zeiträumen.</p>'
}

// Ergebnis auf der Tagesseite
function renderTagZeitenwende(data, out, wort) {
  schreibeErgebnis(out, zwErgebnisHtml(data, { ebene: 4, wort }))
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
      if (!(await bestaetige({ frage: `Runden für „${lemmaName}“ jetzt erzeugen?`, text: satz, aktion: 'Erzeugen' }))) return
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

// ── Werkzeuge › Inhalte: gemeinsame Helfer ────────────────

// Feld als fehlerhaft markieren und mit seinem Fehlertext verbinden: aria-invalid + aria-describedby.
// Das bisherige aria-describedby (Zähler, Hinweis) bleibt erhalten und kommt mit entmarkiereFeld zurück.
function markiereFeld(feldId, textId) {
  const el = document.getElementById(feldId)
  if (!el) return
  if (el.dataset.beschreibung === undefined) el.dataset.beschreibung = el.getAttribute('aria-describedby') || ''
  el.setAttribute('aria-invalid', 'true')
  el.setAttribute('aria-describedby', [el.dataset.beschreibung, textId].filter(Boolean).join(' '))
}

function entmarkiereFeld(feldId) {
  const el = document.getElementById(feldId)
  if (!el || el.dataset.beschreibung === undefined) return
  el.removeAttribute('aria-invalid')
  if (el.dataset.beschreibung) el.setAttribute('aria-describedby', el.dataset.beschreibung)
  else el.removeAttribute('aria-describedby')
  delete el.dataset.beschreibung
}

// Doppelklick-Schutz über das await hinweg: Pro Schlüssel läuft höchstens eine Aktion; ein zweiter Klick wird verschluckt.
const laufendeAktionen = new Set()
async function einmalJe(schluessel, aktion) {
  if (laufendeAktionen.has(schluessel)) return undefined
  laufendeAktionen.add(schluessel)
  try {
    return await aktion()
  } finally {
    laufendeAktionen.delete(schluessel)
  }
}

// Fehlertext einer Antwort für Meldungen: der Satz des Servers, sonst der Status
const serverFehlerText = (err) => err?.data?.error || (err?.status ? `Der Server hat mit HTTP ${err.status} geantwortet.` : 'Der Server hat nicht geantwortet.')

// ── Werkzeuge › Inhalte: Stand in der Übersicht ───────────
// Aus Daten, die ohnehin geladen sind: freeDaysData (lädt beim Start) und /admin/health (lädt in der Übersicht).
let inhalteHealth = null   // letzte Antwort von /admin/health (null: unbekannt)

function renderInhalteStand() {
  const h = inhalteHealth
  if (!bonusGeladen) setzeStand('wz-stand-bonus', '')
  else {
    const heute = getTodayIso()
    const naechster = freeDaysData.filter((t) => t.date >= heute).sort((a, b) => a.date.localeCompare(b.date))[0]
    if (!naechster) setzeStand('wz-stand-bonus', 'Keiner geplant')
    else if (naechster.date === heute) setzeStand('wz-stand-bonus', `Heute +${naechster.bonus_count}`)
    else setzeStand('wz-stand-bonus', `Nächster ${datumKurz(naechster.date)}, +${naechster.bonus_count}`)
  }

  if (!h?.push) setzeStand('wz-stand-push', '')
  else if (!h.push.web && !h.push.ios) setzeStand('wz-stand-push', 'Nicht eingerichtet', 'warn')
  else setzeStand('wz-stand-push', anzahlText(h.push.geraete, 'Gerät', 'Geräte'))

  socialStandAktualisieren()

  const sw = h?.spezialwoche
  if (sw?.laeuft) setzeStand('wz-stand-woche', `Diese Woche: ${sw.lemma}`)
  else if (sw) setzeStand('wz-stand-woche', `Ab ${datumKurz(sw.von)}: ${sw.lemma}`)
  else setzeStand('wz-stand-woche', '')
}

// ── Werkzeuge › Bonus-Tage ────────────────────────────────
// An Bonus-Tagen dürfen Konten mit Basiszugang mehr als ein Spiel mit eigenem Lemma spielen.
// Ein Eintrag braucht 1 bis 50 zusätzliche Spiele und einen Tag ab heute (der Server prüft nach Berliner Zeit).

let bonusGeladen = false       // freeDaysData stammt aus einer erfolgreichen Antwort
let bonusLadeFehler = ''       // Text, wenn die Liste nicht geladen werden konnte
let bonusEntfernt = null       // zuletzt entfernter Tag { date, label, bonus_count } für „Rückgängig“
let bonusSpeichert = false     // ein Eintragen/Ersetzen läuft
let bonusLadeToken = 0

const bonusSpieleText = (n) => anzahlText(n, 'Spiel', 'Spiele')

async function loadFreeDays({ silent = false } = {}) {
  const token = ++bonusLadeToken
  if (!silent && !bonusGeladen) renderBonusTage()
  try {
    const { days } = await holeJson('/admin/free-days')
    if (token !== bonusLadeToken) return
    freeDaysData = Array.isArray(days) ? days : []
    bonusGeladen = true
    bonusLadeFehler = ''
  } catch (err) {
    if (token !== bonusLadeToken) return
    // Schon geladene Tage bleiben stehen (Woche und Monat zeigen sie weiter); gemeldet wird nur, wenn nichts da ist.
    if (!bonusGeladen) bonusLadeFehler = `Die Bonus-Tage konnten nicht geladen werden (${err.status ? `HTTP ${err.status}` : 'keine Antwort'}).`
  }
  renderWoche()   // Bonus-Marken in der Woche
  renderMonat()   // … und im Monat
  renderBonusTage()
  renderInhalteStand()
  auBonusNachgeladen()   // … und in den Kennzahlen, falls sie schon vor den Bonus-Tagen gezeichnet wurden
}

function bonusZeile(t, { vergangen = false } = {}) {
  const heute = t.date === getTodayIso()
  return `<li class="in-zeile" data-date="${esc(t.date)}">`
    + `<span class="be-zeile-haupt">${esc(tagText(t.date))}${heute ? '<span class="adm-visually-hidden">, </span><span class="in-heute-marke">heute</span>' : ''}</span>`
    + `<span class="be-zeile-meta">${esc(`+${bonusSpieleText(t.bonus_count)}`)}${t.label ? ` · ${esc(t.label)}` : ''}</span>`
    + (vergangen ? '' : `<span class="in-zeile-aktion"><button type="button" class="li-loeschen" data-action="delete-free-day" data-date="${esc(t.date)}">entfernen<span class="adm-visually-hidden">: ${esc(datumLang(t.date, { jahr: true }))}</span></button></span>`)
    + '</li>'
}

function renderBonusTage() {
  const el = document.getElementById('freedays-list')
  if (!el) return
  if (!bonusGeladen) {
    el.innerHTML = bonusLadeFehler
      ? `<p class="wo-meldung" data-tone="err" role="alert">${esc(bonusLadeFehler)} <button type="button" class="adm-link" data-action="load-free-days">Erneut versuchen</button></p>`
      : '<p class="li-meldung" data-tone="loading">Bonus-Tage werden geladen …</p>'
    return
  }
  const heute = getTodayIso()
  const sortiert = [...freeDaysData].sort((a, b) => a.date.localeCompare(b.date))
  const kommend = sortiert.filter((t) => t.date >= heute)
  const vergangen = sortiert.filter((t) => t.date < heute).reverse()
  el.innerHTML = (kommend.length
    ? `<ol class="be-liste" aria-label="Geplante Bonus-Tage">${kommend.map((t) => bonusZeile(t)).join('')}</ol>`
    : '<div class="li-leer"><p class="li-leer-titel">Kein Bonus-Tag geplant</p><p class="li-leer-text">Konten mit Basiszugang spielen an jedem Tag ein eigenes Lemma.</p><p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>')
    + (vergangen.length
      ? `<details class="be-roh in-vergangen"><summary>Vergangene Bonus-Tage (${ganzzahlDe(vergangen.length)})</summary><ol class="be-liste">${vergangen.map((t) => bonusZeile(t, { vergangen: true })).join('')}</ol></details>`
      : '')
}

// Seite öffnen: Liste sofort aus dem Speicher zeigen, dann frisch nachziehen; Datum nicht vor heute wählbar
function oeffneBonusSeite() {
  const feld = document.getElementById('freeday-date')
  if (feld) feld.min = getTodayIso()
  renderBonusTage()
  pruefeBonusDatum()
  void loadFreeDays({ silent: true })
}

// Belegt oder vergangen: schon beim Wählen des Datums sagen, nicht erst beim Absenden
function pruefeBonusDatum() {
  const feld = document.getElementById('freeday-date')
  const hinweis = document.getElementById('freeday-date-hinweis')
  const knopfText = document.getElementById('bonus-start-text')
  if (!feld || !hinweis || !knopfText) return
  const iso = feld.value
  const vorhanden = freeDaysData.find((t) => t.date === iso)
  hinweis.removeAttribute('data-tone')
  feld.removeAttribute('aria-invalid')
  if (iso && iso < getTodayIso()) {
    hinweis.textContent = 'Der Tag liegt in der Vergangenheit.'
    hinweis.dataset.tone = 'error'
    feld.setAttribute('aria-invalid', 'true')
    knopfText.textContent = 'Eintragen'
  } else if (vorhanden) {
    hinweis.textContent = `Für ${tagText(iso)} ist schon ein Bonus-Tag eingetragen (+${bonusSpieleText(vorhanden.bonus_count)}${vorhanden.label ? `, ${vorhanden.label}` : ''}). Eintragen ersetzt ihn.`
    hinweis.dataset.tone = 'warn'
    knopfText.textContent = 'Ersetzen'
  } else {
    hinweis.textContent = ''
    knopfText.textContent = 'Eintragen'
  }
}

// Absenden: prüfen, bei einem belegten Tag erst im Dialog nachfragen
function addFreeDay() {
  if (bonusSpeichert) return
  const date = document.getElementById('freeday-date')
  const bonus = document.getElementById('freeday-bonus')
  const label = document.getElementById('freeday-label')
  const bonusHinweis = document.getElementById('freeday-bonus-hinweis')
  const dateHinweis = document.getElementById('freeday-date-hinweis')
  const n = Number(bonus.value)
  bonus.removeAttribute('aria-invalid')
  bonusHinweis.removeAttribute('data-tone')
  bonusHinweis.textContent = '1 bis 50 Spiele zusätzlich zum einen Spiel des Tages.'
  if (!date.value || date.value < getTodayIso()) {
    date.setAttribute('aria-invalid', 'true')
    if (!date.value) {
      dateHinweis.textContent = 'Bitte ein Datum wählen.'
      dateHinweis.dataset.tone = 'error'
    }
    date.focus()
    return
  }
  if (!bonus.value.trim() || !Number.isInteger(n) || n < 1 || n > 50) {
    bonus.setAttribute('aria-invalid', 'true')
    bonusHinweis.textContent = 'Bitte eine ganze Zahl von 1 bis 50 eintragen.'
    bonusHinweis.dataset.tone = 'error'
    bonus.focus()
    return
  }
  // Ein belegter Tag: Hinweis und Knopf „Ersetzen“ am Formular (pruefeBonusDatum) sind die Rückfrage; ersetzt wird beim Absenden.
  void speichereBonusTag({ date: date.value, label: label.value.trim(), bonus_count: n })
}

async function speichereBonusTag(eintrag, { rueckgaengig = false } = {}) {
  if (bonusSpeichert) return
  bonusSpeichert = true
  setzeKnopfBusy('bonus-start', 'bonus-start-text', true, 'Wird eingetragen …')
  try {
    const data = await holeJson('/admin/free-days', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eintrag) })
    if (rueckgaengig) {
      setMeldung('freeday-msg', `${tagText(eintrag.date)} wieder eingetragen.`, 'ok', { fokus: true })
    } else {
      setMeldung('freeday-msg', `${tagText(eintrag.date)} ${data.ersetzt ? 'ersetzt' : 'eingetragen'}: ${anzahlText(eintrag.bonus_count, 'zusätzliches Spiel', 'zusätzliche Spiele')}.`, 'ok')
      for (const id of ['freeday-date', 'freeday-bonus', 'freeday-label']) document.getElementById(id).value = ''
    }
    bonusEntfernt = null
    await loadFreeDays({ silent: true })
  } catch (err) {
    setMeldung('freeday-msg', `Nicht eingetragen: ${serverFehlerText(err)}`, 'error', { fokus: true })
  } finally {
    bonusSpeichert = false
    setzeKnopfBusy('bonus-start', 'bonus-start-text', false, 'Eintragen')
    pruefeBonusDatum()
  }
}

function deleteFreeDay(date) {
  return einmalJe(`bonus-loeschen:${date}`, () => loescheBonusTag(date))
}

async function loescheBonusTag(date) {
  const t = freeDaysData.find((x) => x.date === date)
  if (!t) return
  try {
    await holeJson(`/admin/free-days/${encodeURIComponent(date)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    bonusEntfernt = { date: t.date, label: t.label || '', bonus_count: t.bonus_count }
    await loadFreeDays({ silent: true })
    setMeldung('freeday-msg', `<span>${esc(tagText(date))} entfernt.</span> <button type="button" class="adm-link" data-action="bonus-rueckgaengig">Rückgängig</button>`, 'ok', { fokus: true, html: true })
  } catch (err) {
    setMeldung('freeday-msg', `Nicht entfernt: ${serverFehlerText(err)}`, 'error', { fokus: true })
  }
}

function bonusRueckgaengig() {
  if (!bonusEntfernt) return
  void speichereBonusTag({ ...bonusEntfernt }, { rueckgaengig: true })
}

// ── Werkzeuge › Wort der Woche ────────────────────────────
// Ein zusätzliches Wort, das eine Kalenderwoche lang in allen Spielmodi unter den Tageswörtern steht.
// Die Woche wird aus einer Liste gewählt (diese und die zwölf folgenden); Von und Bis rechnet der Server.
// Gespeichert wird nur, wenn ein angegebener Wort-Zwilling geeignet ist und das Lückenfüller-Wort schon Runden hat.

let swListe = []              // Antwort von GET /admin/spezialwochen (neueste Woche zuerst)
let swGeladen = false
let swLadeFehler = ''
let swEntfernt = null         // zuletzt entfernter Eintrag für „Rückgängig“
let swSpeichert = false
let swWzLaeuft = false
let swToken = 0

// „KW 45“ aus „2026-W45“
const SW_FELDER = { lemma_id: 'sw-lemma-id', zwilling_partner: 'sw-wza', lueckenfueller_id: 'sw-lf-id', link: 'sw-link', zeitenwende_link: 'sw-zw-link' }

const kwNr = (woche) => {
  const m = /^(\d{4})-W(\d{2})$/.exec(woche || '')
  return m ? `KW ${Number(m[2])}` : String(woche || '')
}

// ISO-Woche („2026-W45“) eines Kalendertags
function isoWocheVon(iso) {
  const k = isoKalenderwoche(iso)
  return `${k.jahr}-W${zwei(k.woche)}`
}

// Montag einer ISO-Woche als Kalendertag
function montagVonIsoWoche(woche) {
  const m = /^(\d{4})-W(\d{2})$/.exec(woche)
  const jahr = Number(m[1])
  const jan4 = new Date(Date.UTC(jahr, 0, 4))
  const montag1 = Date.UTC(jahr, 0, 4 - ((jan4.getUTCDay() + 6) % 7))
  return new Date(montag1 + (Number(m[2]) - 1) * 7 * 864e5).toISOString().slice(0, 10)
}

// Fehlertext am Feld (statisches <p id="…-fehler"> aus dem Markup) und aria-invalid.
// Wort der Woche: „sw-lemma-id“ → „sw-lemma-fehler“, „sw-lf-id“ → „sw-lf-fehler“.
function setzeFeldFehlerStatisch(id, text) {
  const p = document.getElementById(`${id}-fehler`) || document.getElementById(`${id.replace(/-id$/, '')}-fehler`)
  const feld = document.getElementById(id)
  if (p) { p.hidden = !text; p.textContent = text || '' }
  if (feld) {
    if (text) feld.setAttribute('aria-invalid', 'true')
    else feld.removeAttribute('aria-invalid')
  }
}

function loescheSwFehler() {
  for (const id of Object.values(SW_FELDER)) setzeFeldFehlerStatisch(id, '')
}

async function ladeWortDerWoche({ auswahlNeu = false } = {}) {
  const token = ++swToken
  if (!swGeladen) { swLadeFehler = ''; renderSpezialwochen() }
  try {
    const { entries } = await holeJson('/admin/spezialwochen')
    if (token !== swToken) return
    swListe = Array.isArray(entries) ? entries : []
    swGeladen = true
    swLadeFehler = ''
  } catch (err) {
    if (token !== swToken) return
    if (!swGeladen) swLadeFehler = `Die Wochen konnten nicht geladen werden (${err.status ? `HTTP ${err.status}` : 'keine Antwort'}).`
  }
  renderSpezialwochen()
  // Nach dem Speichern wieder die erste freie Woche vorwählen, sonst bleibt die eben belegte stehen
  renderWochenAuswahl(auswahlNeu ? '' : (document.getElementById('sw-woche')?.value || ''))
}

function swZeile(e, { vergangen = false } = {}) {
  const heute = getTodayIso()
  const laeuft = e.von <= heute && e.bis >= heute
  const teile = [esc(e.lemmaName || e.lemma_id)]
  teile.push(e.zwilling_partner ? `Wort-Zwilling mit ${esc(e.zwilling_partner)}` : 'ohne Wort-Zwilling')
  teile.push(e.lueckenfueller_id ? 'mit Lückenfüller' : 'ohne Lückenfüller')
  return `<li class="in-zeile" data-woche="${esc(e.woche)}">`
    + `<span class="be-zeile-haupt">${esc(kwNr(e.woche))}${laeuft ? '<span class="adm-visually-hidden">, </span><span class="in-heute-marke">läuft</span>' : ''}</span>`
    + `<span class="be-zeile-meta">${esc(wochenSpanne(e.von))} · ${teile.join(' · ')}</span>`
    + (vergangen ? '' : `<span class="in-zeile-aktion"><button type="button" class="adm-link" data-action="edit-spezialwoche" data-woche="${esc(e.woche)}">bearbeiten<span class="adm-visually-hidden">: ${esc(kwNr(e.woche))}</span></button>`
      + `<button type="button" class="li-loeschen" data-action="delete-spezialwoche" data-woche="${esc(e.woche)}">entfernen<span class="adm-visually-hidden">: ${esc(kwNr(e.woche))}</span></button></span>`)
    + '</li>'
}

function renderSpezialwochen() {
  const el = document.getElementById('sw-list')
  if (!el) return
  if (!swGeladen) {
    el.innerHTML = swLadeFehler
      ? `<p class="wo-meldung" data-tone="err" role="alert">${esc(swLadeFehler)} <button type="button" class="adm-link" data-action="load-spezialwochen">Erneut versuchen</button></p>`
      : '<p class="li-meldung" data-tone="loading">Wochen werden geladen …</p>'
    return
  }
  const heute = getTodayIso()
  const alle = [...swListe].sort((a, b) => a.von.localeCompare(b.von))
  const aktuell = alle.filter((e) => e.bis >= heute)
  const vorbei = alle.filter((e) => e.bis < heute).reverse()
  el.innerHTML = (aktuell.length
    ? `<ol class="be-liste" aria-label="Eingetragene Wochen">${aktuell.map((e) => swZeile(e)).join('')}</ol>`
    : '<div class="li-leer"><p class="li-leer-titel">Kein Wort der Woche geplant</p><p class="li-leer-text">Ohne Eintrag zeigt die App nur die Tageswörter.</p><p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>')
    + (vorbei.length ? `<details class="be-roh in-vergangen"><summary>Vergangene Wochen (${ganzzahlDe(vorbei.length)})</summary><ol class="be-liste">${vorbei.map((e) => swZeile(e, { vergangen: true })).join('')}</ol></details>` : '')
}

// Auswahl: diese Woche und zwölf folgende; belegte tragen das Wort im Text
function renderWochenAuswahl(gewaehlt = '') {
  const sel = document.getElementById('sw-woche')
  if (!sel) return
  const start = montagVonIsoWoche(isoWocheVon(getTodayIso()))
  const wochen = Array.from({ length: 13 }, (_, i) => isoWocheVon(addTageIso(start, i * 7)))
  if (gewaehlt && !wochen.includes(gewaehlt)) wochen.unshift(gewaehlt)
  // Ohne Vorgabe die erste freie Woche, sonst stünde gleich „Speichern ersetzt den Eintrag“ da
  if (!gewaehlt) gewaehlt = wochen.find((w) => !swListe.some((e) => e.woche === w)) || wochen[0]
  sel.innerHTML = wochen.map((w) => {
    const belegt = swListe.find((e) => e.woche === w)
    return `<option value="${esc(w)}"${w === gewaehlt ? ' selected' : ''}>${esc(`${kwNr(w)} · ${wochenSpanne(montagVonIsoWoche(w))}${belegt ? ` · belegt: ${belegt.lemmaName || belegt.lemma_id}` : ''}`)}</option>`
  }).join('')
  pruefeSwWoche()
}

function pruefeSwWoche() {
  const w = document.getElementById('sw-woche')?.value
  const hinweis = document.getElementById('sw-woche-hinweis')
  const knopfText = document.getElementById('sw-start-text')
  if (!w || !hinweis || !knopfText) return
  const belegt = swListe.find((e) => e.woche === w)
  hinweis.textContent = belegt ? `Für ${kwNr(w)} ist schon „${belegt.lemmaName || belegt.lemma_id}“ eingetragen. Speichern ersetzt den Eintrag.` : ''
  if (belegt) hinweis.dataset.tone = 'warn'
  else hinweis.removeAttribute('data-tone')
  if (!swSpeichert) knopfText.textContent = belegt ? 'Ersetzen' : 'Speichern'
}

function swEintragBody(e) {
  return {
    woche: e.woche,
    lemma_id: e.lemmaName || e.lemma_id,
    notiz: e.notiz || '',
    link: e.link || '',
    zwilling_partner: e.zwilling_partner || '',
    zwilling_pos: e.zwilling_pos || 'Substantiv',
    zeitenwende_notiz: e.zeitenwende_notiz || '',
    zeitenwende_link: e.zeitenwende_link || '',
    lueckenfueller_id: e.lueckenfuellerName || e.lueckenfueller_id || '',
  }
}

async function saveSpezialwoche() {
  if (swSpeichert) return
  const wert = (id) => (document.getElementById(id)?.value || '').trim()
  loescheSwFehler()
  if (!wert('sw-lemma-id')) {
    setzeFeldFehlerStatisch('sw-lemma-id', 'Bitte ein Wort eintragen.')
    document.getElementById('sw-lemma-id').focus()
    return
  }
  const body = {
    woche: wert('sw-woche'),
    lemma_id: wert('sw-lemma-id'),
    notiz: wert('sw-notiz'),
    link: wert('sw-link'),
    zwilling_partner: wert('sw-wza'),
    zwilling_pos: wert('sw-wzpos') || 'Substantiv',
    zeitenwende_notiz: wert('sw-zw-notiz'),
    zeitenwende_link: wert('sw-zw-link'),
    lueckenfueller_id: wert('sw-lf-id'),
  }
  swSpeichert = true
  setzeKnopfBusy('sw-start', 'sw-start-text', true, 'Speichert …')
  try {
    const d = await holeJson('/admin/spezialwoche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    swEntfernt = null
    const wz = body.zwilling_partner && !d.wzFehler ? `, Wort-Zwilling mit ${body.zwilling_partner} (${anzahlText(d.wzKollokatoren, 'Kollokator', 'Kollokatoren')})` : ''
    const warnung = d.wzFehler ? ` Der Wort-Zwilling mit ${body.zwilling_partner} konnte gerade nicht geprüft werden und fehlt; bitte noch einmal speichern.` : ''
    swSpeichert = false
    clearSwForm({ meldungBehalten: true })
    setMeldung('sw-msg', `${kwNr(body.woche)} ${d.ersetzt ? 'ersetzt' : 'gespeichert'}: ${d.lemmaName || body.lemma_id}${wz}.${warnung}`, d.wzFehler ? 'warn' : 'ok', { fokus: true })
    await ladeWortDerWoche({ auswahlNeu: true })
    void loadHealth()   // Stand in der Übersicht
  } catch (err) {
    // Der Server nennt das Feld (Wort, Lückenfüller-Wort, Wort B, Links): Der Fehler steht dann auch dort
    const feldId = SW_FELDER[err.data?.feld]
    if (feldId) {
      // Die Links liegen in zugeklappten Bereichen
      if (feldId === 'sw-link') setzeNebenfelder('sw-neben', true)
      if (feldId === 'sw-zw-link') setzeNebenfelder('sw-zw-neben', true)
      setzeFeldFehlerStatisch(feldId, serverFehlerText(err))
    }
    setMeldung('sw-msg', `Nicht gespeichert: ${serverFehlerText(err)}`, 'error', { fokus: !feldId })
    if (feldId) document.getElementById(feldId)?.focus()
  } finally {
    swSpeichert = false
    setzeKnopfBusy('sw-start', 'sw-start-text', false, 'Speichern')
    pruefeSwWoche()
  }
}

function clearSwForm({ meldungBehalten = false } = {}) {
  for (const id of ['sw-lemma-id', 'sw-notiz', 'sw-link', 'sw-wza', 'sw-zw-notiz', 'sw-zw-link', 'sw-lf-id']) {
    const el = document.getElementById(id)
    if (el) el.value = ''
  }
  const pos = document.getElementById('sw-wzpos')
  if (pos) pos.value = 'Substantiv'
  const vorschau = document.getElementById('sw-wz-preview')
  if (vorschau) vorschau.innerHTML = ''
  const titel = document.getElementById('sw-form-titel-text')
  if (titel) titel.textContent = 'Woche eintragen'
  loescheSwFehler()
  if (!meldungBehalten) setMeldung('sw-msg', '')
  for (const t of ['sw-neben', 'sw-zw-neben']) setzeNebenfelder(t, false)
  renderWochenAuswahl()
}

function editSpezialwoche(woche) {
  const e = swListe.find((x) => x.woche === woche)
  if (!e) return
  renderWochenAuswahl(e.woche)
  const setze = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? '' }
  setze('sw-lemma-id', e.lemmaName || e.lemma_id)
  setze('sw-notiz', e.notiz)
  setze('sw-link', e.link)
  setze('sw-wza', e.zwilling_partner)
  setze('sw-wzpos', e.zwilling_pos || 'Substantiv')
  setze('sw-lf-id', e.lueckenfuellerName || e.lueckenfueller_id)
  setze('sw-zw-notiz', e.zeitenwende_notiz)
  setze('sw-zw-link', e.zeitenwende_link)
  document.getElementById('sw-wz-preview').innerHTML = ''
  document.getElementById('sw-form-titel-text').textContent = `${kwNr(e.woche)} bearbeiten`
  // Notiz und Link bleiben zu, zeigen aber „· ausgefüllt“, wenn etwas drinsteht
  for (const t of ['sw-neben', 'sw-zw-neben']) setzeNebenfelder(t, false)
  loescheSwFehler()
  setMeldung('sw-msg', '')
  document.getElementById('sw-lemma-id').focus()
}

function deleteSpezialwoche(woche) {
  return einmalJe(`sw-loeschen:${woche}`, () => loescheSpezialwoche(woche))
}

async function loescheSpezialwoche(woche) {
  const e = swListe.find((x) => x.woche === woche)
  if (!e) return
  try {
    await holeJson(`/admin/spezialwoche/${encodeURIComponent(woche)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    swEntfernt = e
    await ladeWortDerWoche()
    void loadHealth()
    setMeldung('sw-msg', `<span>${esc(kwNr(woche))} (${esc(e.lemmaName || e.lemma_id)}) entfernt.</span> <button type="button" class="adm-link" data-action="sw-rueckgaengig">Rückgängig</button>`, 'ok', { fokus: true, html: true })
  } catch (err) {
    setMeldung('sw-msg', `Nicht entfernt: ${serverFehlerText(err)}`, 'error', { fokus: true })
  }
}

async function swRueckgaengig() {
  const e = swEntfernt
  if (!e) return
  // Vor dem await leeren: Ein zweiter Klick auf „Rückgängig“ findet nichts mehr und trägt nicht ein zweites Mal ein
  swEntfernt = null
  try {
    await holeJson('/admin/spezialwoche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(swEintragBody(e)) })
    await ladeWortDerWoche()
    void loadHealth()
    setMeldung('sw-msg', `${kwNr(e.woche)} wieder eingetragen.`, 'ok', { fokus: true })
  } catch (err) {
    swEntfernt = e
    setMeldung('sw-msg', `Nicht wieder eingetragen: ${serverFehlerText(err)}`, 'error', { fokus: true })
  }
}

// Prüft das Paar (Wort der Woche + Wort B) wie Wort prüfen, ohne zu speichern
async function previewSwWz() {
  if (swWzLaeuft) return
  const a = document.getElementById('sw-lemma-id').value.trim()
  const b = document.getElementById('sw-wza').value.trim()
  const out = document.getElementById('sw-wz-preview')
  const ansage = (html) => {
    out.innerHTML = html
    sageAnLive('sw-wz-live', out.querySelector('.tag-erg-meldung')?.textContent || '')
  }
  if (!a || !b) return ansage(ergebnisMeldung('Erst das Wort der Woche und Wort B eintragen.'))
  swWzLaeuft = true
  const text = document.getElementById('sw-wz-start-text')
  const knopf = document.getElementById('sw-wz-start')
  knopf.classList.add('is-busy')
  knopf.setAttribute('aria-disabled', 'true')
  text.innerHTML = 'prüft …<span class="adm-visually-hidden">: Wort-Zwilling der Woche</span>'
  ansage(ergebnisMeldung('Prüft im Korpus …', 'loading'))
  try {
    const params = new URLSearchParams({ a, b, pos: document.getElementById('sw-wzpos').value || 'Substantiv' })
    ansage(wzErgebnisHtml(await holeJson(`/admin/spezialwoche/preview-wz?${params}`), { ebene: 4, wortA: a, wortB: b }))
  } catch (err) {
    ansage(ergebnisMeldung(pruefFehlerText(err), 'error'))
  } finally {
    swWzLaeuft = false
    knopf.classList.remove('is-busy')
    knopf.removeAttribute('aria-disabled')
    text.innerHTML = 'Prüfen<span class="adm-visually-hidden">: Wort-Zwilling der Woche</span>'
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
  renderMonat()   // V-Zeichen und Detail im Monat (renderMonat hält den Fokus selbst)
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
  if (entwurf.belegt && !(await bestaetige({
    frage: `Eintrag am ${vorschlagDatumKurz(entwurf.datum)} ersetzen?`,
    details: [`Bisher: ${entwurf.belegt.woerter.join(' · ')}`, `Neu: ${entwurf.tag.woerter.join(' · ')}`],
    aktion: 'Ersetzen',
  }))) return
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
  if (!(await bestaetige({ frage: `${offen.length} Vorschläge übernehmen?`, details, aktion: 'Übernehmen', gefahr: belegt.length > 0 }))) return

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
  if (!entwurf) return
  if (!(await bestaetige({ frage: `Vorschlag für ${vorschlagDatumKurz(entwurf.datum)} verwerfen?`, details: [entwurf.tag.thema || entwurf.tag.woerter.join(' · ')], aktion: 'Verwerfen' }))) return
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

// ── Werkzeuge › Benachrichtigungen ────────────────────────
// Oben: eine Nachricht senden (Test an die eigenen Geräte, danach „An alle senden …“ mit Bestätigung im Dialog).
// Darunter: die Vorlagen des täglichen Versands (8:00) und der abendlichen Erinnerung (19:00).
//
// Sicherungen gegen Fehlversand: Der Dialog schaltet „An alle senden“ erst nach dem Häkchen frei. Während des
// Versands ist der Knopf gesperrt (hier) und der Server lehnt einen zweiten Versand an alle mit 409 ab. Freitext
// mit {platzhalter} wird abgelehnt, Vorlagen mit heute nicht befüllbarem Platzhalter nicht gesendet.

// Platzhalter der Vorlagen: [Name, Erklärung, Modus, der sie befüllt]. Die Namen kennt auch der Server (PLACEHOLDERS).
const PUSH_PLATZHALTER = [
  ['lemma', 'erstes Wort des Tages (Kollokationen)', 'kollokationen'],
  ['lemmata', 'alle Kollokationen-Wörter des Tages, mit · getrennt', 'kollokationen'],
  ['thema', 'Thema des Tages', null],
  ['wortA', 'erstes Wort des Wort-Zwillings', 'wortzwilling'],
  ['wortB', 'zweites Wort des Wort-Zwillings', 'wortzwilling'],
  ['lueckensatz', 'Satz des Lückenfüllers mit Lücke', 'lueckenfueller'],
  ['wochentag', 'heutiger Wochentag, z. B. Freitag', null],
  ['streak', 'Länge der Serie (nur abends)', null],
]

let pushDaten = null            // letzte Antwort von GET /admin/push/templates
let pushLadeFehler = ''
let pushToken = 0
let pushGetestet = null         // { titel, text, zeit }: genau diese Fassung ging an die eigenen Geräte (nur nach einem 200)
let pushDialogNachricht = null  // { titel, text }: was der offene Dialog senden würde
let pushDialogErfolg = false    // Dialog wird nach einem gelungenen Versand geschlossen (Fokus geht dann auf die Meldung)
let sendetAnAlle = false        // Versand an alle läuft
let pushSendeUnsicher = false   // keine Antwort: Der Versand läuft vermutlich weiter – nicht erneut senden
let pushTestLaeuft = false
let pushPlatzhalterAngesagt = false  // der Platzhalter-Hinweis steht gerade (für die Ansage nur beim Erscheinen/Verschwinden)
const vorlageOffen = new Set()  // ids der aufgeklappten Vorlagen (Zahl oder 'neu')
const vorlageEntwurf = new Map() // id → { title, body, enabled }: ungespeicherte Änderungen; überleben jedes Neuzeichnen
let neueVorlage = null          // { id: 'neu', category: 'daily', enabled: false, title: '', body: '' }: wird erst beim Speichern angelegt
let vorlageGeloescht = null     // zuletzt gelöschte Vorlage für „Rückgängig“

const getEl = (id) => document.getElementById(id)
const phIn = (t) => [...new Set([...`${t.title} ${t.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]
const fuelle = (text, ctx) => String(text).replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '')
// Platzhalter sichtbar machen (Vorlagentitel in der Liste)
const mitPh = (text) => esc(text).replace(/\{(\w+)\}/g, '<span class="in-ph">{$1}</span>')
const vorlageKey = (id) => (id === 'neu' ? 'neu' : Number(id))
const geraeteText = (n) => anzahlText(n, 'Gerät', 'Geräte')
const uhrJetzt = () => uhrText(berlinTeile(getCurrentDate()))

// Kontext der Platzhalter für „heute“ (vom Server); Vorlagen des Abends bekommen eine Beispielserie
function vorlageKontext(t) {
  const ctx = pushDaten?.kontext || {}
  return t.category === 'streak' ? { ...ctx, streak: '5' } : ctx
}
const fehlendeVon = (w, ctx) => phIn(w).filter((k) => !ctx[k])

// Warum fehlt ein Platzhalter? Modusname („Zeitenwende fehlt“) statt „lueckensatz“
function fehltGrund(keys) {
  const namen = [...new Set(keys.map((k) => {
    const p = PUSH_PLATZHALTER.find((x) => x[0] === k)
    if (!p) return `unbekannter Platzhalter {${k}}`
    if (p[2]) return MODI.find((m) => m.key === p[2]).label
    return k === 'thema' ? 'Thema' : `{${k}}`
  }))]
  return `${aufzaehlung(namen)} ${namen.length === 1 ? 'fehlt' : 'fehlen'}`
}

function vorschauHtml(titel, text, { app = 'Signifikation · jetzt' } = {}) {
  return `<p class="in-push-app">${esc(app)}</p>`
    + `<p class="in-push-titel${titel ? '' : ' is-leer'}">${titel ? esc(titel) : 'Titel'}</p>`
    + `<p class="in-push-text${text ? '' : ' is-leer'}">${text ? esc(text) : 'Text'}</p>`
}

// aria-disabled statt disabled: Der Knopf bleibt fokussierbar und erklärt beim Klick, warum nichts passiert
function setzeSperre(id, an) {
  const el = getEl(id)
  if (!el) return
  if (an) el.setAttribute('aria-disabled', 'true')
  else el.removeAttribute('aria-disabled')
}

const pushAus = () => !!pushDaten && !pushDaten.push?.web && !pushDaten.push?.ios

function renderPushStand() {
  const el = getEl('push-stand')
  if (!el) return
  el.removeAttribute('data-tone')
  if (!pushDaten) { el.textContent = ''; return }
  if (pushAus()) {
    el.textContent = 'Benachrichtigungen sind auf dem Server nicht eingerichtet; es wird nichts zugestellt.'
    el.dataset.tone = 'warn'
    return
  }
  const p = pushDaten.push || {}
  const wege = p.web && p.ios ? 'Web und iOS' : p.web ? 'nur Web' : 'nur iOS'
  el.textContent = `${geraeteText(pushDaten.subscriberCount)} angemeldet (${wege}) · auf deinem Konto: ${geraeteText(pushDaten.eigeneGeraete)}`
}

// Bei jeder Eingabe: Zähler, Platzhalter-Warnung, Vorschau, Zustand der beiden Knöpfe
function renderPushFormular() {
  const titel = getEl('push-send-title')?.value ?? ''
  const text = getEl('push-send-body')?.value ?? ''
  const zaehler = (id, n, max) => {
    const el = getEl(id)
    if (!el) return
    el.textContent = n ? `${ganzzahlDe(n)} von ${max} Zeichen` : ''
    if (n > max * 0.9) el.dataset.tone = 'warn'
    else el.removeAttribute('data-tone')
  }
  zaehler('push-titel-zahl', titel.length, 120)
  zaehler('push-text-zahl', text.length, 300)
  const ph = phIn({ title: titel, body: text })
  const hinweis = getEl('push-platzhalter-hinweis')
  const hinweisText = ph.length ? `In einer freien Nachricht werden Platzhalter nicht ersetzt: ${ph.map((k) => `{${k}}`).join(', ')} ginge wörtlich hinaus. Bitte ausschreiben.` : ''
  if (hinweis) {
    hinweis.hidden = !ph.length
    hinweis.textContent = hinweisText
  }
  // Angesagt wird nur, wenn der Hinweis erscheint oder verschwindet, nicht bei jedem Tastendruck (die Namen darin wechseln mit)
  if ((ph.length > 0) !== pushPlatzhalterAngesagt) {
    pushPlatzhalterAngesagt = ph.length > 0
    sageAnLive('push-platzhalter-live', pushPlatzhalterAngesagt ? hinweisText : 'Keine Platzhalter mehr im Text.')
  }
  const vorschau = getEl('push-vorschau')
  if (vorschau) vorschau.innerHTML = (titel.trim() || text.trim()) ? vorschauHtml(titel.trim(), text.trim()) : ''
  const eigene = pushDaten?.eigeneGeraete ?? 0
  const testText = getEl('push-test-text')
  if (testText) testText.textContent = eigene ? `Test an ${eigene === 1 ? 'mein Gerät' : `meine ${ganzzahlDe(eigene)} Geräte`}` : 'Test an meine Geräte'
  setzeSperre('push-test', !pushDaten || !eigene || pushAus() || pushTestLaeuft)
  setzeSperre('push-alle', !pushDaten || pushAus() || pushSendeUnsicher)
  aktualisierePushFelder()
}

// aria-describedby der beiden Felder: Zähler, der Platzhalter-Hinweis (solange er steht) und – bei einem Fehler am Feld – die Meldung
function aktualisierePushFelder() {
  const hinweisSteht = !!getEl('push-platzhalter-hinweis') && !getEl('push-platzhalter-hinweis').hidden
  for (const [feldId, zahlId] of [['push-send-title', 'push-titel-zahl'], ['push-send-body', 'push-text-zahl']]) {
    const el = getEl(feldId)
    if (!el) continue
    const ids = [zahlId]
    if (hinweisSteht) ids.push('push-platzhalter-hinweis')
    if (el.getAttribute('aria-invalid') === 'true') ids.push('push-send-msg')
    el.setAttribute('aria-describedby', ids.join(' '))
  }
}

// Fehler am Feld: aria-invalid am betroffenen Feld, die Meldung (push-send-msg) hängt per aria-describedby daran
function markierePushFeld(feldId) {
  for (const id of ['push-send-title', 'push-send-body']) getEl(id)?.removeAttribute('aria-invalid')
  getEl(feldId)?.setAttribute('aria-invalid', 'true')
  aktualisierePushFelder()
}

// Eingabe für Test und Versand prüfen; liefert [Feld-ID, Text] oder null
function pushEingabeFehler() {
  const titel = getEl('push-send-title').value.trim()
  const text = getEl('push-send-body').value.trim()
  if (!titel) return ['push-send-title', 'Bitte einen Titel eintragen.']
  if (!text) return ['push-send-body', 'Bitte einen Text eintragen.']
  const platzhalterText = 'Bitte die Platzhalter ausschreiben; sie würden wörtlich hinausgehen.'
  if (phIn({ title: titel, body: '' }).length) return ['push-send-title', platzhalterText]
  if (phIn({ title: '', body: text }).length) return ['push-send-body', platzhalterText]
  return null
}

// „An deine 2 Geräte gesendet um 14:36 Uhr“ · „An 1 von 2 deiner Geräte gesendet um 14:36 Uhr (1 nicht erreicht)“
function testErgebnisText(d, zusatz = '') {
  const gesamt = d.total ?? (d.sent + d.failed)
  const ziel = d.failed ? `${d.sent} von ${gesamt} deiner Geräte` : (gesamt === 1 ? 'dein Gerät' : `deine ${ganzzahlDe(gesamt)} Geräte`)
  const rest = [d.failed ? `${d.failed} nicht erreicht` : '', zusatz].filter(Boolean).join(', ')
  return `An ${ziel} gesendet um ${uhrJetzt()} Uhr${rest ? ` (${rest})` : ''}.`
}

async function sendeTest() {
  if (pushTestLaeuft) return
  const btn = getEl('push-test')
  if (btn.getAttribute('aria-disabled') === 'true') {
    setMeldung('push-send-msg',
      !pushDaten ? 'Die Seite ist noch nicht geladen.'
        : pushAus() ? 'Benachrichtigungen sind auf dem Server nicht eingerichtet.'
          : 'Auf deinem Konto ist kein Gerät angemeldet. Melde dich in der App mit diesem Konto an und erlaube Benachrichtigungen.', 'warn', { fokus: true })
    return
  }
  const f = pushEingabeFehler()
  if (f) {
    markierePushFeld(f[0])
    setMeldung('push-send-msg', f[1], 'error')
    getEl(f[0]).focus()
    return
  }
  const titel = getEl('push-send-title').value.trim()
  const text = getEl('push-send-body').value.trim()
  pushTestLaeuft = true
  btn.classList.add('is-busy')
  renderPushFormular()
  getEl('push-test-text').textContent = 'Sendet …'
  setMeldung('push-send-msg', '')
  try {
    const d = await holeJson('/admin/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'self', title: titel, body: text }) })
    // Nur ein gelungener Test gilt als Test dieser Fassung (der Dialog zeigt es)
    pushGetestet = { titel, text, zeit: new Date() }
    setMeldung('push-send-msg', `${testErgebnisText(d)} Sieh sie dir dort an; passt alles, dann „An alle senden …“.`, 'ok')
  } catch (err) {
    setMeldung('push-send-msg', `Nicht gesendet: ${serverFehlerText(err)}`, 'error', { fokus: true })
  } finally {
    pushTestLaeuft = false
    btn.classList.remove('is-busy')
    renderPushFormular()
  }
}

function oeffnePushDialog() {
  // Läuft schon ein Versand, würde ein erneutes Öffnen den Dialog zurücksetzen (Häkchen, Knopf): stattdessen sagen, warum nichts passiert
  if (sendetAnAlle) {
    setMeldung('push-send-msg', 'Der Versand an alle läuft noch. Bitte warten, bis er fertig ist.', 'warn', { fokus: true })
    return
  }
  if (getEl('push-alle').getAttribute('aria-disabled') === 'true') {
    setMeldung('push-send-msg', pushSendeUnsicher
      ? 'Der letzte Versand hat nicht geantwortet und läuft vermutlich noch. Im Änderungsprotokoll nachsehen, dann die Seite neu laden.'
      : 'Benachrichtigungen sind auf dem Server nicht eingerichtet; es würde nichts zugestellt.', 'warn', { fokus: true })
    return
  }
  const f = pushEingabeFehler()
  if (f) {
    markierePushFeld(f[0])
    setMeldung('push-send-msg', f[1], 'error')
    getEl(f[0]).focus()
    return
  }
  const titel = getEl('push-send-title').value.trim()
  const text = getEl('push-send-body').value.trim()
  const n = pushDaten.subscriberCount
  const p = pushDaten.push || {}
  const testGleich = !!pushGetestet && pushGetestet.titel === titel && pushGetestet.text === text
  const letzter = pushDaten.letzterVersand
  pushDialogNachricht = { titel, text }
  getEl('push-dialog-titel').textContent = `An alle ${geraeteText(n)} senden?`
  getEl('push-dialog-text').textContent = 'Die Nachricht geht sofort hinaus und lässt sich nicht zurückholen.'
  getEl('push-dialog-vorschau').innerHTML = vorschauHtml(titel, text)
  getEl('push-dialog-fakten').innerHTML = [
    betriebZeile('Empfänger', betriebWert(geraeteText(n)), p.web && p.ios ? 'Web und iOS' : ''),
    testGleich
      ? betriebZeile('Test', betriebWert(`an deine Geräte gesendet um ${uhrText(berlinTeile(pushGetestet.zeit))} Uhr`))
      : betriebZeile('Test', betriebWert('Diese Fassung ging noch nicht an deine Geräte.', 'warn')),
    letzter
      ? betriebZeile('Zuletzt an alle', betriebWert(`${wannText(letzter.zeit)} Uhr`), letzter.total != null ? esc(`„${letzter.titel}“, ${ganzzahlDe(letzter.sent)} von ${ganzzahlDe(letzter.total)} zugestellt`) : esc(`„${letzter.titel}“`))
      : betriebZeile('Zuletzt an alle', betriebWert('noch kein Versand im Protokoll')),
  ].join('')
  getEl('push-dialog-ok').checked = false
  getEl('push-dialog-ok-text').textContent = testGleich
    ? 'Ich habe Titel und Text geprüft. Die Nachricht geht sofort hinaus.'
    : 'Ohne Test senden: Ich habe Titel und Text geprüft.'
  const senden = getEl('push-dialog-senden')
  senden.classList.remove('is-busy')
  setzeSendenZustand('haekchen')
  getEl('push-dialog-senden-text').textContent = `An ${geraeteText(n)} senden`
  getEl('push-dialog-abbrechen').hidden = false
  setMeldung('push-dialog-msg', '')
  const dlg = getEl('push-dialog')
  if (!dlg.open) dlg.showModal()
}

// Zustand des Senden-Knopfs im Dialog. aria-describedby nennt den Grund der Sperre, solange sie gilt: das fehlende
// Häkchen oder (nach einem Netzfehler) die Meldung. Frei: nichts, sonst bliebe „Erst das Häkchen setzen.“ hängen.
function setzeSendenZustand(zustand) {
  const btn = getEl('push-dialog-senden')
  if (!btn) return
  if (zustand === 'frei') btn.removeAttribute('aria-disabled')
  else btn.setAttribute('aria-disabled', 'true')
  const grund = { haekchen: 'push-dialog-sperre', unsicher: 'push-dialog-msg' }[zustand]
  if (grund) btn.setAttribute('aria-describedby', grund)
  else btn.removeAttribute('aria-describedby')
}

function pushDialogHaekchen() {
  if (sendetAnAlle || pushSendeUnsicher) return
  setzeSendenZustand(getEl('push-dialog-ok').checked ? 'frei' : 'haekchen')
}

async function sendeAnAlle() {
  const btn = getEl('push-dialog-senden')
  if (sendetAnAlle || pushSendeUnsicher) return
  // Gesperrt, solange das Häkchen fehlt: Der Klick führt dorthin
  if (btn.getAttribute('aria-disabled') === 'true') { getEl('push-dialog-ok').focus(); return }
  const nachricht = pushDialogNachricht
  if (!nachricht) return
  sendetAnAlle = true
  btn.classList.add('is-busy')
  setzeSendenZustand('laeuft')
  getEl('push-dialog-senden-text').textContent = 'Wird gesendet …'
  getEl('push-dialog-abbrechen').hidden = true
  setMeldung('push-dialog-msg', '')
  try {
    const d = await holeJson('/admin/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'free', title: nachricht.titel, body: nachricht.text }) })
    sendetAnAlle = false
    pushDialogErfolg = true
    getEl('push-dialog').close()
    getEl('push-send-title').value = ''
    getEl('push-send-body').value = ''
    pushGetestet = null
    pushDialogNachricht = null
    // Die Gerätezahl kann sich beim Versand ändern (nicht mehr erreichbare Geräte werden entfernt)
    void ladePush({ still: true })
    renderPushFormular()
    setMeldung('push-send-msg', `Gesendet um ${uhrJetzt()} Uhr: ${ganzzahlDe(d.sent)} zugestellt, ${ganzzahlDe(d.failed)} nicht zugestellt (von ${ganzzahlDe(d.total)} ${d.total === 1 ? 'Gerät' : 'Geräten'}). Nicht mehr erreichbare Geräte werden dabei entfernt.`, 'ok', { fokus: true })
  } catch (err) {
    sendetAnAlle = false
    btn.classList.remove('is-busy')
    getEl('push-dialog-abbrechen').hidden = false
    // Keine Antwort (Netz, Zeitüberschreitung, Gateway): Ob der Versand lief, ist unklar. Nicht erneut senden.
    const ungewiss = !err.status || err.status === 408 || err.status >= 502
    if (ungewiss) {
      pushSendeUnsicher = true
      getEl('push-dialog-senden-text').textContent = 'Nicht erneut senden'
      setzeSendenZustand('unsicher')
      // Fokus auf die Meldung: Bei 320 Pixeln Breite liegt sie sonst unter dem Bildausschnitt des Dialogs
      setMeldung('push-dialog-msg', 'Keine Antwort vom Server. Der Versand läuft vermutlich weiter – nicht erneut senden, sondern im Änderungsprotokoll nachsehen.', 'error', { fokus: true })
      getEl('push-dialog-msg')?.scrollIntoView({ block: 'nearest' })
      renderPushFormular()
      return
    }
    getEl('push-dialog-senden-text').textContent = `An ${geraeteText(pushDaten?.subscriberCount ?? 0)} senden`
    setzeSendenZustand('frei')
    setMeldung('push-dialog-msg', err.status === 409 ? serverFehlerText(err) : `Nicht gesendet: ${serverFehlerText(err)}`, 'error')
  }
}

// ── Vorlagen ──

const vorlageWerte = (t) => vorlageEntwurf.get(t.id) || { title: t.title, body: t.body, enabled: t.enabled }
const vorlageDomId = (id) => `vorlage-${id}`

// Aktionen unter einer aufgeklappten Vorlage; hängen davon ab, ob sie heute versendbar ist
function vorlageAktionenHtml(t, fehlt) {
  const id = vorlageDomId(t.id)
  const titelText = vorlageWerte(t).title || (t.id === 'neu' ? 'Neue Vorlage' : 'ohne Titel')
  return '<div class="be-aktionen">'
    + `<button type="button" class="adm-cta" data-action="push-save-template" data-id="${esc(t.id)}" id="${id}-speichern"><span id="${id}-speichern-text">Speichern</span> <span aria-hidden="true">→</span></button>`
    + (fehlt.length ? '' : `<button type="button" class="adm-link" data-action="push-test-template" data-id="${esc(t.id)}" id="${id}-test">Test an meine Geräte</button>`)
    + (t.category === 'daily' && !fehlt.length ? `<button type="button" class="adm-link" data-action="push-uebernehmen" data-id="${esc(t.id)}" id="${id}-uebernehmen">In „Nachricht senden“ übernehmen</button>` : '')
    + (t.id === 'neu'
      ? `<button type="button" class="adm-link" data-action="push-neu-verwerfen" id="${id}-verwerfen">verwerfen</button>`
      : `<button type="button" class="li-loeschen" data-action="push-delete-template" data-id="${esc(t.id)}" id="${id}-loeschen">löschen<span class="adm-visually-hidden">: ${esc(titelText)}</span></button>`)
    + '</div>'
}

function vorlageVorschauHtml(t, w, fehlt, ctx) {
  return fehlt.length
    ? `<p class="tag-hinweis" data-tone="warn">Heute nicht versendbar: ${esc(fehltGrund(fehlt))}.</p>`
    : `<div class="in-push-vorschau" role="group" aria-label="Vorschau heute">${vorschauHtml(fuelle(w.title, ctx), fuelle(w.body, ctx), { app: t.category === 'streak' ? 'Signifikation · Beispiel mit Serie 5' : 'Signifikation · heute 8:00' })}</div>`
}

function vorlageZeileHtml(t) {
  const w = vorlageWerte(t)
  const fehlt = fehlendeVon(w, vorlageKontext(t))
  const offen = vorlageOffen.has(t.id)
  const id = vorlageDomId(t.id)
  const zustand = !w.enabled
    ? '<span>aus</span>'
    : fehlt.length
      ? `<span data-tone="warn">heute übersprungen: ${esc(fehltGrund(fehlt))}</span>`
      : '<span>heute versendbar</span>'
  const titelText = w.title || (t.id === 'neu' ? 'Neue Vorlage' : 'ohne Titel')
  const geaendert = vorlageEntwurf.has(t.id) || t.id === 'neu'
  return `<button type="button" class="in-vorlage-zeile" aria-expanded="${offen}" aria-controls="${id}-detail" data-action="push-vorlage-auf" data-id="${esc(t.id)}">`
    + `<span class="in-vorlage-titel">${mitPh(titelText)}</span><span class="in-vorlage-meta">${zustand}${geaendert ? '<span class="in-geaendert">ungespeichert</span>' : ''}</span><span class="in-vorlage-auf" aria-hidden="true"></span></button>`
}

function renderVorlage(t) {
  const w = vorlageWerte(t)
  const ctx = vorlageKontext(t)
  const fehlt = fehlendeVon(w, ctx)
  const offen = vorlageOffen.has(t.id)
  const id = vorlageDomId(t.id)
  let detail = ''
  if (offen) {
    detail = `<div class="in-vorlage-detail" id="${id}-detail">`
      + `<div class="tag-feld"><label class="tag-label" for="${id}-titel">Titel</label><div class="tag-wert"><input class="tag-eingabe" type="text" id="${id}-titel" data-vorlage="${esc(t.id)}" data-feld="title" maxlength="120" value="${esc(w.title)}" autocomplete="off"></div></div>`
      + `<div class="tag-feld"><label class="tag-label" for="${id}-text">Text</label><div class="tag-wert"><textarea class="tag-eingabe" id="${id}-text" data-vorlage="${esc(t.id)}" data-feld="body" maxlength="300" rows="2">${esc(w.body)}</textarea></div></div>`
      + `<label class="be-check" for="${id}-aktiv"><input type="checkbox" id="${id}-aktiv" data-vorlage="${esc(t.id)}" data-feld="enabled"${w.enabled ? ' checked' : ''}><span>${t.category === 'streak' ? 'Aktiv: nimmt am abendlichen Versand teil' : 'Aktiv: nimmt am täglichen Versand teil'}</span></label>`
      + vorlageVorschauHtml(t, w, fehlt, ctx)
      + vorlageAktionenHtml(t, fehlt)
      + `<p class="li-meldung" id="${id}-msg" role="status" aria-live="polite"></p>`
      + '</div>'
  }
  return `<li class="in-vorlage${offen ? ' is-offen' : ''}${w.enabled ? '' : ' is-aus'}" data-id="${esc(t.id)}">${vorlageZeileHtml(t)}${detail}</li>`
}

function pushHeuteLage() {
  const heute = pushDaten?.heute || getTodayIso()
  const taeglich = (pushDaten?.templates || []).filter((t) => t.category !== 'streak' && t.enabled)
  const ok = taeglich.filter((t) => t.preview?.eligible).length
  const stand = tagesStand(kalenderStatus === 'ok' ? kalenderData?.[heute] : undefined)
  const vorbei = Number(berlinTeile(getCurrentDate())?.hh) >= 8
  const tag = kalenderStatus === 'ok' ? `${fehltText(stand)}. ` : ''
  if (!taeglich.length) return { text: `Heute, ${datumKurz(heute)}: ${tag}Keine Vorlage ist aktiv; es geht „Dein tägliches Wortspiel wartet.“ hinaus.`, ton: 'warn' }
  const verb = vorbei ? (ok === 1 ? 'war' : 'waren') : (ok === 1 ? 'ist' : 'sind')
  return {
    text: `Heute, ${datumKurz(heute)}: ${tag}${ganzzahlDe(ok)} von ${anzahlText(taeglich.length, 'aktiven Vorlage', 'aktiven Vorlagen')} ${verb} ${vorbei ? 'um 8:00 Uhr' : 'für 8:00 Uhr'} versendbar.`,
    ton: ok ? '' : 'warn',
  }
}

// Zeichnet alle Vorlagen neu und behält dabei Fokus und Cursor (oder Auswahl) in einem Feld oder Knopf einer
// Vorlage. Die Texte der Entwürfe stehen in vorlageEntwurf; ohne diese Wiederherstellung verlöre eine andere,
// aufgeklappte Vorlage beim Speichern oder Löschen den Fokus mitten in der Eingabe.
function renderVorlagen() {
  const a = document.activeElement
  const stand = a && a !== document.body && a.id && a.closest?.('#push-templates-list, #push-streak-list')
    ? { id: a.id, von: a.selectionStart, bis: a.selectionEnd, richtung: a.selectionDirection, scroll: a.scrollTop }
    : null
  zeichneVorlagen()
  if (!stand) return
  const neu = getEl(stand.id)
  if (!neu) return
  neu.focus({ preventScroll: true })
  if (typeof stand.von === 'number' && neu.type !== 'checkbox') {
    try { neu.setSelectionRange(stand.von, stand.bis, stand.richtung || 'none') } catch { /* Feldtyp ohne Auswahl */ }
    neu.scrollTop = stand.scroll || 0
  }
}

function zeichneVorlagen() {
  const liste = getEl('push-templates-list')
  const abend = getEl('push-streak-list')
  if (!liste || !abend) return
  if (!pushDaten) {
    const fehler = pushLadeFehler
      ? `<p class="wo-meldung" data-tone="err" role="alert">${esc(pushLadeFehler)} <button type="button" class="adm-link" data-action="push-load-templates">Erneut versuchen</button></p>`
      : '<p class="li-meldung" data-tone="loading">Vorlagen werden geladen …</p>'
    liste.innerHTML = fehler
    abend.innerHTML = ''
    setMeldung('push-heute', '')
    return
  }
  const alle = pushDaten.templates || []
  // Entwürfe und offene Zeilen gelöschter Vorlagen (anderer Tab, Rückgängig) verfallen
  for (const key of [...vorlageEntwurf.keys()]) if (key !== 'neu' && !alle.some((t) => t.id === key)) vorlageEntwurf.delete(key)
  for (const key of [...vorlageOffen]) if (key !== 'neu' && !alle.some((t) => t.id === key)) vorlageOffen.delete(key)
  const taeglich = [...alle.filter((t) => t.category !== 'streak'), ...(neueVorlage ? [neueVorlage] : [])]
  const abends = alle.filter((t) => t.category === 'streak')
  liste.innerHTML = taeglich.length
    ? `<ul class="in-vorlagen" aria-label="Vorlagen für den täglichen Versand">${taeglich.map(renderVorlage).join('')}</ul>`
    : '<div class="li-leer"><p class="li-leer-titel">Keine Vorlage</p><p class="li-leer-text">Ohne Vorlage geht „Dein tägliches Wortspiel wartet.“ hinaus.</p></div>'
  abend.innerHTML = abends.length
    ? `<ul class="in-vorlagen" aria-label="Vorlagen für den Abend">${abends.map(renderVorlage).join('')}</ul>`
    : '<div class="li-leer"><p class="li-leer-titel">Keine Vorlage</p><p class="li-leer-text">Ohne Vorlage geht „Deine Serie“ mit der Länge der Serie hinaus.</p></div>'
  const lage = pushHeuteLage()
  setMeldung('push-heute', lage.text, lage.ton)
  const ph = getEl('push-placeholders')
  if (ph) ph.innerHTML = PUSH_PLATZHALTER.map(([k, txt]) => `<div><dt>{${esc(k)}}</dt><dd>${esc(txt)}</dd></div>`).join('')
}

function schalteVorlage(id) {
  const key = vorlageKey(id)
  if (vorlageOffen.has(key)) vorlageOffen.delete(key)
  else vorlageOffen.add(key)
  renderVorlagen()
  document.querySelector(`.in-vorlage[data-id="${CSS.escape(String(id))}"] .in-vorlage-zeile`)?.focus()
}

// Eingabe in einer Vorlage: Entwurf merken, nur Kopfzeile, Vorschau und Aktionen dieser Vorlage neu zeichnen
// (Fokus und Cursor im Feld bleiben)
function vorlageGeaendert(el) {
  entmarkiereFeld(el.id)
  const key = vorlageKey(el.dataset.vorlage)
  const t = key === 'neu' ? neueVorlage : (pushDaten?.templates || []).find((x) => x.id === key)
  if (!t) return
  const w = { ...vorlageWerte(t) }
  w[el.dataset.feld] = el.type === 'checkbox' ? el.checked : el.value
  if (key !== 'neu' && w.title === t.title && w.body === t.body && w.enabled === t.enabled) vorlageEntwurf.delete(key)
  else vorlageEntwurf.set(key, w)
  const li = document.querySelector(`.in-vorlage[data-id="${CSS.escape(String(key))}"]`)
  if (!li) return
  li.classList.toggle('is-aus', !w.enabled)
  const tmp = document.createElement('div')
  tmp.innerHTML = renderVorlage(t)
  li.querySelector('.in-vorlage-zeile')?.replaceWith(tmp.querySelector('.in-vorlage-zeile'))
  for (const selektor of ['.in-push-vorschau, .in-vorlage-detail > .tag-hinweis', '.in-vorlage-detail > .be-aktionen']) {
    const alt = li.querySelector(selektor)
    const neu = tmp.querySelector(selektor)
    if (alt && neu) alt.replaceWith(neu)
  }
}

async function ladePush({ still = false } = {}) {
  const token = ++pushToken
  if (!still && !pushDaten) { pushLadeFehler = ''; renderVorlagen() }
  try {
    const d = await holeJson('/admin/push/templates')
    if (token !== pushToken) return
    pushDaten = d
    pushLadeFehler = ''
  } catch (err) {
    if (token !== pushToken) return
    if (!pushDaten) pushLadeFehler = `Die Vorlagen konnten nicht geladen werden (${err.status ? `HTTP ${err.status}` : 'keine Antwort'}).`
  }
  renderPushStand()
  renderPushFormular()
  renderVorlagen()
}

async function speichereVorlage(id) {
  const key = vorlageKey(id)
  const t = key === 'neu' ? neueVorlage : (pushDaten?.templates || []).find((x) => x.id === key)
  if (!t) return
  const w = vorlageWerte(t)
  const dom = vorlageDomId(t.id)
  const titel = w.title.trim()
  const text = w.body.trim()
  // Fehler am Feld: aria-invalid, Fokus ins Feld, der Fehlertext (Meldung der Vorlage) hängt per aria-describedby daran
  entmarkiereFeld(`${dom}-titel`)
  entmarkiereFeld(`${dom}-text`)
  const feldFehler = (feldId, meldung) => {
    markiereFeld(feldId, `${dom}-msg`)
    setMeldung(`${dom}-msg`, meldung, 'error')
    getEl(feldId)?.focus()
  }
  if (!titel) return void feldFehler(`${dom}-titel`, 'Bitte einen Titel eintragen.')
  if (!text) return void feldFehler(`${dom}-text`, 'Bitte einen Text eintragen.')
  const istUnbekannt = (k) => !PUSH_PLATZHALTER.some((p) => p[0] === k)
  const unbekannt = phIn({ title: titel, body: text }).filter(istUnbekannt)
  if (unbekannt.length) {
    const imTitel = phIn({ title: titel, body: '' }).some(istUnbekannt)
    return void feldFehler(imTitel ? `${dom}-titel` : `${dom}-text`, `Unbekannter Platzhalter: ${unbekannt.map((k) => `{${k}}`).join(', ')}. Die Vorlage würde jeden Tag übersprungen.`)
  }
  if (getEl(`${dom}-speichern`)?.getAttribute('aria-disabled') === 'true') return
  setzeKnopfBusy(`${dom}-speichern`, `${dom}-speichern-text`, true, 'Speichert …')
  try {
    let neueId = key
    if (key === 'neu') {
      const d = await holeJson('/admin/push/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: titel, body: text, enabled: w.enabled, category: t.category }) })
      neueId = Number(d.id)
      neueVorlage = null
      vorlageOffen.delete('neu')
      vorlageEntwurf.delete('neu')
      vorlageOffen.add(neueId)
    } else {
      await holeJson(`/admin/push/templates/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: titel, body: text, enabled: w.enabled }) })
      vorlageEntwurf.delete(key)
    }
    // Neu laden und zeichnen: Entwürfe anderer Vorlagen bleiben (vorlageEntwurf), nichts geht verloren
    await ladePush({ still: true })
    // Eine neue Vorlage bekommt ihre Nummer: Der Fokus (auf „Speichern“) zieht mit um
    if (key === 'neu') getEl(`${vorlageDomId(neueId)}-speichern`)?.focus({ preventScroll: true })
    setMeldung(`${vorlageDomId(neueId)}-msg`, key === 'neu' ? 'Vorlage angelegt.' : 'Gespeichert.', 'ok')
  } catch (err) {
    setzeKnopfBusy(`${dom}-speichern`, `${dom}-speichern-text`, false, 'Speichern')
    setMeldung(`${dom}-msg`, `Nicht gespeichert: ${serverFehlerText(err)}`, 'error')
  }
}

function loescheVorlage(id) {
  return einmalJe(`vorlage-loeschen:${id}`, () => loescheVorlageJetzt(id))
}

async function loescheVorlageJetzt(id) {
  const key = vorlageKey(id)
  const t = (pushDaten?.templates || []).find((x) => x.id === key)
  if (!t) return
  try {
    await holeJson(`/admin/push/templates/${encodeURIComponent(key)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    vorlageGeloescht = { title: t.title, body: t.body, enabled: t.enabled, category: t.category }
    vorlageOffen.delete(key)
    vorlageEntwurf.delete(key)
    await ladePush({ still: true })
    setMeldung('push-template-msg', `<span>Vorlage „${esc(t.title)}“ gelöscht.</span> <button type="button" class="adm-link" data-action="push-rueckgaengig">Rückgängig</button>`, 'ok', { fokus: true, html: true })
  } catch (err) {
    setMeldung(`${vorlageDomId(key)}-msg`, `Nicht gelöscht: ${serverFehlerText(err)}`, 'error')
  }
}

async function vorlageRueckgaengig() {
  const v = vorlageGeloescht
  if (!v) return
  // Vor dem await leeren: Ein zweiter Klick auf „Rückgängig“ findet nichts mehr und legt die Vorlage nicht doppelt an
  vorlageGeloescht = null
  try {
    await holeJson('/admin/push/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
    await ladePush({ still: true })
    setMeldung('push-template-msg', 'Vorlage wiederhergestellt.', 'ok', { fokus: true })
  } catch (err) {
    vorlageGeloescht = v
    setMeldung('push-template-msg', `Nicht wiederhergestellt: ${serverFehlerText(err)}`, 'error', { fokus: true })
  }
}

function neueVorlageOeffnen() {
  if (!neueVorlage) neueVorlage = { id: 'neu', category: 'daily', enabled: false, title: '', body: '' }
  vorlageOffen.add('neu')
  renderVorlagen()
  getEl('vorlage-neu-titel')?.focus()
}

function neueVorlageVerwerfen() {
  neueVorlage = null
  vorlageOffen.delete('neu')
  vorlageEntwurf.delete('neu')
  renderVorlagen()
  getEl('push-neu')?.focus()
}

// Test einer Vorlage an die eigenen Geräte. Eine gespeicherte, unveränderte Vorlage rendert der Server
// (wie beim täglichen Versand); eine geänderte oder neue wird hier mit den heutigen Wörtern gefüllt.
// „Heute“ der Platzhalter (pushDaten.heute, Berliner Datum vom Server) kann veraltet sein, wenn die Seite über Mitternacht
// offen blieb: Dann vorher still neu laden, sonst ginge der Vortag in Test und Übernahme ein.
async function frischeHeute() {
  const heuteBerlin = berlinTeile(getCurrentDate())?.iso
  if (pushDaten?.heute && heuteBerlin && pushDaten.heute !== heuteBerlin) await ladePush({ still: true })
}

async function testeVorlage(id, knopf) {
  const key = vorlageKey(id)
  const suche = () => (key === 'neu' ? neueVorlage : (pushDaten?.templates || []).find((x) => x.id === key))
  let t = suche()
  if (!t || knopf?.getAttribute('aria-disabled') === 'true') return
  const dom = vorlageDomId(t.id)
  if (!pushDaten.eigeneGeraete || pushAus()) {
    return void setMeldung(`${dom}-msg`, pushAus() ? 'Benachrichtigungen sind auf dem Server nicht eingerichtet.' : 'Auf deinem Konto ist kein Gerät angemeldet. Melde dich in der App mit diesem Konto an und erlaube Benachrichtigungen.', 'warn')
  }
  const ungespeichert = key === 'neu' || vorlageEntwurf.has(key)
  knopf?.setAttribute('aria-disabled', 'true')
  try {
    // Ein ungespeicherter Entwurf wird hier mit den heutigen Wörtern gefüllt: erst den Tag auffrischen
    if (ungespeichert) await frischeHeute()
    t = suche() || t
    const w = vorlageWerte(t)
    const body = ungespeichert
      ? { mode: 'self', title: fuelle(w.title, vorlageKontext(t)).trim(), body: fuelle(w.body, vorlageKontext(t)).trim() }
      : { mode: 'self', templateId: key }
    const d = await holeJson('/admin/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setMeldung(`${dom}-msg`, testErgebnisText(d, ungespeichert ? 'Fassung mit deinen Änderungen' : 'gespeicherte Fassung'), 'ok')
  } catch (err) {
    setMeldung(`${dom}-msg`, `Nicht gesendet: ${serverFehlerText(err)}`, 'error')
  } finally {
    knopf?.removeAttribute('aria-disabled')
  }
}

// Vorlage mit den heutigen Wörtern in „Nachricht senden“ übernehmen: danach Test, dann „An alle senden …“
async function uebernimmVorlage(id) {
  const key = vorlageKey(id)
  await frischeHeute()
  const t = key === 'neu' ? neueVorlage : (pushDaten?.templates || []).find((x) => x.id === key)
  if (!t) return
  const w = vorlageWerte(t)
  const ctx = vorlageKontext(t)
  getEl('push-send-title').value = fuelle(w.title, ctx)
  getEl('push-send-body').value = fuelle(w.body, ctx)
  pushGetestet = null
  renderPushFormular()
  setMeldung('push-send-msg', 'Vorlage mit den heutigen Wörtern übernommen. Erst testen, dann an alle senden.', 'ok')
  getEl('push-send-title').focus()
}

function handleDocumentClick(event) {
  handleRouteLinkClick(event)

  const target = event.target.closest('[data-action]')
  if (!target) return
  // Gesperrte Knöpfe (z. B. Vorschläge während einer Übernahme) behalten den Fokus
  // und lösen keine Aktion aus.
  if (target.getAttribute('aria-disabled') === 'true') {
    // Der gesperrte Ersetzen-Knopf verweist auf das Häkchen, das ihn freischaltet
    if (target.dataset.action === 'restore-ausfuehren') document.getElementById('restore-verstanden')?.focus()
    // Social Cards: gesperrtes „Freigeben“ (zu lang) und „Neu erstellen“ (Partner entschieden) sagen, warum
    if (target.dataset.action?.startsWith('so-')) return void socialGesperrtKlick(target)
    // Erklären statt schweigen: Der Klick sagt, warum nichts passiert (kein Gerät, Häkchen fehlt, Server ohne Push)
    if (target.dataset.action === 'push-dialog-senden') document.getElementById('push-dialog-ok')?.focus()
    if (target.dataset.action === 'push-send-self') { event.preventDefault(); void sendeTest() }
    if (target.dataset.action === 'push-send-free') void oeffnePushDialog()
    return
  }

  const { action } = target.dataset
  if (action?.startsWith('so-')) return void socialKlick(target)
  if (action === 'login') return void doLogin()
  if (action === 'download-backup') return void downloadBackup()
  if (action === 'logout') return void doLogout()
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
  if (action === 'load-health') return void (currentRoute?.page === 'system' ? ladeSystemzustand({ fokus: true }) : loadHealth())
  if (action === 'dashboard-week') return void changeDashboardWeek(Number(target.dataset.delta || 0))
  if (action === 'dashboard-week-heute') return void zeigeDieseWoche()
  if (action === 'select-dashboard-date') return void selectDashboardDay(target.dataset.value || '')
  if (action === 'toggle-extra-fields') return void toggleExtraFields(target.dataset.target || '')
  if (action === 'preview-current-lemma') return void previewCurrentLemma(Number(target.dataset.index) || 1)
  if (action === 'reset-entry-form') return void resetEntryForm()
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
  if (action === 'load-kalender') return void loadKalender()
  if (action === 'reset-entry-filters') return void resetEntryFilters()
  if (action === 'select-all-visible-entries') return void selectAllVisibleEntries()
  if (action === 'entry-page-prev') return void goToEntryPage(-1)
  if (action === 'entry-page-next') return void goToEntryPage(1)
  if (action === 'clear-entry-selection') return void clearEntrySelection()
  if (action === 'bulk-delete-selected-dates') return void bulkDeleteSelectedDates()
  if (action === 'au-neu-laden') return void ladeAuswertung(currentRoute?.page, { neu: true })
  if (action === 'reset-kollokation-analysis' || action === 'reset-wort-zwilling-analysis' || action === 'reset-zeitenwende-analysis' || action === 'reset-lueckenfueller-analysis') return void leerePruefung(target)
  if (action === 'generate-lueckenfueller') return void generateLueckenfueller(target)
  if (action === 'monat-wechseln') return void wechsleMonat(Number(target.dataset.delta || 0))
  if (action === 'monat-heute') return void zeigeDiesenMonat()
  if (action === 'select-monat-tag') return void selectMonatTag(target.dataset.value || '', { perZeiger: event.detail > 0 })
  if (action === 'zeige-woche-von') return void zeigeWocheVon(target.dataset.value || '')
  if (action === 'load-users-overview') return void loadUsersOverview()
  if (action === 'clear-users-selection') return void leereNutzerAuswahl()
  if (action === 'toggle-users-aktionen') return void toggleNutzerAktionen()
  if (action === 'run-users-bulk-role') return void sammelRolle()
  if (action === 'run-users-bulk-export') return void sammelExport(target.dataset.format)
  if (action === 'run-users-bulk-delete') return void sammelLoeschen()
  if (action === 'reset-users-filters') return void resetUsersFilters()
  if (action === 'load-more-users') return void loadMoreUsers()
  if (action === 'retry-user-detail') return void ladeKonto(currentRoute?.nutzerId || '')
  if (action === 'save-selected-user-role') return void saveSelectedUserRole()
  if (action === 'export-user') return void exportiereKonto(target.dataset.format)
  if (action === 'delete-selected-user') return void deleteSelectedUser()
  if (action === 'sicherung-jetzt') return void sicherungJetzt()
  if (action === 'sicherung-laden') return void ladeSicherung()
  if (action === 'restore-ausfuehren') return void restoreAusfuehren()
  if (action === 'restore-abbrechen') return void restoreAbbrechen()
  if (action === 'kurs-laden') return void ladeKursmaterial()
  if (action === 'regenerate-course-pdfs') return void regenerateCoursePdfs()
  if (action === 'audit-laden') return void loadAuditLog()
  if (action === 'audit-detail') return void schalteProtokollDetail(target)
  if (action === 'audit-mehr') return void auditMehr()
  if (action === 'reset-audit-filters') return void resetAuditFilters()
  if (action === 'load-free-days') return void loadFreeDays()
  if (action === 'delete-free-day') return void deleteFreeDay(target.dataset.date || '')
  if (action === 'bonus-rueckgaengig') return void bonusRueckgaengig()
  if (action === 'load-spezialwochen') return void ladeWortDerWoche()
  if (action === 'clear-sw-form') { clearSwForm(); return void document.getElementById('sw-lemma-id')?.focus() }
  if (action === 'edit-spezialwoche') return void editSpezialwoche(target.dataset.woche || '')
  if (action === 'delete-spezialwoche') return void deleteSpezialwoche(target.dataset.woche || '')
  if (action === 'sw-rueckgaengig') return void swRueckgaengig()
  if (action === 'preview-sw-wz') return void previewSwWz()
  if (action === 'toggle-sw-neben') return void toggleExtraFields(target.dataset.target || '')
  if (action === 'push-load-templates') return void ladePush()
  if (action === 'push-send-self') { event.preventDefault(); return void sendeTest() }
  if (action === 'push-send-free') return void oeffnePushDialog()
  if (action === 'push-dialog-abbrechen') return void getEl('push-dialog').close()
  if (action === 'push-dialog-senden') return void sendeAnAlle()
  if (action === 'push-vorlage-auf') return void schalteVorlage(target.dataset.id || '')
  if (action === 'push-add-template') return void neueVorlageOeffnen()
  if (action === 'push-neu-verwerfen') return void neueVorlageVerwerfen()
  if (action === 'push-save-template') return void speichereVorlage(target.dataset.id || '')
  if (action === 'push-delete-template') return void loescheVorlage(target.dataset.id || '')
  if (action === 'push-rueckgaengig') return void vorlageRueckgaengig()
  if (action === 'push-test-template') return void testeVorlage(target.dataset.id || '', target)
  if (action === 'push-uebernehmen') return void uebernimmVorlage(target.dataset.id || '')
  if (action === 'demo-verwerfen') return void demoVerwerfen()
  if (action === 'demo-standard') return void demoStandardEinsetzen()
}

// ── Werkzeuge › Klassenraum-Demo ──────────────────────────
// Inhalte der Vorschau, die Lehrkräfte ohne Anmeldung sehen (App: Klassenraum › Sitzungen › Vorschau ansehen).
// Die Grenzen entsprechen server/classroom/demoContent.js; die Seite prüft vorab und zeigt die Fehler am Feld,
// der Server prüft verbindlich und liefert deutsche Texte mit dem Pfad des Feldes (issues[].path).

// Pfad im Inhalt → Eingabefeld
const DEMO_FELDER = {
  'kollokationen.lemma.lemma': 'demo-kol-lemma',
  'kollokationen.words': 'demo-kol-words',
  'wortzwilling.wortA': 'demo-wz-a',
  'wortzwilling.wortB': 'demo-wz-b',
  'wortzwilling.words': 'demo-wz-words',
  'zeitenwende.lemma.lemma': 'demo-zw-lemma',
  'zeitenwende.words': 'demo-zw-words',
  'lueckenfueller.lemma.lemma': 'demo-lf-lemma',
  'lueckenfueller.sentence': 'demo-lf-sentence',
  'lueckenfueller.options': 'demo-lf-options',
}
// Wortlisten: Feld, Einzahl, Mehrzahl (Mindest- und Höchstzahl stehen als data-min/data-max am Feld)
const DEMO_LISTEN = [
  ['demo-kol-words', 'Kollokator', 'Kollokatoren'],
  ['demo-wz-words', 'Wort', 'Wörter'],
  ['demo-zw-words', 'Kollokator', 'Kollokatoren'],
  ['demo-lf-options', 'Antwort', 'Antworten'],
]
const demoWords = (s) => String(s || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)

let demoServer = { istStandard: true, gespeichertAm: null, standard: null }   // Stand laut Server
let demoGespeichert = ''      // JSON des Formulars nach Laden/Speichern; Vergleich für „ungespeichert“
let demoGeladen = false
let demoSpeichert = false
let demoToken = 0

function setzeDemo(c) {
  const setze = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? '' }
  setze('demo-kol-lemma', c.kollokationen?.lemma?.lemma); setze('demo-kol-ipa', c.kollokationen?.lemma?.ipa)
  setze('demo-kol-def', c.kollokationen?.lemma?.definition); setze('demo-kol-words', (c.kollokationen?.words || []).join('\n'))
  setze('demo-wz-a', c.wortzwilling?.wortA); setze('demo-wz-b', c.wortzwilling?.wortB); setze('demo-wz-words', (c.wortzwilling?.words || []).join('\n'))
  setze('demo-zw-lemma', c.zeitenwende?.lemma?.lemma); setze('demo-zw-ipa', c.zeitenwende?.lemma?.ipa); setze('demo-zw-words', (c.zeitenwende?.words || []).join('\n'))
  setze('demo-lf-lemma', c.lueckenfueller?.lemma?.lemma); setze('demo-lf-ipa', c.lueckenfueller?.lemma?.ipa)
  setze('demo-lf-sentence', c.lueckenfueller?.sentence); setze('demo-lf-options', (c.lueckenfueller?.options || []).join('\n'))
  aktualisiereDemoZaehler()
}

function leseDemo() {
  const v = (id) => (document.getElementById(id)?.value || '').trim()
  return {
    kollokationen: { lemma: { lemma: v('demo-kol-lemma'), ipa: v('demo-kol-ipa'), definition: v('demo-kol-def') }, words: demoWords(v('demo-kol-words')) },
    wortzwilling: { wortA: v('demo-wz-a'), wortB: v('demo-wz-b'), words: demoWords(v('demo-wz-words')) },
    zeitenwende: { lemma: { lemma: v('demo-zw-lemma'), ipa: v('demo-zw-ipa') }, words: demoWords(v('demo-zw-words')) },
    lueckenfueller: { lemma: { lemma: v('demo-lf-lemma'), ipa: v('demo-lf-ipa') }, sentence: v('demo-lf-sentence'), options: demoWords(v('demo-lf-options')) },
  }
}

const demoUngespeichert = () => demoGeladen && JSON.stringify(leseDemo()) !== demoGespeichert

// Zähler unter den Wortlisten, „Änderungen verwerfen“ und die Stand-Zeile (bei jeder Eingabe)
function aktualisiereDemoZaehler() {
  for (const [id, eins, viele] of DEMO_LISTEN) {
    const ta = document.getElementById(id)
    const z = document.getElementById(`${id}-zahl`)
    if (!ta || !z) continue
    const n = demoWords(ta.value).length
    const min = Number(ta.dataset.min)
    const max = Number(ta.dataset.max)
    z.textContent = `${anzahlText(n, eins, viele)} · erlaubt ${min} bis ${max}`
    if (n < min || n > max) z.dataset.tone = 'warn'
    else z.removeAttribute('data-tone')
  }
  const geaendert = demoUngespeichert()
  const verwerfen = document.getElementById('demo-verwerfen')
  if (verwerfen) verwerfen.hidden = !geaendert
  renderDemoStand(geaendert)
}

function renderDemoStand(geaendert) {
  const el = document.getElementById('demo-stand')
  if (!el) return
  if (!demoGeladen) { el.textContent = ''; return }
  if (geaendert) {
    el.innerHTML = '<span class="in-geaendert">Ungespeicherte Änderungen.</span> Die Vorschau zeigt noch den gespeicherten Stand.'
    return
  }
  if (demoServer.istStandard) el.textContent = 'Die Vorschau zeigt die Standardinhalte.'
  else el.textContent = demoServer.gespeichertAm ? `Eigene Inhalte, gespeichert ${wannText(demoServer.gespeichertAm)} Uhr.` : 'Die Vorschau zeigt eigene Inhalte.'
}

// Gleiche Regeln wie server/classroom/demoContent.js, mit deutschen Texten je Feld
function pruefeDemo(c) {
  const f = []
  const liste = (pfad, arr, min, max, eins, viele) => {
    if (arr.length < min) f.push([pfad, `Mindestens ${anzahlText(min, eins, viele)} (jetzt ${ganzzahlDe(arr.length)}).`])
    else if (arr.length > max) f.push([pfad, `Höchstens ${anzahlText(max, eins, viele)} (jetzt ${ganzzahlDe(arr.length)}).`])
    else if (arr.some((w) => w.length > 60)) f.push([pfad, 'Ein Eintrag ist länger als 60 Zeichen.'])
  }
  if (!c.kollokationen.lemma.lemma) f.push(['kollokationen.lemma.lemma', 'Bitte eine Basis eintragen.'])
  liste('kollokationen.words', c.kollokationen.words, 3, 12, 'Kollokator', 'Kollokatoren')
  if (!c.wortzwilling.wortA) f.push(['wortzwilling.wortA', 'Bitte Wort A eintragen.'])
  if (!c.wortzwilling.wortB) f.push(['wortzwilling.wortB', 'Bitte Wort B eintragen.'])
  liste('wortzwilling.words', c.wortzwilling.words, 4, 12, 'Wort', 'Wörter')
  if (!c.zeitenwende.lemma.lemma) f.push(['zeitenwende.lemma.lemma', 'Bitte ein Wort eintragen.'])
  liste('zeitenwende.words', c.zeitenwende.words, 2, 12, 'Kollokator', 'Kollokatoren')
  if (!c.lueckenfueller.lemma.lemma) f.push(['lueckenfueller.lemma.lemma', 'Bitte ein Wort eintragen.'])
  if (!c.lueckenfueller.sentence.includes('_____')) f.push(['lueckenfueller.sentence', 'Der Satz braucht eine Lücke aus fünf Unterstrichen (_____).'])
  liste('lueckenfueller.options', c.lueckenfueller.options, 2, 6, 'Antwort', 'Antworten')
  return f
}

// Feld zu einem Pfad wie „wortzwilling.words.2“: längster passender Schlüssel
function demoFeldFuerPfad(pfad) {
  const treffer = Object.keys(DEMO_FELDER).filter((k) => pfad === k || pfad.startsWith(`${k}.`))
  return treffer.length ? DEMO_FELDER[treffer.sort((a, b) => b.length - a.length)[0]] : ''
}

function zeigeDemoFehler(fehler) {
  for (const id of Object.values(DEMO_FELDER)) setzeFeldFehlerStatisch(id, '')
  const sichtbar = []
  for (const [pfad, text] of fehler) {
    const id = demoFeldFuerPfad(pfad)
    if (!id || sichtbar.includes(id)) continue
    sichtbar.push(id)
    setzeFeldFehlerStatisch(id, text)
  }
  return sichtbar
}

async function ladeDemo() {
  const token = ++demoToken
  // Ungespeicherte Änderungen bleiben beim Zurückkehren auf die Seite stehen
  if (demoUngespeichert()) return void aktualisiereDemoZaehler()
  try {
    const d = await holeJson('/admin/classroom/demo-content')
    if (token !== demoToken) return
    demoServer = { istStandard: !!d.istStandard, gespeichertAm: d.gespeichertAm || null, standard: d.standard || demoServer.standard }
    demoGeladen = true
    setzeDemo(d.content || {})
    demoGespeichert = JSON.stringify(leseDemo())
    zeigeDemoFehler([])
    setMeldung('demo-content-status', '')
    aktualisiereDemoZaehler()
  } catch (err) {
    if (token !== demoToken) return
    setMeldung('demo-content-status', `Die Inhalte konnten nicht geladen werden: ${serverFehlerText(err)}`, 'error')
  }
}

async function saveDemoEditor() {
  if (demoSpeichert || !demoGeladen) return
  const c = leseDemo()
  const fehler = pruefeDemo(c)
  const felder = zeigeDemoFehler(fehler)
  if (fehler.length) {
    setMeldung('demo-content-status', `Nicht gespeichert: ${anzahlText(felder.length, 'Feld', 'Felder')} prüfen.`, 'error')
    document.getElementById(felder[0])?.focus()
    return
  }
  demoSpeichert = true
  setzeKnopfBusy('demo-start', 'demo-start-text', true, 'Speichert …')
  try {
    await holeJson('/admin/classroom/demo-content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
    demoServer = { ...demoServer, istStandard: false, gespeichertAm: new Date().toISOString() }
    demoGespeichert = JSON.stringify(c)
    aktualisiereDemoZaehler()
    setMeldung('demo-content-status', 'Gespeichert. Die Vorschau für Lehrkräfte zeigt ab sofort diese Inhalte.', 'ok', { fokus: true })
  } catch (err) {
    // Die Prüfung des Servers ist verbindlich: seine Feldfehler (deutsch) an die Felder
    const issues = Array.isArray(err.data?.issues) ? err.data.issues.map((i) => [(i.path || []).join('.'), i.message]) : []
    const felder2 = zeigeDemoFehler(issues)
    if (felder2.length) {
      setMeldung('demo-content-status', `Nicht gespeichert: ${anzahlText(felder2.length, 'Feld', 'Felder')} prüfen.`, 'error')
      document.getElementById(felder2[0])?.focus()
    } else {
      setMeldung('demo-content-status', `Nicht gespeichert: ${serverFehlerText(err)}`, 'error', { fokus: true })
    }
  } finally {
    demoSpeichert = false
    setzeKnopfBusy('demo-start', 'demo-start-text', false, 'Speichern')
  }
}

async function demoVerwerfen() {
  if (!demoGespeichert) return
  // Wie im Tag: Nur fragen, wenn wirklich etwas verloren geht (der Knopf blendet sich sonst ohnehin aus).
  if (demoUngespeichert()) {
    if (!(await bestaetige({ frage: 'Ungespeicherte Änderungen verwerfen?', text: 'Der zuletzt gespeicherte Stand kommt zurück.', aktion: 'Verwerfen' }))) return
    if (!demoGespeichert || currentRoute?.page !== 'klassenraum-demo') return
  }
  setzeDemo(JSON.parse(demoGespeichert))
  zeigeDemoFehler([])
  // „Änderungen verwerfen“ blendet sich selbst aus: Der Fokus geht auf die Statuszeile
  setMeldung('demo-content-status', 'Änderungen verworfen.', 'ok', { fokus: true })
}

function demoStandardEinsetzen() {
  if (!demoServer.standard) return void setMeldung('demo-content-status', 'Die Standardinhalte sind nicht geladen.', 'error')
  setzeDemo(demoServer.standard)
  zeigeDemoFehler([])
  setMeldung('demo-content-status', 'Standardinhalte eingesetzt. Noch nicht gespeichert.', 'ok')
}

// ── Auswertung (#auswertung/spiele, /kennzahlen, /klassenraum) ─────────────────────────────
// Ein Zeitraum für alle drei Reiter (7, 30, 90 Tage oder 12 Monate), in der Adresse als ?zeitraum= (nur wenn ≠ 30).
// Zeitraum = Kalendertage der Berliner Zeit inklusive heute; Tage ohne Ereignis stehen mit 0 da. Admin-Konten zählen
// nirgends mit. Die Seiten zeigen nur Summen: keine Namen, E-Mail-Adressen oder Konto-IDs.
// Diagramme sind selbst gezeichnete SVG-Säulen (eine Reihe, Tintenbraun; die gewählte Säule rot). Die Ablesezeile über
// dem Diagramm ersetzt den schwebenden Tooltip (Zeiger, Antippen, Pfeiltasten), die Werte stehen zusätzlich als Tabelle da.

const AU_ZEITRAEUME = Object.freeze({ 7: 'Letzte 7 Tage', 30: 'Letzte 30 Tage', 90: 'Letzte 90 Tage', 365: 'Letzte 12 Monate' })
const AU_ZEITRAUM_TEXT = Object.freeze({ 7: '7 Tagen', 30: '30 Tagen', 90: '90 Tagen', 365: '12 Monaten' })
const AU_STANDARD = 30
const AU_REITER = Object.freeze({ stats: 'spiele', metrics: 'kennzahlen', classroom: 'klassenraum' }) // Seite → Reiter
const AU_CACHE_MS = 60 * 1000          // Zwischenspeicher im Browser je Seite und Zeitraum; „neu laden“ umgeht ihn
const AU_WOCHEN_AB_TAGEN = 120         // ab so vielen Tagen zeigen die Diagramme Wochensummen (12 Monate = 53 Säulen)
const AU_MIN_SPIELE_TAG = 30           // „Schwerste Tage“: erst ab so vielen Spielen eines Modus an einem Tag
const AU_MONATE_KURZ = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']
const NBSP = String.fromCharCode(160)
const MINUS = String.fromCharCode(0x2212)

let auswertungZeitraum = AU_STANDARD
const auNr = { stats: 0, metrics: 0, classroom: 0 }         // laufende Nummer je Seite: nur die neueste Antwort darf zeichnen
const auGeladen = new Map()                                  // `${seite}|${tage}` → { ts, daten } (nur erfolgreiche Antworten)
const auDaten = {}                                           // seite → { tage, daten } der gerade gezeichneten Darstellung
const auDiagramme = new Map()                                // id → { werte, opts, gewaehlt }
const auVielfache = new Map()                                // id → { anteile, maxAnteil, modus }
const AU_DIAGRAMME_JE_SEITE = { stats: ['au-d-spiele', 'au-v-k', 'au-v-w', 'au-v-z', 'au-v-l'], metrics: ['au-d-kaeufe', 'au-d-eigenes'], classroom: ['au-d-sitzungen'] }

function leseAuswertungZeitraum(query) {
  const z = Number(new URLSearchParams(query).get('zeitraum'))
  return Object.hasOwn(AU_ZEITRAEUME, z) ? z : AU_STANDARD
}

function auswertungHash(reiter, tage) {
  return `#auswertung/${reiter}${tage !== AU_STANDARD ? `?zeitraum=${tage}` : ''}`
}

// ── Formate ──
const auZahl = (n) => ganzzahlDe(n)
const auAnzahl = (n, eins, viele) => `${ganzzahlDe(n)}${NBSP}${Number(n) === 1 ? eins : viele}`
const auProzent = (teil, ganz) => (ganz > 0 ? `${Math.round((teil / ganz) * 100)}${NBSP}%` : '–')
const auBetrag = (n) => betragDe(n).replace(' ', NBSP)
const auDezimal = (n, stellen = 1) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })
const auUhr = (wert) => { const t = berlinTeile(wert || getCurrentDate()); return t ? uhrText(t) : '' }
const auFehlerText = (err) => (err?.status ? `HTTP ${err.status}` : String(err?.message || 'unbekannter Fehler'))

// „25. September – 24. Oktober 2026“ · „9.–15. November 2026“
function auDatumSpanne(von, bis) {
  const a = datumTeile(von)
  const e = datumTeile(bis)
  if (a.y !== e.y) return `${a.d}. ${MONTHS_DE[a.m - 1]} ${a.y} – ${e.d}. ${MONTHS_DE[e.m - 1]} ${e.y}`
  if (a.m !== e.m) return `${a.d}. ${MONTHS_DE[a.m - 1]} – ${e.d}. ${MONTHS_DE[e.m - 1]} ${e.y}`
  return `${a.d}.–${e.d}. ${MONTHS_DE[e.m - 1]} ${e.y}`
}

// Abstand zweier Kalendertage in Tagen (bis − von), unabhängig von der Sommerzeit
function auTageZwischen(von, bis) {
  const a = datumTeile(von)
  const b = datumTeile(bis)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 864e5)
}

// Kalenderwoche (ISO 8601) eines Tages
function auKw(iso) {
  const t = datumTeile(iso)
  const utc = Date.UTC(t.y, t.m - 1, t.d)
  const donnerstag = new Date(utc + (3 - t.wt) * 864e5)
  const erster = Date.UTC(donnerstag.getUTCFullYear(), 0, 1)
  return Math.floor((donnerstag.getTime() - erster) / 864e5 / 7) + 1
}

// ── Diagramm-Bausteine ──
function auRunde(n) {
  if (n <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(n))
  const f = n / p
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((g) => f <= g) * p
}

// Achsenbeschriftung kurz: 3.000 · 12 Tsd. · 1,2 Mio.
function auKurzZahl(n) {
  if (n >= 1000000) return `${(Math.round(n / 100000) / 10).toLocaleString('de-DE')}${NBSP}Mio.`
  return n >= 10000 ? `${auZahl(Math.round(n / 1000))}${NBSP}Tsd.` : auZahl(n)
}

// Breite eines Achsentextes (11 px, Schrift der Seite); ohne Canvas eine Schätzung von 6,5 px je Zeichen
let auMessKontext
function auTextBreite(text, schrift) {
  try {
    auMessKontext ??= document.createElement('canvas').getContext('2d')
    auMessKontext.font = `400 11px ${schrift}`
    const b = auMessKontext.measureText(text).width
    if (b > 0) return b
  } catch { /* ohne Canvas schätzen */ }
  return text.length * 6.5
}

// Säule mit 4-px-Rundung oben, eckig an der Grundlinie
function auSaeulePfad(x, y, w, h) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * Säulendiagramm (eine Reihe). werte: [{ key, kurz, lang, wert, teil?, marke? }]
 * opts: { titel, labelId, spanne, schritt: 'tag'|'woche', einheit(n), zusatz(w), legende: [], tabelle }
 *
 * Bedienung: Das Diagramm ist ein Schieberegler (role="slider") über die Säulen. Pfeiltasten und Antippen wählen eine
 * Säule und setzen aria-valuenow/-valuetext („Do 22.10.: 422 Spiele“), das liest die Sprachausgabe vor. Zeigerbewegung
 * und Verlassen ändern nur die Anzeige (Ablesezeile, rote Säule), sagen aber nichts an – die Ablesezeile ist keine Live-Region.
 */
function auDiagrammHtml(id, werte, opts) {
  auDiagramme.set(id, { werte, opts, gewaehlt: null })
  const max = Math.max(0, ...werte.map((w) => w.wert))
  const hoch = werte.reduce((a, w) => (w.wert > (a?.wert ?? -1) && !w.teil ? w : a), null)
  const zuletzt = werte.filter((w) => !w.teil).at(-1) || werte.at(-1)
  // „am Do 22.10.“ · „in KW 42 (12.10.–18.10.)“ · „heute, Do 22.10. (bis 14:36 Uhr)“
  const wann = (w) => (opts.schritt === 'woche' ? `in ${w.lang}` : w.lang.startsWith('heute') ? w.lang : `am ${w.lang}`)
  const satz = (x) => (x.endsWith('.') ? x : `${x}.`)
  const label = `${opts.titel} vom ${opts.spanne}: ${max > 0 && hoch ? `Höchster Wert ${opts.einheit(hoch.wert)} ${wann(hoch)}; zuletzt ${opts.einheit(zuletzt.wert)} ${satz(wann(zuletzt))}` : 'alle Werte 0.'} Pfeiltasten wählen ${opts.schritt === 'woche' ? 'eine Woche' : 'einen Tag'}.`
  const legende = (opts.legende || []).length ? `<ul class="au-legende">${opts.legende.join('')}</ul>` : ''
  const start = auStandardIndex(werte)
  return `<figure class="au-diagramm"${opts.labelId ? ` aria-labelledby="${esc(opts.labelId)}"` : ''}>`
    + `<p class="au-ablesen" id="${id}-ablesen">${auAblesenHtml(id, null)}</p>`
    + `<div class="au-plot" id="${id}" tabindex="0" role="slider" aria-roledescription="Säulendiagramm" aria-orientation="horizontal" aria-label="${esc(label)}"`
    + ` aria-valuemin="1" aria-valuemax="${werte.length}" aria-valuenow="${start + 1}" aria-valuetext="${esc(auWertText(id, start))}"></div>`
    + legende
    + auTabelleHtml(opts.tabelle)
    + '</figure>'
}

// Ausgangspunkt, solange nichts gewählt ist: der letzte volle Tag (nicht der laufende)
function auStandardIndex(werte) {
  const i = werte.findLastIndex((w) => !w.teil)
  return i >= 0 ? i : Math.max(0, werte.length - 1)
}

// Vorgelesener Wert einer Säule: „Do 22.10.: 422 Spiele“ (mit Zusatz: „…, Bonus-Tag +2“)
function auWertText(id, idx) {
  const d = auDiagramme.get(id)
  const w = d?.werte[idx]
  if (!w) return ''
  const zusatz = d.opts.zusatz ? d.opts.zusatz(w) : ''
  return `${w.lang}: ${d.opts.einheit(w.wert)}${zusatz ? `, ${zusatz}` : ''}`
}

// „Werte als Tabelle“ gibt es mehrmals auf der Seite: Der Titel hängt unsichtbar dran, damit die Knöpfe unterscheidbar sind
function auTabelleHtml(t) {
  if (!t) return ''
  return `<details class="au-werte"><summary>Werte als Tabelle<span class="adm-visually-hidden">: ${esc(t.titel)}</span></summary>`
    + `<div class="au-tab-wrap" tabindex="0" role="region" aria-label="${esc(t.titel)}"><table class="au-tab"><caption class="adm-visually-hidden">${esc(t.titel)}</caption>`
    + `<thead><tr>${t.spalten.map((s) => `<th scope="col">${esc(s)}</th>`).join('')}</tr></thead>`
    + `<tbody>${t.zeilen.map((z) => `<tr><th scope="row">${esc(z[0])}</th>${z.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`
}

function auAblesenHtml(id, idx) {
  const d = auDiagramme.get(id)
  if (!d) return ''
  const { werte, opts } = d
  let w = idx == null ? null : werte[idx]
  let vorgabe = false
  if (!w) { w = werte.filter((x) => !x.teil).at(-1) || werte.at(-1); vorgabe = true }
  if (!w) return ''
  const zusatz = opts.zusatz ? opts.zusatz(w) : ''
  return `${vorgabe ? '<span class="au-ablesen-zusatz">Zuletzt: </span>' : ''}${esc(w.lang)}: <strong>${esc(opts.einheit(w.wert))}</strong>${zusatz ? ` <span class="au-ablesen-zusatz">· ${esc(zusatz)}</span>` : ''}`
}

function auZeichneDiagramm(id) {
  const host = document.getElementById(id)
  const d = auDiagramme.get(id)
  if (!host || !d) return
  const gemessen = Math.round(host.clientWidth)
  if (!gemessen) return // Seite gerade nicht sichtbar: Beim nächsten Öffnen wird neu gezeichnet
  const breite = Math.max(200, gemessen)
  const hoehe = 172
  const unten = 22
  const oben = 10
  const plotH = hoehe - unten - oben
  const { werte } = d
  const max = auRunde(Math.max(1, ...werte.map((w) => w.wert)))
  const n = werte.length
  // Linker Rand aus der breitesten Beschriftung (3.000, 12 Tsd., 1,2 Mio.): nichts ragt über den Rand
  const stufen = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max]
  const schrift = getComputedStyle(host).getPropertyValue('--font-sans').trim() || 'sans-serif'
  const links = Math.max(22, Math.ceil(Math.max(...stufen.map((t) => auTextBreite(auKurzZahl(t), schrift)))) + 8)
  const plotB = breite - links - 2
  const schritt = plotB / n
  const bw = Math.max(1, Math.min(24, schritt - (schritt >= 4 ? 2 : 1)))
  const yVon = (v) => oben + plotH - (v / max) * plotH
  let s = `<svg width="${breite}" height="${hoehe}" viewBox="0 0 ${breite} ${hoehe}" aria-hidden="true" focusable="false">`
  for (const t of stufen) {
    const y = Math.round(yVon(t)) + 0.5
    s += `<line class="${t === 0 ? 'au-grundlinie' : 'au-gitter'}" x1="${links}" x2="${breite}" y1="${y}" y2="${y}"/>`
    s += `<text class="au-achse-text" x="${links - 6}" y="${y + 4}" text-anchor="end">${esc(auKurzZahl(t))}</text>`
  }
  // Marke der gewählten Säule zusätzlich zur Farbe: eine rote Linie durch die Säulenmitte (hinter der Säule, sichtbar
  // über kurzen Säulen und bei Tagen ohne Wert) und ein roter Fuß unter der Grundlinie
  if (d.gewaehlt != null && werte[d.gewaehlt]) {
    const x = Math.round(links + d.gewaehlt * schritt + schritt / 2) + 0.5
    s += `<line class="au-wahl-linie" x1="${x}" x2="${x}" y1="${oben}" y2="${oben + plotH}"/>`
    s += `<line class="au-wahl-fuss" x1="${x}" x2="${x}" y1="${oben + plotH + 1}" y2="${oben + plotH + 6}"/>`
  }
  werte.forEach((w, i) => {
    const x = links + i * schritt + (schritt - bw) / 2
    const h = w.wert > 0 ? Math.max(1.5, (w.wert / max) * plotH) : 0
    const y = oben + plotH - h
    const klasse = `au-saeule${w.teil ? ' is-teil' : ''}${d.gewaehlt === i ? ' is-gewaehlt' : ''}`
    if (h > 0) s += `<path class="${klasse}" d="${auSaeulePfad(x, y, bw, h)}"/>`
    if (w.marke) s += `<circle class="au-marke" cx="${x + bw / 2}" cy="${Math.max(5, y - 7)}" r="3.5"/>`
  })
  // x-Achse: erster, mittlerer und letzter Wert (bei Wochen: Monatskürzel)
  const marken = n <= 8 ? werte.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
  for (const i of marken) {
    const anker = i === 0 && n > 8 ? 'start' : i === n - 1 && n > 8 ? 'end' : 'middle'
    const x = anker === 'start' ? links + i * schritt : anker === 'end' ? links + (i + 1) * schritt : links + i * schritt + schritt / 2
    s += `<text class="au-achse-text" x="${x}" y="${hoehe - 6}" text-anchor="${anker}">${esc(werte[i].kurz)}</text>`
  }
  s += '</svg>'
  host.innerHTML = s
  host.dataset.links = String(links)
  host.dataset.schritt = String(schritt)
}

// Wählt eine Säule (null: nichts gewählt, die Ablesezeile zeigt wieder den letzten vollen Tag).
// stumm: nur die Anzeige ändern (Zeigerbewegung); sonst auch aria-valuenow/-valuetext für die Sprachausgabe.
function auWaehle(id, idx, { stumm = false } = {}) {
  const d = auDiagramme.get(id)
  if (!d) return
  d.gewaehlt = idx
  auZeichneDiagramm(id)
  const zeile = document.getElementById(`${id}-ablesen`)
  if (zeile) zeile.innerHTML = auAblesenHtml(id, idx)
  if (stumm) return
  d.gesetzt = idx // Auswahl, die die Sprachausgabe kennt (Tastatur, Antippen); der Zeiger darf sie nur vorübergehend überdecken
  const host = document.getElementById(id)
  const i = idx ?? auStandardIndex(d.werte)
  host?.setAttribute('aria-valuenow', String(i + 1))
  host?.setAttribute('aria-valuetext', auWertText(id, i))
}

function auZeichneAlle() {
  for (const id of auDiagramme.keys()) auZeichneDiagramm(id)
  for (const [id, v] of auVielfache) {
    const el = document.getElementById(id)
    if (el && el.clientWidth) el.innerHTML = auVerteilungSvg(v.anteile, v.maxAnteil, v.modus, Math.max(160, Math.round(el.clientWidth)))
  }
}

// Sparkline 84 × 24 (Linie + Endpunkt), nur fürs Auge – die Werte stehen in der Zeile und in der Tabelle
function auSparkline(werte) {
  if (!werte.length) return ''
  const b = 84
  const h = 24
  const max = Math.max(1, ...werte)
  const pkt = werte.map((v, i) => [2 + (i / Math.max(1, werte.length - 1)) * (b - 6), h - 3 - (v / max) * (h - 6)])
  const letzt = pkt.at(-1)
  return `<svg width="${b}" height="${h}" viewBox="0 0 ${b} ${h}" aria-hidden="true" focusable="false"><polyline class="au-spark-linie" points="${pkt.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/><circle class="au-spark-punkt" cx="${letzt[0].toFixed(1)}" cy="${letzt[1].toFixed(1)}" r="2.5"/></svg>`
}

// Kleines Histogramm 0–10 (Anteile), gemeinsamer Maßstab für alle Modi
function auVerteilungSvg(anteile, maxAnteil, modus, b = 220) {
  const h = 64
  const unten = 14
  const schritt = b / 11
  const bw = Math.min(14, schritt - 2)
  let s = `<svg width="${b}" height="${h}" viewBox="0 0 ${b} ${h}" aria-hidden="true" focusable="false"><line class="au-grundlinie" x1="0" x2="${b}" y1="${h - unten + 0.5}" y2="${h - unten + 0.5}"/>`
  anteile.forEach((a, p) => {
    const hh = maxAnteil > 0 ? (a / maxAnteil) * (h - unten - 4) : 0
    const x = p * schritt + (schritt - bw) / 2
    if (hh > 0) s += `<path class="au-saeule" d="${auSaeulePfad(x, h - unten - hh, bw, hh)}"><title>${esc(`${modus}: ${p} Punkte – ${Math.round(a * 100)} % der Spiele`)}</title></path>`
    if (p % 5 === 0 || p === 10) s += `<text class="au-achse-text" x="${x + bw / 2}" y="${h - 2}" text-anchor="middle">${p}</text>`
  })
  return `${s}</svg>`
}

const auLegendeTeil = (woche) => `<li><svg width="12" height="12" aria-hidden="true" focusable="false"><rect class="au-saeule is-teil" x="1" y="1" width="10" height="10" rx="1"/></svg>${woche ? 'angefangene Woche' : 'heute, läuft noch'}</li>`
const AU_LEGENDE_BONUS = '<li><svg width="12" height="12" aria-hidden="true" focusable="false"><circle class="au-marke" cx="6" cy="6" r="3.5"/></svg>Bonus-Tag</li>'

function auBonusAm(iso) {
  const b = freeDaysData.find((t) => t?.date === iso)
  return b ? { bonus: Number(b.bonus_count) || 0, label: b.label || '' } : null
}

// Tage → Wochen (12 Monate): Summe je Kalenderwoche; angefangene Wochen am Rand zählen mit und sind als Umriss gezeichnet
function auNachWochen(tage, wertVon) {
  const wochen = []
  for (const t of tage) {
    const k = auKw(t.datum)
    const letzte = wochen.at(-1)
    if (letzte && letzte.kw === k && addTageIso(letzte.bis, 1) === t.datum) {
      letzte.wert += wertVon(t)
      letzte.bis = t.datum
      letzte.teil = letzte.teil || !!t.teil
      letzte.marke = letzte.marke || !!auBonusAm(t.datum)
    } else {
      wochen.push({ kw: k, von: t.datum, bis: t.datum, wert: wertVon(t), teil: !!t.teil, marke: !!auBonusAm(t.datum) })
    }
  }
  return wochen.map((w) => {
    const anzahlTage = auTageZwischen(w.von, w.bis) + 1
    return {
      key: w.von,
      kurz: AU_MONATE_KURZ[datumTeile(w.von).m - 1],
      lang: `KW ${w.kw} (${kurzTag(w.von)}–${kurzTag(w.bis)}${anzahlTage < 7 ? `, ${anzahlTage} von 7 Tagen` : ''})`,
      wert: w.wert,
      teil: w.teil || anzahlTage < 7,
      marke: w.marke,
    }
  })
}

// Reihe fürs Diagramm: Tage, ab 120 Tagen Wochen. heute = letzter Tag des Zeitraums.
function auReihe(tage, wertVon, { marken = false, stand = null } = {}) {
  if (tage.length > AU_WOCHEN_AB_TAGEN) return auNachWochen(tage, wertVon)
  const heute = tage.at(-1)?.datum
  return tage.map((t) => ({
    key: t.datum,
    kurz: kurzTag(t.datum),
    lang: t.datum === heute && t.teil ? `heute, ${datumKurz(t.datum)} (bis ${auUhr(stand)} Uhr)` : datumKurz(t.datum),
    wert: wertVon(t),
    teil: !!t.teil,
    marke: marken && !!auBonusAm(t.datum),
  }))
}

// ── Gemeinsame Bausteine ──
// Fehlt ein Wert, steht „–“ da; die Sprachausgabe sagt stattdessen „keine Angabe“
const AU_KEINE_ANGABE = '<span aria-hidden="true">–</span><span class="adm-visually-hidden">keine Angabe</span>'

function auZahlenHtml(eintraege) {
  return '<dl class="au-zahlen">' + eintraege.map((e) => {
    const wert = e.wertHtml ?? esc(e.wert)
    return `<div class="au-zahl"><dt>${esc(e.label)}</dt><dd><span class="au-zahl-wert${e.leer ? ' is-leer' : ''}">${wert === '–' ? AU_KEINE_ANGABE : wert}</span>${e.zusatz ? `<span class="au-zahl-zusatz"${e.ton ? ` data-tone="${e.ton}"` : ''}>${esc(e.zusatz)}</span>` : ''}</dd></div>`
  }).join('') + '</dl>'
}

// „25.09. bis 24.10.“ – bei 12 Monaten und über einen Jahreswechsel mit Jahr: „25.10.2025 bis 24.10.2026“
function auSpanneKurz(z) {
  const mitJahr = z.days >= 365 || z.von.slice(0, 4) !== z.bis.slice(0, 4)
  return `${kurzTag(z.von)}${mitJahr ? z.von.slice(0, 4) : ''} bis ${kurzTag(z.bis)}${mitJahr ? z.bis.slice(0, 4) : ''}`
}

const auAbschnitt = (id, titel, inhalt) => `<section class="tag-abschnitt" aria-labelledby="${id}-titel"><h2 class="tag-abschnitt-titel" id="${id}-titel">${esc(titel)}</h2>${inhalt}</section>`
const auLeerHtml = (titel, text) => `<div class="li-leer"><p class="li-leer-titel">${esc(titel)}</p><p class="li-leer-text">${esc(text)}</p><p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>`
// satz: ganzer Satzanfang („Die Zahlungen konnten“), damit die Beugung stimmt
const auFehlerZeile = (satz, err) => `<p class="li-meldung" data-tone="error">${esc(satz)} nicht geladen werden (${esc(auFehlerText(err))}). <button type="button" class="adm-link" data-action="au-neu-laden">Erneut versuchen</button></p>`

function auDeltaText(jetzt, vorher, tage) {
  if (!vorher || !vorher.spiele) return ''
  const p = Math.round(((jetzt - vorher.spiele) / vorher.spiele) * 100)
  if (p === 0) return `gleich viel wie in den ${AU_ZEITRAUM_TEXT[tage]} davor`
  return `${p > 0 ? '+' : MINUS}${Math.abs(p)}${NBSP}% zu den ${AU_ZEITRAUM_TEXT[tage]} davor`
}

// Ab dem Tag nach `verdichtetBis` gibt es Konto-Zeilen; davor sind die Konten in die anonyme Zeile gefaltet (180 Tage)
const auKontoAb = (verdichtetBis) => addTageIso(verdichtetBis, 1)

function auUmfangText(zeitraum, stand) {
  // Admin-Spiele, die älter als 180 Tage sind, lassen sich nicht mehr herausrechnen
  const admin = zeitraum.verdichtetBis ? 'ohne Admin-Konten (Admin-Spiele älter als 180 Tage nicht herausgerechnet)' : 'ohne Admin-Konten'
  return `${auDatumSpanne(zeitraum.von, zeitraum.bis)} · heute bis ${auUhr(stand)} Uhr · ${admin}`
}

// ── Spiele ──
function auSchwersteTageHtml(d) {
  const modusSchnitt = Object.fromEntries(MODI.map((m) => {
    const p = d.tage.reduce((a, t) => a + t.modi[m.key].punkte, 0)
    const x = d.tage.reduce((a, t) => a + t.modi[m.key].max, 0)
    return [m.key, x ? p / x : 0]
  }))
  const kandidaten = []
  for (const t of d.tage) {
    for (const m of MODI) {
      const x = t.modi[m.key]
      if (x.spiele >= AU_MIN_SPIELE_TAG && x.max > 0) {
        kandidaten.push({ datum: t.datum, m, schnitt: x.punkte / x.max, abstand: x.punkte / x.max - modusSchnitt[m.key], spiele: x.spiele })
      }
    }
  }
  kandidaten.sort((a, b) => a.abstand - b.abstand)
  const schwer = kandidaten.slice(0, 5)
  if (!schwer.length) return '<p class="tag-abschnitt-text">Kein Tag mit mindestens 30 Spielen in einem Modus.</p>'
  const jahr = d.zeitraum.bis.slice(0, 4)
  const wortVon = (datum, modus) => {
    const gruppe = kalenderStatus === 'ok' ? getModeGroups(kalenderData?.[datum]).find((g) => g.key === modus) : null
    return gruppe?.items?.length ? gruppe.items.join(modus === 'wortzwilling' ? ' / ' : ', ') : '–'
  }
  return '<p class="tag-abschnitt-text">Die fünf Tage, die am weitesten unter dem Durchschnitt ihres Spielmodus lagen (ab 30 Spielen). Das Datum öffnet den Tag in Planen.</p>'
    + '<ol class="au-tage">' + schwer.map((k) => `<li class="au-tag"><span class="au-tag-datum"><a href="#planen/tag/${esc(k.datum)}">${esc(datumKurz(k.datum))}${esc(k.datum.slice(0, 4) !== jahr ? k.datum.slice(0, 4) : '')}</a></span>`
      + `<span class="au-tag-inhalt">${auBadge(k.m)}<span class="au-tag-wort">${esc(wortVon(k.datum, k.m.key))}</span></span>`
      + `<span class="au-tag-wert">${DURCHSCHNITT_HTML}${esc(auDezimal(k.schnitt * 10))}<small>${esc(`${MINUS}${auDezimal(Math.abs(k.abstand * 10))} zum Schnitt · ${auAnzahl(k.spiele, 'Spiel', 'Spiele')}`)}</small></span></li>`).join('') + '</ol>'
}

const auBadge = (m) => `<span class="tag-badge" data-m="${m.marke}">${esc(m.label)}</span>`

// Das Kalenderwort eines Tages wird erst mit dem Kalender geladen: danach den Abschnitt nachziehen
function aktualisiereSchwersteTage() {
  const host = document.getElementById('au-schwer-inhalt')
  const stand = auDaten.stats
  if (host && stand) host.innerHTML = auSchwersteTageHtml(stand.daten)
}

function renderAuswertungSpiele(d) {
  const host = document.getElementById('au-inhalt-stats')
  if (!host) return
  const tage = d.zeitraum.days
  document.getElementById('au-umfang-stats').textContent = auUmfangText(d.zeitraum, d.zeitraum.stand)
  auVergissDiagramme('stats')
  if (!d.summe.spiele) {
    host.innerHTML = auLeerHtml('Im Zeitraum wurde nicht gespielt.', 'Sobald jemand ein Spiel beendet, steht es hier – angemeldet oder nicht.')
    return
  }
  const volleTage = d.tage.filter((t) => !t.teil)
  const spieleTag = (t) => MODI.reduce((s, m) => s + t.modi[m.key].spiele, 0)
  const proTag = Math.round(volleTage.reduce((a, t) => a + spieleTag(t), 0) / Math.max(1, volleTage.length))
  const heute = d.tage.find((t) => t.teil)
  const heuteSpiele = heute ? spieleTag(heute) : 0
  const vorherPunkte = d.vorher?.max ? (d.vorher.punkte / d.vorher.max) * 10 : null
  const jetztPunkte = (d.summe.punkte / d.summe.max) * 10
  const punkteDelta = vorherPunkte == null ? '' : Math.abs(jetztPunkte - vorherPunkte) < 0.05
    ? `gleich wie in den ${AU_ZEITRAUM_TEXT[tage]} davor`
    : `${jetztPunkte > vorherPunkte ? '+' : MINUS}${auDezimal(Math.abs(jetztPunkte - vorherPunkte))} zu den ${AU_ZEITRAUM_TEXT[tage]} davor`

  let html = auZahlenHtml([
    { label: 'Spiele', wert: auZahl(d.summe.spiele), zusatz: auDeltaText(d.summe.spiele, d.vorher, tage) || 'im Zeitraum' },
    { label: 'Am Tag', wertHtml: `${DURCHSCHNITT_HTML}${esc(auZahl(proTag))}`, zusatz: `heute bis ${auUhr(d.zeitraum.stand)} Uhr: ${auZahl(heuteSpiele)}` },
    { label: 'Punkte', wertHtml: `${DURCHSCHNITT_HTML}${esc(punkteDe(d.summe.punkte, d.summe.max))}`, zusatz: punkteDelta ? `von 10 · ${punkteDelta}` : 'von 10' },
    // Verdichtete Tage (älter als 180 Tage) haben keine Konto-Zeilen: Anteil nur ab dem ersten Tag mit Konto-Zeilen
    { label: 'Mit Konto', wert: auProzent(d.summe.mitKonto, d.summe.kontoBasis), zusatz: d.zeitraum.verdichtetBis ? `der Spiele ab ${datumDe(auKontoAb(d.zeitraum.verdichtetBis))} (angemeldet)` : 'der Spiele (angemeldet)' },
  ])

  // Verlauf
  const werte = auReihe(d.tage, spieleTag, { stand: d.zeitraum.stand })
  const woche = werte.length !== d.tage.length
  const titel = woche ? 'Spiele pro Woche' : 'Spiele pro Tag'
  const jeModusWoche = woche ? MODI.map((m) => auNachWochen(d.tage, (t) => t.modi[m.key].spiele)) : null
  html += auAbschnitt('au-spiele-verlauf', titel, auDiagrammHtml('au-d-spiele', werte, {
    titel,
    labelId: 'au-spiele-verlauf-titel',
    spanne: auSpanneKurz(d.zeitraum),
    schritt: woche ? 'woche' : 'tag',
    einheit: (n) => auAnzahl(n, 'Spiel', 'Spiele'),
    legende: werte.some((w) => w.teil && w.wert > 0) ? [auLegendeTeil(woche)] : [],
    tabelle: {
      titel: `${titel}, nach Spielmodus`,
      spalten: [woche ? 'Woche' : 'Tag', 'Alle', ...MODI.map((m) => m.label)],
      zeilen: woche
        ? werte.map((w, i) => [w.lang, auZahl(w.wert), ...jeModusWoche.map((r) => auZahl(r[i].wert))])
        : d.tage.map((t) => [datumKurz(t.datum), auZahl(spieleTag(t)), ...MODI.map((m) => auZahl(t.modi[m.key].spiele))]),
    },
  }))

  // Nach Spielmodus: Zeile mit Text und Sparkline (Reihenfolge wie MODI, mit Lückenfüller)
  const zeilen = MODI.map((m) => {
    const sp = d.tage.reduce((a, t) => a + t.modi[m.key].spiele, 0)
    const pk = d.tage.reduce((a, t) => a + t.modi[m.key].punkte, 0)
    const mx = d.tage.reduce((a, t) => a + t.modi[m.key].max, 0)
    const verlauf = (woche ? auNachWochen(d.tage, (t) => t.modi[m.key].spiele) : d.tage.map((t) => ({ wert: t.modi[m.key].spiele, teil: t.teil })))
      .filter((w) => !w.teil).map((w) => w.wert)
    return `<li class="au-zeile"><span class="au-zeile-name">${auBadge(m)}</span>`
      + `<span class="au-zeile-werte"><b>${esc(auAnzahl(sp, 'Spiel', 'Spiele'))}</b> · ${esc(auProzent(sp, d.summe.spiele))} · ${DURCHSCHNITT_HTML}${esc(punkteDe(pk, mx))} von 10</span>`
      + `<span class="au-zeile-bild">${auSparkline(verlauf)}</span>`
      + (m.key === 'kollokationen' ? '<span class="au-zeile-unter">Ein Spiel je gespieltem Wort; an einem Tag sind mehrere Wörter möglich.</span>' : '')
      + '</li>'
  }).join('')
  const wdw = d.wortDerWoche
  const wdwZeile = wdw?.spiele
    ? `<li class="au-zeile"><span class="au-zeile-name">Wort der Woche</span><span class="au-zeile-werte"><b>${esc(auAnzahl(wdw.spiele, 'Spiel', 'Spiele'))}</b> · ${DURCHSCHNITT_HTML}${esc(punkteDe(wdw.punkte, wdw.max))} von 10</span><span class="au-zeile-bild"></span><span class="au-zeile-unter">Wort-Zwilling, Zeitenwende und Lückenfüller zum Wort der Woche, zusammengezählt. Nicht in den Zahlen oben enthalten. Spiele aus älteren App-Versionen stehen noch unter dem Montag der Woche bei den Tagesspielen.</span></li>`
    : ''
  html += auAbschnitt('au-spiele-modi', 'Nach Spielmodus', `<ul class="au-zeilen">${zeilen}${wdwZeile}</ul><p class="au-hinweis">Linie rechts: ${woche ? 'Spiele pro Woche' : 'Spiele pro Tag'} im Zeitraum.</p>`)

  // Punkte je Spiel: kleine Vielfache, gleicher Maßstab
  const anteile = Object.fromEntries(MODI.map((m) => {
    const v = d.verteilung[m.key] || []
    const s = v.reduce((a, x) => a + x, 0)
    return [m.key, Array.from({ length: 11 }, (_, p) => (s ? (v[p] || 0) / s : 0))]
  }))
  const maxAnteil = Math.max(...MODI.flatMap((m) => anteile[m.key]))
  const vielfachHtml = MODI.map((m) => {
    const a = anteile[m.key]
    const haeufig = a.indexOf(Math.max(...a))
    const voll = Math.round(a[10] * 100)
    const text = `${m.label}: am häufigsten ${haeufig} Punkte (${Math.round(a[haeufig] * 100)} % der Spiele); volle Punktzahl ${voll} %.`
    auVielfache.set(`au-v-${m.marke}`, { anteile: a, maxAnteil, modus: m.label })
    return `<li class="au-vielfach"><div class="au-vielfach-kopf">${auBadge(m)}<span class="au-zusatz">10 Punkte: ${voll}${NBSP}%</span></div><div id="au-v-${m.marke}" role="img" aria-label="${esc(text)}"></div></li>`
  }).join('')
  html += auAbschnitt('au-spiele-punkte', 'Punkte je Spiel',
    '<p class="tag-abschnitt-text">Wie viele Spiele mit 0 bis 10 Punkten endeten, als Anteil je Spielmodus (gleicher Maßstab). Viele volle Punktzahlen heißen: zu leicht.</p>'
    + `<ul class="au-vielfache">${vielfachHtml}</ul>`
    + auTabelleHtml({ titel: 'Punkte je Spiel, Anteil der Spiele in Prozent', spalten: ['Punkte', ...MODI.map((m) => m.label)], zeilen: Array.from({ length: 11 }, (_, p) => [`${p}`, ...MODI.map((m) => `${Math.round(anteile[m.key][p] * 100)} %`)]) }))

  html += auAbschnitt('au-spiele-schwer', 'Schwerste Tage', `<div id="au-schwer-inhalt">${auSchwersteTageHtml(d)}</div>`)

  host.innerHTML = html
  auZeichneAlle()
}

// ── Kennzahlen ──
function renderAuswertungKennzahlen(r, tage) {
  const host = document.getElementById('au-inhalt-metrics')
  if (!host) return
  auBonusStand = JSON.stringify(freeDaysData) // Stand der Bonus-Tage, mit dem gezeichnet wird (siehe auBonusNachgeladen)
  const teil = r.zahlungen.d || r.eigenesLemma.d || r.aktivitaet.d
  const zeitraum = teil?.zeitraum
  document.getElementById('au-umfang-metrics').textContent = zeitraum ? auUmfangText(zeitraum, null) : ''
  auVergissDiagramme('metrics')
  let html = ''

  // Zahlungen
  if (r.zahlungen.err) {
    html += auAbschnitt('au-zahlungen', 'Zahlungen', auFehlerZeile('Die Zahlungen konnten', r.zahlungen.err))
  } else {
    const z = r.zahlungen.d
    const werte = auReihe(z.tage, (t) => t.kaeufe)
    const woche = werte.length !== z.tage.length
    const einnahmenWoche = woche ? auNachWochen(z.tage, (t) => t.betrag) : null
    const wege = { mollie: 'Website (Mollie)', apple: 'iOS-App (App Store)' }
    const wegZeilen = z.nachWeg.map((w) => {
      const n = w.stufen.reduce((a, s) => a + s.kaeufe, 0)
      const b = w.stufen.reduce((a, s) => a + s.kaeufe * Number(s.betrag), 0)
      return `<li class="au-zeile"><span class="au-zeile-name">${esc(wege[w.weg] || w.weg)}</span><span class="au-zeile-werte"><b>${esc(auAnzahl(n, 'Kauf', 'Käufe'))}</b> · ${esc(auBetrag(b))}</span><span class="au-zeile-bild"></span>`
        + (w.stufen.length ? `<span class="au-zeile-unter">${w.stufen.map((s) => `${esc(auBetrag(s.betrag))}: ${esc(auZahl(s.kaeufe))}`).join(' · ')}</span>` : '')
        + '</li>'
    }).join('')
    const titel = woche ? 'Käufe pro Woche' : 'Käufe pro Tag'
    html += auAbschnitt('au-zahlungen', 'Zahlungen', auZahlenHtml([
      { label: 'Einnahmen', wert: auBetrag(z.betrag), zusatz: 'brutto' },
      { label: 'Käufe', wert: auZahl(z.kaeufe), zusatz: 'Gesamtausgabe' },
      { label: 'Betrag', wertHtml: z.kaeufe ? `${DURCHSCHNITT_HTML}${esc(auBetrag(z.betrag / z.kaeufe))}` : '–', leer: !z.kaeufe, zusatz: 'je Kauf' },
    ])
      + (z.kaeufe
        ? auDiagrammHtml('au-d-kaeufe', werte, {
          titel,
          labelId: 'au-zahlungen-titel',
          spanne: auSpanneKurz(z.zeitraum),
          schritt: woche ? 'woche' : 'tag',
          einheit: (n) => auAnzahl(n, 'Kauf', 'Käufe'),
          legende: werte.some((w) => w.teil && w.wert > 0) ? [auLegendeTeil(woche)] : [],
          tabelle: {
            titel: 'Käufe und Einnahmen',
            spalten: [woche ? 'Woche' : 'Tag', 'Käufe', 'Einnahmen'],
            zeilen: woche ? werte.map((w, i) => [w.lang, auZahl(w.wert), auBetrag(einnahmenWoche[i].wert)]) : z.tage.map((t) => [datumKurz(t.datum), auZahl(t.kaeufe), auBetrag(t.betrag)]),
          },
        }) + `<ul class="au-zeilen">${wegZeilen}</ul>`
        : '<p class="tag-abschnitt-text">Im Zeitraum wurde nichts gekauft.</p>')
      + `<p class="au-hinweis">Bruttobeträge, wie bezahlt – vor Mollie-Gebühren und Apple-Provision. Erstattete Käufe sind nicht mitgezählt${z.erstattet?.kaeufe ? ` (im Zeitraum ${esc(auAnzahl(z.erstattet.kaeufe, 'Kauf', 'Käufe'))}, ${esc(auBetrag(z.erstattet.betrag))})` : ''}; erfasst werden Erstattungen seit dem 27.10.2026.</p>`)
  }

  // Eigenes Lemma
  if (r.eigenesLemma.err) {
    html += auAbschnitt('au-eigenes', 'Eigenes Lemma', auFehlerZeile('Die Zahlen zum Eigenen Lemma konnten', r.eigenesLemma.err))
  } else {
    const e = r.eigenesLemma.d
    const werte = auReihe(e.tage, (t) => t.spiele, { marken: true })
    const woche = werte.length !== e.tage.length
    const bonusImZeitraum = freeDaysData.filter((b) => b?.date >= e.zeitraum.von && b?.date <= e.zeitraum.bis).sort((a, b) => a.date.localeCompare(b.date))
    const st = e.nachStufe
    const stufe = (name, x) => `<li class="au-zeile"><span class="au-zeile-name">${esc(name)}</span><span class="au-zeile-werte"><b>${esc(auAnzahl(x.konten, 'Konto', 'Konten'))}</b> · ${esc(auAnzahl(x.spiele, 'Spiel', 'Spiele'))} · ${DURCHSCHNITT_HTML}${esc(auDezimal(x.konten ? x.spiele / x.konten : 0))} je Konto</span><span class="au-zeile-bild"></span></li>`
    const titel = woche ? 'Spiele mit eigenem Lemma pro Woche' : 'Spiele mit eigenem Lemma pro Tag'
    html += auAbschnitt('au-eigenes', 'Eigenes Lemma', auZahlenHtml([
      { label: 'Spiele', wert: auZahl(e.spiele), zusatz: 'mit eigenem Lemma' },
      { label: 'Konten', wert: auZahl(e.konten), zusatz: 'haben es gespielt' },
      { label: 'Heute', wert: auZahl(e.heute.spiele), zusatz: `Spiele von ${auAnzahl(e.heute.konten, 'Konto', 'Konten')}` },
    ])
      + (e.spiele
        ? auDiagrammHtml('au-d-eigenes', werte, {
          titel,
          labelId: 'au-eigenes-titel',
          spanne: auSpanneKurz(e.zeitraum),
          schritt: woche ? 'woche' : 'tag',
          einheit: (n) => auAnzahl(n, 'Spiel', 'Spiele'),
          zusatz: (w) => {
            const b = !woche && auBonusAm(w.key)
            return b ? `Bonus-Tag +${b.bonus}${b.label ? ` (${b.label})` : ''}` : w.marke ? 'mit Bonus-Tag' : ''
          },
          legende: [...(werte.some((w) => w.teil && w.wert > 0) ? [auLegendeTeil(woche)] : []), ...(werte.some((w) => w.marke) ? [AU_LEGENDE_BONUS] : [])],
          tabelle: {
            titel: 'Spiele mit eigenem Lemma',
            spalten: woche ? ['Woche', 'Spiele', 'Bonus-Tag'] : ['Tag', 'Spiele', 'Konten', 'Bonus-Tag'],
            zeilen: woche
              ? werte.map((w) => [w.lang, auZahl(w.wert), w.marke ? 'ja' : ''])
              : e.tage.map((t) => [datumKurz(t.datum), auZahl(t.spiele), auZahl(t.konten), auBonusAm(t.datum) ? `+${auBonusAm(t.datum).bonus}` : '']),
          },
        })
        : '<p class="tag-abschnitt-text">Im Zeitraum wurde kein eigenes Lemma gespielt.</p>')
      + `<ul class="au-zeilen">${stufe('Basiszugang', st.basiszugang)}${stufe('Gesamtausgabe', st.gesamtausgabe)}</ul>`
      + `<p class="au-hinweis">Basiszugang: ein Spiel am Tag, an Bonus-Tagen mehr${bonusImZeitraum.length ? ` (im Zeitraum: ${bonusImZeitraum.map((b) => `${datumKurz(b.date)} +${Number(b.bonus_count) || 0}`).join(', ')})` : ''}. <a class="adm-link" href="#werkzeuge/bonus-tage">Bonus-Tage</a></p>`)
  }

  // Aktive Konten und Wiederkehr
  if (r.aktivitaet.err) {
    html += auAbschnitt('au-aktiv', 'Aktive Konten und Wiederkehr', auFehlerZeile('Die aktiven Konten konnten', r.aktivitaet.err))
  } else {
    const a = r.aktivitaet.d
    const w = a.wiederkehr
    const wieder = w.anteil != null
      ? { label: 'Wiederkehr', wert: `${Math.round(w.anteil * 100)}${NBSP}%`, zusatz: `${auZahl(w.wieder)} von ${auAnzahl(w.kohorte, 'neuen Konto', 'neuen Konten')}` }
      : {
        label: 'Wiederkehr',
        wert: '–',
        leer: true,
        ton: w.kohorte ? 'warn' : '',
        zusatz: w.kohorte
          ? `nur ${auAnzahl(w.kohorte, 'neues Konto', 'neue Konten')} – zu wenige für einen Anteil (ab ${w.mindestens})`
          : (tage < 14 ? 'braucht mindestens 14 Tage Zeitraum' : 'keine neuen Konten'),
      }
    html += auAbschnitt('au-aktiv', 'Aktive Konten und Wiederkehr', auZahlenHtml([
      { label: 'Heute', wert: auZahl(a.aktiv.heute), zusatz: 'Konten haben gespielt' },
      { label: '7 Tage', wert: auZahl(a.aktiv.tage7), zusatz: 'Konten' },
      { label: '30 Tage', wert: auZahl(a.aktiv.tage30), zusatz: 'Konten' },
      wieder,
    ])
      + `<p class="au-hinweis">Aktive Konten zählen immer für heute, die letzten 7 und die letzten 30 Tage – unabhängig vom gewählten Zeitraum. Gezählt wird nur, wer angemeldet spielt${a.mitKontoAnteil != null ? ` (${Math.round(a.mitKontoAnteil * 100)}${NBSP}% der Spiele${a.mitKontoVerdichtetBis ? ` ab ${datumDe(auKontoAb(a.mitKontoVerdichtetBis))}, davor sind Konten nicht mehr erkennbar` : ''})` : ''}.</p>`
      + (w.von && w.bis && w.von <= w.bis
        ? `<p class="au-hinweis">Wiederkehr: Anteil der Konten, die zwischen ${esc(kurzTag(w.von))} und ${esc(kurzTag(w.bis))} angelegt wurden und in ihrer zweiten Woche (7. bis 13. Tag nach der Anmeldung) wieder gespielt haben.</p>`
        : ''))
  }
  host.innerHTML = html
  auZeichneAlle()
}

// ── Klassenraum ──
function renderAuswertungKlassenraum(k) {
  const host = document.getElementById('au-inhalt-classroom')
  if (!host) return
  document.getElementById('au-umfang-classroom').textContent = auUmfangText(k.zeitraum, k.zeitraum.stand)
  auVergissDiagramme('classroom')
  const s = k.sitzungen
  if (!s.gesamt) {
    host.innerHTML = auLeerHtml('Im Zeitraum gab es keine Sitzungen.', 'Sobald eine Lehrkraft eine Sitzung anlegt, steht sie hier.')
    return
  }
  const lk = k.lehrkraefte
  const beendet = s.ende.alleGespielt + s.ende.lehrkraft + s.ende.automatisch
  let html = auZahlenHtml([
    { label: 'Sitzungen', wert: auZahl(s.gesamt), zusatz: `${auZahl(beendet)} beendet` },
    lk.verfuegbar
      ? { label: 'Lehrkräfte', wert: auZahl(lk.anzahl), zusatz: 'mit Sitzungen' }
      : { label: 'Lehrkräfte', wert: '–', leer: true, zusatz: 'nur für bis zu 30 Tage' },
    { label: 'Teilnehmer', wertHtml: k.teilnehmer.schnitt != null ? `${DURCHSCHNITT_HTML}${esc(auDezimal(k.teilnehmer.schnitt))}` : '–', leer: k.teilnehmer.schnitt == null, zusatz: 'je gestartete Sitzung' },
    { label: 'Antworten', wert: auZahl(k.antworten.gesamt), zusatz: k.antworten.gesamt ? `${auProzent(k.antworten.richtig, k.antworten.gesamt)} richtig` : 'keine Antworten' },
  ])

  const werte = auReihe(s.tage, (t) => t.sitzungen, { stand: k.zeitraum.stand })
  const woche = werte.length !== s.tage.length
  const titel = woche ? 'Sitzungen pro Woche' : 'Sitzungen pro Tag'
  html += auAbschnitt('au-kr-verlauf', titel, auDiagrammHtml('au-d-sitzungen', werte, {
    titel,
    labelId: 'au-kr-verlauf-titel',
    spanne: auSpanneKurz(k.zeitraum),
    schritt: woche ? 'woche' : 'tag',
    einheit: (n) => auAnzahl(n, 'Sitzung', 'Sitzungen'),
    legende: werte.some((w) => w.teil && w.wert > 0) ? [auLegendeTeil(woche)] : [],
    tabelle: { titel: 'Sitzungen', spalten: [woche ? 'Woche' : 'Tag', 'Sitzungen'], zeilen: werte.map((w) => [w.lang, auZahl(w.wert)]) },
  }))

  const modusZeilen = k.nachModus.map((x) => {
    const m = MODI.find((y) => y.key === x.modus)
    return m
      ? `<li class="au-zeile"><span class="au-zeile-name">${auBadge(m)}</span><span class="au-zeile-werte"><b>${esc(auAnzahl(x.aufgaben, 'Aufgabe', 'Aufgaben'))}</b> · ${esc(auAnzahl(x.antworten, 'Antwort', 'Antworten'))} · ${esc(auProzent(x.richtig, x.antworten))} richtig</span><span class="au-zeile-bild"></span></li>`
      : ''
  }).join('')
  html += auAbschnitt('au-kr-modi', 'Nach Spielmodus', modusZeilen
    ? `<ul class="au-zeilen">${modusZeilen}</ul><p class="au-hinweis">Aufgaben: die Aufgaben einer Sitzung, zu denen mindestens eine Antwort einging.</p>`
    : '<p class="tag-abschnitt-text">Im Zeitraum gingen keine Antworten ein.</p>')

  html += auAbschnitt('au-kr-ende', 'Wie Sitzungen enden', '<dl class="tag-dl">'
    + `<div><dt>Alles gespielt</dt><dd>${esc(auAnzahl(s.ende.alleGespielt, 'Sitzung', 'Sitzungen'))}</dd></div>`
    + `<div><dt>Lehrkraft beendet</dt><dd>${esc(auAnzahl(s.ende.lehrkraft, 'Sitzung', 'Sitzungen'))}</dd></div>`
    + `<div><dt>Automatisch</dt><dd>${esc(auAnzahl(s.ende.automatisch, 'Sitzung', 'Sitzungen'))} <span class="be-zusatz">nach 90 Minuten ohne Aktivität</span></dd></div>`
    + `<div><dt>Noch offen</dt><dd>${esc(auAnzahl(s.ende.offen, 'Sitzung', 'Sitzungen'))} <span class="be-zusatz">im Warteraum oder läuft</span></dd></div></dl>`)

  let lkHtml
  if (!lk.verfuegbar) {
    lkHtml = '<p class="tag-abschnitt-text">Wer welche Sitzung angelegt hat, wird nach 30 Tagen gelöscht. Für längere Zeiträume gibt es deshalb keine Zahlen zu Lehrkräften.</p>'
  } else if (!lk.gruppen) {
    lkHtml = `<p class="tag-abschnitt-text">${esc(auAnzahl(lk.anzahl, 'Lehrkraft', 'Lehrkräfte'))} im Zeitraum. Die Verteilung erscheint erst ab 5 Lehrkräften, damit sich keine einzelne Person ablesen lässt.</p>`
  } else {
    lkHtml = '<p class="tag-abschnitt-text">Wie viele Sitzungen eine Lehrkraft im Zeitraum angelegt hat.</p><dl class="tag-dl">'
      + `<div><dt>1 bis 5 Sitzungen</dt><dd>${esc(auAnzahl(lk.gruppen['1-5'], 'Lehrkraft', 'Lehrkräfte'))}</dd></div>`
      + `<div><dt>6 bis 20 Sitzungen</dt><dd>${esc(auAnzahl(lk.gruppen['6-20'], 'Lehrkraft', 'Lehrkräfte'))}</dd></div>`
      + `<div><dt>Mehr als 20</dt><dd>${esc(auAnzahl(lk.gruppen['21+'], 'Lehrkraft', 'Lehrkräfte'))}</dd></div></dl>`
  }
  html += auAbschnitt('au-kr-lk', 'Lehrkräfte', lkHtml)

  const t = k.teilnehmer
  html += auAbschnitt('au-kr-verbindung', 'Verbindungen', '<dl class="tag-dl">'
    + `<div><dt>Beitritte</dt><dd>${esc(auZahl(t.beitritte))} <span class="be-zusatz">mit Zugangscode</span></dd></div>`
    + `<div><dt>Wieder verbunden</dt><dd>${esc(auZahl(t.wiederverbunden))} <span class="be-zusatz">${esc(t.beitritte ? `${auProzent(t.wiederverbunden, t.beitritte)} der Beitritte` : 'keine Beitritte')}</span></dd></div>`
    + `<div><dt>Verbindung verloren</dt><dd>${esc(auZahl(t.verloren))} <span class="be-zusatz">nicht zurückgekehrt</span></dd></div></dl>`)
  host.innerHTML = html
  auZeichneAlle()
}

// ── Laden, Zustand ──
function auVergissDiagramme(seite) {
  for (const id of AU_DIAGRAMME_JE_SEITE[seite] || []) { auDiagramme.delete(id); auVielfache.delete(id) }
}

function auMeldung(seite, text, ton, html = false) {
  setMeldung(`au-meldung-${seite}`, text, ton, { html })
}

// frisch: Der Server übergeht seinen Zwischenspeicher (nur Spiele und aktive Konten haben einen) – „neu laden“ im Kopf
function auAbfragen(seite, tage, { frisch = false } = {}) {
  const frischParam = frisch ? '&frisch=1' : ''
  if (seite === 'stats') return holeJson(`/admin/auswertung/spiele?days=${tage}${frischParam}`)
  if (seite === 'classroom') return holeJson(`/admin/classroom/stats?days=${tage}`)
  // Kennzahlen: drei Abschnitte, einer darf scheitern, ohne die anderen mitzunehmen
  return Promise.all([
    `/admin/payments/summary?days=${tage}`,
    `/admin/custom-lemma/summary?days=${tage}`,
    `/admin/stats/retention?days=${tage}${frischParam}`,
  ].map((url) => holeJson(url).then((d) => ({ d }), (err) => ({ err }))))
    .then(([zahlungen, eigenesLemma, aktivitaet]) => {
      if ([zahlungen, eigenesLemma, aktivitaet].every((t) => t.err)) throw zahlungen.err
      return { zahlungen, eigenesLemma, aktivitaet }
    })
}

function auZeichneSeite(seite, tage, daten) {
  if (seite === 'stats') renderAuswertungSpiele(daten)
  else if (seite === 'metrics') renderAuswertungKennzahlen(daten, tage)
  else renderAuswertungKlassenraum(daten)
  auDaten[seite] = { tage, daten }
}

// Bonus-Tage kommen mit eigener Anfrage: Trifft sie nach den Kennzahlen ein, wird die Seite mit ihnen neu gezeichnet
let auBonusStand = ''   // Stand der Bonus-Tage (JSON), mit dem die Kennzahlen zuletzt gezeichnet wurden
function auBonusNachgeladen() {
  if (currentRoute?.page !== 'metrics' || !auDaten.metrics) return // andere Seiten zeichnen beim Öffnen ohnehin neu
  if (auBonusStand === JSON.stringify(freeDaysData)) return
  auZeichneSeite('metrics', auDaten.metrics.tage, auDaten.metrics.daten)
}

// Abschnitte der Kennzahlen, die einzeln scheitern können (Name für die Ansage)
const AU_ABSCHNITTE = Object.freeze({ zahlungen: 'Zahlungen', eigenesLemma: 'Eigenes Lemma', aktivitaet: 'Aktive Konten' })
let auAnsageTimer = 0

// Sagt per Sprachausgabe an, dass (neue) Zahlen da sind – auch aus dem Zwischenspeicher und bei Teilfehlern
function auAnsage(seite, tage, daten) {
  const live = document.getElementById('au-live')
  if (!live) return
  let text = `${AU_ZEITRAEUME[tage]} geladen.`
  if (seite === 'metrics') {
    const fehlt = Object.keys(AU_ABSCHNITTE).filter((k) => daten?.[k]?.err).map((k) => AU_ABSCHNITTE[k])
    if (fehlt.length) text = `${AU_ZEITRAEUME[tage]} geladen, ${aufzaehlung(fehlt)} ${fehlt.length === 1 && fehlt[0] === 'Eigenes Lemma' ? 'fehlt' : 'fehlen'}.`
  }
  // Erst leeren: Derselbe Text zweimal hintereinander (Zeitraum hin und zurück) würde sonst nicht vorgelesen
  live.textContent = ''
  window.clearTimeout(auAnsageTimer)
  auAnsageTimer = window.setTimeout(() => { live.textContent = text }, 60)
}

async function ladeAuswertung(seite, { neu = false } = {}) {
  if (!Object.hasOwn(AU_REITER, seite)) return
  const nr = ++auNr[seite]
  const tage = auswertungZeitraum
  const inhalt = document.getElementById(`au-inhalt-${seite}`)
  if (!inhalt) return
  const key = `${seite}|${tage}`
  const hit = auGeladen.get(key)
  if (!neu && hit && Date.now() - hit.ts < AU_CACHE_MS) {
    auZeichneSeite(seite, tage, hit.daten)
    inhalt.removeAttribute('aria-busy')
    auMeldung(seite, '')
    auAnsage(seite, tage, hit.daten)
    return
  }
  const hatInhalt = inhalt.childElementCount > 0
  if (hatInhalt) inhalt.setAttribute('aria-busy', 'true')
  auMeldung(seite, hatInhalt ? 'Wird neu geladen …' : 'Zahlen werden geladen …', 'loading')
  try {
    const daten = await auAbfragen(seite, tage, { frisch: neu })
    if (nr !== auNr[seite]) return // eine neuere Anfrage ist unterwegs oder fertig
    auZeichneSeite(seite, tage, daten)
    // Nur vollständige Antworten merken: Ein gescheiterter Abschnitt soll beim nächsten Öffnen neu geladen werden
    const vollstaendig = seite !== 'metrics' || Object.keys(AU_ABSCHNITTE).every((k) => !daten[k].err)
    if (vollstaendig) auGeladen.set(key, { ts: Date.now(), daten })
    else auGeladen.delete(key)
    auMeldung(seite, '')
    auAnsage(seite, tage, daten)
  } catch (err) {
    if (nr !== auNr[seite]) return
    auMeldung(seite, `Die Zahlen konnten nicht geladen werden (${esc(auFehlerText(err))}). <button type="button" class="adm-link" data-action="au-neu-laden">Erneut versuchen</button>`, 'error', true)
  } finally {
    if (nr === auNr[seite]) inhalt.removeAttribute('aria-busy')
  }
}

// Zeitraum aus der Adresse übernehmen: Auswahl, CSV-Link und Reiter-Links zeigen ihn
function synchronisiereAuswertungZeitraum(tage) {
  auswertungZeitraum = tage
  document.querySelectorAll('[data-au-zeitraum]').forEach((sel) => { sel.value = String(tage) })
  const export_ = document.getElementById('au-export-stats')
  if (export_) export_.setAttribute('href', `/admin/stats/export?days=${tage}&format=csv`)
  for (const tab of AREA_TABS.auswertung) reiterMerker[tab.key] = auswertungHash(tab.key, tage)
}

// Auswahl geändert: Adresse ohne Verlaufseintrag nachziehen, neu laden. Der Fokus bleibt in der Auswahl.
function waehleAuswertungZeitraum(tage) {
  if (!Object.hasOwn(AU_ZEITRAEUME, tage) || currentRoute?.area !== 'auswertung') return
  synchronisiereAuswertungZeitraum(tage)
  const reiter = AU_REITER[currentRoute.page]
  replaceRouteHashSilently(auswertungHash(reiter, tage))
  document.querySelectorAll('#page-tabs a.adm-tab').forEach((a, i) => {
    const tab = AREA_TABS.auswertung[i]
    if (tab) a.setAttribute('href', reiterMerker[tab.key])
  })
  void ladeAuswertung(currentRoute.page)
}

// Pfeiltasten auf der geschlossenen Auswahl lösen bei jedem Schritt „change“ aus. Geladen wird erst, wenn 400 ms
// nichts mehr geändert wurde – sonst wäre mit ein paar Tastendrücken das Admin-Limit (60 Anfragen/Minute) erreicht.
const AU_ZEITRAUM_WARTEZEIT_MS = 400
let auZeitraumTimer = 0
function planeAuswertungZeitraum(tage) {
  window.clearTimeout(auZeitraumTimer)
  auZeitraumTimer = window.setTimeout(() => waehleAuswertungZeitraum(tage), AU_ZEITRAUM_WARTEZEIT_MS)
}

// ── Bedienung der Diagramme: Zeiger, Antippen und Pfeiltasten wählen eine Säule ──
function auIndexAusZeiger(plot, ev) {
  const r = plot.getBoundingClientRect()
  const x = ev.clientX - r.left - Number(plot.dataset.links)
  const n = auDiagramme.get(plot.id).werte.length
  return Math.max(0, Math.min(n - 1, Math.floor(x / Number(plot.dataset.schritt))))
}

document.addEventListener('pointermove', (ev) => {
  const plot = ev.target.closest?.('.au-plot')
  if (!plot || ev.pointerType === 'touch' || !auDiagramme.has(plot.id)) return
  const i = auIndexAusZeiger(plot, ev)
  // Zeigerbewegung ändert nur die Anzeige (stumm): Die Sprachausgabe sagt dabei nichts an
  if (auDiagramme.get(plot.id).gewaehlt !== i) auWaehle(plot.id, i, { stumm: true })
})

document.addEventListener('pointerdown', (ev) => {
  const plot = ev.target.closest?.('.au-plot')
  if (plot && auDiagramme.has(plot.id)) auWaehle(plot.id, auIndexAusZeiger(plot, ev))
})

// Zeiger verlässt das Diagramm: zurück zur Auswahl per Tastatur/Antippen, sonst zum letzten vollen Tag – ohne Ansage
document.addEventListener('pointerout', (ev) => {
  const plot = ev.target.closest?.('.au-plot')
  if (plot && auDiagramme.has(plot.id) && !plot.contains(ev.relatedTarget) && ev.pointerType !== 'touch') auWaehle(plot.id, auDiagramme.get(plot.id).gesetzt ?? null, { stumm: true })
})

document.addEventListener('focusout', (ev) => {
  if (ev.target.classList?.contains('au-plot') && auDiagramme.has(ev.target.id)) auWaehle(ev.target.id, null)
})

document.addEventListener('keydown', (ev) => {
  const plot = ev.target.closest?.('.au-plot')
  if (!plot || !auDiagramme.has(plot.id) || ev.ctrlKey || ev.metaKey || ev.altKey) return
  const d = auDiagramme.get(plot.id)
  const n = d.werte.length
  // Ausgangspunkt ist der Wert, den die Ablesezeile als „Zuletzt …“ zeigt (der letzte volle Tag), nicht der laufende Tag
  const zuletzt = d.werte.findLastIndex((w) => !w.teil)
  const jetzt = d.gewaehlt ?? (zuletzt >= 0 ? zuletzt : n - 1)
  const ziel = { ArrowLeft: jetzt - 1, ArrowRight: jetzt + 1, Home: 0, End: n - 1, PageUp: jetzt - 7, PageDown: jetzt + 7 }[ev.key]
  if (ziel == null) return
  ev.preventDefault()
  auWaehle(plot.id, Math.max(0, Math.min(n - 1, ziel)))
})

// Gezeichnet wird mit der gemessenen Breite, deshalb bleibt die Schrift im SVG 11 px groß
;(function installiereAuswertungBeobachter() {
  const main = document.getElementById('adm-main')
  const live = document.createElement('p')
  live.id = 'au-live'
  live.className = 'adm-visually-hidden'
  live.setAttribute('aria-live', 'polite')
  document.body.appendChild(live)
  if (!main || typeof ResizeObserver === 'undefined') return
  let frame = 0
  new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (currentRoute?.area === 'auswertung') auZeichneAlle() })
  }).observe(main)
})()

function handleDocumentChange(event) {
  const target = event.target
  if (target.closest?.('#so-ed')) return void socialAenderung(event)
  if (target.id === 'backup-restore-input') return void waehleRestoreDatei(target.files?.[0])
  if (target.id === 'restore-verstanden') return void aktualisiereRestoreKnopf()
  if (target.id === 'entry-sort') return void aendereListe({ zeit: target.value, seite: 1 })
  if (target.id === 'entry-mode-filter') return void aendereListe({ stand: target.value, seite: 1 })
  if (target.id === 'entry-page-size') return void aendereListe({ pro: Number(target.value) || LISTE_STANDARD.pro, seite: 1 })
  if (target.id === 'entry-select-page') return void selectEntriesOnPage(target.checked)
  if (target.matches('[data-au-zeitraum]')) return void planeAuswertungZeitraum(Number(target.value))
  if (target.id === 'users-role-filter') return void loadUsersOverview()
  if (target.id === 'users-select-all') return void waehleAlleNutzer(target.checked)
  if (target.matches('.user-select-checkbox')) return void waehleNutzer(target.dataset.userId || '', target.checked)
  if (target.id === 'user-detail-role') return void aktualisiereRollenKnopf()
  if (target.id === 'freeday-date') return void pruefeBonusDatum()
  if (target.id === 'sw-woche') return void pruefeSwWoche()
  if (target.id === 'push-dialog-ok') return void pushDialogHaekchen()
  if (target.dataset.vorlage && target.type === 'checkbox') return void vorlageGeaendert(target)
  if (target.dataset.action === 'toggle-entry-selection') return void toggleEntrySelection(target.dataset.datum || '', target.checked)
  if (target.id === 'audit-action' || target.id === 'audit-resource' || target.id === 'audit-status' || target.id === 'audit-from' || target.id === 'audit-to') return void protokollNeuLaden()
}

function handleDocumentInput(event) {
  const target = event.target
  if (target.closest?.('#page-social, #page-social-editor')) return void socialEingabe(event)
  if (target.id === 'entry-search') return void scheduleEntryTableRender()
  if (target.id === 'users-search') return void scheduleUsersOverviewLoad()
  if (target.id === 'audit-search') return void planeProtokollSuche()
  if (target.id === 'push-send-title' || target.id === 'push-send-body') {
    target.removeAttribute('aria-invalid')
    renderPushFormular()
    return void setMeldung('push-send-msg', '')
  }
  if (target.closest?.('.in-pruef')) entmarkiereFeld(target.id)
  // Wort der Woche: Der Fehler am Feld verschwindet, sobald das Feld geändert wird
  if (target.getAttribute?.('aria-invalid') === 'true' && target.closest?.('#sw-form')) setzeFeldFehlerStatisch(target.id, '')
  if (target.dataset.vorlage) return void vorlageGeaendert(target)
  if (target.closest?.('#demo-form')) return void aktualisiereDemoZaehler()
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

  // Bei offener Rückfrage gilt keine Tastenkürzel-Aktion (Speichern, Monatsraster …): Sie hat den Vorrang.
  // Strg/⌘ + S speichert nicht, öffnet aber auch nicht „Seite speichern“ des Browsers.
  if (bestaetigeDialog?.open) {
    if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 's' && currentRoute?.page === 'entry') event.preventDefault()
    return
  }

  // Strg/⌘ + S speichert den Tag (Redakteursgewohnheit); saveTag ignoriert gesperrte Zustände.
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && String(event.key || '').toLowerCase() === 's' && currentRoute?.page === 'entry') {
    event.preventDefault()
    void saveTag()
    return
  }

  // Monatsraster: Pfeiltasten als Abkürzung (alle Tage bleiben per Tab erreichbar, kein Roving-Tabindex)
  if (target.matches('.mo-tag') && MONAT_TASTEN.includes(event.key)) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    monatTaste(event.key, target)
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

// ── Werkzeuge › Social Cards ──────────────────────────────
// Zwei Unterseiten: „Entwürfe“ (#werkzeuge/social-cards) prüft, ändert und gibt die automatisch angelegten Entwürfe
// für Bluesky frei; „Selbst gestalten“ (#werkzeuge/social-cards/gestalten?datum=…&vorlage=…) zeichnet eine einzelne Karte
// zum Herunterladen. Veröffentlicht wird nichts: Freigegebene Beiträge postet man selbst.
// Das Zeichenmodul (shared/socialCards.js, dieselbe Datei zeichnet auf dem Server die Entwurfsbilder) wird erst auf diesen
// Seiten per import() geladen. Die Bilder der Entwürfe kommen vom Server (kleine Vorschau, volles Bild auf Klick).

const SO_SLOT_LABEL = {
  T: 'Teaser',
  A: 'Rätsel',
  'A-aufloesung': 'Rätsel – Auflösung',
  X: 'Zitat',
  B: 'Beleg',
  'B-aufloesung': 'Beleg – Auflösung',
  TB: 'Textbeleg',
  'TB-aufloesung': 'Textbeleg – Auflösung',
  E: 'Eigener Beitrag',
  'E-aufloesung': 'Eigener Beitrag – Auflösung',
}
// Plätze mit Auflösung am Folgetag; Rätsel/Beleg und ihre Auflösung gehören zusammen
const SO_MIT_AUFLOESUNG = new Set(['A', 'B', 'TB', 'E'])
const SO_BASIS_MIT_ARTIKEL = { A: 'das Rätsel', B: 'der Beleg', TB: 'der Textbeleg', E: 'der eigene Beitrag' }
const soIstAufloesung = (slot) => String(slot).endsWith('-aufloesung')
const soBasis = (slot) => String(slot).replace('-aufloesung', '')
const soEl = (id) => document.getElementById(id)
const soWert = (id) => soEl(id)?.value ?? ''
const soRadio = (name) => document.querySelector(`input[name="${CSS.escape(name)}"]:checked`)?.value
const soZahlDe = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// ── Zeichenmodul ──
let kartenModul = null
let kartenLaden = null
function ladeKarten() {
  // Bei einem Fehler (z. B. abgelaufene Sitzung) beim nächsten Öffnen neu versuchen
  kartenLaden ??= import('/admin/social-cards/karten.js')
    .then((m) => { kartenModul = m; return m })
    .catch((err) => { kartenLaden = null; throw err })
  return kartenLaden
}

// Der Import verrät den Grund nicht: Ein zweiter Abruf nennt den Statuscode (401 = Sitzung abgelaufen).
async function zeigeKartenFehler(meldungId = 'so-ed-meldung') {
  let grund = 'keine Verbindung'
  try {
    const res = await fetch('/admin/social-cards/karten.js')
    grund = res.status === 401 ? 'HTTP 401 – Sitzung abgelaufen?' : `HTTP ${res.status}`
  } catch { /* Verbindung weg: Standardtext */ }
  setMeldung(meldungId, `Das Zeichenmodul konnte nicht geladen werden (${esc(grund)}). <button type="button" class="adm-link" data-action="so-ed-seite-neu">Seite neu laden</button>`, 'error', { html: true })
}

function soOptionen(sel, liste, gewaehlt) {
  sel.replaceChildren(...liste.map(([v, t]) => {
    const o = document.createElement('option')
    o.value = v
    o.textContent = t
    return o
  }))
  if (gewaehlt !== undefined && liste.some(([v]) => v === gewaehlt)) sel.value = gewaehlt
}

// Zufällige Reihenfolge von 0 … n-1. `ausser`: Diese Reihenfolge kommt nicht noch einmal heraus (sonst wirkt
// „neu mischen“ wie ein Knopf ohne Wirkung); bei n < 2 gibt es keine andere.
function soMische(n, ausser = null) {
  const gleich = (a) => ausser && ausser.length === a.length && a.every((v, i) => v === ausser[i])
  let a
  do {
    a = [...Array(n).keys()]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
  } while (n > 1 && gleich(a))
  return a
}

// ════════════════ Entwürfe ════════════════

let socialEntwuerfe = []
let socialUmfang = null            // { von, bis, automatisch, horizont, aufbewahrung } aus der letzten Antwort
let socialGeladen = false
let socialLadeToken = 0
let socialAnlegenLaeuft = false
let socialMarkiert = null
const socialUngespeichert = new Map()   // id → Text, den man getippt, aber noch nicht gespeichert hat
const socialLaeuft = new Set()          // ids mit laufender Anfrage
// Jede lokale Änderung (Freigabe, Text, Neu erstellen) zählt hoch. Eine Listenantwort, die VOR einer solchen Änderung
// losgeschickt wurde, ist älter als der lokale Stand und darf ihn nicht überschreiben.
let socialAenderungen = 0
const socialLokal = new Map()           // id → { zaehler, entwurf } der lokal zuletzt geänderten Entwürfe

// Beim Abmelden: Entwürfe und ungespeicherte Texte aus dem Speicher
function socialZuruecksetzen() {
  socialEntwuerfe = []
  socialUmfang = null
  socialGeladen = false
  socialLadeToken++
  socialAnlegenLaeuft = false
  socialMarkiert = null
  socialUngespeichert.clear()
  socialLaeuft.clear()
  socialLokal.clear()
  soEd.bereit = false
  setzeStand('wz-stand-social', '')
}

const socialFinde = (id) => socialEntwuerfe.find((e) => e.id === Number(id))
const socialHeute = () => socialUmfang?.von || berlinTeile(getCurrentDate()).iso

function socialSpanne(a, b) {
  const x = datumTeile(a)
  const y = datumTeile(b)
  return x.m === y.m ? `${x.d}.–${y.d}. ${MONTHS_DE[y.m - 1]}` : `${x.d}. ${MONTHS_DE[x.m - 1]} – ${y.d}. ${MONTHS_DE[y.m - 1]}`
}

// Zeichenzahl wie Bluesky (Grapheme, Text + Leerzeile + Hashtags); ohne Zeichenmodul eine grobe Zählung
const socialMax = () => kartenModul?.BLUESKY_MAX_ZEICHEN ?? 300
const socialZaehlen = (text) => (kartenModul ? kartenModul.zeichenZahl(text) : [...text].length)
const socialPostText = (e, text) => (e.hashtags ? `${text.trim()}\n\n${e.hashtags}` : text.trim())

function socialZaehler(e, text) {
  const n = socialZaehlen(socialPostText(e, text))
  const max = socialMax()
  const zuviel = n - max
  return {
    n,
    zuviel,
    text: zuviel > 0 ? `${n} von ${max} Zeichen – ${zuviel} zu viel` : `${n} von ${max} Zeichen${e.hashtags ? ' mit Hashtags' : ''}`,
    tone: zuviel > 0 ? 'error' : '',
  }
}

// Gegenstück eines Rätsels/Belegs: { datum, slot } oder null (Teaser und Zitat haben keins)
function socialPartnerInfo(e) {
  const basis = soBasis(e.slot)
  if (!SO_MIT_AUFLOESUNG.has(basis)) return null
  return soIstAufloesung(e.slot)
    ? { datum: addTageIso(e.datum, -1), slot: basis }
    : { datum: addTageIso(e.datum, 1), slot: `${basis}-aufloesung` }
}

function socialPartner(e) {
  const p = socialPartnerInfo(e)
  return p ? socialEntwuerfe.find((x) => x.datum === p.datum && x.slot === p.slot) || null : null
}

// Warum „Neu erstellen“ gerade nicht geht (leer = geht)
function socialNeuGrund(e) {
  const p = socialPartner(e)
  if (!p || p.status === 'offen') return ''
  return `${SO_SLOT_LABEL[soBasis(e.slot)]} und Auflösung gehören zusammen und lassen sich nur gemeinsam neu erstellen. ${SO_SLOT_LABEL[p.slot]} (${datumKurz(p.datum)}) ist ${p.status} – erst wieder öffnen.`
}

function socialMeta(e) {
  const istText = e.spec?.format === 'text'
  const art = istText ? 'nur Text' : `Bild ${e.spec?.ratio === '9:16' ? '9 : 16' : '4 : 5'}`
  if (soIstAufloesung(e.slot)) {
    const basis = soBasis(e.slot)
    const was = basis === 'TB' ? 'den Textbeleg' : basis === 'B' ? 'den Beleg' : basis === 'E' ? 'den eigenen Beitrag' : 'das Rätsel'
    return `${art} · Antwort auf ${was} vom ${datumKurz(addTageIso(e.datum, -1))}`
  }
  if (e.slot === 'T') return `${art} · Wörter des Tages`
  if (e.slot === 'E') return `${art} · ${SO_KARTENART[e.spec?.format] || 'Karte'} aus „Selbst gestalten“`
  const wort = e.spec?.meta?.lemma || e.spec?.data?.xLemma || ''
  return `${art}${wort ? ` · Wort vom Vortag: ${wort}` : ''}`
}

function socialEntwurfHtml(e) {
  const id = Number(e.id)
  const label = SO_SLOT_LABEL[e.slot] || e.slot
  const name = `${label}, ${datumKurz(e.datum)}`
  // Jeder Knopf trägt den Entwurf im Namen: Sonst stünde „Freigeben“ 16-mal gleich in der Liste der Knöpfe
  const vh = `<span class="adm-visually-hidden">: ${esc(name)}</span>`
  const statusText = e.gepostet ? 'veröffentlicht' : e.status
  const kopf = (extra = '') => `<p class="so-kopf"><span class="so-slot">${esc(label)}</span><span class="so-status">${esc(statusText)}</span>${extra}<span class="so-meta">${esc(socialMeta(e))}</span></p>`
  const meldung = `<p class="li-meldung" id="so-e-${id}-meldung" role="status" aria-live="polite" tabindex="-1"></p>`

  if (e.status === 'verworfen') {
    return `<li class="so-entwurf${socialMarkiert === id ? ' is-markiert' : ''}" data-status="verworfen" id="so-e-${id}">${kopf()}`
      + `<div class="so-inhalt"><p class="so-auszug">${esc(String(e.caption).split('\n')[0])}</p>`
      + `<div class="be-aktionen so-aktionen"><button type="button" class="adm-link" data-action="so-oeffnen" data-id="${id}">Wieder öffnen${vh}</button></div>${meldung}</div></li>`
  }

  const offen = e.status === 'offen'
  const text = socialUngespeichert.get(id) ?? e.caption
  const z = socialZaehler(e, text)
  const istText = e.spec?.format === 'text'
  const laden = istText || !e.bildUrl ? '' : `<a class="adm-link" href="${esc(`${e.bildUrl}&download`)}" download>Bild herunterladen${vh}</a>`
  const neuGesperrt = offen && !!socialNeuGrund(e)
  const aktionen = offen
    ? `<button type="button" class="adm-cta" data-action="so-freigeben" data-id="${id}"${z.zuviel > 0 ? ' aria-disabled="true"' : ''}>Freigeben${vh} <span aria-hidden="true">→</span></button>`
      + `<button type="button" class="adm-link" data-action="so-speichern" data-id="${id}"${socialUngespeichert.has(id) ? '' : ' hidden'}>Text speichern${vh}</button>`
      + `<button type="button" class="adm-link" data-action="so-kopieren" data-id="${id}">Text kopieren${vh}</button>`
      + laden
      + (soBasis(e.slot) === 'E' ? '' : `<button type="button" class="adm-link" data-action="so-neu" data-id="${id}"${neuGesperrt ? ' aria-disabled="true"' : ''}>Neu erstellen …${vh}</button>`)
      + `<button type="button" class="adm-link" data-action="so-verwerfen" data-id="${id}">Verwerfen${vh}</button>`
    : `<button type="button" class="adm-link" data-action="so-kopieren" data-id="${id}">Text kopieren${vh}</button>`
      + laden
      // Was schon auf Bluesky steht, lässt sich hier nicht mehr zurücknehmen – der Server sperrt es auch
      + (e.gepostet?.url
        ? `<a class="adm-link" href="${esc(e.gepostet.url)}" target="_blank" rel="noopener">Auf Bluesky ansehen${vh}</a>`
        : `<button type="button" class="adm-link" data-action="so-oeffnen" data-id="${id}">Wieder öffnen${vh}</button>`)
  // Fehlversuche beim Veröffentlichen (der Job versucht es dreimal, dann kommt ein Alert)
  const postFehler = e.postFehler
    ? `<p class="so-unter" role="note">Veröffentlichen fehlgeschlagen (${esc(String(e.postFehler.versuche))}×): ${esc(e.postFehler.fehler)}</p>`
    : ''

  return `<li class="so-entwurf${socialMarkiert === id ? ' is-markiert' : ''}" data-status="${esc(e.status)}" id="so-e-${id}">`
    + kopf(`<span class="in-geaendert"${socialUngespeichert.has(id) ? '' : ' hidden'}>ungespeichert</span>`)
    + socialBildHtml(e, name)
    + '<div class="so-inhalt">'
    + `<label class="tag-label" for="so-e-${id}-text">Beitragstext<span class="adm-visually-hidden">: ${esc(name)}</span></label>`
    + `<textarea class="tag-eingabe" id="so-e-${id}-text" data-id="${id}" rows="5" spellcheck="true" aria-describedby="so-e-${id}-unter"${z.zuviel > 0 ? ' aria-invalid="true"' : ''}${offen ? '' : ' readonly'}>${esc(text)}</textarea>`
    + `<p class="so-unter" id="so-e-${id}-unter">${e.hashtags ? `<span class="so-tags">Dazu: ${esc(e.hashtags)}</span>` : '<span class="so-tags">ohne Hashtags (Antwort auf den Vortag)</span>'}<span class="in-zaehler"${z.tone ? ` data-tone="${z.tone}"` : ''}>${esc(z.text)}</span></p>`
    + postFehler
    + `<div class="be-aktionen so-aktionen">${aktionen}</div>${meldung}</div></li>`
}

// Kleine Vorschau vom Server; ein Klick öffnet das volle Bild. Textbeiträge haben kein Bild.
function socialBildHtml(e, name) {
  if (e.spec?.format === 'text' || !e.bildUrl) return '<div class="so-bild so-bild--text" aria-hidden="true">ohne Bild</div>'
  const hoehe = e.spec?.ratio === '9:16' ? 768 : 540
  // Der Linkname bleibt „Bild in voller Größe öffnen: …“; was auf der Karte steht, hängt als Beschreibung daran.
  // Fehlt die kleine Fassung (404), fällt das Bild einmal auf die große zurück (data-gross), danach kommt ein Platzhalter.
  const beschreibung = e.spec?.data ? socialEntwurfKartenText(e) : ''
  const beschr = beschreibung ? `<span class="adm-visually-hidden" id="so-e-${e.id}-bildtext">${esc(beschreibung)}</span>` : ''
  const gross = e.bildUrl && e.bildKleinUrl && e.bildKleinUrl !== e.bildUrl ? ` data-gross="${esc(e.bildUrl)}"` : ''
  return `<a class="so-bild" href="${esc(e.bildUrl)}" target="_blank" rel="noopener"${beschreibung ? ` aria-describedby="so-e-${e.id}-bildtext"` : ''}><img src="${esc(e.bildKleinUrl || e.bildUrl)}" alt="Bild in voller Größe öffnen: ${esc(name)}" width="432" height="${hoehe}" loading="lazy" decoding="async"${gross}>${beschr}</a>`
}

function socialZahlenHtml() {
  const z = { offen: 0, freigegeben: 0, verworfen: 0 }
  for (const e of socialEntwuerfe) if (e.status in z) z[e.status]++
  const spanne = socialUmfang ? socialSpanne(socialUmfang.von, socialUmfang.bis) : ''
  return `<strong>${esc(anzahlText(z.offen, 'Entwurf', 'Entwürfe'))} offen</strong> · ${z.freigegeben} freigegeben · ${z.verworfen} verworfen${spanne ? ` · ${esc(spanne)}` : ''}`
}

function socialStandAktualisieren() {
  if (!socialGeladen || !socialEntwuerfe.length) return setzeStand('wz-stand-social', '')
  const offen = socialEntwuerfe.filter((e) => e.status === 'offen').length
  setzeStand('wz-stand-social', `${anzahlText(offen, 'Entwurf', 'Entwürfe')} offen`)
}

function socialAutomatikText() {
  const el = soEl('so-pf-automatik')
  if (!el) return
  const u = socialUmfang
  if (u && !u.automatisch) {
    el.innerHTML = 'Das automatische Anlegen ist abgeschaltet (<code>SOCIAL_CARDS_ENTWUERFE=off</code>). Entwürfe entstehen nur über den Knopf unten.'
    return
  }
  const tage = u?.horizont === 7 || !u ? 'sieben' : String(u.horizont)
  const wochen = !u || u.aufbewahrung === 56 ? 'acht Wochen' : `${u.aufbewahrung} Tagen`
  el.textContent = `Der Server legt jeden Morgen um 4:20 Uhr die fehlenden Entwürfe für die nächsten ${tage} Tage an und zeichnet die Bilder. Was schon da ist, bleibt unverändert – auch verworfene Entwürfe kommen nicht zurück. Nach ${wochen} werden Entwürfe gelöscht. ${socialPostenText(u)}`
}

// Was mit freigegebenen Entwürfen passiert (Hauptschalter SOCIAL_POSTEN in der Server-.env)
function socialPostenText(u) {
  const zeit = u?.postZeit || '18:30'
  if (u?.posten === 'on' && u.blueskyEingerichtet) return `Freigegebene Entwürfe erscheinen am jeweiligen Tag ab ${zeit} Uhr auf Bluesky, Auflösungen als Antwort auf den Beitrag vom Vortag.`
  if (u?.posten === 'on') return 'Veröffentlichen ist eingeschaltet, aber der Bluesky-Zugang fehlt in der .env – es wird nichts gepostet.'
  if (u?.posten === 'test') return `Testbetrieb: Freigegebene Entwürfe werden ab ${zeit} Uhr nur ins Server-Log geschrieben, nicht gepostet.`
  return 'Veröffentlichen ist aus: Freigegebene Entwürfe bleiben hier, bis du sie selbst postest.'
}

function renderSocialEntwuerfe() {
  const liste = soEl('so-pf-liste')
  if (!liste) return
  soEl('so-pf-zahlen').innerHTML = socialGeladen && socialEntwuerfe.length ? socialZahlenHtml() : (socialUmfang ? esc(socialSpanne(socialUmfang.von, socialUmfang.bis)) : '')
  socialAutomatikText()
  socialStandAktualisieren()
  if (!socialGeladen) { liste.replaceChildren(); return }
  if (!socialEntwuerfe.length) {
    liste.innerHTML = '<div class="li-leer"><p class="li-leer-titel">Keine Entwürfe</p>'
      + '<p class="li-leer-text">Für die nächsten zwei Wochen ist noch nichts angelegt. Entwürfe entstehen nur für Tage, die im Kalender geplant sind.</p>'
      + '<p class="li-leer-ornament" aria-hidden="true">· · ·</p></div>'
    return
  }
  const heute = socialHeute()
  const tage = [...new Set(socialEntwuerfe.map((e) => e.datum))]
  liste.innerHTML = tage.map((datum) => {
    const eintraege = socialEntwuerfe.filter((e) => e.datum === datum)
    const abstand = datum === heute ? 0 : datum === addTageIso(heute, 1) ? 1 : 2
    // Für Screenreader getrennt vom Datum: „Montag, 26. Oktober, heute“ statt „Oktoberheute“
    const marke = abstand === 0 ? '<span class="adm-visually-hidden">, </span><span class="in-heute-marke">heute</span>' : ''
    const zusatz = `${abstand === 1 ? 'morgen · ' : ''}${anzahlText(eintraege.length, 'Entwurf', 'Entwürfe')}`
    return `<section class="li-gruppe so-tag">`
      + `<h2 class="li-monat so-tag-titel" id="so-tag-${esc(datum)}" tabindex="-1"><span class="li-monat-name">${esc(datumLang(datum))}${marke}</span><span class="li-monat-zahl">${esc(zusatz)}</span></h2>`
      + `<ol class="so-liste">${eintraege.map(socialEntwurfHtml).join('')}</ol></section>`
  }).join('')
}

// Einen Entwurf neu zeichnen, ohne die Liste anzufassen. Die Meldungszeile bleibt derselbe Knoten: Eine neu
// eingefügte Live-Region mit fertigem Text würde nicht angesagt.
function ersetzeSocialEintrag(e) {
  const li = soEl(`so-e-${e.id}`)
  if (!li) return renderSocialEntwuerfe()
  const vorlage = document.createElement('template')
  vorlage.innerHTML = socialEntwurfHtml(e)
  const neu = vorlage.content.firstElementChild
  const alt = li.querySelector('.li-meldung')
  const frisch = neu.querySelector('.li-meldung')
  if (alt && frisch) {
    alt.textContent = ''
    alt.removeAttribute('data-tone')
    frisch.replaceWith(alt)
  }
  li.replaceWith(neu)
  soEl('so-pf-zahlen').innerHTML = socialZahlenHtml()
  socialStandAktualisieren()
  socialSperreNachziehen(e)
}

// Ändert sich der Status eines Entwurfs, hängt daran die Sperre „Neu erstellen …“ seines Partners (Rätsel ↔ Auflösung)
function socialSperreNachziehen(e) {
  const p = socialPartner(e)
  const knopf = p && soEl(`so-e-${p.id}`)?.querySelector('[data-action="so-neu"]')
  if (!knopf || knopf.classList.contains('is-busy')) return
  if (socialNeuGrund(p)) knopf.setAttribute('aria-disabled', 'true')
  else knopf.removeAttribute('aria-disabled')
}

// Antwort des Servers in die Liste übernehmen (ersetzt nach id, sonst einsortiert)
function socialUebernehme(neue) {
  for (const n of neue) {
    socialLokal.set(n.id, { zaehler: ++socialAenderungen, entwurf: n })
    const i = socialEntwuerfe.findIndex((e) => e.id === n.id)
    if (i >= 0) socialEntwuerfe[i] = n
    else socialEntwuerfe.push(n)
  }
  socialEntwuerfe.sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id)
}

async function ladeSocialEntwuerfe({ neu = false } = {}) {
  const liste = soEl('so-pf-liste')
  if (!liste) return
  if (socialGeladen && !neu) { renderSocialEntwuerfe(); return }
  const token = ++socialLadeToken
  const stand = socialAenderungen
  if (socialGeladen) liste.setAttribute('aria-busy', 'true')
  else setMeldung('so-pf-meldung', 'Entwürfe werden geladen …', 'loading')
  try {
    // Das Zeichenmodul liefert nur die Zeichenzählung; ohne es zählt die Seite grob weiter
    const [daten] = await Promise.all([holeJson('/admin/social-cards/entwuerfe'), ladeKarten().catch(() => null)])
    if (token !== socialLadeToken) return
    socialEntwuerfe = Array.isArray(daten.entwuerfe) ? daten.entwuerfe : []
    // Während des Ladens lokal Geändertes (z. B. eine Freigabe) behält den lokalen Stand
    for (const [id, { zaehler, entwurf }] of socialLokal) {
      if (zaehler <= stand) { socialLokal.delete(id); continue }
      const i = socialEntwuerfe.findIndex((e) => e.id === id)
      if (i >= 0) socialEntwuerfe[i] = entwurf
    }
    socialUmfang = {
      von: daten.von,
      bis: daten.bis,
      automatisch: daten.automatisch !== false,
      horizont: Number(daten.horizont) || 7,
      aufbewahrung: Number(daten.aufbewahrung) || 56,
      posten: daten.posten || 'aus',
      postZeit: daten.postZeit || '18:30',
      blueskyEingerichtet: !!daten.blueskyEingerichtet,
    }
    socialGeladen = true
    // Getippte Texte bleiben nur, wo sie noch etwas ändern
    for (const [id, text] of [...socialUngespeichert]) {
      const e = socialFinde(id)
      if (!e || e.status !== 'offen' || text === e.caption) socialUngespeichert.delete(id)
    }
    setMeldung('so-pf-meldung', '')
    liste.setAttribute('aria-busy', 'false')
    renderSocialEntwuerfe()
  } catch (err) {
    if (token !== socialLadeToken) return
    liste.setAttribute('aria-busy', 'false')
    socialAutomatikText()
    setMeldung('so-pf-meldung', `Die Entwürfe konnten nicht geladen werden (${esc(err.message)}). <button type="button" class="adm-link" data-action="so-pf-neu-laden">Erneut versuchen</button>`, 'error', { html: true })
  }
}

// ── Aktionen am Entwurf ──

const socialMeldung = (id, text, ton, opts) => setMeldung(`so-e-${id}-meldung`, text, ton, opts)

// Entwurf gesperrt (Neu erstellen läuft für ihn oder seinen Partner): in der Liste der Laufenden, alle Knöpfe
// aria-disabled (fokussierbar, ohne Wirkung), Beitragstext schreibgeschützt. Nur was nicht schon gesperrt war, wird
// beim Aufheben zurückgesetzt – ein „Freigeben“, das wegen zu langem Text gesperrt ist, bleibt es.
function socialSperre(id, an) {
  if (an) socialLaeuft.add(id)
  else socialLaeuft.delete(id)
  const li = soEl(`so-e-${id}`)
  if (!li) return
  if (an) li.setAttribute('aria-busy', 'true')
  else li.removeAttribute('aria-busy')
  for (const k of li.querySelectorAll('.so-aktionen button')) {
    if (an) {
      if (k.getAttribute('aria-disabled') !== 'true') { k.setAttribute('aria-disabled', 'true'); k.dataset.sperre = '' }
    } else if ('sperre' in k.dataset) {
      k.removeAttribute('aria-disabled')
      delete k.dataset.sperre
    }
  }
  const feld = li.querySelector('textarea[data-id]')
  if (feld) {
    if (an && !feld.readOnly) { feld.readOnly = true; feld.dataset.sperre = '' }
    else if (!an && 'sperre' in feld.dataset) { feld.readOnly = false; delete feld.dataset.sperre }
  }
}

// Läuft gerade eine Anfrage: Entwurf und Knopf gedämpft, weitere Klicks ignoriert
function socialBusy(id, an, knopf) {
  const li = soEl(`so-e-${id}`)
  if (an) socialLaeuft.add(id)
  else socialLaeuft.delete(id)
  if (li) {
    if (an) li.setAttribute('aria-busy', 'true')
    else li.removeAttribute('aria-busy')
  }
  if (knopf) {
    knopf.classList.toggle('is-busy', an)
    if (an) knopf.setAttribute('aria-disabled', 'true')
    else knopf.removeAttribute('aria-disabled')
  }
}

async function socialSende(e, body) {
  const antwort = await holeJson(`/admin/social-cards/entwuerfe/${e.id}`, { method: 'POST', body: JSON.stringify(body) })
  return antwort.entwurf
}

async function socialFreigeben(id, knopf) {
  const e = socialFinde(id)
  if (!e || socialLaeuft.has(e.id)) return
  const text = socialUngespeichert.get(e.id) ?? e.caption
  const z = socialZaehler(e, text)
  if (z.zuviel > 0) {
    socialMeldung(e.id, `Zu lang für Bluesky: ${z.zuviel} Zeichen kürzen, dann freigeben.`, 'error', { fokus: true })
    return
  }
  if (!text.trim()) {
    socialMeldung(e.id, 'Der Beitragstext darf nicht leer sein.', 'error', { fokus: true })
    return
  }
  socialMeldung(e.id, '')
  socialBusy(e.id, true, knopf)
  try {
    // Ein geänderter Text wird beim Freigeben mit gespeichert
    const body = { status: 'freigegeben' }
    if (text.trim() !== e.caption) body.caption = text
    const neu = await socialSende(e, body)
    socialBusy(e.id, false)
    socialUebernehme([neu])
    socialUngespeichert.delete(e.id)
    ersetzeSocialEintrag(neu)
    socialMeldung(e.id, `Freigegeben. Zum Posten: Text kopieren${neu.spec?.format === 'text' ? '' : ' und Bild herunterladen'}.`, 'ok', { fokus: true })
  } catch (err) {
    socialBusy(e.id, false, knopf)
    socialMeldung(e.id, `Nicht freigegeben: ${err.message}`, 'error', { fokus: true })
  }
}

async function socialSpeichern(id, knopf) {
  const e = socialFinde(id)
  if (!e || socialLaeuft.has(e.id) || !socialUngespeichert.has(e.id)) return
  const text = socialUngespeichert.get(e.id)
  if (!text.trim()) {
    socialMeldung(e.id, 'Der Beitragstext darf nicht leer sein.', 'error', { fokus: true })
    return
  }
  socialBusy(e.id, true, knopf)
  try {
    const neu = await socialSende(e, { caption: text })
    socialBusy(e.id, false)
    socialUebernehme([neu])
    socialUngespeichert.delete(e.id)
    ersetzeSocialEintrag(neu)
    socialMeldung(e.id, 'Text gespeichert.', 'ok', { fokus: true })
  } catch (err) {
    socialBusy(e.id, false, knopf)
    socialMeldung(e.id, `Nicht gespeichert: ${err.message}`, 'error', { fokus: true })
  }
}

async function socialKopieren(id) {
  const e = socialFinde(id)
  if (!e) return
  const text = socialPostText(e, socialUngespeichert.get(e.id) ?? e.caption)
  try {
    await navigator.clipboard.writeText(text)
    socialMeldung(e.id, e.hashtags ? 'Text mit Hashtags kopiert.' : 'Text kopiert.', 'ok')
  } catch {
    // Zwischenablage gesperrt: Text markieren, damit Strg+C reicht
    const feld = soEl(`so-e-${e.id}-text`)
    feld?.focus()
    feld?.select()
    socialMeldung(e.id, 'Kopieren ging nicht. Der Text ist markiert – mit Strg+C (Mac: Cmd+C) kopieren; Hashtags darunter von Hand ergänzen.', 'warn')
  }
}

async function socialVerwerfen(id, knopf) {
  const e = socialFinde(id)
  if (!e || socialLaeuft.has(e.id)) return
  // Ungespeicherter Text geht beim Verwerfen verloren: nicht still
  if (socialUngespeichert.has(e.id)) {
    const ok = await bestaetige({
      frage: 'Entwurf verwerfen?',
      text: 'Deine ungespeicherte Änderung am Beitragstext geht dabei verloren.',
      aktion: 'Verwerfen',
      gefahr: true,
    })
    if (!ok) return
  }
  socialBusy(e.id, true, knopf)
  try {
    const neu = await socialSende(e, { status: 'verworfen' })
    socialBusy(e.id, false)
    socialUebernehme([neu])
    socialUngespeichert.delete(e.id)
    ersetzeSocialEintrag(neu)
    socialMeldung(e.id, 'Verworfen. Der Entwurf kommt beim nächsten Anlegen nicht zurück.', 'ok')
    soEl(`so-e-${e.id}`)?.querySelector('[data-action="so-oeffnen"]')?.focus()
  } catch (err) {
    socialBusy(e.id, false, knopf)
    socialMeldung(e.id, `Nicht verworfen: ${err.message}`, 'error', { fokus: true })
  }
}

async function socialOeffnen(id, knopf) {
  const e = socialFinde(id)
  if (!e || socialLaeuft.has(e.id)) return
  socialBusy(e.id, true, knopf)
  try {
    const neu = await socialSende(e, { status: 'offen' })
    socialBusy(e.id, false)
    socialUebernehme([neu])
    ersetzeSocialEintrag(neu)
    socialMeldung(e.id, 'Wieder offen. Text und Bild lassen sich ändern.', 'ok')
    soEl(`so-e-${e.id}-text`)?.focus()
  } catch (err) {
    socialBusy(e.id, false, knopf)
    socialMeldung(e.id, `Nicht geöffnet: ${err.message}`, 'error', { fokus: true })
  }
}

// Rückfrage, dann Rätsel und Auflösung (bzw. Beleg, Textbeleg) gemeinsam neu bauen. Der geänderte Text beider geht
// verloren, deshalb nennt die Frage beide Entwürfe; der Server schreibt sie ins Änderungsprotokoll.
async function socialNeuErstellen(id, knopf) {
  const e = socialFinde(id)
  if (!e || socialLaeuft.has(e.id)) return
  const grund = socialNeuGrund(e)
  if (grund) {
    socialMeldung(e.id, grund, 'warn', { fokus: true })
    return
  }
  const info = socialPartnerInfo(e)
  const basis = soBasis(e.slot)
  const mitBild = e.spec?.format !== 'text'
  const betroffen = [{ slot: e.slot, datum: e.datum }, info].filter(Boolean).sort((a, b) => a.datum.localeCompare(b.datum))
  const li = soEl(`so-e-${e.id}`)
  socialMarkiert = e.id
  li?.classList.add('is-markiert')
  const ok = await bestaetige({
    frage: info ? `${SO_SLOT_LABEL[basis]} und Auflösung neu erstellen?` : `${SO_SLOT_LABEL[e.slot]} neu erstellen?`,
    text: `${info ? 'Beide bekommen' : 'Der Entwurf bekommt'} neue Daten aus dem Korpus${basis === 'A' ? ' (Ablenker, Reihenfolge)' : basis === 'T' ? '' : ' (anderer Beleg)'}, einen neuen Text aus der Vorlage${mitBild ? ' und ein neues Bild' : ''}. Dein geänderter Text geht verloren.`,
    details: betroffen.map((x) => `${SO_SLOT_LABEL[x.slot]} · ${datumKurz(x.datum)}`),
    aktion: 'Neu erstellen',
    gefahr: true,
  })
  socialMarkiert = null
  soEl(`so-e-${e.id}`)?.classList.remove('is-markiert')
  if (!ok) return

  const partner = socialPartner(e)
  socialBusy(e.id, true, knopf)
  socialSperre(e.id, true)
  if (partner) socialSperre(partner.id, true)
  const text = knopf?.firstChild
  const alterText = text?.textContent
  if (text) text.textContent = 'Wird neu erstellt …'
  socialMeldung(e.id, 'Neue Daten werden gesucht und das Bild gezeichnet. Das dauert einige Sekunden.', 'loading')
  const entsperren = () => {
    socialSperre(e.id, false)
    if (partner) socialSperre(partner.id, false)
    socialBusy(e.id, false, knopf)
    if (text && alterText) text.textContent = alterText
  }

  let antwort = null
  let fehler = null
  try {
    antwort = await holeJson(`/admin/social-cards/entwuerfe/${e.id}/neu`, { method: 'POST', body: '{}' })
  } catch (err) {
    fehler = err
  }

  // Nach JEDEM Ausgang den Zeitraum neu laden: Auch bei einem Fehler können die Texte schon ersetzt sein
  // (z. B. wenn nur das Zeichnen scheiterte) – die Anzeige soll den Stand des Servers zeigen, nicht den alten.
  let aktualisierungFehler = null
  try {
    const von = betroffen[0].datum
    const bis = betroffen[betroffen.length - 1].datum
    const frisch = (await holeJson(`/admin/social-cards/entwuerfe?von=${encodeURIComponent(von)}&bis=${encodeURIComponent(bis)}`)).entwuerfe || []
    const geaendert = frisch.filter((x) => socialFinde(x.id)?.aktualisiertAm !== x.aktualisiertAm)
    const zeigen = fehler ? geaendert : frisch
    if (!fehler) for (const x of antwort.ersetzt || []) socialUngespeichert.delete(x)
    for (const x of zeigen) socialUngespeichert.delete(x.id)
    entsperren()
    socialUebernehme(zeigen)
    if (zeigen.some((x) => !soEl(`so-e-${x.id}`))) renderSocialEntwuerfe()
    else for (const x of zeigen) ersetzeSocialEintrag(x)
  } catch (err) {
    aktualisierungFehler = err
    entsperren()
  }

  if (fehler) {
    socialMeldung(e.id, `Nicht neu erstellt: ${fehler.message}${aktualisierungFehler ? ' Die Anzeige ließ sich nicht aktualisieren – oben „neu laden“ wählen.' : ''}`, 'error', { fokus: true })
    return
  }
  if (aktualisierungFehler) {
    // Der Server hat neu erstellt; nur die Anzeige ließ sich nicht aktualisieren
    socialMeldung(e.id, `Neu erstellt, aber die Anzeige ließ sich nicht aktualisieren (${aktualisierungFehler.message}). Oben „neu laden“ wählen.`, 'warn', { fokus: true })
    return
  }
  const wortPartner = info ? (soIstAufloesung(info.slot) ? 'die Auflösung' : SO_BASIS_MIT_ARTIKEL[basis] || 'der Partner') : ''
  const mitErsetzt = info ? ` – ${wortPartner} (${datumKurz(info.datum)}) wurde mit ersetzt` : ''
  if (antwort.bildFehlt) {
    socialMeldung(e.id, `Neu erstellt${mitErsetzt}. Der Text ist neu, nur das Bild ließ sich nicht zeichnen; es wird beim nächsten Abruf oder Lauf nachgeholt.`, 'warn', { fokus: true })
    return
  }
  socialMeldung(e.id, info ? `Neu erstellt${mitErsetzt}.` : 'Neu erstellt.', 'ok', { fokus: true })
}

// „Fehlende Entwürfe jetzt anlegen“: derselbe Lauf wie der nächtliche
async function socialAnlegen() {
  if (socialAnlegenLaeuft) return
  socialAnlegenLaeuft = true
  const knopf = soEl('so-pf-anlegen')
  knopf.classList.add('is-busy')
  knopf.setAttribute('aria-disabled', 'true')
  soEl('so-pf-anlegen-text').textContent = 'Entwürfe werden angelegt …'
  setMeldung('so-pf-anlegen-meldung', 'Fehlende Entwürfe werden angelegt und die Bilder gezeichnet. Das kann eine halbe Minute dauern; du kannst die Seite derweil verlassen.', 'loading')
  try {
    const r = await holeJson('/admin/social-cards/entwuerfe/erzeugen', { method: 'POST', body: '{}' })
    socialAnlegenLaeuft = false
    knopf.classList.remove('is-busy')
    knopf.removeAttribute('aria-disabled')
    soEl('so-pf-anlegen-text').textContent = 'Fehlende Entwürfe jetzt anlegen'
    await ladeSocialEntwuerfe({ neu: true })
    const fehler = (r.fehler || []).map((f) => {
      const m = /^(\d{4}-\d{2}-\d{2}): (.*)$/.exec(String(f))
      return m && isValidIsoDay(m[1]) ? `Für ${datumKurz(m[1])}: ${m[2]}` : String(f)
    })
    const teile = []
    if (r.neu) teile.push(`${anzahlText(r.neu, 'Entwurf', 'Entwürfe')} neu angelegt`)
    if (r.gezeichnet) teile.push(`${anzahlText(r.gezeichnet, 'Bild', 'Bilder')} gezeichnet`)
    let text
    if (teile.length) text = `Fertig: ${teile.join(', ')}.`
    else if (!fehler.length) text = `Nichts zu tun: Alle Entwürfe bis ${datumKurz(addTageIso(socialHeute(), socialUmfang?.horizont ?? 7))} sind schon da.`
    else text = 'Es wurde nichts angelegt.'
    if (fehler.length) text += ` ${fehler.join(' ')}`
    setMeldung('so-pf-anlegen-meldung', text, fehler.length ? 'warn' : 'ok', { fokus: true })
  } catch (err) {
    socialAnlegenLaeuft = false
    knopf.classList.remove('is-busy')
    knopf.removeAttribute('aria-disabled')
    soEl('so-pf-anlegen-text').textContent = 'Fehlende Entwürfe jetzt anlegen'
    setMeldung('so-pf-anlegen-meldung', `Die Entwürfe konnten nicht angelegt werden: ${err.message}`, 'error', { fokus: true })
  }
}

// Klick auf einen gesperrten Knopf: erklären statt schweigen
function socialGesperrtKlick(knopf) {
  if (knopf.classList.contains('is-busy')) return
  const { action, id } = knopf.dataset
  // Zeichenmodul fehlt: Bild und Text lassen sich nicht erzeugen
  if (action === 'so-ed-laden' || action === 'so-ed-kopieren' || action === 'so-ed-ablegen') {
    if (!kartenModul) socialEdMeldung(action === 'so-ed-laden' ? 'vorschau' : 'text', 'Das Zeichenmodul ist nicht geladen – ohne es gibt es kein Bild und keinen Text aus der Vorlage. Seite neu laden und noch einmal versuchen.', 'warn', { fokus: true })
    return
  }
  // Gesperrt, weil der Entwurf (oder sein Partner) gerade neu erstellt wird: Die Meldung dort sagt es schon
  if ('sperre' in knopf.dataset) return
  const e = socialFinde(id)
  if (!e) return
  if (action === 'so-freigeben') {
    const z = socialZaehler(e, socialUngespeichert.get(e.id) ?? e.caption)
    if (z.zuviel > 0) socialMeldung(e.id, `Zu lang für Bluesky: ${z.zuviel} Zeichen kürzen, dann freigeben.`, 'error', { fokus: true })
  } else if (action === 'so-neu') {
    const grund = socialNeuGrund(e)
    if (grund) socialMeldung(e.id, grund, 'warn', { fokus: true })
  }
}

// Eingabe im Beitragstext eines Entwurfs: Marke, Speichern-Knopf, Zähler und Sperre des Freigebens ziehen nach
function socialTextEingabe(feld) {
  const e = socialFinde(feld.dataset.id)
  const li = feld.closest('.so-entwurf')
  if (!e || !li) return
  const war = socialUngespeichert.has(e.id)
  if (feld.value === e.caption) socialUngespeichert.delete(e.id)
  else socialUngespeichert.set(e.id, feld.value)
  const geaendert = socialUngespeichert.has(e.id)
  li.querySelector('.in-geaendert').hidden = !geaendert
  li.querySelector('[data-action="so-speichern"]').hidden = !geaendert
  const z = socialZaehler(e, feld.value)
  const zaehler = li.querySelector('.in-zaehler')
  zaehler.textContent = z.text
  if (z.tone) zaehler.dataset.tone = z.tone
  else zaehler.removeAttribute('data-tone')
  if (z.zuviel > 0) feld.setAttribute('aria-invalid', 'true')
  else feld.removeAttribute('aria-invalid')
  const freigeben = li.querySelector('[data-action="so-freigeben"]')
  if (freigeben && !freigeben.classList.contains('is-busy')) {
    if (z.zuviel > 0) freigeben.setAttribute('aria-disabled', 'true')
    else freigeben.removeAttribute('aria-disabled')
  }
  // Eine alte Rückmeldung („Text gespeichert.“) gilt für den neuen Text nicht mehr
  if (war !== geaendert) socialMeldung(e.id, '')
}

// ════════════════ Selbst gestalten ════════════════

const SO_TEXT_VORLAGEN = {
  A: ['Variante 1 – Rätsel, Auflösung morgen', 'Variante 2 – Frage an die Leser', 'Variante 3 – mit Hashtags im Text'],
  B: ['Variante 1 – welches Wort fehlt?', 'Variante 2 – Lehrbuch und echte Sprache', 'Variante 3 – mit Quelle und Hashtags'],
  C: ['Variante 1 – zwei Wörter, Auflösung morgen', 'Variante 2 – der feine Unterschied', 'Variante 3 – für den Unterricht, mit Hashtags'],
  X: ['Variante 1 – Überschrift und Text', 'Variante 2 – mit Wort und Frage', 'Variante 3 – Sprachgeschichte, mit Hashtags'],
  T: ['Variante 1 – Liste der Wörter', 'Variante 2 – kurz, mit Hashtags im Text'],
}
// Textvorlagen, die schon Hashtags enthalten → Hashtag-Auswahl „Keine“ (sonst stünden sie doppelt da)
const SO_MIT_TAGS_IM_TEXT = { A: 2, B: 2, C: 2, X: 2, T: 1 }
const SO_TAG_SETS = [['quiz', 'Rätsel'], ['korpus', 'Korpus'], ['bildung', 'Unterricht'], ['wortschatz', 'Wortschatz'], ['primary', 'Nur #Linguistik #DeutscheSprache'], ['', 'Keine']]
// Ohne Uhrzeiten: Der Wochenplan der Entwürfe kennt nur den Wochentag
const SO_PLAN = {
  A: 'Im Wochenplan: dienstags als Bild, die Auflösung mittwochs als Antwort.',
  B: 'Im Wochenplan: samstags in geraden Kalenderwochen, die Auflösung sonntags als Antwort.',
  C: 'Nicht im Wochenplan – Wort-Zwilling-Karten entstehen nur hier.',
  X: 'Im Wochenplan: samstags in ungeraden Kalenderwochen als Zitat-Bild.',
  T: 'Nicht im Wochenplan – Teaser entstehen nur hier.',
}
const SO_DATEINAME = { A: 'raetsel', B: 'beleg', C: 'wort-zwilling', X: 'info', T: 'teaser' }
const SO_KARTENART = { A: 'Rätsel', B: 'Beleg', C: 'Wort-Zwilling', X: 'Info', T: 'Teaser' }

const soEd = {
  bereit: false,
  datum: '',
  vorlage: 'A',
  lemmata: [],
  wz: null,
  koll: [],
  belege: [],
  xBelege: [],
  reihenfolge: [0, 1, 2],
  chipsGemischt: null,
  textGeaendert: false,
  fontsBereit: false,
  tagLauf: 0,
  wortLauf: 0,
  belegLauf: 0,
  zeichenLauf: 0,
}

function socialEditorHash() {
  return `#werkzeuge/social-cards/gestalten?${new URLSearchParams({ datum: soEd.datum, vorlage: soEd.vorlage })}`
}

// Datum und Vorlage stehen in der Adresse (ohne Verlaufseintrag); der Reiter „Selbst gestalten“ führt dorthin zurück
function merkeSocialEditor() {
  if (currentRoute?.page !== 'social-editor' || !soEd.datum) return
  const hash = socialEditorHash()
  reiterMerker['social-editor'] = hash
  if (hash !== currentRouteHash) replaceRouteHashSilently(hash)
  document.querySelector('#page-tabs a[aria-current="page"]')?.setAttribute('href', hash)
}

async function oeffneSocialEditor(route) {
  const wunsch = route.social || {}
  try {
    await ladeKarten()
  } catch {
    socialModulFehlt()
    await zeigeKartenFehler()
    return
  }
  if (currentRoute?.page !== 'social-editor') return
  if (soEl('so-ed-meldung')?.querySelector('[data-action="so-ed-seite-neu"]')) setMeldung('so-ed-meldung', '')
  socialModulDa()
  const datum = wunsch.datum || soEd.datum || addTageIso(berlinTeile(getCurrentDate()).iso, 1)
  let vorlage = wunsch.vorlage || soEd.vorlage
  // Andere Vorlage über Adresse oder Zurück: wie beim Umschalten im Editor erst fragen, wenn der Beitragstext
  // selbst geändert ist. Bei „Abbrechen“ bleibt die alte Vorlage, die Adresse zeigt unten wieder sie.
  if (soEd.bereit && vorlage !== soEd.vorlage && !(await bestaetigeVorlagenwechsel())) {
    if (currentRoute?.page !== 'social-editor') return
    vorlage = soEd.vorlage
  }
  if (!soEd.bereit || datum !== soEd.datum) {
    const ersterAufruf = !soEd.bereit
    soEd.bereit = true
    soEd.datum = datum
    soEl('so-datum').value = datum
    // Ein anderer Tag allein behält den eigenen Text (wie das Datumsfeld); nur eine andere Vorlage setzt ihren ein
    if (ersterAufruf || vorlage !== soEd.vorlage) {
      document.querySelector(`input[name="so-vorlage"][value="${vorlage}"]`).checked = true
      setzeSocialVorlage(vorlage, { aus: 'adresse' })
    }
    await ladeSocialTag()
  } else if (vorlage !== soEd.vorlage) {
    document.querySelector(`input[name="so-vorlage"][value="${vorlage}"]`).checked = true
    setzeSocialVorlage(vorlage, { aus: 'adresse' })
  } else {
    // Zurück auf der Seite: Der Zeichenbereich wurde beim Verlassen freigegeben
    void socialZeichne()
  }
  merkeSocialEditor()
}

// Beim Verlassen: Die Zeichenfläche (5,8–8,3 MB) freigeben, eine laufende Zeichnung verwerfen
function socialEditorVerlassen() {
  soEd.zeichenLauf++
  const c = soEl('so-canvas')
  if (c) { c.width = 0; c.height = 0 }
}

async function ladeSocialTag() {
  const datum = soEd.datum
  const lauf = ++soEd.tagLauf
  soEd.belegLauf++   // späte Belege des vorigen Tages dürfen nichts mehr überschreiben
  setMeldung('so-datum-hinweis', 'Wörter werden geladen …')
  let daten = null
  try {
    daten = await holeJson(`/admin/social-cards/tagesdata?datum=${encodeURIComponent(datum)}`)
  } catch (err) {
    if (lauf !== soEd.tagLauf) return
    setMeldung('so-ed-meldung', `Die Wörter für ${datumKurz(datum)} konnten nicht geladen werden (${esc(err.message)}). <button type="button" class="adm-link" data-action="so-ed-neu-laden">Erneut versuchen</button>`, 'error', { html: true })
  }
  if (lauf !== soEd.tagLauf) return
  if (daten) setMeldung('so-ed-meldung', '')
  soEd.lemmata = Array.isArray(daten?.lemmata) ? daten.lemmata : []
  let wz = daten?.wortzwilling || null
  if (wz && typeof wz.kollokatoren === 'string') {
    try { wz = { ...wz, kollokatoren: JSON.parse(wz.kollokatoren) } } catch { wz = { ...wz, kollokatoren: [] } }
  }
  if (wz && !Array.isArray(wz.kollokatoren)) wz = { ...wz, kollokatoren: [] }
  soEd.wz = wz
  if (!daten) setMeldung('so-datum-hinweis', '')
  else {
    setMeldung('so-datum-hinweis', soEd.lemmata.length
      ? `Geplant: ${soEd.lemmata.map((l) => l.lemma).join(', ')}${wz ? ` · Wort-Zwilling ${wz.wortA} / ${wz.wortB}` : ''}`
      : 'Für diesen Tag ist nichts geplant. Info-Karten lassen sich trotzdem frei ausfüllen.')
  }
  soOptionen(soEl('so-wort'), soEd.lemmata.length ? soEd.lemmata.map((l) => [l.id, `${l.lemma} (${l.pos})`]) : [['', 'Kein Wort geplant']])
  soEl('so-wort').disabled = !soEd.lemmata.length
  // Wort-Zwilling: Die Daten nennen die Seite „zuordnung“ (A/B) – nicht „owner“ (so heißt das Feld nur in der Kartenvorlage)
  if (wz) {
    soEl('so-c-wort-a').value = wz.wortA || ''
    soEl('so-c-wort-b').value = wz.wortB || ''
    soEl('so-c-koll-a').value = wz.kollokatoren.filter((k) => k.zuordnung === 'A').slice(0, 2).map((k) => k.wort).join(', ')
    soEl('so-c-koll-b').value = wz.kollokatoren.filter((k) => k.zuordnung === 'B').slice(0, 2).map((k) => k.wort).join(', ')
    soEl('so-c-hinweis').textContent = `Vorbelegt aus dem Wort-Zwilling des Tages (${wz.wortA} / ${wz.wortB}). Auf der Karte stehen die Kollokatoren gemischt.`
  } else {
    // Felder des vorigen Tages nicht stehen lassen
    for (const id of ['so-c-wort-a', 'so-c-wort-b', 'so-c-koll-a', 'so-c-koll-b']) soEl(id).value = ''
    soEl('so-c-hinweis').textContent = 'Für diesen Tag gibt es keinen Wort-Zwilling. Wörter und Kollokatoren von Hand eintragen.'
  }
  soEd.chipsGemischt = null
  socialVorschlaege()
  soEl('so-t-hinweis').textContent = soEd.lemmata.length
    ? `Zeigt die drei Wörter des Tages: ${soEd.lemmata.slice(0, 3).map((l) => l.lemma).join(', ')}.`
    : 'Für diesen Tag ist nichts geplant – der Teaser bleibt leer.'
  await ladeSocialWort()
}

// Kollokatoren zum gewählten Wort: Rätsel (richtige Antwort, Ablenker), Beleg und Info-Zitat brauchen sie
async function ladeSocialWort() {
  const l = soEd.lemmata.find((x) => x.id === soWert('so-wort'))
  const lauf = ++soEd.wortLauf
  soEd.belegLauf++   // eine noch laufende Belegsuche (Beleg-Karte, Zitat) gehört zum alten Wort
  soEd.koll = []
  soEd.belege = []
  soEd.xBelege = []
  setMeldung('so-wort-hinweis', '')
  if (l) {
    setMeldung('so-wort-hinweis', 'Kollokatoren werden geladen …')
    try {
      const daten = await holeJson(`/admin/analyze-kollokation?q=${encodeURIComponent(l.lemma)}`)
      if (lauf !== soEd.wortLauf) return
      soEd.koll = (daten.kollokatoren || []).map((k) => ({ wort: k.wort, logDice: Number(k.logDice) || 0 })).sort((a, b) => b.logDice - a.logDice)
      setMeldung('so-wort-hinweis', soEd.koll.length ? '' : 'Zu diesem Wort gibt es keine Kollokatoren.')
    } catch (err) {
      if (lauf !== soEd.wortLauf) return
      setMeldung('so-wort-hinweis', `Die Kollokatoren konnten nicht geladen werden (${err.message}).`, 'error')
    }
  }
  const [antwort, ...rest] = soEd.koll
  soEl('so-a-antwort').innerHTML = antwort
    ? `${esc(antwort.wort)} <span class="so-zusatz">stärkster Kollokator · logDice ${soZahlDe(antwort.logDice)}</span>`
    : '<span class="so-zusatz">–</span>'
  // Ablenker wie bisher vorbelegt: Rang 5 und Rang 10, sonst die nächsten
  const opts = rest.map((k, i) => [k.wort, `${k.wort} – Rang ${i + 2} · logDice ${soZahlDe(k.logDice)}`])
  soOptionen(soEl('so-a-abl1'), opts, (rest[3] ?? rest[0])?.wort)
  soOptionen(soEl('so-a-abl2'), opts, (rest[8] ?? rest[1])?.wort)
  const kopts = soEd.koll.slice(0, 25).map((k) => [k.wort, `${k.wort} · logDice ${soZahlDe(k.logDice)}`])
  soOptionen(soEl('so-b-kollokator'), [['', 'Kollokator wählen'], ...kopts])
  soOptionen(soEl('so-x-kollokator'), [['', 'Kollokator wählen'], ...kopts])
  // Satz und Quelle des alten Worts bleiben nicht stehen
  soEl('so-b-text').value = ''
  soEl('so-b-quelle').value = ''
  soOptionen(soEl('so-b-beleg'), [['', 'Erst einen Kollokator wählen']])
  soOptionen(soEl('so-x-beleg'), [['', 'Erst einen Kollokator wählen']])
  setMeldung('so-b-beleg-hinweis', '')
  socialBAblenker()
  if (!soWert('so-x-wort') && l) soEl('so-x-wort').value = l.lemma
  soEd.reihenfolge = soMische(3)
  void socialZeichne()
}

function socialBAblenker() {
  const k = soWert('so-b-kollokator').toLowerCase()
  const rest = soEd.koll.filter((x) => x.wort.toLowerCase() !== k)
  const opts = rest.map((x, i) => [x.wort, `${x.wort} – Rang ${i + 2} · logDice ${soZahlDe(x.logDice)}`])
  soOptionen(soEl('so-b-abl1'), opts, (rest[4] ?? rest[0])?.wort)
  soOptionen(soEl('so-b-abl2'), opts, (rest[9] ?? rest[1])?.wort)
}

// Belege (aus dem eigenen Korpus) zu Wort + Kollokator; 'b' = Beleg-Karte, 'x' = Zitat der Info-Karte
async function ladeSocialBelege(welche) {
  const l = soEd.lemmata.find((x) => x.id === soWert('so-wort'))
  const k = soWert(welche === 'b' ? 'so-b-kollokator' : 'so-x-kollokator')
  const hinweis = welche === 'b' ? 'so-b-beleg-hinweis' : ''
  const lauf = ++soEd.belegLauf
  if (!k || !l) {
    if (welche === 'b') { soEd.belege = []; soOptionen(soEl('so-b-beleg'), [['', 'Erst einen Kollokator wählen']]); setMeldung(hinweis, ''); setzeSocialBeleg() }
    return
  }
  if (hinweis) setMeldung(hinweis, 'Belege werden geladen …')
  let belege = []
  try {
    const daten = await holeJson(`/admin/social-cards/belege?lemma=${encodeURIComponent(l.lemma)}&collocate=${encodeURIComponent(k)}`)
    belege = Array.isArray(daten.belege) ? daten.belege : []
  } catch (err) {
    if (lauf !== soEd.belegLauf) return
    if (hinweis) setMeldung(hinweis, `Die Belege konnten nicht geladen werden (${err.message}).`, 'error')
  }
  if (lauf !== soEd.belegLauf) return
  const optionen = belege.length ? belege.map((b, i) => [String(i), `Beleg ${i + 1}: ${String(b.quelle).split(' · ')[0]}`]) : [['', 'Keine Belege']]
  if (welche === 'b') {
    soEd.belege = belege
    soOptionen(soEl('so-b-beleg'), optionen)
    if (hinweis && (belege.length || !soEl(hinweis).dataset.tone)) {
      setMeldung(hinweis, belege.length ? `${anzahlText(belege.length, 'Beleg', 'Belege')} aus dem eigenen Korpus.` : `Zu „${l.lemma}“ + „${k}“ gibt es keinen Beleg. Anderen Kollokator wählen.`)
    }
    socialBAblenker()
    setzeSocialBeleg()
  } else {
    soEd.xBelege = belege
    soOptionen(soEl('so-x-beleg'), optionen)
  }
}

// Satz und Quelle aus dem gewählten Beleg; ohne Beleg werden beide geleert (sonst bliebe der Satz des alten Kollokators)
function setzeSocialBeleg() {
  if (!kartenModul) return
  const b = soEd.belege[Number(soWert('so-b-beleg'))]
  soEl('so-b-text').value = b ? kartenModul.belegLueckentext(b.tokens, soWert('so-b-kollokator')) : ''
  soEl('so-b-quelle').value = b ? b.quelle || '' : ''
  void socialZeichne()
}

// Wort-Zwilling: Vorschläge je Wort als Schalter; gedrückt = steht im Feld
function socialVorschlaege() {
  const box = soEl('so-c-vorschlaege')
  if (!box) return
  const wz = soEd.wz
  if (!wz || !wz.kollokatoren.length) { box.innerHTML = ''; return }
  const gewaehlt = (feld) => soWert(feld).split(',').map((s) => s.trim()).filter(Boolean)
  const gruppe = (z, wort, feld) => `<div class="so-vorschlag-gruppe" role="group" aria-labelledby="so-vg-${z}"><p class="tag-label" id="so-vg-${z}">Vorschläge zu ${esc(wort)}</p>`
    + `<ul class="so-vorschlag-liste">${wz.kollokatoren.filter((k) => k.zuordnung === z).map((k) => `<li><button type="button" class="so-vorschlag" data-action="so-c-vorschlag" data-feld="${feld}" data-wort="${esc(k.wort)}" aria-pressed="${gewaehlt(feld).includes(k.wort)}">${esc(k.wort)}</button></li>`).join('')}</ul></div>`
  box.innerHTML = gruppe('A', soWert('so-c-wort-a') || 'Wort A', 'so-c-koll-a') + gruppe('B', soWert('so-c-wort-b') || 'Wort B', 'so-c-koll-b')
}

function socialEdSpec() {
  const l = soEd.lemmata.find((x) => x.id === soWert('so-wort'))
  const fmt = soEd.vorlage
  const spec = {
    format: fmt,
    theme: soRadio('so-farbe') || 'hell',
    ratio: soRadio('so-format') === '9:16' ? '9:16' : '4:5',
    header: soEl('so-kopf').checked,
    reveal: soEl('so-aufloesung').checked && 'ABC'.includes(fmt),
    datum: soEd.datum,
  }
  if (fmt === 'A') {
    const texte = [soEd.koll[0]?.wort || '–', soWert('so-a-abl1') || '–', soWert('so-a-abl2') || '–']
    spec.data = { lemma: l?.lemma || '—', pos: l?.pos || '', ipa: l?.ipa || '', options: soEd.reihenfolge.map((i) => ({ text: texte[i], correct: i === 0 })) }
  } else if (fmt === 'B') {
    const k = soWert('so-b-kollokator')
    const b = soEd.belege[Number(soWert('so-b-beleg'))]
    spec.data = {
      quoteText: soWert('so-b-text') || '—',
      quelle: soWert('so-b-quelle'),
      // Die Auflösung zeigt die Wortform aus dem Beleg („Weißen“), nicht die Grundform des Kollokators
      collocate: b && kartenModul ? kartenModul.belegLueckenwort(b.tokens, k) : k,
      showOptions: soEl('so-b-optionen').checked,
      options: [{ text: k || '–', correct: true }, { text: soWert('so-b-abl1') || '–' }, { text: soWert('so-b-abl2') || '–' }],
    }
  } else if (fmt === 'C') {
    const teil = (id, owner) => soWert(id).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4).map((w) => ({ w, owner }))
    const chips = [...teil('so-c-koll-a', 'A'), ...teil('so-c-koll-b', 'B')]
    // Gemischt wird nur auf „Reihenfolge neu mischen“ – nicht bei jedem Tastendruck
    if (!soEd.chipsGemischt || soEd.chipsGemischt.length !== chips.length) soEd.chipsGemischt = soMische(chips.length)
    spec.data = { wortA: soWert('so-c-wort-a'), wortB: soWert('so-c-wort-b'), chips: soEd.chipsGemischt.map((i) => chips[i]) }
  } else if (fmt === 'X') {
    spec.data = { subtype: soWert('so-x-rubrik'), xLemma: soWert('so-x-wort'), headline: soWert('so-x-titel'), body: soWert('so-x-text') }
  } else {
    spec.data = { lemmata: soEd.lemmata.slice(0, 3) }
  }
  return spec
}

// Textersatz zur Karte (Vorschau und Download sind ein Bild ohne eigenen Text). `farbe`: Name der Farbvariante;
// ohne Angabe die im Editor gewählte.
function socialKartenText(spec, farbe = document.querySelector('input[name="so-farbe"]:checked')?.closest('label')?.textContent.trim().replace(/\s+/g, ' ') || '') {
  const d = spec.data
  const kopf = `${SO_KARTENART[spec.format]}-Karte${spec.reveal ? ' mit Auflösung' : ''}, ${farbe}, ${spec.ratio.replace(':', ' : ')}`
  if (spec.format === 'A') return `${kopf}: Welches Wort ist am stärksten mit „${d.lemma}“ verbunden? ${d.options.map((o, i) => `${'ABC'[i]} ${o.text}${spec.reveal && o.correct ? ' (richtig)' : ''}`).join(', ')}.`
  if (spec.format === 'B') return `${kopf}: „${spec.reveal ? d.quoteText.replace(/______/g, d.collocate) : d.quoteText.replace(/______/g, 'Lücke')}“ – ${d.quelle || 'ohne Quelle'}.`
  if (spec.format === 'C') return `${kopf}: ${d.wortA} und ${d.wortB}; Kollokatoren ${d.chips.map((c) => c.w).join(', ')}.`
  if (spec.format === 'X') return `${kopf}: ${d.subtype || 'Wortgeschichte'}${d.xLemma ? ` – ${d.xLemma}` : ''}. ${d.headline} ${d.body}`.trim()
  return `${kopf}: Heute im Spiel ${d.lemmata.map((l) => l.lemma).join(', ') || '–'}.`
}

// Dasselbe für einen Entwurf aus dem Postfach (Farbe und Format stehen in seiner spec)
const SO_FARBNAMEN = { hell: 'Hell', dunkel: 'Dunkel', rot: 'Rot' }
function socialEntwurfKartenText(e) {
  try {
    return socialKartenText({ ...e.spec, ratio: e.spec.ratio || '4:5' }, SO_FARBNAMEN[e.spec.theme] || SO_FARBNAMEN.hell)
  } catch {
    return ''
  }
}

// Ohne Zeichenmodul gibt es weder Bild noch Beitragstext aus der Vorlage: Die Knöpfe bleiben fokussierbar, sind aber
// gesperrt (aria-disabled) und sagen beim Klick, warum – statt eine leere Karte zu laden.
function socialModulFehlt() {
  for (const id of ['so-ed-laden', 'so-ed-kopieren', 'so-ed-ablegen']) soEl(id)?.setAttribute('aria-disabled', 'true')
  soEl('so-canvas')?.setAttribute('aria-label', 'Keine Vorschau: Zeichenmodul nicht geladen.')
  const masse = soEl('so-karte-masse')
  if (masse) masse.textContent = 'Keine Vorschau'
}

function socialModulDa() {
  for (const id of ['so-ed-laden', 'so-ed-kopieren', 'so-ed-ablegen']) {
    const k = soEl(id)
    if (k && !k.classList.contains('is-busy')) k.removeAttribute('aria-disabled')
  }
}

async function socialZeichne() {
  if (currentRoute?.page !== 'social-editor') return
  const lauf = ++soEd.zeichenLauf
  const figur = document.querySelector('#page-social-editor .so-karte')
  const knopf = soEl('so-ed-laden')
  try {
    await ladeKarten()
  } catch {
    await zeigeKartenFehler()
    socialModulFehlt()
    return
  }
  // „Wird gezeichnet …“ nur, solange die Schriften noch laden (danach zeichnet jede Eingabe in unter einer Millisekunde)
  const wartet = !soEd.fontsBereit
  if (wartet) {
    figur.classList.add('is-busy')
    knopf.classList.add('is-busy')
    knopf.setAttribute('aria-disabled', 'true')
    soEl('so-ed-laden-text').textContent = 'Wird gezeichnet …'
  }
  try { await kartenModul.loadCardFonts(document.fonts) } catch { /* Ersatzschrift: Die Karte wird trotzdem gezeichnet */ }
  if (lauf !== soEd.zeichenLauf || currentRoute?.page !== 'social-editor') return
  soEd.fontsBereit = true
  const spec = socialEdSpec()
  const { W, H } = kartenModul.cardDims(spec.ratio)
  const c = soEl('so-canvas')
  if (c.width !== W) c.width = W
  if (c.height !== H) c.height = H
  kartenModul.drawCard(c.getContext('2d'), spec)
  c.setAttribute('aria-label', socialKartenText(spec))
  soEl('so-karte-masse').textContent = `${W} × ${H} Pixel · ${spec.ratio === '9:16' ? 'Story' : 'Beitrag'}`
  figur.classList.remove('is-busy')
  knopf.classList.remove('is-busy')
  knopf.removeAttribute('aria-disabled')
  soEl('so-ed-laden-text').textContent = 'Bild herunterladen'
  socialModulDa()
  socialTextAktualisieren()
}

// Beitragstext, Hashtag-Zeile und Zeichenzähler. Der Text kommt aus der Textvorlage, solange man ihn nicht selbst
// geändert hat; danach bleibt er stehen, bis man ihn über „Text aus der Vorlage neu einsetzen“ zurückholt.
function socialTextAktualisieren({ neu = false } = {}) {
  if (!kartenModul) return
  const fmt = soEd.vorlage
  const v = Number(soWert('so-text-vorlage')) || 0
  if (!soEd.textGeaendert || neu) {
    const l = soEd.lemmata.find((x) => x.id === soWert('so-wort'))
    const quote = soWert('so-b-text')
    const state = {
      lemma: l?.lemma || '—',
      wortA: soWert('so-c-wort-a') || 'Wort A',
      wortB: soWert('so-c-wort-b') || 'Wort B',
      quote: quote.length > 100 ? `${quote.slice(0, 100)}…` : quote || '—',
      source: soWert('so-b-quelle') || 'Korpus',
      xLemma: soWert('so-x-wort'),
      headline: soWert('so-x-titel'),
      body: soWert('so-x-text'),
      lemmata: soEd.lemmata,
    }
    soEl('so-text').value = kartenModul.buildCaption(fmt, v, state)
    soEd.textGeaendert = false
  }
  soEl('so-text-stand').textContent = soEd.textGeaendert ? 'von dir geändert' : 'aus der Vorlage'
  soEl('so-ed-text-neu').hidden = !soEd.textGeaendert
  const set = soWert('so-tags')
  const tags = set ? kartenModul.hashtagsFor(set) : ''
  soEl('so-tags-zeile').textContent = tags ? `Darunter: ${tags}` : 'Keine Hashtags darunter.'
  const text = soWert('so-text').trim()
  const n = kartenModul.zeichenZahl(tags ? `${text}\n\n${tags}` : text)
  const max = kartenModul.BLUESKY_MAX_ZEICHEN
  const z = soEl('so-text-zaehler')
  z.textContent = n > max ? `${n} von ${max} Zeichen – ${n - max} zu viel für Bluesky` : `${n} von ${max} Zeichen${tags ? ' mit Hashtags' : ''}`
  if (n > max) z.dataset.tone = 'error'
  else z.removeAttribute('data-tone')
  if (n > max) soEl('so-text').setAttribute('aria-invalid', 'true')
  else soEl('so-text').removeAttribute('aria-invalid')
}

function setzeSocialVorlage(fmt, { aus = 'nutzer' } = {}) {
  soEd.vorlage = fmt
  document.querySelectorAll('#so-ed .so-fmt').forEach((el) => { el.hidden = el.dataset.fmt !== fmt })
  const ohneWort = fmt === 'C' || fmt === 'T'
  soEl('so-wort-feld').hidden = ohneWort
  soEl('so-wort-hinweis').hidden = ohneWort
  soEl('so-aufloesung-zeile').hidden = !'ABC'.includes(fmt)
  soEl('so-ed-mischen').hidden = !'AC'.includes(fmt)
  soEl('so-ed-plan').textContent = SO_PLAN[fmt]
  soOptionen(soEl('so-text-vorlage'), SO_TEXT_VORLAGEN[fmt].map((t, i) => [String(i), t]), '0')
  if (kartenModul) {
    soOptionen(soEl('so-tags'), SO_TAG_SETS.map(([v, t]) => [v, v && v !== 'primary' ? `${t} (${kartenModul.HASHTAGS[v]})` : t]), kartenModul.SUGGESTED_HASHTAG_SET[fmt])
  }
  soEd.textGeaendert = false
  if (aus === 'nutzer') merkeSocialEditor()
  void socialZeichne()
}

// Rückmeldungen im Editor stehen bei dem Knopf, der sie auslöst (Statuszeile darunter), nicht oben auf der Seite.
const SO_ED_MELDUNG = {
  vorschau: 'so-ed-vorschau-meldung',
  text: 'so-ed-text-meldung',
  vorschlag: 'so-ed-vorschlag-meldung',
  korpus: 'so-ed-korpus-meldung',
}
const socialEdMeldung = (wo, text, ton, opts) => setMeldung(SO_ED_MELDUNG[wo], text, ton, opts)

// Die neue Vorlage setzt ihren eigenen Beitragstext ein: Ein selbst geänderter Text geht dabei verloren, also vorher fragen.
// Bei „Abbrechen“ bleibt die alte Vorlage gewählt.
// true: Wechsel erlaubt (Text unverändert oder Verwerfen bestätigt). Auch der Wechsel über Adresse/Zurück fragt hier.
async function bestaetigeVorlagenwechsel() {
  if (!soEd.textGeaendert) return true
  return bestaetige({
    frage: 'Eigenen Beitragstext verwerfen?',
    text: 'Die neue Vorlage setzt ihren eigenen Text ein.',
    aktion: 'Verwerfen',
    gefahr: true,
  })
}

async function wechsleSocialVorlage(neu) {
  if (neu !== soEd.vorlage && !(await bestaetigeVorlagenwechsel())) {
    const alt = document.querySelector(`input[name="so-vorlage"][value="${soEd.vorlage}"]`)
    if (alt) { alt.checked = true; alt.focus() }
    return
  }
  setzeSocialVorlage(neu)
}

// Bild speichern: toBlob statt Daten-URL; der Dateiname trägt Datum, Vorlage, Auflösung und Format
async function socialLaden() {
  const knopf = soEl('so-ed-laden')
  if (knopf.getAttribute('aria-disabled') === 'true' || !kartenModul || !soEl('so-canvas').width) return
  const spec = socialEdSpec()
  const blob = await new Promise((resolve) => soEl('so-canvas').toBlob(resolve, 'image/png'))
  if (!blob) {
    socialEdMeldung('vorschau', 'Das Bild konnte nicht erzeugt werden. Bitte noch einmal versuchen.', 'error', { fokus: true })
    return
  }
  const a = document.createElement('a')
  a.download = `signifikation-${soEd.datum}-${SO_DATEINAME[spec.format]}${spec.reveal ? '-aufloesung' : ''}${spec.ratio === '9:16' ? '-story' : ''}.png`
  a.href = URL.createObjectURL(blob)
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  socialEdMeldung('vorschau', `Bild gespeichert als ${a.download} (${Math.max(1, Math.round(blob.size / 1024))} KB).`, 'ok')
}

// „Als Entwurf ablegen“: eigener Platz am gewählten Tag (neben dem Wochenplan), bei Rätsel und Beleg mit Auflösung
// am Folgetag. Ist der Platz schon belegt und offen, erst fragen; danach die Woche zählen (Plan A: höchstens 3 Beiträge).
let soAblegenLaeuft = false
async function socialEdAblegen({ ersetzen = false } = {}) {
  if (!kartenModul || soAblegenLaeuft) return
  if (soEl('so-ed-ablegen')?.getAttribute('aria-disabled') === 'true' && !ersetzen) return
  const fmt = soEd.vorlage
  const spec = socialEdSpec()
  const set = soWert('so-tags')
  const body = {
    datum: soEd.datum,
    spec: { ...spec, reveal: false },
    caption: soWert('so-text').trim(),
    hashtags: set ? kartenModul.hashtagsFor(set) : '',
    mitAufloesung: fmt === 'A' || fmt === 'B',
    ersetzen,
  }
  if (!body.caption) {
    socialEdMeldung('text', 'Nicht abgelegt: Der Beitragstext fehlt.', 'error', { fokus: true })
    return
  }
  soAblegenLaeuft = true
  setzeKnopfBusy('so-ed-ablegen', 'so-ed-ablegen-text', true, 'Wird abgelegt …')
  let antwort = null
  let nochmal = false
  try {
    antwort = await holeJson('/admin/social-cards/entwuerfe/eigen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch (err) {
    if (err.status === 409 && err.data?.ersetzbar && !ersetzen) {
      nochmal = await bestaetige({ frage: 'Eigenen Entwurf ersetzen?', text: `${serverFehlerText(err)} Er ist noch offen und wird durch diese Karte ersetzt.`, aktion: 'Ersetzen' })
      if (!nochmal) socialEdMeldung('text', 'Nicht abgelegt – der vorhandene Entwurf bleibt.', 'warn')
    } else {
      socialEdMeldung('text', `Nicht abgelegt: ${serverFehlerText(err)}`, 'error', { fokus: true })
    }
  } finally {
    soAblegenLaeuft = false
    setzeKnopfBusy('so-ed-ablegen', 'so-ed-ablegen-text', false, 'Als Entwurf ablegen')
  }
  if (nochmal) return socialEdAblegen({ ersetzen: true })
  if (!antwort) return
  const tag = datumKurz(body.datum)
  const mitAufl = antwort.entwuerfe.length > 1 ? ` samt Auflösung am ${datumKurz(addTageIso(body.datum, 1))}` : ''
  const bild = antwort.bildFehlt ? ' Das Bild ließ sich gerade nicht zeichnen; es entsteht beim Öffnen der Entwürfe.' : ''
  const woche = antwort.wocheFreigegeben >= 3
    ? ` In dieser Woche sind schon ${antwort.wocheFreigegeben} Beiträge freigegeben; mit diesem wären es mehr als die geplanten drei.`
    : ''
  socialEdMeldung('text', `Als eigener Entwurf für ${tag} abgelegt${mitAufl}. Freigeben unter „Entwürfe“.${bild}${woche}`, woche || bild ? 'warn' : 'ok', { fokus: true })
}

async function socialEdKopieren() {
  if (!kartenModul) return
  const set = soWert('so-tags')
  const tags = set ? kartenModul.hashtagsFor(set) : ''
  const text = soWert('so-text').trim()
  try {
    await navigator.clipboard.writeText(tags ? `${text}\n\n${tags}` : text)
    socialEdMeldung('text', tags ? 'Text mit Hashtags kopiert.' : 'Text kopiert.', 'ok')
  } catch {
    soEl('so-text').select()
    socialEdMeldung('text', 'Kopieren ging nicht. Der Text ist markiert – mit Strg+C (Mac: Cmd+C) kopieren; Hashtags darunter von Hand ergänzen.', 'warn')
  }
}

function socialChipsAnzahl() {
  const anzahl = (id) => soWert(id).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4).length
  return anzahl('so-c-koll-a') + anzahl('so-c-koll-b')
}

// „Reihenfolge neu mischen“: nie dieselbe Reihenfolge noch einmal, und es sagt, was passiert ist
function socialMischen() {
  if (soEd.vorlage === 'C') {
    const n = socialChipsAnzahl()
    if (n < 2) {
      socialEdMeldung('vorschau', 'Mit weniger als zwei Kollokatoren gibt es nichts zu mischen.', 'warn')
      return
    }
    soEd.chipsGemischt = soMische(n, soEd.chipsGemischt?.length === n ? soEd.chipsGemischt : null)
  } else {
    soEd.reihenfolge = soMische(3, soEd.reihenfolge)
  }
  socialEdMeldung('vorschau', 'Reihenfolge neu gemischt.', 'ok')
  void socialZeichne()
}

function socialVorschlagSchalten(knopf) {
  const feld = knopf.dataset.feld
  if (feld !== 'so-c-koll-a' && feld !== 'so-c-koll-b') return
  const eingabe = soEl(feld)
  const woerter = eingabe.value.split(',').map((s) => s.trim()).filter(Boolean)
  const w = knopf.dataset.wort || ''
  const drin = woerter.includes(w)
  if (!drin && woerter.length >= 4) {
    socialEdMeldung('vorschlag', 'Die Karte zeigt höchstens vier Kollokatoren je Wort. Erst einen abwählen.', 'warn')
    return
  }
  socialEdMeldung('vorschlag', '')
  eingabe.value = (drin ? woerter.filter((x) => x !== w) : [...woerter, w]).join(', ')
  knopf.setAttribute('aria-pressed', String(!drin))
  void socialZeichne()
}

function socialZitatEinsetzen() {
  const b = soEd.xBelege[Number(soWert('so-x-beleg'))]
  if (!b || !kartenModul) {
    socialEdMeldung('korpus', 'Erst einen Kollokator mit Beleg wählen.', 'warn')
    return
  }
  soEl('so-x-rubrik').value = 'Zitat'
  soEl('so-x-text').value = kartenModul.belegText(b.tokens)
  soEl('so-x-titel').value = b.quelle || ''
  socialEdMeldung('korpus', 'Zitat eingesetzt: Rubrik, Text und Quelle sind gefüllt.', 'ok')
  void socialZeichne()
}

// ── Ereignisse ──

function socialKlick(knopf) {
  const { action, id } = knopf.dataset
  if (knopf.classList.contains('is-busy')) return
  switch (action) {
    case 'so-freigeben': return void socialFreigeben(id, knopf)
    case 'so-speichern': return void socialSpeichern(id, knopf)
    case 'so-kopieren': return void socialKopieren(id)
    case 'so-verwerfen': return void socialVerwerfen(id, knopf)
    case 'so-oeffnen': return void socialOeffnen(id, knopf)
    case 'so-neu': return void socialNeuErstellen(id, knopf)
    case 'so-pf-anlegen': return void socialAnlegen()
    case 'so-pf-neu-laden':
      setMeldung('so-pf-meldung', '')
      return void ladeSocialEntwuerfe({ neu: true })
    case 'so-ed-laden': return void socialLaden()
    case 'so-ed-mischen': return void socialMischen()
    case 'so-ed-kopieren': return void socialEdKopieren()
    case 'so-ed-ablegen': return void socialEdAblegen()
    case 'so-ed-text-neu':
      socialTextAktualisieren({ neu: true })
      return void soEl('so-text').focus()
    case 'so-ed-neu-laden': return void ladeSocialTag()
    case 'so-ed-seite-neu': return void window.location.reload()
    case 'so-c-vorschlag': return void socialVorschlagSchalten(knopf)
    case 'so-x-korpus-auf': {
      const auf = knopf.getAttribute('aria-expanded') !== 'true'
      knopf.setAttribute('aria-expanded', String(auf))
      soEl('so-x-korpus').classList.toggle('is-hidden', !auf)
      return
    }
    case 'so-x-zitat': return void socialZitatEinsetzen()
    default:
  }
}

// Eine Rückmeldung zu „Bild gespeichert“ oder „Text kopiert“ gilt nach einer Änderung nicht mehr
function socialEdMeldungenLeeren(t) {
  const textFeld = t.id === 'so-text' || t.id === 'so-tags' || t.id === 'so-text-vorlage'
  if (textFeld) socialEdMeldung('text', '')
  else socialEdMeldung('vorschau', '')
}

function socialEingabe(ev) {
  const t = ev.target
  if (t.matches('textarea[data-id]')) return void socialTextEingabe(t)
  if (!t.closest('#so-ed')) return
  socialEdMeldungenLeeren(t)
  if (t.id === 'so-text') {
    soEd.textGeaendert = true
    socialTextAktualisieren()
    return
  }
  if (t.type === 'radio' || t.type === 'checkbox' || t.tagName === 'SELECT' || t.id === 'so-datum') return
  if (['so-c-koll-a', 'so-c-koll-b', 'so-c-wort-a', 'so-c-wort-b'].includes(t.id)) socialVorschlaege()
  void socialZeichne()
}

// Ein Bild der Entwurfsliste lässt sich nicht laden: erst die große Fassung versuchen (die kleine fehlt dann noch),
// danach ein Platzhalter statt des kaputten Bildsymbols. Das error-Ereignis steigt nicht auf, daher in der Fangphase.
document.addEventListener('error', (ev) => {
  const img = ev.target
  if (!(img instanceof HTMLImageElement) || !img.closest('.so-bild')) return
  if (img.dataset.gross && !img.dataset.fallback) {
    img.dataset.fallback = '1'
    img.src = img.dataset.gross
    return
  }
  const platz = document.createElement('div')
  platz.className = 'so-bild so-bild--text'
  platz.textContent = 'Bild nicht verfügbar'
  img.closest('.so-bild').replaceWith(platz)
}, true)

function socialAenderung(ev) {
  const t = ev.target
  if (!t.closest('#so-ed')) return
  socialEdMeldungenLeeren(t)
  if (t.id === 'so-datum') {
    if (isValidIsoDay(t.value) && t.value !== soEd.datum) {
      soEd.datum = t.value
      merkeSocialEditor()
      void ladeSocialTag()
    }
    return
  }
  if (t.name === 'so-vorlage') return void wechsleSocialVorlage(t.value)
  if (t.id === 'so-wort') return void ladeSocialWort()
  if (t.id === 'so-b-kollokator') return void ladeSocialBelege('b')
  if (t.id === 'so-b-beleg') return void setzeSocialBeleg()
  if (t.id === 'so-x-kollokator') return void ladeSocialBelege('x')
  if (t.id === 'so-b-optionen') soEl('so-b-ablenker').hidden = !t.checked
  if (t.id === 'so-text-vorlage') {
    soEd.textGeaendert = false
    if (Number(t.value) === SO_MIT_TAGS_IM_TEXT[soEd.vorlage]) soEl('so-tags').value = ''
    else if (!soWert('so-tags') && kartenModul) soEl('so-tags').value = kartenModul.SUGGESTED_HASHTAG_SET[soEd.vorlage]
    return void socialTextAktualisieren()
  }
  if (t.id === 'so-tags') return void socialTextAktualisieren()
  void socialZeichne()
}

// ── Werkzeuge › Inhalte: Formulare und Dialoge ────────────

// Absenden (Enter im Feld oder Knopf). Die Formulare sind novalidate: Geprüft wird in den Funktionen, mit eigenen Texten.
document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || form.method === 'dialog') return
  if (form.classList.contains('in-pruef')) { event.preventDefault(); void pruefe(form.dataset.modus); return }
  if (form.id === 'bonus-form') { event.preventDefault(); addFreeDay(); return }
  if (form.id === 'sw-form') { event.preventDefault(); void saveSpezialwoche(); return }
  if (form.id === 'demo-form') { event.preventDefault(); void saveDemoEditor(); return }
  // Social Cards › Selbst gestalten: Enter in einem Feld schickt nichts ab (die Karte zeichnet sich bei jeder Eingabe)
  if (form.id === 'so-ed') { event.preventDefault(); return }
  // „Test an meine Geräte“ läuft über den Klick auf den Knopf (handleDocumentClick); das Absenden selbst tut nichts
  if (form.id === 'push-form') event.preventDefault()
})

const bestaetigeDialog = document.getElementById('bestaetige-dialog')
if (bestaetigeDialog) {
  document.getElementById('bestaetige-abbrechen').addEventListener('click', () => bestaetigeLauf?.beende(false))
  document.getElementById('bestaetige-ok').addEventListener('click', (event) => {
    const lauf = bestaetigeLauf
    if (!lauf) return
    // Die Sperre gilt nur für Mausklicks (detail > 0); Enter/Leertaste auf dem Knopf (detail 0) wirken sofort.
    if (event.detail > 0 && performance.now() - lauf.seit < BESTAETIGE_SPERRE_MS) return
    lauf.beende(true)
  })
  // Esc und Schließen von außen (Seitenwechsel): wie „Abbrechen“. Das späte close einer schon ersetzten Frage
  // trifft die neue nicht: Bei ihr ist der Dialog wieder offen.
  bestaetigeDialog.addEventListener('close', () => { if (!bestaetigeDialog.open) bestaetigeLauf?.beende(false) })
}

const pushDialog = document.getElementById('push-dialog')
if (pushDialog) {
  // Esc und „Abbrechen“ sind während des Versands gesperrt: Der Dialog zeigt, dass er läuft
  pushDialog.addEventListener('cancel', (event) => { if (sendetAnAlle) event.preventDefault() })
  pushDialog.addEventListener('close', () => {
    const erfolg = pushDialogErfolg
    pushDialogErfolg = false
    if (!erfolg && currentRoute?.page === 'push') document.getElementById('push-alle')?.focus()
  })
}
