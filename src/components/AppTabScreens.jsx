import { lazy, Suspense } from 'react'
import Home from './Home'

// KursTab ist ein Premium-Feature, das die meisten Nutzer nie oeffnen — lazy
// laden, damit CheckoutModal/Konto-Bloecke nicht im Initial-Chunk landen.
const KursTab = lazy(() => import('./KursTab'))

export default function AppTabScreens({
  phase,
  lemmata,
  apiError,
  thema,
  playedGames,
  allPlayed,
  onStart,
  wortzwilling,
  wortzwillingError,
  onRetryWortzwilling,
  wzPlayed,
  onPlayWortzwilling,
  zeitenwende,
  zeitenwendeError,
  zeitenwendeMissing,
  onRetryZeitenwende,
  zwPlayed,
  onPlayZeitenwende,
  lueckenfuellerLemma,
  lfPlayed,
  onPlayLueckenfueller,
  gesamtausgabeUnlocked,
  serverDatum,
  onNavigateToKonto,
}) {
  return {
    spielmodi: phase === 'home' ? (
      <Home
        onStart={onStart}
        loading={!lemmata && !apiError}
        error={apiError}
        lemmata={lemmata || []}
        thema={thema || ''}
        playedGames={playedGames}
        allPlayed={!!allPlayed}
        wortzwilling={wortzwilling}
        wortzwillingError={wortzwillingError}
        onRetryWortzwilling={onRetryWortzwilling}
        wzPlayed={wzPlayed}
        onPlayWortzwilling={onPlayWortzwilling.play}
        zeitenwende={zeitenwende}
        zeitenwendeError={zeitenwendeError}
        zeitenwendeMissing={zeitenwendeMissing}
        onRetryZeitenwende={onRetryZeitenwende}
        zwPlayed={zwPlayed}
        onPlayZeitenwende={onPlayZeitenwende.play}
        lueckenfuellerLemma={lueckenfuellerLemma}
        lfPlayed={lfPlayed}
        onPlayLueckenfueller={onPlayLueckenfueller?.play}
        serverDatum={serverDatum}
      />
    ) : null,
    kurs: (
      <Suspense fallback={null}>
        <KursTab
          gesamtausgabe={gesamtausgabeUnlocked}
          onNavigateToKonto={onNavigateToKonto}
        />
      </Suspense>
    ),
    // profil wird als PersistentKontoTab außerhalb von TabTransition gerendert
  }
}
