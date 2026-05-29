// @vitest-environment happy-dom
//
// T-5.6 — Smoke-Test: die vier Singleplayer-Spielmodi rendern weiterhin
// crash-frei, wenn sie mit mode='classroom' + den neuen Props gerendert
// werden. Wir testen NICHT die Spiel-Logik (die ist in den Singleplayer-
// Tests abgedeckt) — wir wollen nur sicherstellen, dass die zusaetzlichen
// Props nicht die Default-Render-Pfade brechen.
//
// Wir verzichten darauf, die existierenden Tests anzufassen — der
// Classroom-Pfad rendert in der echten App eigene Mini-Komponenten
// (classroom/student/games/*), nicht diese Komponenten. Der Test
// soll also nur die NEUEN Props verifizieren.

import { render, cleanup } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'

// Wir geben den Komponenten ein minimales data-Argument, das ihren
// internen "shouldSkip"-Pfaden entspricht — sie sollen NICHT crashen,
// duerfen aber gerne sofort null returnen.

import Quiz           from '../../../Quiz'
import WortZwilling   from '../../../WortZwilling'
import Zeitenwende    from '../../../Zeitenwende'
import Lueckenfueller from '../../../Lueckenfueller'

describe('Singleplayer-Komponenten T-5.6 Prop-Erweiterung', () => {
  afterEach(() => cleanup())

  it('Quiz rendert single-default (no-op classroom props) ohne Crash', () => {
    // shouldSkip-Pfad: keine kollokatoren → render null
    expect(() => {
      render(
        <Quiz
          lemma={{ lemma: 'x', runden: { kollokatoren: [] } }}
          currentRound={0}
          onRoundComplete={() => {}}
          onBack={() => {}}
        />,
      )
    }).not.toThrow()
  })

  it('Quiz akzeptiert classroom-Props ohne zu crashen', () => {
    expect(() => {
      render(
        <Quiz
          lemma={{ lemma: 'x', runden: { kollokatoren: [] } }}
          currentRound={0}
          onRoundComplete={() => {}}
          onBack={() => {}}
          mode="classroom"
          onSubmit={() => {}}
          disableProgress
          hideHeader
        />,
      )
    }).not.toThrow()
  })

  it('WortZwilling/Zeitenwende/Lueckenfueller akzeptieren neue Props (kein Crash beim Mount)', () => {
    // WortZwilling braucht data — wir geben das Minimum.
    expect(() => {
      render(
        <WortZwilling
          data={{ lemma: 'x', wortA: 'A', wortB: 'B', kollokatoren: [] }}
          onBack={() => {}}
          onFinish={() => {}}
          mode="classroom"
          onSubmit={() => {}}
          disableProgress
          hideHeader
        />,
      )
    }).not.toThrow()

    expect(() => {
      render(
        <Zeitenwende
          data={{
            lemma: 'x', ipa: '', definitionen: [],
            words: [{ wort: 'A', periode: 'pre' }, { wort: 'B', periode: 'post' }],
          }}
          onBack={() => {}}
          onFinish={() => {}}
          mode="classroom"
          onSubmit={() => {}}
          disableProgress
          hideHeader
        />,
      )
    }).not.toThrow()

    // Lueckenfueller im Result-Pfad (savedResult gesetzt) — einfacher,
    // weil keine konkrete Spielrunde gerendert wird. Wir testen nur, dass
    // die T-5.6-Props nicht den Mount sprengen.
    expect(() => {
      render(
        <Lueckenfueller
          data={[]}
          lemmaName="x"
          onBack={() => {}}
          onFinish={() => {}}
          savedResult={{ scores: [], total: 0 }}
          mode="classroom"
          onSubmit={() => {}}
          disableProgress
          hideHeader
        />,
      )
    }).not.toThrow()
  })
})
