// Erklaertext „Was ist eine Kollokation?" — Single Source (Review 2026-06-11,
// F-M7): stand vorher wortgleich zweimal in Home.jsx (Desktop-Fußnote +
// Mobile-Sheet); inhaltliche Korrekturen mussten doppelt erfolgen.
export default function KollokationNote({ footnotesClass }) {
  return (
    <>
      <p>
        Kollokationen sind <strong>charakteristische syntagmatische Wortverbindungen</strong>,
        in denen ein Element (die <strong>Basis</strong>) den anderen Bestandteil (den{' '}
        <strong>Kollokator</strong>) semantisch selegiert. Man sagt <em>blondes Haar</em> und
        nicht <em>gelbes Haar</em> — nicht weil Letzteres grammatisch falsch wäre, sondern
        weil der konventionalisierte Sprachgebrauch <em>blond</em> als typischen Kollokator
        von <em>Haar</em> fordert.<sup>1</sup>
      </p>
      <p>
        Kollokationen liegen zwischen freien Wortverbindungen (<em>rotes Auto</em>) und
        Idiomen (<em>ins Gras beißen</em>): semantisch motiviert, aber lexikalisch
        konventionalisiert.
      </p>
      <p>
        Der <strong>logDice-Wert</strong><sup>2</sup> misst, wie stark zwei Wörter
        aneinander gebunden sind — unabhängig davon, wie häufig jedes für sich
        vorkommt. Je höher der Wert, desto charakteristischer die Verbindung
        (theoretisches Maximum: 14). Die Daten stammen aus einem eigenen
        Wortprofil<sup>3</sup>, berechnet aus rund 2,2 Milliarden Textwörtern
        freier deutschsprachiger Korpora.
      </p>
      <ol className={footnotesClass}>
        <li>Hausmann, F.&thinsp;J. (2004): Was sind eigentlich Kollokationen? In: Steyer, K. (Hrsg.): <em>Wortverbindungen – mehr oder weniger fest</em> (IDS-Jahrbuch 2003). de Gruyter, S.&thinsp;309–334.</li>
        <li>Rychlý, P. (2008): A Lexicographer-Friendly Association Score. In: <em>Proceedings of RASLAN 2008</em>, S.&thinsp;6–9.</li>
        <li>Eigenes Wortprofil, berechnet auf Basis freier deutschsprachiger Korpora (CC BY-SA), syntaktisch annotiert mit dem spaCy-Modell <code>de_zdl_lg</code> (BBAW/ZDL), Dependenzen nach Universal Dependencies.</li>
      </ol>
    </>
  )
}
