import { Suspense } from 'react'
import LemmaSelection from './LemmaSelection'
import WortZwillingSelection from './WortZwillingSelection'
import ZeitenwendeSelection from './ZeitenwendeSelection'
import Quiz from './Quiz'
import Results from './Results'

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
  handleWZFinish,
  wzViewOnly,
  wzPlayed,
  WortZwilling,
  zeitenwende,
  onZeitenwendeBack,
  onZeitenwendeSelectionBack,
  onZeitenwendePlay,
  handleZeitenwendeFinish,
  zwViewOnly,
  zwPlayed,
  zwProgress,
  Zeitenwende,
  lueckenfuellerLemma,
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
  onSwBack,
}) {
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
        />
      )}
      {phase === 'wortzwilling-selection' && wortzwilling && (
        <WortZwillingSelection
          data={wortzwilling}
          thema={thema}
          themaKurz={themaKurz}
          themaQuelle={themaQuelle}
          onPlay={onWortzwillingPlay}
          onBack={onWortzwillingSelectionBack}
        />
      )}
      {phase === 'zeitenwende-selection' && zeitenwende && (
        <ZeitenwendeSelection
          data={zeitenwende}
          thema={thema}
          themaKurz={themaKurz}
          themaQuelle={themaQuelle}
          onPlay={onZeitenwendePlay}
          onBack={onZeitenwendeSelectionBack}
        />
      )}
      {phase === 'quiz' && selectedLemma && (
        <Quiz
          lemma={selectedLemma}
          currentRound={0}
          onRoundComplete={handleRoundComplete}
          onBack={onBackToSelection}
        />
      )}
      {phase === 'results' && selectedLemma && (
        <Results
          lemma={selectedLemma}
          roundScores={roundScores}
          onRestart={handleRestart}
          onToSelection={onBackToSelection}
        />
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

      {/* ── Spezialwoche: Wort-Zwilling ─────────────────────────── */}
      {phase === 'sw-wz-selection' && spezialwoche?.wortzwilling && (
        <WortZwillingSelection
          data={spezialwoche.wortzwilling}
          thema="Wort der Woche"
          themaKurz={spezialwoche.lemma?.lemma ?? ''}
          themaQuelle=""
          onPlay={onSwWzPlay}
          onBack={onSwBack}
        />
      )}
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
      {phase === 'sw-zeitenwende-selection' && spezialwoche?.zeitenwende && (
        <ZeitenwendeSelection
          data={spezialwoche.zeitenwende}
          thema="Wort der Woche"
          themaKurz={spezialwoche.lemma?.lemma ?? ''}
          themaQuelle=""
          onPlay={onSwZwPlay}
          onBack={onSwBack}
        />
      )}
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
