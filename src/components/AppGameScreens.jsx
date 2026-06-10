import { lazy, Suspense, useMemo } from 'react'
import LemmaSelection from './LemmaSelection'
import WortZwillingSelection from './WortZwillingSelection'
import ZeitenwendeSelection from './ZeitenwendeSelection'
import LueckenfuellerSelection from './LueckenfuellerSelection'
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack'
// Quiz und Results sind groß und werden erst nach Lemma-Wahl gebraucht.
// BelegePanel mit logDice-Sortierung wird automatisch mit-lazy-geladen.
const Quiz    = lazy(() => import('./Quiz'))
const Results = lazy(() => import('./Results'))

function ScreenFallback() {
  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Lade …</p>
    </div>
  )
}

export default function AppGameScreens({
  phase,
  thema,
  themaKurz,
  themaQuelle,
  lemmata,
  playedIds,
  customLemmaQuota,
  onCustomPlay,
  customGame,
  onExitCustomGame,
  handleLemmaSelect,
  handleViewResult,
  onBackToHome,
  selectedLemma,
  handleRoundComplete,
  onBackToSelection,
  roundScores,
  handleRestart,
  wortzwilling,
  onWortzwillingBack,
  onWortzwillingSelectionBack,
  onWortzwillingPlay,
  onWortzwillingViewResult,
  handleWZFinish,
  wzViewOnly,
  wzPlayed,
  WortZwilling,
  zeitenwende,
  onZeitenwendeBack,
  onZeitenwendeSelectionBack,
  onZeitenwendePlay,
  onZeitenwendeViewResult,
  handleZeitenwendeFinish,
  zwViewOnly,
  zwPlayed,
  zwProgress,
  Zeitenwende,
  lueckenfuellerLemma,
  onLueckenfuellerSelectionBack,
  onLueckenfuellerPlay,
  onLueckenfuellerViewResult,
  onLueckenfuellerBack,
  handleLFFinish,
  lfViewOnly,
  lfPlayed,
  lfProgress,
  Lueckenfueller,
  // Spezialwoche
  spezialwoche,
  swWzPlayed,
  swZwPlayed,
  swLfPlayed,
  handleSwWZFinish,
  handleSwZeitenwendeFinish,
  handleSwLFFinish,
  swWzViewOnly,
  swZwViewOnly,
  swLfViewOnly,
  onSwWzPlay,
  onSwZwPlay,
  onSwLfPlay,
  onViewSwWz,
  onViewSwZw,
  onViewSwLf,
  onSwBack,
}) {
  const swipeBackHandler = useMemo(() => {
    switch (phase) {
      case 'selection': return onBackToHome
      case 'wortzwilling-selection': return onWortzwillingSelectionBack
      case 'zeitenwende-selection': return onZeitenwendeSelectionBack
      case 'lueckenfueller-selection': return onLueckenfuellerSelectionBack
      case 'quiz': return onBackToSelection
      case 'results': return onBackToSelection
      case 'custom-play': return onExitCustomGame
      case 'wortzwilling': return onWortzwillingBack
      case 'zeitenwende': return onZeitenwendeBack
      case 'lueckenfueller': return onLueckenfuellerBack
      case 'sw-wz':
      case 'sw-zeitenwende':
      case 'sw-lf':
        return onSwBack
      default: return null
    }
  }, [
    phase,
    onBackToHome,
    onBackToSelection,
    onWortzwillingBack,
    onWortzwillingSelectionBack,
    onZeitenwendeBack,
    onZeitenwendeSelectionBack,
    onLueckenfuellerBack,
    onLueckenfuellerSelectionBack,
    onSwBack,
    onExitCustomGame,
  ])

  useEdgeSwipeBack(swipeBackHandler, { enabled: Boolean(swipeBackHandler) })

  return (
    <>
      {phase === 'selection' && lemmata && (
        <LemmaSelection
          lemmata={lemmata}
          thema={thema}
          themaKurz={themaKurz}
          themaQuelle={themaQuelle}
          playedIds={playedIds}
          onSelect={handleLemmaSelect}
          onViewResult={handleViewResult}
          onBack={onBackToHome}
          spezialLemma={spezialwoche?.lemma ?? null}
          spezialwoche={spezialwoche}
          customLemma={customLemmaQuota}
          onCustomPlay={onCustomPlay}
        />
      )}
      {phase === 'wortzwilling-selection' && wortzwilling && (
        <WortZwillingSelection
          data={wortzwilling}
          thema={thema}
          themaKurz={themaKurz}
          themaQuelle={themaQuelle}
          onPlay={onWortzwillingPlay}
          onViewDaily={onWortzwillingViewResult}
          wzPlayed={wzPlayed}
          onBack={onWortzwillingSelectionBack}
          spezialwoche={spezialwoche}
          swWzPlayed={swWzPlayed}
          onPlaySpezial={onSwWzPlay}
          onViewSpezial={onViewSwWz}
          customLemma={customLemmaQuota}
          onCustomPlay={onCustomPlay}
        />
      )}
      {phase === 'zeitenwende-selection' && zeitenwende && (
        <ZeitenwendeSelection
          data={zeitenwende}
          thema={thema}
          themaKurz={themaKurz}
          themaQuelle={themaQuelle}
          onPlay={onZeitenwendePlay}
          onViewDaily={onZeitenwendeViewResult}
          zwPlayed={zwPlayed}
          onBack={onZeitenwendeSelectionBack}
          spezialwoche={spezialwoche}
          swZwPlayed={swZwPlayed}
          onPlaySpezial={onSwZwPlay}
          onViewSpezial={onViewSwZw}
          customLemma={customLemmaQuota}
          onCustomPlay={onCustomPlay}
        />
      )}
      {phase === 'quiz' && selectedLemma && (
        <Suspense fallback={<ScreenFallback />}>
          <Quiz
            lemma={selectedLemma}
            currentRound={0}
            onRoundComplete={handleRoundComplete}
            onBack={onBackToSelection}
          />
        </Suspense>
      )}
      {phase === 'results' && selectedLemma && (
        <Suspense fallback={<ScreenFallback />}>
          <Results
            lemma={selectedLemma}
            roundScores={roundScores}
            onRestart={handleRestart}
            onToSelection={onBackToSelection}
          />
        </Suspense>
      )}
      {phase === 'wortzwilling' && wortzwilling && (
        <Suspense fallback={<ScreenFallback />}>
          <WortZwilling
            data={wortzwilling}
            onBack={onWortzwillingBack}
            onFinish={handleWZFinish}
            savedResult={wzViewOnly ? wzPlayed : null}
          />
        </Suspense>
      )}
      {phase === 'zeitenwende' && zeitenwende && (
        <Suspense fallback={<ScreenFallback />}>
          <Zeitenwende
            data={zeitenwende}
            onBack={onZeitenwendeBack}
            onFinish={handleZeitenwendeFinish}
            savedResult={zwViewOnly ? zwPlayed : null}
            initialProgress={zwViewOnly ? null : zwProgress}
          />
        </Suspense>
      )}
      {phase === 'lueckenfueller-selection' && lueckenfuellerLemma?.lueckenfueller && (
        <LueckenfuellerSelection
          data={lueckenfuellerLemma}
          thema={thema}
          themaKurz={themaKurz}
          themaQuelle={themaQuelle}
          onPlay={onLueckenfuellerPlay}
          onViewDaily={onLueckenfuellerViewResult}
          lfPlayed={lfPlayed}
          onBack={onLueckenfuellerSelectionBack}
          spezialwoche={spezialwoche}
          swLfPlayed={swLfPlayed}
          onPlaySpezial={onSwLfPlay}
          onViewSpezial={onViewSwLf}
          customLemma={customLemmaQuota}
          onCustomPlay={onCustomPlay}
        />
      )}
      {phase === 'lueckenfueller' && lueckenfuellerLemma?.lueckenfueller && (
        <Suspense fallback={<ScreenFallback />}>
          <Lueckenfueller
            data={lueckenfuellerLemma.lueckenfueller}
            lemmaName={lueckenfuellerLemma.lemma}
            onBack={onLueckenfuellerBack}
            onFinish={handleLFFinish}
            savedResult={lfViewOnly ? lfPlayed : null}
            initialProgress={lfViewOnly ? null : lfProgress}
          />
        </Suspense>
      )}

      {/* ── Eigenes Lemma: isolierter Custom-Spielpfad (reines Üben) ── */}
      {phase === 'custom-play' && customGame?.mode === 'zeitenwende' && (
        <Suspense fallback={<ScreenFallback />}>
          <Zeitenwende
            data={customGame.data}
            onBack={onExitCustomGame}
            onFinish={() => {}}
            savedResult={null}
            initialProgress={null}
          />
        </Suspense>
      )}
      {phase === 'custom-play' && customGame?.mode === 'wortzwilling' && (
        <Suspense fallback={<ScreenFallback />}>
          <WortZwilling
            data={customGame.data}
            onBack={onExitCustomGame}
            onFinish={() => {}}
            savedResult={null}
          />
        </Suspense>
      )}
      {phase === 'custom-play' && customGame?.mode === 'lueckenfueller' && (
        <Suspense fallback={<ScreenFallback />}>
          <Lueckenfueller
            data={customGame.data.lueckenfueller}
            lemmaName={customGame.data.lemma}
            onBack={onExitCustomGame}
            onFinish={() => {}}
            savedResult={null}
            initialProgress={null}
          />
        </Suspense>
      )}

      {/* ── Spezialwoche: Wort-Zwilling ─────────────────────────── */}
      {phase === 'sw-wz' && spezialwoche?.wortzwilling && (
        <Suspense fallback={<ScreenFallback />}>
          <WortZwilling
            data={spezialwoche.wortzwilling}
            onBack={onSwBack}
            onFinish={handleSwWZFinish}
            savedResult={swWzViewOnly ? swWzPlayed : null}
          />
        </Suspense>
      )}

      {/* ── Spezialwoche: Zeitenwende ────────────────────────────── */}
      {phase === 'sw-zeitenwende' && spezialwoche?.zeitenwende && (
        <Suspense fallback={<ScreenFallback />}>
          <Zeitenwende
            data={spezialwoche.zeitenwende}
            onBack={onSwBack}
            onFinish={handleSwZeitenwendeFinish}
            savedResult={swZwViewOnly ? swZwPlayed : null}
            initialProgress={null}
          />
        </Suspense>
      )}

      {/* ── Spezialwoche: Lückenfüller ───────────────────────────── */}
      {phase === 'sw-lf' && spezialwoche?.lueckenfuellerLemma?.lueckenfueller && (
        <Suspense fallback={<ScreenFallback />}>
          <Lueckenfueller
            data={spezialwoche.lueckenfuellerLemma.lueckenfueller}
            lemmaName={spezialwoche.lueckenfuellerLemma.lemma}
            onBack={onSwBack}
            onFinish={handleSwLFFinish}
            savedResult={swLfViewOnly ? swLfPlayed : null}
            initialProgress={null}
          />
        </Suspense>
      )}
    </>
  )
}
