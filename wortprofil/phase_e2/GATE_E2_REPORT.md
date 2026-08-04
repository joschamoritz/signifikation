# Gate E2 — Lemma-Normalisierung in wortprofil_v2.db

**Stand 2026-08-04 · `C:\wortprofil_v2\wortprofil_v2.db` · 17,15 GiB**

Verwandte Dateien: [[DB-Neuaufbau]] (Phase E2), `BEFUND_DWDSMOR.md`,
`E2_VALIDIERUNG.md` (Freigabe-Report), `E2_VALIDATE.md` (Golden Queries),
`E2_STICHPROBE.md` (30 Paare + Kontroll-Paare).

## Ergebnis: Gate E2 grün, mit einem dokumentierten Restpunkt

| Prüfung (Plan, Gate E2) | Ergebnis |
|---|---|
| `lemma_corrections` vom User freigegeben | ✅ 11.005 von 13.790 Zeilen (Blöcke A/B/C ganz, D ohne Eigennamen, E verworfen) |
| Merge in einer Transaktion ohne Fehler | ✅ 11 Schritte, COMMIT nach 5 min |
| `integrity_check` = ok | ✅ vorher (6 min) und nachher |
| Golden Query #11 grün | ✅ `thier` in 0 Zeilen, Frequenzen zu `tier` summiert |
| Stichprobe 30 gemergter Paare plausibel | ✅ 28/30 exakt aufgegangen, 2 aus dem Restpunkt unten |
| Keine Über-Normalisierung (Kontroll-Paar) | ✅ 5 Kontroll-Paare, alle mit unveränderter Frequenz getrennt |
| Keine Regression bei den Spiel-Lemmata | ✅ Golden Query #10: 98 Einzelprüfungen über 84 Spiel-Slots bestanden |

**Golden Queries insgesamt: 8 PASS · 0 FAIL · 3 SKIP.** Die SKIPs (#6, #7, #9)
betreffen `belege_v2.db` und gehören zu Phase F.

## Kennzahlen

| | vorher | nachher | Differenz |
|---|---:|---:|---:|
| `collocations` | 25.726.750 | **25.482.587** | −244.163 |
| `zeitreise` | 61.199.161 | **61.025.938** | −173.223 |
| `lemma_corpus_freq` | 25.922.727 | **25.871.807** | −50.920 |
| distinkte (lemma, pos) | 1.030.294 | **1.020.007** | −10.287 |
| Summe `frequency` | 1.246.957.592 | **1.246.957.592** | **±0** |
| DB-Größe | 17,77 GiB | **17,15 GiB** | −0,62 GiB |

Die unveränderte Frequenzsumme ist der zentrale Korrektheitsbeweis: Es ging
keine Vorkommenszählung verloren und es kam keine hinzu — die Häufigkeiten
wurden ausschließlich umverteilt. `merge.py` prüft das nach jedem Schritt und
hätte sonst zurückgerollt.

Beispiel `thier`: 128.513 Vorkommen (alle drei Wortarten) + 297.791 von `tier`
= 426.304 — exakt der Wert, den `tier` nach dem Merge trägt.

## Das Verfahren weicht vom Plan ab

Der Plan sah vor, das Mapping über den dwdsmor-SFST-Transducer und dessen
`orthinfo`-Feld zu bilden. Das ist mit der installierten Edition nicht möglich
(Belege in `BEFUND_DWDSMOR.md`): `analyse('thier')` liefert über alle sechs
Automatentypen 0 Analysen, `orthinfo` kennt nur `{OLDORTH, CH}` (Reform 1996 und
Schweizer ss), und die Edition „open" ist ein reduziertes Lexikon, in dem selbst
`Tier` fehlt.

Ersatz, vom User am 2026-08-04 freigegeben: eine geschlossene Regelmenge der
deutschen Orthografiegeschichte, Richtung fest historisch → modern, abgesichert
durch **fünf Wächter**:

1. **Regel** erzeugt den Kandidaten (deterministisch, keine Statistik).
2. **Bestand**: Die Zielform muss mit derselben Wortart existieren.
3. **dwdsmor als Negativ-Prüfung**: Kennt der Transducer die *Ausgangsform*, ist
   sie eine gültige moderne Schreibung und bleibt unangetastet. Hier sind die
   Lexikonlücken ungefährlich — Unbekanntheit gewährt nur keinen Schutz, dann
   greifen die übrigen Wächter. Das Verfahren wird dadurch strenger, nie
   lockerer.
4. **Frequenz**: Die Zielform muss häufiger sein als die Ausgangsform.
5. **Wortart-Konsistenz**: Die Entscheidung gilt für das ganze Wort, nicht je
   Wortart.

Wächter 3 und 5 kamen erst nach dem Merge-Testlauf dazu (siehe „Was der Testlauf
gefunden hat").

### Freigegebene Blöcke

| Block | Regel | Paare | freigegeben |
|---|---|---:|---:|
| A | `th → t` (Orthographische Konferenz 1901) | 3.816 | 3.816 |
| B | `ß → ss`, `-niß → -nis` (Reform 1996) | 2.184 | 2.184 |
| C | `ey → ei`, `ieng → ing`, `-iren → -ieren` (18./19. Jh.) | 1.913 | 1.913 |
| D | `c → k/z`, `ck → k` (Fremdwortschreibung 1901) | 4.269 | 3.092 |
| E | `ph → f`, `y → i`, `dt → t` | 1.608 | **0** |
| | **Summe** | **13.790** | **11.005** |

Block E wurde verworfen, weil dort echte Fehlabbildungen standen (`graph → graf`,
`sky → ski`, `may → mai`) und Varianten, die beide gültig sind
(`photographie`/`fotografie`). In Block D wurden 1.176 Eigennamen ausgeschlossen
(`carl → karl`, `franckreich → frankreich`, `cassel → kassel`) sowie `club → klub`
und `corps → korps` von Hand.

Die Eigennamen-Erkennung nutzt zwei unabhängige Signale: dwdsmor als
Positivkriterium (die Edition „open" enthält keine Eigennamen — kennt sie die
Zielform als NN/ADJ/V, ist sie sicher keiner) und den STTS-Tag `NE` von
`de_zdl_lg` über vier neutrale Trägersätze mit Mehrheitsschwelle 3 von 4.

## Was der Merge-Testlauf gefunden hat

Der Merge wurde vor dem Lauf auf den 17,77 GB an einer 90-MiB-Kopie mit echten
Daten erprobt. Das hat drei Fehler aufgedeckt, die auf der Voll-DB teuer gewesen
wären:

1. **`ON CONFLICT` nach `INSERT … SELECT` ist syntaktisch mehrdeutig** — SQLite
   liest das `ON` als JOIN-Bedingung. Behoben mit `WHERE true` vor der
   upsert-Klausel. (In Schritt 6 fiel es nicht auf, weil dort ein `ORDER BY`
   dazwischenstand.)
2. **`thier` überlebte in 148 Zeilen.** Es war nur als Substantiv gemappt, weil
   `tier` als Verb und Adjektiv nicht im Bestand steht. Golden Query #11 prüft
   `lemma='thier' OR dep_lemma='thier'` ohne Wortart-Einschränkung und wäre auf
   FAIL gelaufen. → Wächter 5 (Wortart-Konsistenz).
3. **Richtungsumkehr in Rand-Wortarten.** `fuß` hat 584.316 Vorkommen als
   Substantiv und wurde dort korrekt nicht gemappt — in der Adjektiv-Randzeile
   (14 Vorkommen) kippte die Dominanz, und `fuß → fuss` war freigegeben. Ebenso
   `außen → aussen` und `zustoßen → zustossen`. → Wächter 3 (dwdsmor-Negativprüfung),
   der `fuß`, `außen`, `zustoßen`, `thema`, `theater` zuverlässig schützt.

Die Abbruchsicherung hat in allen Fällen gegriffen: Transaktion zurückgerollt,
DB unverändert, auch die gedroppten Indizes wiederhergestellt.

## Restpunkt: 38 Wörter sind halb gemergt

Der Eigennamen-Filter läuft nur auf Substantiven — bei 38 Wörtern ist deshalb die
Adjektiv- oder Verb-Zeile freigegeben, die Substantiv-Zeile aber als Eigenname
ausgeschlossen. Ergebnis: **1.217 Zeilen (0,005 % von 25,5 Mio.)**, in denen die
alte Schreibung je nach Wortart noch steht.

Betroffen sind ausschließlich Randwörter mit 1–94 Zeilen, überwiegend
Ortsadjektive: `casseler`, `coblenzer`, `cottbuser`, `collin`, `arcadisch`,
`capillar`, `cisterzienser`, `carlsbad`. Sachlich wäre hier die Vervollständigung
richtig — Adjektive sind keine Eigennamen, und `casseler → kasseler` stimmt in
beiden Wortarten. Das läge aber außerhalb der Freigabe „D ohne Eigennamen".

**Zu entscheiden:** vervollständigen (die 38 Wörter in allen Wortarten mergen),
zurücknehmen (Rollback + Neulauf, ~35 min) oder so belassen. Für die App ist der
Zustand ohne Auswirkung.

## Ablauf und Laufzeiten

| Schritt | Dauer |
|---|---|
| `wal_checkpoint(TRUNCATE)` + `integrity_check` vorher | 6 min |
| Sicherungskopie nach `D:\wortprofil_v2_backup\` | ~2 min |
| UNIQUE-Index als Duplikat-Beweis (25,7 Mio. Zeilen) | 28 s |
| `collocations` mergen (530.966 Zeilen) | 28 s |
| `zeitreise` mergen (1.707.436 Zeilen) | 76 s |
| `lemma_corpus_freq` mergen (66.774 Zeilen) | 5 s |
| vier Indizes neu | 152 s |
| `VACUUM INTO` | 402 s |
| `ANALYZE` + Prüfung | 406 s |

Der UNIQUE-Index auf `(lemma, pos, relation, dep_lemma, dep_pos, prep)` ist
zugleich der Beweis, dass `collocations` vor dem Merge duplikatfrei war — wäre er
nicht aufzubauen gewesen, hätte der Merge abgebrochen statt still falsch zu mergen.

## Dateien und Rollback

| Datei | Bedeutung |
|---|---|
| `C:\wortprofil_v2\wortprofil_v2.db` | **produktiver Stand nach E2**, 17,15 GiB |
| `D:\wortprofil_v2_backup\wortprofil_v2.db.pre-e2` | **einziger echter Rollback**, Stand vor dem Merge, 17,77 GiB |
| `C:\wortprofil_v2\wortprofil_v2_e2_unvacuumed.db` | gemergter Zwischenstand vor `VACUUM`, 17,88 GiB — nach Abnahme löschbar |

`lemma_corrections` bleibt in der DB (13.790 Zeilen, davon 11.005 mit
`freigegeben=1`). Phase F2 und der `belege.js`-Rückwärts-Fallback (§3.5) lesen
dasselbe Mapping. Für den Fallback ist die Richtung `korrekt → {alt, …}` nötig:

```sql
SELECT alt FROM lemma_corrections WHERE korrekt = ? AND freigegeben = 1;
```

## Korrektur zum Freigabe-Report

`E2_VALIDIERUNG.md`, Abschnitt 6, nannte 4.915 zusammenfallende Kollokations-
Schlüssel. Real sind es **244.163**. Die Messung hatte nur Kollisionen *innerhalb*
der betroffenen Zeilenmenge gezählt, nicht die Treffer auf bereits vorhandene
Zeilen mit dem Zielschlüssel — und genau die sind der Normalfall
(`thier`-Zeilen treffen auf bestehende `tier`-Zeilen).
