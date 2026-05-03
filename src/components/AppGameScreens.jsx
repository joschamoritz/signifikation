import { Suspense } from 'react'
import LemmaSelection from './LemmaSelection'
import WortZwillingSelection from './WortZwillingSelection'
import ZeitenwendeSelection from './ZeitenwendeSelection'
import Quiz from './Quiz'
import { BonusRound, FreeBonusRound } from './BonusRound'
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
  currentRound,
  isBonus,
  handleRoundComplete,
  onBackToSelection,
  bonusQuestion,
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
  Zeitenwende,
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
      {phase === 'quiz' && selectedLemma && !isBonus && (
        <Quiz
          key={currentRound}
          lemma={selectedLemma}
          currentRound={currentRound}
          onRoundComplete={handleRoundComplete}
          onBack={onBackToSelection}
        />
      )}
      {isBonus && selectedLemma && (
        bonusQuestion.skipped
          ? <FreeBonusRound onComplete={handleRoundComplete} onBack={onBackToSelection} />
          : <BonusRound bonus={bonusQuestion} lemma={selectedLemma} onComplete={handleRoundComplete} onBack={onBackToSelection} />
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
          />
        </Suspense>
      )}
    </>
  )
}
