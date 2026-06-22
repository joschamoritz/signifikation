// Erklaertext „Was ist der Kurs?" für die Anm./Manicula auf der Kurs-Startseite
// (Einheitlichkeit mit Spielmodi & Klassenraum). Erklärt den Lernpfad und die
// vier Niveaustufen — Single Source für Desktop-Fußnote und Mobile-Sheet.
export default function KursNote({ footnotesClass }) {
  return (
    <>
      <p>
        Der Kurs ist ein <strong>didaktischer Lernpfad</strong> in fünf Stationen:
        von der eigenen Sprachintuition über das Korpus bis zur belegten
        Behauptung. Jede Station verbindet kurze Erklärungen, interaktive Aufgaben
        und — wo vorhanden — fertiges Unterrichtsmaterial.
      </p>
      <p>
        Jede Aufgabe gibt es in <strong>vier Niveaustufen</strong>, die dieselbe
        Idee unterschiedlich tief fassen:<sup>1</sup>
      </p>
      <ul className="course-note-levels">
        <li><strong>DaZ</strong> — Deutsch als Zweitsprache: feste Wortpaare erkennen, rein sprachlich, ohne Zahlen.</li>
        <li><strong>Sek&nbsp;I</strong> — Sekundarstufe&nbsp;I: typische von untypischen Verbindungen unterscheiden („oft / selten").</li>
        <li><strong>Sek&nbsp;II</strong> — Sekundarstufe&nbsp;II: Häufigkeit von Bindungsstärke trennen (Frequenz vs.&nbsp;logDice).</li>
        <li><strong>LK</strong> — Leistungskurs: Daten quantifizieren und die Methode kritisch einordnen.</li>
      </ul>
      <p>
        Du kannst die Stufe in jeder Station oben umschalten — Aufgaben und
        Material passen sich an. Die Korpusdaten stammen aus einem eigenen
        Wortprofil<sup>2</sup> freier deutschsprachiger Korpora.
      </p>
      <ol className={footnotesClass}>
        <li>Die Stufung folgt dem Prinzip der Binnendifferenzierung: gleicher Gegenstand, gestaffelte kognitive Anforderung.</li>
        <li>Eigenes Wortprofil, berechnet auf Basis freier deutschsprachiger Korpora (CC&nbsp;BY-SA), syntaktisch annotiert mit dem ZDL-Dependenzparser (BBAW).</li>
      </ol>
    </>
  )
}
