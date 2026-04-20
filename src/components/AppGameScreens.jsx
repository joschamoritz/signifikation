import { Suspense } from 'react'
import LemmaSelection from './LemmaSelection'
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
  zeitreise,
  onZeitreiseBack,
  handleZeitreiseFinish,
  zrViewOnly,
  zrPlayed,
  Zeitreise,
  wortzwilling,
  onWortzwillingBack,
  handleWZFinish,
  wzViewOnly,
  wzPlayed,
  WortZwilling,
  zeitenwende,
  onZeitenwendeBack,
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
          playedIds={playedIds}
          onSelect={handleLemmaSelect}
          onViewResult={handleViewResult}
          onBack={onBackToHome}
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
      {phase === 'zeitreise' && zeitreise && (
        <Suspense fallback={<ScreenFallback />}>
          <Zeitreise
            data={zeitreise}
            onBack={onZeitreiseBack}
            onFinish={handleZeitreiseFinish}
            savedResult={zrViewOnly ? zrPlayed : null}
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
          />
        </Suspense>
      )}
    </>
  )
}
