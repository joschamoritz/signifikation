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
  onStart,
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
  lueckenfuellerLemma,
  lfPlayed,
  onPlayLueckenfueller,
  onViewLueckenfueller,
  gesamtausgabeUnlocked,
  gesamtausgabePermanent,
  freeAccessToday,
  freeAccessLabel,
  classroomInSession,
  onNavigateToKonto,
  refreshEntitlements,
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
        onViewWortzwilling={onViewWortzwilling}
        zeitenwende={zeitenwende}
        zeitenwendeError={zeitenwendeError}
        zeitenwendeMissing={zeitenwendeMissing}
        onRetryZeitenwende={onRetryZeitenwende}
        zwPlayed={zwPlayed}
        onPlayZeitenwende={onPlayZeitenwende.play}
        onViewZeitenwende={onViewZeitenwende}
        lueckenfuellerLemma={lueckenfuellerLemma}
        lfPlayed={lfPlayed}
        onPlayLueckenfueller={onPlayLueckenfueller?.play}
        onViewLueckenfueller={onViewLueckenfueller}
        gesamtausgabe={gesamtausgabeUnlocked || classroomInSession}
        freeAccessToday={freeAccessToday}
        freeAccessLabel={freeAccessLabel}
        onUnlockGesamtausgabe={onNavigateToKonto}
      />
    ) : null,
    kurs: <KursTab />,
    profil: (
      <KontoTab
        gesamtausgabe={gesamtausgabeUnlocked}
        gesamtausgabePermanent={gesamtausgabePermanent}
        freeAccessToday={freeAccessToday}
        freeAccessLabel={freeAccessLabel}
        onAuthStateChange={refreshEntitlements}
      />
    ),
  }
}
