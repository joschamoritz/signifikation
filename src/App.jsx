import { useState, useCallback, useEffect, Suspense, lazy, useRef } from 'react'
import { flushSync } from 'react-dom'
import { API } from './config'
import { lsGet, lsSet, lsParse } from './utils/storage'
import Home from './components/Home'
import LemmaSelection from './components/LemmaSelection'
import Quiz from './components/Quiz'
import { BonusRound, FreeBonusRound } from './components/BonusRound'
import Results from './components/Results'
import ErrorBoundary from './components/ErrorBoundary'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import { KlassenraumTab, KursTab, KontoTab } from './components/TabPlaceholders'
import { getMedal, getDailyMedal, getZRMedal } from './utils/gameLogic'
import { fetchWithRetry } from './utils/fetchWithRetry'

function startVT(callback) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    callback(); return
  }
  document.startViewTransition(() => flushSync(callback))
}

const Zeitreise    = lazy(() => import('./components/Zeitreise'))
const WortZwilling = lazy(() => import('./components/WortZwilling'))
const Zeitenwende  = lazy(() => import('./components/Zeitenwende'))

// ── localStorage-Schlüssel aus Server-Datum (verhindert Zeitzonen-Mismatch) ──
function makeKeys(datum, year = new Date().getFullYear()) {
  // datum = "MM-DD" vom Server (Europe/Berlin), z.B. "03-16"
  return {
    todayKey:   `sig_${datum}`,
    todayZRKey: `sig_zr_${datum}`,
    dateStr:    `${year}-${datum}`,   // für History (YYYY-MM-DD)
  }
}

function getPlayedToday(key) {
  const val = lsParse(lsGet(key), [])
  return Array.isArray(val) ? val : []
}

function getZRToday(key) {
  return lsParse(lsGet(key), null)
}

function getWZToday(key) {
  return lsParse(lsGet(key), null)
}

function markActivity(dateStr) {
  const activity = lsParse(lsGet('sig_activity'), [])
  if (!activity.includes(dateStr)) {
    lsSet('sig_activity', JSON.stringify([dateStr, ...activity].slice(0, 365)))
  }
}

function saveHistory(storageKey, dateStr, medal, emoji) {
  const history = lsParse(lsGet(storageKey), [])
  const idx = history.findIndex(h => h.date === dateStr)
  const entry = { date: dateStr, medal, emoji }
  if (idx >= 0) history[idx] = entry
  else history.unshift(entry)
  lsSet(storageKey, JSON.stringify(history.slice(0, 365)))
}

const saveKollHistory = (dateStr, medal, emoji) => saveHistory('sig_koll_history', dateStr, medal, emoji)
const saveZRHistory   = (dateStr, medal, emoji) => saveHistory('sig_zr_history',   dateStr, medal, emoji)
const saveWZHistory   = (dateStr, medal, emoji) => saveHistory('sig_wz_history',   dateStr, medal, emoji)
const saveZWHistory   = (dateStr, medal, emoji) => saveHistory('sig_zw_history',   dateStr, medal, emoji)

function savePlayedGame(keys, lemmaId, lemmaName, lemmaPos, total, medal, lemmataLength, scores) {
  const played = getPlayedToday(keys.todayKey)
  const idx    = played.findIndex(p => p.id === lemmaId)
  const entry  = { id: lemmaId, lemma: lemmaName, pos: lemmaPos, total, medal, scores }
  if (idx >= 0) played[idx] = entry
  else played.push(entry)
  lsSet(keys.todayKey, JSON.stringify(played))

  // Jedes einzelne gespielte Spiel zählt für den Streak
  markActivity(keys.dateStr)

  // Koll-History erst wenn alle Wörter gespielt
  if (lemmataLength && played.length >= lemmataLength) {
    const dailyTotal = played.reduce((s, g) => s + g.total, 0)
    const dailyMedal = getDailyMedal(dailyTotal)
    saveKollHistory(keys.dateStr, dailyMedal.label, dailyMedal.emoji)
  }
}

export default function App() {
  const [lemmata, setLemmata]   = useState(null)
  const [apiError, setApiError] = useState(null)
  const [zeitreise, setZeitreise] = useState(null)
  const [zeitreiseError, setZeitreiseError] = useState(false)
  const [zeitreiseRetry, setZeitreiseRetry] = useState(0)
  const [wortzwilling, setWortzwilling] = useState(null)
  const [wortzwillingError, setWortzwillingError] = useState(false)
  const [wortzwillingRetry, setWortzwillingRetry] = useState(0)
  const [zeitenwende, setZeitenwende] = useState(null)
  const [zeitenwendeError, setZeitenwendeError] = useState(false)
  const [zeitenwendeRetry, setZeitenwendeRetry] = useState(0)
  const [serverDatum, setServerDatum] = useState(null)  // "MM-DD" vom Server
  const [serverYear,  setServerYear]  = useState(null)  // Jahreszahl vom Server
  const [gesamtausgabeUnlocked, setGesamtausgabeUnlocked] = useState(() => !!lsGet('sig_gesamtausgabe'))

  const [activeTab, setActiveTab]  = useState('spielmodi')
  const [phase, setPhase]         = useState('home')
  const [selectedLemma, setSelected] = useState(null)
  const [currentRound, setRound]  = useState(0)
  const [roundScores, setScores]  = useState([])
  const [bonusQuestion, setBonusQ] = useState(null)

  const appRef = useRef(null)
  const freshKollRef = useRef(false)
  const inGameRef = useRef(false)

  // Schlüssel aus Server-Datum ableiten (oder Fallback auf lokales Datum + Jahr)
  const keys = serverDatum
    ? makeKeys(serverDatum, serverYear ?? new Date().getFullYear())
    : makeKeys(`${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)

  const [zrViewOnly, setZrViewOnly] = useState(false)
  const [zrPlayed, setZrPlayed] = useState(null)

  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [wzPlayed, setWzPlayed] = useState(null)

  const [zwViewOnly, setZwViewOnly] = useState(false)
  const [zwPlayed, setZwPlayed] = useState(null)

  const syncEntitlementsFromResponse = useCallback((payload) => {
    const serverUnlocked = !!payload?.gesamtausgabe?.unlocked
    const localUnlocked = !!lsGet('sig_gesamtausgabe')
    const unlocked = serverUnlocked || localUnlocked
    if (unlocked) lsSet('sig_gesamtausgabe', '1')
    setGesamtausgabeUnlocked(unlocked)
  }, [])

  const refreshEntitlements = useCallback(async () => {
    try {
      const res = await fetch(`${API}/account/entitlements`, {
        credentials: 'include',
      })
      if (!res.ok) {
        setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
        return
      }
      const payload = await res.json()
      syncEntitlementsFromResponse(payload)
    } catch {
      setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
    }
  }, [syncEntitlementsFromResponse])

  const unlockGesamtausgabe = useCallback(async () => {
    lsSet('sig_gesamtausgabe', '1')
    setGesamtausgabeUnlocked(true)

    try {
      const res = await fetch(`${API}/account/entitlements/gesamtausgabe/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!res.ok) return
      const payload = await res.json()
      syncEntitlementsFromResponse(payload)
    } catch {
      // Lokaler Sofort-Unlock bleibt aktiv, auch wenn kein Konto/Netzwerk verfügbar ist.
    }
  }, [syncEntitlementsFromResponse])

  useEffect(() => {
    refreshEntitlements()
  }, [refreshEntitlements])

  // Fokus bei Screen-Wechsel
  useEffect(() => { appRef.current?.focus() }, [phase])

  // iOS/Browser Swipe-Back: ein History-Eintrag beim Verlassen von Home
  useEffect(() => {
    if (phase === 'home') {
      inGameRef.current = false
      return
    }
    if (!inGameRef.current) {
      window.history.pushState({ sig: true }, '')
      inGameRef.current = true
    }
  }, [phase])

  useEffect(() => {
    function onPop() {
      inGameRef.current = false
      startVT(() => {
        setPhase('home')
        setSelected(null)
        setRound(0)
        setScores([])
        setBonusQ(null)
      })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Lemmata + Server-Datum laden
  useEffect(() => {
    fetchWithRetry(`${API}/heute`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(({ datum, year, lemmata }) => {
        setServerDatum(datum)
        if (year) setServerYear(year)
        setLemmata(lemmata)
        // ZR- und WZ-Key jetzt mit echtem Server-Datum prüfen
        setZrPlayed(getZRToday(`sig_zr_${datum}`))
        setWzPlayed(getWZToday(`sig_wz_${datum}`))
        setZwPlayed(lsParse(lsGet(`sig_zw_${datum}`), null))
      })
      .catch(err => setApiError(err.message))
  }, [])

  useEffect(() => {
    setZeitreiseError(false)
    setZeitreise(null)
    fetchWithRetry(`${API}/zeitreise`)
      .then(r => { if (r.ok) return r.json(); if (r.status === 404) return null; return Promise.reject(new Error(`HTTP ${r.status}`)) })
      .then(data => { if (data) setZeitreise(data) })
      .catch(() => setZeitreiseError(true))
  }, [zeitreiseRetry]) // eslint-disable-line

  useEffect(() => {
    setWortzwillingError(false)
    setWortzwilling(null)
    fetchWithRetry(`${API}/wortzwilling`)
      .then(r => { if (r.ok) return r.json(); if (r.status === 404) return null; return Promise.reject(new Error(`HTTP ${r.status}`)) })
      .then(data => { if (data) setWortzwilling(data) })
      .catch(() => setWortzwillingError(true))
  }, [wortzwillingRetry]) // eslint-disable-line

  useEffect(() => {
    setZeitenwendeError(false)
    setZeitenwende(null)
    fetchWithRetry(`${API}/zeitenwende`)
      .then(r => r.ok ? r.json() : null)          // 404 oder 5xx → kein Eintrag heute
      .then(data => { if (data) setZeitenwende(data) })
      .catch(() => setZeitenwendeError(true))
  }, [zeitenwendeRetry]) // eslint-disable-line

  const retryZeitreise = useCallback(() => {
    setZeitreiseRetry(n => n + 1)
  }, [])

  const retryWortzwilling = useCallback(() => {
    setWortzwillingRetry(n => n + 1)
  }, [])

  const retryZeitenwende = useCallback(() => {
    setZeitenwendeRetry(n => n + 1)
  }, [])

  // Ergebnis in localStorage speichern (Kollokationen)
  useEffect(() => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return
    const total = roundScores.reduce((a, b) => a + b, 0)
    const hasBonus = roundScores.length >= 4
    const maxPoints = hasBonus ? 10 : 9
    const medal = getMedal(total, maxPoints)
    savePlayedGame(keys, selectedLemma.id, selectedLemma.lemma, selectedLemma.pos || 'Substantiv', total, medal, lemmata?.length, roundScores)
    if (freshKollRef.current && serverDatum) {
      freshKollRef.current = false
      fetch(`${API}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'kollokationen', datum: serverDatum, score: total, max: 10 }),
      }).catch(() => {})
    }
  }, [phase, selectedLemma, roundScores, lemmata]) // eslint-disable-line

  const handleLemmaSelect = useCallback((lemma) => {
    startVT(() => {
      setSelected(lemma)
      setRound(0)
      setScores([])
      setBonusQ(null)
      setPhase('quiz')
    })
  }, [])

  // Bonus-Fetch sauber in useEffect statt im State-Updater
  const [fetchBonus, setFetchBonus] = useState(false)
  useEffect(() => {
    if (!fetchBonus || !selectedLemma) return
    setFetchBonus(false)
    fetch(`${API}/bonus?id=${selectedLemma.id}`)
      .then(r => r.json())
      .then(bonus => {
        setBonusQ(bonus?.options ? bonus : { skipped: true })
        setRound(3)
      })
      .catch(() => { setBonusQ({ skipped: true }); setRound(3) })
  }, [fetchBonus, selectedLemma])

  const handleRoundComplete = useCallback((score) => {
    setScores(prev => {
      const next = [...prev, score]
      if (next.length === 3) setFetchBonus(true)
      else if (next.length < 4) setRound(r => r + 1)
      return next
    })
  }, [])

  // Übergang zu Results nach Bonusrunde (außerhalb des setState-Updaters)
  useEffect(() => {
    if (roundScores.length === 4 && phase === 'quiz') {
      freshKollRef.current = true
      startVT(() => setPhase('results'))
    }
  }, [roundScores.length]) // eslint-disable-line

  const handleViewResult = useCallback((lemmaId) => {
    const played = getPlayedToday(keys.todayKey).find(p => p.id === lemmaId)
    const lemma  = lemmata?.find(l => l.id === lemmaId)
    if (!played || !lemma) return
    setSelected(lemma)
    setScores(played.scores ?? [])
    setBonusQ(null)
    setPhase('results')
  }, [keys.todayKey, lemmata])

  const handleRestart = useCallback(() => {
    startVT(() => {
      setSelected(null)
      setRound(0)
      setScores([])
      setBonusQ(null)
      setPhase('home')
    })
  }, [])

  const handleWZFinish = useCallback(({ score, zoneA, zoneB }) => {
    if (!wortzwilling || !serverDatum) return
    const medal = getMedal(score, 10)
    const entry = {
      lemma:  `${wortzwilling.wortA} / ${wortzwilling.wortB}`,
      total:  score,
      medal,
      wortA:  wortzwilling.wortA,
      wortB:  wortzwilling.wortB,
      zoneA,
      zoneB,
    }
    lsSet(`sig_wz_${serverDatum}`, JSON.stringify(entry))
    setWzPlayed(entry)
    markActivity(keys.dateStr)
    saveWZHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'wortzwilling', datum: serverDatum, score, max: 10 }),
    }).catch(() => {})
  }, [wortzwilling, serverDatum, keys.dateStr]) // eslint-disable-line

  const handleZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!zeitenwende || !serverDatum) return
    const medal = getMedal(score, 10)
    const entry = { lemma: zeitenwende.lemma, total: score, medal, answers }
    lsSet(`sig_zw_${serverDatum}`, JSON.stringify(entry))
    setZwPlayed(entry)
    markActivity(keys.dateStr)
    saveZWHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitenwende', datum: serverDatum, score, max: 10 }),
    }).catch(() => {})
  }, [zeitenwende, serverDatum, keys.dateStr]) // eslint-disable-line

  const handleZeitreiseFinish = useCallback((score, placements) => {
    if (!zeitreise) return
    const max   = zeitreise.paare.length * 2
    const zrMed = getZRMedal(score, max)
    const entry = { lemma: zeitreise.lemma, total: score, max, medal: zrMed, placements }
    lsSet(keys.todayZRKey, JSON.stringify(entry))
    setZrPlayed(entry)
    markActivity(keys.dateStr)
    saveZRHistory(keys.dateStr, zrMed.label, zrMed.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitreise', datum: serverDatum, score, max }),
    }).catch(() => {})
  }, [zeitreise, keys.todayZRKey, keys.dateStr]) // eslint-disable-line

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return
    
    // Beim Verlassen von Spielmodi während eines Spiels: zurück zu Home
    if (activeTab === 'spielmodi' && phase !== 'home') {
      startVT(() => {
        setSelected(null); setRound(0); setScores([]); setBonusQ(null); setPhase('home')
      })
    }
    
    setActiveTab(tab)
  }, [activeTab, phase])

  const playedGames = getPlayedToday(keys.todayKey)
  const playedIds   = playedGames.map(g => g.id)
  const allPlayed   = lemmata?.length > 0 && lemmata.every(l => playedIds.includes(l.id))

  // Bonus-Phase: direkt in App rendern (kein Hooks-Verstoß in Quiz)
  const isBonus = phase === 'quiz' && currentRound === 3 && bonusQuestion
  const showTabBar = phase === 'home' || activeTab !== 'spielmodi'

  return (
    <ErrorBoundary>
    <div
      id="main-content"
      className={`app${phase === 'home' ? ' app--home' : ''}${showTabBar ? ' app--has-tabbar' : ''}`}
      ref={appRef}
      tabIndex={-1}
      style={{ outline: 'none' }}
    >
      {/* Spielmodi-Screens (ohne TabTransition, haben eigene startVT-Logik) */}
      {phase === 'selection' && lemmata && (
        <LemmaSelection
          lemmata={lemmata}
          playedIds={playedIds}
          onSelect={handleLemmaSelect}
          onViewResult={handleViewResult}
          onBack={() => startVT(() => setPhase('home'))}
        />
      )}
      {phase === 'quiz' && selectedLemma && !isBonus && (
        <Quiz
          key={currentRound}
          lemma={selectedLemma}
          currentRound={currentRound}
          onRoundComplete={handleRoundComplete}
          onBack={() => startVT(() => setPhase('selection'))}
        />
      )}
      {isBonus && selectedLemma && (
        bonusQuestion.skipped
          ? <FreeBonusRound onComplete={handleRoundComplete} onBack={() => startVT(() => setPhase('selection'))} />
          : <BonusRound bonus={bonusQuestion} lemma={selectedLemma} onComplete={handleRoundComplete} onBack={() => startVT(() => setPhase('selection'))} />
      )}
      {phase === 'results' && selectedLemma && (
        <Results
          lemma={selectedLemma}
          roundScores={roundScores}
          onRestart={handleRestart}
          onToSelection={() => startVT(() => setPhase('selection'))}
        />
      )}
      {phase === 'zeitreise' && zeitreise && (
        <Suspense fallback={<div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Lade …</p></div>}>
          <Zeitreise
            data={zeitreise}
            onBack={() => startVT(() => setPhase('home'))}
            onFinish={handleZeitreiseFinish}
            savedResult={zrViewOnly ? zrPlayed : null}
          />
        </Suspense>
      )}
      {phase === 'wortzwilling' && wortzwilling && (
        <Suspense fallback={<div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Lade …</p></div>}>
          <WortZwilling
            data={wortzwilling}
            onBack={() => startVT(() => setPhase('home'))}
            onFinish={handleWZFinish}
            savedResult={wzViewOnly ? wzPlayed : null}
          />
        </Suspense>
      )}
      {phase === 'zeitenwende' && zeitenwende && (
        <Suspense fallback={<div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Lade …</p></div>}>
          <Zeitenwende
            data={zeitenwende}
            onBack={() => startVT(() => setPhase('home'))}
            onFinish={handleZeitenwendeFinish}
            savedResult={zwViewOnly ? zwPlayed : null}
          />
        </Suspense>
      )}

      {/* Tab-Screens (mit TabTransition für Umblätter-Effekt) */}
      <TabTransition activeTab={activeTab}>
        {phase === 'home' && activeTab === 'spielmodi' && (
          <Home
            onStart={() => startVT(() => setPhase(lemmata && !apiError ? 'selection' : 'home'))}
            loading={!lemmata && !apiError}
            error={apiError}
            lemmata={lemmata || []}
            playedGames={playedGames}
            allPlayed={!!allPlayed}
            zeitreise={zeitreise}
            zeitreiseError={zeitreiseError}
            onRetryZeitreise={retryZeitreise}
            zrPlayed={zrPlayed}
            onPlayZeitreise={() => startVT(() => { setZrViewOnly(false); setPhase('zeitreise') })}
            onViewZeitreise={() => startVT(() => { setZrViewOnly(true); setPhase('zeitreise') })}
            wortzwilling={wortzwilling}
            wortzwillingError={wortzwillingError}
            onRetryWortzwilling={retryWortzwilling}
            wzPlayed={wzPlayed}
            onPlayWortzwilling={() => startVT(() => { setWzViewOnly(false); setPhase('wortzwilling') })}
            onViewWortzwilling={() => startVT(() => { setWzViewOnly(true);  setPhase('wortzwilling') })}
            zeitenwende={zeitenwende}
            zeitenwendeError={zeitenwendeError}
            onRetryZeitenwende={retryZeitenwende}
            zwPlayed={zwPlayed}
            onPlayZeitenwende={() => startVT(() => { setZwViewOnly(false); setPhase('zeitenwende') })}
            onViewZeitenwende={() => startVT(() => { setZwViewOnly(true);  setPhase('zeitenwende') })}
            gesamtausgabe={gesamtausgabeUnlocked}
            onUnlockGesamtausgabe={unlockGesamtausgabe}
          />
        )}
        {activeTab === 'klassenraum' && <KlassenraumTab />}
        {activeTab === 'kurs'        && <KursTab />}
        {activeTab === 'profil'      && (
          <KontoTab
            gesamtausgabe={gesamtausgabeUnlocked}
            onUnlock={() => {
              unlockGesamtausgabe()
              setActiveTab('spielmodi')
            }}
            onAuthStateChange={refreshEntitlements}
          />
        )}
      </TabTransition>
    </div>
    {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} />}
    </ErrorBoundary>
  )
}
