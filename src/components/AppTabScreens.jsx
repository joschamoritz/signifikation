import Home from './Home'
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
  freeAccessToday,
  freeAccessLabel,
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
        gesamtausgabe={gesamtausgabeUnlocked}
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
    // profil wird als PersistentKontoTab außerhalb von TabTransition gerendert
  }
}
