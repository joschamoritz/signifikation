---
erstellt: 2026-08-03
phase: E — wortprofil_v2.db + zeitreise
eingabe: C:\wortprofil_v2\triples_v2.db (526.463.326 Zeilen, 41,44 GB)
ausgabe: C:\wortprofil_v2\wortprofil_v2.db — **17,77 GB**
---

# Gate-E-Report

## Ergebnis in einem Satz

`wortprofil_v2.db` ist gebaut und validiert: **25.726.750 Kollokationen** (2,76× alt),
**61.199.161 zeitreise-Einträge** (17,66× alt), **17,77 GB**. Golden Queries
**7 PASS · 0 FAIL · 4 SKIP** — die vier SKIPs betreffen ausschließlich Phase F
(belege_v2 existiert noch nicht) und Phase E2.

**Gate E ist grün.**

**Finale DB-Größe für die Volume-Dimensionierung in Phase G: 17,77 GB.**

---

## 1. Vorbereitung — was den Lauf überhaupt erst möglich machte

`triples_v2.db` ist `WITHOUT ROWID` mit PK
`(head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr)`.
Abfragen entlang dieses Präfixes streamen; alles andere erzwingt einen vollen
externen Sortierdurchlauf über 526 Mio. Zeilen. Betroffen war **nicht nur** die im
Auftrag benannte Marginalen-Abfrage:

| Stelle | alte Abfrage | Problem |
|---|---|---|
| `lade_marginals` | `GROUP BY dep_lemma, dep_pos` | kein PK-Präfix |
| `iter_collocations` | `GROUP BY … , dep_case, dep_number ORDER BY … , c DESC` | `dep_case`/`dep_number` nicht im PK |
| `baue_lemma_corpus_freq` | `UNION ALL` beider Rollen + `GROUP BY lemma, pos, quelle` | **1,05 Mrd. Zeilen** zu sortieren |
| `build_zeitreise_v2` | `GROUP BY head_lemma, head_pos, dep_lemma, dep_pos, jahrzehnt` + `.fetchall()` | kein Präfix **und** komplettes Ergebnis im RAM, danach als `batch` verdoppelt |

**Lösung (Antwort auf Auftragspunkt 1c: ja, es geht billiger):** alles in
PK-Reihenfolge streamen und in Python aggregieren. Weil die Zeilen physisch nach
head sortiert liegen, ist jede head-Gruppe zusammenhängend — Gruppierung braucht
konstanten Speicher, keine Sortierung. `EXPLAIN QUERY PLAN` liefert für beide
Skripte `SCAN triples` ohne TEMP B-TREE.

**Verifiziert, nicht behauptet.** Gegen die alten Abfragen auf echten Daten:

- `f_head`, `f_dep`, Kollokations-Keys ≥ min_count: **identisch**
- `frequency` bei 400 Stichproben: **0 Fehler**
- `lemma_corpus_freq`: zeilengenau gleich (7.863.182 auf der Testscheibe), Top-50-Werte exakt
- Einzige Differenz: 13 von 400 `(dep_case, dep_number)`-Werte — **ausschließlich echte
  Gleichstände** (nachgeprüft: 2:2, 2:2, 1:1:1). Das alte `ORDER BY c DESC LIMIT 1`
  entschied die willkürlich und nicht reproduzierbar. Neu: deterministische Reihenfolge
  (höherer count → gefüllter Kasus vor leerem → lexikografisch).

**Weitere zwei Korrekturen, die nicht im Auftrag standen:**

1. `temp_store=MEMORY` entfernt (Phase-C-Stand, für das 1-%-Subset richtig, hier
   fatal) → `FILE`, und `TMP`/`TEMP`/`TMPDIR`/`SQLITE_TMPDIR` per `redirect_tmp()`
   auf `wortprofil/_tmp` (D:). Windows liest `TMP`/`TEMP`; `SQLITE_TMPDIR` allein
   genügt dort nicht.
2. **Die vier `collocations`-Indizes lagen vor dem Bulk-Insert** — wahlfreies
   Index-Schreiben über Dutzende Mio. Zeilen, genau der Effekt, der in Phase D den
   naiven Merge von 73 auf 33 Mio. Zeilen/h einbrechen ließ. Jetzt nachgelagert:
   alle fünf in **2,3 min**.

## 2. Platzbedarf: gemessen, nicht geschätzt

In Phase D lag die Schätzung um Faktor 2 daneben und C: lief voll. Diesmal ein
**echter Probe-Build**: 12 vollständige `head_lemma`-Bereiche quer durchs Alphabet
aus der Voll-DB kopiert → 69.065.226 Triples = **13,12 %**. Weil ganze head-Gruppen
kopiert wurden, sind die counts darin die **echten Vollkorpus-Werte** — anders als
beim 1-%-Zeilensample der Phase C.

Bytes/Zeile per Drop + `VACUUM` aufgeteilt: **`collocations` 274,4 B/Zeile**
(inkl. 4 Indizes), **`lemma_corpus_freq` 126,3 B/Zeile**. Meine Vorab-Konstanten
(150/70) lagen 45 % zu niedrig und wurden auf die Messwerte gezogen.

| | Prognose | tatsächlich | Abweichung |
|---|---|---|---|
| Kollokations-Keys ≥ 3 | ~36,4 Mio. | **36.104.653** | 0,8 % |
| `lemma_corpus_freq` | ≤ 59,9 Mio. (obere Schranke) | **25.922.727** | sublinear, wie erwartet |
| `collocations` | ~33,4 Mio. | **25.726.750** | −23 % |

**Lehre zur Extrapolation:** Die Kollokations-Keys ließen sich aus der Scheibe fast
exakt hochrechnen, die **geschriebenen Zeilen nicht**. Grund: in der Scheibe sind die
`f_dep`-Marginalen nur über 13 % der Zeilen gebildet und damit zu klein, was logDice
künstlich anhebt. Auf dem Vollkorpus filtert `logDice ≥ 0` härter (19.466.255 Keys
verworfen statt der erwarteten ~15 Mio.). Die Hochrechnung lag also auf der sicheren
Seite — richtig so, aber der Mechanismus ist für Phase F zu beachten.

Freier Platz auf C: fiel nie unter **69,7 GB** (Start 88,9 GB). Kein Temp-Überlauf.

## 3. Laufzeiten und Ressourcen

| Schritt | Dauer | Durchsatz | RSS-Spitze |
|---|---|---|---|
| wortprofil Pass 1 (Marginals + lcf) | 28,1 min | 312–343k Zeilen/s | 7,4 GiB |
| Pass-1-Cache schreiben (pickle, D:) | ~1 min | — | — |
| wortprofil Pass 2 (logDice + Insert) | 21,8 min | 403–431k Zeilen/s | 9,6 GiB |
| `lemma_corpus_freq` (25,9 Mio. sortiert) | 1,8 min | — | — |
| 5 Indizes | 2,3 min | — | — |
| zeitreise Pass 1 (Marginalen je Dekade) | 13,7 min | 432k Zeilen/s | 3,0 GiB |
| zeitreise Pass 2 (61,2 Mio. schreiben) | 17,6 min | 331k Zeilen/s | 4,3 GiB |
| `idx_zt_lemma` | 0,9 min | — | — |
| **Gesamt** | **~1 h 50 min** | | **9,6 GiB** |

Der Durchsatz war über den ganzen Lauf konstant — **kein Throttling**, obwohl der
Energiesparplan auf Nutzerentscheidung auf „Ausbalanciert" blieb. Die 40-GB-RSS-Grenze
war nie in Reichweite; der Intern-Cache für `head_pos`/`dep_pos`/`quelle` (nur ~5 bzw.
~34 verschiedene Werte, aber in jedem Dict-Key) hielt den Speicher flach.

**Nachträgliche Skript-Verbesserung:** Solange der `deps`-Lesecursor offen war, lag auf
derselben Verbindung eine Lese-Transaktion — SQLite konnte nicht automatisch auschecken,
das WAL wuchs auf 1,7 GB schon bei einem Drittel von Pass 2. `PRAGMA
wal_checkpoint(TRUNCATE)` direkt nach Pass 2 ergänzt, damit lcf-Insert und Index-Aufbau
nicht durch ein großes WAL lesen.

## 4. Kennzahlen alt vs. neu

| Größe | alt | neu | Faktor |
|---|---:|---:|---:|
| DB-Größe | 2,54 GB | **17,77 GB** | 7,00× |
| `collocations` | 9.311.475 | **25.726.750** | 2,76× |
| davon direkt / invers | 5.268.417 / 4.043.058 | 16.638.398 / 9.088.352 | |
| distinkte (lemma, pos) | 275.536 | **1.030.294** | 3,74× |
| distinkte Lemmata | 264.240 | **991.247** | 3,75× |
| Summe `frequency` | 236.989.702 | **1.246.957.592** | 5,26× |
| `lemma_corpus_freq` | – | **25.922.727** | NEU |
| Korpora | – | **34** | NEU |
| `zeitreise`-Zeilen | 3.464.983 | **61.199.161** | 17,66× |
| `zeitreise`-Lemmata | 85.833 | **1.448.818** | 16,88× |
| zeitreise **brauchbar** (Spielfilter) | 6.527 | **39.269** | **6,02×** |

### POS-Verteilung

| | alt | neu | Faktor |
|---|---:|---:|---:|
| Substantiv | 4.844.032 | 14.622.932 | 3,0× |
| Verb | 2.774.075 | 6.211.479 | 2,2× |
| Adjektiv | 1.157.940 | 4.305.322 | 3,7× |
| Adverb | 434.399 | 550.644 | 1,3× |
| Pronomen | 101.029 | 36.373 | **0,4×** |

Pronomen gehen absolut zurück, obwohl die DB wächst: ihre Marginalfrequenzen sind
riesig, dadurch trifft sie der `logDice ≥ 0`-Filter überproportional. Entscheidung F11
(Pronomen behalten) bleibt erfüllt — sie sind vorhanden, nur relativ seltener.

### Relationen-Verteilung

| | alt | neu | Faktor |
|---|---:|---:|---:|
| KON | 1.417.323 | 6.111.780 | 4,3× |
| ATTR / ~ATTR | 984.067 / 1.068.079 | 3.761.193 / 3.761.193 | 3,8× / 3,5× |
| GMOD / ~GMOD | 636.078 / 640.756 | 2.218.452 / 2.218.452 | 3,5× |
| PP | 687.610 | 1.438.266 | 2,1× |
| SUBJA / ~SUBJA | 670.868 / 1.085.575 | 1.422.062 / 1.422.062 | 2,1× / 1,3× |
| OBJA / ~OBJA | 543.328 / 815.095 | 1.124.191 / 1.124.191 | 2,1× / 1,4× |
| ADV / ~ADV | 321.125 / 433.553 | 548.292 / 548.292 | 1,7× / 1,3× |
| **PRED** | 8.018 | 14.162 | 1,8× |
| **~PRED** | – | **14.162** | **NEU** |

Direkte und inverse Relationen sind jetzt exakt gleich groß, weil die Inversen 1:1
aus den direkten erzeugt werden (die Assoziation eines Paares ist symmetrisch,
`dice_inv == dice`). In v1 wichen sie voneinander ab.

### Dekaden-Histogramm — die Lücke 1880–1940

| Dekade | alt | neu | Faktor |
|---:|---:|---:|---|
| 1870 | 225 | 2.785.931 | 12.382× |
| 1880 | 317 | 3.093.809 | 9.760× |
| 1890 | 8 | 3.576.884 | 447.110× |
| 1900 | 11 | 4.145.061 | 376.824× |
| 1910 | 25 | 4.151.648 | 166.066× |
| 1920 | 3 | 1.027.163 | 342.388× |
| **1930** | **0 — Loch** | **234.791** | **Loch geschlossen** |
| 1940 | 159 | 54.769 | 344× |
| 1950 | 2.186 | 952.965 | 436× |

**Kein Loch ab 1870.** Die alte DB hatte für 1930 buchstäblich null Einträge und für
1890–1920 ein- bis zweistellige Zahlen — die „Zeitreise" war dort Fiktion.

Ehrlich dazu: **1920–1940 bleiben die dünnsten Dekaden** (1,03 Mio. / 235k / 55k gegen
4,15 Mio. in 1910). Das ist Korpuslage, keine Pipeline-Schwäche — Reichstagsprotokolle
enden 1942, das DTA endet um 1900, Leipzig-Nachrichten beginnen erst in den 1990ern,
und deutschsprachige Texte aus 1920–1949 sind urheberrechtlich überwiegend geschützt.
Für die App ohne Folge (`fetchZeitenwende` liest nur ab 1950).

**Zur Interpretation der Zeitreise-Abdeckung:** `zeitreise` enthält **mehr** distinkte
Lemmata (1.448.818) als `collocations` (991.247), weil dort nur `MIN_FREQ 2` je Dekade
filtert und kein `logDice ≥ 0`. Ein Verhältnis „zeitreise-Lemmata / collocations-Lemmata"
ist deshalb **keine Abdeckungsquote** und kann über 100 % liegen (der erste Report-Lauf
zeigte 146 % — die Definition wurde korrigiert). Aussagekräftig ist die
**brauchbar**-Zahl mit den Filtern aus `fetchZeitenwende`: **6.527 → 39.269 Lemmata
(6,02×)**; als Anteil an allen Kollokations-Lemmata 2,47 % → 3,96 %. Das Planziel
„deutlich über den alten 2 %" ist erreicht; die absolute Zahl (6×) ist die
aussagekräftigere Größe, weil der Prozentwert durch Massen seltener Wörter verwässert
wird, die nie Tageslemma würden.

## 5. Golden Queries

`wortprofil/phase_c/GATE_E_VALIDATE.md` — **7 PASS · 0 FAIL · 4 SKIP**

| # | Test | Ergebnis |
|---|---|---|
| 1 | `Lüge` + ~OBJA enthält `auftischen`, nicht `tischen` | **PASS** — der Phase-C-Frequenzartefakt ist auf dem Vollkorpus weg, wie gefordert |
| 2 | `Elend` → Substantiv (POS-Mehrheit) | PASS |
| 3 | `grün` (Adj.) → `~PRED` vorhanden | PASS (bleiben, begehren, anfangen, erscheinen, scheinen, fangen, …) |
| 4 | `Tisch` + ATTR enthält `rund`, `gedeckt` | PASS |
| 5 | Zeitreise-Dekaden inkl. 1880–1940 | PASS (84 Dekaden) |
| 6, 7, 9 | Belege | SKIP — keine belege_v2 (Phase F) |
| 8 | Bindestrich-Lemma `E-Mail` | PASS (F7 erfüllt) |
| 10 | Tageslemmata, gegen die echte Spiellogik | **PASS** — 98 Prüfungen über 84 Spiel-Slots |
| 11 | Lemma-Normalisierung `thier`→`tier` | SKIP — Phase E2 |

### Test #10 wurde zweimal überarbeitet

**Erste Fassung (Ausgangszustand):** prüfte nur `COUNT(*) … WHERE lemma = ?` — POS und
Relation wurden ignoriert, obwohl der Plan „genug Kollokatoren für **alle gespielten
Modi**" verlangt. Dieser Test hätte alle 14 Tage blind durchgewinkt.

**Zweite Fassung:** eine Untergrenze je `POS_ROUNDS`-Runde. Ergab 12 FAILs, alle in der
Adjektiv-Verben-Runde (`PRED_REV`, 0–4 Kollokatoren).

**Dritte, jetzt gültige Fassung.** Hinweis des Nutzers (2026-08-03): Das Spiel
„Kollokationen" hat **keine getrennten Nomen-/Verben-/Adjektiv-Runden mehr**, sondern nur
noch **eine** Runde mit den Top-Kollokatoren eines Lemmas über alle Wortarten hinweg. Im
Code bestätigt: `mergeKollokatoren()` in `server/customLemma.js:29` fragt die drei
Relationen weiterhin ab, führt sie aber zu **einer** nach Lemma deduplizierten,
nach logDice sortierten Liste zusammen; das Kriterium ist `MIN_KOLLOKATIONEN = 10` auf
diese Gesamtliste.

Damit war die zweite Fassung an der Spielrealität vorbei gemessen — eine leere
`PRED_REV`-Relation ist ohne Folge, solange der Pool insgesamt reicht. Test #10 bildet nun
`mergeKollokatoren()` nach (LIMIT 30 je Relation wie `fetchRelation`, Aussortieren von
Mehrwortausdrücken und Ein-Zeichen-Lemmata, Deduplizierung, Schwelle 10) und gibt die
Einzelwerte je Relation nur noch als Diagnose aus.

Grundlage sind die echten Tageslemmata 03.–16.08.2026 (`--tageslemmata-json`, vom Nutzer
geliefert). Die lokale `signifikation.db` enthält nur 6 Dev-Seed-Zeilen mit unsinnigen
Wortarten („Baum" als Verb) und ist als Testgrundlage wertlos; die kalender-Variante
bleibt erhalten und nutzt jetzt dieselbe Pool-Logik.

## 6. Ergebnis von Test #10 und der Befund zur PRED-Relation

**Alle 84 Spiel-Slots bestehen mit Reserve.** Kleinster Kollokations-Pool 50
(„legendär"), Mehrzahl bei 88–90 (durch das 3×30-Limit begrenzt, nicht durch die Daten);
kleinste Zeitenwende-Abdeckung „Haustier" pre=16 / post=89 gegen eine Schwelle von 3.

| Slot | Spanne über 14 Tage |
|---|---|
| Nomen (Pool) | 56–90 |
| Verb (Pool) | 54–90 |
| Adjektiv (Pool) | 50–68 |
| Zwilling (Pool je Wort) | 56–90 |
| Zeitenwende pre / post | 16–786 / 89–2.030 |

### Nebenbefund: die `PRED`-Relation ist strukturell dünn

Aufgefallen bei der zweiten Test-Fassung, für das Spiel nach der Klarstellung **ohne
praktische Folge** — aber dokumentiert, weil es die Adjektiv-Kollokatoren betrifft:

`PRED` hat nur 14.162 Zeilen gegen 6,1 Mio. `KON`. Ursache: `parse_deps_v2.py:297`
erzeugt `PRED` nur bei `dep == "xcomp"`. Die kanonische deutsche Prädikativ-Konstruktion
(„Die Wiese **ist grün**") wird in Universal Dependencies anders annotiert — das Adjektiv
ist das Wurzelwort mit einer `cop`-Kante zum Hilfsverb, **kein** `xcomp` des Verbs.
Erfasst werden also nur sekundäre Prädikative („Er nennt es **gut**", „Es bleibt
**grün**"); die häufigste Form fehlt.

**Kein v2-Regress:** die alte DB ist bei allen 14 geprüften Adjektiven gleich schlecht
oder schlechter (v2 verbessert 6, hält 7, ist bei `knapp` 1→0 schlechter, weil das
einzige Paar unter `logDice ≥ 0` fiel). `PRED` wuchs von 8.018 auf 14.162 Zeilen (1,8×).

**Ein Fix wäre wenig wert:** zusätzlich `cop` zu erfassen liefert vor allem
`sein`/`werden` — genau die AUX-Verben, die laut Entscheidung F12 der App-Anzeige-Layer
ausblendet. Wertvoll wären nur die zusätzlichen Instanzen lexikalischer Kopulaverben
(`bleiben`, `scheinen`, `wirken`, `klingen`). Einen erneuten Voll-Parse rechtfertigt das
nach heutigem Stand nicht.

## 7. App-Test (`app_smoke.mjs` gegen die neue DB)

**Keine Fehler, Schema voll kompatibel.** Alle vier Modi liefern Material; die
Bonusfrage funktioniert jetzt (in Phase C war `bonus=null`). Der Belege-Teil scheitert
planmäßig, weil `server/belege.js` erst in Phase G auf das external-content-Schema
umgestellt wird.

Ordnungshinweis: `stmts()` in `server/wortprofil.js` präpariert **alle** Statements auf
einmal, auch das für `zeitreise`. Solange die Tabelle fehlte, fiel jeder Pfad mit
`no such table: zeitreise` aus — der App-Test ist also erst nach `build_zeitreise_v2`
aussagekräftig.

### Latenz der App-Pfade (gemessen, lokal, warmer Cache)

| Pfad | Plan | Latenz |
|---|---|---|
| `fetchRelation` (Normalpfad) | `SEARCH … idx_collocations_lookup (lemma=? AND pos=? AND relation=?)` | **< 1 ms** |
| `fetchZeitenwende` | `SEARCH zeitreise USING idx_zt_lemma (lemma=?)` | **3–13 ms** |
| **`PRED_REV`** (Adjektiv-Verben) | `SEARCH … (ANY(lemma) AND ANY(pos) AND relation=?)` + TEMP B-TREE | **1213–1245 ms** |

`PRED_REV` filtert auf `dep_lemma`, wofür kein Index existiert → SQLite macht einen
**Skip-Scan** über jedes distinkte `(lemma, pos)`-Präfix. Das sind jetzt 1.030.294 statt
275.536, also **3,7× mehr Seeks als in der alten DB**.

**Das trifft einen Live-Anfragepfad.** Auch wenn das Spiel nur noch eine zusammengeführte
Runde zeigt, fragt `mergeKollokatoren()` die drei Relationen weiterhin einzeln ab —
`PRED_REV` also auch. `bestKollokationPos()` ruft `mergeKollokatoren()` zudem für **alle
drei** Wortart-Kandidaten auf. Jede Auto-Wortart-Erkennung im „Eigenes Lemma"-Pfad
(`/api/v1/custom-lemma/validate`) zahlt damit die 1,2 Sekunden — pro Anfrage, nicht im
Batch.

**Der im Plan (§3.5) vorgesehene Umstieg auf echte `~PRED`-Einträge löst das:**
gemessen **< 1 ms statt 1213 ms** bei **byte-identischem Ergebnis** (gleiche
Kollokatoren, gleiche logDice, gleiche Reihenfolge — für „grün", „groß", „hoch" geprüft;
gilt by construction, weil die inversen Zeilen 1:1 aus den direkten mit getauschten
Marginalen entstehen und `dice_inv == dice`). Phase E hat diesen Umstieg erstmals möglich
gemacht *und* verifiziert. Er ist damit keine Kosmetik, sondern eine Latenz-Korrektur um
Faktor ~1200, die auf dem Hetzner-Server mit kaltem Cache noch stärker wiegt.

## 8. Zwei Befunde außerhalb des Auftrags

### `OBJD` ist toter Code — Dativobjekte landen in `OBJA`

`OBJD` existiert in `triples_v2` **gar nicht** — auch nicht bei „geben", „schenken",
„helfen". Der `iobj`-Zweig (`parse_deps_v2.py:263`) feuert mit `de_zdl_lg` nie; das
Modell etikettiert Dativobjekte als `obj`.

Beweis: `helfen` + `OBJA` hat 27.274 Kollokationen mit `dep_case='Dat'` (50.123
Vorkommen, **mehr als die Akkusativ-Fälle**), Top-Kollokatoren „Mensch, Frau, Land,
Vater" — durchweg korrekte Dative. Dank der neuen `dep_case`-Spalte ist die Information
**nicht verloren**, sie steht nur nicht im `relation`-Label.

Für die App heißt das: ein Dativ-Kollokator würde derzeit als „Akkusativobjekt"
beschriftet. Bei der Terminologie-Strenge des Projekts ein Punkt für Phase G — kein
Gate-E-Blocker, denn die alte DB faltete genauso, nur ohne `dep_case` zum Nachjustieren.
`SUBJP` ist ebenfalls leer, aber **absichtlich**: `parse_deps_v2.py:254` bildet `nsubj`
und `nsubj:pass` gemeinsam auf `SUBJA` ab. `REL_DESC` führt beide Relationen weiterhin,
obwohl sie nie entstehen — Altlast in der Konfiguration.

### Jahr-Extraktion liest Ziffern aus Dokument-IDs — **Blocker für Phase F**

`jahr_aus_dateiname()` (`02_parse/extract_text.py:168`) sucht
`(1[0-9]{3}|20[0-2][0-9])` **ohne Ziffern-Grenzen** und nimmt den letzten Treffer:

| quelle | Dokumente | Jahr < 1450 | Anteil | Beispiel |
|---|---:|---:|---:|---|
| `humboldt-digital` | 11.388 | **2.780** | 24,4 % | id `H0021024` → jahr 1024 |
| `dta-dingler` | 4.186 | **399** | 9,5 % | id `tab010539.png` → jahr 1053 |
| `dta_erweiterungen` | 5.479 | **40** | 0,7 % | id `510287` → jahr 1028 |
| `ref_fnh` | 190 | 32 | 16,8 % | jahr 1350 — **legitim** (Frühneuhochdeutsch ab ~1350) |

Insgesamt 3.251 von 3.718.322 Dokumenten (**0,09 %**), plus 6 mit Jahr > 2027.
Die betroffenen Leichpredigten sind unstrittig 17. Jh. (Orthografie „vnd", „GOtt der
HERRE", Autor Hoe von Hoenegg †1645), und die „Jahre" laufen mit der Dokument-ID mit
(510287→1028, 510300→1030, 510575→1057).

**Auswirkung:** auf `collocations` **null** (die Tabelle nutzt `jahr` nicht), auf
`zeitreise` vernachlässigbar (die falschen Dekaden liegen alle vor 1450, die App liest nur
ab 1950). **In Phase F dagegen material:** der `>= 1830`-Filter (F3) würde die 2.780
Humboldt-Dokumente fälschlich ausschließen, und ihr `ref` trägt ein falsches Jahr in die
Beleg-Zitation („Milichius: Dominus abstulit. 1028").

**Warum es durchrutschte:** Gate B prüfte, **ob** ein Jahr existiert (≥ 95 %), nicht ob es
**plausibel** ist. `check_gate_b.py` braucht eine Wertebereichsprüfung.

## 9. Gate-E-Kriterien im Einzelnen

| Kriterium (Plan) | Status |
|---|---|
| Golden Queries vollständig grün | **erfüllt** — 7 PASS, 0 FAIL. Die 4 SKIPs betreffen belege_v2 (Phase F) und `lemma_corrections` (Phase E2), sind in Phase E also nicht prüfbar. |
| Dekaden-Histogramm ohne Löcher ≥ 1870 | **erfüllt** — kein Loch, 1930 von 0 auf 234.791 |
| Zeitreise-Abdeckung deutlich über den alten 2 % | **erfüllt** — 2,47 % → 3,96 %, absolut 6.527 → 39.269 brauchbare Lemmata (6,02×) |
| Kein Regressions-Lemma; jedes Tageslemma liefert genug Material für alle gespielten Modi | **erfüllt** — 84 von 84 Spiel-Slots über 14 Tage, kleinster Pool 50 gegen Schwelle 10 |
| Triple-/Kollokationszahl deutlich über Altbestand | **erfüllt** — 2,76× Kollokationen, 3,75× Lemmata, 17,66× zeitreise |
| Finale DB-Größe notiert (Volume Phase G) | **17,77 GB** |

**→ Gate E ist grün.**

## 10. Konsequenzen für die nächsten Phasen

**Phase G, Volume-Dimensionierung:** `wortprofil_v2.db` = **17,77 GB** (alt 2,54 GB).
Zusammen mit der Erwartung für `belege_v2` (~15–18 GB Hauptlauf, + Wikipedia, + Lemma-FTS
in F2) liegt der Bedarf **deutlich über den im Plan angesetzten 50 GB Volume**. Die
Volume-Größe muss nach Phase F neu gerechnet werden, bevor sie bestellt wird.

**Phase G, Server-Code:** `PRED_REV` durch `~PRED` ersetzen — verifiziert
ergebnisidentisch, 1213 ms → < 1 ms. Zusätzlich prüfen, ob `dep_case` genutzt werden
soll, um Dativ-Kollokatoren korrekt zu beschriften.

**Phase F, vorher zu fixen:** Jahr-Extraktion (Abschnitt 8), sonst fallen 2.780
Humboldt-Dokumente aus der Belege-DB und falsche Jahre erscheinen in Zitationen.

**Phase E2:** kann direkt auf dieser DB aufsetzen. Der Marginalen-Cache
(`_tmp/marginals_v2.pkl`, 1,07 GB) bleibt liegen, falls ein Neubau nötig wird.

**Rückfallebene:** die 29 Teil-DBs unter `wortprofil/_work_triples_v2/parts_done/`
(87 GB auf D:) sind unangetastet — laut Auftrag zu behalten, bis Gate E steht.
