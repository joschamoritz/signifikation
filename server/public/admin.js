// ── Auth: httpOnly-Cookie ─────────────────────────────────
// Token wird als httpOnly-Cookie gesetzt und vom Browser automatisch
// bei jedem Request mitgesendet. Kein Token in sessionStorage nötig.
// credentials: 'same-origin' ist der Browser-Standard für same-origin Requests.
function clearToken() { /* noop – Cookie wird serverseitig via /admin/logout gelöscht */ }

// ── XSS-Schutz ───────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

let usersLoaded = false
let selectedCalendarDate = ''
let selectedUserId = ''
let dashboardWeekOffset = 0
const selectedEntryDates = new Set()
let sessionRefreshTimer = null
let usersSearchTimer = null
let usersOverviewAbortController = null
let currentAuditEntries = []

function getCurrentDate() {
  return new Date()
}

function getTodayIso() {
  return getCurrentDate().toISOString().slice(0, 10)
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

function setPageMeta(pageEl) {
  const titleEl = document.getElementById('page-title')
  const subtitleEl = document.getElementById('page-subtitle')
  if (!titleEl || !subtitleEl || !pageEl) return
  titleEl.textContent = pageEl.dataset.title || 'Dashboard'
  subtitleEl.textContent = pageEl.dataset.subtitle || ''
}

function switchPage(pageId) {
  const pages = document.querySelectorAll('.admin-page')
  pages.forEach((page) => {
    const isActive = page.id === `page-${pageId}`
    page.classList.toggle('is-active', isActive)
    if (isActive) setPageMeta(page)
  })

  const navItems = document.querySelectorAll('.admin-nav .nav-item[data-page]')
  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.page === pageId)
  })

  if (pageId === 'users' && !usersLoaded) {
    loadUsersOverview()
  }

  if (pageId === 'system') {
    loadAuditLog()
  }

  if (pageId === 'freedays') {
    loadFreeDays()
  }
}

function refreshDashboard() {
  loadHealth()
  loadKalender()
  loadStats()
  loadPerformance()
  if (usersLoaded) loadUsersOverview()
}

function formatIsoDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
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

function startOfDay(date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function formatDayMonth(date) {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function formatWeekRange(startDate, endDate) {
  const startLabel = formatDayMonth(startDate)
  const endLabel = formatDayMonth(endDate)
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startLabel} - ${endLabel}`
  }
  return `${startLabel} ${startDate.getFullYear()} - ${endLabel} ${endDate.getFullYear()}`
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
  if (roleWrap) roleWrap.style.display = action === 'setRole' ? 'inline-flex' : 'none'
  if (exportWrap) exportWrap.style.display = action === 'export' ? 'inline-flex' : 'none'
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
  const ok = window.confirm(`${ids.length} Nutzer wirklich ${actionLabel}?`)
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
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signifikation-users-bulk-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
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
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `signifikation-users-bulk-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
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
      document.getElementById('main-container').style.display = 'flex'
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
  const r = await fetch('/admin/backup')
  if (!r.ok) { alert('Backup fehlgeschlagen.'); return }
  const blob = await r.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `signifikation-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
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
    const ok = window.confirm('Backup wirklich wiederherstellen? Der aktuelle Datenbestand wird überschrieben.')
    if (!ok) return

    const response = await fetch('/admin/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, confirm: true }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const restored = data.restored || {}
    alert(`Backup wiederhergestellt: ${restored.lemmata || 0} Lemmata, ${restored.kalender || 0} Kalendertage.`)
    refreshDashboard()
  } catch (err) {
    alert(`Backup-Restore fehlgeschlagen: ${err.message}`)
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
    const response = await fetch('/admin/kalender/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    setStatus(`${data.importedCount || 0} Einträge per CSV importiert, ${data.replacedCount || 0} ersetzt.`, 'ok')
    await loadKalender()
  } catch (err) {
    setStatus(`CSV-Import fehlgeschlagen: ${err.message}`, 'error')
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
  await fetch('/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  document.getElementById('main-container').style.display = 'none'
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
    document.getElementById('main-container').style.display = 'flex'
    scheduleSessionRefresh()
    initDashboard()
  }
  // Kein Cookie oder abgelaufen → Login-Overlay bleibt sichtbar
}).catch(() => {})

function initDashboard() {
  switchPage('dashboard')
  loadKalender()
  loadStats()
  loadPerformance()
  loadHealth()
  loadUsersOverview()
}


// ── System-Status ─────────────────────────────────────────────────────────────
async function loadHealth() {
  const container = document.getElementById('health-badges')
  if (!container) return
  try {
    const r    = await fetch('/admin/health')
    const data = await r.json()

    const dbOk   = s => s === 'ok'
    const badge  = (label, ok, detail = '') => {
      const color = ok ? '#166534' : '#991b1b'
      const bg    = ok ? '#dcfce7' : '#fee2e2'
      const icon  = ok ? '✓' : '✗'
      return `<span style="display:inline-flex;align-items:center;gap:4px;
        font-size:0.75rem;font-weight:500;padding:2px 8px;border-radius:99px;
        background:${bg};color:${color}">
        ${icon} ${esc(label)}${detail ? ` <span style="font-weight:400;opacity:.75">${esc(detail)}</span>` : ''}
      </span>`
    }

    const upMin  = Math.floor(data.uptime / 60)
    const uptime = upMin < 60 ? `${upMin} min` : `${Math.floor(upMin / 60)} h`
    const processLabel = data.process?.pid ? `PID ${data.process.pid}` : 'PID -'
    const allStable = dbOk(data.wortprofilDb) && dbOk(data.belegeDb)

    container.innerHTML = [
      badge('Server', true, `${uptime} · ${data.memMb} MB`),
      badge('wortprofil.db', dbOk(data.wortprofilDb), dbOk(data.wortprofilDb) ? '' : data.wortprofilDb),
      badge('belege.db', dbOk(data.belegeDb), dbOk(data.belegeDb) ? '' : data.belegeDb),
      `<span style="font-size:0.72rem;color:var(--muted)">${esc(data.env)}</span>`,
    ].join('')

    const healthSummary = document.getElementById('health-summary')
    if (healthSummary) {
      healthSummary.textContent = allStable
        ? 'Alle Systeme stabil und erreichbar.'
        : 'Mindestens ein System braucht Aufmerksamkeit.'
    }

    const metricHealth = document.getElementById('metric-health')
    const metricHealthSub = document.getElementById('metric-health-sub')
    if (metricHealth) metricHealth.textContent = allStable ? 'Stabil' : 'Warnung'
    if (metricHealthSub) metricHealthSub.textContent = `${uptime} · ${data.memMb} MB · ${processLabel}`

    const details = document.getElementById('system-health-details')
    if (details) {
      details.innerHTML = [
        `<div class="health-detail-item"><span>Uptime</span><strong>${esc(uptime)}</strong></div>`,
        `<div class="health-detail-item"><span>Memory</span><strong>${esc(String(data.memMb))} MB</strong></div>`,
        `<div class="health-detail-item"><span>Prozess</span><strong>${esc(processLabel)}</strong></div>`,
        `<div class="health-detail-item"><span>Environment</span><strong>${esc(data.env)}</strong></div>`,
        `<div class="health-detail-item"><span>Letzter Eintrag</span><strong>${esc(data.lastEntry || '—')}</strong></div>`,
      ].join('')
    }

    const systemJson = document.getElementById('system-health-json')
    if (systemJson) {
      systemJson.textContent = JSON.stringify(data, null, 2)
    }
  } catch (err) {
    container.innerHTML = `<span style="font-size:0.8rem;color:#991b1b">Health-Check fehlgeschlagen: ${esc(err.message)}</span>`
    const healthSummary = document.getElementById('health-summary')
    if (healthSummary) healthSummary.textContent = 'Systemstatus konnte nicht geladen werden.'
    const metricHealth = document.getElementById('metric-health')
    const metricHealthSub = document.getElementById('metric-health-sub')
    if (metricHealth) metricHealth.textContent = 'Fehler'
    if (metricHealthSub) metricHealthSub.textContent = 'Health nicht erreichbar'

    const systemJson = document.getElementById('system-health-json')
    if (systemJson) {
      systemJson.textContent = `Health-Check fehlgeschlagen: ${err.message}`
    }
  }
}

function toggleExtraFields(targetId) {
  const el = document.getElementById(targetId)
  if (!el) return
  const open = !el.classList.contains('is-hidden')
  el.classList.toggle('is-hidden', open)
  const btn = document.querySelector(`[data-target="${targetId}"]`)
  if (btn) {
    btn.textContent = open ? '+ Notiz / Link' : '− Notiz / Link'
    btn.classList.toggle('is-open', !open)
  }
}

function showExtraFields(targetId) {
  const el = document.getElementById(targetId)
  if (!el) return
  el.classList.remove('is-hidden')
  const btn = document.querySelector(`[data-target="${targetId}"]`)
  if (btn) {
    btn.textContent = '− Notiz / Link'
    btn.classList.add('is-open')
  }
}

function hideAllExtraFields() {
  ;['koll-extras-1', 'koll-extras-2', 'koll-extras-3', 'wz-extras', 'zw-extras'].forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.classList.add('is-hidden')
    const btn = document.querySelector(`[data-target="${id}"]`)
    if (btn) {
      btn.textContent = '+ Notiz / Link'
      btn.classList.remove('is-open')
    }
  })
}

function updateModeIndicators() {
  const w1 = document.getElementById('w1')?.value.trim()
  const w2 = document.getElementById('w2')?.value.trim()
  const w3 = document.getElementById('w3')?.value.trim()
  const wza = document.getElementById('wza')?.value.trim()
  const wzb = document.getElementById('wzb')?.value.trim()
  const zwLemma = document.getElementById('zw-lemma')?.value.trim()
  const lfId = document.getElementById('lf-id')?.value.trim()

  document.getElementById('koll-indicator')?.classList.toggle('is-filled', !!(w1 && w2 && w3))
  document.getElementById('wz-indicator')?.classList.toggle('is-filled', !!(wza && wzb))
  document.getElementById('zw-indicator')?.classList.toggle('is-filled', !!zwLemma)
  document.getElementById('lf-indicator')?.classList.toggle('is-filled', !!lfId)
}

let kalenderData = {}
let calYear, calMonth

const initialNow = getCurrentDate()
calYear  = initialNow.getFullYear()
calMonth = initialNow.getMonth()

document.getElementById('datum').value = getTodayIso()

// Indikatoren beim Tippen aktualisieren
document.getElementById('page-entry')?.addEventListener('input', () => updateModeIndicators())

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const DAYS_DE   = ['Mo','Di','Mi','Do','Fr','Sa','So']

function setStatus(msg, type) {
  const el = document.getElementById('status')
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
    const hasKoll     = !!(entry?.lemmata?.length)
    const hasWZ       = !!(entry?.hasWortZwilling)
    const hasZW       = !!(entry?.hasZeitenwende)
    const isTodayCell = key === todayIso

    // Vollständig = Kollokationen + mind. ein weiteres Spiel eingetragen
    const hasAny      = hasKoll || hasWZ || hasZW
    const isComplete  = hasKoll && (hasWZ || hasZW)
    const stateClass  = isComplete ? 'is-complete' : hasAny ? 'has-entry' : 'no-entry'

    const isSelected = key === selectedCalendarDate
    const classes = ['cal-day', stateClass, isTodayCell ? 'is-today' : '', isSelected ? 'is-selected' : ''].filter(Boolean).join(' ')

    let dots = ''
    if (hasAny) {
      dots = `<div class="cal-dots">` +
        (hasKoll ? '<div class="cal-dot koll"></div>' : '') +
        (hasWZ   ? '<div class="cal-dot wz"></div>'   : '') +
        (hasZW   ? '<div class="cal-dot zw"></div>'   : '') +
        `</div>`
    }

    const action = hasAny ? 'select-calendar-date' : 'prefill-date'
    html += `<button type="button" class="${classes}" data-action="${action}" data-value="${esc(key)}" aria-label="${hasAny ? `Eintrag ${formatIsoDate(key)} öffnen` : `Datum ${formatIsoDate(key)} vorausfüllen`}">${d}${dots}</button>`
  }

  grid.innerHTML = html
}

function selectCalendarDate(datum) {
  selectedCalendarDate = datum
  switchPage('calendar')
  renderCalendar()
  updateCalendarDetails(datum)
}

function changeMonth(delta) {
  calMonth += delta
  if (calMonth > 11) { calMonth = 0;  calYear++ }
  if (calMonth < 0)  { calMonth = 11; calYear-- }
  renderCalendar()
}

function prefillDate(isoDate) {
  switchPage('entry')
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
  document.getElementById('form-title').textContent = 'Neuer Tageseintrag'
  document.getElementById('save-btn').textContent   = 'Speichern & APIs abrufen'
  const deleteBtn = document.getElementById('delete-btn')
  if (deleteBtn) deleteBtn.disabled = true
  document.getElementById('status').className = 'status'
  document.getElementById('status').textContent = ''
  hideAllExtraFields()
  updateModeIndicators()
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

async function saveTag() {
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

  if (!datum || !w1 || !w2 || !w3) {
    return setStatus('Bitte Datum und alle drei Kollokations-Wörter ausfüllen.', 'error')
  }

  const btn = document.getElementById('save-btn')
  btn.disabled = true

  const statusParts = [`DWDS für „${w1}”, „${w2}”, „${w3}”`]
  if (wza && wzb) statusParts.push(`Wort-Zwilling „${wza}” / „${wzb}”`)
  if (zwLemma) statusParts.push(`Zeitenwende für „${zwLemma}”`)
  setStatus(`Rufe ab: ${statusParts.join(' · ')} …`, 'loading')

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
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

    let msg = `Gespeichert: ${datum} → ${data.ids.join(', ')}`
    if (wza && wzb) {
      msg += data.zwillingOk === true  ? ' · Wort-Zwilling: OK'
           : data.zwillingOk === false ? ' · Wort-Zwilling: nicht genug distinkte Kollokatoren'
           : ''
    }
    if (zwLemma) {
      msg += data.zeitenwendeOk === true  ? ' · Zeitenwende: OK'
           : data.zeitenwendeOk === false ? ' · Zeitenwende: nicht genug distinkte Kollokatoren'
           : ''
    }
    const hasError = data.zwillingOk === false || data.zeitenwendeOk === false
    setStatus(msg, hasError ? 'error' : 'ok')
    selectedCalendarDate = datum
    await loadKalender()
  } catch (err) {
    setStatus(`Fehler: ${err.message}`, 'error')
  } finally {
    btn.disabled = false
  }
}

async function editTag(datum) {
  switchPage('entry')
  selectedCalendarDate = datum
  const res  = await fetch(`/admin/tag/${datum}`, {})
  const data = await res.json()
  if (!res.ok) return alert(`Fehler: ${data.error}`)
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
  document.getElementById('lf-id').value       = data.lueckenfueller_id || ''
  document.getElementById('form-title').textContent = `Eintrag bearbeiten: ${datum}`
  document.getElementById('save-btn').textContent   = 'Aktualisieren & APIs abrufen'
  const deleteBtn = document.getElementById('delete-btn')
  if (deleteBtn) deleteBtn.disabled = false

  // Extra-Felder aufklappen wenn Daten vorhanden
  hideAllExtraFields()
  if (data.notizen?.[0] || data.links?.[0]) showExtraFields('koll-extras-1')
  if (data.notizen?.[1] || data.links?.[1]) showExtraFields('koll-extras-2')
  if (data.notizen?.[2] || data.links?.[2]) showExtraFields('koll-extras-3')
  if (data.zwilling_notiz || data.zwilling_link) showExtraFields('wz-extras')
  if (data.zeitenwende_notiz || data.zeitenwende_link) showExtraFields('zw-extras')
  updateModeIndicators()

  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  setStatus(`Eintrag ${datum} geladen – Änderungen vornehmen und speichern.`, 'loading')
}

async function deleteCurrentTag() {
  if (!selectedCalendarDate) return
  const ok = window.confirm(`Eintrag ${selectedCalendarDate} wirklich löschen?`)
  if (!ok) return

  const deleteBtn = document.getElementById('delete-btn')
  if (deleteBtn) deleteBtn.disabled = true

  try {
    const res = await fetch(`/admin/tag/${selectedCalendarDate}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

    selectedEntryDates.delete(selectedCalendarDate)
    setStatus(`Eintrag ${selectedCalendarDate} gelöscht.`, 'ok')
    const currentDate = document.getElementById('datum')?.value || new Date().toISOString().slice(0, 10)
    prefillDate(currentDate)
    await loadKalender()
  } catch (err) {
    setStatus(`Löschen fehlgeschlagen: ${err.message}`, 'error')
  } finally {
    if (deleteBtn && selectedCalendarDate) deleteBtn.disabled = false
  }
}

async function loadKalender() {
  try {
    const res  = await fetch('/admin/kalender', {})
    kalenderData = await res.json()

    for (const datum of [...selectedEntryDates]) {
      if (!kalenderData[datum]) selectedEntryDates.delete(datum)
    }

    if (selectedCalendarDate && !kalenderData[selectedCalendarDate]) {
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
    selectedCalendarDate = ''
    selectedEntryDates.clear()
    renderCalendar()
    updateDashboardFromKalender()
    renderEntryTable()
    updateCalendarDetails('')
  }
}

function renderEntryTable() {
  const tbody = document.getElementById('entry-table-body')
  const countEl = document.getElementById('entry-count')
  if (!tbody || !countEl) return

  const search = (document.getElementById('entry-search')?.value || '').trim().toLowerCase()
  const modeFilter = document.getElementById('entry-mode-filter')?.value || 'all'

  const entries = getCalendarEntries()

  const filtered = entries.filter(({ datum, entry }) => {
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

  countEl.textContent = `${filtered.length} von ${entries.length} Einträgen`

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="entry-empty">Keine Einträge für den aktuellen Filter.</td></tr>'
    updateEntryBulkState([])
    return
  }

  const visibleDates = filtered.map((item) => item.datum)
  visibleDates.forEach((datum) => {
    if (selectedEntryDates.has(datum) && !kalenderData[datum]) selectedEntryDates.delete(datum)
  })

  tbody.innerHTML = filtered.map(({ datum, iso, entry }) => {
    const summaryHtml = renderModeGroupSummary(entry)
    const checked = selectedEntryDates.has(datum) ? 'checked' : ''

    return `<tr>
      <td class="entry-select-col"><input type="checkbox" ${checked} data-action="toggle-entry-selection" data-datum="${datum}"></td>
      <td><strong>${esc(formatMmdd(datum))}</strong><br><span class="entry-hint">${esc(datum)}</span></td>
      <td><div class="mode-summary-list">${summaryHtml}</div></td>
      <td><div class="entry-chip-wrap">${modeChips(entry)}</div></td>
      <td>
        <div class="entry-row-actions">
          <button class="entry-action-btn" data-action="edit-tag" data-datum="${datum}">Bearbeiten</button>
          <button class="entry-action-btn" data-action="focus-calendar-date" data-value="${datum}">Im Kalender</button>
        </div>
      </td>
    </tr>`
  }).join('')

  updateEntryBulkState(visibleDates)
}

function resetEntryFilters() {
  const searchInput = document.getElementById('entry-search')
  const modeFilter = document.getElementById('entry-mode-filter')
  if (searchInput) searchInput.value = ''
  if (modeFilter) modeFilter.value = 'all'
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
  const ok = window.confirm(`${dates.length} Einträge wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)
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
    setStatus(`${data.removedCount || 0} Einträge gelöscht, ${data.skippedCount || 0} übersprungen.`, 'ok')
    await loadKalender()
  } catch (err) {
    setStatus(`Bulk-Löschen fehlgeschlagen: ${err.message}`, 'error')
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
  renderCalendar()
  switchPage('calendar')
  updateCalendarDetails(datum)
}

function changeDashboardWeek(delta) {
  dashboardWeekOffset += delta
  updateDashboardFromKalender()
}

function updateCalendarDetails(datum) {
  const details = document.getElementById('calendar-details')
  const editBtn = document.getElementById('calendar-edit-btn')
  if (!details || !editBtn) return

  if (!datum || !kalenderData[datum]) {
    details.innerHTML = '<div class="calendar-detail-empty">Wähle einen Kalendertag mit Eintrag, um Details zu sehen.</div>'
    editBtn.disabled = true
    selectedCalendarDate = ''
    return
  }

  selectedCalendarDate = datum
  editBtn.disabled = false

  const entry = kalenderData[datum]
  const groupedHtml = renderModeGroupSummary(entry)

  details.innerHTML = `
    <div class="calendar-detail-head">
      <strong>${esc(formatIsoDate(datum))}</strong>
      <span>${esc(datum)}</span>
    </div>
    <div class="calendar-detail-section">
      <h3>Inhalte nach Modus</h3>
      <div class="mode-summary-list">${groupedHtml}</div>
    </div>
    <div class="calendar-detail-section">
      <h3>Modi</h3>
      <div class="calendar-detail-list">${modeChips(entry)}</div>
    </div>
  `
}

function editSelectedCalendarDate() {
  if (!selectedCalendarDate) return
  editTag(selectedCalendarDate)
}

function updateDashboardFromKalender() {
  const entries = getCalendarEntries()
  const metricDays = document.getElementById('metric-calendar-days')
  const today = getCurrentDate()
  const todayKey = getTodayIso()
  const futureEntries = entries.filter((entry) => entry.datum >= todayKey)
  if (metricDays) metricDays.textContent = String(futureEntries.length)

  const todayEntry = kalenderData?.[todayKey]
  const metricToday = document.getElementById('metric-today-status')
  const metricTodaySub = document.getElementById('metric-today-sub')
  const metricTodayCard = document.getElementById('metric-today-card')
  const todayModes = todayEntry ? getModeGroups(todayEntry).length : 0
  const todayComplete = todayModes >= 4
  if (metricToday) metricToday.textContent = todayEntry ? 'Geplant' : 'Offen'
  if (metricTodaySub) metricTodaySub.textContent = todayEntry ? `${todayModes} Spielmodi aktiv` : 'Noch nichts geplant'
  if (metricTodayCard) {
    metricTodayCard.classList.toggle('is-empty', !todayEntry)
    metricTodayCard.classList.toggle('is-complete', !!todayComplete)
  }

  const preview = document.getElementById('dashboard-calendar-preview')
  if (!preview) return
  if (!entries.length) {
    preview.innerHTML = '<div class="preview-empty">Noch keine Kalendereinträge vorhanden.</div>'
    return
  }

  const weekLabel = document.getElementById('dashboard-week-label')
  const baseDate = startOfDay(today)
  baseDate.setDate(baseDate.getDate() + (dashboardWeekOffset * 7))
  const startOfWeek = new Date(today)
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setTime(baseDate.getTime())
  startOfWeek.setDate(baseDate.getDate() - ((baseDate.getDay() + 6) % 7))
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  if (weekLabel) weekLabel.textContent = formatWeekRange(startOfWeek, endOfWeek)

  const weekItems = Array.from({ length: 7 }, (_, index) => {
    const dateObj = new Date(startOfWeek)
    dateObj.setDate(startOfWeek.getDate() + index)
    const iso = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
    return {
      datum: iso,  // datum ist jetzt immer YYYY-MM-DD
      label: dateObj.toLocaleDateString('de-DE', { weekday: 'short' }),
      dayNumber: dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      isToday: iso === todayKey,
      entry: kalenderData?.[iso] || null,
    }
  })

  preview.innerHTML = weekItems.map((item) => {
    const groups = item.entry ? getModeGroups(item.entry) : []
    const content = item.entry
      ? renderModeGroupSummary(item.entry, { emptyText: 'Keine Inhalte' })
      : '<span class="entry-empty">Kein Eintrag</span>'
    const action = item.entry ? 'focus-calendar-date' : 'prefill-date'
    return `<button type="button" class="week-preview-card ${item.isToday ? 'is-today' : ''} ${item.entry ? 'has-entry' : 'is-empty'}" data-action="${action}" data-value="${esc(item.datum)}">
      <span class="week-preview-day">${esc(item.label)}</span>
      <strong>${esc(item.dayNumber)}</strong>
      <span class="week-preview-meta">${item.entry ? `${groups.length} Modi` : 'Leer'}</span>
      <div class="mode-summary-list">${content}</div>
    </button>`
  }).join('')
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

  tbody.innerHTML = '<tr><td colspan="5" class="users-empty">Audit-Log wird geladen …</td></tr>'

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
      tbody.innerHTML = '<tr><td colspan="5" class="users-empty">Noch keine Audit-Einträge vorhanden.</td></tr>'
      return
    }

    tbody.innerHTML = entries.map((entry, index) => {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('de-DE') : '—'
      const action = entry.action || '—'
      const resource = entry.resourceId ? `${entry.resource || '—'}:${entry.resourceId}` : (entry.resource || '—')
      const status = entry.status || '—'
      const changes = summarizeAuditChanges(entry.changes)
      return `<tr>
        <td>${esc(time)}</td>
        <td>${esc(action)}</td>
        <td>${esc(resource)}</td>
        <td>${esc(status)}</td>
        <td><button class="entry-action-btn" data-action="show-audit-entry-details" data-index="${index}">${esc(changes)}</button></td>
      </tr>`
    }).join('')
    showAuditEntryDetails(entries[0])
  } catch (err) {
    if (countEl) countEl.textContent = 'Audit-Log konnte nicht geladen werden.'
    tbody.innerHTML = `<tr><td colspan="5" class="users-empty">Audit-Log konnte nicht geladen werden: ${esc(err.message)}</td></tr>`
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

async function previewCurrentLemma() {
  const out = document.getElementById('entry-preview-output')
  const lemma = document.getElementById('w1')?.value?.trim() || ''
  const pos = document.getElementById('p1')?.value || 'Substantiv'
  if (!out) return

  if (!lemma) {
    out.innerHTML = '<div class="users-empty">Bitte zuerst Wort 1 ausfüllen, um eine Lemma-Vorschau zu laden.</div>'
    return
  }

  out.innerHTML = '<div class="users-empty">Lemma-Vorschau wird geladen …</div>'
  try {
    const response = await fetch('/admin/preview/lemma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lemma, pos }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const defs = Array.isArray(data.definitionen) && data.definitionen.length
      ? data.definitionen.map((item) => `<li>${esc(item)}</li>`).join('')
      : '<li>Keine Wiktionary-Bedeutungen vorhanden.</li>'

    const roundSummary = Array.isArray(data.rundenSummary) && data.rundenSummary.length
      ? data.rundenSummary.map((round) => `<li>${esc(round.label || round.key)}: ${esc(String(round.count || 0))}</li>`).join('')
      : '<li>Keine Runden-Daten verfügbar.</li>'

    const bonusHtml = data.bonusFrage
      ? `<p><strong>${esc(data.bonusFrage.label || 'Bonusfrage')}:</strong> ${esc(data.bonusFrage.question || '—')}</p>`
      : '<p>Keine Bonusfrage vorhanden.</p>'

    out.innerHTML = `
      <article class="entry-preview-card">
        <h3>${esc(data.lemma || lemma)}</h3>
        <div class="entry-preview-meta">Wortart: ${esc(data.pos || pos)} · IPA: ${esc(data.ipa || '—')}</div>
        <div class="entry-preview-meta">Runden: ${esc(String(Array.isArray(data.rundenInfo) ? data.rundenInfo.length : 0))}</div>
      </article>
      <article class="entry-preview-card">
        <h3>Rundenübersicht</h3>
        <ul>${roundSummary}</ul>
      </article>
      <article class="entry-preview-card">
        <h3>Bonus</h3>
        ${bonusHtml}
      </article>
      <article class="entry-preview-card">
        <h3>Bedeutungen</h3>
        <ul>${defs}</ul>
      </article>
    `
  } catch (err) {
    out.innerHTML = `<div class="users-empty">Lemma-Vorschau fehlgeschlagen: ${esc(err.message)}</div>`
  }
}

async function previewCurrentDay() {
  const out = document.getElementById('entry-preview-output')
  const iso = document.getElementById('datum')?.value || ''
  if (!out) return

  if (!iso) {
    out.innerHTML = '<div class="users-empty">Bitte zuerst ein Datum wählen.</div>'
    return
  }

  const [, mm, dd] = iso.split('-')
  const datum = mm && dd ? `${mm}-${dd}` : ''
  if (!datum) {
    out.innerHTML = '<div class="users-empty">Ungültiges Datumsformat.</div>'
    return
  }

  out.innerHTML = '<div class="users-empty">Tages-Vorschau wird geladen …</div>'
  try {
    const response = await fetch(`/admin/preview/day/${encodeURIComponent(datum)}`, {})
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const modes = data.modes || {}
    const modeChipsHtml = [
      modes.kollokationen?.enabled ? '<span class="entry-chip mode-koll">Kollokation</span>' : '',
      modes.wortzwilling?.enabled ? '<span class="entry-chip mode-wortzwilling">Wort-Zwilling</span>' : '',
      modes.zeitenwende?.enabled ? '<span class="entry-chip mode-zeitenwende">Zeitenwende</span>' : '',
    ].filter(Boolean).join('') || '<span class="users-empty">Keine Modi aktiv.</span>'

    const grouped = Array.isArray(data.modeGroups)
      ? data.modeGroups.map((group) => `<div class="mode-summary-group">
          <span class="entry-chip ${modeGroupKeyToClass(group.key)}">${esc(group.label)}</span>
          <div class="entry-chip-wrap">${(group.items || []).map((item) => `<span class="entry-chip">${esc(item)}</span>`).join('')}</div>
        </div>`).join('')
      : '<span class="users-empty">Keine Inhalte vorhanden.</span>'

    out.innerHTML = `
      <article class="entry-preview-card">
        <h3>Tages-Vorschau ${esc(formatIsoDate(toIsoFromMMDD(data.datum || datum)))}</h3>
        <div class="mode-summary-list">${grouped}</div>
      </article>
      <article class="entry-preview-card">
        <h3>Aktive Modi</h3>
        <div class="entry-preview-list">${modeChipsHtml}</div>
      </article>
    `
  } catch (err) {
    out.innerHTML = `<div class="users-empty">Tages-Vorschau fehlgeschlagen: ${esc(err.message)}</div>`
  }
}

function renderKollAnalyse(data, out) {
  const badge = data.usable
    ? '<span style="color:#166534;font-weight:700">✓ Geeignet als Kollokationswort</span>'
    : '<span style="color:#991b1b;font-weight:700">✗ Nicht geeignet (zu wenig Kollokatoren)</span>'

  let html = `<div style="margin:12px 0 16px">${badge}</div>`

  // Top 3 gesamt – primäre Anzeige (entspricht Spielmodus)
  if (data.top3?.length) {
    html += `<div style="margin-bottom:16px">`
    html += `<strong style="font-size:0.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Top 3 Kollokationen gesamt</strong>`
    html += `<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">`
    data.top3.forEach((it, i) => {
      html += `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 14px;font-size:0.9rem;min-width:80px;text-align:center">`
      html += `<div style="font-size:0.72rem;color:var(--muted);margin-bottom:2px">Rang ${i + 1}</div>`
      html += `<strong>${esc(it.wort)}</strong>`
      html += `<div style="font-size:0.75rem;color:var(--muted);margin-top:2px">logDice ${it.logDice}</div>`
      html += `</div>`
    })
    html += `</div></div>`
  } else {
    html += `<div style="margin-bottom:16px;color:var(--muted);font-size:0.85rem">Keine Top-3-Kollokationen ermittelt.</div>`
  }

  // Bonusfrage
  if (data.bonus) {
    html += `<div style="margin-bottom:14px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:0.82rem">`
    html += `<strong>Bonusfrage (${esc(data.bonus.label)}):</strong> ${esc(data.bonus.question)}<br>`
    html += `<span style="color:var(--muted)">Antwort: <strong>${esc(data.bonus.correct)}</strong> · Optionen: ${data.bonus.options.map(o => esc(o)).join(', ')}</span></div>`
  }

  // Relationen-Detail – eingeklappt (für Diagnose)
  if (data.runden?.length) {
    html += `<details style="margin-top:4px"><summary style="cursor:pointer;font-size:0.8rem;color:var(--muted);padding:4px 0">Relationen-Detail (${data.runden.length} Relationen)</summary>`
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:10px">`
    for (const runde of data.runden) {
      const ok = runde.usable
      html += `<div style="border:1.5px solid ${ok ? '#bbf7d0' : '#fca5a5'};border-radius:8px;padding:10px">`
      html += `<div style="font-weight:600;font-size:0.82rem;margin-bottom:6px">${esc(runde.label)} <span style="color:var(--muted);font-weight:400;font-size:0.75rem">(${runde.count || 0})</span></div>`
      if (runde.error) { html += `<div style="color:#991b1b;font-size:0.78rem">${esc(runde.error)}</div>` }
      else if (runde.items?.length) {
        html += `<ol style="padding-left:16px;font-size:0.8rem;display:flex;flex-direction:column;gap:3px">`
        for (const it of runde.items) {
          html += `<li>${esc(it.wort)} <span style="color:var(--muted);font-size:0.75em">${it.logDice}</span></li>`
        }
        html += `</ol>`
      } else { html += `<div style="color:var(--muted);font-size:0.8rem">Keine Ergebnisse</div>` }
      html += `</div>`
    }
    html += `</div></details>`
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
    updateDashboardFromStats(data)
  } catch (e) {
    out.innerHTML = `<div class="status error">Fehler: ${esc(e.message)}</div>`
    updateDashboardFromStats([])
  } finally {
    await loadStatsSummary(days)
  }
}

function updateDashboardFromStats(data) {
  const metricPlays = document.getElementById('metric-plays-today')
  const metricScore = document.getElementById('metric-score-today')
  if (!metricPlays || !metricScore) return
  if (!Array.isArray(data) || !data.length) {
    metricPlays.textContent = '0'
    metricScore.textContent = 'Ø - / 10'
    return
  }

  const now = new Date()
  const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const todayEntry = data.find((item) => item.datum === todayStr)
  if (!todayEntry) {
    metricPlays.textContent = '0'
    metricScore.textContent = 'Ø - / 10'
    return
  }

  const keys = ['kollokationen', 'wortzwilling', 'zeitenwende']
  let plays = 0
  let scoreSum = 0
  let maxSum = 0

  keys.forEach((key) => {
    const bucket = todayEntry[key]
    if (!bucket) return
    plays += Number(bucket.plays || 0)
    scoreSum += Number(bucket.scoreSum || 0)
    maxSum += Number(bucket.maxSum || 0)
  })

  metricPlays.textContent = String(plays)
  metricScore.textContent = maxSum > 0 ? `Ø ${((scoreSum / maxSum) * 10).toFixed(1)} / 10` : 'Ø - / 10'
}

async function loadUsersOverview() {
  const summary = document.getElementById('users-summary')
  const tbody = document.getElementById('users-table-body')
  if (!summary || !tbody) return

  if (usersOverviewAbortController) {
    usersOverviewAbortController.abort()
  }
  usersOverviewAbortController = new AbortController()

  const search = (document.getElementById('users-search')?.value || '').trim()
  const role = document.getElementById('users-role-filter')?.value || ''

  const params = new URLSearchParams({ limit: '50' })
  if (search) params.set('q', search)
  if (role) params.set('role', role)

  summary.textContent = 'Nutzerdaten werden geladen …'
  tbody.innerHTML = '<tr><td colspan="6" class="users-empty">Lade …</td></tr>'

  try {
    const response = await fetch(`/admin/users?${params.toString()}`, { signal: usersOverviewAbortController.signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)

    const info = data.summary || {}
    summary.textContent = `Gesamt: ${info.total || 0} · User: ${info.users || 0} · Premium: ${info.premium || 0} · Neu 30 Tage: ${info.newLast30Days || 0}`

    const users = Array.isArray(data.users) ? data.users : []
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="users-empty">Keine Nutzer gefunden.</td></tr>'
      clearSelectedUser('Keine Nutzer ausgewählt.')
    } else {
      tbody.innerHTML = users.map((user) => {
        const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-DE') : '—'
        const isSelected = user.id === selectedUserId
        const safeUserId = encodeURIComponent(String(user.id || ''))
        const safeRawUserId = esc(String(user.id || ''))
        return `<tr>
          <td><input type="checkbox" class="user-select-checkbox" data-user-id="${safeRawUserId}"></td>
          <td>${esc(user.name || '—')}</td>
          <td>${esc(user.email || '—')}</td>
          <td>${esc(roleLabel(user.role || 'user'))}</td>
          <td>${esc(created)}</td>
          <td><button class="entry-action-btn" data-action="select-user" data-user-id="${safeUserId}">${isSelected ? 'Ausgewählt' : 'Details'}</button></td>
        </tr>`
      }).join('')

      updateUsersBulkState()

      if (selectedUserId && users.some((user) => user.id === selectedUserId)) {
        await selectUser(selectedUserId, { keepScroll: true })
      } else {
        clearSelectedUser('Wähle einen Nutzer aus der Tabelle, um Details zu sehen.')
      }
    }

    usersLoaded = true
  } catch (err) {
    if (err.name === 'AbortError') return
    summary.textContent = `Nutzer konnten nicht geladen werden: ${err.message}`
    tbody.innerHTML = '<tr><td colspan="6" class="users-empty">Fehler beim Laden.</td></tr>'
    clearSelectedUser('Nutzerdetails konnten nicht geladen werden.')
    updateUsersBulkState()
  } finally {
    usersOverviewAbortController = null
    const roleBtn = document.getElementById('user-role-save-btn')
    if (roleBtn) roleBtn.disabled = !selectedUserId
  }
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

  if (statsChartTrend) { statsChartTrend.destroy(); statsChartTrend = null }
  if (statsChartDist)  { statsChartDist.destroy();  statsChartDist  = null }

  const trendLabels = last7.map((d) => formatIsoDate(d.datum))
  statsChartTrend = new Chart(document.getElementById('stats-trend-canvas').getContext('2d'), {
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

    out.innerHTML = `
      <div style="margin:12px 0 16px"><span style="color:#166534;font-weight:700">✓ Geeignet – ${data.rounds} Runden generierbar</span></div>
      <div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px">Wortart: ${esc(data.pos || '—')}</div>
      <div>${roundsHtml}</div>
    `
  } catch (e) { out.innerHTML = `<div class="status error">Netzwerkfehler: ${esc(e.message)}</div>` }
}

function resetLueckenfuellerAnalysis() {
  const output = document.getElementById('lf-ana-output')
  const input  = document.getElementById('lf-ana-input')
  if (output) output.innerHTML = ''
  if (input)  input.value = ''
}

// ── Lückenfüller – Generieren ─────────────────────────────
async function generateLueckenfueller() {
  const lemmaName = (document.getElementById('lf-id')?.value || '').trim()
  const statusEl  = document.getElementById('lf-generate-status')
  if (!lemmaName) { alert('Bitte zuerst einen Lemma-Namen eingeben.'); return }
  if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--muted)'; statusEl.textContent = `Generiere Lückenfüller für „${lemmaName}" …` }
  try {
    const res  = await fetch('/admin/lueckenfueller/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lemmaName }) })
    const data = await res.json()
    if (!res.ok) {
      if (statusEl) { statusEl.style.color = 'var(--danger, #c0392b)'; statusEl.textContent = `Fehler: ${data.error || 'Unbekannter Fehler'}` }
      return
    }
    if (!data.ok) {
      if (statusEl) { statusEl.style.color = 'var(--danger, #c0392b)'; statusEl.textContent = `Nicht möglich: ${data.reason || 'Kein Material verfügbar'}` }
      return
    }
    if (statusEl) { statusEl.style.color = 'var(--success, #27ae60)'; statusEl.textContent = `✓ Lückenfüller generiert für „${data.lemma}" – ${data.rounds} Runden` }
  } catch (err) {
    if (statusEl) { statusEl.style.color = 'var(--danger, #c0392b)'; statusEl.textContent = `Fehler: ${err.message}` }
  }
}

// ── Freitage ──────────────────────────────────────────────
async function loadFreeDays() {
  const listEl = document.getElementById('freedays-list')
  if (!listEl) return
  listEl.innerHTML = '<div class="users-empty">Wird geladen …</div>'
  try {
    const res = await fetch('/admin/free-days')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { days } = await res.json()
    if (!days.length) {
      listEl.innerHTML = '<div class="users-empty">Keine Freitage eingetragen.</div>'
      return
    }
    const rows = days.map(({ date, label }) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-lt)">
        <div>
          <strong style="font-size:0.9rem">${esc(formatIsoDate(date))}</strong>
          ${label ? `<span style="color:var(--muted);font-size:0.82rem;margin-left:8px">${esc(label)}</span>` : ''}
        </div>
        <button class="entry-filters-reset" data-action="delete-free-day" data-date="${esc(date)}" style="font-size:0.78rem;padding:3px 10px">Entfernen</button>
      </div>`).join('')
    listEl.innerHTML = `<div style="padding:4px 0">${rows}</div>`
  } catch (err) {
    listEl.innerHTML = `<div class="users-empty" style="color:#991b1b">Fehler: ${esc(err.message)}</div>`
  }
}

async function addFreeDay() {
  const dateInput = document.getElementById('freeday-date')
  const labelInput = document.getElementById('freeday-label')
  const msgEl = document.getElementById('freeday-msg')
  const date = dateInput?.value?.trim()
  const label = labelInput?.value?.trim() || ''
  if (!date) {
    if (msgEl) { msgEl.textContent = 'Bitte ein Datum auswählen.'; msgEl.style.display = 'block' }
    return
  }
  try {
    const res = await fetch('/admin/free-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, label }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (msgEl) { msgEl.textContent = data.error || 'Fehler beim Hinzufügen.'; msgEl.style.display = 'block' }
      return
    }
    if (dateInput) dateInput.value = ''
    if (labelInput) labelInput.value = ''
    if (msgEl) { msgEl.textContent = `${formatIsoDate(date)} wurde eingetragen.`; msgEl.style.display = 'block' }
    await loadFreeDays()
  } catch {
    if (msgEl) { msgEl.textContent = 'Netzwerkfehler.'; msgEl.style.display = 'block' }
  }
}

async function deleteFreeDay(date) {
  if (!date) return
  try {
    const res = await fetch(`/admin/free-days/${encodeURIComponent(date)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) return
    await loadFreeDays()
  } catch { /* ignore */ }
}

function handleDocumentClick(event) {
  const target = event.target.closest('[data-action]')
  if (!target) return

  const { action } = target.dataset
  if (action === 'login') return void doLogin()
  if (action === 'download-backup') return void downloadBackup()
  if (action === 'logout') return void doLogout()
  if (action === 'switch-page') return void switchPage(target.dataset.page)
  if (action === 'refresh-dashboard') return void refreshDashboard()
  if (action === 'load-health') return void loadHealth()
  if (action === 'dashboard-week') return void changeDashboardWeek(Number(target.dataset.delta || 0))
  if (action === 'toggle-extra-fields') return void toggleExtraFields(target.dataset.target || '')
  if (action === 'preview-current-lemma') return void previewCurrentLemma()
  if (action === 'preview-current-day') return void previewCurrentDay()
  if (action === 'save-tag') return void saveTag()
  if (action === 'delete-current-tag') return void deleteCurrentTag()
  if (action === 'trigger-calendar-csv-import') return void triggerCalendarCsvImport()
  if (action === 'load-kalender') return void loadKalender()
  if (action === 'reset-entry-filters') return void resetEntryFilters()
  if (action === 'select-all-visible-entries') return void selectAllVisibleEntries()
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
  if (action === 'generate-lueckenfueller') return void generateLueckenfueller()
  if (action === 'change-month') return void changeMonth(Number(target.dataset.delta || 0))
  if (action === 'edit-selected-calendar-date') return void editSelectedCalendarDate()
  if (action === 'load-users-overview') return void loadUsersOverview()
  if (action === 'select-all-users') return void toggleAllUsersSelection(true)
  if (action === 'clear-users-selection') return void clearUsersBulkSelection()
  if (action === 'run-users-bulk-action') return void runUsersBulkAction()
  if (action === 'reset-users-filters') return void resetUsersFilters()
  if (action === 'save-selected-user-role') return void saveSelectedUserRole()
  if (action === 'delete-selected-user') return void deleteSelectedUser()
  if (action === 'trigger-backup-restore') return void triggerBackupRestore()
  if (action === 'load-performance') return void loadPerformance()
  if (action === 'load-audit-log') return void loadAuditLog()
  if (action === 'reset-audit-filters') return void resetAuditFilters()
  if (action === 'prefill-date') return void prefillDate(target.dataset.value || '')
  if (action === 'select-calendar-date') return void selectCalendarDate(target.dataset.value || '')
  if (action === 'focus-calendar-date') return void focusCalendarDate(target.dataset.value || '', target.dataset.iso || '')
  if (action === 'edit-tag') return void editTag(target.dataset.datum || '')
  if (action === 'select-user') return void selectUser(target.dataset.userId || '')
  if (action === 'show-audit-entry-details') return void showAuditEntryDetailsByIndex(Number(target.dataset.index || -1))
  if (action === 'load-free-days') return void loadFreeDays()
  if (action === 'add-free-day') return void addFreeDay()
  if (action === 'delete-free-day') return void deleteFreeDay(target.dataset.date || '')
}

function handleDocumentChange(event) {
  const target = event.target
  if (target.id === 'calendar-csv-input') return void importCalendarCsv(event)
  if (target.id === 'backup-restore-input') return void restoreBackupFile(event)
  if (target.id === 'entry-mode-filter') return void renderEntryTable()
  if (target.id === 'stats-days') return void loadStats()
  if (target.id === 'users-bulk-action') return void updateUsersBulkState()
  if (target.id === 'users-role-filter') return void loadUsersOverview()
  if (target.id === 'users-select-all') return void toggleAllUsersSelection(target.checked)
  if (target.matches('.user-select-checkbox')) return void updateUsersBulkState()
  if (target.dataset.action === 'toggle-entry-selection') return void toggleEntrySelection(target.dataset.datum || '', target.checked)
  if (target.id === 'audit-limit' || target.id === 'audit-action' || target.id === 'audit-resource' || target.id === 'audit-status' || target.id === 'audit-from' || target.id === 'audit-to') return void loadAuditLog()
}

function handleDocumentInput(event) {
  const target = event.target
  if (target.id === 'entry-search') return void renderEntryTable()
  if (target.id === 'users-search') return void scheduleUsersOverviewLoad()
  if (target.id === 'audit-search') return void loadAuditLog()
}

function handleDocumentKeydown(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (event.key !== 'Enter') return

  const action = target.dataset.enterAction
  if (!action) return
  event.preventDefault()

  if (action === 'login') return void doLogin()
  if (action === 'analyze-kollokation') return void analyzeKollokation()
  if (action === 'analyze-wort-zwilling') return void analyzeWortZwilling()
  if (action === 'analyze-zeitenwende') return void analyzeZeitenwende()
  if (action === 'analyze-lueckenfueller') return void analyzeLueckenfueller()
}

document.addEventListener('click', handleDocumentClick)
document.addEventListener('change', handleDocumentChange)
document.addEventListener('input', handleDocumentInput)
document.addEventListener('keydown', handleDocumentKeydown)

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
