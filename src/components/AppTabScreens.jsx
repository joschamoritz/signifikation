import Home from './Home'
import KontoTab from './KontoTab'
import KursTab from './KursTab'

export default function AppTabScreens({
  phase,
  lemmata,
  apiError,
  thema,
  playedGames,
  allPlayed,
  zeitreise,
  zeitreiseError,
  onRetryZeitreise,
  zrPlayed,
  onPlayZeitreise,
  onViewZeitreise,
  wortzwilling,
  wortzwillingError,
  onRetryWortzwilling,
  wzPlayed,
  onPlayWortzwilling,
  onViewWortzwilling,
  zeitenwende,
  zeitenwendeError,
  zeitenwendeMissing,
  onRetryZeitenwende,
  zwPlayed,
  onPlayZeitenwende,
  onViewZeitenwende,
  gesamtausgabeUnlocked,
  classroomInSession,
  unlockGesamtausgabe,
  refreshEntitlements,
  onProfilUnlock,
}) {
  return {
    spielmodi: phase === 'home' ? (
      <Home
        onStart={onPlayZeitreise.homeStart}
        loading={!lemmata && !apiError}
        error={apiError}
        lemmata={lemmata || []}
        thema={thema || ''}
        playedGames={playedGames}
        allPlayed={!!allPlayed}
        zeitreise={zeitreise}
        zeitreiseError={zeitreiseError}
        onRetryZeitreise={onRetryZeitreise}
        zrPlayed={zrPlayed}
        onPlayZeitreise={onPlayZeitreise.play}
        onViewZeitreise={onViewZeitreise}
        wortzwilling={wortzwilling}
        wortzwillingError={wortzwillingError}
        onRetryWortzwilling={onRetryWortzwilling}
        wzPlayed={wzPlayed}
        onPlayWortzwilling={onPlayWortzwilling.play}
        onViewWortzwilling={onViewWortzwilling}
        zeitenwende={zeitenwende}
        zeitenwendeError={zeitenwendeError}
        zeitenwendeMissing={zeitenwendeMissing}
        onRetryZeitenwende={onRetryZeitenwende}
        zwPlayed={zwPlayed}
        onPlayZeitenwende={onPlayZeitenwende.play}
        onViewZeitenwende={onViewZeitenwende}
        gesamtausgabe={gesamtausgabeUnlocked || classroomInSession}
        onUnlockGesamtausgabe={unlockGesamtausgabe}
      />
    ) : null,
    kurs: <KursTab />,
    profil: (
      <KontoTab
        gesamtausgabe={gesamtausgabeUnlocked}
        onUnlock={onProfilUnlock}
        onAuthStateChange={refreshEntitlements}
      />
    ),
  }
}
