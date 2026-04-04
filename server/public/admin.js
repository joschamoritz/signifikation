// ── XSS-Schutz ───────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ── Login / Logout ────────────────────────────────────────
async function doLogin() {
  const input = document.getElementById('login-key')
  const errEl = document.getElementById('login-error')
  const btn   = document.getElementById('login-btn')
  const candidate = input.value.trim()
  if (!candidate) return
  btn.disabled = true
  btn.textContent = '…'
  errEl.style.display = 'none'
  try {
    const r = await fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: candidate }),
    })
    if (r.ok) {
      document.getElementById('login-overlay').classList.add('hidden')
      document.getElementById('main-container').style.display = 'flex'
      initDashboard()
    } else {
      errEl.style.display = 'block'
      input.value = ''
      input.focus()
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

async function doLogout() {
  await fetch('/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  document.getElementById('main-container').style.display = 'none'
  document.getElementById('login-overlay').classList.remove('hidden')
  document.getElementById('login-key').value = ''
}

// ── Beim Laden: Cookie-Session prüfen ────────────────────
fetch('/admin/kalender').then(r => {
  if (r.ok) {
    document.getElementById('login-overlay').classList.add('hidden')
    document.getElementById('main-container').style.display = 'flex'
    initDashboard()
  }
}).catch(() => { /* Netzwerkfehler → Login zeigen */ })

function initDashboard() {
  renderCalendar()
  loadStats()
  loadHealth()
  initWiktionaryAutofill()
}

// ── Wiktionary-Autofill für Definitions-Felder ────────────────────────────────
function initWiktionaryAutofill() {
  const pairs = [['w1','d1'], ['w2','d2'], ['w3','d3']]
  const timers = {}
  pairs.forEach(([wId, dId]) => {
    const wInput = document.getElementById(wId)
    const dInput = document.getElementById(dId)
    if (!wInput || !dInput) return
    wInput.addEventListener('input', () => {
      clearTimeout(timers[wId])
      const word = wInput.value.trim()
      if (!word) return
      timers[wId] = setTimeout(async () => {
        // Nur autofüllen wenn das Feld noch leer ist
        if (dInput.value.trim()) return
        try {
          const r = await fetch(`/admin/wiktionary-def?q=${encodeURIComponent(word)}`)
          const { definition } = await r.json()
          if (definition && !dInput.value.trim()) {
            dInput.value = definition
            dInput.style.borderColor = '#c9a84c'
            setTimeout(() => dInput.style.borderColor = '', 2000)
          }
        } catch {}
      }, 800)
    })
  })
}

// ── System-Status ─────────────────────────────────────────────────────────────
async function loadHealth() {
  const container = document.getElementById('health-badges')
  if (!container) return
  try {
    const r    = await fetch('/health')
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

    container.innerHTML = [
      badge('Server', true, `${uptime} · ${data.memMb} MB`),
      badge('wortprofil.db', dbOk(data.wortprofilDb), dbOk(data.wortprofilDb) ? '' : data.wortprofilDb),
      badge('belege.db', dbOk(data.belegeDb), dbOk(data.belegeDb) ? '' : data.belegeDb),
      `<span style="font-size:0.72rem;color:var(--muted)">${esc(data.env)}</span>`,
    ].join('')
  } catch (err) {
    container.innerHTML = `<span style="font-size:0.8rem;color:#991b1b">Health-Check fehlgeschlagen: ${esc(err.message)}</span>`
  }
}

function toggleMode(id) {
  const body   = document.getElementById(`${id}-body`)
  const arrow  = document.getElementById(`${id}-arrow`)
  const toggle = document.getElementById(`${id}-toggle`)
  const open   = body.style.display !== 'none' && body.style.display !== ''
  body.style.display  = open ? 'none' : 'flex'
  arrow.classList.toggle('open', !open)
  toggle.classList.toggle('active', !open)
}

let kalenderData = {}
let calYear, calMonth

const now = new Date()
calYear  = now.getFullYear()
calMonth = now.getMonth()

document.getElementById('datum').value = now.toISOString().slice(0, 10)

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const DAYS_DE   = ['Mo','Di','Mi','Do','Fr','Sa','So']

function setStatus(msg, type) {
  const el = document.getElementById('status')
  el.textContent = msg
  el.className = `status ${type}`
}

// ── Feedback ───────────────────────────────────────────────
const GAME_LABELS = { kollokation: 'Kollokationen', zeitreise: 'Zeitreise', wortzwilling: 'Wort-Zwilling' }
async function loadFeedback() {
  const out = document.getElementById('feedback-list')
  out.textContent = 'Lade …'
  try {
    const r = await fetch('/admin/feedback', {})
    const list = await r.json()
    if (!list.length) { out.textContent = 'Noch kein Feedback vorhanden.'; return }
    out.innerHTML = list.map(f => {
      const d = new Date(f.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      const label = GAME_LABELS[f.game] || f.game
      return `<div style="border-bottom:1px solid #eee;padding:10px 0">
        <span style="color:#999;font-size:0.8rem">${d} · ${label}</span><br>
        <span style="font-size:1.4rem">${f.emoji}</span>
        ${f.text ? `<span style="margin-left:8px">${f.text}</span>` : ''}
      </div>`
    }).join('')
  } catch (e) { out.textContent = 'Fehler: ' + e.message }
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

  const todayStr  = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const todayYear = now.getFullYear()

  for (let d = 1; d <= daysInMonth; d++) {
    const mm   = String(calMonth + 1).padStart(2, '0')
    const dd   = String(d).padStart(2, '0')
    const key  = `${mm}-${dd}`
    const entry       = kalenderData[key]
    const hasKoll     = !!(entry?.lemmata?.length)
    const hasZeit     = !!(entry?.hasZeitreise)
    const hasWZ       = !!(entry?.hasWortZwilling)
    const isTodayCell = (calYear === todayYear && key === todayStr)

    let stateClass
    if      (hasKoll && hasZeit && hasWZ) stateClass = 'has-all'
    else if (hasKoll && hasZeit)          stateClass = 'has-both'
    else if (hasKoll && hasWZ)            stateClass = 'has-koll-wz'
    else if (hasZeit && hasWZ)            stateClass = 'has-zeit-wz'
    else if (hasKoll)                     stateClass = 'has-koll'
    else if (hasZeit)                     stateClass = 'has-zeit'
    else if (hasWZ)                       stateClass = 'has-wz'
    else                                  stateClass = 'no-entry'

    const classes = ['cal-day', stateClass, isTodayCell ? 'is-today' : ''].filter(Boolean).join(' ')

    let dots = ''
    if (hasKoll || hasZeit || hasWZ) {
      dots = `<div class="cal-dots">${hasKoll ? '<div class="cal-dot koll"></div>' : ''}${hasZeit ? '<div class="cal-dot zeit"></div>' : ''}${hasWZ ? '<div class="cal-dot wz"></div>' : ''}</div>`
    }

    const action = (hasKoll || hasZeit || hasWZ)
      ? `onclick="editTag('${key}')"`
      : `onclick="prefillDate('${calYear}-${mm}-${dd}')"`

    html += `<div class="${classes}" ${action}>${d}${dots}</div>`
  }

  grid.innerHTML = html
}

function changeMonth(delta) {
  calMonth += delta
  if (calMonth > 11) { calMonth = 0;  calYear++ }
  if (calMonth < 0)  { calMonth = 11; calYear-- }
  renderCalendar()
}

function prefillDate(isoDate) {
  document.getElementById('datum').value = isoDate
  ;['w1','w2','w3','n1','n2','n3','l1','l2','l3','d1','d2','d3','zr'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('p1').value    = 'Substantiv'
  document.getElementById('p2').value    = 'Verb'
  document.getElementById('p3').value    = 'Adjektiv'
  document.getElementById('wza').value   = ''
  document.getElementById('wzb').value   = ''
  document.getElementById('wzpos').value = 'Substantiv'
  document.getElementById('form-title').textContent = 'Neuer Tageseintrag'
  document.getElementById('save-btn').textContent   = 'Speichern & APIs abrufen'
  document.getElementById('status').className = 'status'
  window.scrollTo({ top: 0, behavior: 'smooth' })
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
  const zr    = document.getElementById('zr').value.trim()
  const wza   = document.getElementById('wza').value.trim()
  const wzb   = document.getElementById('wzb').value.trim()
  const wzpos = document.getElementById('wzpos').value

  if (!datum || !w1 || !w2 || !w3) {
    return setStatus('Bitte Datum und alle drei Kollokations-Wörter ausfüllen.', 'error')
  }

  const mmdd = datum.slice(5)
  const btn  = document.getElementById('save-btn')
  btn.disabled = true

  const statusParts = [`DWDS für „${w1}", „${w2}", „${w3}"`]
  if (zr) statusParts.push(`DiaCollo für „${zr}"`)
  if (wza && wzb) statusParts.push(`Wort-Zwilling „${wza}" / „${wzb}"`)
  setStatus(`Rufe ab: ${statusParts.join(' · ')} …`, 'loading')

  try {
    const res = await fetch('/admin/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datum: mmdd, woerter: [w1, w2, w3], positionen: [p1, p2, p3],
        notizen: [n1, n2, n3], links: [l1, l2, l3],
        definitionen: [
          document.getElementById('d1').value.trim(),
          document.getElementById('d2').value.trim(),
          document.getElementById('d3').value.trim(),
        ],
        zeitreise_lemma:   zr,
        zeitreise_wortart: document.getElementById('zr-wortart').value,
        zwilling_paar: wza && wzb ? [wza, wzb] : null,
        zwilling_pos: wzpos,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

    let msg = `Gespeichert: ${mmdd} → ${data.ids.join(', ')}`
    if (zr) {
      msg += data.zeitreiseOk === true  ? ' · Zeitreise: OK'
           : data.zeitreiseOk === false ? ' · Zeitreise: nicht genug Daten (Wort trotzdem gespeichert)'
           : ''
    }
    if (wza && wzb) {
      msg += data.zwillingOk === true  ? ' · Wort-Zwilling: OK'
           : data.zwillingOk === false ? ' · Wort-Zwilling: nicht genug distinkte Kollokatoren'
           : ''
    }
    const hasError = data.zwillingOk === false
    setStatus(msg, hasError ? 'error' : data.zeitreiseOk === false ? 'warn' : 'ok')
    await loadKalender()
  } catch (err) {
    setStatus(`Fehler: ${err.message}`, 'error')
  } finally {
    btn.disabled = false
  }
}

async function editTag(datum) {
  const res  = await fetch(`/admin/tag/${datum}`, {})
  const data = await res.json()
  if (!res.ok) return alert(`Fehler: ${data.error}`)
  const year = new Date().getFullYear()
  document.getElementById('datum').value = `${year}-${datum}`
  document.getElementById('w1').value = data.woerter[0] || ''
  document.getElementById('w2').value = data.woerter[1] || ''
  document.getElementById('w3').value = data.woerter[2] || ''
  document.getElementById('p1').value = data.positionen?.[0] || 'Substantiv'
  document.getElementById('p2').value = data.positionen?.[1] || 'Substantiv'
  document.getElementById('p3').value = data.positionen?.[2] || 'Substantiv'
  document.getElementById('n1').value = data.notizen[0] || ''
  document.getElementById('n2').value = data.notizen[1] || ''
  document.getElementById('n3').value = data.notizen[2] || ''
  document.getElementById('l1').value = data.links[0] || ''
  document.getElementById('l2').value = data.links[1] || ''
  document.getElementById('l3').value = data.links[2] || ''
  document.getElementById('d1').value = data.definitionen?.[0] || ''
  document.getElementById('d2').value = data.definitionen?.[1] || ''
  document.getElementById('d3').value = data.definitionen?.[2] || ''
  document.getElementById('zr').value          = data.zeitreise_lemma   || ''
  document.getElementById('zr-wortart').value  = data.zeitreise_wortart || 'Substantiv'
  document.getElementById('wza').value   = data.zwilling_paar?.[0] || ''
  document.getElementById('wzb').value   = data.zwilling_paar?.[1] || ''
  document.getElementById('wzpos').value = data.zwilling_pos || 'Substantiv'
  document.getElementById('form-title').textContent = `Eintrag bearbeiten: ${datum}`
  document.getElementById('save-btn').textContent   = 'Aktualisieren & APIs abrufen'
  window.scrollTo({ top: 0, behavior: 'smooth' })
  setStatus(`Eintrag ${datum} geladen – Änderungen vornehmen und speichern.`, 'loading')
}

async function loadKalender() {
  try {
    const res  = await fetch('/admin/kalender', {})
    kalenderData = await res.json()
    renderCalendar()
  } catch {
    kalenderData = {}
    renderCalendar()
  }
}

loadKalender()


async function analyzeZeitreiseViz() {
  const word = document.getElementById('viz-input').value.trim()
  if (!word) return
  const out = document.getElementById('viz-output')
  out.innerHTML = '<div class="status loading">Analysiere…</div>'
  try {
    const res  = await fetch(`/admin/analyze-zeitreise?q=${encodeURIComponent(word)}`, {})
    const data = await res.json()
    if (!res.ok) { out.innerHTML = `<div class="status error">Fehler: ${esc(data.error)}</div>`; return }
    renderViz(data, out)
  } catch (e) {
    out.innerHTML = `<div class="status error">Fehler: ${esc(e.message)}</div>`
  }
}

let vizChart = null

function renderViz(data, container) {
  const word = data.lemma
  if (!data.perioden?.length) {
    container.innerHTML = `<div class="status error" style="margin-top:8px">Keine Daten — ${esc(data.reason || '')}</div>`
    return
  }

  const COLOR = '#9b1c1c'
  const maxScore = Math.max(...data.perioden.flatMap(p => p.top.map(t => t.score)), 1)

  // Bubble-Chart Daten
  const bubbleData = data.perioden.flatMap(p =>
    p.top.map((col, rank) => {
      const baseR = 4 + Math.round((col.score / maxScore) * 13)
      return { x: parseInt(p.jahrzehnt), y: col.score, r: rank === 0 ? baseR + 2 : Math.max(3, baseR - rank * 2),
               wort: col.wort, rank: rank + 1, periode: p.jahrzehnt }
    })
  )
  const starData = data.perioden
    .filter(p => p.quintil && p.top[0])
    .map(p => {
      const baseR = 4 + Math.round((p.top[0].score / maxScore) * 13) + 2
      return { x: parseInt(p.jahrzehnt), y: p.top[0].score, r: baseR + 3, wort: p.top[0].wort, periode: p.jahrzehnt }
    })

  const usableBadge = data.usable
    ? '<span style="color:#166534;font-weight:600">✓ Zeitreise möglich</span>'
    : '<span style="color:#92400e;font-weight:600">⚠ Nicht genug Dekaden (mind. 5)</span>'

  container.innerHTML = `
    <div class="viz-meta" style="margin-top:8px">
      <span>„<b>${esc(word)}</b>"</span>
      <span><b>${data.decades}</b> Dekaden</span>
      ${usableBadge}
    </div>
    <div class="viz-canvas-wrap"><canvas id="viz-canvas"></canvas></div>
    <p class="viz-star-note">★ = kommt ins Zeitreise-Spiel · Blase = Top-4 Kollokat · Größe = logDice · Reihenfolge = temporale Distinktivität</p>
    <div class="viz-timeline" id="viz-list" style="margin-top:16px"></div>`

  const listEl = document.getElementById('viz-list')
  for (const p of data.perioden) {
    const top = p.top[0]
    if (!top) continue
    const barPct = Math.round((top.score / maxScore) * 100)
    const rest = p.top.slice(1).map(c =>
      `<span class="viz-chip">${esc(c.wort)} <span style="opacity:.6">${c.score.toFixed(1)}</span></span>`
    ).join('')
    listEl.innerHTML += `
      <div class="viz-row ${p.quintil ? 'viz-row--selected' : ''}">
        <span class="viz-year">${p.quintil ? '★ ' : ''}${esc(p.jahrzehnt)}</span>
        <span class="viz-korpus-badge" style="background:${COLOR}">WP</span>
        <div class="viz-bar-col">
          <div class="viz-bar-row">
            <span class="viz-bar-label">${esc(top.wort)}</span>
            <div class="viz-bar-wrap"><div class="viz-bar-fill" style="width:${barPct}%;background:${COLOR}"></div></div>
            <span class="viz-score">${top.score.toFixed(1)}</span>
          </div>
          ${rest ? `<div class="viz-more">${rest}</div>` : ''}
        </div>
      </div>`
  }

  if (vizChart) { vizChart.destroy(); vizChart = null }
  const ctx = document.getElementById('viz-canvas').getContext('2d')
  vizChart = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [
        { label: '★ Spielauswahl', data: starData, backgroundColor: 'transparent',
          borderColor: '#d97706', borderWidth: 2.5, hoverBackgroundColor: 'transparent', order: 0 },
        { label: 'Wortprofil', data: bubbleData, backgroundColor: COLOR + 'aa',
          borderColor: COLOR, borderWidth: 1, hoverBorderWidth: 2, order: 1 },
      ]
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: item => item.dataset.label !== '★ Spielauswahl',
          callbacks: { label: c => ` ${c.raw.wort}  Score ${c.raw.y.toFixed(2)}  (${c.raw.periode}, Rang ${c.raw.rank})` }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Jahrzehnt', font: { size: 11 } }, ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: 'Score', font: { size: 11 } }, min: 0, ticks: { font: { size: 10 } } }
      }
    }
  })
}

// ── Kollokation – Wortanalyse ─────────────────────────────
async function analyzeKollokation() {
  const lemma = document.getElementById('koll-input').value.trim()
  const pos   = document.getElementById('koll-pos').value
  const out   = document.getElementById('koll-output')
  if (!lemma) return
  out.innerHTML = '<div class="status loading">Analysiere …</div>'
  try {
    const res  = await fetch(`/admin/analyze-kollokation?q=${encodeURIComponent(lemma)}&pos=${encodeURIComponent(pos)}`, {})
    const data = await res.json()
    if (!res.ok) { out.innerHTML = `<div class="status error">Fehler: ${esc(data.error)}</div>`; return }
    renderKollAnalyse(data, out)
  } catch (e) { out.innerHTML = `<div class="status error">Netzwerkfehler: ${esc(e.message)}</div>` }
}

function renderKollAnalyse(data, out) {
  const badge = data.usable
    ? '<span style="color:#166534;font-weight:700">✓ Geeignet als Kollokationswort</span>'
    : '<span style="color:#991b1b;font-weight:700">✗ Nicht geeignet (zu wenig Kollokatoren)</span>'

  let html = `<div style="margin:12px 0 16px">${badge}</div>`

  if (data.top3?.length) {
    html += `<div style="margin-bottom:16px"><strong style="font-size:0.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Top 3 gesamt</strong><div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">`
    for (const it of data.top3) {
      html += `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:6px 12px;font-size:0.88rem"><strong>${esc(it.wort)}</strong> <span style="color:var(--muted);font-size:0.8em">${it.logDice}</span></div>`
    }
    html += `</div></div>`
  }

  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">`
  for (const runde of data.runden) {
    const ok = runde.usable
    html += `<div style="border:1.5px solid ${ok ? '#bbf7d0' : '#fca5a5'};border-radius:8px;padding:12px">`
    html += `<div style="font-weight:600;font-size:0.85rem;margin-bottom:6px">${esc(runde.label)} <span style="color:var(--muted);font-weight:400;font-size:0.78rem">(${runde.count || 0} Treffer)</span></div>`
    if (runde.error) { html += `<div style="color:#991b1b;font-size:0.8rem">${esc(runde.error)}</div>` }
    else if (runde.items?.length) {
      html += `<ol style="padding-left:16px;font-size:0.82rem;display:flex;flex-direction:column;gap:3px">`
      for (const it of runde.items) {
        html += `<li>${esc(it.wort)} <span style="color:var(--muted);font-size:0.78em">${it.logDice}</span></li>`
      }
      html += `</ol>`
    } else { html += `<div style="color:var(--muted);font-size:0.82rem">Keine Ergebnisse</div>` }
    html += `</div>`
  }
  html += `</div>`

  if (data.bonus) {
    html += `<div style="margin-top:14px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:0.82rem">`
    html += `<strong>Bonusfrage (${esc(data.bonus.label)}):</strong> ${esc(data.bonus.question)}<br>`
    html += `<span style="color:var(--muted)">Antwort: <strong>${esc(data.bonus.correct)}</strong> · Optionen: ${data.bonus.options.map(o => esc(o)).join(', ')}</span></div>`
  } else {
    html += `<div style="margin-top:14px;font-size:0.82rem;color:var(--muted)">Keine Bonusfrage verfügbar.</div>`
  }

  out.innerHTML = html
}

// ── Statistik ─────────────────────────────────────────────
let statsChartTrend = null
let statsChartDist  = null

const STAT_KEYS   = ['kollokationen', 'zeitreise', 'wortzwilling']
const STAT_LABELS = { kollokationen: 'Kollokationen', zeitreise: 'Zeitreise', wortzwilling: 'Wort-Zwilling' }
const STAT_COLORS = { kollokationen: '#9b1c1c', zeitreise: '#1d4ed8', wortzwilling: '#15803d' }

async function loadStats() {
  const out = document.getElementById('stats-output')
  out.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Lade…</div>'
  try {
    const r    = await fetch('/admin/stats?days=30', {})
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    renderStats(data, out)
  } catch (e) {
    out.innerHTML = `<div class="status error">Fehler: ${esc(e.message)}</div>`
  }
}

function renderStats(data, out) {
  if (!data.length) {
    out.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Noch keine Statistik vorhanden.</div>'
    return
  }

  const todayStr   = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
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

  const trendLabels = last7.map(d => { const [mm, dd] = d.datum.split('-'); return `${dd}.${mm}.` })
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
