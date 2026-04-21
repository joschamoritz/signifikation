import { PlaceholderScreen } from './TabPlaceholders'

const KURS_FEATURES = [
  'Aufgabe 1 — Wortarten erkennen: Substantive, Verben, Adjektive in echten Texten farbig markieren',
  'Aufgabe 2 — Syntaktische Abhängigkeiten: Akkusativobjekt, Genitivattribut, Prädikativ verstehen',
  'Aufgabe 3 — Kollokationen ermitteln: für ein vorgegebenes Lemma die häufigsten Kollokationen schätzen',
  'Vertiefung — Korpuslinguistik: Wie entsteht ein Textkorpus? Was ist ein Dependenzparser?',
  'Mini-Recherche — eigene Abfrage in einem kleinen Beispielkorpus',
]

export default function KursTab() {
  return (
    <PlaceholderScreen
      title="Kurs"
      ipa="[kʊʁs]"
      category="Didaktik"
      isPremium={false}
      definition="Didaktisch aufgebauter Einstieg in die Korpuslinguistik — von Wortarten über syntaktische Abhängigkeiten bis zur eigenen Korpusrecherche."
      features={KURS_FEATURES}
      footer="Erscheint in einer späteren Auflage. Kostenlos verfügbar."
    />
  )
}
