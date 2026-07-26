// Erklaertext „So funktioniert der Klassenraum“ — Single Source fuer die
// Desktop-Fußnote und das Mobile-Sheet auf der Klassenraum-Landing.
//
// Loest die fruheren eigenstaendigen Unterseiten HowToStep (① Anleitung) und
// JoinStep (③ Beitritt) ab: beide waren reine Textanleitungen und kosteten je
// einen Prime-Slot im Index. Inhalt jetzt gebuendelt — Setup, Beitritt und
// Datenschutz in einem Block, wie KollokationNote auf der Spielmodi-Startseite.
export default function ClassroomHowItWorksNote() {
  return (
    <>
      <p>
        Der Klassenraum macht aus den Spielmodi eine gemeinsame Live-Stunde:
        Du wählst die Wörter und steuerst von vorn, die Klasse spielt
        gleichzeitig auf den eigenen Geräten — <strong>anonym, ohne
        Anmeldung</strong>.
      </p>
      <p>
        <strong>1 · Sitzung anlegen.</strong> Wähle einen Spielmodus und ein bis
        drei Lemmata — optional mehrere Modi nacheinander.
      </p>
      <p>
        <strong>2 · Code teilen.</strong> Die Klasse öffnet signifikation.de,
        geht auf Klassenraum und tippt den Zugangscode ein — oder scannt den
        QR-Code aus der Lobby. Ein kurzer Spitzname genügt, ein echter Name ist
        nicht nötig.
      </p>
      <p>
        <strong>3 · Spielen &amp; auswerten.</strong> Du startest die Runde,
        alle spielen synchron, und du siehst die Auswertung live.
      </p>
      <p>
        Spätestens zwei Tage nach der Stunde werden die Spitznamen automatisch
        anonymisiert — es bleibt nichts Persönliches gespeichert.
      </p>
    </>
  )
}
