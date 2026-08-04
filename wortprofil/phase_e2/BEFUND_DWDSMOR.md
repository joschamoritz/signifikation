# Befund: dwdsmor kann das E2-Mapping nicht liefern

**Stand 2026-08-04, gemessen an `wortprofil/wortprofil-env` (dwdsmor 0.17.0, Edition `open`).**

Der Plan (Phase E2, Schritt 2) sieht vor, das Mapping `alt → korrekt` deterministisch
über den dwdsmor-SFST-Transducer zu bilden und dabei das `orthinfo`-Feld zu nutzen.
Drei unabhängige Messungen zeigen, dass das mit der installierten Edition nicht geht.

## 1. Der Transducer kennt historische Orthografie überhaupt nicht

```
>>> a = dwdsmor.analyzer(); t = a.transducer
>>> t.analyse('thier')        → []
>>> t.analyse('Thier')        → []
>>> t.analyse('Thiere')       → []
>>> t.analyse('Wirthschaft')  → []
>>> t.analyse('Muth')         → []
>>> t.analyse('gieng')        → []
>>> t.analyse('seyn')         → []
```

Geprüft über **alle sechs** Automatentypen (`lemma`, `lemma2`, `finite`, `root`,
`root2`, `index`) und zusätzlich über die unkomprimierten `.a`-Automaten mit
`sfst_transduce.Transducer` — durchgehend 0 Analysen. Das Ausgangswort ist dem
Transducer schlicht unbekannt; es gibt nichts, worauf `orthinfo` sich beziehen könnte.

## 2. `orthinfo` deckt eine andere Fehlerklasse ab

`dwdsmor/tag.py`, `tag_values`:

```python
"metainfo": {"Old", "NonSt"},
"orthinfo": {"OLDORTH", "CH"},
```

`OLDORTH` = Schreibung vor der Reform **1996** (`daß`/`dass`), `CH` = Schweizer `ss`
für `ß`. Das 18./19. Jahrhundert (`thier`, `seyn`, `gieng`, `Cultur`) kommt in dieser
Merkmalsmenge nicht vor. Das Feld hätte also selbst dann nicht getragen, wenn die
Formen im Lexikon stünden.

## 3. Die Edition `open` ist ein stark reduziertes Lexikon

Nicht nur die historischen Formen fehlen — auch alltägliche Zielformen:

```
Tier, Auto, Wasser, Sonne, Wort   → 0 Analysen
Hund, Katze, Baum, Tisch, Krieg   → analysierbar
```

Abdeckung gegen das echte Lemma-Inventar von `wortprofil_v2.db`
(1.047.170 distinkte `(dep_lemma, dep_pos)`):

| POS | Typen bekannt | Anteil Typen | Anteil Frequenz |
|---|---|---:|---:|
| Substantiv | 60.148 / 823.845 | 7,3 % | 70,5 % |
| Adjektiv | 10.561 / 147.350 | 7,2 % | 70,9 % |
| Verb | 9.772 / 72.882 | 13,4 % | 88,8 % |
| Adverb | 677 / 3.037 | 22,3 % | 95,7 % |

Für Substantive muss dabei zusätzlich großgeschrieben angefragt werden — die
`dep_lemma`-Werte der DB sind durchgängig kleingeschrieben, und `t.analyse('katze')`
liefert 0, `t.analyse('Katze')` dagegen 4 Analysen.

Selbst die **Zielseite** einer Abbildung lässt sich damit oft nicht bestätigen:
`Tier` — das Ziel des Musterfalls aus dem Plan und aus Golden Query #11 — ist im
Lexikon nicht enthalten.

## 4. Auch für die Flexionsreste (`katzen → katze`) trägt dwdsmor nicht

Dort, wo das Lexem bekannt ist, liefert dwdsmor korrekt eine Grundform
(`Katzen` → `Katze`, `Pl`). Angewandt auf das gesamte Inventar erzeugt das aber
überwiegend **Lexemverwechslungen**, weil die Analyse kontextlos ist — genau der
im Plan genannte 10–20-%-Effekt, hier deutlich schlimmer:

| angeblich Flexion von | tatsächlich | f_alt | f_ziel |
|---|---|---:|---:|
| `gelangen` → `gelingen` | verschiedene Verben | 399.032 | 533.195 |
| `masse` → `maß` | verschiedene Substantive | 136.235 | 232.761 |
| `gefallen` → `fallen` | verschiedene Verben | 92.528 | 912.476 |
| `betrügen` → `betragen` | verschiedene Verben | 29.854 | 835.100 |
| `spannen` → `spinnen` | verschiedene Verben | 41.610 | 52.317 |
| `ihr` → `sie` | Pronomen-Paradigma | 174.853 | 16.853.293 |

Von 4.360 Fällen mit abweichender Grundform bleiben nach Bestands- und
Frequenzprüfung 3.781 übrig — und die Spitze dieser Liste besteht fast vollständig
aus falschen Zusammenlegungen. Ein Frequenzfilter hilft nicht, weil die falschen
Ziele echte, häufige Lemmata sind.

Der tatsächliche Umfang der echten Restfehler ist dagegen winzig: `katzen`
(das Beispiel aus dem Plan) steht mit **Frequenz 5 in einer einzigen Zeile**. Die
dwdsmor-Komponente aus Phase A hat diese Klasse beim Parsen bereits weitgehend
erledigt, wie der Plan es erwartet hatte.

## Konsequenz

- Schritt 2 des E2-Prompts ist mit der installierten dwdsmor-Edition **nicht
  ausführbar**. Ersatzverfahren siehe `build_corrections.py` (Regelmenge der
  deutschen Orthografiegeschichte + Bestands- und Frequenzwächter).
- Die Fehlerklasse „Plural-Restfehler" sollte **nicht** automatisiert gemergt
  werden. Sie ist zu klein, um den Aufwand zu rechtfertigen, und mit dem einzigen
  verfügbaren Werkzeug nicht sicher zu treffen.
- Falls die vollständige DWDSmor-Edition (`dwds` statt `open`) beschafft werden
  kann, ändert das Punkt 3 (Lexikonabdeckung), **nicht** Punkt 1 und 2 — historische
  Orthografie des 19. Jahrhunderts steht auch dort nicht im Merkmalsinventar.
