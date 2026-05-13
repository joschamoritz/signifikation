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
  gesamtausgabePermanent,
  freeAccessToday,
  freeAccessLabel,
  serverDatum,
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
        gesamtausgabe={gesamtausgabeUnlocked || classroomInSession}
        freeAccessToday={freeAccessToday}
        freeAccessLabel={freeAccessLabel}
        onUnlockGesamtausgabe={onNavigateToKonto}
      />
    ) : null,
    kurs: (
      <KursTab
        gesamtausgabe={gesamtausgabeUnlocked}
        onNavigateToKonto={onNavigateToKonto}
      />
    ),
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
